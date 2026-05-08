# kprobe — Progress Tracker

> This file is the source of truth for project state.
> Update it after every meaningful change.
> Claude should read this before every session.

---

## Current Status

**Stage:** Phase 2 — Causal Intelligence  
**Last updated:** May 2026  
**Next immediate task:** Causal graph engine v1 — event windowing and causal inference in Go

---

## Completed

### Scaffolding

- [x] Monorepo initialized with git
- [x] Root `.gitignore` — covers Rust, Go, Node
- [x] Go workspace (`go.work`) with four modules: `shared`, `engine`, `replay`, `api`
- [x] Each Go service has `go.mod` with correct module path (`github.com/YHQZ1/kprobe/*`)
- [x] `shared/types/event.go` — `KernelEvent` and `EventType` types
- [x] `shared/domain/financial.go` — `Settlement`, `Order`, `LedgerEntry` types
- [x] Stub `main.go` in `engine/`, `api/`, `replay/`
- [x] eBPF probe scaffolded via `cargo generate` with Aya template
  - `probe/probe/` — userspace agent
  - `probe/probe-ebpf/` — kernel-side eBPF programs
  - `probe/probe-common/` — shared types
- [x] React + Vite frontend scaffolded in `web/`
- [x] Infrastructure folder structure (`infrastructure/docker/`, `helm/`, `k8s/`, `observability/`)
- [x] `infrastructure/docker/docker-compose.yml` — Kafka (KRaft), ClickHouse, Neo4j, Vector
- [x] Root `Makefile` with full dev workflow
- [x] `README.md` — complete with architecture, tech stack, incident walkthrough, local dev guide

### Phase 1 — Core Pipeline ✅ COMPLETE

- [x] eBPF probe: `tcp_sendmsg` hook
- [x] eBPF probe: `tcp_recvmsg` hook
- [x] eBPF probe: `sched_switch` hook
- [x] eBPF probe: `sys_write` hook
- [x] eBPF probe: `sys_read` hook
- [x] eBPF probe: `mm_page_fault` hook
- [x] Rust userspace loader — load eBPF programs via Aya
- [x] Rust ring buffer management — read events from kernel
- [x] Kafka producer — batch and stream events from userspace to Kafka
- [x] Kafka topic schema — topic-per-event-type (`kernel.tcp`, `kernel.sched`, `kernel.syscall`, `kernel.fault`)
- [x] `probe-common` split into per-type modules (`tcp.rs`, `sched.rs`, `syscall.rs`, `fault.rs`)
- [x] `probe-ebpf` split into per-hook modules (`tcp.rs`, `sched.rs`, `syscall.rs`, `fault.rs`)
- [x] Userspace agent split into `main.rs` (startup + attach) and `publisher.rs` (drain + publish)
- [x] Vector config — joins eBPF events with OTel traces on PID + timestamp
- [x] Vector pipeline — routes enriched events to ClickHouse and `kernel.enriched` Kafka topic
- [x] ClickHouse schema — `kprobe.kernel_events` time series table with bloom filter indexes
- [x] Docker Compose — Kafka (KRaft), ClickHouse, Neo4j, Vector all wired together

---

### Phase 2 — Causal Intelligence

- [x] Causal graph engine v1 — event windowing
- [x] Causal inference — draw edges between causally related events
- [x] Neo4j graph model — node and edge schema
- [x] Cypher query library — traverse causal chain from any event
- [x] Financial domain primitives in engine — settlement boundaries, clearing windows
- [x] gRPC API server — proto definitions
- [x] gRPC handlers — query causal graph, stream live events

## In Progress

### Phase 3 — Frontend

- [ ] React dashboard shell — routing, state management
- [ ] D3.js causal graph view — interactive, colour-coded by latency
- [ ] ECharts timeline view — nanosecond precision, zoomable
- [ ] WebSocket hook — live event streaming from API
- [ ] Replay panel UI

---

## Not Started

### Phase 4 — Replay

- [ ] ptrace syscall interception — sandbox a process
- [ ] Replay session manager — load events from ClickHouse
- [ ] Serve syscalls from event log instead of real kernel
- [ ] Timing injector — modify timeouts, add latency
- [ ] Fix verification workflow — replay with proposed changes

### Phase 5 — Production Readiness

- [ ] Helm chart — single `helm install` deploys everything
- [ ] K8s manifests — DaemonSet for probe, Deployments for services
- [ ] OpenTelemetry Collector config
- [ ] Prometheus metrics — events/sec, causal engine throughput, probe overhead
- [ ] Grafana dashboards + Loki log aggregation
- [ ] Jaeger distributed tracing across Go services
- [ ] Performance benchmarks — probe overhead documentation

---

## Architecture Decisions Log

| Decision                  | Choice                                | Reason                                                               |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| eBPF language             | Pure Rust/Aya                         | Memory safe, no C, Aya handles verifier constraints                  |
| Go module structure       | Separate modules + go.work            | Services deploy independently, shared code via explicit dependency   |
| Kafka mode                | KRaft (no Zookeeper)                  | Simpler ops, one less service                                        |
| Kafka topics              | topic-per-event-type                  | Clean separation, Go engine subscribes only to what it needs         |
| Raw event storage         | ClickHouse                            | Columnar, handles billions of timestamped rows                       |
| Causal graph storage      | Neo4j                                 | Native graph traversal for cause-effect chains                       |
| OTel correlation          | Vector                                | Joins eBPF events with traces on PID + timestamp                     |
| Dev model                 | Split (infra Docker, services native) | Fast iteration, no Docker rebuilds                                   |
| probe-common structure    | Per-type modules                      | Clean separation, each type owns its own file                        |
| probe-ebpf structure      | Per-hook modules                      | Each hook isolated, easy to add new hooks                            |
| Userspace agent structure | main.rs + publisher.rs                | Startup/attach separated from drain/publish logic                    |
| Phase 1 ingestion         | Vector ClickHouse sink                | Vector handles Kafka → ClickHouse natively, no Go duplication needed |

---

## Known Issues / Blockers

_None currently._

---

## Notes

- eBPF requires Linux kernel 5.15+ with BTF support. Local dev on macOS will not run the probe — use Codespaces or a Linux VM for probe development and testing.
- `probe-run` requires `sudo` — eBPF programs need elevated privileges to load into the kernel.
- Neo4j password is `kprobe_secret` — change before any real deployment.
- `go.work` is committed — makes local development easier. CI builds ignore it and use the `replace` directives in individual `go.mod` files.
- Kafka topics: `kernel.tcp`, `kernel.sched`, `kernel.syscall`, `kernel.fault` — one topic per event category.
- `kernel.enriched` — Vector output topic consumed by the Go causal engine.
- Codespaces used for Rust/eBPF development — all other work done locally on Mac.
