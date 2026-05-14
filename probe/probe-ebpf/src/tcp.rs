use aya_ebpf::{
    helpers::{bpf_get_current_cgroup_id, bpf_get_current_pid_tgid, bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::kprobe,
    programs::ProbeContext,
};
use probe_common::{TcpEvent, TcpEventType};
use crate::{DROP_COUNTERS, EVENTS_TCP};

#[kprobe]
pub fn probe_tcp_send(ctx: ProbeContext) -> u32 {
    match try_tcp(ctx, TcpEventType::Send) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[kprobe]
pub fn probe_tcp_recv(ctx: ProbeContext) -> u32 {
    match try_tcp(ctx, TcpEventType::Recv) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[kprobe]
pub fn probe_tcp_retransmit(ctx: ProbeContext) -> u32 {
    match try_tcp(ctx, TcpEventType::Retransmit) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_tcp(ctx: ProbeContext, event_type: TcpEventType) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };
    let cgroup_id = unsafe { bpf_get_current_cgroup_id() };
    let data_len: u32 = ctx.arg(2).unwrap_or(0);

    let event = TcpEvent {
        pid,
        tid,
        cpu,
        cgroup_id,
        timestamp_ns,
        event_type,
        data_len,
        _pad: 0,
    };

    if let Some(mut entry) = EVENTS_TCP.reserve::<TcpEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    } else if let Some(counter) = DROP_COUNTERS.get_ptr_mut(0) {
        unsafe { *counter += 1 };
    }

    Ok(0)
}