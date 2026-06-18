#![no_std]

pub mod block;
pub mod fault;
pub mod sched;
pub mod syscall;
pub mod tcp;

pub use block::{BlockDir, BlockEvent};
pub use fault::PageFaultEvent;
pub use sched::SchedEvent;
pub use syscall::{SyscallDir, SyscallEvent, SyscallOp};
pub use tcp::{TcpEvent, TcpEventType};

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

#[cfg(test)]
mod tests {
    use core::mem::{align_of, size_of};

    use super::{
        BlockDir, BlockEvent, PageFaultEvent, SchedEvent, SyscallDir, SyscallEvent, SyscallOp,
        TcpEvent, TcpEventType,
    };

    #[test]
    fn event_struct_layouts_are_stable() {
        assert_eq!(size_of::<TcpEvent>(), 48);
        assert_eq!(align_of::<TcpEvent>(), 8);

        assert_eq!(size_of::<SyscallEvent>(), 64);
        assert_eq!(align_of::<SyscallEvent>(), 8);

        assert_eq!(size_of::<SchedEvent>(), 40);
        assert_eq!(align_of::<SchedEvent>(), 8);

        assert_eq!(size_of::<PageFaultEvent>(), 48);
        assert_eq!(align_of::<PageFaultEvent>(), 8);

        assert_eq!(size_of::<BlockEvent>(), 64);
        assert_eq!(align_of::<BlockEvent>(), 8);
    }

    #[test]
    fn event_enum_discriminants_are_stable() {
        assert_eq!(TcpEventType::Send as u32, 0);
        assert_eq!(TcpEventType::Recv as u32, 1);
        assert_eq!(TcpEventType::Retransmit as u32, 2);

        assert_eq!(SyscallOp::Read as u32, 0);
        assert_eq!(SyscallOp::Write as u32, 1);

        assert_eq!(SyscallDir::Enter as u32, 0);
        assert_eq!(SyscallDir::Exit as u32, 1);

        assert_eq!(BlockDir::Issue as u32, 0);
        assert_eq!(BlockDir::Complete as u32, 1);
    }
}
