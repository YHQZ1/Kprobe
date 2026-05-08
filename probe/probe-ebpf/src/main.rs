#![no_std]
#![no_main]

mod tcp;
mod sched;
mod syscall;
mod fault;

use aya_ebpf::macros::map;
use aya_ebpf::maps::RingBuf;

#[map]
static EVENTS_SEND: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_RECV: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_SCHED: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_WRITE: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_READ: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[map]
static EVENTS_PAGE_FAULT: RingBuf = RingBuf::with_byte_size(256 * 1024, 0);

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[unsafe(link_section = "license")]
#[unsafe(no_mangle)]
static LICENSE: [u8; 13] = *b"Dual MIT/GPL\0";