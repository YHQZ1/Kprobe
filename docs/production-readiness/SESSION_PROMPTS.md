# Session Prompts

Use these prompts to continue the production-readiness program across chats.
The recommended unit of work is one gap per chat. Large gaps may span several
chats using the checkpoint and resume prompts.

## 1. Start a New Gap

```text
Continue the kprobe production-readiness program.

Read AGENTS.md and all required control documents. Select the next unblocked gap in dependency order. Mark it In Progress, implement as much as can be completed safely, run its required verification, and update GAP_REGISTER.md and STATUS.md.

Do not skip dependencies, acceptance criteria, failure-path tests, observability, or recovery requirements. Do not commit unless I ask.
```

## 2. Resume an Unfinished Gap

```text
Resume the active production-readiness gap from STATUS.md.

Inspect the existing changes, continue from the recorded checkpoint, complete the remaining acceptance criteria, run the required verification, and update the control documents. Do not start another gap until this one is properly finished or explicitly blocked.
```

## 3. Finish and Commit a Gap

```text
Perform the final review for the active gap.

Verify every acceptance criterion, run the required tests, inspect the complete diff, and update GAP_REGISTER.md and STATUS.md with evidence and residual risks. If everything passes, mark the gap Done, stage only the related files, and create a focused commit referencing the gap ID. If anything is incomplete, do not commit or mark it Done; record the exact blocker instead.
```

## 4. Pause Without Committing

```text
Create a safe checkpoint for the active gap.

Run all verification currently possible, then update STATUS.md and GAP_REGISTER.md with completed work, remaining work, test results, blockers, modified files, and the precise next action. Leave incomplete work In Progress or Verification. Do not commit.
```

## Recommended Cycle

1. Open a new chat with prompt 1.
2. Continue in that chat until the gap is complete or needs a checkpoint.
3. Use prompt 3 to verify and commit completed work.
4. Use prompt 4 when stopping before completion.
5. Start the next chat with prompt 2 when a gap is still active.
6. After a completed gap, return to prompt 1 for the next dependency-ordered gap.
