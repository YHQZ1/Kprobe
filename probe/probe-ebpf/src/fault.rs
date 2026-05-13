use aya_ebpf::{
    helpers::{bpf_get_current_pid_tgid, bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::PageFaultEvent;
use crate::EVENTS_PAGE_FAULT;

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

    let address: u64 = unsafe { ctx.read_at(8).map_err(|_| 0u32)? };
    let flags: u64 = unsafe { ctx.read_at(16).map_err(|_| 0u32)? };

    let event = PageFaultEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        address,
        flags,
    };

    if let Some(mut entry) = EVENTS_PAGE_FAULT.reserve::<PageFaultEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
}