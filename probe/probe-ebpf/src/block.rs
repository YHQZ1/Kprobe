use aya_ebpf::{
    helpers::{bpf_get_current_cgroup_id, bpf_get_current_pid_tgid, bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::{BlockDir, BlockEvent};
use crate::{DROP_COUNTERS, EVENTS_BLOCK};

#[tracepoint]
pub fn probe_block_rq_issue(ctx: TracePointContext) -> u32 {
    match try_block(ctx, BlockDir::Issue) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[tracepoint]
pub fn probe_block_rq_complete(ctx: TracePointContext) -> u32 {
    match try_block(ctx, BlockDir::Complete) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_block(ctx: TracePointContext, dir: BlockDir) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let cgroup_id = unsafe { bpf_get_current_cgroup_id() };

    let sector: u64 = match unsafe { ctx.read_at(8) } {
        Ok(v) => v,
        Err(_) => 0u64,
    };
    let bytes: u64 = match unsafe { ctx.read_at(16) } {
        Ok(v) => v,
        Err(_) => 0u64,
    };
    let op: u32 = unsafe { ctx.read_at(24).map_err(|_| 0u32)? };

    let event = BlockEvent {
        pid,
        tid,
        cpu,
        cgroup_id,
        timestamp_ns,
        dir,
        sector,
        bytes,
        op,
        _pad: 0,
    };

    if let Some(mut entry) = EVENTS_BLOCK.reserve::<BlockEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    } else if let Some(counter) = DROP_COUNTERS.get_ptr_mut(4) {
        unsafe { *counter += 1 };
    }

    Ok(0)
}