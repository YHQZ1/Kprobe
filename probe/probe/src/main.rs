use aya::{
    maps::RingBuf,
    programs::KProbe,
    Ebpf,
};
use aya_log::EbpfLogger;
use log::{info, warn, debug};
use probe_common::{TcpEvent, EventType};
use tokio::signal;

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

    let mut ebpf = Ebpf::load(aya::include_bytes_aligned!(concat!(
        env!("OUT_DIR"),
        "/probe"
    )))?;

    if let Err(e) = EbpfLogger::init(&mut ebpf) {
        warn!("failed to initialize eBPF logger: {e}");
    }

    let program: &mut KProbe = ebpf.program_mut("probe").unwrap().try_into()?;
    program.load()?;
    program.attach("tcp_sendmsg", 0)?;

    info!("kprobe attached to tcp_sendmsg, waiting for events...");

    let mut ring_buf = RingBuf::try_from(ebpf.map_mut("EVENTS").unwrap())?;

    let ctrl_c = signal::ctrl_c();
    tokio::pin!(ctrl_c);

    loop {
        tokio::select! {
            _ = &mut ctrl_c => {
                info!("Exiting...");
                break;
            }
            else => {
                while let Some(item) = ring_buf.next() {
                    let event = unsafe {
                        &*(item.as_ptr() as *const TcpEvent)
                    };
                    let event_type = match event.event_type {
                        EventType::TcpSend => "TCP_SEND",
                        EventType::TcpRecv => "TCP_RECV",
                    };
                    info!(
                        "pid={} tid={} cpu={} timestamp_ns={} type={}",
                        event.pid,
                        event.tid,
                        event.cpu,
                        event.timestamp_ns,
                        event_type
                    );
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
            }
        }
    }

    Ok(())
}