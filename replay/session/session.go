package session

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/YHQZ1/kprobe/replay/config"
	"github.com/YHQZ1/kprobe/replay/store"
)

// State represents the current lifecycle state of a replay session.
type State uint8

const (
	StateLoading  State = iota // fetching events from ClickHouse
	StateReady                 // events loaded, not yet started
	StatePlaying               // playback in progress
	StatePaused                // playback paused by user
	StateComplete              // all events replayed
	StateFailed                // unrecoverable error
)

func (s State) String() string {
	switch s {
	case StateLoading:
		return "loading"
	case StateReady:
		return "ready"
	case StatePlaying:
		return "playing"
	case StatePaused:
		return "paused"
	case StateComplete:
		return "complete"
	case StateFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// EventCallback is called by the session for each event as it is replayed.
// The callback receives the event and its index in the full event list.
type EventCallback func(event store.ReplayEvent, index int)

// Session manages the full lifecycle of a single deterministic replay.
// It is safe for concurrent use — Play, Pause, Seek, and Stop may be called
// from different goroutines.
type Session struct {
	ID     string
	Config *config.SessionConfig

	mu       sync.Mutex
	state    State
	events   []store.ReplayEvent
	cursor   int // index of the next event to be replayed
	cancelFn context.CancelFunc

	onEvent EventCallback
}

// Manager creates and tracks active replay sessions.
type Manager struct {
	store    *store.Client
	mu       sync.Mutex
	sessions map[string]*Session
}

// NewManager creates a Manager backed by the given ClickHouse store client.
func NewManager(s *store.Client) *Manager {
	return &Manager{
		store:    s,
		sessions: make(map[string]*Session),
	}
}

// Create loads events for the given config from ClickHouse and registers a new
// session. The session starts in StateReady — call Play to begin playback.
func (m *Manager) Create(ctx context.Context, cfg *config.SessionConfig, onEvent EventCallback) (*Session, error) {
	if msg := cfg.Validate(); msg != "" {
		return nil, fmt.Errorf("session: invalid config: %s", msg)
	}

	events, err := m.store.EventsByTransaction(ctx, cfg.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("session: load events: %w", err)
	}

	if len(events) == 0 {
		return nil, fmt.Errorf("session: no events found for transaction %s", cfg.TransactionID)
	}

	// Apply MaxEvents cap if set.
	if cfg.MaxEvents > 0 && len(events) > cfg.MaxEvents {
		events = events[:cfg.MaxEvents]
	}

	id := fmt.Sprintf("replay-%s-%d", cfg.TransactionID, time.Now().UnixNano())

	s := &Session{
		ID:      id,
		Config:  cfg,
		state:   StateReady,
		events:  events,
		onEvent: onEvent,
	}

	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	return s, nil
}

// Get returns a session by ID, or nil if not found.
func (m *Manager) Get(id string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[id]
}

// Remove removes a session from the manager and stops it if still running.
func (m *Manager) Remove(id string) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()

	if ok {
		s.Stop()
	}
}

// --- Session methods ---

// State returns the current session state.
func (s *Session) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

// Cursor returns the index of the next event to be replayed.
func (s *Session) Cursor() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cursor
}

// Len returns the total number of events in this session.
func (s *Session) Len() int {
	return len(s.events)
}

// Events returns a read-only slice of all loaded events.
func (s *Session) Events() []store.ReplayEvent {
	return s.events
}

// Play begins or resumes playback. Calling Play on a session that is already
// playing is a no-op.
func (s *Session) Play(ctx context.Context) error {
	s.mu.Lock()

	switch s.state {
	case StatePlaying:
		s.mu.Unlock()
		return nil // already playing
	case StateComplete, StateFailed:
		s.mu.Unlock()
		return fmt.Errorf("session: cannot play from state %s", s.state)
	}

	ctx, cancel := context.WithCancel(ctx)
	s.cancelFn = cancel
	s.state = StatePlaying
	s.mu.Unlock()

	go s.runPlayback(ctx)
	return nil
}

// Pause suspends playback. The cursor position is preserved.
func (s *Session) Pause() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == StatePlaying && s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
		s.state = StatePaused
	}
}

// Stop halts playback and resets the cursor to zero.
func (s *Session) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
	}
	s.state = StateReady
	s.cursor = 0
}

// Seek moves the cursor to the given index. Playback must be paused or ready.
func (s *Session) Seek(index int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == StatePlaying {
		return fmt.Errorf("session: pause before seeking")
	}
	if index < 0 || index >= len(s.events) {
		return fmt.Errorf("session: seek index %d out of range [0, %d)", index, len(s.events))
	}

	s.cursor = index
	return nil
}

// runPlayback drives event delivery in a background goroutine.
// It respects the SessionConfig speed factor and latency multiplier.
func (s *Session) runPlayback(ctx context.Context) {
	speedFactor := s.Config.EffectiveSpeedFactor()
	latencyMult := s.Config.EffectiveLatencyMultiplier()

	for {
		s.mu.Lock()
		if s.cursor >= len(s.events) {
			s.state = StateComplete
			s.mu.Unlock()
			return
		}

		event := s.events[s.cursor]
		index := s.cursor
		s.cursor++
		s.mu.Unlock()

		// Deliver the event to the caller.
		if s.onEvent != nil {
			s.onEvent(event, index)
		}

		// Determine inter-event delay from the recorded duration.
		if index+1 < len(s.events) {
			nextTs := s.events[index+1].TimestampNs
			currentTs := event.TimestampNs
			var gapNs uint64
			if nextTs > currentTs {
				gapNs = nextTs - currentTs
			}

			// Apply latency multiplier, extra latency, and speed factor.
			scaledNs := float64(gapNs)*latencyMult + float64(s.Config.ExtraLatencyNs)
			delayNs := int64(scaledNs / speedFactor)

			if delayNs > 0 {
				timer := time.NewTimer(time.Duration(delayNs))
				select {
				case <-ctx.Done():
					timer.Stop()
					return
				case <-timer.C:
				}
			}
		}

		// Check for cancellation between events.
		select {
		case <-ctx.Done():
			return
		default:
		}
	}
}

// ReplaceEvents swaps the loaded event slice with a modified one.
// Used by the replay handler to apply injector transformations before
// playback starts. Must be called before Play.
func (s *Session) ReplaceEvents(events []store.ReplayEvent) {
s.mu.Lock()
defer s.mu.Unlock()
s.events = events
}
