package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/YHQZ1/kprobe/shared/types"
)

// ReplayEvent extends KernelEvent with the fields stored in ClickHouse that
// are needed to reconstruct syscall behaviour during replay.
type ReplayEvent struct {
	types.KernelEvent

	// EventID is the ClickHouse-assigned UUID for this event row.
	EventID string

	// TransactionID links this kernel event to a financial transaction via
	// the Vector correlation layer.
	TransactionID string

	// ServiceName is the enriched service label added by Vector.
	ServiceName string

	// TraceID is the OpenTelemetry trace ID correlated by Vector.
	TraceID string

	// DurationNs is how long the syscall took in the original recording.
	DurationNs uint64

	// ReturnValue is the syscall return value from the original execution.
	// Stored as int64 to cover both success values and negative errno codes.
	ReturnValue int64
}

// Client wraps a ClickHouse connection for replay event queries.
type Client struct {
	db *sql.DB
}

// New opens a ClickHouse connection and verifies it with a ping.
func New(dsn string) (*Client, error) {
	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("store: ping: %w", err)
	}

	return &Client{db: db}, nil
}

// Close releases the underlying database connection.
func (c *Client) Close() error {
	return c.db.Close()
}

// EventsByTransaction returns all kernel events correlated to a financial
// transaction ID, ordered by timestamp ascending. This is the primary query
// path for loading a replay session.
func (c *Client) EventsByTransaction(ctx context.Context, transactionID string) ([]ReplayEvent, error) {
	const q = `
		SELECT
			event_id,
			timestamp_ns,
			pid,
			tid,
			cpu,
			event_type,
			transaction_id,
			service_name,
			trace_id,
			duration_ns,
			return_value
		FROM kprobe.kernel_events
		WHERE transaction_id = ?
		ORDER BY timestamp_ns ASC
	`

	rows, err := c.db.QueryContext(ctx, q, transactionID)
	if err != nil {
		return nil, fmt.Errorf("store: query by transaction: %w", err)
	}
	defer rows.Close()

	return scanEvents(rows)
}

// EventsByTimeRange returns all kernel events within a nanosecond time window,
// ordered by timestamp ascending. Used for timeline and ad-hoc replay sessions.
func (c *Client) EventsByTimeRange(ctx context.Context, fromNs, toNs uint64) ([]ReplayEvent, error) {
	const q = `
		SELECT
			event_id,
			timestamp_ns,
			pid,
			tid,
			cpu,
			event_type,
			transaction_id,
			service_name,
			trace_id,
			duration_ns,
			return_value
		FROM kprobe.kernel_events
		WHERE timestamp_ns >= ? AND timestamp_ns <= ?
		ORDER BY timestamp_ns ASC
	`

	rows, err := c.db.QueryContext(ctx, q, fromNs, toNs)
	if err != nil {
		return nil, fmt.Errorf("store: query by time range: %w", err)
	}
	defer rows.Close()

	return scanEvents(rows)
}

// scanEvents scans a sql.Rows result set into a []ReplayEvent slice.
func scanEvents(rows *sql.Rows) ([]ReplayEvent, error) {
	var events []ReplayEvent

	for rows.Next() {
		var e ReplayEvent
		var eventTypeStr string

		err := rows.Scan(
			&e.EventID,
			&e.TimestampNs,
			&e.PID,
			&e.TID,
			&e.CPU,
			&eventTypeStr,
			&e.TransactionID,
			&e.ServiceName,
			&e.TraceID,
			&e.DurationNs,
			&e.ReturnValue,
		)
		if err != nil {
			return nil, fmt.Errorf("store: scan: %w", err)
		}

		e.EventType = parseEventType(eventTypeStr)
		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: rows: %w", err)
	}

	return events, nil
}

// parseEventType converts the string event_type stored in ClickHouse back to
// the typed EventType constant used throughout the codebase.
func parseEventType(s string) types.EventType {
	switch s {
	case "tcp_send":
		return types.EventTypeTCPSend
	case "tcp_recv":
		return types.EventTypeTCPRecv
	case "syscall_read":
		return types.EventTypeSyscallRead
	case "syscall_write":
		return types.EventTypeSyscallWrite
	case "sched_switch":
		return types.EventTypeSchedSwitch
	case "page_fault":
		return types.EventTypePageFault
	default:
		return types.EventTypeTCPSend // fallback — should not happen
	}
}
