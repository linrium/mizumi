package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-sql-driver/mysql"
	"github.com/gofiber/fiber/v3"
	tlog "github.com/transparency-dev/formats/log"
	"github.com/transparency-dev/merkle/proof"
	"github.com/transparency-dev/merkle/rfc6962"
	"github.com/transparency-dev/tessera"
	"github.com/transparency-dev/tessera/api"
	"github.com/transparency-dev/tessera/api/layout"
	tesseraclient "github.com/transparency-dev/tessera/client"
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
	verifier, err := note.NewVerifier(strings.TrimSpace(verifierKey))
	if err != nil {
		log.Fatalf("load verifier: %v", err)
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

	app.Get("/api/entries", func(c fiber.Ctx) error {
		return sendEntries(c, reader)
	})
	app.Get("/api/entries/search", func(c fiber.Ctx) error {
		return sendEntries(c, reader)
	})
	app.Get("/api/entries/:index/proof", func(c fiber.Ctx) error {
		return sendEntryProof(c, reader, verifier, signer.Name())
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

type logEntryResponse struct {
	Index      uint64         `json:"index"`
	Bundle     string         `json:"bundle"`
	Body       string         `json:"body,omitempty"`
	BodyBase64 string         `json:"body_base64,omitempty"`
	JSON       map[string]any `json:"json,omitempty"`
	EventType  string         `json:"event_type,omitempty"`
	Source     string         `json:"source,omitempty"`
	OccurredAt string         `json:"occurred_at,omitempty"`
}

type entryProofResponse struct {
	Index              uint64           `json:"index"`
	TreeSize           uint64           `json:"tree_size"`
	LeafHash           string           `json:"leaf_hash"`
	RootHash           string           `json:"root_hash"`
	Proof              []string         `json:"proof"`
	Verified           bool             `json:"verified"`
	VerificationError  string           `json:"verification_error,omitempty"`
	Checkpoint         string           `json:"checkpoint"`
	Entry              logEntryResponse `json:"entry"`
	CheckpointVerified bool             `json:"checkpoint_verified"`
}

func loadConfig() config {
	logDir := getenv("CHRONICLE_LOG_DIR", ".data/tessera")
	return config{
		listenAddr:       getenv("CHRONICLE_ADDR", ":3008"),
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

func sendEntries(c fiber.Ctx, reader tessera.LogReader) error {
	size, err := reader.IntegratedSize(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	limit, err := queryUint(c, "limit", 100, 500)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	offset, err := queryUint(c, "offset", 0, size)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	query := strings.TrimSpace(c.Query("q"))

	entries, err := collectEntries(c.Context(), reader, size, offset, limit+1, query)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	hasMore := uint64(len(entries)) > limit
	if hasMore {
		entries = entries[:limit]
	}

	return c.JSON(fiber.Map{
		"entries":  entries,
		"has_more": hasMore,
		"limit":    limit,
		"offset":   offset,
		"query":    query,
		"total":    size,
	})
}

func sendEntryProof(c fiber.Ctx, reader tessera.LogReader, verifier note.Verifier, origin string) error {
	index, err := strconv.ParseUint(c.Params("index"), 10, 64)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "index must be a positive integer")
	}

	checkpointRaw, err := reader.ReadCheckpoint(c.Context())
	if err != nil {
		return logResourceError(err)
	}
	checkpoint, _, _, err := tlog.ParseCheckpoint(checkpointRaw, origin, verifier)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("verify checkpoint: %v", err))
	}
	if index >= checkpoint.Size {
		return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("index %d is not covered by checkpoint size %d", index, checkpoint.Size))
	}

	entry, rawEntry, err := getEntryAtIndex(c.Context(), reader, index, checkpoint.Size)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	proofBuilder, err := tesseraclient.NewProofBuilder(c.Context(), checkpoint.Size, reader.ReadTile)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("create proof builder: %v", err))
	}
	proofNodes, err := proofBuilder.InclusionProof(c.Context(), index)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("build inclusion proof: %v", err))
	}

	leafHash := rfc6962.DefaultHasher.HashLeaf(rawEntry)
	verificationError := ""
	verified := true
	if err := proof.VerifyInclusion(rfc6962.DefaultHasher, index, checkpoint.Size, leafHash, proofNodes, checkpoint.Hash); err != nil {
		verified = false
		verificationError = err.Error()
	}

	return c.JSON(entryProofResponse{
		Index:              index,
		TreeSize:           checkpoint.Size,
		LeafHash:           base64.StdEncoding.EncodeToString(leafHash),
		RootHash:           base64.StdEncoding.EncodeToString(checkpoint.Hash),
		Proof:              encodeProofNodes(proofNodes),
		Verified:           verified,
		VerificationError:  verificationError,
		Checkpoint:         string(checkpointRaw),
		Entry:              entry,
		CheckpointVerified: true,
	})
}

