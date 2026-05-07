package types

// KernelEvent represents a raw event captured from the kernel via eBPF.
type KernelEvent struct {
TimestampNs uint64
PID         uint32
TID         uint32
CPU         uint32
EventType   EventType
}

// EventType identifies the kernel hook that produced the event.
type EventType uint8

const (
EventTypeTCPSend     EventType = iota
EventTypeTCPRecv
EventTypeSyscallRead
EventTypeSyscallWrite
EventTypeSchedSwitch
EventTypePageFault
)
