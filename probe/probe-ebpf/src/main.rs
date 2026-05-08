#![no_std]
#![no_main]

use aya_ebpf::{
    helpers::{bpf_get_current_pid_tgid, bpf_ktime_get_ns, bpf_get_smp_processor_id},
    macros::{kprobe, map},
    maps::RingBuf,
    programs::ProbeContext,
};
use probe_common::{TcpEvent, EventType};

#[map]
static EVENTS: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[kprobe]
pub fn probe(_ctx: ProbeContext) -> u32 {
    match try_probe(_ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_probe(ctx: ProbeContext) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };

    // tcp_sendmsg signature: tcp_sendmsg(struct sock *sk, struct msghdr *msg, size_t size)
    // arg2 is the size of data being sent
    let data_len: u32 = ctx.arg(2).unwrap_or(0);

    let event = TcpEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        data_len,
        event_type: EventType::TcpSend,
    };

    if let Some(mut entry) = EVENTS.reserve::<TcpEvent>(0) {
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