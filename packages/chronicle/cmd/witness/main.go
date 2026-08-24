package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	fnote "github.com/transparency-dev/formats/note"
	"github.com/transparency-dev/witness/witness"
	"golang.org/x/mod/sumdb/note"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg := loadWitnessConfig()
	signerKey, err := readConfigValue(cfg.signerKey, cfg.signerKeyFile, "CHRONICLE_WITNESS_SIGNER_KEY")
	if err != nil {
		log.Fatal(err)
	}
	logVerifierKey, err := readConfigValue(cfg.logVerifierKey, cfg.logVerifierKeyFile, "CHRONICLE_WITNESS_LOG_VERIFIER_KEY")
	if err != nil {
		log.Fatal(err)
	}

	signer, err := fnote.NewSignerForCosignatureV1(strings.TrimSpace(signerKey))
	if err != nil {
		log.Fatalf("load witness signer: %v", err)
	}
	logVerifier, err := note.NewVerifier(strings.TrimSpace(logVerifierKey))
	if err != nil {
		log.Fatalf("load Chronicle log verifier: %v", err)
	}

	w, err := witness.New(ctx, witness.Opts{
		Persistence: &filePersistence{dir: cfg.stateDir},
		Signers:     []note.Signer{signer},
		VerifierForLog: func(_ context.Context, origin string) (note.Verifier, bool, error) {
			return logVerifier, origin == cfg.logOrigin, nil
		},
	})
	if err != nil {
		log.Fatalf("create witness: %v", err)
	}

	witnessHandler := witness.NewHTTPHandler(w)
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(rw http.ResponseWriter, _ *http.Request) {
		rw.Header().Set("Content-Type", "application/json")
		_, _ = rw.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/add-checkpoint", witnessHandler.AddCheckpoint)
	mux.HandleFunc("/checkpoint", func(rw http.ResponseWriter, r *http.Request) {
		origin := r.URL.Query().Get("origin")
		if origin == "" {
			origin = cfg.logOrigin
		}
		cp, err := w.GetCheckpoint(r.Context(), origin)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusInternalServerError)
			return
		}
		if cp == nil {
			http.NotFound(rw, r)
			return
		}
		rw.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = rw.Write(cp)
	})

	srv := &http.Server{
		Addr:              cfg.listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown witness server: %v", err)
		}
	}()

	log.Printf("chronicle witness %s serving %s for log origin %s", signer.Name(), cfg.listenAddr, cfg.logOrigin)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

type witnessConfig struct {
	listenAddr         string
	logOrigin          string
	logVerifierKey     string
	logVerifierKeyFile string
	signerKey          string
	signerKeyFile      string
	stateDir           string
}

func loadWitnessConfig() witnessConfig {
	return witnessConfig{
		listenAddr:         getenv("CHRONICLE_WITNESS_ADDR", ":3010"),
		logOrigin:          getenv("CHRONICLE_WITNESS_LOG_ORIGIN", "chronicle"),
		logVerifierKey:     os.Getenv("CHRONICLE_WITNESS_LOG_VERIFIER_KEY"),
		logVerifierKeyFile: os.Getenv("CHRONICLE_WITNESS_LOG_VERIFIER_KEY_FILE"),
		signerKey:          os.Getenv("CHRONICLE_WITNESS_SIGNER_KEY"),
		signerKeyFile:      os.Getenv("CHRONICLE_WITNESS_SIGNER_KEY_FILE"),
		stateDir:           getenv("CHRONICLE_WITNESS_STATE_DIR", ".data/witness"),
	}
}

func readConfigValue(value string, file string, name string) (string, error) {
	if strings.TrimSpace(value) != "" {
		return value, nil
	}
	if strings.TrimSpace(file) == "" {
		return "", fmt.Errorf("%s or %s_FILE is required", name, name)
	}
	raw, err := os.ReadFile(filepath.Clean(file))
	if err != nil {
		return "", fmt.Errorf("read %s_FILE: %w", name, err)
	}
	return string(raw), nil
}

func getenv(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

type filePersistence struct {
	mu  sync.Mutex
	dir string
}

func (p *filePersistence) Init(context.Context) error {
	return os.MkdirAll(p.dir, 0o755)
}

func (p *filePersistence) Latest(_ context.Context, origin string) ([]byte, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	cp, err := os.ReadFile(p.checkpointPath(origin))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return cp, nil
}

func (p *filePersistence) Update(_ context.Context, origin string, f func([]byte) ([]byte, error)) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	path := p.checkpointPath(origin)
	current, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		current = nil
	} else if err != nil {
		return err
	}
	next, err := f(current)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(p.dir, "checkpoint-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(next); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, path)
}

func (p *filePersistence) checkpointPath(origin string) string {
	sum := sha256.Sum256([]byte(origin))
	return filepath.Join(p.dir, hex.EncodeToString(sum[:])+".checkpoint")
}
