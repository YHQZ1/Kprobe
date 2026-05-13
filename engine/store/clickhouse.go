package store

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/YHQZ1/kprobe/shared/types"
)

type ClickHouseStore struct {
	conn driver.Conn
}

func NewClickHouseStore(addr string, database string, username string, password string) (*ClickHouseStore, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: database,
			Username: username,
			Password: password,
		},
		DialTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse connect: %w", err)
	}
	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}
	return &ClickHouseStore{conn: conn}, nil
}

func (s *ClickHouseStore) InsertEvent(ctx context.Context, event types.KernelEvent) error {
	payload := fmt.Sprintf(`{
		"tcp_data_len": %d,
		"sched_prev_pid": %d,
		"sched_next_pid": %d,
		"sched_prev_state": %d,
		"syscall_fd": %d,
		"syscall_bytes": %d,
		"fault_address": %d,
		"fault_flags": %d,
		"block_sector": %d,
		"block_bytes": %d,
		"block_op": "%s"
	}`,
		valOrZero(event.Payload.TCPDataLen),
		valOrZero(event.Payload.SchedPrevPID),
		valOrZero(event.Payload.SchedNextPID),
		valOrZero(event.Payload.SchedPrevState),
		valOrZero(event.Payload.SyscallFD),
		valOrZero(event.Payload.SyscallBytes),
		valOrZero(event.Payload.FaultAddress),
		valOrZero(event.Payload.FaultFlags),
		valOrZero(event.Payload.BlockSector),
		valOrZero(event.Payload.BlockBytes),
		strOrEmpty(event.Payload.BlockOp),
	)

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
		payload,
	)
}

func (s *ClickHouseStore) Close() error {
	return s.conn.Close()
}

func valOrZero[T any](v *T) T {
	if v == nil {
		var zero T
		return zero
	}
	return *v
}

func strOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
