package handlers

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	pb "github.com/YHQZ1/kprobe/api/proto"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type CausalHandler struct {
	pb.UnimplementedKprobeServiceServer
	neo4j neo4j.DriverWithContext
	ch    driver.Conn
	hub   Hub
}

type Hub interface {
	Broadcast(event *pb.KernelEventProto)
	Subscribe() chan *pb.KernelEventProto
	Unsubscribe(ch chan *pb.KernelEventProto)
}

func NewCausalHandler(neo4jDriver neo4j.DriverWithContext, chConn driver.Conn, hub Hub) *CausalHandler {
	return &CausalHandler{
		neo4j: neo4jDriver,
		ch:    chConn,
		hub:   hub,
	}
}

func (h *CausalHandler) QueryCausalChain(ctx context.Context, req *pb.QueryCausalChainRequest) (*pb.QueryCausalChainResponse, error) {
	if req.TransactionId == "" {
		return nil, status.Error(codes.InvalidArgument, "transaction_id is required")
	}

	session := h.neo4j.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, `
			MATCH path = (root:KernelEvent)-[:CAUSED*]->(leaf:KernelEvent)
			WHERE root.transaction_id = $transaction_id
			RETURN path
			ORDER BY root.timestamp_ns ASC
		`, map[string]any{"transaction_id": req.TransactionId})
		if err != nil {
			return nil, err
		}
		return records.Collect(ctx)
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "neo4j query failed: %v", err)
	}

	seenNodes := map[string]bool{}
	var nodes []*pb.KernelEventProto
	var edges []*pb.CausalEdgeProto

	for _, record := range result.([]*neo4j.Record) {
		path, _ := record.Get("path")
		neo4jPath := path.(neo4j.Path)

		for _, node := range neo4jPath.Nodes {
			id := node.Props["event_id"].(string)
			if seenNodes[id] {
				continue
			}
			seenNodes[id] = true
			nodes = append(nodes, &pb.KernelEventProto{
				EventId:       id,
				TimestampNs:   uint64(node.Props["timestamp_ns"].(int64)),
				Pid:           uint32(node.Props["pid"].(int64)),
				EventType:     node.Props["event_type"].(string),
				TransactionId: node.Props["transaction_id"].(string),
				ServiceName:   node.Props["service_name"].(string),
				TraceId:       node.Props["trace_id"].(string),
			})
		}

		for _, rel := range neo4jPath.Relationships {
			edges = append(edges, &pb.CausalEdgeProto{
				FromEventId:   fmt.Sprintf("%d", rel.StartId),
				ToEventId:     fmt.Sprintf("%d", rel.EndId),
				CauseType:     rel.Props["cause_type"].(string),
				LatencyNs:     uint64(rel.Props["latency_ns"].(int64)),
				TransactionId: rel.Props["transaction_id"].(string),
				ServiceName:   rel.Props["service_name"].(string),
			})
		}
	}

	return &pb.QueryCausalChainResponse{Nodes: nodes, Edges: edges}, nil
}

func (h *CausalHandler) QueryEvents(ctx context.Context, req *pb.QueryEventsRequest) (*pb.QueryEventsResponse, error) {
	if req.TransactionId == "" {
		return nil, status.Error(codes.InvalidArgument, "transaction_id is required")
	}

	rows, err := h.ch.Query(ctx, `
		SELECT event_id, timestamp_ns, pid, source_topic, transaction_id, service_name, trace_id
		FROM kprobe.kernel_events
		WHERE transaction_id = ?
		ORDER BY timestamp_ns ASC
	`, req.TransactionId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "clickhouse query failed: %v", err)
	}
	defer rows.Close()

	var events []*pb.KernelEventProto
	for rows.Next() {
		var e pb.KernelEventProto
		if err := rows.Scan(
			&e.EventId, &e.TimestampNs, &e.Pid,
			&e.EventType, &e.TransactionId, &e.ServiceName, &e.TraceId,
		); err != nil {
			return nil, status.Errorf(codes.Internal, "scan failed: %v", err)
		}
		events = append(events, &e)
	}

	return &pb.QueryEventsResponse{Events: events}, nil
}

func (h *CausalHandler) QueryTimeRange(ctx context.Context, req *pb.QueryTimeRangeRequest) (*pb.QueryTimeRangeResponse, error) {
	if req.FromNs == 0 || req.ToNs == 0 {
		return nil, status.Error(codes.InvalidArgument, "from_ns and to_ns are required")
	}

	rows, err := h.ch.Query(ctx, `
		SELECT event_id, timestamp_ns, pid, source_topic, transaction_id, service_name, trace_id
		FROM kprobe.kernel_events
		WHERE timestamp_ns BETWEEN ? AND ?
		ORDER BY timestamp_ns ASC
	`, req.FromNs, req.ToNs)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "clickhouse query failed: %v", err)
	}
	defer rows.Close()

	var events []*pb.KernelEventProto
	for rows.Next() {
		var e pb.KernelEventProto
		if err := rows.Scan(
			&e.EventId, &e.TimestampNs, &e.Pid,
			&e.EventType, &e.TransactionId, &e.ServiceName, &e.TraceId,
		); err != nil {
			return nil, status.Errorf(codes.Internal, "scan failed: %v", err)
		}
		events = append(events, &e)
	}

	return &pb.QueryTimeRangeResponse{Events: events}, nil
}

func (h *CausalHandler) StreamEvents(req *pb.StreamEventsRequest, stream pb.KprobeService_StreamEventsServer) error {
	ch := h.hub.Subscribe()
	defer h.hub.Unsubscribe(ch)

	for {
		select {
		case event := <-ch:
			if err := stream.Send(&pb.StreamEventsResponse{Event: event}); err != nil {
				return err
			}
		case <-stream.Context().Done():
			return nil
		}
	}
}

func newClickHouseConn(addr, database, username, password string) (driver.Conn, error) {
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
		return nil, err
	}
	if err := conn.Ping(context.Background()); err != nil {
		return nil, err
	}
	return conn, nil
}
