# Stage 02 backend command failures

- 2026-09-20: `npx tsx scripts/verify-ai.ts` failed before test execution with Node `spawn EPERM` from `tsx`/`esbuild` service startup. This is an environment/process-launch failure, not an AI contract assertion failure. `npx tsc --noEmit` passed.
- 2026-09-20: `node --experimental-strip-types --experimental-specifier-resolution=node scripts/verify-ai.ts` could not resolve the repository's extensionless TypeScript imports (`server/services/historyStore`). This fallback also did not execute assertions.
- 2026-09-20: After rerunning with `require_escalated`, the fake contract test reached the permission flow but failed because the current parent `AiService` still matches only `requestID`; the pinned v1.2.27 contract returns permission/question objects with `id`. The test intentionally uses the real `id` shape and should pass after the parent service compatibility fix.
