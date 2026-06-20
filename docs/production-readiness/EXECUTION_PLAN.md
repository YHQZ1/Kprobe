# Execution Plan

The work is an incremental migration, not a repository-wide rewrite. Each phase
has entry requirements and a gate. Legacy paths remain available until their
replacement is verified and rollback-compatible.

## Phase 0: Control and Safety Baseline

Goal: make subsequent work reviewable and stop preventable exposure.

Order:

1. `FOUND-001` CI quality gates.
2. `SEC-001` fail-closed configuration with explicit development mode.
3. `SEC-003` settings endpoint authorization/removal decision.
4. `SEC-007` dependency remediation and repeatable audits.
5. `SEC-008` WebSocket credential/origin hardening.
6. `FOUND-002` truthful documentation and feature labels.
7. `REPLAY-001` disable or explicitly label simulated replay.

Gate P0:

- clean checkout passes required CI;
- production mode cannot start with development credentials;
- no known high-severity dependency advisory lacks an approved exception;
- published setup instructions refer only to repository-supported behavior.

## Phase 1: Event Envelope and Provisioned Contracts

Goal: establish identity and compatibility before changing durability.

Order:

1. Design `CONTRACT-001` envelope and compatibility rules.
2. Add `CONTRACT-002` stable ID and node/boot/producer identity.
3. Provision versioned topics through `CONTRACT-003`.
4. Add external API compatibility under `CONTRACT-005`.
5. Implement the real OTel boundary under `CONTRACT-004`.

Migration:

- introduce `kernel.raw.v1` and `kernel.enriched.v1` beside legacy topics;
- retain a temporary adapter or dual-publisher;
- compare legacy and v1 counts/fields before switching consumers;
- retain rollback consumption for one defined compatibility window.

Gate P1:

- contract tests reject incompatible changes;
- stable IDs survive retries and transformations;
- two nodes with overlapping PID ranges cannot be confused;
- topics are never created implicitly in production.

## Phase 2: Authoritative Durable Ingestion

Goal: make accepted events durable and idempotent.

Order:

1. Implement `DATA-003` idempotent ClickHouse representation.
2. Redesign consumer/batcher acknowledgement for `DATA-001`.
3. Add bounded retry/backpressure for `DATA-002` and `DATA-007`.
4. Make the DLQ durable under `DATA-005`.
5. Add probe outage behavior under `DATA-006`.
6. Build the Phase 2 subset of `TEST-001` concurrently.

Gate P2:

- kill/restart between fetch, batch, send, and commit causes no unexplained loss;
- repeated delivery creates one logical event;
- 60-minute broker and ClickHouse outages have documented bounded behavior;
- every drop is intentional, counted, and alertable.

## Phase 3: Rebuildable Projections and Correct Correlation

Goal: remove Neo4j/live streaming from the ingestion transaction and make
correlation correct for the supported topology.

Order:

1. Implement `DATA-004` independent projection checkpoints and rebuild.
2. Fix `CORR-001`, `CORR-002`, and `CORR-003`.
3. Resolve distributed inference design in `CORR-004`.
4. Implement replica-safe live delivery in `API-001`.
5. Bound API/replay resources through `API-004` and `REPLAY-002`.

Gate P3:

- Neo4j can be deleted and rebuilt from authoritative data;
- projection outage does not block durable ingestion;
- multi-node/PID-reuse fixtures correlate correctly;
- multiple API replicas provide complete defined live streams.

## Phase 4: Security and Service Operability

Goal: create a deployable trust boundary and actionable failure signals.

Order:

1. `SEC-002` identity and authorization.
2. `API-002` rate/concurrency/query controls.
3. `API-003` safe external errors and `OBS-003` structured diagnostics.
4. `OBS-001` and `OBS-002` metrics and health instrumentation.
5. `SEC-004` encrypted service boundaries.
6. `SEC-006` managed secrets and rotation.
7. `OBS-004` alerts, pager routing, and runbooks.

Gate P4:

- anonymous or under-scoped access fails in integration tests;
- secrets rotate without downtime;
- readiness prevents traffic during dependency failure;
- simulated loss/lag/auth abuse reaches an assigned pager and runbook.

## Phase 5: Packaging, EKS, Migrations, and Recovery

Goal: produce a repeatable reference deployment with rollback and recovery.

Order:

1. `DEPLOY-001` application images and supply-chain metadata.
2. `MIG-001` versioned schema lifecycle.
3. `DEPLOY-002` EKS/Helm reference deployment and `SEC-005` scoped probe
   privileges.
4. `DR-001` backup and restore automation.
5. Complete `FOUND-003` release/rollback mechanics.

Gate P5:

- clean environment installs from released artifacts;
- rolling upgrades and rollbacks preserve compatible data contracts;
- capability and network-policy tests pass;
- backup restoration meets declared RPO/RTO.

## Phase 6: Capacity and Launch Qualification

Goal: establish honest operating limits and make the go-live decision from
evidence.

Order:

1. Validate and optimize `SCALE-001`, `SCALE-002`, `SCALE-003`, and
   `SCALE-004`.
2. Complete `TEST-002` supported-kernel matrix.
3. Complete `TEST-003` burst, soak, outage, and recovery tests.
4. Reconcile all published performance and support claims with results.

Gate P6:

- representative 24-hour soak completes within loss/error budgets;
- node and regional capacity limits are documented;
- recovery behavior meets SLO and RPO/RTO targets;
- no Critical or High gap required for launch remains outside `Done`.

## Pull Request Shape

Prefer small vertical changes that close or advance one to three related gaps.
Every PR description should include:

```text
Gap IDs:
Current failure:
New invariant:
Compatibility/migration:
Verification performed:
Metrics/alerts affected:
Rollback or recovery:
Residual risk:
```

Do not combine a broad cleanup with a durability, security, or contract change.
