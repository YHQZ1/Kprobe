use aya::maps::RingBuf;
use log::{info, warn};
use probe_common::{
    PageFaultEvent, SchedEvent, SyscallDir, SyscallOp, TcpEventType, BlockEvent,
    SyscallEvent, TcpEvent,
};
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;

pub async fn drain_tcp(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const TcpEvent) };
        let event_type = match event.event_type {
            TcpEventType::Send => "tcp_send",
            TcpEventType::Recv => "tcp_recv",
            TcpEventType::Retransmit => "tcp_retransmit",
        };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": event_type,
            "timestamp_ns": event.timestamp_ns,
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "trace_id": "",
            "span_id": "",
            "service_name": "",
            "transaction_id": "",
            "duration_ns": 0,
            "return_value": 0,
            "payload": {
                "tcp_data_len": event.data_len,
            }
        });
        let key = event.pid.to_string();
        let payload_str = payload.to_string();
        let record = FutureRecord::to("kernel.raw").payload(&payload_str).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("tcp event pid={} type={}", event.pid, event_type),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_sched(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const SchedEvent) };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": "sched_switch",
            "timestamp_ns": event.timestamp_ns,
            "pid": event.prev_pid,
            "tid": event.prev_pid,
            "cpu": event.cpu,
            "cgroup_id": 0u64,
            "sched_next_pid": event.next_pid,
            "trace_id": "",
            "span_id": "",
            "service_name": "",
            "transaction_id": "",
            "duration_ns": 0,
            "return_value": 0,
            "payload": {}
        });
        let key = event.prev_pid.to_string();
        let payload_str = payload.to_string();
        let record = FutureRecord::to("kernel.raw").payload(&payload_str).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("sched event prev_pid={} next_pid={}", event.prev_pid, event.next_pid),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_syscall(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const SyscallEvent) };
        let event_type = match event.op {
            SyscallOp::Read => "sys_read",
            SyscallOp::Write => "sys_write",
        };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": event_type,
            "timestamp_ns": event.timestamp_ns,
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "trace_id": "",
            "span_id": "",
            "service_name": "",
            "transaction_id": "",
            "duration_ns": 0,
            "return_value": if event.dir == SyscallDir::Exit { event.ret } else { 0 },
            "payload": {
                "syscall_fd": event.fd,
                "syscall_bytes": event.bytes,
            }
        });
        let key = event.pid.to_string();
        let payload_str = payload.to_string();
        let record = FutureRecord::to("kernel.raw").payload(&payload_str).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!(
                "syscall event pid={} op={:?} dir={:?}",
                event.pid, event.op, event.dir
            ),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_page_fault(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const PageFaultEvent) };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": "page_fault",
            "timestamp_ns": event.timestamp_ns,
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "trace_id": "",
            "span_id": "",
            "service_name": "",
            "transaction_id": "",
            "duration_ns": 0,
            "return_value": 0,
            "payload": {
                "fault_address": event.address,
                "fault_flags": event.flags,
            }
        });
        let key = event.pid.to_string();
        let payload_str = payload.to_string();
        let record = FutureRecord::to("kernel.raw").payload(&payload_str).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("page fault pid={} addr={:#x}", event.pid, event.address),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}

pub async fn drain_block(buf: &mut RingBuf<aya::maps::MapData>, producer: &FutureProducer) {
    while let Some(item) = buf.next() {
        let event = unsafe { &*(item.as_ptr() as *const BlockEvent) };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": "block_io",
            "timestamp_ns": event.timestamp_ns,
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "trace_id": "",
            "span_id": "",
            "service_name": "",
            "transaction_id": "",
            "duration_ns": 0,
            "return_value": 0,
            "payload": {
                "block_sector": event.sector,
                "block_bytes": event.bytes,
                "block_op": if event.op == 0 { "read" } else { "write" },
            }
        });
        let key = event.pid.to_string();
        let payload_str = payload.to_string();
        let record = FutureRecord::to("kernel.raw").payload(&payload_str).key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("block event pid={} sector={}", event.pid, event.sector),
            Err((e, _)) => warn!("kafka publish failed: {e}"),
        }
    }
}