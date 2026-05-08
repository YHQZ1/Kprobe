#![no_std]

pub mod tcp;
pub mod sched;
pub mod syscall;
pub mod fault;

pub use tcp::{TcpEvent, EventType};
pub use sched::SchedEvent;
pub use syscall::{SyscallEvent, SyscallEventType};
pub use fault::PageFaultEvent;

#[cfg(feature = "user")]
unsafe impl aya::Pod for TcpEvent {}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SchedEvent {}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallEvent {}

#[cfg(feature = "user")]
unsafe impl aya::Pod for PageFaultEvent {}