package enrich

import (
	"sync"

	"github.com/YHQZ1/kprobe/shared/types"
)

type SpanEntry struct {
	TraceID       string
	SpanID        string
	ServiceName   string
	TransactionID string
	PID           uint32
	StartTimeNs   uint64
	EndTimeNs     uint64
}

type Enricher struct {
	mu              sync.Mutex
	syscallInFlight map[uint64]types.KernelEvent
	blockInFlight   map[uint64]types.KernelEvent
	otelSpans       []SpanEntry
}

func NewEnricher() *Enricher {
	return &Enricher{
		syscallInFlight: make(map[uint64]types.KernelEvent),
		blockInFlight:   make(map[uint64]types.KernelEvent),
	}
}

func (e *Enricher) AddSpan(s SpanEntry) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.otelSpans = append(e.otelSpans, s)
	if len(e.otelSpans) > 10000 {
		e.otelSpans = e.otelSpans[1000:]
	}
}

func (e *Enricher) Process(event types.KernelEvent) []types.KernelEvent {
	e.mu.Lock()
	defer e.mu.Unlock()

	event = e.enrichTrace(event)

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
	for _, span := range e.otelSpans {
		if span.PID == event.PID &&
			event.TimestampNs >= span.StartTimeNs &&
			event.TimestampNs <= span.EndTimeNs {
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
	key := (uint64(event.PID) << 32) | uint64(event.TID)

	existing, ok := e.syscallInFlight[key]
	if !ok {
		e.syscallInFlight[key] = event
		return nil
	}

	delete(e.syscallInFlight, key)

	if event.TimestampNs > existing.TimestampNs {
		existing.DurationNs = event.TimestampNs - existing.TimestampNs
		existing.ReturnValue = event.ReturnValue
		return []types.KernelEvent{existing}
	}

	event.DurationNs = existing.TimestampNs - event.TimestampNs
	event.ReturnValue = existing.ReturnValue
	return []types.KernelEvent{event}
}

func (e *Enricher) pairBlock(event types.KernelEvent) []types.KernelEvent {
	key := (uint64(event.PID) << 32) | uint64(event.TID)

	existing, ok := e.blockInFlight[key]
	if !ok {
		e.blockInFlight[key] = event
		return nil
	}

	delete(e.blockInFlight, key)

	if event.TimestampNs > existing.TimestampNs {
		existing.DurationNs = event.TimestampNs - existing.TimestampNs
		return []types.KernelEvent{existing}
	}

	event.DurationNs = existing.TimestampNs - event.TimestampNs
	return []types.KernelEvent{event}
}
