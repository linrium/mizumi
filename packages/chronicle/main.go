package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-sql-driver/mysql"
	"github.com/gofiber/fiber/v3"
	"github.com/transparency-dev/tessera"
	"github.com/transparency-dev/tessera/api/layout"
	tesseraaws "github.com/transparency-dev/tessera/storage/aws"
	"github.com/transparency-dev/tessera/storage/posix"
	"github.com/yokeTH/gofiber-scalar/scalar/v3"
	"golang.org/x/mod/sumdb/note"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg := loadConfig()
	if err := os.MkdirAll(cfg.logDir, 0o755); err != nil {
		log.Fatalf("create log dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(cfg.signerKeyFile), 0o755); err != nil {
		log.Fatalf("create signer key dir: %v", err)
	}

	signer, verifierKey, err := loadOrCreateSigner(cfg.signerKeyFile)
	if err != nil {
		log.Fatalf("load signer: %v", err)
	}

	driver, err := newStorageDriver(ctx, cfg)
	if err != nil {
		log.Fatalf("create Tessera storage driver: %v", err)
	}

	appender, shutdown, reader, err := tessera.NewAppender(ctx, driver, tessera.NewAppendOptions().
		WithCheckpointSigner(signer).
		WithCheckpointInterval(time.Second).
		WithCheckpointRepublishInterval(time.Minute).
		WithBatching(256, time.Second))
	if err != nil {
		log.Fatalf("create Tessera appender: %v", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown Tessera appender: %v", err)
		}
	}()

	app := fiber.New()

	app.Get("/docs/*", scalar.New(scalar.Config{
		FileContentString: openAPISpec(),
		Path:              "/docs",
		Title:             "Chronicle API",
		Theme:             scalar.ThemeDefault,
	}))

	app.Get("/", func(c fiber.Ctx) error {
		return c.SendString("chronicle")
	})

	app.Get("/healthz", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	app.Get("/tessera", func(c fiber.Ctx) error {
		nextIndex, err := reader.NextIndex(c.Context())
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		integratedSize, err := reader.IntegratedSize(c.Context())
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}

		return c.JSON(fiber.Map{
			"storage_backend": cfg.storageBackend,
			"log_dir":         cfg.logDir,
			"signer":          signer.Name(),
			"verifier_key":    verifierKey,
			"next_index":      nextIndex,
			"integrated_size": integratedSize,
		})
	})

	app.Post("/entries", func(c fiber.Ctx) error {
		body := c.Body()
		if len(body) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "entry body is required")
		}

		index, err := appender.Add(c.Context(), tessera.NewEntry(body))()
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"index":        index.Index,
			"duplicate":    index.IsDup,
			"published_by": "/checkpoint",
		})
	})

	app.Get("/checkpoint", func(c fiber.Ctx) error {
		checkpoint, err := reader.ReadCheckpoint(c.Context())
		if err != nil {
			status := fiber.StatusInternalServerError
			if errors.Is(err, os.ErrNotExist) {
				status = fiber.StatusNotFound
			}
			return fiber.NewError(status, err.Error())
		}
		c.Type("text")
		return c.Send(checkpoint)
	})

	app.Get("/tile/entries/*", func(c fiber.Ctx) error {
		return sendEntryBundle(c, reader, c.Params("*"))
	})
	app.Get("/entries/*", func(c fiber.Ctx) error {
		return sendEntryBundle(c, reader, c.Params("*"))
	})
	app.Get("/tile/*", func(c fiber.Ctx) error {
		return sendTile(c, reader, c.Params("*"))
	})

	go func() {
		<-ctx.Done()
		if err := app.Shutdown(); err != nil {
			log.Printf("shutdown Fiber app: %v", err)
		}
	}()

	if err := app.Listen(cfg.listenAddr); err != nil {
		log.Fatal(err)
	}
}

type config struct {
	listenAddr       string
	logDir           string
	signerKeyFile    string
	storageBackend   string
	s3Endpoint       string
	s3Bucket         string
	s3BucketPrefix   string
	s3AccessKey      string
	s3SecretKey      string
	s3Region         string
	s3UsePathStyle   bool
	mysqlDSN         string
	mysqlHost        string
	mysqlPort        string
	mysqlDatabase    string
	mysqlUser        string
	mysqlPassword    string
	mysqlMaxOpenConn int
	mysqlMaxIdleConn int
}

func loadConfig() config {
	logDir := getenv("CHRONICLE_LOG_DIR", ".data/tessera")
	return config{
		listenAddr:       getenv("CHRONICLE_ADDR", ":3000"),
		logDir:           logDir,
		signerKeyFile:    getenv("CHRONICLE_SIGNER_KEY_FILE", filepath.Join(logDir, ".state", "signer.key")),
		storageBackend:   getenv("CHRONICLE_STORAGE_BACKEND", "posix"),
		s3Endpoint:       os.Getenv("CHRONICLE_AWS_S3_ENDPOINT"),
		s3Bucket:         os.Getenv("CHRONICLE_AWS_S3_BUCKET"),
		s3BucketPrefix:   os.Getenv("CHRONICLE_AWS_S3_BUCKET_PREFIX"),
		s3AccessKey:      os.Getenv("CHRONICLE_AWS_S3_ACCESS_KEY"),
		s3SecretKey:      os.Getenv("CHRONICLE_AWS_S3_SECRET_KEY"),
		s3Region:         getenv("CHRONICLE_AWS_S3_REGION", "us-east-1"),
		s3UsePathStyle:   getenvBool("CHRONICLE_AWS_S3_USE_PATH_STYLE", true),
		mysqlDSN:         os.Getenv("CHRONICLE_AWS_MYSQL_DSN"),
		mysqlHost:        getenv("CHRONICLE_AWS_MYSQL_HOST", "mysql"),
		mysqlPort:        getenv("CHRONICLE_AWS_MYSQL_PORT", "3306"),
		mysqlDatabase:    getenv("CHRONICLE_AWS_MYSQL_DATABASE", "tessera"),
		mysqlUser:        os.Getenv("CHRONICLE_AWS_MYSQL_USER"),
		mysqlPassword:    os.Getenv("CHRONICLE_AWS_MYSQL_PASSWORD"),
		mysqlMaxOpenConn: getenvInt("CHRONICLE_AWS_MYSQL_MAX_OPEN_CONNS", 0),
		mysqlMaxIdleConn: getenvInt("CHRONICLE_AWS_MYSQL_MAX_IDLE_CONNS", 2),
	}
}

