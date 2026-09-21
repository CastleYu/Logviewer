# Agent backend notes

## Verification log

- During implementation, lint caught queue input and new component integration typing errors. These were introduced during this change, not pre-existing user errors. The final integrated `npm run lint` passed.
- `npm run verify:ai` reached the test runner but the restricted Windows process sandbox rejected tsx/esbuild with `spawn EPERM`. This is an environment failure; no application process was started by the test.
- After scoped process-spawn approval, `npm run verify:ai` completed with `verify-ai: ok`; the interruption follow-up on 2026-09-21 reran it and again exited 0. The early EPERM entry above records an environment failure, not the final acceptance status.
- The intermediate AiWorkspace/AiConversation key typing issue was resolved before final lint and browser verification.

## Runtime decisions

- Prompt submissions received while a session is active, paused, or already queued are persisted in FIFO order.
- Abort pauses the queue and retains all pending input. Poll and remote session errors also pause the queue until resume.
- The Windows terminal uses `cmd.exe /k` with an argument-array spawn, the session working directory as `cwd`, and inherited environment variables for authentication; credentials are never placed in the command line.

## Fixture coverage

`scripts/verify-ai-flow.ts` uses a local HTTP fixture with real status, message, permission, event, prompt, abort, and reply endpoints. It covers FIFO order, abort retention and resume, queue removal and missing-id errors, failed prompt preservation, `info.summary` compaction continuation, retry and permission busy states, SSE `session.error` without an assistant message, empty refresh, and abort versus delayed prompt admission.

On 2026-09-21, `npx tsx scripts/verify-ai-flow.ts` passed with the required elevated process-spawn allowance: `verify-ai-flow: ok`. Earlier fixture failures were corrected by returning `/path`'s requested directory, flushing and broadcasting the SSE handshake, resetting abort state per prompt, isolating paused/error scenarios, and awaiting both sides of slow prompt admission.

The expanded boundary run now passes the SSE transport-drop case: the session completes by polling, `streamError` retains the transient disconnect warning, `session.error` remains clear, and a separate clean session is unaffected. A later successful stream connection may clear `streamError`; completion does not require retaining a transport warning forever.

Recommendation for a paused session whose last queue item was removed: keep `queuePaused=true` and let a new prompt join the persisted queue; only the explicit resume action should clear the pause and admit work. This preserves the error/abort boundary and avoids silently bypassing a user-visible pause.
