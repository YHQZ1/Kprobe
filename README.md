<div align="center">

# kprobe

<p align="center">
  Deep kernel observability for financial systems.<br/>
  eBPF-powered causal graphs and deterministic replay — see what every other tool can't.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-1.77-000000?style=flat-square&logo=rust&logoColor=white" />
  <img src="https://img.shields.io/badge/Go-1.22-00ADD8?style=flat-square&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-007ACC?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/Apache_Kafka-KRaft-231F20?style=flat-square&logo=apachekafka&logoColor=white" />
  <img src="https://img.shields.io/badge/ClickHouse-FFCC01?style=flat-square&logo=clickhouse&logoColor=black" />
  <img src="https://img.shields.io/badge/Neo4j-5-008CC1?style=flat-square&logo=neo4j&logoColor=white" />
  <img src="https://img.shields.io/badge/gRPC-Protocol_Buffers-244c5a?style=flat-square" />
  <img src="https://img.shields.io/badge/OpenTelemetry-Collector-000000?style=flat-square&logo=opentelemetry&logoColor=white" />
  <img src="https://img.shields.io/badge/Jaeger-Tracing-60D0E4?style=flat-square&logo=jaeger&logoColor=white" />
  <img src="https://img.shields.io/badge/Prometheus-Metrics-E6522C?style=flat-square&logo=prometheus&logoColor=white" />
  <img src="https://img.shields.io/badge/Grafana-Loki-F46800?style=flat-square&logo=grafana&logoColor=white" />
  <img src="https://img.shields.io/badge/Kubernetes-326CE5?style=flat-square&logo=kubernetes&logoColor=white" />
  <img src="https://img.shields.io/badge/Helm-Charts-0F1689?style=flat-square&logo=helm&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Astro-FF5D01?style=flat-square&logo=astro&logoColor=white" />
</p>

</div>

---

## Overview

Every observability tool in existence sits at the application layer. They only see what your code explicitly tells them. When something breaks in a financial system at 3am — a stuck transaction, a failed settlement, money in limbo — engineers are left hunting through incomplete logs, misaligned timestamps, and a system state that has already changed by the time anyone investigates.

kprobe sits at the Linux kernel level using eBPF. It attaches silently to kernel hooks and captures everything — network packet timing, CPU scheduling decisions, memory pressure events, database write latency — without touching a single line of your application code. When an incident occurs, it constructs a full causal graph of exactly what caused what, down to the kernel-level event that triggered the failure. And it lets you replay the entire incident deterministically, on your laptop, hours after it happened.

It is not a monitoring tool. It is not a tracing tool. It is a flight recorder and a debugger for your entire distributed financial system.

---

## The Problem

When a payment fails in production, the typical investigation looks like this:

- Check Datadog. See a latency spike. No root cause.
- Scan logs across 6 microservices. Timestamps don't align across nodes.
- Query the database. The transaction is in an ambiguous intermediate state.
- Page the on-call engineer at 3am.
- Spend 4 hours reconstructing what happened from incomplete, after-the-fact evidence.
- Never fully confirm the root cause. Ship a guess as a fix.

This happens because of a structural gap in observability. Every popular tool — Datadog, New Relic, Jaeger, Honeycomb, OpenTelemetry — operates above your application code. They see only what you explicitly instrument. The most dangerous bugs in financial systems happen below your code, at the operating system level: a kernel scheduler delaying a critical write by 50ms, memory pressure from a background job causing a GC pause at exactly the wrong moment, a TCP retransmit that pushed a settlement past its clearing window.

Nobody logs that. No existing tool sees it. kprobe does.

---

## How It Works

kprobe has three core components that work together continuously from the moment of deployment.

### The Recorder

An eBPF probe runs as a Kubernetes DaemonSet on every node in the cluster. It attaches to kernel-level tracepoints and kprobes — `tcp_sendmsg`, `tcp_recvmsg`, `sys_read`, `sys_write`, `sched_switch`, `mm_page_fault` — and captures every relevant event with nanosecond precision. No application code changes. No library imports. No redeployment.

