#![no_std]

pub mod tcp;
pub mod sched;
pub mod syscall;
pub mod fault;
pub mod block;

pub use tcp::TcpEvent;
pub use sched::SchedEvent;
pub use syscall::{SyscallEvent, SyscallDir};
pub use fault::PageFaultEvent;
pub use block::BlockEvent;

#[cfg(feature = "user")]
unsafe impl aya::Pod for TcpEvent {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for SchedEvent {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallEvent {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for PageFaultEvent {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for BlockEvent {}