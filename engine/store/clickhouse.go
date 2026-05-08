package store

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/YHQZ1/kprobe/engine/consumer"
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
		return nil, fmt.Errorf("failed to connect to clickhouse: %w", err)
	}

	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("clickhouse ping failed: %w", err)
	}

	return &ClickHouseStore{conn: conn}, nil
}

func (s *ClickHouseStore) InsertEvent(ctx context.Context, event consumer.EnrichedEvent) error {
	return s.conn.Exec(ctx, `
		INSERT INTO kprobe.kernel_events (
			timestamp_ns, ingested_at, pid, tid, cpu, source_topic,
			trace_id, span_id, service_name, transaction_id,
			tcp_data_len, tcp_event_type,
			sched_prev_pid, sched_next_pid, sched_prev_state,
			syscall_bytes, syscall_fd, syscall_type,
			fault_address, fault_error_code
		) VALUES (
			?, ?, ?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?,
			?, ?, ?,
			?, ?, ?,
			?, ?
		)`,
		event.TimestampNs,
		time.Now(),
		event.PID,
		event.TID,
		event.CPU,
		event.SourceTopic,
		event.TraceID,
		event.SpanID,
		event.ServiceName,
		event.TransactionID,
		event.TCPDataLen,
		event.TCPEventType,
		event.SchedPrevPID,
		event.SchedNextPID,
		event.SchedPrevState,
		event.SyscallBytes,
		event.SyscallFD,
		event.SyscallType,
		event.FaultAddress,
		event.FaultErrorCode,
	)
}

func (s *ClickHouseStore) QueryByTransactionID(ctx context.Context, transactionID string) ([]consumer.EnrichedEvent, error) {
	rows, err := s.conn.Query(ctx, `
		SELECT
			timestamp_ns, pid, tid, cpu, source_topic,
			trace_id, span_id, service_name, transaction_id,
			tcp_data_len, tcp_event_type,
			sched_prev_pid, sched_next_pid, sched_prev_state,
			syscall_bytes, syscall_fd, syscall_type,
			fault_address, fault_error_code
		FROM kprobe.kernel_events
		WHERE transaction_id = ?
		ORDER BY timestamp_ns ASC
	`, transactionID)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var events []consumer.EnrichedEvent
	for rows.Next() {
		var e consumer.EnrichedEvent
		if err := rows.Scan(
			&e.TimestampNs, &e.PID, &e.TID, &e.CPU, &e.SourceTopic,
			&e.TraceID, &e.SpanID, &e.ServiceName, &e.TransactionID,
			&e.TCPDataLen, &e.TCPEventType,
			&e.SchedPrevPID, &e.SchedNextPID, &e.SchedPrevState,
			&e.SyscallBytes, &e.SyscallFD, &e.SyscallType,
			&e.FaultAddress, &e.FaultErrorCode,
		); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		events = append(events, e)
	}

	return events, nil
}

func (s *ClickHouseStore) QueryByTimeRange(ctx context.Context, fromNs uint64, toNs uint64) ([]consumer.EnrichedEvent, error) {
	rows, err := s.conn.Query(ctx, `
		SELECT
			timestamp_ns, pid, tid, cpu, source_topic,
			trace_id, span_id, service_name, transaction_id,
			tcp_data_len, tcp_event_type,
			sched_prev_pid, sched_next_pid, sched_prev_state,
			syscall_bytes, syscall_fd, syscall_type,
			fault_address, fault_error_code
		FROM kprobe.kernel_events
		WHERE timestamp_ns BETWEEN ? AND ?
		ORDER BY timestamp_ns ASC
	`, fromNs, toNs)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var events []consumer.EnrichedEvent
	for rows.Next() {
		var e consumer.EnrichedEvent
		if err := rows.Scan(
			&e.TimestampNs, &e.PID, &e.TID, &e.CPU, &e.SourceTopic,
			&e.TraceID, &e.SpanID, &e.ServiceName, &e.TransactionID,
			&e.TCPDataLen, &e.TCPEventType,
			&e.SchedPrevPID, &e.SchedNextPID, &e.SchedPrevState,
			&e.SyscallBytes, &e.SyscallFD, &e.SyscallType,
			&e.FaultAddress, &e.FaultErrorCode,
		); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		events = append(events, e)
	}

	return events, nil
}

func (s *ClickHouseStore) Close() error {
	return s.conn.Close()
}
