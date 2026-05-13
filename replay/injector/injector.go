package injector

import (
	"fmt"
	"syscall"

	"github.com/YHQZ1/kprobe/replay/config"
	"github.com/YHQZ1/kprobe/replay/store"
	"github.com/YHQZ1/kprobe/shared/types"
)

// ETIMEDOUT is the Linux errno for a timed-out operation.
// Injected as the return value when InjectFailureAt matches an event type.
const ETIMEDOUT = -int64(syscall.ETIMEDOUT)

// Injector transforms a recorded event stream before it is served to the
// ptrace layer. It applies three classes of modification:
//
//  1. Timeout override — replaces DurationNs on every event so the process
//     experiences a different timeout threshold than the original recording.
//  2. Latency injection — adds ExtraLatencyNs to every inter-event gap,
//     simulating a slower network or storage subsystem.
//  3. Failure injection — replaces the ReturnValue of matching event types
//     with ETIMEDOUT, causing the sandboxed process to observe a failure
//     at that point in the syscall stream.
//
// Injector is stateless and pure — it takes the original event slice and
// returns a new modified slice, leaving the originals unchanged.
type Injector struct {
	cfg *config.SessionConfig
}

// New creates an Injector for the given session config.
func New(cfg *config.SessionConfig) *Injector {
	return &Injector{cfg: cfg}
}

// Apply returns a new event slice with all configured modifications applied.
// The original slice is never mutated.
func (inj *Injector) Apply(events []store.ReplayEvent) ([]store.ReplayEvent, error) {
	if len(events) == 0 {
		return events, nil
	}

	failureTarget, err := inj.parseFailureTarget()
	if err != nil {
		return nil, err
	}

	out := make([]store.ReplayEvent, len(events))
	copy(out, events)

	for i := range out {
		inj.applyTimeout(&out[i])
		inj.applyExtraLatency(&out[i])
		inj.applyFailure(&out[i], failureTarget)
	}

	return out, nil
}

// applyTimeout replaces DurationNs with the configured override, if set.
// This makes the replayed process observe the new timeout threshold rather
// than the original one from the recording.
func (inj *Injector) applyTimeout(e *store.ReplayEvent) {
	if inj.cfg.TimeoutOverride == 0 {
		return
	}
	e.DurationNs = uint64(inj.cfg.TimeoutOverride.Nanoseconds())
}

// applyExtraLatency adds ExtraLatencyNs to the event's DurationNs, simulating
// a slower subsystem. This affects the inter-event timing in the session
// playback loop — the session reads DurationNs to compute gaps.
func (inj *Injector) applyExtraLatency(e *store.ReplayEvent) {
	if inj.cfg.ExtraLatencyNs == 0 {
		return
	}
	e.DurationNs += inj.cfg.ExtraLatencyNs
}

// applyFailure replaces ReturnValue with ETIMEDOUT if this event matches
// the configured failure injection target. The ptrace layer will write this
// value into the process's return register on the syscall-exit stop.
func (inj *Injector) applyFailure(e *store.ReplayEvent, target types.EventType) {
	if inj.cfg.InjectFailureAt == "" {
		return
	}
	if e.EventType == target {
		e.ReturnValue = ETIMEDOUT
	}
}

// parseFailureTarget converts the string InjectFailureAt to a typed EventType.
// Returns an error if the value is unrecognised.
func (inj *Injector) parseFailureTarget() (types.EventType, error) {
	switch inj.cfg.InjectFailureAt {
	case "":
		return 0, nil
	case "tcp_send":
		return types.EventTypeTCPSend, nil
	case "tcp_recv":
		return types.EventTypeTCPRecv, nil
	case "sys_write":
		return types.EventTypeSyscallWrite, nil
	case "sys_read":
		return types.EventTypeSyscallRead, nil
	default:
		return 0, fmt.Errorf("injector: unknown failure target %q — valid values: tcp_send, tcp_recv, sys_write, sys_read", inj.cfg.InjectFailureAt)
	}
}

// Summary returns a human-readable description of the active injections,
// useful for logging at session start.
func (inj *Injector) Summary() string {
	if inj.cfg.TimeoutOverride == 0 &&
		inj.cfg.ExtraLatencyNs == 0 &&
		inj.cfg.InjectFailureAt == "" {
		return "no injections — exact replay"
	}

	s := "injections: "
	if inj.cfg.TimeoutOverride != 0 {
		s += fmt.Sprintf("timeout_override=%s ", inj.cfg.TimeoutOverride)
	}
	if inj.cfg.ExtraLatencyNs != 0 {
		s += fmt.Sprintf("extra_latency=%dns ", inj.cfg.ExtraLatencyNs)
	}
	if inj.cfg.InjectFailureAt != "" {
		s += fmt.Sprintf("inject_failure_at=%s(ETIMEDOUT) ", inj.cfg.InjectFailureAt)
	}
	return s
}
