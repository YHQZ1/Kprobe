use crate::{DROP_COUNTERS, EVENTS_PAGE_FAULT};
use aya_ebpf::{
    helpers::{
        bpf_get_current_cgroup_id, bpf_get_current_pid_tgid, bpf_get_smp_processor_id,
        bpf_ktime_get_ns,
    },
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::PageFaultEvent;

#[repr(C)]
struct PageFaultArgs {
    _pad: [u8; 8],
    address: u64,
    flags: u64,
}

#[tracepoint]
pub fn probe_mm_page_fault(ctx: TracePointContext) -> u32 {
    match try_mm_page_fault(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_mm_page_fault(ctx: TracePointContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let cgroup_id = unsafe { bpf_get_current_cgroup_id() };

    let args: PageFaultArgs = unsafe { ctx.read_at(0).map_err(|_| 0u32)? };

    let event = PageFaultEvent {
        pid,
        tid,
        cpu,
        cgroup_id,
        timestamp_ns,
        address: args.address,
        flags: args.flags,
    };

    if let Some(mut entry) = EVENTS_PAGE_FAULT.reserve::<PageFaultEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    } else if let Some(counter) = DROP_COUNTERS.get_ptr_mut(3) {
        unsafe { *counter += 1 };
    }
    Ok(0)
}
