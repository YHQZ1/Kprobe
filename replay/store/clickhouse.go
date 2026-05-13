package store

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/YHQZ1/kprobe/shared/types"
)

type Event struct {
	types.KernelEvent
	Index int
}

type Client struct {
	db *sql.DB
}

func NewClient(db *sql.DB) *Client {
	return &Client{db: db}
}

func (c *Client) Close() error {
	return c.db.Close()
}

func (c *Client) EventsByTransaction(ctx context.Context, transactionID string) ([]Event, error) {
	const q = `
		SELECT
			event_id, event_type, timestamp_ns, pid, tid, cpu,
			trace_id, span_id, service_name, transaction_id,
			duration_ns, return_value
		FROM kprobe.kernel_events
		WHERE transaction_id = ?
		ORDER BY timestamp_ns ASC
	`

	rows, err := c.db.QueryContext(ctx, q, transactionID)
	if err != nil {
		return nil, fmt.Errorf("query by transaction: %w", err)
	}
	defer rows.Close()

	return scanEvents(rows)
}

func (c *Client) EventsByTimeRange(ctx context.Context, fromNs, toNs uint64) ([]Event, error) {
	const q = `
		SELECT
			event_id, event_type, timestamp_ns, pid, tid, cpu,
			trace_id, span_id, service_name, transaction_id,
			duration_ns, return_value
		FROM kprobe.kernel_events
		WHERE timestamp_ns >= ? AND timestamp_ns <= ?
		ORDER BY timestamp_ns ASC
	`

	rows, err := c.db.QueryContext(ctx, q, fromNs, toNs)
	if err != nil {
		return nil, fmt.Errorf("query by time range: %w", err)
	}
	defer rows.Close()

	return scanEvents(rows)
}

func scanEvents(rows *sql.Rows) ([]Event, error) {
	var events []Event

	for rows.Next() {
		var e Event
		var eventTypeStr string
		var spanID, serviceName, transactionID string

		err := rows.Scan(
			&e.EventID,
			&eventTypeStr,
			&e.TimestampNs,
			&e.PID,
			&e.TID,
			&e.CPU,
			&e.TraceID,
			&spanID,
			&serviceName,
			&transactionID,
			&e.DurationNs,
			&e.ReturnValue,
		)
		if err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}

		e.EventType = types.EventType(eventTypeStr)
		e.SpanID = spanID
		e.ServiceName = serviceName
		e.TransactionID = transactionID

		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}

	return events, nil
}
