package publisher

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/segmentio/kafka-go"
)

type ProcessedEventPublisher struct {
	writer *kafka.Writer
}

func NewProcessedEventPublisher(brokers []string, topic string) *ProcessedEventPublisher {
	writer := &kafka.Writer{
		Addr:  kafka.TCP(brokers...),
		Topic: topic,
		Async: true,
		Completion: func(_ []kafka.Message, err error) {
			if err != nil {
				log.Printf("processed event publish failed: %v", err)
			}
		},
	}
	return &ProcessedEventPublisher{writer: writer}
}

func (p *ProcessedEventPublisher) Publish(ctx context.Context, event types.KernelEvent) error {
	payload, err := encodeEvent(event)
	if err != nil {
		return err
	}
	return p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(event.EventID),
		Value: payload,
	})
}

func (p *ProcessedEventPublisher) Close() error {
	return p.writer.Close()
}

func encodeEvent(event types.KernelEvent) ([]byte, error) {
	payload, err := json.Marshal(event)
	if err != nil {
		return nil, fmt.Errorf("marshal processed event: %w", err)
	}
	return payload, nil
}
