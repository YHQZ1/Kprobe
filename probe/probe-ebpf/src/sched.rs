use crate::{DROP_COUNTERS, EVENTS_SCHED};
use aya_ebpf::{
    helpers::{bpf_get_current_cgroup_id, bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::SchedEvent;

#[repr(C)]
struct SchedSwitchArgs {
    _pad: [u8; 8],
    prev_comm: [u8; 16],
    prev_pid: i32,
    prev_prio: i32,
    prev_state: i64,
    next_comm: [u8; 16],
    next_pid: i32,
    next_prio: i32,
}

#[tracepoint]
pub fn probe_sched_switch(ctx: TracePointContext) -> u32 {
    match try_sched_switch(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_sched_switch(ctx: TracePointContext) -> Result<u32, u32> {
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let cgroup_id = unsafe { bpf_get_current_cgroup_id() };

    let args: SchedSwitchArgs = unsafe { ctx.read_at(0).map_err(|_| 0u32)? };

    let event = SchedEvent {
        cpu,
        cgroup_id,
        timestamp_ns,
        prev_pid: args.prev_pid as u32,
        next_pid: args.next_pid as u32,
        prev_state: args.prev_state as u64,
    };

    if let Some(mut entry) = EVENTS_SCHED.reserve::<SchedEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    } else if let Some(counter) = DROP_COUNTERS.get_ptr_mut(2) {
        unsafe { *counter += 1 };
    }
    Ok(0)
}
