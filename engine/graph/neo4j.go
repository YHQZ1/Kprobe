package graph

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type CausalEdge struct {
	FromEventID   string
	ToEventID     string
	FromTimestamp uint64
	ToTimestamp   uint64
	CauseType     string
	LatencyNs     uint64
	TransactionID string
	ServiceName   string
}

type CausalNode struct {
	EventID       string
	TimestampNs   uint64
	PID           uint32
	EventType     string
	TransactionID string
	ServiceName   string
	TraceID       string
}

type Neo4jStore struct {
	driver neo4j.DriverWithContext
}

func NewNeo4jStore(uri string, username string, password string) (*Neo4jStore, error) {
	driver, err := neo4j.NewDriverWithContext(
		uri,
		neo4j.BasicAuth(username, password, ""),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create neo4j driver: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := driver.VerifyConnectivity(ctx); err != nil {
		return nil, fmt.Errorf("neo4j connectivity check failed: %w", err)
	}

	return &Neo4jStore{driver: driver}, nil
}

func (s *Neo4jStore) WriteNode(ctx context.Context, node CausalNode) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MERGE (e:KernelEvent {event_id: $event_id})
			SET e.timestamp_ns   = $timestamp_ns,
			    e.pid             = $pid,
			    e.event_type      = $event_type,
			    e.transaction_id  = $transaction_id,
			    e.service_name    = $service_name,
			    e.trace_id        = $trace_id
		`, map[string]any{
			"event_id":       node.EventID,
			"timestamp_ns":   node.TimestampNs,
			"pid":            node.PID,
			"event_type":     node.EventType,
			"transaction_id": node.TransactionID,
			"service_name":   node.ServiceName,
			"trace_id":       node.TraceID,
		})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("failed to write node: %w", err)
	}
	return nil
}

func (s *Neo4jStore) WriteEdge(ctx context.Context, edge CausalEdge) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MATCH (from:KernelEvent {event_id: $from_id})
			MATCH (to:KernelEvent   {event_id: $to_id})
			MERGE (from)-[r:CAUSED {cause_type: $cause_type}]->(to)
			SET r.latency_ns     = $latency_ns,
			    r.transaction_id = $transaction_id,
			    r.service_name   = $service_name
		`, map[string]any{
			"from_id":        edge.FromEventID,
			"to_id":          edge.ToEventID,
			"cause_type":     edge.CauseType,
			"latency_ns":     edge.LatencyNs,
			"transaction_id": edge.TransactionID,
			"service_name":   edge.ServiceName,
		})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("failed to write edge: %w", err)
	}
	return nil
}

func (s *Neo4jStore) QueryCausalChain(ctx context.Context, transactionID string) ([]CausalNode, []CausalEdge, error) {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, `
			MATCH path = (root:KernelEvent)-[:CAUSED*]->(leaf:KernelEvent)
			WHERE root.transaction_id = $transaction_id
			RETURN path
			ORDER BY root.timestamp_ns ASC
		`, map[string]any{
			"transaction_id": transactionID,
		})
		if err != nil {
			return nil, err
		}
		return records.Collect(ctx)
	})
	if err != nil {
		return nil, nil, fmt.Errorf("causal chain query failed: %w", err)
	}

	var nodes []CausalNode
	var edges []CausalEdge

	for _, record := range result.([]*neo4j.Record) {
		path, _ := record.Get("path")
		neo4jPath := path.(neo4j.Path)

		for _, node := range neo4jPath.Nodes {
			nodes = append(nodes, CausalNode{
				EventID:       node.Props["event_id"].(string),
				TimestampNs:   uint64(node.Props["timestamp_ns"].(int64)),
				EventType:     node.Props["event_type"].(string),
				TransactionID: node.Props["transaction_id"].(string),
				ServiceName:   node.Props["service_name"].(string),
				TraceID:       node.Props["trace_id"].(string),
			})
		}

		for _, rel := range neo4jPath.Relationships {
			edges = append(edges, CausalEdge{
				CauseType:     rel.Props["cause_type"].(string),
				LatencyNs:     uint64(rel.Props["latency_ns"].(int64)),
				TransactionID: rel.Props["transaction_id"].(string),
				ServiceName:   rel.Props["service_name"].(string),
			})
		}
	}

	return nodes, edges, nil
}

func (s *Neo4jStore) Close(ctx context.Context) error {
	return s.driver.Close(ctx)
}
