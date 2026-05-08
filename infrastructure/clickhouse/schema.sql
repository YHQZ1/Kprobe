-- Create the kprobe database
CREATE DATABASE IF NOT EXISTS kprobe;

-- Main kernel events table
CREATE TABLE IF NOT EXISTS kprobe.kernel_events
(
    -- Core fields present on every event
    event_id        UUID DEFAULT generateUUIDv4(),
    timestamp_ns    UInt64,
    ingested_at     DateTime64(3),
    pid             UInt32,
    tid             UInt32,
    cpu             UInt32,
    source_topic    LowCardinality(String),

    -- OTel enrichment fields (unknown if not matched)
    trace_id        String,
    span_id         String,
    service_name    LowCardinality(String),
    transaction_id  String,

    -- TCP fields (null if not a TCP event)
    tcp_data_len    Nullable(UInt32),
    tcp_event_type  Nullable(LowCardinality(String)),

    -- Scheduler fields (null if not a sched event)
    sched_prev_pid  Nullable(UInt32),
    sched_next_pid  Nullable(UInt32),
    sched_prev_state Nullable(UInt64),

    -- Syscall fields (null if not a syscall event)
    syscall_bytes   Nullable(UInt64),
    syscall_fd      Nullable(UInt32),
    syscall_type    Nullable(LowCardinality(String)),

    -- Page fault fields (null if not a fault event)
    fault_address   Nullable(UInt64),
    fault_error_code Nullable(UInt64)
)
ENGINE = MergeTree()
PARTITION BY toDate(fromUnixTimestamp64Nano(timestamp_ns))
ORDER BY (timestamp_ns, pid, source_topic)
TTL toDate(fromUnixTimestamp64Nano(timestamp_ns)) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Index for fast PID lookups
ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_pid (pid) TYPE bloom_filter GRANULARITY 4;

-- Index for fast transaction lookups
ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_transaction (transaction_id) TYPE bloom_filter GRANULARITY 4;

-- Index for fast trace lookups
ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_trace (trace_id) TYPE bloom_filter GRANULARITY 4;