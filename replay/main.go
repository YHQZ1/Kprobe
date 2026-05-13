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

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.SetPrefix("[replay] ")
	log.SetFlags(log.Ltime | log.Lmicroseconds)

	log.Println("kprobe replay engine starting...")

	dsn := env("CLICKHOUSE_DSN", "clickhouse://localhost:9000/kprobe?username=kprobe&password=kprobe")
	ch, err := store.NewClient(dsn)
	if err != nil {
		log.Fatalf("clickhouse: %v", err)
	}
	defer ch.Close()
	log.Println("clickhouse connected")

	mgr := session.NewManager(ch)
	log.Println("session manager ready")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if txID := os.Getenv("REPLAY_TRANSACTION_ID"); txID != "" {
		log.Printf("smoke test: replaying transaction %s", txID)
		if err := smokeTest(ctx, mgr, txID); err != nil {
			log.Fatalf("smoke test failed: %v", err)
		}
		return
	}

	log.Println("replay engine ready")
	<-ctx.Done()
	log.Println("shutting down")
}

func smokeTest(ctx context.Context, mgr *session.Manager, txID string) error {
	cfg := &config.SessionConfig{
		TransactionID:     txID,
		SpeedFactor:       10.0,
		LatencyMultiplier: 1.0,
	}

	inj := injector.New(cfg)
	log.Printf("smoke test: %s", inj.Summary())

	var count int
	sess, err := mgr.Create(ctx, cfg, func(event store.Event, index int) {
		count++
		if index < 5 || index%100 == 0 {
			log.Printf("  [%4d] ts=%d pid=%d type=%s svc=%s tx=%s",
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
