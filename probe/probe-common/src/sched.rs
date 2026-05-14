#[cfg(feature = "user")]
use serde::{Deserialize, Serialize};

#[repr(C)]
#[derive(Clone, Copy)]
#[cfg_attr(feature = "user", derive(Serialize, Deserialize))]
pub struct SchedEvent {
    pub cpu: u32,
    pub cgroup_id: u64,
    pub timestamp_ns: u64,
    pub prev_pid: u32,
    pub next_pid: u32,
    pub prev_state: u64,
}