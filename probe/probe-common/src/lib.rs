#![no_std]

#[repr(C)]
#[derive(Clone, Copy)]
pub struct TcpEvent {
    pub pid: u32,
    pub tid: u32,
    pub cpu: u32,
    pub timestamp_ns: u64,
    pub data_len: u32,
    pub event_type: EventType,
}

#[repr(u32)]
#[derive(Clone, Copy)]
pub enum EventType {
    TcpSend = 0,
    TcpRecv = 1,
}

#[cfg(feature = "user")]
unsafe impl aya::Pod for TcpEvent {}