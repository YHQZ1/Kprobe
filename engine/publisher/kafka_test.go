package publisher

import (
	"encoding/json"
	"testing"

	"github.com/YHQZ1/kprobe/shared/types"
)

func TestEncodeEventPreservesProcessedFields(t *testing.T) {
	event := types.KernelEvent{
		EventID:     "event-1",
		EventType:   types.EventTypeSysRead,
		TimestampNs: 1000,
		PID:         42,
		TID:         43,
		DurationNs:  250,
	}

	payload, err := encodeEvent(event)
	if err != nil {
		t.Fatalf("encode event: %v", err)
	}

	var decoded types.KernelEvent
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode event: %v", err)
	}
	if decoded.EventID != event.EventID || decoded.DurationNs != event.DurationNs {
		t.Fatalf("processed fields not preserved: %+v", decoded)
	}
}
