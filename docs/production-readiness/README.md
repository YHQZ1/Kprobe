# Production Readiness Control Plane

This directory is the source of truth for moving kprobe from a working demo to
a production-capable kernel observability service. It exists so implementation
can continue coherently across engineers, pull requests, and Codex sessions.

## Documents

| Document | Purpose |
| --- | --- |
| [BASELINE.md](BASELINE.md) | Audited behavior and constraints as of 2026-06-20 |
| [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) | Required component boundaries and guarantees |
| [GAP_REGISTER.md](GAP_REGISTER.md) | Canonical, dependency-aware issue inventory |
| [EXECUTION_PLAN.md](EXECUTION_PLAN.md) | Ordered phases, migration approach, and release gates |
| [STATUS.md](STATUS.md) | Current phase, active work, blockers, and resume point |
| [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) | Tests and evidence required to close gaps |
| [SESSION_PROMPTS.md](SESSION_PROMPTS.md) | Copy-ready prompts for starting, resuming, committing, or pausing work |
| [decisions/](decisions/) | Architecture decision records |

## Status Vocabulary

`Discovered -> Designed -> Ready -> In Progress -> Verification -> Done`

An item may move to `Blocked` from any active state. `Done` is deliberately
strict: the implementation, tests, metrics, documentation, and recovery or
rollback behavior must all satisfy the acceptance criteria.

## Scope of the First Production Release

The initial production target is:

- reliable Linux kernel event capture;
- durable and queryable event storage;
- trace/service correlation where identity is available;
- rebuildable causal graph projections;
- authenticated query and live-stream APIs;
- observable, recoverable deployment behavior.

Real ptrace-based deterministic replay is excluded until the recorder and event
history are trustworthy. The existing replay UI and event playback may remain
available as an explicitly labeled simulation.

## Change Protocol

Every production-readiness change must identify its gap IDs, preserve or define
a rollback path, and run the relevant verification tier. Changes that alter an
event contract, durability guarantee, security boundary, or authoritative data
owner also require an architecture decision record.
