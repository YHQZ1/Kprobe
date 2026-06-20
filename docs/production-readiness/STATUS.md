# Production Readiness Status

Last updated: 2026-06-20

## Current Position

- Current phase: Phase 0 ready to begin.
- Production status: blocked; working local prototype only.
- Active implementation gaps: none.
- Control documents: established and consistency-checked on 2026-06-20.
- Last verified commit: `2453bb4` on `main` at audit time.
- Worktree at audit completion: clean.

## Next Three Tasks

1. Start `FOUND-001`: add merge-gating CI with environment-correct Linux/Rust
   handling and repeatable security audits.
2. Start `SEC-001`: introduce explicit runtime mode and fail-closed production
   configuration without breaking `make dev`.
3. Start `SEC-007`: remediate audited Node advisories and make dependency
   scanning a CI gate.

## Decisions in Force

- ClickHouse is authoritative; Neo4j and live delivery are projections.
- Initial production scope excludes deterministic ptrace replay.
- Contract migration is versioned and incremental, not big-bang.
- Kubernetes/EKS is the first production reference deployment.

See [decisions/](decisions/) for rationale and consequences.

## Known Tooling Constraints

- Audit host is macOS; eBPF runtime verification requires Linux.
- Installed Go 1.26.3 coverage tooling is incomplete (`covdata` absent).
- Installed `govulncheck` is incompatible with the active Go toolchain.
- `cargo-audit`, `bpf-linker`, and CMake were unavailable during the audit.
- CI must supply controlled toolchain versions rather than inherit these host
  constraints.

## Recent Verification

| Date | Scope | Result |
| --- | --- | --- |
| 2026-06-20 | Go `go test -race ./...` across engine/api/replay/shared | Passed |
| 2026-06-20 | Console ESLint and production build | Passed |
| 2026-06-20 | Public website production build | Passed, 61 pages |
| 2026-06-20 | Docker Compose configuration parse | Passed |
| 2026-06-20 | Console production dependency audit | Failed: 3 high, 3 moderate |
| 2026-06-20 | Website production dependency audit | Failed: 4 high, 3 moderate, 2 low |
| 2026-06-20 | Rust workspace tests | Unverified on macOS; build prerequisites absent |
| 2026-06-20 | Go/Rust vulnerability audit | Unverified due local tool mismatch/absence |

## Blockers

No Phase 0 implementation blocker is known. External infrastructure and
identity-provider details become necessary in Phases 4-5; until then, interfaces
should be designed behind explicit configuration and test doubles.

## Resume Procedure

1. Confirm the worktree and current branch before editing.
2. Re-run the baseline fast checks from `VERIFICATION_MATRIX.md`.
3. Move `FOUND-001` to `In Progress` in `GAP_REGISTER.md`.
4. Replace this document's active task and record the intended verification.
5. Implement only the selected gap and its direct prerequisites.
