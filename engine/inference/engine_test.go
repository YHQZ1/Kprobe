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
