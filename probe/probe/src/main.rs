use aya::{
    maps::RingBuf,
    programs::{KProbe, TracePoint},
    Ebpf,
};
use aya_log::EbpfLogger;
use log::{info, warn};
use rdkafka::config::ClientConfig;
use rdkafka::producer::FutureProducer;
use std::env;
use tokio::signal;

mod publisher;

fn kafka_brokers() -> String {
    env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    let rlim = libc::rlimit {
        rlim_cur: libc::RLIM_INFINITY,
        rlim_max: libc::RLIM_INFINITY,
    };
    unsafe {
        libc::setrlimit(libc::RLIMIT_MEMLOCK, &rlim);
    }

    let brokers = kafka_brokers();
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("message.timeout.ms", "5000")
        .create()?;

    info!("kafka producer connected to {}", brokers);

    let mut ebpf = Ebpf::load(aya::include_bytes_aligned!(concat!(
        env!("OUT_DIR"),
        "/probe"
    )))?;

    if let Err(e) = EbpfLogger::init(&mut ebpf) {
        warn!("failed to initialize eBPF logger: {e}");
    }

    let tcp_send: &mut KProbe = ebpf.program_mut("probe_tcp_send").unwrap().try_into()?;
    tcp_send.load()?;
    tcp_send.attach("tcp_sendmsg", 0)?;

    let tcp_recv: &mut KProbe = ebpf.program_mut("probe_tcp_recv").unwrap().try_into()?;
    tcp_recv.load()?;
    tcp_recv.attach("tcp_recvmsg", 0)?;

    let tcp_retransmit: &mut KProbe = ebpf.program_mut("probe_tcp_retransmit").unwrap().try_into()?;
    tcp_retransmit.load()?;
    tcp_retransmit.attach("tcp_retransmit_skb", 0)?;

    let sys_enter_read: &mut TracePoint = ebpf.program_mut("probe_sys_enter_read").unwrap().try_into()?;
    sys_enter_read.load()?;
    sys_enter_read.attach("syscalls", "sys_enter_read")?;

    let sys_exit_read: &mut TracePoint = ebpf.program_mut("probe_sys_exit_read").unwrap().try_into()?;
    sys_exit_read.load()?;
    sys_exit_read.attach("syscalls", "sys_exit_read")?;

    let sys_enter_write: &mut TracePoint = ebpf.program_mut("probe_sys_enter_write").unwrap().try_into()?;
    sys_enter_write.load()?;
    sys_enter_write.attach("syscalls", "sys_enter_write")?;

    let sys_exit_write: &mut TracePoint = ebpf.program_mut("probe_sys_exit_write").unwrap().try_into()?;
    sys_exit_write.load()?;
    sys_exit_write.attach("syscalls", "sys_exit_write")?;

    let sched_switch: &mut TracePoint = ebpf.program_mut("probe_sched_switch").unwrap().try_into()?;
    sched_switch.load()?;
    sched_switch.attach("sched", "sched_switch")?;

    let page_fault: &mut TracePoint = ebpf.program_mut("probe_mm_page_fault").unwrap().try_into()?;
    page_fault.load()?;
    page_fault.attach("exceptions", "page_fault_user")?;

    let block_issue: &mut TracePoint = ebpf.program_mut("probe_block_rq_issue").unwrap().try_into()?;
    block_issue.load()?;
    block_issue.attach("block", "block_rq_issue")?;

    let block_complete: &mut TracePoint = ebpf.program_mut("probe_block_rq_complete").unwrap().try_into()?;
    block_complete.load()?;
    block_complete.attach("block", "block_rq_complete")?;

    info!("11 probes attached");

    let tcp_map = ebpf.take_map("EVENTS_TCP").unwrap();
    let mut tcp_buf = RingBuf::try_from(tcp_map)?;

    let syscall_map = ebpf.take_map("EVENTS_SYSCALL").unwrap();
    let mut syscall_buf = RingBuf::try_from(syscall_map)?;

    let sched_map = ebpf.take_map("EVENTS_SCHED").unwrap();
    let mut sched_buf = RingBuf::try_from(sched_map)?;

    let fault_map = ebpf.take_map("EVENTS_PAGE_FAULT").unwrap();
    let mut fault_buf = RingBuf::try_from(fault_map)?;

    let block_map = ebpf.take_map("EVENTS_BLOCK").unwrap();
    let mut block_buf = RingBuf::try_from(block_map)?;

    let ctrl_c = signal::ctrl_c();
    tokio::pin!(ctrl_c);

    loop {
        tokio::select! {
            _ = &mut ctrl_c => {
                info!("shutting down...");
                break;
            }
            else => {
                publisher::drain_tcp(&mut tcp_buf, &producer).await;
                publisher::drain_syscall(&mut syscall_buf, &producer).await;
                publisher::drain_sched(&mut sched_buf, &producer).await;
                publisher::drain_page_fault(&mut fault_buf, &producer).await;
                publisher::drain_block(&mut block_buf, &producer).await;
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
    }

    Ok(())
}