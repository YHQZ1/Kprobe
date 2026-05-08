use aya::maps::RingBuf;
use log::{info, warn};
use probe_common::{TcpEvent, EventType, SchedEvent, SyscallEvent, SyscallEventType, PageFaultEvent};
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;

pub async fn drain_tcp(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const TcpEvent) };
        let event_type = match event.event_type {
            EventType::TcpSend => "TCP_SEND",
            EventType::TcpRecv => "TCP_RECV",
        };
        let payload = serde_json::json!({
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "timestamp_ns": event.timestamp_ns,
            "data_len": event.data_len,
            "event_type": event_type,
        })
        .to_string();
        let key = event.pid.to_string();
        let record = FutureRecord::to("kernel.tcp").payload(&payload).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("published event pid={} type={}", event.pid, event_type),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_sched(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const SchedEvent) };
        let payload = serde_json::json!({
            "cpu": event.cpu,
            "timestamp_ns": event.timestamp_ns,
            "prev_pid": event.prev_pid,
            "next_pid": event.next_pid,
            "prev_state": event.prev_state,
            "event_type": "SCHED_SWITCH",
        })
        .to_string();
        let key = event.prev_pid.to_string();
        let record = FutureRecord::to("kernel.sched").payload(&payload).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("published sched event prev_pid={} next_pid={}", event.prev_pid, event.next_pid),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_syscall(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const SyscallEvent) };
        let event_type = match event.event_type {
            SyscallEventType::SysWrite => "SYS_WRITE",
            SyscallEventType::SysRead => "SYS_READ",
        };
        let payload = serde_json::json!({
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "timestamp_ns": event.timestamp_ns,
            "fd": event.fd,
            "count": event.count,
            "event_type": event_type,
        })
        .to_string();
        let key = event.pid.to_string();
        let record = FutureRecord::to("kernel.syscall").payload(&payload).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("published event pid={} type={} fd={} count={}", event.pid, event_type, event.fd, event.count),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_page_fault(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const PageFaultEvent) };
        let payload = serde_json::json!({
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "timestamp_ns": event.timestamp_ns,
            "address": event.address,
            "flags": event.flags,
            "event_type": "PAGE_FAULT",
        })
        .to_string();
        let key = event.pid.to_string();
        let record = FutureRecord::to("kernel.fault").payload(&payload).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("published page fault event pid={} addr={:#x}", event.pid, event.address),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}