package inference

import (
	"testing"

	"github.com/YHQZ1/kprobe/shared/types"
)

func TestCrossProcCause(t *testing.T) {
	tests := []struct {
		name     string
		prior    types.KernelEvent
		ev       types.KernelEvent
		expected string
	}{
		{
			name: "Valid SCHED_DELAY on exact PID and CPU",
			prior: types.KernelEvent{
				EventType:    types.EventTypeSchedSwitch,
				SchedNextPID: 9000,
				CPU:          2,
			},
			ev: types.KernelEvent{
				PID: 9000,
				CPU: 2,
			},
			expected: "SCHED_DELAY",
		},
		{
			name: "Invalid SCHED_DELAY - mismatched PID",
			prior: types.KernelEvent{
				EventType:    types.EventTypeSchedSwitch,
				SchedNextPID: 9000,
				CPU:          2,
			},
			ev: types.KernelEvent{
				PID: 9001,
				CPU: 2,
			},
			expected: "",
		},
		{
			name: "Invalid SCHED_DELAY - mismatched CPU",
			prior: types.KernelEvent{
				EventType:    types.EventTypeSchedSwitch,
				SchedNextPID: 9000,
				CPU:          2,
			},
			ev: types.KernelEvent{
				PID: 9000,
				CPU: 3,
			},
			expected: "",
		},
		{
			name: "Valid MEMORY_PRESSURE from page fault",
			prior: types.KernelEvent{
				EventType: types.EventTypePageFault,
			},
			ev: types.KernelEvent{
				PID: 9000,
			},
			expected: "MEMORY_PRESSURE",
		},
		{
			name: "Valid DISK_TO_SYSCALL from block io to read",
			prior: types.KernelEvent{
				EventType: types.EventTypeBlockIO,
			},
			ev: types.KernelEvent{
				EventType: types.EventTypeSysRead,
				PID:       9000,
			},
			expected: "DISK_TO_SYSCALL",
		},
		{
			name: "Valid DISK_TO_SYSCALL from block io to write",
			prior: types.KernelEvent{
				EventType: types.EventTypeBlockIO,
			},
			ev: types.KernelEvent{
				EventType: types.EventTypeSysWrite,
				PID:       9000,
			},
			expected: "DISK_TO_SYSCALL",
		},
		{
			name: "Invalid DISK_TO_SYSCALL for non-blocking event",
			prior: types.KernelEvent{
				EventType: types.EventTypeBlockIO,
			},
			ev: types.KernelEvent{
				EventType: types.EventTypeTCPRecv,
				PID:       9000,
			},
			expected: "",
		},
		{
			name: "Unrelated prior event",
			prior: types.KernelEvent{
				EventType: types.EventTypeSysRead,
			},
			ev: types.KernelEvent{
				PID: 9000,
			},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cause := crossProcCause(tt.prior, tt.ev)
			if cause != tt.expected {
				t.Errorf("crossProcCause() expected %q, got %q", tt.expected, cause)
			}
		})
	}
}

func TestIsCrossProcCandidate(t *testing.T) {
	tests := []struct {
		eventType types.EventType
		expected  bool
	}{
		{eventType: types.EventTypeBlockIO, expected: false},
		{eventType: types.EventTypeSchedSwitch, expected: true},
		{eventType: types.EventTypePageFault, expected: true},
		{eventType: types.EventTypeSysRead, expected: false},
		{eventType: types.EventTypeSysWrite, expected: false},
		{eventType: types.EventTypeTCPSend, expected: false},
	}

	for _, tt := range tests {
		t.Run(string(tt.eventType), func(t *testing.T) {
			got := isCrossProcCandidate(tt.eventType)
			if got != tt.expected {
				t.Errorf("isCrossProcCandidate() expected %v, got %v", tt.expected, got)
			}
		})
	}
}

func TestRememberCrossProcCandidatesKeepsBlockIOSeparate(t *testing.T) {
	engine := NewEngine(nil)
	defer engine.ticker.Stop()

	events := []types.KernelEvent{
		{EventID: "block-1", EventType: types.EventTypeBlockIO},
		{EventID: "sched-1", EventType: types.EventTypeSchedSwitch},
		{EventID: "fault-1", EventType: types.EventTypePageFault},
		{EventID: "read-1", EventType: types.EventTypeSysRead},
	}

	engine.rememberCrossProcCandidates(events)

	if len(engine.blockIOWindow) != 1 {
		t.Fatalf("expected one block event, got %d", len(engine.blockIOWindow))
	}
	if engine.blockIOWindow[0].EventID != "block-1" {
		t.Fatalf("unexpected block window contents: %+v", engine.blockIOWindow)
	}
	if len(engine.crossProcWindow) != 2 {
		t.Fatalf("expected two scheduler/fault events, got %d", len(engine.crossProcWindow))
	}
}

