# Stage 01 backend command failures

## 2026-09-20

- `npx tsc --noEmit` reached the existing `src/utils/browsePath.ts:51:58` error (`Property 'length' does not exist on type 'never'`). The error is outside the stage 01 backend scope and was not changed.
- `npx tsx scripts/verify-remote-session.ts` was blocked by the local Windows process policy (`esbuild` child process `spawn EPERM`); the script was still reviewed statically and the TypeScript compiler reached the backend files.
- A later `npx tsc --noEmit --pretty false` reached an unrelated parent change in `scripts/verify-ai.ts:17:70` (`"local"` is not assignable to `HistoryKind`). No stage 01 backend file caused this diagnostic.
