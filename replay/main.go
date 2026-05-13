package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/YHQZ1/kprobe/replay/config"
	"github.com/YHQZ1/kprobe/replay/injector"
	"github.com/YHQZ1/kprobe/replay/session"
	"github.com/YHQZ1/kprobe/replay/store"
)

// clickhouseDSN reads the ClickHouse DSN from the environment, falling back
// to the local Docker Compose address for development.
func clickhouseDSN() string {
	if dsn := os.Getenv("CLICKHOUSE_DSN"); dsn != "" {
		return dsn
	}
	return "clickhouse://localhost:9000/kprobe?username=default&password="
}

func main() {
	log.SetPrefix("[replay] ")
	log.SetFlags(log.Ltime | log.Lmicroseconds)

	log.Println("kprobe replay engine starting...")

	// --- ClickHouse store ---
	ch, err := store.New(clickhouseDSN())
	if err != nil {
		log.Fatalf("failed to connect to ClickHouse: %v", err)
	}
	defer ch.Close()
	log.Println("ClickHouse connected")

	// --- Session manager ---
	mgr := session.NewManager(ch)
	log.Println("session manager ready")

	// --- Graceful shutdown ---
	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Development smoke test: if REPLAY_TRANSACTION_ID is set, run a single
	// replay session immediately so you can verify the pipeline end to end
	// without needing the full gRPC API wired up.
	if txID := os.Getenv("REPLAY_TRANSACTION_ID"); txID != "" {
		log.Printf("smoke test: replaying transaction %s", txID)
		if err := smokeTest(ctx, mgr, txID); err != nil {
			log.Fatalf("smoke test failed: %v", err)
		}
		return
	}

	// TODO(phase5): register gRPC handlers so the API server can create and
	// control replay sessions over the wire. The session.Manager and
	// injector.Injector are the two dependencies the handlers need.
	//
	// Example handler shape:
	//   func (h *ReplayHandler) StartSession(ctx, req) (*ReplaySession, error) {
	//       cfg := &config.SessionConfig{TransactionID: req.TransactionId, ...}
	//       inj := injector.New(cfg)
	//       events, _ := h.store.EventsByTransaction(ctx, cfg.TransactionID)
	//       modified, _ := inj.Apply(events)
	//       sess, _ := h.mgr.Create(ctx, cfg, onEvent)
	//       _ = modified // pass to ptrace.New(binary, args, modified)
	//       return sess, nil
	//   }

	log.Println("replay engine ready — waiting for sessions")
	<-ctx.Done()
	log.Println("shutting down")
}

// smokeTest creates a single replay session for the given transaction ID,
// runs it to completion, and prints a summary. Used during development to
// verify the store → session → injector pipeline without a real gRPC client.
func smokeTest(ctx context.Context, mgr *session.Manager, txID string) error {
	cfg := &config.SessionConfig{
		TransactionID:     txID,
		SpeedFactor:       10.0, // run at 10x speed in the smoke test
		LatencyMultiplier: 1.0,
	}

	inj := injector.New(cfg)
	log.Printf("smoke test: %s", inj.Summary())

	var count int
	sess, err := mgr.Create(ctx, cfg, func(event store.ReplayEvent, index int) {
		count++
		if index < 5 || index%100 == 0 {
			log.Printf("  [%4d] ts=%d pid=%d type=%d svc=%s tx=%s",
				index,
				event.TimestampNs,
				event.PID,
				event.EventType,
				event.ServiceName,
				event.TransactionID,
			)
		}
	})
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}

	log.Printf("smoke test: session %s loaded %d events", sess.ID, sess.Len())

	if err := sess.Play(ctx); err != nil {
		return fmt.Errorf("play: %w", err)
	}

	// Wait for completion or context cancellation.
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			sess.Stop()
			log.Printf("smoke test: interrupted after %d events", count)
			return nil
		case <-ticker.C:
			if sess.State() == session.StateComplete {
				log.Printf("smoke test: complete — replayed %d events", count)
				return nil
			}
			if sess.State() == session.StateFailed {
				return fmt.Errorf("session entered failed state")
			}
		}
	}
}
