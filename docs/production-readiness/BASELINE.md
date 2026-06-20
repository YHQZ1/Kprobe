# Audited Baseline

Audit date: 2026-06-20

This baseline records verified repository behavior, not intended behavior from
marketing or operational documentation. The audit covered 221 tracked files:
195 text-like files and 26 binary image/font assets. The worktree was clean at
the start and end of the audit.

## Product Status

kprobe is a working local prototype and demo. It is not production-adjacent.
Its happy path builds and basic unit tests pass, but event delivery can lose
data silently, multi-node identity is absent, security defaults are unsafe, and
deployment, recovery, alerting, and real deterministic replay are incomplete.

## Actual Data Flow

```text
Linux kernel hooks
  -> five eBPF ring buffers (TCP, syscall, scheduler, page fault, block)
  -> Rust userspace agent
  -> JSON on Kafka topic kernel.raw
  -> Vector JSON transform
  -> Kafka topic kernel.enriched
  -> Go engine
       -> in-memory ClickHouse batcher -> kprobe.kernel_events
       -> in-memory inference queue -> Neo4j KernelEvent/CAUSED projection
       -> async Kafka topic kernel.processed
  -> API consumer
       -> in-memory subscriber hub
       -> WebSocket and gRPC live streams

API query path:
  HTTP/gRPC -> ClickHouse event queries
  HTTP/gRPC -> Neo4j causal-chain queries

Replay path:
  gRPC handler -> ClickHouse query -> in-memory timed event callbacks
```

Relevant implementations:

- eBPF maps: `probe/probe-ebpf/src/main.rs`
- userspace publishing: `probe/probe/src/publisher.rs`
- Vector bridge: `infrastructure/vector/vector.toml`
- engine orchestration: `engine/main.go`
- API orchestration: `api/main.go`
- replay stub: `replay/ptrace/ptrace.go`

## Contracts and Boundaries

| Boundary | Current contract | Enforcement |
| --- | --- | --- |
| eBPF -> userspace | Shared `repr(C)` Rust structs | ABI size/discriminant unit tests only |
| Probe -> `kernel.raw` | Hand-built JSON | No schema or version |
| Vector -> `kernel.enriched` | Parsed/re-encoded JSON | `parse_json!`; no schema registry |
| OTel -> `otel.spans` | Implicit JSON fields | Consumer only; producer not found |
| Engine -> `kernel.processed` | Go `KernelEvent` JSON | No schema or version |
| API gRPC | `api/proto/kprobe.proto` | Protobuf; package is not versioned |
| API HTTP/WebSocket | Manual camelCase JSON subset | No OpenAPI/JSON schema |
| ClickHouse | `infrastructure/clickhouse/schema.sql` | One init script; no migrations |
| Neo4j | Runtime constraints/index creation | No versioned migrations |

## Verified Failure Behavior

### Kafka unavailable

- Kernel ring-buffer reservation remains non-blocking and increments an eBPF
  drop counter when full.
- Each userspace drain loop retains at most 5,000 failed Kafka records in RAM.
- New records are silently omitted after that queue is full.
- Backlog retry can fail while the current record is still attempted, allowing
  reordering.
- The queues are lost when the agent exits.

### ClickHouse unavailable

- The engine detaches a batch from memory and tries it three times with a
  five-second timeout per attempt.
- The batch is permanently dropped after retries are exhausted.
- Source Kafka messages can already be committed because insertion only
  enqueues into the batcher.
- The API exits at startup when ClickHouse is configured but unreachable.

### Neo4j unavailable

- The engine exits at startup if initial connectivity/schema setup fails.
- Runtime node and edge write failures are logged; the inference window is not
  retried or persisted.
- ClickHouse, Neo4j, and `kernel.processed` can therefore disagree permanently.

## Identity and Correlation

- Events have PID, TID, CPU, and cgroup ID but no node, host, cluster, boot, or
  producer identity.
- OTel spans are joined to kernel events using PID and timestamp only.
- Probe-originated trace, span, service, and transaction fields are empty.
- The engine consumes `otel.spans`, but no repository component produces that
  topic and no OTel Collector configuration exists.
- Block I/O pairing omits the device identifier.

These constraints make the current correlation model unsafe across multiple
nodes, PID reuse, restarts, and multiple block devices.

