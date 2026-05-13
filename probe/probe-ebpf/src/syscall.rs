use aya_ebpf::{
    helpers::{bpf_get_current_pid_tgid, bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::{SyscallDir, SyscallEvent, SyscallOp};
use crate::EVENTS_SYSCALL;

#[tracepoint]
pub fn probe_sys_enter_read(ctx: TracePointContext) -> u32 {
    match try_syscall(ctx, SyscallOp::Read, SyscallDir::Enter) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[tracepoint]
pub fn probe_sys_exit_read(ctx: TracePointContext) -> u32 {
    match try_syscall(ctx, SyscallOp::Read, SyscallDir::Exit) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[tracepoint]
pub fn probe_sys_enter_write(ctx: TracePointContext) -> u32 {
    match try_syscall(ctx, SyscallOp::Write, SyscallDir::Enter) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

#[tracepoint]
pub fn probe_sys_exit_write(ctx: TracePointContext) -> u32 {
    match try_syscall(ctx, SyscallOp::Write, SyscallDir::Exit) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_syscall(ctx: TracePointContext, op: SyscallOp, dir: SyscallDir) -> Result<u32, u32> {
    let pid_tgid = bpf_get_current_pid_tgid();
    let pid = (pid_tgid >> 32) as u32;
    let tid = pid_tgid as u32;
    let timestamp_ns = unsafe { bpf_ktime_get_ns() };
    let cpu = unsafe { bpf_get_smp_processor_id() };

    let fd: u32 = unsafe { ctx.read_at(16).map_err(|_| 0u32)? };
    let bytes: u64 = unsafe { ctx.read_at(32).map_err(|_| 0u32)? };

    let ret: i64 = match dir {
        SyscallDir::Enter => 0,
        SyscallDir::Exit => {
            let raw: i64 = match unsafe { ctx.read_at(48) } {
                Ok(v) => v,
                Err(_) => 0i64,
            };
            raw
        }
    };

    let event = SyscallEvent {
        pid,
        tid,
        cpu,
        timestamp_ns,
        op,
        dir,
        fd,
        bytes,
        ret,
    };

    if let Some(mut entry) = EVENTS_SYSCALL.reserve::<SyscallEvent>(0) {
        unsafe { (*entry.as_mut_ptr()) = event };
        entry.submit(0);
    }

    Ok(0)
}