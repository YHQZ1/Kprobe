package enrich

import (
	"testing"

	"github.com/YHQZ1/kprobe/shared/types"
)

func TestPairBlockAcrossDifferentProcessContexts(t *testing.T) {
	sector := uint64(35994320)
	bytes := uint64(4096)

	e := NewEnricher()

	issue := types.KernelEvent{
		EventType:   types.EventTypeBlockIO,
		TimestampNs: 1000,
		PID:         38822,
		TID:         43569,
		CgroupID:    18236,
		Payload: types.KernelEventPayload{
			BlockSector: &sector,
			BlockBytes:  &bytes,
			BlockOp:     "write",
			BlockPhase:  "issue",
		},
	}

	complete := types.KernelEvent{
		EventType:   types.EventTypeBlockIO,
		TimestampNs: 1600,
		PID:         23,
		TID:         23,
		CgroupID:    1,
		Payload: types.KernelEventPayload{
			BlockSector: &sector,
			BlockBytes:  &bytes,
			BlockOp:     "write",
			BlockPhase:  "complete",
		},
	}

	if got := e.Process(issue); got != nil {
		t.Fatalf("issue event should be held until complete, got %#v", got)
	}

	got := e.Process(complete)
	if len(got) != 1 {
		t.Fatalf("expected one paired block event, got %d", len(got))
	}
	if got[0].DurationNs != 600 {
		t.Fatalf("expected duration 600ns, got %d", got[0].DurationNs)
	}
	if got[0].PID != issue.PID {
		t.Fatalf("expected paired event to preserve issue PID %d, got %d", issue.PID, got[0].PID)
	}
	if got[0].Payload.BlockPhase != "issue" {
		t.Fatalf("expected paired event to preserve issue payload, got phase %q", got[0].Payload.BlockPhase)
	}
}

func TestPairBlockPassesThroughSectorlessEvents(t *testing.T) {
	sectorless := ^uint64(0)
	bytes := uint64(0)

	e := NewEnricher()
	event := types.KernelEvent{
		EventType:   types.EventTypeBlockIO,
		TimestampNs: 1000,
		PID:         23,
		TID:         23,
		Payload: types.KernelEventPayload{
			BlockSector: &sectorless,
			BlockBytes:  &bytes,
			BlockOp:     "write",
			BlockPhase:  "complete",
		},
	}

	got := e.Process(event)
	if len(got) != 1 {
		t.Fatalf("expected sectorless block event to pass through, got %d events", len(got))
	}
	if got[0].Payload.BlockSector == nil || *got[0].Payload.BlockSector != sectorless {
		t.Fatalf("expected sectorless event to be preserved")
	}
}

func TestPairSyscallStillUsesThreadIdentity(t *testing.T) {
	bytes := uint64(1024)
	fd := int32(20)

	e := NewEnricher()
	enter := types.KernelEvent{
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1000,
		PID:         6509,
		TID:         6509,
		CgroupID:    9162,
		Payload: types.KernelEventPayload{
			SyscallBytes: &bytes,
			SyscallFD:    &fd,
		},
	}
	exit := types.KernelEvent{
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1250,
		PID:         6509,
		TID:         6509,
		CgroupID:    9162,
		ReturnValue: 1024,
	}

	if got := e.Process(enter); got != nil {
		t.Fatalf("enter event should be held until exit, got %#v", got)
	}
	got := e.Process(exit)
	if len(got) != 1 {
		t.Fatalf("expected one paired syscall event, got %d", len(got))
	}
	if got[0].DurationNs != 250 {
		t.Fatalf("expected duration 250ns, got %d", got[0].DurationNs)
	}
	if got[0].ReturnValue != 1024 {
		t.Fatalf("expected return value 1024, got %d", got[0].ReturnValue)
	}
	if got[0].Payload.SyscallFD == nil || *got[0].Payload.SyscallFD != fd {
		t.Fatalf("expected syscall enter payload to be preserved")
	}
}
