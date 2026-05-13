package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

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
			duration_ns, return_value, payload
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
			duration_ns, return_value, payload
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
	index := 0

	for rows.Next() {
		var e Event
		var eventTypeStr string
		var payloadStr string

		err := rows.Scan(
			&e.EventID,
			&eventTypeStr,
			&e.TimestampNs,
			&e.PID,
			&e.TID,
			&e.CPU,
			&e.TraceID,
			&e.SpanID,
			&e.ServiceName,
			&e.TransactionID,
			&e.DurationNs,
			&e.ReturnValue,
			&payloadStr,
		)
		if err != nil {
			return nil, fmt.Errorf("scan row %d: %w", index, err)
		}

		e.EventType = types.EventType(eventTypeStr)
		e.Index = index

		if payloadStr != "" && payloadStr != "{}" {
			if err := json.Unmarshal([]byte(payloadStr), &e.KernelEvent.Payload); err != nil {
				log.Printf("unmarshal payload for event %s (row %d): %v — skipping payload", e.EventID, index, err)
			}
		}

		events = append(events, e)
		index++
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration: %w", err)
	}

	return events, nil
}
