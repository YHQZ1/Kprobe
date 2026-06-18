use aya::maps::RingBuf;
use log::{info, warn};
use probe_common::{
    BlockEvent, PageFaultEvent, SchedEvent, SyscallDir, SyscallEvent, SyscallOp, TcpEvent,
    TcpEventType,
};
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::collections::VecDeque;
use std::time::Duration;

fn unix_timestamp_ns(monotonic_ns: u64, offset_ns: u64) -> u64 {
    monotonic_ns.saturating_add(offset_ns)
}

fn block_sector_json(sector: u64) -> serde_json::Value {
    if sector == u64::MAX {
        serde_json::Value::Null
    } else {
        serde_json::json!(sector)
    }
}

pub async fn drain_tcp(
    mut buf: RingBuf<aya::maps::MapData>,
    producer: FutureProducer,
    timestamp_offset_ns: u64,
) {
    let mut fallback: VecDeque<(String, String)> = VecDeque::with_capacity(5000);
    loop {
        let Some(item) = buf.next() else {
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        };
        let event = unsafe { *(item.as_ptr() as *const TcpEvent) };
        drop(item);
        let event_type = match event.event_type {
            TcpEventType::Send => "tcp_send",
            TcpEventType::Recv => "tcp_recv",
            TcpEventType::Retransmit => "tcp_retransmit",
        };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": event_type,
            "timestamp_ns": unix_timestamp_ns(event.timestamp_ns, timestamp_offset_ns),
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "cgroup_id": event.cgroup_id,
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

        while let Some((k, p)) = fallback.front() {
            let rec = FutureRecord::to("kernel.raw").payload(p).key(k);
            match producer.send(rec, Duration::from_secs(0)).await {
                Ok(_) => {
                    fallback.pop_front();
                }
                Err(_) => break,
            }
        }

        let record = FutureRecord::to("kernel.raw")
            .payload(&payload_str)
            .key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("tcp event pid={} type={}", event.pid, event_type),
            Err((e, _)) => {
                warn!("kafka publish failed: {e}");
                if fallback.len() < 5000 {
                    fallback.push_back((key, payload_str));
                }
            }
        }
    }
}

pub async fn drain_sched(
    mut buf: RingBuf<aya::maps::MapData>,
    producer: FutureProducer,
    timestamp_offset_ns: u64,
) {
    let mut fallback: VecDeque<(String, String)> = VecDeque::with_capacity(5000);
    loop {
        let Some(item) = buf.next() else {
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        };
        let event = unsafe { *(item.as_ptr() as *const SchedEvent) };
        drop(item);
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": "sched_switch",
            "timestamp_ns": unix_timestamp_ns(event.timestamp_ns, timestamp_offset_ns),
            "pid": event.prev_pid,
            "tid": event.prev_pid,
            "cpu": event.cpu,
            "cgroup_id": event.cgroup_id,
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

        while let Some((k, p)) = fallback.front() {
            let rec = FutureRecord::to("kernel.raw").payload(p).key(k);
            match producer.send(rec, Duration::from_secs(0)).await {
                Ok(_) => {
                    fallback.pop_front();
                }
                Err(_) => break,
            }
        }

        let record = FutureRecord::to("kernel.raw")
            .payload(&payload_str)
            .key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!(
                "sched event prev_pid={} next_pid={}",
                event.prev_pid, event.next_pid
            ),
            Err((e, _)) => {
                warn!("kafka publish failed: {e}");
                if fallback.len() < 5000 {
                    fallback.push_back((key, payload_str));
                }
            }
        }
    }
}

pub async fn drain_syscall(
    mut buf: RingBuf<aya::maps::MapData>,
    producer: FutureProducer,
    timestamp_offset_ns: u64,
) {
    let mut fallback: VecDeque<(String, String)> = VecDeque::with_capacity(5000);
    loop {
        let Some(item) = buf.next() else {
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        };
        let event = unsafe { *(item.as_ptr() as *const SyscallEvent) };
        drop(item);
        let event_type = match event.op {
            SyscallOp::Read => "sys_read",
            SyscallOp::Write => "sys_write",
        };
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": event_type,
            "timestamp_ns": unix_timestamp_ns(event.timestamp_ns, timestamp_offset_ns),
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "cgroup_id": event.cgroup_id,
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

        while let Some((k, p)) = fallback.front() {
            let rec = FutureRecord::to("kernel.raw").payload(p).key(k);
            match producer.send(rec, Duration::from_secs(0)).await {
                Ok(_) => {
                    fallback.pop_front();
                }
                Err(_) => break,
            }
        }

        let record = FutureRecord::to("kernel.raw")
            .payload(&payload_str)
            .key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!(
                "syscall event pid={} op={:?} dir={:?}",
                event.pid, event.op, event.dir
            ),
            Err((e, _)) => {
                warn!("kafka publish failed: {e}");
                if fallback.len() < 5000 {
                    fallback.push_back((key, payload_str));
                }
            }
        }
    }
}

