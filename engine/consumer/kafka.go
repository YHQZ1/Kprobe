package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/segmentio/kafka-go"
)

type Consumer struct {
	reader *kafka.Reader
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
	return &Consumer{reader: reader}
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
			log.Printf("failed to unmarshal event: %v", err)
			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("kafka commit error after unmarshal failure: %v", err)
			}
			continue
		}

		handler(event)

		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("kafka commit error: %v", err)
		}
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}
