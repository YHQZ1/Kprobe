package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/YHQZ1/kprobe/engine/metrics"
	"github.com/YHQZ1/kprobe/shared/types"
)

const (
	flushInterval = time.Second
	flushSize     = 5000
)

type ClickHouseStore struct {
	conn        driver.Conn
	mu          sync.Mutex
	buf         []types.KernelEvent
	signalFlush chan struct{}
	close       chan struct{}
	done        chan struct{}
}

func NewClickHouseStore(conn driver.Conn) *ClickHouseStore {
	s := &ClickHouseStore{
		conn:        conn,
		buf:         make([]types.KernelEvent, 0, flushSize),
		signalFlush: make(chan struct{}, 1),
		close:       make(chan struct{}),
		done:        make(chan struct{}),
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
		select {
		case s.signalFlush <- struct{}{}:
		default:
		}
	}
}

func (s *ClickHouseStore) flusher() {
	defer close(s.done)
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.executeFlush()
		case <-s.signalFlush:
			s.executeFlush()
		case <-s.close:
			s.executeFlush()
			return
		}
	}
}

func (s *ClickHouseStore) executeFlush() {
	s.mu.Lock()
	if len(s.buf) == 0 {
		s.mu.Unlock()
		return
	}
	batch := s.buf
	s.buf = make([]types.KernelEvent, 0, flushSize)
	s.mu.Unlock()

	metrics.BatchFlushSize.Observe(float64(len(batch)))
	start := time.Now()

	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := s.writeBatch(flushCtx, batch)
		cancel()

		if err == nil {
			break
		}

		log.Printf("clickhouse flush attempt %d failed: %v", i+1, err)
		if i == maxRetries-1 {
			log.Printf("clickhouse flush exhausted retries (dropped %d events)", len(batch))
		}
		time.Sleep(time.Duration(i*500) * time.Millisecond)
	}

	metrics.BatchFlushDuration.Observe(time.Since(start).Seconds())
}

func (s *ClickHouseStore) writeBatch(ctx context.Context, events []types.KernelEvent) error {
	b, err := s.conn.PrepareBatch(ctx, `
    INSERT INTO kprobe.kernel_events
        (event_id, event_type, timestamp_ns, pid, tid, cpu, cgroup_id,
         trace_id, span_id, service_name, transaction_id,
         duration_ns, return_value, payload)
	`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}

	for _, event := range events {
		payloadBytes, err := json.Marshal(event.Payload)
		if err != nil {
			log.Printf("marshal payload for event %s: %v", event.EventID, err)
			continue
		}

		if err := b.Append(
			event.EventID,
			string(event.EventType),
			event.TimestampNs,
			event.PID,
			event.TID,
			event.CPU,
			event.CgroupID,
			event.TraceID,
			event.SpanID,
			event.ServiceName,
			event.TransactionID,
			event.DurationNs,
			event.ReturnValue,
			string(payloadBytes),
		); err != nil {
			log.Printf("append event %s to batch: %v", event.EventID, err)
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
