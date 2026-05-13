use aya_ebpf::{
    helpers::{bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::SchedEvent;
use crate::EVENTS_SCHED;

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

    let prev_pid: u32 = unsafe { ctx.read_at(24).map_err(|_| 0u32)? };
    let prev_state: u64 = unsafe { ctx.read_at(32).map_err(|_| 0u32)? };
    let next_pid: u32 = unsafe { ctx.read_at(56).map_err(|_| 0u32)? };

    let event = SchedEvent {
        cpu,
        timestamp_ns,
        prev_pid,
        next_pid,
        prev_state,
    };

    if let Some(mut entry) = EVENTS_SCHED.reserve::<SchedEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
}