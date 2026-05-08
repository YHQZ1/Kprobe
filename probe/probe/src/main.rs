use aya::{
    maps::RingBuf,
    programs::{KProbe, TracePoint},
    Ebpf,
};
use aya_log::EbpfLogger;
use log::{info, warn, debug};
use tokio::signal;
use rdkafka::config::ClientConfig;
use rdkafka::producer::FutureProducer;

mod publisher;

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

    let sched_prog: &mut TracePoint = ebpf.program_mut("probe_sched_switch").unwrap().try_into()?;
    sched_prog.load()?;
    sched_prog.attach("sched", "sched_switch")?;

    let write_prog: &mut KProbe = ebpf.program_mut("probe_sys_write").unwrap().try_into()?;
    write_prog.load()?;
    write_prog.attach("ksys_write", 0)?;

    let page_fault_prog: &mut TracePoint = ebpf.program_mut("probe_mm_page_fault").unwrap().try_into()?;
    page_fault_prog.load()?;
    page_fault_prog.attach("exceptions", "page_fault_user")?;

    let read_prog: &mut KProbe = ebpf.program_mut("probe_sys_read").unwrap().try_into()?;
    read_prog.load()?;
    read_prog.attach("ksys_read", 0)?;

    info!("probes attached to tcp_sendmsg, tcp_recvmsg, sched_switch, ksys_write, page_fault_user, ksys_read");

    let send_map = ebpf.take_map("EVENTS_SEND").unwrap();
    let mut send_buf = RingBuf::try_from(send_map)?;

    let recv_map = ebpf.take_map("EVENTS_RECV").unwrap();
    let mut recv_buf = RingBuf::try_from(recv_map)?;

    let sched_map = ebpf.take_map("EVENTS_SCHED").unwrap();
    let mut sched_buf = RingBuf::try_from(sched_map)?;

    let write_map = ebpf.take_map("EVENTS_WRITE").unwrap();
    let mut write_buf = RingBuf::try_from(write_map)?;

    let page_fault_map = ebpf.take_map("EVENTS_PAGE_FAULT").unwrap();
    let mut page_fault_buf = RingBuf::try_from(page_fault_map)?;

    let read_map = ebpf.take_map("EVENTS_READ").unwrap();
    let mut read_buf = RingBuf::try_from(read_map)?;

    let ctrl_c = signal::ctrl_c();
    tokio::pin!(ctrl_c);

    loop {
        tokio::select! {
            _ = &mut ctrl_c => {
                info!("Exiting...");
                break;
            }
            else => {
                publisher::drain_tcp(&mut send_buf, &producer).await;
                publisher::drain_tcp(&mut recv_buf, &producer).await;
                publisher::drain_sched(&mut sched_buf, &producer).await;
                publisher::drain_syscall(&mut write_buf, &producer).await;
                publisher::drain_syscall(&mut read_buf, &producer).await;
                publisher::drain_page_fault(&mut page_fault_buf, &producer).await;
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
    }

    Ok(())
}