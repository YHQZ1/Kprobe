package graph

import (
	"context"
	"fmt"
	"time"

	"github.com/YHQZ1/kprobe/engine/metrics"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Neo4jStore struct {
	driver neo4j.DriverWithContext
}

type EdgeBatch struct {
	FromID        string
	ToID          string
	CauseType     string
	LatencyNs     uint64
	TransactionID string
	ServiceName   string
}

func NewNeo4jStore(driver neo4j.DriverWithContext) (*Neo4jStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := driver.VerifyConnectivity(ctx); err != nil {
		return nil, fmt.Errorf("neo4j connectivity: %w", err)
	}
	store := &Neo4jStore{driver: driver}
	if err := store.ensureSchema(ctx); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Neo4jStore) ensureSchema(ctx context.Context) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	statements := []string{
		`CREATE CONSTRAINT kernel_event_id IF NOT EXISTS
		 FOR (n:KernelEvent) REQUIRE n.event_id IS UNIQUE`,
		`CREATE INDEX kernel_event_transaction_id IF NOT EXISTS
		 FOR (n:KernelEvent) ON (n.transaction_id)`,
	}

	for _, stmt := range statements {
		if _, err := session.Run(ctx, stmt, nil); err != nil {
			return fmt.Errorf("ensure neo4j schema: %w", err)
		}
	}
	return nil
}

func (s *Neo4jStore) WriteNodesBatch(ctx context.Context, events []types.KernelEvent) error {
	if len(events) == 0 {
		return nil
	}
	start := time.Now()
	defer func() {
		metrics.Neo4jWriteDuration.WithLabelValues("node_batch").Observe(time.Since(start).Seconds())
	}()

	batch := make([]map[string]any, len(events))
	for i, ev := range events {
		batch[i] = map[string]any{
			"event_id":       ev.EventID,
			"event_type":     string(ev.EventType),
			"timestamp_ns":   ev.TimestampNs,
			"pid":            ev.PID,
			"transaction_id": ev.TransactionID,
			"service_name":   ev.ServiceName,
			"trace_id":       ev.TraceID,
			"duration_ns":    ev.DurationNs,
		}
	}

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			UNWIND $batch AS e
			MERGE (n:KernelEvent {event_id: e.event_id})
			SET n.event_type = e.event_type,
			    n.timestamp_ns = e.timestamp_ns,
			    n.pid = e.pid,
			    n.transaction_id = e.transaction_id,
			    n.service_name = e.service_name,
			    n.trace_id = e.trace_id,
			    n.duration_ns = e.duration_ns
		`, map[string]any{"batch": batch})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("write nodes batch: %w", err)
	}
	return nil
}

func (s *Neo4jStore) WriteEdgesBatch(ctx context.Context, edges []EdgeBatch) error {
	if len(edges) == 0 {
		return nil
	}
	start := time.Now()
	defer func() {
		metrics.Neo4jWriteDuration.WithLabelValues("edge_batch").Observe(time.Since(start).Seconds())
	}()

	batch := make([]map[string]any, len(edges))
	for i, e := range edges {
		batch[i] = map[string]any{
			"from_id":        e.FromID,
			"to_id":          e.ToID,
			"cause_type":     e.CauseType,
			"latency_ns":     e.LatencyNs,
			"transaction_id": e.TransactionID,
			"service_name":   e.ServiceName,
		}
	}

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			UNWIND $batch AS rel
			MATCH (from:KernelEvent {event_id: rel.from_id})
			MATCH (to:KernelEvent   {event_id: rel.to_id})
			MERGE (from)-[r:CAUSED]->(to)
			SET r.cause_type = rel.cause_type,
			    r.latency_ns = rel.latency_ns,
			    r.transaction_id = rel.transaction_id,
			    r.service_name = rel.service_name
		`, map[string]any{"batch": batch})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("write edges batch: %w", err)
	}
	return nil
}

func (s *Neo4jStore) Close(ctx context.Context) error {
	return s.driver.Close(ctx)
}
