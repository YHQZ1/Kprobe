# kprobe Engineering Continuity

This repository is undergoing a production-readiness refactor. Before changing
production behavior, read these files in order:

1. `docs/production-readiness/STATUS.md`
2. `docs/production-readiness/EXECUTION_PLAN.md`
3. The active entries in `docs/production-readiness/GAP_REGISTER.md`
4. `docs/production-readiness/TARGET_ARCHITECTURE.md`
5. Relevant records in `docs/production-readiness/decisions/`

`GAP_REGISTER.md` is the canonical issue inventory. `STATUS.md` is the canonical
resume point. Do not create a second backlog or progress log elsewhere.

## Working Rules

- Preserve the working local demo while production-safe paths are introduced.
- Work in dependency order; do not start a gap whose prerequisites are open.
- Reference gap IDs in implementation notes and commits.
- Keep a gap in `Verification` until its required failure-path tests pass.
- `Done` requires code, tests, operational signals, documentation, and a
  rollback or recovery story where applicable.
- Kafka is the durable ingestion boundary, ClickHouse is the authoritative
  event store, and Neo4j/live streams are rebuildable projections.
- Do not add a distributed transaction across Kafka, ClickHouse, and Neo4j.
- Do not claim deterministic replay until real ptrace-based execution exists.
- Do not expose development credentials or development infrastructure as
  production defaults.
- Never replace evidence from the audit with assumptions. Mark behavior that
  needs Linux, load, failure, or recovery testing as unverified.

## Updating Project State

Before editing code, set the selected gap to `In Progress` and update the active
work section in `STATUS.md`. After implementation:

1. Run the commands assigned by `VERIFICATION_MATRIX.md`.
2. Record results and residual risk in `STATUS.md`.
3. Move the gap to `Verification` or `Done` as justified.
4. Add an architecture decision record when a durable boundary or guarantee
   changes.