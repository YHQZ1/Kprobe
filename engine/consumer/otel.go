package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/YHQZ1/kprobe/engine/enrich"
	"github.com/segmentio/kafka-go"
)

type otelSpanMessage struct {
	TraceID     string         `json:"trace_id"`
	SpanID      string         `json:"span_id"`
	ServiceName string         `json:"service_name"`
	StartTimeNs uint64         `json:"start_time_unix_nano"`
	EndTimeNs   uint64         `json:"end_time_unix_nano"`
	Attributes  map[string]any `json:"attributes"`
}

type OTelConsumer struct {
	reader   *kafka.Reader
	enricher *enrich.Enricher
}

func NewOTelConsumer(brokers []string, topic string, groupID string, enricher *enrich.Enricher) *OTelConsumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
	})
	return &OTelConsumer{reader: reader, enricher: enricher}
}

func (c *OTelConsumer) Consume(ctx context.Context) error {
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("otel kafka read error: %v", err)
			continue
		}

		var span otelSpanMessage
		if err := json.Unmarshal(msg.Value, &span); err != nil {
			log.Printf("otel unmarshal error: %v", err)
			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("otel kafka commit error after unmarshal failure: %v", err)
			}
			continue
		}

		if span.TraceID != "" && span.SpanID != "" {
			entry := enrich.SpanEntry{
				TraceID:     span.TraceID,
				SpanID:      span.SpanID,
				ServiceName: span.ServiceName,
				StartTimeNs: span.StartTimeNs,
				EndTimeNs:   span.EndTimeNs,
				PID:         extractPID(span.Attributes),
			}

			if span.Attributes != nil {
				if txID, ok := span.Attributes["transaction.id"].(string); ok {
					entry.TransactionID = txID
				}
			}

			c.enricher.AddSpan(entry)
		}

		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("otel kafka commit error: %v", err)
		}
	}
}

func (c *OTelConsumer) Close() error {
	return c.reader.Close()
}

func extractPID(attrs map[string]any) uint32 {
	if attrs == nil {
		return 0
	}
	switch v := attrs["process.pid"].(type) {
	case float64:
		return uint32(v)
	case int64:
		return uint32(v)
	case uint64:
		return uint32(v)
	}
	return 0
}
