# kprobe — Progress Tracker

> This file is the source of truth for project state.
> Update it after every meaningful change.
> Claude should read this before every session.

---

## Current Status

**Stage:** Phase 4 — Console Dashboard  
**Last updated:** May 2026  
**Next immediate task:** Scaffold `console/` — React + TypeScript dashboard shell with routing

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

### Phase 2 — Causal Intelligence ✅ COMPLETE

- [x] Causal graph engine v1 — event windowing
- [x] Causal inference — draw edges between causally related events
- [x] Neo4j graph model — node and edge schema
- [x] Cypher query library — traverse causal chain from any event
- [x] Financial domain primitives in engine — settlement boundaries, clearing windows
- [x] gRPC API server — proto definitions
- [x] gRPC handlers — query causal graph, stream live events

### Phase 3 — Public Website ✅ COMPLETE

- [x] Astro 6 + MDX + Tailwind v4 scaffolded in `www/`
- [x] Design system — Raleway variable font, amber accent, off-black/white palette, CSS variables
- [x] FOUC fix — inline CSS variables + `visibility: hidden` pattern on both layouts
- [x] Global styles — scrollbar, selection, code, pre, transitions
- [x] `Layout.astro` — base layout with FOUC fix
- [x] `DocsLayout.astro` — sidebar layout with full MDX prose styling
- [x] `Navbar.astro` — logo, centered nav, search trigger, GitHub button, theme toggle (Lucide + react-icons)
- [x] `SearchModal.tsx` — keyboard-navigable search modal, ⌘K shortcut, hardcoded page index
- [x] `DocsSidebar.astro` — grouped nav, active link highlighting, mobile slide-in drawer
- [x] `Footer.astro` — brand, tagline, nav links, copyright
- [x] `404.astro` — clean 404 page
- [x] `index.astro` — landing page: hero with kernel event stream visual, capabilities bento grid, causal trace, comparison table, install block with copy buttons, stack section with Simple Icons
- [x] `compare.astro` — structural gap analysis, tool-by-tool breakdown (Datadog, Jaeger, OTel, Prometheus, Honeycomb), incident scenario, full capability matrix, stack positioning
- [x] `about.astro` — origin story, what kprobe is/isn't, design philosophy (4 decisions), technical foundations (6 choices), open source section
- [x] `docs/index.mdx` — Introduction
- [x] `docs/installation.mdx` — prerequisites, Helm install, local dev setup, ports
- [x] `docs/quickstart.mdx` — first causal trace walkthrough
- [x] `docs/how-it-works.mdx` — Recorder, Causal Engine, Replay Engine deep dive
- [x] `docs/architecture.mdx` — full system architecture, component responsibilities, design decisions
- [x] `docs/dashboard/causal-graph.mdx` — reading the graph, node colours, navigation, filtering, export
- [x] `docs/dashboard/timeline.mdx` — zoom levels, swimlanes, correlation lines, live mode
- [x] `docs/dashboard/replay.mdx` — how replay works, controls, injections, fix verification
- [x] `docs/api/overview.mdx` — transport, auth, core concepts, gRPC services, WebSocket streaming
- [x] `docs/api/reference.mdx` — full protobuf definitions for all four gRPC services
- [x] `docs/configuration.mdx` — Helm values, Kafka topics, ClickHouse schema, engine tuning, probe overhead
- [x] `docs/security.mdx` — privilege model, what data is stored, retention, network exposure, RBAC
- [x] `docs/faq.mdx` — 12 common questions answered

---

## In Progress

### Phase 4 — Console Dashboard

- [ ] Scaffold `console/` — Vite + React + TypeScript
- [ ] Same design system as `www/` — CSS variables, Raleway, amber accent
- [ ] React Router — routing between views
- [ ] Shell layout — sidebar, top bar, view area
- [ ] Mock data layer — realistic fake kernel events, causal graphs, replay sessions
- [ ] D3.js causal graph view — interactive directed graph, click to drill down
- [ ] ECharts timeline view — nanosecond precision, zoomable, swimlanes per service
- [ ] WebSocket hook — live event streaming from Go API
- [ ] Live stream view — real-time kernel event feed
- [ ] Replay panel — session controls, injection panel, playback timeline

---

## Not Started

### Phase 5 — Replay Engine (Go)

- [ ] ptrace syscall interception — sandbox a process
- [ ] Replay session manager — load events from ClickHouse
- [ ] Serve syscalls from event log instead of real kernel
- [ ] Timing injector — modify timeouts, add latency
- [ ] Fix verification workflow — replay with proposed changes

### Phase 6 — Production Readiness

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
| Go module structure       | Separate modules + `go.work`          | Services deploy independently, shared code via explicit dependency   |
| Kafka mode                | KRaft (no Zookeeper)                  | Simpler ops, one less service                                        |
| Kafka topics              | Topic-per-event-type                  | Clean separation, Go engine subscribes only to what it needs         |
| Raw event storage         | ClickHouse                            | Columnar, handles billions of timestamped rows                       |
| Causal graph storage      | Neo4j                                 | Native graph traversal for cause-effect chains                       |
| OTel correlation          | Vector                                | Joins eBPF events with traces on PID + timestamp                     |
| Dev model                 | Split (infra Docker, services native) | Fast iteration, no Docker rebuilds                                   |
| `probe-common` structure  | Per-type modules                      | Clean separation, each type owns its own file                        |
| `probe-ebpf` structure    | Per-hook modules                      | Each hook isolated, easy to add new hooks                            |
| Userspace agent structure | `main.rs` + `publisher.rs`            | Startup/attach separated from drain/publish logic                    |
| Phase 1 ingestion         | Vector ClickHouse sink                | Vector handles Kafka → ClickHouse natively, no Go duplication needed |
| Public site framework     | Astro + MDX                           | Static output, excellent MDX docs support, island architecture       |
| CSS framework             | Tailwind v4                           | Utility-first, pairs well with CSS custom properties for theming     |
| Monorepo structure        | `www/` + `console/` in same repo      | Docs stay in sync with backend changes, single deploy pipeline       |
| Font                      | Raleway variable font                 | Professional, technical aesthetic, single file covers all weights    |

---

## Known Issues / Blockers

- Algolia DocSearch not yet wired — requires live public URL to crawl. Wire up after `www/` is deployed.
- `console/` not yet scaffolded — next immediate task.

---

## Notes

- eBPF requires Linux kernel 5.15+ with BTF support. Local dev on macOS will not run the probe — use Codespaces or a Linux VM for probe development and testing.
- `probe-run` requires `sudo` — eBPF programs need elevated privileges to load into the kernel.
- Neo4j password is `kprobe_secret` — change before any real deployment.
- `go.work` is committed — makes local development easier. CI builds ignore it and use the `replace` directives in individual `go.mod` files.
- Kafka topics: `kernel.tcp`, `kernel.sched`, `kernel.syscall`, `kernel.fault` — one topic per event category.
- `kernel.enriched` — Vector output topic consumed by the Go causal engine.
- Codespaces used for Rust/eBPF development — all other work done locally on Mac.
- `www/` runs on port 4321 in dev (Astro default). Deploy target: Vercel, root directory `www/`.
- `console/` will run on port 5173 in dev (Vite default).
