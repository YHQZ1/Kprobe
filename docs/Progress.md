# kprobe — Progress Tracker

> This file is the source of truth for project state.
> Update it after every meaningful change.
> Claude should read this before every session.

---

## Current Status

**Stage:** Phase 1 — Core Pipeline  
**Last updated:** May 2026  
**Next immediate task:** Implement `tcp_sendmsg` hook in `probe-ebpf/src/main.rs`

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
- [x] `infrastructure/docker/docker-compose.yml` — Kafka (KRaft), ClickHouse, Neo4j
- [x] Root `Makefile` with full dev workflow
- [x] `README.md` — complete with architecture, tech stack, incident walkthrough, local dev guide

---

## In Progress

### Phase 1 — Core Pipeline

- [ ] eBPF probe: `tcp_sendmsg` hook
- [ ] eBPF probe: `sched_switch` hook
- [ ] eBPF probe: `sys_write` hook
- [ ] eBPF probe: `mm_page_fault` hook
- [ ] eBPF probe: `tcp_recvmsg` hook
- [ ] eBPF probe: `sys_read` hook
- [ ] Rust userspace loader — load eBPF programs via Aya
- [ ] Rust ring buffer management — read events from kernel
- [ ] Kafka producer — batch and stream events from userspace to Kafka
- [ ] Kafka topic schema — topic-per-event-type
- [ ] Vector config — join eBPF events with OTel traces on PID + timestamp
- [ ] ClickHouse schema — time series table for raw kernel events
- [ ] ClickHouse ingestion pipeline in Go engine

---

## Not Started

### Phase 2 — Causal Intelligence

- [ ] Causal graph engine v1 — event windowing
- [ ] Causal inference — draw edges between causally related events
- [ ] Neo4j graph model — node and edge schema
- [ ] Cypher query library — traverse causal chain from any event
- [ ] Financial domain primitives in engine — settlement boundaries, clearing windows
- [ ] gRPC API server — proto definitions
- [ ] gRPC handlers — query causal graph, stream live events

### Phase 3 — Frontend

- [ ] React dashboard shell — routing, state management
- [ ] D3.js causal graph view — interactive, colour-coded by latency
- [ ] ECharts timeline view — nanosecond precision, zoomable
- [ ] WebSocket hook — live event streaming from API
- [ ] Replay panel UI

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

| Decision             | Choice                                | Reason                                                             |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| eBPF language        | Pure Rust/Aya                         | Memory safe, no C, Aya handles verifier constraints                |
| Go module structure  | Separate modules + go.work            | Services deploy independently, shared code via explicit dependency |
| Kafka mode           | KRaft (no Zookeeper)                  | Simpler ops, one less service                                      |
| Raw event storage    | ClickHouse                            | Columnar, handles billions of timestamped rows                     |
| Causal graph storage | Neo4j                                 | Native graph traversal for cause-effect chains                     |
| OTel correlation     | Vector                                | Joins eBPF events with traces on PID + timestamp                   |
| Dev model            | Split (infra Docker, services native) | Fast iteration, no Docker rebuilds                                 |

---

## Known Issues / Blockers

_None currently._

---

## Notes

- eBPF requires Linux kernel 5.15+ with BTF support. Local dev on macOS will not run the probe — use a Linux VM or remote machine for probe testing.
- `probe-run` requires `sudo` — eBPF programs need elevated privileges to load into the kernel.
- Neo4j password is `kprobe_secret` — change before any real deployment.
- `go.work` is committed — makes local development easier. CI builds ignore it and use the `replace` directives in individual `go.mod` files.
