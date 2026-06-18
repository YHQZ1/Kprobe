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

	nodeResult, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, `
			MATCH (n:KernelEvent)
			WHERE n.transaction_id = $transaction_id
			WITH collect(n) AS direct_nodes
			OPTIONAL MATCH (from:KernelEvent)-[r:CAUSED {transaction_id: $transaction_id}]->(to:KernelEvent)
			WITH direct_nodes + collect(from) + collect(to) AS all_nodes
			UNWIND all_nodes AS n
			WITH DISTINCT n
			WHERE n IS NOT NULL
			RETURN n
			ORDER BY n.timestamp_ns ASC
			LIMIT 10000
		`, map[string]any{"transaction_id": req.TransactionId})
		if err != nil {
			return nil, err
		}
		return records.Collect(ctx)
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "neo4j query failed: %v", err)
	}

	edgeResult, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, `
			MATCH (from:KernelEvent)-[r:CAUSED {transaction_id: $transaction_id}]->(to:KernelEvent)
			RETURN from.event_id AS from_event_id,
			       to.event_id AS to_event_id,
			       r.cause_type AS cause_type,
			       r.latency_ns AS latency_ns,
			       r.transaction_id AS transaction_id,
			       r.service_name AS service_name
			ORDER BY from.timestamp_ns ASC, to.timestamp_ns ASC
			LIMIT 10000
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
	seenEdges := map[string]bool{}
	var nodes []*pb.KernelEventProto
	var edges []*pb.CausalEdgeProto

	nodeRecords, ok := nodeResult.([]*neo4j.Record)
	if !ok {
		return nil, status.Error(codes.Internal, "neo4j query returned an unexpected result")
	}
	for _, record := range nodeRecords {
		nodeValue, found := record.Get("n")
		node, ok := nodeValue.(neo4j.Node)
		if !found || !ok {
			return nil, status.Error(codes.Internal, "neo4j query returned an invalid node")
		}
		id := propString(node.Props, "event_id")
		if id == "" || seenNodes[id] {
			continue
		}
		seenNodes[id] = true
		nodes = append(nodes, kernelEventFromNeo4jProps(node.Props))
	}

	edgeRecords, ok := edgeResult.([]*neo4j.Record)
	if !ok {
		return nil, status.Error(codes.Internal, "neo4j query returned an unexpected result")
	}
	for _, record := range edgeRecords {
		fromID := recordString(record, "from_event_id")
		toID := recordString(record, "to_event_id")
		causeType := recordString(record, "cause_type")
		if fromID == "" || toID == "" || causeType == "" {
			continue
		}
		edgeKey := fromID + "\x00" + toID + "\x00" + causeType
		if seenEdges[edgeKey] {
			continue
		}
		seenEdges[edgeKey] = true
		edges = append(edges, &pb.CausalEdgeProto{
			FromEventId:   fromID,
			ToEventId:     toID,
			CauseType:     causeType,
			LatencyNs:     recordUint64(record, "latency_ns"),
			TransactionId: recordString(record, "transaction_id"),
			ServiceName:   recordString(record, "service_name"),
		})
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
	if err := rows.Err(); err != nil {
		return nil, status.Errorf(codes.Internal, "clickhouse rows failed: %v", err)
	}

	return &pb.QueryEventsResponse{Events: events}, nil
}

func (h *CausalHandler) QueryTimeRange(ctx context.Context, req *pb.QueryTimeRangeRequest) (*pb.QueryTimeRangeResponse, error) {
	if req.FromNs == 0 || req.ToNs == 0 {
		return nil, status.Error(codes.InvalidArgument, "from_ns and to_ns are required")
	}
	if req.FromNs > req.ToNs {
		return nil, status.Error(codes.InvalidArgument, "from_ns must be less than or equal to to_ns")
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
	if err := rows.Err(); err != nil {
		return nil, status.Errorf(codes.Internal, "clickhouse rows failed: %v", err)
	}

	return &pb.QueryTimeRangeResponse{Events: events}, nil
}

func (h *CausalHandler) StreamEvents(req *pb.StreamEventsRequest, stream pb.KprobeService_StreamEventsServer) error {
	ch := h.hub.Subscribe()
	defer h.hub.Unsubscribe(ch)

	for {
		select {
		case event, ok := <-ch:
			if !ok {
				return nil
			}
			if err := stream.Send(&pb.StreamEventsResponse{Event: event}); err != nil {
				return err
			}
		case <-stream.Context().Done():
			return nil
		}
	}
}

func kernelEventFromNeo4jProps(props map[string]any) *pb.KernelEventProto {
	return &pb.KernelEventProto{
		EventId:       propString(props, "event_id"),
		TimestampNs:   propUint64(props, "timestamp_ns"),
		Pid:           propUint32(props, "pid"),
		Tid:           propUint32(props, "tid"),
		Cpu:           propUint32(props, "cpu"),
		EventType:     propString(props, "event_type"),
		TransactionId: propString(props, "transaction_id"),
		ServiceName:   propString(props, "service_name"),
		TraceId:       propString(props, "trace_id"),
		SpanId:        propString(props, "span_id"),
		DurationNs:    propUint64(props, "duration_ns"),
	}
}

func recordString(record *neo4j.Record, key string) string {
	value, ok := record.Get(key)
	if !ok || value == nil {
		return ""
	}
	s, ok := value.(string)
	if !ok {
		log.Printf("neo4j record %q: expected string, got %T", key, value)
		return ""
	}
	return s
}

func recordUint64(record *neo4j.Record, key string) uint64 {
	value, ok := record.Get(key)
	if !ok || value == nil {
		return 0
	}
	return anyUint64(key, value)
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
	return anyUint64(key, v)
}

func anyUint64(key string, v any) uint64 {
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
