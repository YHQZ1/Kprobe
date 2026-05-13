package handlers

import (
	"context"
	"fmt"
	"sync"
	"time"

	pb "github.com/YHQZ1/kprobe/api/proto"
	"github.com/YHQZ1/kprobe/replay/config"
	"github.com/YHQZ1/kprobe/replay/injector"
	"github.com/YHQZ1/kprobe/replay/session"
	"github.com/YHQZ1/kprobe/replay/store"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ReplayHandler implements pb.ReplayServiceServer.
// It owns the session.Manager and coordinates between the store,
// injector, and session lifecycle for every replay request.
type ReplayHandler struct {
	pb.UnimplementedReplayServiceServer
	mgr *session.Manager

	// watchChans holds per-session event channels for WatchReplay streams.
	// Key: session ID. Multiple watchers on the same session are supported.
	mu         sync.RWMutex
	watchChans map[string][]chan *pb.ReplayEventProto
}

// NewReplayHandler creates a ReplayHandler backed by a ClickHouse store client.
func NewReplayHandler(ch *store.Client) *ReplayHandler {
	return &ReplayHandler{
		mgr:        session.NewManager(ch),
		watchChans: make(map[string][]chan *pb.ReplayEventProto),
	}
}

// StartReplay loads events from ClickHouse for the given transaction,
// applies any configured injections, and registers a new session.
// Returns the session ID and event count. Call Control("play") to begin.
func (h *ReplayHandler) StartReplay(ctx context.Context, req *pb.StartReplayRequest) (*pb.StartReplayResponse, error) {
	if req.TransactionId == "" {
		return nil, status.Error(codes.InvalidArgument, "transaction_id is required")
	}

	cfg := &config.SessionConfig{
		TransactionID:     req.TransactionId,
		LatencyMultiplier: req.LatencyMultiplier,
		ExtraLatencyNs:    req.ExtraLatencyNs,
		InjectFailureAt:   req.InjectFailureAt,
		SpeedFactor:       req.SpeedFactor,
	}

	if req.TimeoutOverrideNs > 0 {
		cfg.TimeoutOverride = time.Duration(req.TimeoutOverrideNs)
	}

	if msg := cfg.Validate(); msg != "" {
		return nil, status.Errorf(codes.InvalidArgument, "%s", msg)
	}

	inj := injector.New(cfg)

	// onEvent is called by the session for each replayed event.
	// It fans out to all active WatchReplay streams for this session.
	var sess *session.Session
	onEvent := func(event store.ReplayEvent, index int) {
		proto := replayEventToProto(event, index)
		h.fanOut(sess.ID, proto)
	}

	var err error
	sess, err = h.mgr.Create(ctx, cfg, onEvent)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create session: %v", err)
	}

	// Apply injections to the loaded events. The session holds the original
	// events; we replace them with the modified slice before playback starts.
	modified, err := inj.Apply(sess.Events())
	if err != nil {
		h.mgr.Remove(sess.ID)
		return nil, status.Errorf(codes.InvalidArgument, "injection: %v", err)
	}
	sess.ReplaceEvents(modified)

	return &pb.StartReplayResponse{
		SessionId:  sess.ID,
		EventCount: int32(sess.Len()),
		Injections: inj.Summary(),
	}, nil
}

// Control sends a play/pause/stop/seek command to a running session.
func (h *ReplayHandler) Control(ctx context.Context, req *pb.ReplayControlRequest) (*pb.ReplayControlResponse, error) {
	if req.SessionId == "" {
		return nil, status.Error(codes.InvalidArgument, "session_id is required")
	}

	sess := h.mgr.Get(req.SessionId)
	if sess == nil {
		return nil, status.Errorf(codes.NotFound, "session %s not found", req.SessionId)
	}

	switch req.Command {
	case "play":
		if err := sess.Play(ctx); err != nil {
			return nil, status.Errorf(codes.FailedPrecondition, "play: %v", err)
		}
	case "pause":
		sess.Pause()
	case "stop":
		sess.Stop()
	case "seek":
		if err := sess.Seek(int(req.SeekIndex)); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "seek: %v", err)
		}
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown command %q — valid: play, pause, stop, seek", req.Command)
	}

	return &pb.ReplayControlResponse{
		SessionId: sess.ID,
		State:     sess.State().String(),
		Cursor:    int32(sess.Cursor()),
	}, nil
}

