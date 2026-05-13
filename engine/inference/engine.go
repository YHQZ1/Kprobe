package inference

import (
	"context"
	"log"
	"time"

	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/google/uuid"
)

const (
	windowDuration    = 100 * time.Millisecond
	causalThresholdNs = 50_000_000
)

type Engine struct {
	store  *graph.Neo4jStore
	window []types.KernelEvent
	ticker *time.Ticker
	input  chan types.KernelEvent
	done   chan struct{}
}

func NewEngine(store *graph.Neo4jStore) *Engine {
	return &Engine{
		store:  store,
		window: make([]types.KernelEvent, 0, 1000),
		ticker: time.NewTicker(windowDuration),
		input:  make(chan types.KernelEvent, 10000),
		done:   make(chan struct{}),
	}
}

func (e *Engine) Ingest(event types.KernelEvent) {
	select {
	case e.input <- event:
	default:
	}
}

func (e *Engine) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			e.flush(ctx)
			close(e.done)
			return
		case event := <-e.input:
			e.window = append(e.window, event)
		case <-e.ticker.C:
			if len(e.window) > 0 {
				e.flush(ctx)
			}
		}
	}
}

func (e *Engine) Wait() {
	<-e.done
}

func (e *Engine) flush(ctx context.Context) {
	events := make([]types.KernelEvent, len(e.window))
	copy(events, e.window)
	e.window = e.window[:0]

	if err := e.processWindow(ctx, events); err != nil {
		log.Printf("error processing window: %v", err)
	}
}

func (e *Engine) processWindow(ctx context.Context, events []types.KernelEvent) error {
	nodeIDs := make([]string, len(events))

	for i, event := range events {
		nodeIDs[i] = uuid.New().String()
		event.EventID = nodeIDs[i]
		if err := e.store.WriteNode(ctx, event); err != nil {
			log.Printf("write node failed: %v", err)
		}
	}

	for i := 0; i < len(events); i++ {
		for j := i + 1; j < len(events); j++ {
			a := events[i]
			b := events[j]

			causeType := inferCause(a, b)
			if causeType == "" {
				continue
			}

			latencyNs := uint64(0)
			if b.TimestampNs > a.TimestampNs {
				latencyNs = b.TimestampNs - a.TimestampNs
			}

			if err := e.store.WriteEdge(ctx, nodeIDs[i], nodeIDs[j], causeType, latencyNs, a.TransactionID, a.ServiceName); err != nil {
				log.Printf("write edge failed: %v", err)
			}
		}
	}

	return nil
}

func inferCause(a, b types.KernelEvent) string {
	if b.TimestampNs <= a.TimestampNs {
		return ""
	}
	if b.TimestampNs-a.TimestampNs > causalThresholdNs {
		return ""
	}

	if a.TID == b.TID {
		return eventPairToCause(a.EventType, b.EventType)
	}

	if a.PID == b.PID {
		return eventPairToCause(a.EventType, b.EventType)
	}

	if a.EventType == types.EventTypeSchedSwitch && isBlocking(b.EventType) {
		return "SCHED_DELAY"
	}

	if a.EventType == types.EventTypePageFault && isBlocking(b.EventType) {
		return "MEMORY_PRESSURE"
	}

	return ""
}

func eventPairToCause(from, to types.EventType) string {
	switch {
	case from == types.EventTypeTCPSend && to == types.EventTypeTCPRecv:
		return "TCP_RTT"
	case from == types.EventTypeTCPSend && to == types.EventTypeTCPRetransmit:
		return "TCP_RETRANSMIT"
	case from == types.EventTypeTCPRetransmit && to == types.EventTypeSysWrite:
		return "NETWORK_DELAY_TO_SYSCALL"
	case from == types.EventTypeSysRead && to == types.EventTypeSysWrite:
		return "READ_TO_WRITE"
	case from == types.EventTypeSysWrite && to == types.EventTypeSysRead:
		return "WRITE_TO_READ"
	case from == types.EventTypeBlockIO && to == types.EventTypeSysRead:
		return "DISK_TO_SYSCALL"
	case from == types.EventTypeBlockIO && to == types.EventTypeSysWrite:
		return "DISK_TO_SYSCALL"
	case from == types.EventTypePageFault && to == types.EventTypeSysRead:
		return "MEMORY_PRESSURE"
	case from == types.EventTypePageFault && to == types.EventTypeSysWrite:
		return "MEMORY_PRESSURE"
	case from == types.EventTypeSchedSwitch && to == types.EventTypeSysRead:
		return "CPU_CONTENTION"
	case from == types.EventTypeSchedSwitch && to == types.EventTypeSysWrite:
		return "CPU_CONTENTION"
	case from == to:
		return "SEQUENTIAL"
	default:
		return "SEQUENTIAL"
	}
}

func isBlocking(t types.EventType) bool {
	return t == types.EventTypeSysRead || t == types.EventTypeSysWrite
}
