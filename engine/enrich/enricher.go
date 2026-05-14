package enrich

import (
	"sync"
	"time"

	"github.com/YHQZ1/kprobe/shared/types"
)

const (
	infightTTL     = 5 * time.Second
	spanTTL        = 30 * time.Second
	evictThreshold = 100
)

type SpanEntry struct {
	TraceID       string
	SpanID        string
	ServiceName   string
	TransactionID string
	PID           uint32
	StartTimeNs   uint64
	EndTimeNs     uint64
	ArrivedAt     time.Time
}

type pairKey struct {
	CgroupID uint64
	PID      uint32
	TID      uint32
}

type inflight struct {
	event     types.KernelEvent
	arrivedAt time.Time
}

type Enricher struct {
	mu              sync.Mutex
	syscallInFlight map[pairKey]inflight
	blockInFlight   map[pairKey]inflight
	otelSpans       map[uint32][]SpanEntry
}

func NewEnricher() *Enricher {
	return &Enricher{
		syscallInFlight: make(map[pairKey]inflight),
		blockInFlight:   make(map[pairKey]inflight),
		otelSpans:       make(map[uint32][]SpanEntry),
	}
}

func (e *Enricher) AddSpan(s SpanEntry) {
	s.ArrivedAt = time.Now()
	e.mu.Lock()
	defer e.mu.Unlock()

	e.otelSpans[s.PID] = append(e.otelSpans[s.PID], s)

	if len(e.otelSpans[s.PID]) > 1000 {
		e.otelSpans[s.PID] = e.otelSpans[s.PID][100:]
	}
}

func (e *Enricher) Process(event types.KernelEvent) []types.KernelEvent {
	e.mu.Lock()
	defer e.mu.Unlock()

	event = e.enrichTrace(event)
	e.evictStale()

	switch event.EventType {
	case types.EventTypeSysRead, types.EventTypeSysWrite:
		return e.pairSyscall(event)
	case types.EventTypeBlockIO:
		return e.pairBlock(event)
	default:
		return []types.KernelEvent{event}
	}
}

func (e *Enricher) enrichTrace(event types.KernelEvent) types.KernelEvent {
	spans, ok := e.otelSpans[event.PID]
	if !ok {
		return event
	}

	for _, span := range spans {
		if event.TimestampNs >= span.StartTimeNs && event.TimestampNs <= span.EndTimeNs {
			event.TraceID = span.TraceID
			event.SpanID = span.SpanID
			event.ServiceName = span.ServiceName
			event.TransactionID = span.TransactionID
			return event
		}
	}

	return event
}

func (e *Enricher) pairSyscall(event types.KernelEvent) []types.KernelEvent {
	key := pairKey{CgroupID: event.CgroupID, PID: event.PID, TID: event.TID}
	existing, ok := e.syscallInFlight[key]
	if !ok {
		e.syscallInFlight[key] = inflight{event: event, arrivedAt: time.Now()}
		return nil
	}
	delete(e.syscallInFlight, key)
	return completePair(existing.event, event)
}

func (e *Enricher) pairBlock(event types.KernelEvent) []types.KernelEvent {
	key := pairKey{CgroupID: event.CgroupID, PID: event.PID, TID: event.TID}
	existing, ok := e.blockInFlight[key]
	if !ok {
		e.blockInFlight[key] = inflight{event: event, arrivedAt: time.Now()}
		return nil
	}
	delete(e.blockInFlight, key)
	return completePair(existing.event, event)
}

func completePair(a, b types.KernelEvent) []types.KernelEvent {
	if b.TimestampNs > a.TimestampNs {
		a.DurationNs = b.TimestampNs - a.TimestampNs
		a.ReturnValue = b.ReturnValue
		return []types.KernelEvent{a}
	}
	b.DurationNs = a.TimestampNs - b.TimestampNs
	b.ReturnValue = a.ReturnValue
	return []types.KernelEvent{b}
}

func (e *Enricher) evictStale() {
	if len(e.syscallInFlight) < evictThreshold && len(e.blockInFlight) < evictThreshold && len(e.otelSpans) < evictThreshold {
		return
	}

	now := time.Now()
	cutoffInflight := now.Add(-infightTTL)
	cutoffSpan := now.Add(-spanTTL)

	for key, v := range e.syscallInFlight {
		if v.arrivedAt.Before(cutoffInflight) {
			delete(e.syscallInFlight, key)
		}
	}

	for key, v := range e.blockInFlight {
		if v.arrivedAt.Before(cutoffInflight) {
			delete(e.blockInFlight, key)
		}
	}

	for pid, spans := range e.otelSpans {
		var active []SpanEntry
		for _, s := range spans {
			if s.ArrivedAt.After(cutoffSpan) {
				active = append(active, s)
			}
		}
		if len(active) == 0 {
			delete(e.otelSpans, pid)
		} else {
			e.otelSpans[pid] = active
		}
	}
}
