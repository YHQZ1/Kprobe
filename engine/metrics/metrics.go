package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	EventsConsumed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "kprobe_events_consumed_total",
		Help: "Total kernel events consumed from Kafka by event type.",
	}, []string{"event_type"})

	EventsDropped = promauto.NewCounter(prometheus.CounterOpts{
		Name: "kprobe_events_dropped_total",
		Help: "Total kernel events dropped due to full inference input channel.",
	})

	DLQTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "kprobe_kafka_dlq_total",
		Help: "Total messages routed to the dead-letter queue by reason.",
	}, []string{"reason"})

	BatchFlushSize = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "kprobe_batch_flush_size",
		Help:    "Number of events per ClickHouse batch flush.",
		Buckets: []float64{10, 50, 100, 500, 1000, 2500, 5000},
	})

	BatchFlushDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "kprobe_batch_flush_duration_seconds",
		Help:    "Duration of ClickHouse batch flush operations.",
		Buckets: prometheus.DefBuckets,
	})

	InferenceWindowSize = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "kprobe_inference_window_size",
		Help:    "Number of events per causal inference window tick.",
		Buckets: []float64{1, 5, 10, 50, 100, 500, 1000, 5000},
	})

	Neo4jWriteDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "kprobe_neo4j_write_duration_seconds",
		Help:    "Duration of Neo4j write operations.",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation"})
)
