package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/segmentio/kafka-go"
)

type EnrichedEvent struct {
	TimestampNs   uint64 `json:"timestamp_ns"`
	PID           uint32 `json:"pid"`
	TID           uint32 `json:"tid"`
	CPU           uint32 `json:"cpu"`
	SourceTopic   string `json:"source_topic"`
	TraceID       string `json:"trace_id"`
	SpanID        string `json:"span_id"`
	ServiceName   string `json:"service_name"`
	TransactionID string `json:"transaction_id"`
	IngestedAt    string `json:"ingested_at"`

	// TCP fields
	TCPDataLen   *uint32 `json:"tcp_data_len,omitempty"`
	TCPEventType *string `json:"tcp_event_type,omitempty"`

	// Sched fields
	SchedPrevPID   *uint32 `json:"sched_prev_pid,omitempty"`
	SchedNextPID   *uint32 `json:"sched_next_pid,omitempty"`
	SchedPrevState *uint64 `json:"sched_prev_state,omitempty"`

	// Syscall fields
	SyscallBytes *uint64 `json:"syscall_bytes,omitempty"`
	SyscallFD    *uint32 `json:"syscall_fd,omitempty"`
	SyscallType  *string `json:"syscall_type,omitempty"`

	// Fault fields
	FaultAddress   *uint64 `json:"fault_address,omitempty"`
	FaultErrorCode *uint64 `json:"fault_error_code,omitempty"`
}

type KafkaConsumer struct {
	reader *kafka.Reader
}

func NewKafkaConsumer(brokers []string, topic string, groupID string) *KafkaConsumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
	})
	return &KafkaConsumer{reader: reader}
}

func (c *KafkaConsumer) Consume(ctx context.Context, handler func(EnrichedEvent)) error {
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("kafka read error: %v", err)
			continue
		}

		var event EnrichedEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("failed to unmarshal event: %v", err)
			continue
		}

		handler(event)
	}
}

func (c *KafkaConsumer) Close() error {
	return c.reader.Close()
}