func newStorageDriver(ctx context.Context, cfg config) (tessera.Driver, error) {
	switch cfg.storageBackend {
	case "posix":
		return posix.New(ctx, posix.Config{Path: cfg.logDir})
	case "aws-s3":
		if cfg.s3Bucket == "" {
			return nil, errors.New("CHRONICLE_AWS_S3_BUCKET is required for aws-s3 storage")
		}

		s3Opts := func(o *s3.Options) {
			o.Region = cfg.s3Region
			o.UsePathStyle = cfg.s3UsePathStyle
			if cfg.s3Endpoint != "" {
				o.BaseEndpoint = awssdk.String(cfg.s3Endpoint)
			}
			if cfg.s3AccessKey != "" || cfg.s3SecretKey != "" {
				o.Credentials = credentials.NewStaticCredentialsProvider(cfg.s3AccessKey, cfg.s3SecretKey, "")
			}
		}

		return tesseraaws.New(ctx, tesseraaws.Config{
			SDKConfig: &awssdk.Config{
				Region: cfg.s3Region,
			},
			S3Options:    s3Opts,
			Bucket:       cfg.s3Bucket,
			BucketPrefix: cfg.s3BucketPrefix,
			DSN:          mysqlDSN(cfg),
			MaxOpenConns: cfg.mysqlMaxOpenConn,
			MaxIdleConns: cfg.mysqlMaxIdleConn,
		})
	default:
		return nil, fmt.Errorf("unsupported CHRONICLE_STORAGE_BACKEND %q", cfg.storageBackend)
	}
}

func mysqlDSN(cfg config) string {
	if cfg.mysqlDSN != "" {
		return cfg.mysqlDSN
	}

	mysqlCfg := mysql.Config{
		User:                    cfg.mysqlUser,
		Passwd:                  cfg.mysqlPassword,
		Net:                     "tcp",
		Addr:                    cfg.mysqlHost + ":" + cfg.mysqlPort,
		DBName:                  cfg.mysqlDatabase,
		AllowCleartextPasswords: true,
		AllowNativePasswords:    true,
		ParseTime:               true,
	}
	return mysqlCfg.FormatDSN()
}

func loadOrCreateSigner(path string) (note.Signer, string, error) {
	signerKey, err := os.ReadFile(path)
	if err == nil {
		signer, err := note.NewSigner(string(signerKey))
		if err != nil {
			return nil, "", err
		}

		verifierKey, err := os.ReadFile(path + ".pub")
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, "", fmt.Errorf("read verifier key: %w", err)
		}
		return signer, string(verifierKey), nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, "", fmt.Errorf("read signer key: %w", err)
	}

	signerKeyString, verifierKey, err := note.GenerateKey(rand.Reader, "chronicle")
	if err != nil {
		return nil, "", fmt.Errorf("generate signer key: %w", err)
	}
	if err := os.WriteFile(path, []byte(signerKeyString), 0o600); err != nil {
		return nil, "", fmt.Errorf("write signer key: %w", err)
	}
	if err := os.WriteFile(path+".pub", []byte(verifierKey), 0o644); err != nil {
		return nil, "", fmt.Errorf("write verifier key: %w", err)
	}

	signer, err := note.NewSigner(signerKeyString)
	return signer, verifierKey, err
}

func sendTile(c fiber.Ctx, reader tessera.LogReader, requested string) error {
	level, index, p, err := layout.ParseTileLevelIndexPartial(nextPathSegment(requested), trimFirstPathSegment(requested))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	tile, err := reader.ReadTile(c.Context(), level, index, p)
	if err != nil {
		return logResourceError(err)
	}
	c.Set("Cache-Control", "public, max-age=31536000, immutable")
	return c.Send(tile)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func sendEntryBundle(c fiber.Ctx, reader tessera.LogReader, requested string) error {
	index, p, err := layout.ParseTileIndexPartial(requested)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	entryBundle, err := reader.ReadEntryBundle(c.Context(), index, p)
	if err != nil {
		return logResourceError(err)
	}
	c.Set("Cache-Control", "public, max-age=31536000, immutable")
	return c.Send(entryBundle)
}

func logResourceError(err error) error {
	status := fiber.StatusInternalServerError
	if errors.Is(err, os.ErrNotExist) {
		status = fiber.StatusNotFound
	}
	return fiber.NewError(status, err.Error())
}

func nextPathSegment(path string) string {
	for i, r := range path {
		if r == '/' {
			return path[:i]
		}
	}
	return path
}

func trimFirstPathSegment(path string) string {
	for i, r := range path {
		if r == '/' {
			return path[i+1:]
		}
	}
	return ""
}

func getenvBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		log.Fatalf("parse %s: %v", key, err)
	}
	return parsed
}

func getenvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		log.Fatalf("parse %s: %v", key, err)
	}
	return parsed
}
