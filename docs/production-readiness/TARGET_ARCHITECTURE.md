# Target Architecture

This document defines the production invariants. Implementation details may
change, but a change to an invariant requires an architecture decision record.

## System Shape

```text
Per Linux node
  eBPF programs
    -> bounded ring buffers + explicit drop counters
    -> userspace agent
         -> bounded memory queue
         -> durable local spool during broker outages
         -> authenticated Kafka producer

Regional durable pipeline
  kernel.raw.v1
    -> validation/enrichment consumer
    -> kernel.enriched.v1
    -> authoritative storage consumer
         -> idempotent ClickHouse event store
         -> commit source offset only after durable acknowledgement

Replayable projections
  authoritative event stream/store
    -> causal inference consumer -> Neo4j projection
    -> live event consumer -> API fan-out tier
    -> future replay preparation pipeline

Serving
  authenticated API gateway
    -> ClickHouse event/time queries
    -> Neo4j causal queries
    -> bounded live streams
```

## Invariants

### Event identity

Every event has:

- schema version;
- stable event ID assigned before the first Kafka publish;
- cluster and node identity;
- boot/session identity to distinguish PID reuse across restarts;
- monotonic source sequence where technically feasible;
- capture timestamp and ingestion timestamp;
- explicit producer version.

Event IDs do not change during retries, enrichment, storage, or projection.

### Durability

- Kafka is the durable transport boundary.
- ClickHouse is the authoritative long-term event history.
- Kafka source offsets are committed only after ClickHouse acknowledges the
  corresponding idempotent batch.
- Retryable failures apply backpressure or durable retry; they never become
  success because an error was logged.
- Permanent validation failures enter a durable DLQ before their source offsets
  are committed.
- Every intentional drop has a reason counter and alertable signal.

### Derived state

- Neo4j is a projection, not part of the ingestion transaction.
- Causal graph state can be rebuilt from authoritative events.
- Live streams are ephemeral projections and never determine durability.
- Projection checkpoints are independent and observable.

### Partitioning and ordering

- Topic partition counts and keys are provisioned, reviewed contracts.
- Partition keys preserve the ordering needed for syscall pairing and local
  inference.
- Cross-node and cross-partition correlation uses explicit identities and a
  documented event-time strategy; it does not assume process-local state.
- Scaling a consumer group must not cause clients to receive partial live data.

### Security

- Services fail closed when required credentials are absent.
- External user access uses an organizational identity provider.
- Internal callers use workload identities or mutually authenticated TLS.
- Authorization distinguishes read, stream, configure, replay, and administer.
- Secrets come from a managed secret store and support rotation.
- Browser tokens are not placed in URLs.
- Public endpoints enforce rate, concurrency, payload, and query-cost limits.
- Infrastructure services are private by default.

### Operability

Each long-running component provides:

- liveness and dependency-aware readiness;
- structured logs with stable error codes;
- throughput, error, retry, queue, saturation, and loss metrics;
- service-level traces where useful;
- graceful shutdown with bounded drain behavior;
- an alert and runbook for every condition that risks permanent loss.

### Recovery

- ClickHouse and Neo4j backups have explicit RPO/RTO targets.
- Restore procedures are automated and tested in clean environments.
- Neo4j may be rebuilt from the authoritative history.
- Schema migrations are versioned, repeatable, and backward-compatible during
  rolling deployment.
- Deployments have health-based rollback and compatible event-contract windows.

## Initial Production Scope

Included:

- Linux capture and durable ingestion;
- storage and bounded queries;
- OTel correlation with explicit node/process identity;
- causal graph projection;
- authenticated live streams;
- monitoring, recovery, and a supported deployment path.

Deferred:

- claims of deterministic ptrace replay;
- multi-region active-active ingestion;
- arbitrary public SaaS multi-tenancy;
- performance claims not backed by committed, reproducible tests.

## Migration Principles

1. Introduce versioned contracts beside legacy topics.
2. Dual-publish or adapt at explicit compatibility boundaries.
3. Backfill and compare authoritative results before switching readers.
4. Keep rollback consumers compatible during the migration window.
5. Remove legacy paths only after verification and an observation period.
