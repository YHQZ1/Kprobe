package consumer

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/YHQZ1/kprobe/engine/metrics"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/segmentio/kafka-go"
)

type Consumer struct {
	reader    *kafka.Reader
	dlqWriter *kafka.Writer
	commitCh  chan kafka.Message
	dlqCh     chan kafka.Message
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

	return &Consumer{
		reader:    reader,
		dlqWriter: dlqWriter,
		commitCh:  make(chan kafka.Message, 10000),
		dlqCh:     make(chan kafka.Message, 10000),
	}
}

func (c *Consumer) Consume(ctx context.Context, handler Handler) error {
	go c.commitWorker(ctx)
	go c.dlqWorker(ctx)

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
			c.sendDLQAsync(msg, "unmarshal_error")
			c.commitCh <- msg
			continue
		}

		if !event.EventType.Valid() {
			log.Printf("unknown event_type %q, routing to dlq", event.EventType)
			c.sendDLQAsync(msg, "unknown_event_type")
			c.commitCh <- msg
			continue
		}

		metrics.EventsConsumed.WithLabelValues(string(event.EventType)).Inc()

		handler(event)

		c.commitCh <- msg
	}
}

func (c *Consumer) commitWorker(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	var batch []kafka.Message

	for {
		select {
		case msg := <-c.commitCh:
			batch = append(batch, msg)
			if len(batch) >= 1000 {
				if err := c.reader.CommitMessages(ctx, batch...); err != nil {
					log.Printf("kafka batch commit error: %v", err)
				}
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				if err := c.reader.CommitMessages(ctx, batch...); err != nil {
					log.Printf("kafka batch commit error: %v", err)
				}
				batch = batch[:0]
			}
		case <-ctx.Done():
			if len(batch) > 0 {
				_ = c.reader.CommitMessages(context.Background(), batch...)
			}
			return
		}
	}
}

func (c *Consumer) sendDLQAsync(msg kafka.Message, reason string) {
	metrics.DLQTotal.WithLabelValues(reason).Inc()
	msg.Headers = append(msg.Headers, kafka.Header{Key: "dlq_reason", Value: []byte(reason)})
	select {
	case c.dlqCh <- msg:
	default:
		log.Printf("dlq channel full, dropping invalid message")
	}
}

func (c *Consumer) dlqWorker(ctx context.Context) {
	for {
		select {
		case msg := <-c.dlqCh:
			err := c.dlqWriter.WriteMessages(ctx, kafka.Message{
				Value:   msg.Value,
				Headers: msg.Headers,
			})
			if err != nil {
				log.Printf("dlq write error: %v", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (c *Consumer) Close() error {
	if err := c.dlqWriter.Close(); err != nil {
		log.Printf("dlq writer close error: %v", err)
	}
	return c.reader.Close()
}
