# ADR-003: Use Versioned Incremental Contract Migration

- Status: Accepted
- Date: 2026-06-20
- Related gaps: CONTRACT-001, CONTRACT-003, CONTRACT-005, MIG-001

## Context

Current Kafka JSON and HTTP/WebSocket contracts are implicit. A big-bang change
would require simultaneous probe, Vector, engine, API, and storage deployment,
making rollback unsafe and hiding compatibility failures until production.

## Decision

Event and API contracts evolve through explicit versions. New Kafka contracts
are introduced beside legacy topics, with adapters or temporary dual-publishing
at a defined boundary. Readers switch only after comparison and compatibility
verification. Database migrations remain compatible across the rolling-deploy
window.

## Consequences

- Temporary duplicate infrastructure and comparison tooling are expected.
- Every contract defines producer/consumer compatibility and removal criteria.
- Rollback remains possible during a documented compatibility window.
- Legacy paths are deleted only after verification and an observation period.

## Revisit When

This decision is expected to remain permanent. Individual compatibility windows
and topic versions may change through later records.
