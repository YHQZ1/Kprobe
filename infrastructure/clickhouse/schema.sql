CREATE DATABASE IF NOT EXISTS kprobe;

CREATE TABLE IF NOT EXISTS kprobe.kernel_events
(
    event_id        UUID DEFAULT generateUUIDv4(),
    event_type      LowCardinality(String),
    timestamp_ns    UInt64,
    pid             UInt32,
    tid             UInt32,
    cpu             UInt32,
    cgroup_id       UInt64,

    trace_id        String,
    span_id         String,
    service_name    LowCardinality(String),
    transaction_id  String,

    duration_ns     UInt64,
    return_value    Int64,

    payload         String,
    ingested_at     DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toDate(fromUnixTimestamp64Nano(timestamp_ns))
ORDER BY (timestamp_ns, event_type, pid)
TTL toDate(fromUnixTimestamp64Nano(timestamp_ns)) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_pid pid TYPE bloom_filter GRANULARITY 4;

ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_transaction transaction_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_trace trace_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE kprobe.kernel_events
    ADD INDEX idx_event_type event_type TYPE bloom_filter GRANULARITY 4;
