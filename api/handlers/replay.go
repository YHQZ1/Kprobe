package handlers

import (
	"context"
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

type ReplayHandler struct {
	pb.UnimplementedReplayServiceServer
	mgr       *session.Manager
	available bool

	mu         sync.RWMutex
	watchChans map[string][]chan *pb.ReplayEventProto
}

func NewReplayHandler(ch *store.Client) *ReplayHandler {
	var mgr *session.Manager
	if ch != nil {
		mgr = session.NewManager(ch)
	}
	return &ReplayHandler{
		mgr:        mgr,
		available:  ch != nil,
		watchChans: make(map[string][]chan *pb.ReplayEventProto),
	}
}

func (h *ReplayHandler) StartReplay(ctx context.Context, req *pb.StartReplayRequest) (*pb.StartReplayResponse, error) {
	if !h.available {
		return nil, status.Error(codes.Unavailable, "clickhouse replay store is not configured")
	}
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

	var sess *session.Session
	onEvent := func(event store.Event, index int) {
		proto := eventToProto(event, index)
		h.fanOut(sess.ID, proto)
	}

	var err error
	sess, err = h.mgr.Create(ctx, cfg, onEvent)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create session: %v", err)
	}

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

func (h *ReplayHandler) Control(ctx context.Context, req *pb.ReplayControlRequest) (*pb.ReplayControlResponse, error) {
	if !h.available {
		return nil, status.Error(codes.Unavailable, "clickhouse replay store is not configured")
	}
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
	case "reset":
		sess.Reset()
	case "seek":
		if err := sess.Seek(int(req.SeekIndex)); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "seek: %v", err)
		}
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown command %q — valid: play, pause, stop, reset, seek", req.Command)
	}

	return &pb.ReplayControlResponse{
		SessionId: sess.ID,
		State:     sess.State().String(),
		Cursor:    int32(sess.Cursor()),
	}, nil
}

func (h *ReplayHandler) Status(ctx context.Context, req *pb.ReplayStatusRequest) (*pb.ReplayStatusResponse, error) {
	if !h.available {
		return nil, status.Error(codes.Unavailable, "clickhouse replay store is not configured")
	}
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

func (h *ReplayHandler) WatchReplay(req *pb.WatchReplayRequest, stream pb.ReplayService_WatchReplayServer) error {
	if !h.available {
		return status.Error(codes.Unavailable, "clickhouse replay store is not configured")
	}
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
				return nil
			}

			state := sess.State().String()
			if err := stream.Send(&pb.WatchReplayResponse{
				Event: event,
				State: state,
			}); err != nil {
				return err
			}

			if state == "complete" || state == "failed" {
				return nil
			}

		case <-stream.Context().Done():
			return nil
		}
	}
}

func (h *ReplayHandler) fanOut(sessionID string, event *pb.ReplayEventProto) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, ch := range h.watchChans[sessionID] {
		select {
		case ch <- event:
		default:
		}
	}
}

func (h *ReplayHandler) addWatcher(sessionID string) chan *pb.ReplayEventProto {
	ch := make(chan *pb.ReplayEventProto, 512)
	h.mu.Lock()
	h.watchChans[sessionID] = append(h.watchChans[sessionID], ch)
	h.mu.Unlock()
	return ch
}

func (h *ReplayHandler) removeWatcher(sessionID string, target chan *pb.ReplayEventProto) {
	h.mu.Lock()
	defer h.mu.Unlock()

	chans := h.watchChans[sessionID]
	for i, ch := range chans {
		if ch == target {
			remaining := append(chans[:i], chans[i+1:]...)
			if len(remaining) == 0 {
				delete(h.watchChans, sessionID)
			} else {
				h.watchChans[sessionID] = remaining
			}
			return
		}
	}
}

func eventToProto(e store.Event, index int) *pb.ReplayEventProto {
	return &pb.ReplayEventProto{
		EventId:       e.EventID,
		TimestampNs:   e.TimestampNs,
		Pid:           e.PID,
		EventType:     string(e.EventType),
		TransactionId: e.TransactionID,
		ServiceName:   e.ServiceName,
		DurationNs:    e.DurationNs,
		ReturnValue:   e.ReturnValue,
		Index:         int32(index),
	}
}
