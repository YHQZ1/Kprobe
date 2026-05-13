package graph

import (
	"context"
	"fmt"
	"time"

	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Neo4jStore struct {
	driver neo4j.DriverWithContext
}

func NewNeo4jStore(uri string, username string, password string) (*Neo4jStore, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(username, password, ""))
	if err != nil {
		return nil, fmt.Errorf("neo4j driver: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := driver.VerifyConnectivity(ctx); err != nil {
		return nil, fmt.Errorf("neo4j connectivity: %w", err)
	}

	return &Neo4jStore{driver: driver}, nil
}

func (s *Neo4jStore) WriteNode(ctx context.Context, event types.KernelEvent) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MERGE (e:KernelEvent {event_id: $event_id})
			SET e.event_type     = $event_type,
			    e.timestamp_ns   = $timestamp_ns,
			    e.pid            = $pid,
			    e.transaction_id = $transaction_id,
			    e.service_name   = $service_name,
			    e.trace_id       = $trace_id,
			    e.duration_ns    = $duration_ns
		`, map[string]any{
			"event_id":       event.EventID,
			"event_type":     string(event.EventType),
			"timestamp_ns":   event.TimestampNs,
			"pid":            event.PID,
			"transaction_id": event.TransactionID,
			"service_name":   event.ServiceName,
			"trace_id":       event.TraceID,
			"duration_ns":    event.DurationNs,
		})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("write node: %w", err)
	}
	return nil
}

func (s *Neo4jStore) WriteEdge(ctx context.Context, fromID, toID, causeType string, latencyNs uint64, transactionID, serviceName string) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MATCH (from:KernelEvent {event_id: $from_id})
			MATCH (to:KernelEvent   {event_id: $to_id})
			MERGE (from)-[r:CAUSED]->(to)
			SET r.cause_type     = $cause_type,
			    r.latency_ns     = $latency_ns,
			    r.transaction_id = $transaction_id,
			    r.service_name   = $service_name
		`, map[string]any{
			"from_id":        fromID,
			"to_id":          toID,
			"cause_type":     causeType,
			"latency_ns":     latencyNs,
			"transaction_id": transactionID,
			"service_name":   serviceName,
		})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("write edge: %w", err)
	}
	return nil
}

func (s *Neo4jStore) Close(ctx context.Context) error {
	return s.driver.Close(ctx)
}
