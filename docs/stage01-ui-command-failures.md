# Stage 01 UI command failures

## 2026-09-20

- `npm run verify:sftp-browse` reached the script but `tsx` failed before transforming TypeScript with `Error [TransformError]: spawn EPERM` from its esbuild child process. This is an execution environment failure, not a browse assertion failure.
- `npx tsc --noEmit` completed successfully after the UI changes.