pub async fn drain_page_fault(
    mut buf: RingBuf<aya::maps::MapData>,
    producer: FutureProducer,
    timestamp_offset_ns: u64,
) {
    let mut fallback: VecDeque<(String, String)> = VecDeque::with_capacity(5000);
    loop {
        let Some(item) = buf.next() else {
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        };
        let event = unsafe { *(item.as_ptr() as *const PageFaultEvent) };
        drop(item);
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": "page_fault",
            "timestamp_ns": unix_timestamp_ns(event.timestamp_ns, timestamp_offset_ns),
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "cgroup_id": event.cgroup_id,
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

        while let Some((k, p)) = fallback.front() {
            let rec = FutureRecord::to("kernel.raw").payload(p).key(k);
            match producer.send(rec, Duration::from_secs(0)).await {
                Ok(_) => {
                    fallback.pop_front();
                }
                Err(_) => break,
            }
        }

        let record = FutureRecord::to("kernel.raw")
            .payload(&payload_str)
            .key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!("page fault pid={} addr={:#x}", event.pid, event.address),
            Err((e, _)) => {
                warn!("kafka publish failed: {e}");
                if fallback.len() < 5000 {
                    fallback.push_back((key, payload_str));
                }
            }
        }
    }
}

pub async fn drain_block(
    mut buf: RingBuf<aya::maps::MapData>,
    producer: FutureProducer,
    timestamp_offset_ns: u64,
) {
    let mut fallback: VecDeque<(String, String)> = VecDeque::with_capacity(5000);
    loop {
        let Some(item) = buf.next() else {
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        };
        let event = unsafe { *(item.as_ptr() as *const BlockEvent) };
        drop(item);
        let payload = serde_json::json!({
            "event_id": "",
            "event_type": "block_io",
            "timestamp_ns": unix_timestamp_ns(event.timestamp_ns, timestamp_offset_ns),
            "pid": event.pid,
            "tid": event.tid,
            "cpu": event.cpu,
            "cgroup_id": event.cgroup_id,
            "trace_id": "",
            "span_id": "",
            "service_name": "",
            "transaction_id": "",
            "duration_ns": 0,
            "return_value": 0,
            "payload": {
                "block_sector": block_sector_json(event.sector),
                "block_bytes": event.bytes,
                "block_op": if event.sector == u64::MAX { "flush" } else if event.op == 0 { "read" } else { "write" },
                "block_phase": match event.dir {
                    probe_common::BlockDir::Issue => "issue",
                    probe_common::BlockDir::Complete => "complete",
                },
            }
        });
        let key = event.pid.to_string();
        let payload_str = payload.to_string();

        while let Some((k, p)) = fallback.front() {
            let rec = FutureRecord::to("kernel.raw").payload(p).key(k);
            match producer.send(rec, Duration::from_secs(0)).await {
                Ok(_) => {
                    fallback.pop_front();
                }
                Err(_) => break,
            }
        }

        let record = FutureRecord::to("kernel.raw")
            .payload(&payload_str)
            .key(&key);
        match producer.send(record, Duration::from_secs(0)).await {
            Ok(_) => info!(
                "block event pid={} phase={} op={} sector={} bytes={}",
                event.pid,
                match event.dir {
                    probe_common::BlockDir::Issue => "issue",
                    probe_common::BlockDir::Complete => "complete",
                },
                if event.op == 0 { "read" } else { "write" },
                event.sector,
                event.bytes
            ),
            Err((e, _)) => {
                warn!("kafka publish failed: {e}");
                if fallback.len() < 5000 {
                    fallback.push_back((key, payload_str));
                }
            }
        }
    }
}
