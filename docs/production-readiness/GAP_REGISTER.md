# Gap Register

This is the canonical production-readiness backlog. Evidence describes current
behavior; acceptance criteria describe the minimum target. Detailed context is
in [BASELINE.md](BASELINE.md).

## Status Rules

- `Discovered`: verified issue without an approved solution.
- `Designed`: target behavior is known; dependencies or task breakdown remain.
- `Ready`: acceptance criteria and dependencies permit implementation.
- `In Progress`: actively being changed.
- `Verification`: implementation exists but required evidence is incomplete.
- `Done`: all acceptance and verification requirements pass.
- `Blocked`: an explicit external or prerequisite blocker is recorded.

## Foundation and Governance

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| FOUND-001 | Critical | Ready | - | No CI workflow exists; tests are local Make targets (`Makefile:96-105`). | Required checks gate merges: Go race tests, Rust formatting/build/tests on Linux, frontend lint/build/tests, dependency audits, secret scan, and artifact build. |
| FOUND-002 | High | Ready | - | README/docs advertise absent Helm, Kubernetes, installer, Loki, OTel instrumentation, replay, and performance behavior (`README.md:95-103`, `README.md:199-203`). | Unsupported claims are removed or labeled planned; installation commands refer only to shipped, verified artifacts. |
| FOUND-003 | High | Designed | FOUND-001 | There is no controlled release version, changelog, artifact provenance, or rollback record. | Versioned releases produce traceable artifacts, SBOMs, signatures, migration compatibility notes, and rollback instructions. |

## Event Contracts and Identity

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| CONTRACT-001 | Critical | Designed | FOUND-001 | Kafka payloads are implicit JSON with no schema/version (`probe/probe/src/publisher.rs`, `engine/consumer/kafka.go`). | A versioned event envelope and schemas cover every Kafka boundary; compatibility tests gate changes. |
| CONTRACT-002 | Critical | Designed | CONTRACT-001 | Events lack cluster/node/boot/producer identity and stable IDs (`shared/types/event.go:45-61`). | Identity is assigned before initial publish, remains stable across retries/projections, and distinguishes node, boot, and PID reuse. |
| CONTRACT-003 | High | Designed | CONTRACT-001 | Topics auto-create without reviewed partitions, retention, replication, or DLQ settings (`infrastructure/docker/docker-compose.yml:19`). | Topics are provisioned explicitly with documented key, partition, retention, replication, and compatibility policy. |
| CONTRACT-004 | Critical | Designed | CONTRACT-001, CONTRACT-002 | Engine consumes `otel.spans`, but no producer or Collector configuration exists (`engine/consumer/otel.go:26-34`). | A documented OTel ingestion contract exists end to end, includes node/process identity, and has correlation success/miss metrics. |
| CONTRACT-005 | Medium | Designed | CONTRACT-001 | Protobuf package and manual HTTP/WebSocket subsets are unversioned (`api/proto/kprobe.proto:1`). | External API versioning and compatibility policy are explicit; HTTP schemas are generated or contract-tested. |

## Durable Ingestion and Data Integrity

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| DATA-001 | Critical | Designed | CONTRACT-001, CONTRACT-002 | Source offsets commit after an in-memory enqueue, not durable storage (`engine/consumer/kafka.go:77-79`, `engine/main.go:84-93`). | Offsets advance only after authoritative storage acknowledges the complete idempotent batch; crash tests prove the guarantee. |
| DATA-002 | Critical | Designed | DATA-001 | ClickHouse drops batches after three retries (`engine/store/clickhouse.go:87-101`). | Retryable outages apply bounded backpressure/durable retry; permanent loss is impossible without an explicit, alerted operator action. |
| DATA-003 | Critical | Designed | CONTRACT-002, DATA-001 | Event IDs are generated during consumption; retries duplicate rows (`engine/main.go:87`, `infrastructure/clickhouse/schema.sql:24`). | Stable IDs and the storage engine/deduplication design make repeated delivery idempotent; duplicate tests pass. |
| DATA-004 | Critical | Designed | DATA-001 | Neo4j, ClickHouse, and processed Kafka writes can diverge permanently (`engine/inference/engine.go:72-81`). | ClickHouse is authoritative; graph and stream projections have independent checkpoints, retries, lag metrics, and rebuild procedures. |
| DATA-005 | High | Designed | CONTRACT-001, DATA-001 | Invalid source records commit without confirmed DLQ persistence; full channels drop them (`engine/consumer/kafka.go:60-72`, `115-135`). | DLQ publication is durable before source commit; reason, schema version, source location, and replay tooling are preserved. |
| DATA-006 | Critical | Designed | CONTRACT-001 | Probe fallback queues are volatile, bounded at 5,000, silently overflow, and can reorder (`probe/probe/src/publisher.rs:62-82`). | Broker outages use ordered bounded buffering plus durable spooling or a measured explicit loss policy; shutdown drains safely. |
| DATA-007 | High | Designed | DATA-001 | ClickHouse buffer can grow while a detached batch retries (`engine/store/clickhouse.go:42-52`). | All pipeline queues have configured byte/event bounds, backpressure behavior, saturation metrics, and shutdown semantics. |

