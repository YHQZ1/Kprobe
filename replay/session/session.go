package session

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/YHQZ1/kprobe/replay/config"
	"github.com/YHQZ1/kprobe/replay/store"
)

type State uint8

const (
	StateLoading State = iota
	StateReady
	StatePlaying
	StatePaused
	StateComplete
	StateFailed
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

type EventCallback func(event store.Event, index int)

type Session struct {
	ID     string
	Config *config.SessionConfig

	mu       sync.Mutex
	state    State
	events   []store.Event
	cursor   int
	cancelFn context.CancelFunc

	onEvent EventCallback
}

type Manager struct {
	store    *store.Client
	mu       sync.Mutex
	sessions map[string]*Session
}

func NewManager(s *store.Client) *Manager {
	return &Manager{
		store:    s,
		sessions: make(map[string]*Session),
	}
}

func (m *Manager) Create(ctx context.Context, cfg *config.SessionConfig, onEvent EventCallback) (*Session, error) {
	if msg := cfg.Validate(); msg != "" {
		return nil, fmt.Errorf("invalid config: %s", msg)
	}

	events, err := m.store.EventsByTransaction(ctx, cfg.TransactionID)
	if err != nil {
		return nil, fmt.Errorf("load events: %w", err)
	}

	if len(events) == 0 {
		return nil, fmt.Errorf("no events found for transaction %s", cfg.TransactionID)
	}

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

func (m *Manager) Get(id string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[id]
}

func (m *Manager) Remove(id string) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()

	if ok {
		s.Stop()
	}
}

func (s *Session) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

func (s *Session) Cursor() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cursor
}

func (s *Session) Len() int {
	return len(s.events)
}

func (s *Session) Events() []store.Event {
	return s.events
}

func (s *Session) Play(ctx context.Context) error {
	s.mu.Lock()

	switch s.state {
	case StatePlaying:
		s.mu.Unlock()
		return nil
	case StateComplete, StateFailed:
		s.mu.Unlock()
		return fmt.Errorf("cannot play from state %s", s.state)
	}

	ctx, cancel := context.WithCancel(ctx)
	s.cancelFn = cancel
	s.state = StatePlaying
	s.mu.Unlock()

	go s.runPlayback(ctx)
	return nil
}

func (s *Session) Pause() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == StatePlaying && s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
		s.state = StatePaused
	}
}

func (s *Session) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
	}
	s.state = StateReady
}

func (s *Session) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == StatePlaying {
		return
	}
	s.cursor = 0
}

func (s *Session) Seek(index int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == StatePlaying {
		return fmt.Errorf("pause before seeking")
	}
	if index < 0 || index >= len(s.events) {
		return fmt.Errorf("seek index %d out of range [0, %d)", index, len(s.events))
	}

	s.cursor = index
	return nil
}

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

		if s.onEvent != nil {
			s.onEvent(event, index)
		}

		if index+1 < len(s.events) {
			nextTs := s.events[index+1].TimestampNs
			currentTs := event.TimestampNs
			var gapNs uint64
			if nextTs > currentTs {
				gapNs = nextTs - currentTs
			}

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

		select {
		case <-ctx.Done():
			return
		default:
		}
	}
}

func (s *Session) ReplaceEvents(events []store.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = events
}
