# Agent CLI audit command notes

- 2026-09-21: `npm run verify:ai-routes` reached `tsx`, but the restricted Windows process sandbox rejected the tsx/esbuild child process with `spawn EPERM`; no route fixture or application server was started by this attempt.