// Status returns the current state and cursor position of a session.
func (h *ReplayHandler) Status(ctx context.Context, req *pb.ReplayStatusRequest) (*pb.ReplayStatusResponse, error) {
	if req.SessionId == "" {
		return nil, status.Error(codes.InvalidArgument, "session_id is required")
	}

	sess := h.mgr.Get(req.SessionId)
	if sess == nil {
		return nil, status.Errorf(codes.NotFound, "session %s not found", req.SessionId)
	}

	inj := injector.New(sess.Config)

	return &pb.ReplayStatusResponse{
		SessionId:  sess.ID,
		State:      sess.State().String(),
		Cursor:     int32(sess.Cursor()),
		EventCount: int32(sess.Len()),
		Injections: inj.Summary(),
	}, nil
}

// WatchReplay streams replay events to the client as the session plays back.
// The stream ends when the session reaches the "complete" or "failed" state,
// or when the client disconnects.
func (h *ReplayHandler) WatchReplay(req *pb.WatchReplayRequest, stream pb.ReplayService_WatchReplayServer) error {
	if req.SessionId == "" {
		return status.Error(codes.InvalidArgument, "session_id is required")
	}

	sess := h.mgr.Get(req.SessionId)
	if sess == nil {
		return status.Errorf(codes.NotFound, "session %s not found", req.SessionId)
	}

	ch := h.addWatcher(req.SessionId)
	defer h.removeWatcher(req.SessionId, ch)

	for {
		select {
		case event, ok := <-ch:
			if !ok {
				// Channel was closed — session ended.
				return nil
			}

			state := sess.State().String()
			if err := stream.Send(&pb.WatchReplayResponse{
				Event: event,
				State: state,
			}); err != nil {
				return err
			}

			// End the stream once the session is done.
			if state == "complete" || state == "failed" {
				return nil
			}

		case <-stream.Context().Done():
			return nil
		}
	}
}

// fanOut delivers a replay event to all active WatchReplay streams for a session.
func (h *ReplayHandler) fanOut(sessionID string, event *pb.ReplayEventProto) {
	h.mu.RLock()
	chans := h.watchChans[sessionID]
	h.mu.RUnlock()

	for _, ch := range chans {
		select {
		case ch <- event:
		default:
			// Slow consumer — drop rather than block the session playback.
		}
	}
}

// addWatcher registers a new WatchReplay subscriber for a session.
func (h *ReplayHandler) addWatcher(sessionID string) chan *pb.ReplayEventProto {
	ch := make(chan *pb.ReplayEventProto, 512)
	h.mu.Lock()
	h.watchChans[sessionID] = append(h.watchChans[sessionID], ch)
	h.mu.Unlock()
	return ch
}

// removeWatcher deregisters a WatchReplay subscriber and closes its channel.
func (h *ReplayHandler) removeWatcher(sessionID string, target chan *pb.ReplayEventProto) {
	h.mu.Lock()
	defer h.mu.Unlock()

	chans := h.watchChans[sessionID]
	for i, ch := range chans {
		if ch == target {
			h.watchChans[sessionID] = append(chans[:i], chans[i+1:]...)
			close(ch)
			return
		}
	}

	if len(h.watchChans[sessionID]) == 0 {
		delete(h.watchChans, sessionID)
	}
}

// replayEventToProto converts a store.ReplayEvent to the protobuf wire type.
func replayEventToProto(e store.ReplayEvent, index int) *pb.ReplayEventProto {
	return &pb.ReplayEventProto{
		EventId:       e.EventID,
		TimestampNs:   e.TimestampNs,
		Pid:           e.PID,
		EventType:     fmt.Sprintf("%d", e.EventType),
		TransactionId: e.TransactionID,
		ServiceName:   e.ServiceName,
		DurationNs:    e.DurationNs,
		ReturnValue:   e.ReturnValue,
		Index:         int32(index),
	}
}
