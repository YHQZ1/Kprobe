package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/YHQZ1/kprobe/engine/metrics"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/segmentio/kafka-go"
)

type Consumer struct {
	reader    *kafka.Reader
	dlqWriter *kafka.Writer
}

type Handler func(event types.KernelEvent)

func NewConsumer(brokers []string, topic string, groupID string) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
	})

	dlqWriter := &kafka.Writer{
		Addr:     kafka.TCP(brokers...),
		Topic:    "kernel.dlq",
		Balancer: &kafka.LeastBytes{},
	}

	return &Consumer{reader: reader, dlqWriter: dlqWriter}
}

func (c *Consumer) Consume(ctx context.Context, handler Handler) error {
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("kafka read error: %v", err)
			continue
		}

		var event types.KernelEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("unmarshal error, routing to dlq: %v", err)
			c.sendDLQ(ctx, msg.Value, "unmarshal_error")
			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("kafka commit error: %v", err)
			}
			continue
		}

		if !event.EventType.Valid() {
			log.Printf("unknown event_type %q, routing to dlq", event.EventType)
			c.sendDLQ(ctx, msg.Value, "unknown_event_type")
			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("kafka commit error: %v", err)
			}
			continue
		}

		metrics.EventsConsumed.WithLabelValues(string(event.EventType)).Inc()
		handler(event)

		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("kafka commit error: %v", err)
		}
	}
}

func (c *Consumer) sendDLQ(ctx context.Context, value []byte, reason string) {
	metrics.DLQTotal.WithLabelValues(reason).Inc()
	err := c.dlqWriter.WriteMessages(ctx, kafka.Message{
		Value: value,
		Headers: []kafka.Header{
			{Key: "dlq_reason", Value: []byte(reason)},
		},
	})
	if err != nil {
		log.Printf("dlq write error (reason=%s): %v", reason, err)
	}
}

func (c *Consumer) Close() error {
	if err := c.dlqWriter.Close(); err != nil {
		log.Printf("dlq writer close error: %v", err)
	}
	return c.reader.Close()
}
