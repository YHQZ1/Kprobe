#![no_std]

#[cfg(feature = "user")]
use serde::{Serialize, Deserialize};

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct TcpEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub timestamp_ns: u64,
    pub data_len: u32,
    pub event_type: EventType,
}

#[repr(u32)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub enum EventType {
    TcpSend = 0,
    TcpRecv = 1,
}

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct SchedEvent {
    pub cpu: u32,
    pub timestamp_ns: u64,
    pub prev_pid: u32,
    pub next_pid: u32,
    pub prev_state: u64,
}

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct SyscallEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub timestamp_ns: u64,
    pub fd: u32,
    pub count: u64,
    pub event_type: SyscallEventType,
}

#[repr(u32)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub enum SyscallEventType {
    SysWrite = 0,
    SysRead = 1,
}

#[cfg(feature = "user")]
unsafe impl aya::Pod for TcpEvent {}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SchedEvent {}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallEvent {}