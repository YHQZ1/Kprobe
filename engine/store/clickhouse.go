package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/YHQZ1/kprobe/shared/types"
)

type ClickHouseStore struct {
	conn driver.Conn
}

func NewClickHouseStore(conn driver.Conn) *ClickHouseStore {
	return &ClickHouseStore{conn: conn}
}

func (s *ClickHouseStore) InsertEvent(ctx context.Context, event types.KernelEvent) error {
	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	return s.conn.Exec(ctx, `
		INSERT INTO kprobe.kernel_events
			(event_type, timestamp_ns, pid, tid, cpu,
			 trace_id, span_id, service_name, transaction_id,
			 duration_ns, return_value, payload)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
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
	)
}

func (s *ClickHouseStore) Close() error {
	return s.conn.Close()
}
