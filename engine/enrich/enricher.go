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
	numShards      = 32
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

type blockKey struct {
	Sector uint64
	Bytes  uint64
	Op     string
}

type inflight struct {
	event     types.KernelEvent
	arrivedAt time.Time
}

type enricherShard struct {
	mu              sync.Mutex
	syscallInFlight map[pairKey]inflight
	blockInFlight   map[blockKey]inflight
	otelSpans       map[uint32][]SpanEntry
}

type Enricher struct {
	shards [numShards]*enricherShard
}

func NewEnricher() *Enricher {
	e := &Enricher{}
	for i := 0; i < numShards; i++ {
		e.shards[i] = &enricherShard{
			syscallInFlight: make(map[pairKey]inflight),
			blockInFlight:   make(map[blockKey]inflight),
			otelSpans:       make(map[uint32][]SpanEntry),
		}
	}

	go func() {
		ticker := time.NewTicker(5 * time.Second)
		for range ticker.C {
			for i := 0; i < numShards; i++ {
				e.shards[i].evictStale()
			}
		}
	}()

	return e
}

func (e *Enricher) getShard(pid uint32) *enricherShard {
	return e.shards[pid%numShards]
}

func (e *Enricher) getBlockShard(key blockKey) *enricherShard {
	return e.shards[(key.Sector^key.Bytes)%numShards]
}

func (e *Enricher) AddSpan(s SpanEntry) {
	s.ArrivedAt = time.Now()
	shard := e.getShard(s.PID)
	shard.mu.Lock()
	defer shard.mu.Unlock()

	shard.otelSpans[s.PID] = append(shard.otelSpans[s.PID], s)

	if len(shard.otelSpans[s.PID]) > 1000 {
		shard.otelSpans[s.PID] = shard.otelSpans[s.PID][100:]
	}
}

func (e *Enricher) Process(event types.KernelEvent) []types.KernelEvent {
	switch event.EventType {
	case types.EventTypeSysRead, types.EventTypeSysWrite:
		shard := e.getShard(event.PID)
		shard.mu.Lock()
		defer shard.mu.Unlock()

		event = shard.enrichTrace(event)
		return shard.pairSyscall(event)
	case types.EventTypeBlockIO:
		key, ok := makeBlockKey(event)
		if !ok {
			shard := e.getShard(event.PID)
			shard.mu.Lock()
			defer shard.mu.Unlock()
			return []types.KernelEvent{shard.enrichTrace(event)}
		}

		shard := e.getBlockShard(key)
		shard.mu.Lock()
		defer shard.mu.Unlock()

		event = shard.enrichTrace(event)
		return shard.pairBlock(event)
	default:
		shard := e.getShard(event.PID)
		shard.mu.Lock()
		defer shard.mu.Unlock()

		event = shard.enrichTrace(event)
		return []types.KernelEvent{event}
	}
}

func (s *enricherShard) enrichTrace(event types.KernelEvent) types.KernelEvent {
	spans, ok := s.otelSpans[event.PID]
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

func (s *enricherShard) pairSyscall(event types.KernelEvent) []types.KernelEvent {
	key := pairKey{CgroupID: event.CgroupID, PID: event.PID, TID: event.TID}
	existing, ok := s.syscallInFlight[key]
	if !ok {
		s.syscallInFlight[key] = inflight{event: event, arrivedAt: time.Now()}
		return nil
	}
	delete(s.syscallInFlight, key)
	return completePair(existing.event, event)
}

func (s *enricherShard) pairBlock(event types.KernelEvent) []types.KernelEvent {
	key, ok := makeBlockKey(event)
	if !ok {
		return []types.KernelEvent{event}
	}

	switch event.Payload.BlockPhase {
	case "issue":
		s.blockInFlight[key] = inflight{event: event, arrivedAt: time.Now()}
		return nil
	case "complete":
		existing, ok := s.blockInFlight[key]
		if !ok {
			return []types.KernelEvent{event}
		}
		delete(s.blockInFlight, key)
		return completePair(existing.event, event)
	default:
		return []types.KernelEvent{event}
	}
}

func makeBlockKey(event types.KernelEvent) (blockKey, bool) {
	if event.Payload.BlockSector == nil || event.Payload.BlockBytes == nil || event.Payload.BlockOp == "" {
		return blockKey{}, false
	}
	if *event.Payload.BlockBytes == 0 || *event.Payload.BlockSector == ^uint64(0) {
		return blockKey{}, false
	}
	return blockKey{
		Sector: *event.Payload.BlockSector,
		Bytes:  *event.Payload.BlockBytes,
		Op:     event.Payload.BlockOp,
	}, true
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

func (s *enricherShard) evictStale() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.syscallInFlight) < evictThreshold && len(s.blockInFlight) < evictThreshold && len(s.otelSpans) < evictThreshold {
		return
	}

	now := time.Now()
	cutoffInflight := now.Add(-infightTTL)
	cutoffSpan := now.Add(-spanTTL)

	for key, v := range s.syscallInFlight {
		if v.arrivedAt.Before(cutoffInflight) {
			delete(s.syscallInFlight, key)
		}
	}

	for key, v := range s.blockInFlight {
		if v.arrivedAt.Before(cutoffInflight) {
			delete(s.blockInFlight, key)
		}
	}

	for pid, spans := range s.otelSpans {
		var active []SpanEntry
		for _, sp := range spans {
			if sp.ArrivedAt.After(cutoffSpan) {
				active = append(active, sp)
			}
		}
		if len(active) == 0 {
			delete(s.otelSpans, pid)
		} else {
			s.otelSpans[pid] = active
		}
	}
}