func collectEntries(ctx context.Context, reader tessera.LogReader, size, offset, limit uint64, query string) ([]logEntryResponse, error) {
	if limit == 0 || offset >= size {
		return []logEntryResponse{}, nil
	}

	from := offset
	count := limit
	scanSize := size
	if query == "" && from+count > size {
		count = size - from
	}
	if query != "" {
		from = 0
		count = size
	}

	queryLower := strings.ToLower(query)
	matchesToSkip := offset
	entries := make([]logEntryResponse, 0, limit)

	for ri := range layout.Range(from, count, scanSize) {
		raw, err := reader.ReadEntryBundle(ctx, ri.Index, ri.Partial)
		if err != nil {
			return nil, fmt.Errorf("read entry bundle %d: %w", ri.Index, err)
		}

		bundle := api.EntryBundle{}
		if err := bundle.UnmarshalText(raw); err != nil {
			return nil, fmt.Errorf("parse entry bundle %d: %w", ri.Index, err)
		}

		end := ri.First + ri.N
		if end > uint(len(bundle.Entries)) {
			end = uint(len(bundle.Entries))
		}

		for i := ri.First; i < end; i++ {
			entry := newLogEntryResponse(ri.Index, ri.Partial, i, bundle.Entries[i])
			if queryLower != "" && !strings.Contains(strings.ToLower(entrySearchText(entry)), queryLower) {
				continue
			}
			if queryLower != "" && matchesToSkip > 0 {
				matchesToSkip--
				continue
			}

			entries = append(entries, entry)
			if uint64(len(entries)) >= limit {
				return entries, nil
			}
		}
	}

	return entries, nil
}

func getEntryAtIndex(ctx context.Context, reader tessera.LogReader, index uint64, treeSize uint64) (logEntryResponse, []byte, error) {
	bundleIndex := index / layout.EntryBundleWidth
	offset := uint(index % layout.EntryBundleWidth)
	partial := layout.PartialTileSize(0, bundleIndex, treeSize)
	raw, err := reader.ReadEntryBundle(ctx, bundleIndex, partial)
	if err != nil {
		return logEntryResponse{}, nil, fmt.Errorf("read entry bundle %d: %w", bundleIndex, err)
	}

	bundle := api.EntryBundle{}
	if err := bundle.UnmarshalText(raw); err != nil {
		return logEntryResponse{}, nil, fmt.Errorf("parse entry bundle %d: %w", bundleIndex, err)
	}
	if offset >= uint(len(bundle.Entries)) {
		return logEntryResponse{}, nil, fmt.Errorf("entry index %d is outside bundle %d", index, bundleIndex)
	}
	entryRaw := bundle.Entries[offset]
	return newLogEntryResponse(bundleIndex, partial, offset, entryRaw), entryRaw, nil
}

func newLogEntryResponse(bundleIndex uint64, partial uint8, entryOffset uint, raw []byte) logEntryResponse {
	entry := logEntryResponse{
		Index:  bundleIndex*layout.EntryBundleWidth + uint64(entryOffset),
		Bundle: layout.EntriesPath(bundleIndex, partial),
	}
	if utf8.Valid(raw) {
		entry.Body = string(raw)
	} else {
		entry.BodyBase64 = base64.StdEncoding.EncodeToString(raw)
	}

	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err == nil {
		entry.JSON = parsed
		entry.EventType, _ = parsed["event_type"].(string)
		entry.Source, _ = parsed["source"].(string)
		entry.OccurredAt, _ = parsed["occurred_at"].(string)
	}

	return entry
}

func encodeProofNodes(nodes [][]byte) []string {
	encoded := make([]string, 0, len(nodes))
	for _, node := range nodes {
		encoded = append(encoded, base64.StdEncoding.EncodeToString(node))
	}
	return encoded
}

func entrySearchText(entry logEntryResponse) string {
	parts := []string{
		strconv.FormatUint(entry.Index, 10),
		entry.Bundle,
		entry.Body,
		entry.BodyBase64,
		entry.EventType,
		entry.Source,
		entry.OccurredAt,
	}
	if entry.JSON != nil {
		if raw, err := json.Marshal(entry.JSON); err == nil {
			parts = append(parts, string(raw))
		}
	}
	return strings.Join(parts, " ")
}

func queryUint(c fiber.Ctx, name string, fallback uint64, max uint64) (uint64, error) {
	value := c.Query(name)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	if parsed > max {
		return max, nil
	}
	return parsed, nil
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
