#![no_std]
#![no_main]

use aya_ebpf::{
    helpers::{bpf_get_current_pid_tgid, bpf_ktime_get_ns, bpf_get_smp_processor_id},
    macros::{kprobe, map, tracepoint},
    maps::RingBuf,
    programs::{ProbeContext, TracePointContext},
};
use probe_common::{TcpEvent, EventType, SchedEvent, SyscallEvent, SyscallEventType, PageFaultEvent};

#[map]
static EVENTS_SEND: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_RECV: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_SCHED: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_WRITE: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_PAGE_FAULT: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[kprobe]
pub fn probe_tcp_send(ctx: ProbeContext) -> u32 {
    match try_tcp_send(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[kprobe]
pub fn probe_tcp_recv(ctx: ProbeContext) -> u32 {
    match try_tcp_recv(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[tracepoint]
pub fn probe_sched_switch(ctx: TracePointContext) -> u32 {
    match try_sched_switch(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[kprobe]
pub fn probe_sys_write(ctx: ProbeContext) -> u32 {
    match try_sys_write(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[tracepoint]
pub fn probe_mm_page_fault(ctx: TracePointContext) -> u32 {
    match try_mm_page_fault(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_tcp_send(ctx: ProbeContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let data_len: u32 = ctx.arg(2).unwrap_or(0);

    let event = TcpEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        data_len,
        event_type: EventType::TcpSend,
    };

    if let Some(mut entry) = EVENTS_SEND.reserve::<TcpEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
}

fn try_tcp_recv(ctx: ProbeContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let data_len: u32 = ctx.arg(2).unwrap_or(0);

    let event = TcpEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        data_len,
        event_type: EventType::TcpRecv,
    };

    if let Some(mut entry) = EVENTS_RECV.reserve::<TcpEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
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

fn try_mm_page_fault(ctx: TracePointContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };

    // exceptions/page_fault_user and exceptions/page_fault_kernel format:
    // offset 8:  address (u64) — the faulting virtual address
    // offset 16: error_code (u64) — fault flags
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

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[unsafe(link_section = "license")]
#[unsafe(no_mangle)]
static LICENSE: [u8; 13] = *b"Dual MIT/GPL\0";