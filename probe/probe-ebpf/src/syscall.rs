use aya_ebpf::{
    helpers::{bpf_get_current_cgroup_id, bpf_get_current_pid_tgid, bpf_get_smp_processor_id, bpf_ktime_get_ns},
    macros::tracepoint,
    programs::TracePointContext,
};
use probe_common::{SyscallDir, SyscallEvent, SyscallOp};
use crate::{DROP_COUNTERS, EVENTS_SYSCALL};

#[repr(C)]
struct SysEnterArgs {
    _pad: [u8; 8],
    syscall_nr: i32,
    _pad2: [u8; 4],
    args: [u64; 6],
}

#[repr(C)]
struct SysExitArgs {
    _pad: [u8; 8],
    syscall_nr: i32,
    _pad2: [u8; 4],
    ret: i64,
}

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
    let cgroup_id = unsafe { bpf_get_current_cgroup_id() };

    let (fd, bytes, ret) = match dir {
        SyscallDir::Enter => {
            let args: SysEnterArgs = unsafe { ctx.read_at(0).map_err(|_| 0u32)? };
            (args.args[0] as u32, args.args[2] as u64, 0)
        }
        SyscallDir::Exit => {
            let args: SysExitArgs = unsafe { ctx.read_at(0).map_err(|_| 0u32)? };
            (0, 0, args.ret)
        }
    };

    let event = SyscallEvent {
        pid,
        tid,
        cpu,
        cgroup_id,
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
    } else if let Some(counter) = DROP_COUNTERS.get_ptr_mut(1) {
        unsafe { *counter += 1 };
    }
    Ok(0)
}