## Correlation and Inference Correctness

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| CORR-001 | Critical | Designed | CONTRACT-002, CONTRACT-004 | OTel correlation keys spans only by PID/time (`engine/enrich/enricher.go:49`, `86-96`). | Correlation includes node/boot/process identity, handles PID reuse and clock uncertainty, and reports match confidence. |
| CORR-002 | High | Designed | CONTRACT-001 | Syscall pairing accepts any two thread events without operation or direction checks (`engine/enrich/enricher.go:152-160`). | Pairing validates operation/direction, tolerates missing events without cascading false pairs, and is property/failure tested. |
| CORR-003 | High | Designed | CONTRACT-001 | Block pairing omits device despite reading it from tracepoint data (`probe/probe-ebpf/src/block.rs:13-20`). | Device identity participates in event data and pairing; concurrent multi-device tests pass. |
| CORR-004 | High | Discovered | CONTRACT-002, DATA-004 | Inference windows and retained candidates are process-local and cannot preserve cross-partition causality (`engine/inference/engine.go:21-28`). | Partition/event-time design documents supported causal scope; scale-out produces deterministic equivalent projections. |

## API, Replay, and Resource Control

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| API-001 | High | Designed | CONTRACT-003, DATA-004 | API replicas in one Kafka group each see only assigned partitions (`api/main.go:121-125`). | Every authorized subscriber receives its defined stream regardless of replica; fan-out architecture is horizontally testable. |
| API-002 | High | Designed | SEC-002 | Login and public queries have no rate, concurrency, or query-cost control (`api/auth/login.go:28-69`). | Per-identity/IP limits, login throttling, stream quotas, payload caps, and bounded query windows are enforced and measured. |
| API-003 | Medium | Designed | OBS-003 | Backend error details are returned to clients (`api/handlers/causal.go:65-67`). | Clients receive stable safe error codes; detailed causes remain in correlated structured logs. |
| API-004 | High | Designed | DATA-007 | Replay transaction queries and session storage are unbounded (`replay/store/clickhouse.go:30-47`, `replay/session/session.go:58-68`). | Query/session quotas, expiration, cancellation, ownership, and memory bounds are enforced. |
| REPLAY-001 | Critical | Ready | FOUND-002 | Linux ptrace implementation always returns `ErrNotImplemented` while deterministic replay is advertised (`replay/ptrace/ptrace.go:10-30`). | Initial release labels replay as simulation or disables it; deterministic claims require a separately approved implementation and threat model. |
| REPLAY-002 | High | Designed | API-004 | Playback derives from unary RPC context and watchers may miss terminal state (`api/handlers/replay.go:103-106`, `153-190`). | Session lifetime is independent of request lifetime, terminal state is delivered reliably, and lifecycle/concurrency tests pass. |

## Security

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | Critical | Ready | FOUND-001 | API falls back to `admin/admin`, `dev-token`, and a static JWT secret (`api/main.go:35-50`). | Non-development startup fails when credentials are absent/weak; development mode is explicit and cannot be enabled accidentally. |
| SEC-002 | Critical | Designed | SEC-001 | Shared token/JWT has no roles, scopes, issuer/audience, revocation, or tenant boundary (`api/auth/interceptor.go:61-79`). | User OIDC and workload identity authenticate callers; authorization covers read, stream, configure, replay, and administer. |
| SEC-003 | High | Ready | SEC-001 | Settings/reset are unauthenticated and CORS-open (`api/main.go:147-150`, `api/handlers/settings.go:51-55`). | Settings require authorization; mutable settings have ownership, audit, persistence, and actual runtime effect or are removed. |
| SEC-004 | Critical | Designed | SEC-002, DEPLOY-002 | Service protocols are plaintext and several infrastructure ports bind to all host interfaces (`infrastructure/docker/docker-compose.yml`). | TLS/mTLS and broker/database auth are enforced; infrastructure is private by default and network-policy tested. |
| SEC-005 | Critical | Designed | DEPLOY-002 | No deployment definition scopes eBPF privileges (`probe/probe/src/main.rs:40-46`). | Runtime uses the minimum supported capabilities, read-only mounts/filesystems where possible, seccomp/AppArmor, and a documented kernel threat model. |
| SEC-006 | High | Designed | DEPLOY-002 | Secrets use environment variables and committed development defaults; no rotation integration exists. | Managed secret-store injection, least-privilege access, rotation, redaction, and emergency revocation are tested. |
| SEC-007 | High | Ready | FOUND-001 | Current lockfiles contain known high/moderate advisories (`console/pnpm-lock.yaml:365`, `www/pnpm-lock.yaml:874`). | Audits pass at the approved threshold; unused vulnerable dependencies are removed and exceptions are documented with expiry. |
| SEC-008 | High | Ready | FOUND-001 | WebSocket token is in the URL and server accepts every origin (`console/src/hooks/useConnection.tsx:12-17`, `api/main.go:139-141`). | Browser authentication avoids URL credentials; allowed origins and proxy behavior are explicit and tested. |