## Delivery Semantics

The engine is not reliably at-least-once:

- the consumer callback cannot report downstream failure;
- Kafka commit occurs after enqueueing, not after durable storage;
- ClickHouse batches can be dropped;
- Neo4j failures do not block commits;
- `kernel.processed` uses an async producer whose completion errors are logged;
- event IDs are randomly generated during consumption, so retries create new
  identities and duplicate ClickHouse rows;
- DLQ source messages are committed without confirmed DLQ persistence.

## Security Baseline

- API credentials and JWT signing keys have development fallbacks.
- Authentication is a shared static token or one HS256 JWT identity without
  roles, scopes, issuer/audience validation, or revocation.
- Login has no throttling or lockout.
- Settings mutation and reset are unauthenticated and CORS-open.
- WebSocket tokens are placed in query strings and all origins are accepted.
- gRPC, HTTP, WebSocket, Kafka, metrics, and local infrastructure lack TLS in
  the committed configuration.
- Kafka, Vector, Jaeger, Prometheus, and Grafana publish host ports; Grafana
  enables anonymous authentication.
- No high-entropy production credential was found in current files or history,
  but development credentials are repeatedly committed and documented.

## Scalability Baseline

- The probe captures broad host activity without workload filters.
- Each event family awaits Kafka delivery serially and logs successful events
  at info level.
- Kafka topics are auto-created; partition and retention contracts are absent.
- A single engine callback processes `kernel.enriched` sequentially.
- ClickHouse's active buffer is not bounded while another batch retries.
- Replay loads an entire transaction without a limit and retains sessions in an
  unbounded manager map.
- Neo4j relationship queries filter relationship properties without creating a
  relationship index.
- No load, soak, burst, or capacity test artifacts were found.

## Testing and Tool Results

- 23 Go test functions and 2 Rust ABI/layout test functions were found.
- `go test -race ./...` passed for all four Go modules.
- Console ESLint and production build passed.
- Public website production build passed with 61 generated pages.
- No frontend tests were found.
- No broker outage, rebalance, database outage, process-crash, backup/restore,
  or multi-node correlation tests were found.
- No eBPF verifier/attach/runtime/overflow integration harness was found.
- Go coverage could not be measured because the installed Go 1.26.3 toolchain
  lacked the `covdata` tool.
- Rust workspace tests could not run on the macOS audit host; the build also
  required unavailable Linux facilities, `bpf-linker`, and CMake.
- `pnpm audit --prod` reported 3 high and 3 moderate console advisories and 4
  high, 3 moderate, and 2 low website advisories.
- Go vulnerability scanning was unverified because the installed
  `govulncheck` was built against an incompatible Go version.
- Rust vulnerability scanning was unverified because `cargo-audit` was absent.

## Observability Baseline

- Engine Prometheus metrics cover consumed events, inference drops, DLQ count,
  batch timing, window size, and Neo4j timing.
- API metrics cover subscriber count, broadcast count, and coarse unary gRPC
  outcomes.
- No metric covers Kafka lag/commits, permanent ClickHouse loss, Neo4j error
  count, producer backlog, probe drop counters, HTTP/WebSocket outcomes, or
  replay lifecycle.
- API `/healthz` checks configuration presence, not dependency health.
- Engine and probe have no health/readiness endpoint.
- Jaeger exists in Compose, but kprobe does not instrument itself with OTel.
- No Prometheus alert rules, Alertmanager configuration, pager integration, or
  committed incident runbooks were found.

## Deployment Baseline

- Docker Compose describes development infrastructure only.
- No application Dockerfile was found.
- No Kubernetes, Helm, Terraform, or CI/CD configuration was found.
- No resource requests/limits, PDBs, network policies, or capability-scoped
  eBPF workload definition was found.
- ClickHouse uses one non-versioned init script; repeated index statements are
  not idempotent.
- No ClickHouse or Neo4j backup, restore, or disaster-recovery process exists.
- README and public documentation reference Helm charts, Kubernetes manifests,
  an installer, Loki, and production features that are not present.

## Explicitly Unverified

The audit did not verify Linux eBPF loading, kernel compatibility, real event
rates, probe overhead, end-to-end load, failover, partition rebalancing,
backup restoration, Kubernetes security context, or published performance
claims. These require the verification work defined in this directory.
