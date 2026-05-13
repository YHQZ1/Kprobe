package stream

import (
	"sync"

	"github.com/YHQZ1/kprobe/api/metrics"
	pb "github.com/YHQZ1/kprobe/api/proto"
)

type Hub struct {
	mu          sync.RWMutex
	subscribers map[chan *pb.KernelEventProto]struct{}
}

func NewHub() *Hub {
	return &Hub{
		subscribers: make(map[chan *pb.KernelEventProto]struct{}),
	}
}

func (h *Hub) Broadcast(event *pb.KernelEventProto) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subscribers {
		select {
		case ch <- event:
			metrics.BroadcastEventsTotal.Inc()
		default:
		}
	}
}

func (h *Hub) Subscribe() chan *pb.KernelEventProto {
	ch := make(chan *pb.KernelEventProto, 256)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()
	metrics.StreamSubscribers.Inc()
	return ch
}

func (h *Hub) Unsubscribe(ch chan *pb.KernelEventProto) {
	h.mu.Lock()
	delete(h.subscribers, ch)
	h.mu.Unlock()
	metrics.StreamSubscribers.Dec()
	close(ch)
}
