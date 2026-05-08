use aya::{
    maps::RingBuf,
    programs::KProbe,
    Ebpf,
};
use aya_log::EbpfLogger;
use log::{info, warn, debug};
use probe_common::{TcpEvent, EventType};
use tokio::signal;
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    let rlim = libc::rlimit {
        rlim_cur: libc::RLIM_INFINITY,
        rlim_max: libc::RLIM_INFINITY,
    };
    let ret = unsafe { libc::setrlimit(libc::RLIMIT_MEMLOCK, &rlim) };
    if ret != 0 {
        debug!("remove limit on locked memory failed, ret is: {ret}");
    }

    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", "localhost:9092")
        .set("message.timeout.ms", "5000")
        .create()?;

    info!("Kafka producer connected to localhost:9092");

    let mut ebpf = Ebpf::load(aya::include_bytes_aligned!(concat!(
        env!("OUT_DIR"),
        "/probe"
    )))?;

    if let Err(e) = EbpfLogger::init(&mut ebpf) {
        warn!("failed to initialize eBPF logger: {e}");
    }

    let send_prog: &mut KProbe = ebpf.program_mut("probe_tcp_send").unwrap().try_into()?;
    send_prog.load()?;
    send_prog.attach("tcp_sendmsg", 0)?;

    let recv_prog: &mut KProbe = ebpf.program_mut("probe_tcp_recv").unwrap().try_into()?;
    recv_prog.load()?;
    recv_prog.attach("tcp_recvmsg", 0)?;

    info!("kprobes attached to tcp_sendmsg and tcp_recvmsg");

    let send_map = ebpf.take_map("EVENTS_SEND").unwrap();
    let mut send_buf = RingBuf::try_from(send_map)?;

    let recv_map = ebpf.take_map("EVENTS_RECV").unwrap();
    let mut recv_buf = RingBuf::try_from(recv_map)?;

    let ctrl_c = signal::ctrl_c();
    tokio::pin!(ctrl_c);

    loop {
        tokio::select! {
            _ = &mut ctrl_c => {
                info!("Exiting...");
                break;
            }
            else => {
                for (buf, label) in [
                    (&mut send_buf as &mut RingBuf<_>, "TCP_SEND"),
                    (&mut recv_buf as &mut RingBuf<_>, "TCP_RECV"),
                ] {
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
                        }).to_string();

                        let key = event.pid.to_string();
                        let record = FutureRecord::to("raw_kernel_events")
                            .payload(&payload)
                            .key(&key);

                        match producer.send(record, Duration::from_secs(0)).await {
                            Ok(_) => info!("published event pid={} type={} label={}", event.pid, event_type, label),
                            Err((e, _)) => warn!("kafka publish failed: {e}"),
                        }
                    }
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }
    }

    Ok(())
}