package config

import "time"

// SessionConfig controls the behaviour of a single replay session.
// All fields are optional — zero values mean "replay exactly as recorded".
type SessionConfig struct {
	// TransactionID is the financial transaction to replay.
	// Required — every session is anchored to one transaction.
	TransactionID string

	// TimeoutOverride replaces every timeout threshold in the recorded syscall
	// stream with this value. Set to 0 to use the original recorded timeouts.
	TimeoutOverride time.Duration

	// LatencyMultiplier scales all inter-syscall delays by this factor.
	// 1.0 = exact replay. 0.5 = twice as fast. 2.0 = twice as slow.
	// 0 is treated as 1.0 (no scaling).
	LatencyMultiplier float64

	// ExtraLatencyNs adds a fixed nanosecond delay to every syscall return.
	// Simulates network degradation or storage slowdown.
	ExtraLatencyNs uint64

	// InjectFailureAt, if non-empty, causes the named event type to return
	// a synthetic ETIMEDOUT error instead of the recorded response.
	// Valid values: "tcp_send", "tcp_recv", "sys_write", "sys_read"
	InjectFailureAt string

	// MaxEvents caps how many events are replayed. 0 = no cap (full replay).
	MaxEvents int

	// SpeedFactor controls wall-clock playback speed relative to real time.
	// 1.0 = real time. 10.0 = 10x faster. 0 is treated as 1.0.
	SpeedFactor float64
}

// Validate returns an error string if the config is unusable, empty string if valid.
func (c *SessionConfig) Validate() string {
	if c.TransactionID == "" {
		return "TransactionID is required"
	}
	if c.LatencyMultiplier < 0 {
		return "LatencyMultiplier must be >= 0"
	}
	if c.SpeedFactor < 0 {
		return "SpeedFactor must be >= 0"
	}
	return ""
}

// EffectiveLatencyMultiplier returns 1.0 when the field is zero.
func (c *SessionConfig) EffectiveLatencyMultiplier() float64 {
	if c.LatencyMultiplier == 0 {
		return 1.0
	}
	return c.LatencyMultiplier
}

// EffectiveSpeedFactor returns 1.0 when the field is zero.
func (c *SessionConfig) EffectiveSpeedFactor() float64 {
	if c.SpeedFactor == 0 {
		return 1.0
	}
	return c.SpeedFactor
}
