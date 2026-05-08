#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

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