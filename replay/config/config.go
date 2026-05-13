package config

import "time"

type SessionConfig struct {
	TransactionID     string
	TimeoutOverride   time.Duration
	LatencyMultiplier float64
	ExtraLatencyNs    uint64
	InjectFailureAt   string
	MaxEvents         int
	SpeedFactor       float64
}

func (c *SessionConfig) Validate() string {
	if c.TransactionID == "" {
		return "transaction_id is required"
	}
	if c.LatencyMultiplier < 0 {
		return "latency_multiplier must be >= 0"
	}
	if c.SpeedFactor < 0 {
		return "speed_factor must be >= 0"
	}
	return ""
}

func (c *SessionConfig) EffectiveLatencyMultiplier() float64 {
	if c.LatencyMultiplier == 0 {
		return 1.0
	}
	return c.LatencyMultiplier
}

func (c *SessionConfig) EffectiveSpeedFactor() float64 {
	if c.SpeedFactor == 0 {
		return 1.0
	}
	return c.SpeedFactor
}
