package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	GRPCRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "kprobe_grpc_requests_total",
		Help: "Total gRPC requests by method and status code.",
	}, []string{"method", "code"})

	StreamSubscribers = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "kprobe_stream_subscribers",
		Help: "Current number of active StreamEvents subscribers.",
	})

	BroadcastEventsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "kprobe_broadcast_events_total",
		Help: "Total events broadcast to StreamEvents subscribers.",
	})
)
