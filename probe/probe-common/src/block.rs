#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

#[repr(u32)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub enum BlockDir {
    Issue = 0,
    Complete = 1,
}

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct BlockEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub cgroup_id: u64,
    pub timestamp_ns: u64,
    pub dir: BlockDir,
    pub sector: u64,
    pub bytes: u64,
    pub op: u32,
    pub _pad: u32,
}
