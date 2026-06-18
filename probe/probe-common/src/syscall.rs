#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub enum SyscallOp {
    Read = 0,
    Write = 1,
}

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub enum SyscallDir {
    Enter = 0,
    Exit = 1,
}

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct SyscallEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub cgroup_id: u64,
    pub timestamp_ns: u64,
    pub op: SyscallOp,
    pub dir: SyscallDir,
    pub fd: u32,
    pub bytes: u64,
    pub ret: i64,
}
