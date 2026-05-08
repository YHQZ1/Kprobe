#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

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