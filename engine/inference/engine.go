package inference

import (
	"context"
	"log"
	"time"

	"github.com/YHQZ1/kprobe/engine/consumer"
	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/google/uuid"
)

const (
	windowDuration    = 100 * time.Millisecond
	causalThresholdNs = 50_000_000
)

type CausalEngine struct {
	graph  *graph.Neo4jStore
	window []consumer.EnrichedEvent
	ticker *time.Ticker
	input  chan consumer.EnrichedEvent
	done   chan struct{}
}

func NewCausalEngine(g *graph.Neo4jStore) *CausalEngine {
	return &CausalEngine{
		graph:  g,
		window: make([]consumer.EnrichedEvent, 0, 1000),
		ticker: time.NewTicker(windowDuration),
		input:  make(chan consumer.EnrichedEvent, 10000),
		done:   make(chan struct{}),
	}
}

func (e *CausalEngine) Ingest(event consumer.EnrichedEvent) {
	e.input <- event
}

func (e *CausalEngine) Run(ctx context.Context) {
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

func (e *CausalEngine) flush(ctx context.Context) {
	events := make([]consumer.EnrichedEvent, len(e.window))
	copy(events, e.window)
	e.window = e.window[:0]

	if err := e.processWindow(ctx, events); err != nil {
		log.Printf("error processing window: %v", err)
	}
}

func (e *CausalEngine) processWindow(ctx context.Context, events []consumer.EnrichedEvent) error {
	nodeIDs := make(map[int]string)
	nodes := make([]graph.CausalNode, 0, len(events))

	for i, event := range events {
		id := uuid.New().String()
		nodeIDs[i] = id

		nodes = append(nodes, graph.CausalNode{
			EventID:       id,
			TimestampNs:   event.TimestampNs,
			PID:           event.PID,
			EventType:     event.SourceTopic,
			TransactionID: event.TransactionID,
			ServiceName:   event.ServiceName,
			TraceID:       event.TraceID,
		})
	}

	edges := make([]graph.CausalEdge, 0)

	for i := 0; i < len(events); i++ {
		for j := i + 1; j < len(events); j++ {
			a := events[i]
			b := events[j]

			causeType := inferCause(a, b)
			if causeType == "" {
				continue
			}

			edges = append(edges, graph.CausalEdge{
				FromEventID:   nodeIDs[i],
				ToEventID:     nodeIDs[j],
				FromTimestamp: a.TimestampNs,
				ToTimestamp:   b.TimestampNs,
				CauseType:     causeType,
				LatencyNs:     b.TimestampNs - a.TimestampNs,
				TransactionID: a.TransactionID,
				ServiceName:   a.ServiceName,
			})
		}
	}

	return e.graph.WriteBatch(ctx, nodes, edges)
}

func inferCause(a, b consumer.EnrichedEvent) string {
	if b.TimestampNs <= a.TimestampNs {
		return ""
	}
	if b.TimestampNs-a.TimestampNs > causalThresholdNs {
		return ""
	}

	if a.TransactionID != "unknown" && a.TransactionID == b.TransactionID {
		return causalTypeFromTopics(a.SourceTopic, b.SourceTopic)
	}

	if a.PID == b.PID {
		return causalTypeFromTopics(a.SourceTopic, b.SourceTopic)
	}

	if a.SourceTopic == "kernel.sched" && isSyscall(b.SourceTopic) {
		return "SCHED_DELAY"
	}

	if a.SourceTopic == "kernel.fault" && isSyscall(b.SourceTopic) {
		return "MEMORY_PRESSURE"
	}

	return ""
}

func causalTypeFromTopics(from, to string) string {
	switch {
	case from == "kernel.tcp" && to == "kernel.syscall":
		return "NETWORK_TO_SYSCALL"
	case from == "kernel.syscall" && to == "kernel.tcp":
		return "SYSCALL_TO_NETWORK"
	case from == "kernel.sched" && to == "kernel.syscall":
		return "SCHED_DELAY"
	case from == "kernel.fault" && to == "kernel.syscall":
		return "MEMORY_PRESSURE"
	case from == "kernel.tcp" && to == "kernel.tcp":
		return "TCP_CHAIN"
	default:
		return "SEQUENTIAL"
	}
}

func isSyscall(topic string) bool {
	return topic == "kernel.syscall"
}

func (e *CausalEngine) Wait() {
	<-e.done
}
