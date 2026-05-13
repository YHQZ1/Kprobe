package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/YHQZ1/kprobe/shared/types"
)

const (
	flushInterval = time.Second
	flushSize     = 5000
)

type ClickHouseStore struct {
	conn  driver.Conn
	mu    sync.Mutex
	buf   []types.KernelEvent
	close chan struct{}
	done  chan struct{}
}

func NewClickHouseStore(conn driver.Conn) *ClickHouseStore {
	s := &ClickHouseStore{
		conn:  conn,
		buf:   make([]types.KernelEvent, 0, flushSize),
		close: make(chan struct{}),
		done:  make(chan struct{}),
	}
	go s.flusher()
	return s
}

func (s *ClickHouseStore) InsertEvent(ctx context.Context, event types.KernelEvent) {
	s.mu.Lock()
	s.buf = append(s.buf, event)
	full := len(s.buf) >= flushSize
	s.mu.Unlock()

	if full {
		s.flushNow(ctx)
	}
}

func (s *ClickHouseStore) flusher() {
	defer close(s.done)
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.flushNow(context.Background())
		case <-s.close:
			s.flushNow(context.Background())
			return
		}
	}
}

func (s *ClickHouseStore) flushNow(ctx context.Context) {
	s.mu.Lock()
	if len(s.buf) == 0 {
		s.mu.Unlock()
		return
	}
	batch := s.buf
	s.buf = make([]types.KernelEvent, 0, flushSize)
	s.mu.Unlock()

	if err := s.writeBatch(ctx, batch); err != nil {
		log.Printf("clickhouse flush error (dropped %d events): %v", len(batch), err)
	}
}

func (s *ClickHouseStore) writeBatch(ctx context.Context, events []types.KernelEvent) error {
	b, err := s.conn.PrepareBatch(ctx, `
		INSERT INTO kprobe.kernel_events
			(event_type, timestamp_ns, pid, tid, cpu,
			 trace_id, span_id, service_name, transaction_id,
			 duration_ns, return_value, payload)
	`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}

	for _, event := range events {
		payloadBytes, err := json.Marshal(event.Payload)
		if err != nil {
			log.Printf("marshal payload for event %s: %v — skipping", event.EventID, err)
			continue
		}

		if err := b.Append(
			string(event.EventType),
			event.TimestampNs,
			event.PID,
			event.TID,
			event.CPU,
			event.TraceID,
			event.SpanID,
			event.ServiceName,
			event.TransactionID,
			event.DurationNs,
			event.ReturnValue,
			string(payloadBytes),
		); err != nil {
			log.Printf("append event %s to batch: %v — skipping", event.EventID, err)
			continue
		}
	}

	return b.Send()
}

func (s *ClickHouseStore) Close() error {
	close(s.close)
	<-s.done
	return s.conn.Close()
}
