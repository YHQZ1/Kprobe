package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

const (
	defaultEventLimit = 500
	maxEventLimit     = 2000
)

type eventWire struct {
	EventID       string `json:"eventId"`
	TimestampNs   uint64 `json:"timestampNs"`
	PID           uint32 `json:"pid"`
	TID           uint32 `json:"tid"`
	CPU           uint32 `json:"cpu"`
	EventType     string `json:"eventType"`
	TransactionID string `json:"transactionId"`
	ServiceName   string `json:"serviceName"`
	TraceID       string `json:"traceId"`
	SpanID        string `json:"spanId"`
	DurationNs    uint64 `json:"durationNs"`
}

type eventsResponse struct {
	Events []eventWire `json:"events"`
}

type EventsHTTPHandler struct {
	ch driver.Conn
}

func NewEventsHTTPHandler(ch driver.Conn) *EventsHTTPHandler {
	return &EventsHTTPHandler{ch: ch}
}

func (h *EventsHTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.ch == nil {
		http.Error(w, "clickhouse is not configured", http.StatusServiceUnavailable)
		return
	}

	limit := defaultEventLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			http.Error(w, "limit must be a positive integer", http.StatusBadRequest)
			return
		}
		if parsed > maxEventLimit {
			parsed = maxEventLimit
		}
		limit = parsed
	}

	rows, err := h.ch.Query(r.Context(), `
		SELECT event_id, event_type, timestamp_ns, pid, tid, cpu,
		       trace_id, span_id, service_name, transaction_id,
		       duration_ns
		FROM kprobe.kernel_events
		ORDER BY timestamp_ns DESC
		LIMIT ?
	`, limit)
	if err != nil {
		http.Error(w, "event history query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	events := make([]eventWire, 0, limit)
	for rows.Next() {
		var event eventWire
		if err := rows.Scan(
			&event.EventID,
			&event.EventType,
			&event.TimestampNs,
			&event.PID,
			&event.TID,
			&event.CPU,
			&event.TraceID,
			&event.SpanID,
			&event.ServiceName,
			&event.TransactionID,
			&event.DurationNs,
		); err != nil {
			http.Error(w, "event history scan failed", http.StatusInternalServerError)
			return
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "event history query failed", http.StatusInternalServerError)
		return
	}

	for left, right := 0, len(events)-1; left < right; left, right = left+1, right-1 {
		events[left], events[right] = events[right], events[left]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(eventsResponse{Events: events})
}
