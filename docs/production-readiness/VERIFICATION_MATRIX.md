# Verification Matrix

Verification is evidence for a guarantee, not a final cleanup step. Commands
listed here are minimums; gap-specific failure tests remain mandatory.

## Tiers

### V0: Fast local checks

Run for narrow documentation, configuration, and isolated logic changes:

```bash
cd engine && go test ./...
cd api && go test ./...
cd replay && go test ./...
cd shared && go test ./...
cd console && pnpm lint && pnpm build
cd www && pnpm build
docker compose -f infrastructure/docker/docker-compose.yml config --quiet
```

### V1: Merge checks

Run in controlled CI for every production change:

- Go formatting, vet, race tests, and coverage threshold;
- Rust formatting, Clippy, unit tests, and reproducible probe build on Linux;
- frontend lint, type check, tests, and production builds;
- protobuf/schema generation drift check;
- `govulncheck`, `cargo audit`, and production Node dependency audits;
- secret scanning, SBOM generation, and license policy check;
- Compose/Helm/Kubernetes validation when those artifacts exist.

### V2: Component integration

Required for contracts, storage, consumers, authentication, and migrations:

- real Kafka, ClickHouse, and Neo4j containers pinned to supported versions;
- schema/migration application from empty and previously released states;
- producer/consumer compatibility fixtures;
- authentication/authorization negative tests;
- duplicate, poison-message, timeout, and cancellation tests.

### V3: Failure and recovery

Required for durability, projection, deployment, and disaster-recovery gaps:

- broker unavailable and partition leader change;
- consumer rebalance during active batches;
- process kill before/after authoritative write and before/after commit;
- ClickHouse unavailable, slow, and acknowledging duplicates;
- Neo4j unavailable and full projection rebuild;
- queue saturation, disk-spool saturation, and graceful shutdown deadline;
- secret rotation and certificate expiry/rotation;
- backup restore into a clean environment;
- rolling upgrade and rollback across compatible contract versions.

### V4: Linux eBPF qualification

Required for probe and supported-platform claims:

- build, verifier load, and attach on each supported kernel family;
- expected field values for all eleven attachments;
- ABI compatibility and tracepoint layout validation;
- ring-buffer overflow and drop-counter accuracy;
- workload/cgroup filter correctness;
- capability-minimized deployment test;
- detach, shutdown, reboot, and agent restart behavior.

### V5: Capacity and launch

Required before external production use:

- representative burst and 24-hour soak tests;
- broker/database outage during sustained load;
- target node count and partition/replica topology;
- CPU, memory, network, disk, queue, lag, and loss budgets;
- ClickHouse growth/TTL and Neo4j projection growth;
- query latency under ingestion load;
- alert delivery and operator runbook exercise;
- documented maximum supported rates and degradation behavior.

## Gap-to-Tier Requirements

| Gap family | Minimum tiers |
| --- | --- |
| `FOUND-*` | V0, V1 |
| `CONTRACT-*` | V0, V1, V2 |
| `DATA-*` | V1, V2, V3; V5 before launch |
| `CORR-*` | V1, V2; V4 where probe fields change; V5 for distributed scope |
| `API-*` | V1, V2; V3 for replica/lifecycle behavior |
| `REPLAY-*` | V1, V2, V3; separate sandbox/security qualification for real ptrace |
| `SEC-*` | V1, V2; V3 for rotation/network/deployment behavior |
| `OBS-*` | V1, V2, V3; V5 alert exercise |
| `SCALE-*` | V2, V3, V5 |
| `DEPLOY-*` | V1, V2, V3, V4 |
| `MIG-*`, `DR-*` | V2, V3 |
| `TEST-*` | The tier implemented by the gap plus V1 |

## Production Release Evidence

A release candidate must preserve:

- CI run and artifact digests;
- schema and migration versions;
- supported event contract versions;
- failure-test results;
- load-test environment and results;
- known exceptions with owner and expiry;
- backup/restore result and measured RPO/RTO;
- rollback result;
- alert/runbook exercise result.
