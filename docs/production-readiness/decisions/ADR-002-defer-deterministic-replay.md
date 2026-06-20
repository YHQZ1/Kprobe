# ADR-002: Defer Deterministic Replay From the Initial Release

- Status: Accepted
- Date: 2026-06-20
- Related gaps: FOUND-002, REPLAY-001, REPLAY-002, API-004

## Context

The repository describes ptrace-based deterministic replay, but the Linux tracer
returns `ErrNotImplemented`. Current behavior is an in-memory timed playback of
stored events, and the console replay page uses static incident data. Building a
real replay engine also introduces process sandboxing, syscall emulation,
artifact compatibility, and significant security requirements.

## Decision

The initial production release will not claim deterministic execution replay.
Existing playback may remain only when labeled as event simulation or timeline
playback. Product documentation and UI must not imply syscall interception or
exact reproduction.

## Consequences

- Recorder durability, identity, querying, and causal projection take priority.
- Replay lifecycle/resource bugs still require containment if simulation remains
  exposed.
- Real ptrace replay requires a separate design, threat model, sandbox, test
  matrix, and release gate.

## Revisit When

Revisit after Phase 6 launch qualification, or earlier only if replay becomes an
explicit launch requirement with dedicated engineering and security capacity.
