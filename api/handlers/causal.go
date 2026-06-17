package handlers

import (
	"context"
	"log"

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
	if h.neo4j == nil {
		return nil, status.Error(codes.Unavailable, "neo4j is not configured")
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
			id := propString(node.Props, "event_id")
			if id == "" || seenNodes[id] {
				continue
			}
			seenNodes[id] = true
			nodes = append(nodes, &pb.KernelEventProto{
				EventId:       id,
				TimestampNs:   propUint64(node.Props, "timestamp_ns"),
				Pid:           propUint32(node.Props, "pid"),
				EventType:     propString(node.Props, "event_type"),
				TransactionId: propString(node.Props, "transaction_id"),
				ServiceName:   propString(node.Props, "service_name"),
				TraceId:       propString(node.Props, "trace_id"),
			})
		}

		for _, rel := range neo4jPath.Relationships {
			edges = append(edges, &pb.CausalEdgeProto{
				FromEventId:   nodeEventID(rel.StartId, neo4jPath.Nodes),
				ToEventId:     nodeEventID(rel.EndId, neo4jPath.Nodes),
				CauseType:     propString(rel.Props, "cause_type"),
				LatencyNs:     propUint64(rel.Props, "latency_ns"),
				TransactionId: propString(rel.Props, "transaction_id"),
				ServiceName:   propString(rel.Props, "service_name"),
			})
		}
	}

	return &pb.QueryCausalChainResponse{Nodes: nodes, Edges: edges}, nil
}

func (h *CausalHandler) QueryEvents(ctx context.Context, req *pb.QueryEventsRequest) (*pb.QueryEventsResponse, error) {
	if req.TransactionId == "" {
		return nil, status.Error(codes.InvalidArgument, "transaction_id is required")
	}
	if h.ch == nil {
		return nil, status.Error(codes.Unavailable, "clickhouse is not configured")
	}

	rows, err := h.ch.Query(ctx, `
		SELECT event_id, event_type, timestamp_ns, pid, tid, cpu,
		       trace_id, span_id, service_name, transaction_id,
		       duration_ns
		FROM kprobe.kernel_events
		WHERE transaction_id = ?
		ORDER BY timestamp_ns ASC
		LIMIT 10000
	`, req.TransactionId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "clickhouse query failed: %v", err)
	}
	defer rows.Close()

	var events []*pb.KernelEventProto
	for rows.Next() {
		var e pb.KernelEventProto
		if err := rows.Scan(
			&e.EventId, &e.EventType, &e.TimestampNs, &e.Pid,
			&e.Tid, &e.Cpu,
			&e.TraceId, &e.SpanId, &e.ServiceName, &e.TransactionId,
			&e.DurationNs,
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
	if h.ch == nil {
		return nil, status.Error(codes.Unavailable, "clickhouse is not configured")
	}

	rows, err := h.ch.Query(ctx, `
		SELECT event_id, event_type, timestamp_ns, pid, tid, cpu,
		       trace_id, span_id, service_name, transaction_id,
		       duration_ns
		FROM kprobe.kernel_events
		WHERE timestamp_ns BETWEEN ? AND ?
		ORDER BY timestamp_ns ASC
		LIMIT 10000
	`, req.FromNs, req.ToNs)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "clickhouse query failed: %v", err)
	}
	defer rows.Close()

	var events []*pb.KernelEventProto
	for rows.Next() {
		var e pb.KernelEventProto
		if err := rows.Scan(
			&e.EventId, &e.EventType, &e.TimestampNs, &e.Pid,
			&e.Tid, &e.Cpu,
			&e.TraceId, &e.SpanId, &e.ServiceName, &e.TransactionId,
			&e.DurationNs,
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

func nodeEventID(id int64, nodes []neo4j.Node) string {
	for _, n := range nodes {
		if n.Id == id {
			return propString(n.Props, "event_id")
		}
	}
	return ""
}

func propString(props map[string]any, key string) string {
	v, ok := props[key]
	if !ok || v == nil {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		log.Printf("neo4j prop %q: expected string, got %T", key, v)
		return ""
	}
	return s
}

func propUint64(props map[string]any, key string) uint64 {
	v, ok := props[key]
	if !ok || v == nil {
		return 0
	}
	switch n := v.(type) {
	case int64:
		if n < 0 {
			return 0
		}
		return uint64(n)
	case float64:
		if n < 0 {
			return 0
		}
		return uint64(n)
	default:
		log.Printf("neo4j prop %q: expected numeric, got %T", key, v)
		return 0
	}
}

func propUint32(props map[string]any, key string) uint32 {
	v := propUint64(props, key)
	if v > uint64(^uint32(0)) {
		return 0
	}
	return uint32(v)
}
