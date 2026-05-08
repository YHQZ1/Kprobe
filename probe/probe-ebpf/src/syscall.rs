use aya_ebpf::{
    helpers::{bpf_get_current_pid_tgid, bpf_ktime_get_ns, bpf_get_smp_processor_id},
    macros::kprobe,
    programs::ProbeContext,
};
use probe_common::{SyscallEvent, SyscallEventType};
use crate::{EVENTS_WRITE, EVENTS_READ};

#[kprobe]
pub fn probe_sys_write(ctx: ProbeContext) -> u32 {
    match try_sys_write(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[kprobe]
pub fn probe_sys_read(ctx: ProbeContext) -> u32 {
    match try_sys_read(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_sys_write(ctx: ProbeContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let fd: u32 = ctx.arg(0).unwrap_or(0);
    let count: u64 = ctx.arg(2).unwrap_or(0);

    let event = SyscallEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        fd,
        count,
        event_type: SyscallEventType::SysWrite,
    };

    if let Some(mut entry) = EVENTS_WRITE.reserve::<SyscallEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
}

fn try_sys_read(ctx: ProbeContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let fd: u32 = ctx.arg(0).unwrap_or(0);
    let count: u64 = ctx.arg(2).unwrap_or(0);

    let event = SyscallEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        fd,
        count,
        event_type: SyscallEventType::SysRead,
    };

    if let Some(mut entry) = EVENTS_READ.reserve::<SyscallEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
}