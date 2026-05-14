package types

import "time"

type EventType string

const (
	EventTypeTCPSend       EventType = "tcp_send"
	EventTypeTCPRecv       EventType = "tcp_recv"
	EventTypeTCPRetransmit EventType = "tcp_retransmit"
	EventTypeSysRead       EventType = "sys_read"
	EventTypeSysWrite      EventType = "sys_write"
	EventTypeSchedSwitch   EventType = "sched_switch"
	EventTypePageFault     EventType = "page_fault"
	EventTypeBlockIO       EventType = "block_io"
)

func (e EventType) Valid() bool {
	switch e {
	case EventTypeTCPSend,
		EventTypeTCPRecv,
		EventTypeSysRead,
		EventTypeSysWrite,
		EventTypeSchedSwitch,
		EventTypePageFault,
		EventTypeBlockIO:
		return true
	}
	return false
}

type KernelEventPayload struct {
	TCPDataLen  *uint32 `json:"tcp_data_len,omitempty"`
	BlockBytes  *uint32 `json:"block_bytes,omitempty"`
	SyscallFD   *int32  `json:"syscall_fd,omitempty"`
	BlockSector *uint64 `json:"block_sector,omitempty"`
}

type KernelEvent struct {
	EventID       string             `json:"event_id"`
	EventType     EventType          `json:"event_type"`
	TimestampNs   uint64             `json:"timestamp_ns"`
	PID           uint32             `json:"pid"`
	TID           uint32             `json:"tid"`
	CPU           uint32             `json:"cpu"`
	CgroupID      uint64             `json:"cgroup_id"`
	SchedNextPID  uint32             `json:"sched_next_pid,omitempty"`
	TraceID       string             `json:"trace_id"`
	SpanID        string             `json:"span_id"`
	ServiceName   string             `json:"service_name"`
	TransactionID string             `json:"transaction_id"`
	DurationNs    uint64             `json:"duration_ns"`
	ReturnValue   int64              `json:"return_value"`
	Payload       KernelEventPayload `json:"payload"`
	ReceivedAt    time.Time          `json:"received_at"`
}
