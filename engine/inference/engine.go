package inference

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/YHQZ1/kprobe/engine/consumer"
	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/google/uuid"
)

const (
	// Time window to group related events together
	windowDuration = 100 * time.Millisecond

	// If two events share a PID and are within this threshold
	// the earlier one is considered a cause of the later one
	causalThresholdNs = 50_000_000 // 50ms in nanoseconds
)

// CausalEngine consumes enriched events, groups them into
// time windows, and draws causal edges between related events
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

// Ingest adds an event to the engine's input channel
func (e *CausalEngine) Ingest(event consumer.EnrichedEvent) {
	e.input <- event
}

// Run starts the event processing loop
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

// flush processes all events in the current window
func (e *CausalEngine) flush(ctx context.Context) {
	events := make([]consumer.EnrichedEvent, len(e.window))
	copy(events, e.window)
	e.window = e.window[:0]

	if err := e.processWindow(ctx, events); err != nil {
		log.Printf("error processing window: %v", err)
	}
}

// processWindow writes nodes and infers causal edges for a batch of events
func (e *CausalEngine) processWindow(ctx context.Context, events []consumer.EnrichedEvent) error {
	// Write all events as nodes first
	nodeIDs := make(map[int]string)
	for i, event := range events {
		id := uuid.New().String()
		nodeIDs[i] = id

		node := graph.CausalNode{
			EventID:       id,
			TimestampNs:   event.TimestampNs,
			PID:           event.PID,
			EventType:     event.SourceTopic,
			TransactionID: event.TransactionID,
			ServiceName:   event.ServiceName,
			TraceID:       event.TraceID,
		}

		if err := e.graph.WriteNode(ctx, node); err != nil {
			return fmt.Errorf("failed to write node: %w", err)
		}
	}

	// Infer causal edges between events
	for i := 0; i < len(events); i++ {
		for j := i + 1; j < len(events); j++ {
			a := events[i]
			b := events[j]

			causeType := inferCause(a, b)
			if causeType == "" {
				continue
			}

			latencyNs := b.TimestampNs - a.TimestampNs

			edge := graph.CausalEdge{
				FromEventID:   nodeIDs[i],
				ToEventID:     nodeIDs[j],
				FromTimestamp: a.TimestampNs,
				ToTimestamp:   b.TimestampNs,
				CauseType:     causeType,
				LatencyNs:     latencyNs,
				TransactionID: a.TransactionID,
				ServiceName:   a.ServiceName,
			}

			if err := e.graph.WriteEdge(ctx, edge); err != nil {
				return fmt.Errorf("failed to write edge: %w", err)
			}
		}
	}

	return nil
}

// inferCause determines if event a causally led to event b
// returns the cause type string or empty string if no causal relationship
func inferCause(a, b consumer.EnrichedEvent) string {
	// Must be within causal time threshold
	if b.TimestampNs <= a.TimestampNs {
		return ""
	}
	if b.TimestampNs-a.TimestampNs > causalThresholdNs {
		return ""
	}

	// Same transaction — strong causal signal
	if a.TransactionID != "unknown" && a.TransactionID == b.TransactionID {
		return causalTypeFromTopics(a.SourceTopic, b.SourceTopic)
	}

	// Same PID — weaker but still causal
	if a.PID == b.PID {
		return causalTypeFromTopics(a.SourceTopic, b.SourceTopic)
	}

	// Scheduler switch followed by syscall — classic kernel delay pattern
	if a.SourceTopic == "kernel.sched" && isSyscall(b.SourceTopic) {
		return "SCHED_DELAY"
	}

	// Page fault followed by syscall — memory pressure pattern
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

// Wait blocks until the engine has fully shut down
func (e *CausalEngine) Wait() {
	<-e.done
}
