package inference

import (
	"context"
	"log"
	"time"

	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/YHQZ1/kprobe/engine/metrics"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/google/uuid"
)

const (
	windowDuration    = 100 * time.Millisecond
	causalThresholdNs = 50_000_000
	crossProcWinSize  = 200
)

type Engine struct {
	store           *graph.Neo4jStore
	window          []types.KernelEvent
	crossProcWindow []types.KernelEvent
	ticker          *time.Ticker
	input           chan types.KernelEvent
	done            chan struct{}
}

func NewEngine(store *graph.Neo4jStore) *Engine {
	return &Engine{
		store:           store,
		window:          make([]types.KernelEvent, 0, 1000),
		crossProcWindow: make([]types.KernelEvent, 0, crossProcWinSize),
		ticker:          time.NewTicker(windowDuration),
		input:           make(chan types.KernelEvent, 10000),
		done:            make(chan struct{}),
	}
}

func (e *Engine) Ingest(event types.KernelEvent) {
	select {
	case e.input <- event:
	default:
		metrics.EventsDropped.Inc()
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

	metrics.InferenceWindowSize.Observe(float64(len(events)))

	if err := e.processWindow(ctx, events); err != nil {
		log.Printf("error processing window: %v", err)
	}
}

func (e *Engine) processWindow(ctx context.Context, events []types.KernelEvent) error {
	for i := range events {
		events[i].EventID = uuid.New().String()
		if err := e.store.WriteNode(ctx, events[i]); err != nil {
			log.Printf("write node failed: %v", err)
		}
	}

	byTID := make(map[uint32][]int)
	byPID := make(map[uint32][]int)

	for i, ev := range events {
		byTID[ev.TID] = append(byTID[ev.TID], i)
		byPID[ev.PID] = append(byPID[ev.PID], i)
	}

	for _, indices := range byTID {
		if len(indices) < 2 {
			continue
		}
		for x := 0; x < len(indices); x++ {
			for y := x + 1; y < len(indices); y++ {
				i, j := indices[x], indices[y]
				e.tryWriteEdge(ctx, events, i, j, false)
			}
		}
	}

	for _, indices := range byPID {
		if len(indices) < 2 {
			continue
		}
		for x := 0; x < len(indices); x++ {
			for y := x + 1; y < len(indices); y++ {
				i, j := indices[x], indices[y]
				if events[i].TID == events[j].TID {
					continue
				}
				e.tryWriteEdge(ctx, events, i, j, true)
			}
		}
	}

	for _, ev := range events {
		if ev.EventType == types.EventTypeSchedSwitch || ev.EventType == types.EventTypePageFault {
			e.crossProcWindow = append(e.crossProcWindow, ev)
		}
	}
	if len(e.crossProcWindow) > crossProcWinSize {
		e.crossProcWindow = e.crossProcWindow[len(e.crossProcWindow)-crossProcWinSize:]
	}

	for _, ev := range events {
		if !isBlocking(ev.EventType) {
			continue
		}
		for _, prior := range e.crossProcWindow {
			if prior.PID == ev.PID {
				continue
			}
			if ev.TimestampNs <= prior.TimestampNs {
				continue
			}
			if ev.TimestampNs-prior.TimestampNs > causalThresholdNs {
				continue
			}
			causeType := crossProcCause(prior, ev)
			if causeType == "" {
				continue
			}
			latencyNs := ev.TimestampNs - prior.TimestampNs
			if err := e.store.WriteEdge(ctx, prior.EventID, ev.EventID, causeType, latencyNs, prior.TransactionID, prior.ServiceName); err != nil {
				log.Printf("write cross-proc edge failed: %v", err)
			}
		}
	}

	return nil
}

func (e *Engine) tryWriteEdge(ctx context.Context, events []types.KernelEvent, i, j int, crossThread bool) {
	a, b := events[i], events[j]

	if b.TimestampNs <= a.TimestampNs {
		a, b = b, a
	}

	if b.TimestampNs-a.TimestampNs > causalThresholdNs {
		return
	}

	causeType := eventPairToCause(a.EventType, b.EventType, crossThread)
	if causeType == "" {
		return
	}

	latencyNs := b.TimestampNs - a.TimestampNs
	if err := e.store.WriteEdge(ctx, a.EventID, b.EventID, causeType, latencyNs, a.TransactionID, a.ServiceName); err != nil {
		log.Printf("write edge failed: %v", err)
	}
}

func eventPairToCause(from, to types.EventType, crossThread bool) string {
	prefix := ""
	if crossThread {
		prefix = "CROSS_THREAD_"
	}

	switch {
	case from == types.EventTypeTCPSend && to == types.EventTypeTCPRecv:
		return prefix + "TCP_RTT"
	case from == types.EventTypeSysRead && to == types.EventTypeSysWrite:
		return prefix + "READ_TO_WRITE"
	case from == types.EventTypeSysWrite && to == types.EventTypeSysRead:
		return prefix + "WRITE_TO_READ"
	case from == types.EventTypeBlockIO && to == types.EventTypeSysRead:
		return prefix + "DISK_TO_SYSCALL"
	case from == types.EventTypeBlockIO && to == types.EventTypeSysWrite:
		return prefix + "DISK_TO_SYSCALL"
	case from == types.EventTypePageFault && to == types.EventTypeSysRead:
		return prefix + "MEMORY_PRESSURE"
	case from == types.EventTypePageFault && to == types.EventTypeSysWrite:
		return prefix + "MEMORY_PRESSURE"
	case from == types.EventTypeSchedSwitch && to == types.EventTypeSysRead:
		return prefix + "CPU_CONTENTION"
	case from == types.EventTypeSchedSwitch && to == types.EventTypeSysWrite:
		return prefix + "CPU_CONTENTION"
	case from == to:
		if !crossThread {
			return "SEQUENTIAL"
		}
		return ""
	default:
		return ""
	}
}

func crossProcCause(prior, ev types.KernelEvent) string {
	switch prior.EventType {
	case types.EventTypeSchedSwitch:
		return "SCHED_DELAY"
	case types.EventTypePageFault:
		return "MEMORY_PRESSURE"
	}
	return ""
}

func isBlocking(t types.EventType) bool {
	return t == types.EventTypeSysRead || t == types.EventTypeSysWrite
}