The probe is written entirely in Rust using the [Aya](https://aya-rs.dev) framework — both the kernel-side eBPF programs and the userspace loader. Aya compiles Rust directly to eBPF bytecode, meaning the entire probe stack is memory-safe from the kernel up, with no C code anywhere in the codebase.

The userspace agent loads the eBPF programs into the kernel, manages perf ring buffers, and streams structured events into Kafka.

Every captured event includes:

- Nanosecond timestamp
- Process ID and thread ID
- CPU core
- Event type and associated data
- Duration

### The Causal Engine

Raw kernel events alone are noise. The causal engine, written in Go, consumes the enriched event stream from Kafka and builds a directed causal graph that answers not just what happened but why it happened.

Before analysis, Vector correlates the raw eBPF event stream with existing OpenTelemetry traces from your services by matching process IDs and timestamps. This gives every kernel event full financial context — it is no longer `PID 2847 made a write syscall`, it is `settlement #4821 ledger write, triggered by payment #98721`.

The engine then performs causal inference across the enriched stream:

- Groups events into time windows and identifies shared resources
- Draws causal edges between events where one demonstrably triggered the other
- Maps kernel primitives to financial domain concepts — settlement boundaries, ledger writes, clearing windows, order book operations
- Writes the resulting graph to Neo4j as a live, queryable causal structure

The output is not a log. It is a precise, traversable graph of cause and effect across your entire system, from the financial event at the top to the kernel decision at the bottom.

### The Replay Engine

Once an incident is recorded, it can be reproduced exactly. The replay engine uses Linux `ptrace` to intercept system calls of a sandboxed process and serve them from the recorded event log instead of the real kernel. The application behaves exactly as it did in production — same inputs, same timing, same kernel responses.

This enables:

- Reproducing a 3am production bug on a development machine at 10am
- Injecting artificial timing changes — increase a timeout, add network latency, slow a database write
- Testing proposed fixes against the exact incident before deploying to production
- Fuzzing timing variations across the same incident to surface race conditions

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Production Cluster              │
│                                              │
│   Service A ──► Service B ──► Service C      │
│        │                          │          │
│   kernel events            OTel traces       │
└────────┼──────────────────────────┼──────────┘
         │                          │
         ▼                          ▼
    eBPF Probes               OpenTelemetry
   (pure Rust/Aya)            (existing setup)
         │                          │
         ▼                          │
       Kafka ◄──────────────────────┘
  (raw_kernel_events)
         │
         ▼
       Vector
(PID + timestamp correlation)
         │
    ─────┴─────
    │         │
    ▼         ▼
ClickHouse   Go Causal Engine
 (raw store)       │
                   ▼
                 Neo4j
             (causal graph)
                   │
            Go gRPC API
                   │
         ──────────┴────────
         │                 │
   D3.js Graph       ECharts Timeline
   (causality)       (nanosecond view)
                           │
                      Replay Engine
                      (Go + ptrace)
```

---

## Repository Structure

```
kprobe/
├── probe/                    # eBPF probe — pure Rust/Aya, kernel-level capture
│   ├── probe/                # Userspace agent — loads probes, manages ring buffers, streams to Kafka
│   ├── probe-ebpf/           # Kernel-side eBPF programs (Rust → eBPF bytecode)
│   └── probe-common/         # Shared event types between kernel and userspace
│
├── engine/                   # Causal inference engine — Go
│   ├── consumer/             # Kafka event consumption
│   ├── inference/            # Causal graph construction
│   ├── graph/                # Neo4j interaction
│   ├── store/                # ClickHouse interaction
│   └── domain/               # Financial primitives (settlement, order, ledger)
│
├── replay/                   # Deterministic replay engine — Go
│   ├── ptrace/               # Syscall interception via ptrace
│   ├── session/              # Replay session lifecycle
│   ├── injector/             # Timing injection and failure simulation
│   └── store/                # ClickHouse event retrieval for replay
│
├── api/                      # gRPC API server — Go
│   ├── proto/                # Protobuf definitions
│   ├── handlers/             # gRPC handler implementations
│   └── stream/               # WebSocket live event streaming
│
├── shared/                   # Shared Go module — types and domain primitives
│   ├── types/                # Common event types (KernelEvent, EventType)
│   └── domain/               # Financial domain types (Settlement, Order, LedgerEntry)
│
├── www/                      # Public website — Astro + MDX
│   └── src/
│       ├── components/       # Navbar, Footer, DocsSidebar, SearchModal
│       ├── layouts/          # Layout.astro, DocsLayout.astro
│       ├── pages/            # Landing page, compare, about, 404
│       │   └── docs/         # Full documentation — 14 pages across 5 sections
│       └── styles/           # Global CSS, design tokens
│
├── console/                  # Local dashboard — React + TypeScript (in progress)
│   └── src/
│       ├── components/       # Reusable UI components
│       ├── views/            # Causal graph, timeline, replay panel, live stream
│       ├── hooks/            # WebSocket hook, data fetching
│       └── lib/              # D3, ECharts setup, gRPC client
│
└── infrastructure/
    ├── docker/               # Docker Compose for local infrastructure
    ├── helm/                 # Helm chart for Kubernetes deployment
    ├── k8s/                  # Raw Kubernetes manifests
    └── observability/        # Prometheus, Grafana, Loki, Jaeger configs
```

---

## Tech Stack

### Data Collection

| Component                 | Technology      | Details                                                                                                                                                                                     |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel-side eBPF programs | Rust + Aya      | Attached to tracepoints — `tcp_sendmsg`, `tcp_recvmsg`, `sys_read`, `sys_write`, `sched_switch`, `mm_page_fault`. Compiled to eBPF bytecode via Aya — no C, memory-safe from the kernel up. |
| Userspace probe agent     | Rust 1.77 + Aya | Loads eBPF programs, manages perf ring buffers, batches and streams events to Kafka.                                                                                                        |

### Event Pipeline

| Component         | Technology           | Details                                                                                                                                                                                  |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event transport   | Apache Kafka (KRaft) | High-throughput kernel event streaming. Topic-per-event-type, durable, replayable. Handles millions of events per second. Runs in KRaft mode — no Zookeeper dependency.                  |
| Correlation layer | Vector               | Joins raw eBPF events with OpenTelemetry traces on PID and timestamp. Enriches every kernel event with financial transaction context before routing to ClickHouse and the causal engine. |

### Storage

| Component          | Technology | Details                                                                                                                                                                                 |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw event store    | ClickHouse | Columnar storage for billions of timestamped kernel events. Used for timeline queries, replay event retrieval, and analytical aggregations. Sub-second queries on billion-row datasets. |
| Causal graph store | Neo4j 5    | Graph database for causal relationships. Cypher queries traverse the causal chain from any financial event back to the root kernel cause in milliseconds.                               |

### Analysis and API

| Component           | Technology                        | Details                                                                                                                                             |
| ------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Causal graph engine | Go 1.22                           | Consumes enriched Kafka stream, performs causal inference, writes graph edges to Neo4j, streams live causal updates to the API layer.               |
| Replay engine       | Go 1.22 + ptrace                  | Intercepts syscalls of sandboxed processes via ptrace and replays them from ClickHouse event log. Supports timing injection and failure simulation. |
| API server          | Go 1.22 + gRPC + Protocol Buffers | Serves the frontend, manages replay sessions, streams live kernel events, queries ClickHouse and Neo4j.                                             |

### Frontend

| Component         | Technology                  | Details                                                                                                                                                                   |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public website    | Astro 6 + MDX + Tailwind v4 | Marketing site, full documentation (14 pages), compare page, about page. Deployed statically.                                                                             |
| Dashboard shell   | React 18 + TypeScript 5.0   | Local console — main application shell, routing, state management.                                                                                                        |
| Causal graph view | D3.js                       | Fully custom interactive graph rendering. Nodes are events, edges are causal relationships, colour-coded by latency impact. Click any node to drill down to kernel level. |
| Timeline view     | Apache ECharts              | Nanosecond-precision horizontal timeline across all services and kernel events simultaneously. Zoomable to microsecond level.                                             |
| Live event stream | WebSockets                  | Streams kernel events from the Go API to the dashboard in real time.                                                                                                      |

### Internal Observability

| Component           | Technology              | Details                                                                                            |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Instrumentation     | OpenTelemetry Collector | Standard SDK across all Go services for traces, metrics, and logs.                                 |
| Distributed tracing | Jaeger                  | Traces calls across causal engine, replay engine, and API server.                                  |
| Metrics             | Prometheus              | Events/sec through Kafka, causal engine throughput, ClickHouse query latency, eBPF probe overhead. |
| Dashboards and logs | Grafana + Loki          | Single pane for all internal metrics and structured logs.                                          |

### Infrastructure

| Component         | Technology     | Details                                                                                        |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Orchestration     | Kubernetes     | eBPF probe deployed as DaemonSet across all nodes. All other services as standard Deployments. |
| Packaging         | Helm           | Single `helm install` deploys the full stack into any existing cluster.                        |
| Local development | Docker Compose | Infrastructure only (Kafka, ClickHouse, Neo4j). Services run natively for fast iteration.      |

---

## What kprobe Sees That Other Tools Cannot

| Signal                        | Datadog | Jaeger  | OpenTelemetry      | kprobe                     |
| ----------------------------- | ------- | ------- | ------------------ | -------------------------- |
| Application logs              | Yes     | No      | Yes                | Yes                        |
| Distributed traces            | Yes     | Yes     | Yes (instrumented) | Yes (zero instrumentation) |
| Database query timing         | Partial | Partial | Partial            | Yes                        |
| CPU scheduling decisions      | No      | No      | No                 | Yes                        |
| Memory pressure events        | No      | No      | No                 | Yes                        |
| Network packet-level timing   | No      | No      | No                 | Yes                        |
| Cross-process causal chain    | No      | No      | No                 | Yes                        |
| Root cause to kernel level    | No      | No      | No                 | Yes                        |
| Deterministic incident replay | No      | No      | No                 | Yes                        |
| Financial domain context      | No      | No      | No                 | Yes                        |

---

## A Real Incident, End to End

A payment of ₹50,000 fails to settle at 2:47am. The user receives an error. Money is in limbo.

**Without kprobe:** engineers wake up, spend hours correlating logs across services, never isolate the kernel-level cause, and ship a guess.

**With kprobe:** the engineer opens the dashboard at 10am. kprobe was recording the entire time. She searches for the transaction. The causal graph renders immediately:

```
[Payment #98721 Received]
         |  0.4ms
[Risk Check Passed]
         |  1.2ms
[Settlement Write Initiated]
         |
[KERNEL: Memory Pressure Event]  <── batch job PID 4721 competing for RAM
         |  800ms delay
[Settlement Write Completed]
         |
[TIMEOUT: payment-handler exceeded 750ms threshold]  <── root cause
         |
[Payment Failed]
```

The settlement write took 800ms because a background batch job caused kernel memory pressure at exactly that moment. The payment handler timeout was 750ms. The write completed 50ms too late.

She clicks Replay. Increases the timeout to 1500ms. Replays the exact incident. The payment succeeds. She ships the fix with confidence.

Total investigation time: under 5 minutes.

---

## Local Development

kprobe uses a split dev model — infrastructure runs in Docker, services run natively. This means no Docker rebuilds on every code change.

### Prerequisites

- Go 1.22+
- Rust 1.77+ with `cargo`
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- Linux kernel 5.15+ (for eBPF — required on the target system, not your dev machine)

### Getting Started

Clone the repository:

```bash
git clone https://github.com/YHQZ1/kprobe
cd kprobe
```

Start infrastructure (Kafka, ClickHouse, Neo4j):

```bash
make infra
```

Run services natively in separate terminals:

```bash
make engine    # terminal 1 — causal engine
make api       # terminal 2 — gRPC API server on :8080
make replay    # terminal 3 — replay engine
make web       # terminal 4 — React console on :5173
```

Run the public website:

```bash
cd www && pnpm dev   # Astro dev server on :4321
```

Tear down infrastructure when done:

```bash
make infra-down
```

### Local Service Ports

| Service      | Port |
| ------------ | ---- |
| API (gRPC)   | 8080 |
| Console      | 5173 |
| www (Astro)  | 4321 |
| Kafka        | 9092 |
| ClickHouse   | 8123 |
| Neo4j (HTTP) | 7474 |
| Neo4j (Bolt) | 7687 |

---

## Production Deployment

kprobe deploys into any Kubernetes cluster with a single Helm command. No changes to existing services are required.

```bash
helm repo add kprobe https://charts.kprobe.io
helm install kprobe kprobe/kprobe --namespace monitoring --create-namespace
```

Access the dashboard:

```bash
kubectl port-forward svc/kprobe-dashboard 3000:3000 -n monitoring
```

### Production Prerequisites

- Kubernetes 1.26+
- Linux kernel 5.15+ on all nodes (eBPF BTF support required)
- Helm 3.x
- 4 CPU / 8GB RAM minimum per node for probe overhead

---

## Roadmap

### Phase 1 — Core Pipeline

- [x] eBPF probe: TCP, database write, CPU scheduling, and memory pressure hooks
- [x] Rust/Aya userspace loader with ring buffer management
- [x] Kafka pipeline with topic-per-event-type schema
- [x] Vector correlation layer joining eBPF events with OpenTelemetry traces
- [x] ClickHouse ingestion pipeline and time series schema

### Phase 2 — Causal Intelligence

- [x] Causal graph engine v1 — event windowing and causal inference
- [x] Neo4j graph model and Cypher query library
- [x] Financial domain primitives — settlement boundaries, clearing windows, ledger writes
- [x] gRPC API server with streaming support

### Phase 3 — Public Website

- [x] Astro + MDX + Tailwind v4 — full public site
- [x] Landing page — hero, causal trace visual, capabilities, comparison table, stack, install
- [x] Full documentation — 14 pages: introduction, installation, quickstart, how it works, architecture, dashboard guides, API reference, configuration, security, FAQ
- [x] Compare page — structural gap analysis, tool-by-tool breakdown, capability matrix
- [x] About page — origin, design philosophy, technical foundations
- [x] Navbar with search modal (⌘K), theme toggle, GitHub link
- [x] Docs layout with sticky sidebar and mobile drawer
- [x] 404 page

### Phase 4 — Console Dashboard

- [ ] React dashboard shell — routing, state management
- [ ] D3.js causal graph view — interactive, colour-coded by latency
- [ ] ECharts timeline view — nanosecond precision, zoomable
- [ ] WebSocket hook — live event streaming from API
- [ ] Replay panel UI

### Phase 5 — Replay Engine

- [ ] Deterministic replay engine with ptrace syscall interposition
- [ ] Timing injection and failure simulation in replay panel
- [ ] Fix verification workflow — replay with proposed changes before production deploy

### Phase 6 — Production Readiness

- [ ] Helm chart for single-command Kubernetes deployment
- [ ] OpenTelemetry export for compatibility with existing Jaeger and Tempo setups
- [ ] Internal observability — Prometheus metrics, Jaeger traces, Loki logs, Grafana dashboards
- [ ] Performance benchmarks and probe overhead documentation

---

## Contributing

kprobe is in active early development. If you work on financial infrastructure, observability tooling, or low-level systems and want to contribute or share feedback, open an issue.
