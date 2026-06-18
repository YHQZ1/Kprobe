package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	pb "github.com/YHQZ1/kprobe/api/proto"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type CausalHTTPHandler struct {
	causal *CausalHandler
}

type causalChainWire struct {
	Nodes []eventWire      `json:"nodes"`
	Edges []causalEdgeWire `json:"edges"`
}

type causalEdgeWire struct {
	FromEventID   string `json:"fromEventId"`
	ToEventID     string `json:"toEventId"`
	CauseType     string `json:"causeType"`
	LatencyNs     uint64 `json:"latencyNs"`
	TransactionID string `json:"transactionId"`
	ServiceName   string `json:"serviceName"`
}

func NewCausalHTTPHandler(causal *CausalHandler) *CausalHTTPHandler {
	return &CausalHTTPHandler{causal: causal}
}

func (h *CausalHTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.causal == nil {
		http.Error(w, "causal handler is not configured", http.StatusServiceUnavailable)
		return
	}

	transactionID, action, ok := parseTransactionPath(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	switch action {
	case "events":
		h.serveEvents(w, r, transactionID)
	case "causal-chain":
		h.serveCausalChain(w, r, transactionID)
	default:
		http.NotFound(w, r)
	}
}

func (h *CausalHTTPHandler) serveEvents(w http.ResponseWriter, r *http.Request, transactionID string) {
	resp, err := h.causal.QueryEvents(r.Context(), &pb.QueryEventsRequest{TransactionId: transactionID})
	if err != nil {
		writeStatusError(w, err)
		return
	}

	events := make([]eventWire, 0, len(resp.Events))
	for _, event := range resp.Events {
		events = append(events, kernelEventToWire(event))
	}
	writeJSON(w, eventsResponse{Events: events})
}

func (h *CausalHTTPHandler) serveCausalChain(w http.ResponseWriter, r *http.Request, transactionID string) {
	resp, err := h.causal.QueryCausalChain(r.Context(), &pb.QueryCausalChainRequest{TransactionId: transactionID})
	if err != nil {
		writeStatusError(w, err)
		return
	}

	nodes := make([]eventWire, 0, len(resp.Nodes))
	for _, node := range resp.Nodes {
		nodes = append(nodes, kernelEventToWire(node))
	}
	edges := make([]causalEdgeWire, 0, len(resp.Edges))
	for _, edge := range resp.Edges {
		edges = append(edges, causalEdgeToWire(edge))
	}
	writeJSON(w, causalChainWire{Nodes: nodes, Edges: edges})
}

func parseTransactionPath(path string) (string, string, bool) {
	rest, ok := strings.CutPrefix(path, "/api/transactions/")
	if !ok {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func kernelEventToWire(event *pb.KernelEventProto) eventWire {
	if event == nil {
		return eventWire{}
	}
	return eventWire{
		EventID:       event.EventId,
		TimestampNs:   event.TimestampNs,
		PID:           event.Pid,
		TID:           event.Tid,
		CPU:           event.Cpu,
		EventType:     event.EventType,
		TransactionID: event.TransactionId,
		ServiceName:   event.ServiceName,
		TraceID:       event.TraceId,
		SpanID:        event.SpanId,
		DurationNs:    event.DurationNs,
	}
}

func causalEdgeToWire(edge *pb.CausalEdgeProto) causalEdgeWire {
	if edge == nil {
		return causalEdgeWire{}
	}
	return causalEdgeWire{
		FromEventID:   edge.FromEventId,
		ToEventID:     edge.ToEventId,
		CauseType:     edge.CauseType,
		LatencyNs:     edge.LatencyNs,
		TransactionID: edge.TransactionId,
		ServiceName:   edge.ServiceName,
	}
}

func writeStatusError(w http.ResponseWriter, err error) {
	httpStatus := http.StatusInternalServerError
	switch status.Code(err) {
	case codes.InvalidArgument:
		httpStatus = http.StatusBadRequest
	case codes.Unavailable:
		httpStatus = http.StatusServiceUnavailable
	case codes.NotFound:
		httpStatus = http.StatusNotFound
	}
	http.Error(w, status.Convert(err).Message(), httpStatus)
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}
