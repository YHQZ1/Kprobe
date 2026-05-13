package consumer

import (
	"context"
	"encoding/json"
	"log"

	pb "github.com/YHQZ1/kprobe/api/proto"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/segmentio/kafka-go"
)

type Hub interface {
	Broadcast(event *pb.KernelEventProto)
}

type BroadcastConsumer struct {
	reader *kafka.Reader
	hub    Hub
}

func NewBroadcastConsumer(brokers []string, topic string, groupID string, hub Hub) *BroadcastConsumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
	})
	return &BroadcastConsumer{reader: reader, hub: hub}
}

func (c *BroadcastConsumer) Consume(ctx context.Context) error {
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("broadcast consumer read error: %v", err)
			continue
		}

		var event types.KernelEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("broadcast consumer unmarshal error: %v", err)
			continue
		}

		c.hub.Broadcast(&pb.KernelEventProto{
			EventId:       event.EventID,
			TimestampNs:   event.TimestampNs,
			Pid:           event.PID,
			EventType:     string(event.EventType),
			TransactionId: event.TransactionID,
			ServiceName:   event.ServiceName,
			TraceId:       event.TraceID,
		})
	}
}

func (c *BroadcastConsumer) Close() error {
	return c.reader.Close()
}