## Observability and Operations

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| OBS-001 | Critical | Designed | DATA-001, DATA-006 | Metrics omit Kafka lag/commits, permanent storage loss, projection failures, producer backlog, and exported probe drops (`engine/metrics/metrics.go`). | Golden signals and explicit loss/lag/backlog metrics exist for every stage with bounded cardinality. |
| OBS-002 | High | Designed | OBS-001 | API health checks configuration presence instead of dependency readiness; engine/probe have none (`api/main.go:151-159`). | Every service has liveness and dependency-aware readiness used by orchestration and rollout. |
| OBS-003 | High | Designed | FOUND-001 | Logs are unstructured and kprobe does not trace itself; Jaeger is unused by application code. | Structured correlated logs, safe error taxonomy, and targeted service traces cover critical paths. |
| OBS-004 | Critical | Designed | OBS-001, OBS-002 | Dashboard exists but no alert rules, pager routing, or runbooks exist (`infrastructure/observability/prometheus.yml`). | Loss, lag, auth abuse, saturation, dependency, and backup alerts page an owner and link to tested runbooks. |

## Scalability, Deployment, and Recovery

| ID | Sev | Status | Depends on | Gap and evidence | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| SCALE-001 | Critical | Designed | CONTRACT-003, CORR-004 | Topic/consumer layout has no validated horizontal scaling model. | Partition and consumer counts are capacity-derived; rebalance and replica tests preserve required ordering/correlation. |
| SCALE-002 | High | Designed | DATA-007 | Probe serially awaits Kafka delivery and logs every successful event (`probe/probe/src/publisher.rs`). | Producer batching/concurrency meets measured targets without unbounded memory or hidden loss; hot-path logs are sampled/aggregated. |
| SCALE-003 | High | Designed | CONTRACT-002 | Probe captures broad host activity without workload/event filters. | Supported include/exclude filters and sampling policies are remotely/configurably enforced with overhead measurements. |
| SCALE-004 | High | Discovered | DATA-004 | Cross-process inference may compare each blocking event with 5,200 candidates (`engine/inference/engine.go:146-159`). | CPU/memory/edge amplification are bounded at target rates; algorithm is optimized from measured profiles. |
| DEPLOY-001 | Critical | Designed | FOUND-001, SEC-001 | No application Dockerfiles or artifact pipeline exist. | Reproducible minimal non-root images, SBOMs, signatures, health metadata, and version pinning are produced by CI. |
| DEPLOY-002 | Critical | Designed | DEPLOY-001, SEC-004, SEC-005 | Referenced Kubernetes/Helm artifacts are absent (`README.md:199-203`). | EKS reference deployment includes resources, probes, PDBs, topology, capabilities, identities, network policy, and upgrade/rollback tests. |
| MIG-001 | High | Designed | DATA-001, DATA-004 | ClickHouse/Neo4j schemas are not versioned; ClickHouse index additions are not idempotent (`infrastructure/clickhouse/schema.sql:30-40`). | Ordered repeatable forward migrations, compatibility checks, and rollback/restore strategy support rolling deploys. |
| DR-001 | Critical | Designed | DEPLOY-002, MIG-001 | No ClickHouse/Neo4j backup or restore process exists. | RPO/RTO are defined; encrypted scheduled backups and clean-environment restores pass regularly. |
| TEST-001 | Critical | Designed | FOUND-001, DATA-001 | No integration tests cover broker/database outage, rebalance, duplicates, or crashes. | Automated failure matrix proves delivery and recovery invariants under outage and restart. |
| TEST-002 | Critical | Designed | FOUND-001, CONTRACT-001 | eBPF tests cover ABI layout only (`probe/probe-common/src/lib.rs:26-67`). | Linux harness loads/attaches probes, validates events across supported kernels, forces overflow, and verifies drop accounting. |
| TEST-003 | Critical | Designed | SCALE-001, OBS-001, DEPLOY-002 | No load, soak, capacity, or published-overhead evidence exists. | Reproducible burst/soak/failure tests establish per-node limits, storage growth, loss, recovery time, and overhead budgets. |
