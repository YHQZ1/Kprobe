#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct PageFaultEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub timestamp_ns: u64,
    pub address: u64,
    pub flags: u64,
}