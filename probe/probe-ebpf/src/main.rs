#![no_std]
#![no_main]

mod tcp;
mod sched;
mod syscall;
mod fault;
mod block;

use aya_ebpf::macros::map;
use aya_ebpf::maps::{Array, RingBuf};

#[map]
static EVENTS_TCP: RingBuf = RingBuf::with_byte_size(4 * 1024 * 1024, 0);

#[map]
static EVENTS_SYSCALL: RingBuf = RingBuf::with_byte_size(4 * 1024 * 1024, 0);

#[map]
static EVENTS_SCHED: RingBuf = RingBuf::with_byte_size(4 * 1024 * 1024, 0);

#[map]
static EVENTS_PAGE_FAULT: RingBuf = RingBuf::with_byte_size(4 * 1024 * 1024, 0);

#[map]
static EVENTS_BLOCK: RingBuf = RingBuf::with_byte_size(4 * 1024 * 1024, 0);

#[map]
pub static DROP_COUNTERS: Array<u64> = Array::with_max_entries(5, 0);

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[unsafe(link_section = "license")]
#[unsafe(no_mangle)]
static LICENSE: [u8; 13] = *b"Dual MIT/GPL\0";