func TestTrimEventWindowKeepsNewestEvents(t *testing.T) {
	events := []types.KernelEvent{
		{EventID: "oldest"},
		{EventID: "middle"},
		{EventID: "newest"},
	}

	got := trimEventWindow(events, 2)
	if len(got) != 2 {
		t.Fatalf("expected two events, got %d", len(got))
	}
	if got[0].EventID != "middle" || got[1].EventID != "newest" {
		t.Fatalf("expected newest events to be retained, got %+v", got)
	}
}

func TestTryCreateCrossProcEdgeAllowsBlockOverlap(t *testing.T) {
	block := types.KernelEvent{
		EventID:     "block-1",
		EventType:   types.EventTypeBlockIO,
		TimestampNs: 1_050,
		DurationNs:  100,
		PID:         44,
	}
	read := types.KernelEvent{
		EventID:     "read-1",
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1_000,
		DurationNs:  500,
		PID:         55,
	}

	edge, ok := tryCreateCrossProcEdge(block, read)
	if !ok {
		t.Fatal("expected overlapping block I/O and syscall to create an edge")
	}
	if edge.CauseType != "DISK_TO_SYSCALL" {
		t.Fatalf("expected DISK_TO_SYSCALL, got %q", edge.CauseType)
	}
	if edge.FromID != "block-1" || edge.ToID != "read-1" {
		t.Fatalf("unexpected edge endpoints: %+v", edge)
	}
	if edge.LatencyNs != 50 {
		t.Fatalf("expected latency 50, got %d", edge.LatencyNs)
	}
}

func TestTryCreateCrossProcEdgeRejectsNonOverlappingBlock(t *testing.T) {
	block := types.KernelEvent{
		EventID:     "block-1",
		EventType:   types.EventTypeBlockIO,
		TimestampNs: 60_000_000,
		DurationNs:  100,
		PID:         44,
	}
	read := types.KernelEvent{
		EventID:     "read-1",
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1_000,
		DurationNs:  500,
		PID:         55,
	}

	if _, ok := tryCreateCrossProcEdge(block, read); ok {
		t.Fatal("expected non-overlapping block I/O and syscall to be ignored")
	}
}

func TestTryCreateCrossProcEdgeAllowsNearbyBlock(t *testing.T) {
	block := types.KernelEvent{
		EventID:     "block-1",
		EventType:   types.EventTypeBlockIO,
		TimestampNs: 1_600,
		DurationNs:  100,
		PID:         44,
	}
	read := types.KernelEvent{
		EventID:     "read-1",
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1_000,
		DurationNs:  500,
		PID:         55,
	}

	edge, ok := tryCreateCrossProcEdge(block, read)
	if !ok {
		t.Fatal("expected nearby block I/O and syscall to create an edge")
	}
	if edge.CauseType != "DISK_TO_SYSCALL" {
		t.Fatalf("expected DISK_TO_SYSCALL, got %q", edge.CauseType)
	}
	if edge.LatencyNs != 100 {
		t.Fatalf("expected latency 100, got %d", edge.LatencyNs)
	}
}

func TestTryCreateCrossProcEdgeKeepsSchedOrdering(t *testing.T) {
	sched := types.KernelEvent{
		EventID:      "sched-1",
		EventType:    types.EventTypeSchedSwitch,
		TimestampNs:  1_000,
		PID:          44,
		CPU:          2,
		SchedNextPID: 55,
	}
	read := types.KernelEvent{
		EventID:     "read-1",
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1_500,
		PID:         55,
		CPU:         2,
	}

	edge, ok := tryCreateCrossProcEdge(sched, read)
	if !ok {
		t.Fatal("expected sched switch before syscall to create an edge")
	}
	if edge.CauseType != "SCHED_DELAY" {
		t.Fatalf("expected SCHED_DELAY, got %q", edge.CauseType)
	}
	if edge.LatencyNs != 500 {
		t.Fatalf("expected latency 500, got %d", edge.LatencyNs)
	}

	sched.TimestampNs = 2_000
	if _, ok := tryCreateCrossProcEdge(sched, read); ok {
		t.Fatal("expected future sched switch to be ignored")
	}
}
