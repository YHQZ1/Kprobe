package injector

import (
	"fmt"
	"syscall"

	"github.com/YHQZ1/kprobe/replay/config"
	"github.com/YHQZ1/kprobe/replay/store"
	"github.com/YHQZ1/kprobe/shared/types"
)

const ETIMEDOUT = -int64(syscall.ETIMEDOUT)

type Injector struct {
	cfg *config.SessionConfig
}

func New(cfg *config.SessionConfig) *Injector {
	return &Injector{cfg: cfg}
}

func (inj *Injector) Apply(events []store.Event) ([]store.Event, error) {
	if len(events) == 0 {
		return events, nil
	}

	failureTarget, err := inj.parseFailureTarget()
	if err != nil {
		return nil, err
	}

	out := make([]store.Event, len(events))
	copy(out, events)

	for i := range out {
		inj.applyTimeout(&out[i])
		inj.applyExtraLatency(&out[i])
		inj.applyFailure(&out[i], failureTarget)
	}

	return out, nil
}

func (inj *Injector) applyTimeout(e *store.Event) {
	if inj.cfg.TimeoutOverride == 0 {
		return
	}
	e.DurationNs = uint64(inj.cfg.TimeoutOverride.Nanoseconds())
}

func (inj *Injector) applyExtraLatency(e *store.Event) {
	if inj.cfg.ExtraLatencyNs == 0 {
		return
	}
	e.DurationNs += inj.cfg.ExtraLatencyNs
}

func (inj *Injector) applyFailure(e *store.Event, target types.EventType) {
	if inj.cfg.InjectFailureAt == "" {
		return
	}
	if e.EventType == target {
		e.ReturnValue = ETIMEDOUT
	}
}

func (inj *Injector) parseFailureTarget() (types.EventType, error) {
	switch inj.cfg.InjectFailureAt {
	case "":
		return "", nil
	case "tcp_send":
		return types.EventTypeTCPSend, nil
	case "tcp_recv":
		return types.EventTypeTCPRecv, nil
	case "sys_write":
		return types.EventTypeSysWrite, nil
	case "sys_read":
		return types.EventTypeSysRead, nil
	default:
		return "", fmt.Errorf("unknown failure target %q — valid: tcp_send, tcp_recv, sys_write, sys_read", inj.cfg.InjectFailureAt)
	}
}

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
