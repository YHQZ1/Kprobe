#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

#[repr(u32)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub enum TcpEventType {
    Send = 0,
    Recv = 1,
    Retransmit = 2,
}

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct TcpEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub cgroup_id: u64,
    pub timestamp_ns: u64,
    pub event_type: TcpEventType,
    pub data_len: u32,
    pub _pad: u32,
}