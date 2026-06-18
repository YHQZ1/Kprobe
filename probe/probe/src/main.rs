use anyhow::Context as _;
use aya::{
    Ebpf,
    maps::{Array, RingBuf},
    programs::{KProbe, TracePoint},
};
use aya_log::EbpfLogger;
use log::{info, warn};
use rdkafka::config::ClientConfig;
use rdkafka::producer::FutureProducer;
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::signal;

mod publisher;

fn kafka_brokers() -> String {
    env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into())
}

fn realtime_offset_ns() -> anyhow::Result<u64> {
    let mut monotonic = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    let result = unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, &mut monotonic) };
    if result != 0 {
        return Err(std::io::Error::last_os_error().into());
    }

    let monotonic_ns = (monotonic.tv_sec as u64) * 1_000_000_000 + monotonic.tv_nsec as u64;
    let realtime_ns = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos() as u64;
    Ok(realtime_ns.saturating_sub(monotonic_ns))
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

    let tcp_send: &mut KProbe = ebpf
        .program_mut("probe_tcp_send")
        .context("program probe_tcp_send not found")?
        .try_into()?;
    tcp_send.load().context("load probe_tcp_send")?;
    tcp_send
        .attach("tcp_sendmsg", 0)
        .context("attach probe_tcp_send to tcp_sendmsg")?;

    let tcp_recv: &mut KProbe = ebpf
        .program_mut("probe_tcp_recv")
        .context("program probe_tcp_recv not found")?
        .try_into()?;
    tcp_recv.load().context("load probe_tcp_recv")?;
    tcp_recv
        .attach("tcp_recvmsg", 0)
        .context("attach probe_tcp_recv to tcp_recvmsg")?;

    let tcp_retransmit: &mut KProbe = ebpf
        .program_mut("probe_tcp_retransmit")
        .context("program probe_tcp_retransmit not found")?
        .try_into()?;
    tcp_retransmit.load().context("load probe_tcp_retransmit")?;
    tcp_retransmit
        .attach("tcp_retransmit_skb", 0)
        .context("attach probe_tcp_retransmit to tcp_retransmit_skb")?;

    let sys_enter_read: &mut TracePoint = ebpf
        .program_mut("probe_sys_enter_read")
        .context("program probe_sys_enter_read not found")?
        .try_into()?;
    sys_enter_read.load().context("load probe_sys_enter_read")?;
    sys_enter_read
        .attach("syscalls", "sys_enter_read")
        .context("attach probe_sys_enter_read to syscalls:sys_enter_read")?;

    let sys_exit_read: &mut TracePoint = ebpf
        .program_mut("probe_sys_exit_read")
        .context("program probe_sys_exit_read not found")?
        .try_into()?;
    sys_exit_read.load().context("load probe_sys_exit_read")?;
    sys_exit_read
        .attach("syscalls", "sys_exit_read")
        .context("attach probe_sys_exit_read to syscalls:sys_exit_read")?;

    let sys_enter_write: &mut TracePoint = ebpf
        .program_mut("probe_sys_enter_write")
        .context("program probe_sys_enter_write not found")?
        .try_into()?;
    sys_enter_write
        .load()
        .context("load probe_sys_enter_write")?;
    sys_enter_write
        .attach("syscalls", "sys_enter_write")
        .context("attach probe_sys_enter_write to syscalls:sys_enter_write")?;

    let sys_exit_write: &mut TracePoint = ebpf
        .program_mut("probe_sys_exit_write")
        .context("program probe_sys_exit_write not found")?
        .try_into()?;
    sys_exit_write.load().context("load probe_sys_exit_write")?;
    sys_exit_write
        .attach("syscalls", "sys_exit_write")
        .context("attach probe_sys_exit_write to syscalls:sys_exit_write")?;

    let sched_switch: &mut TracePoint = ebpf
        .program_mut("probe_sched_switch")
        .context("program probe_sched_switch not found")?
        .try_into()?;
    sched_switch.load().context("load probe_sched_switch")?;
    sched_switch
        .attach("sched", "sched_switch")
        .context("attach probe_sched_switch to sched:sched_switch")?;

    let page_fault: &mut TracePoint = ebpf
        .program_mut("probe_mm_page_fault")
        .context("program probe_mm_page_fault not found")?
        .try_into()?;
    page_fault.load().context("load probe_mm_page_fault")?;
    page_fault
        .attach("exceptions", "page_fault_user")
        .context("attach probe_mm_page_fault to exceptions:page_fault_user")?;

    let block_issue: &mut TracePoint = ebpf
        .program_mut("probe_block_rq_issue")
        .context("program probe_block_rq_issue not found")?
        .try_into()?;
    block_issue.load().context("load probe_block_rq_issue")?;
    block_issue
        .attach("block", "block_rq_issue")
        .context("attach probe_block_rq_issue to block:block_rq_issue")?;

    let block_complete: &mut TracePoint = ebpf
        .program_mut("probe_block_rq_complete")
        .context("program probe_block_rq_complete not found")?
        .try_into()?;
    block_complete
        .load()
        .context("load probe_block_rq_complete")?;
    block_complete
        .attach("block", "block_rq_complete")
        .context("attach probe_block_rq_complete to block:block_rq_complete")?;

    info!("11 probes attached");

    let tcp_buf = RingBuf::try_from(
        ebpf.take_map("EVENTS_TCP")
            .context("map EVENTS_TCP not found")?,
    )?;
    let syscall_buf = RingBuf::try_from(
        ebpf.take_map("EVENTS_SYSCALL")
            .context("map EVENTS_SYSCALL not found")?,
    )?;
    let sched_buf = RingBuf::try_from(
        ebpf.take_map("EVENTS_SCHED")
            .context("map EVENTS_SCHED not found")?,
    )?;
    let fault_buf = RingBuf::try_from(
        ebpf.take_map("EVENTS_PAGE_FAULT")
            .context("map EVENTS_PAGE_FAULT not found")?,
    )?;
    let block_buf = RingBuf::try_from(
        ebpf.take_map("EVENTS_BLOCK")
            .context("map EVENTS_BLOCK not found")?,
    )?;

    let drop_map = ebpf
        .map("DROP_COUNTERS")
        .context("map DROP_COUNTERS not found")?;
    let drop_counters: Array<_, u64> = Array::try_from(drop_map)?;
    let timestamp_offset_ns = realtime_offset_ns()?;

    tokio::spawn(publisher::drain_tcp(
        tcp_buf,
        producer.clone(),
        timestamp_offset_ns,
    ));
    tokio::spawn(publisher::drain_syscall(
        syscall_buf,
        producer.clone(),
        timestamp_offset_ns,
    ));
    tokio::spawn(publisher::drain_sched(
        sched_buf,
        producer.clone(),
        timestamp_offset_ns,
    ));
    tokio::spawn(publisher::drain_page_fault(
        fault_buf,
        producer.clone(),
        timestamp_offset_ns,
    ));
    tokio::spawn(publisher::drain_block(
        block_buf,
        producer.clone(),
        timestamp_offset_ns,
    ));

    let ctrl_c = signal::ctrl_c();
    tokio::pin!(ctrl_c);

    let map_names = ["TCP", "SYSCALL", "SCHED", "PAGE_FAULT", "BLOCK"];
    let mut last_drops = [0u64; 5];
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));

    loop {
        tokio::select! {
            _ = &mut ctrl_c => {
                info!("shutting down...");
                break;
            }
            _ = interval.tick() => {
                for i in 0..5u32 {
                    if let Ok(count) = drop_counters.get(&i, 0) {
                        let prev = last_drops[i as usize];
                        if count > prev {
                            warn!(
                                "ring buffer EVENTS_{} dropped {} events in last 5s",
                                map_names[i as usize],
                                count - prev
                            );
                            last_drops[i as usize] = count;
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
