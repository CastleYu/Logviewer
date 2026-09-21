# Agent live chain acceptance

`verify:opencode-live` now covers two paths in one isolated run:

1. The existing direct OpenCode 1.2.27 smoke checks create a session, verify auth/path/catalog routes, send one `prompt_async`, and confirm the local OpenAI compatible model fixture returns an assistant message.
2. A second phase creates a temporary `HistoryStore` fixture log, starts `AiService` with the already running OpenCode endpoint, mounts `registerAiRoutes` on a random local HTTP port, then exercises `POST /api/ai/sessions`, two prompt requests, and `GET /api/ai/state`.

The second phase checks that the service workspace directory is passed through to OpenCode, the local model response reaches `session.messages`, the session returns to `idle` without an error, `lastPrompt` is the queued second prompt, and the queue is empty. The model fixture delays its SSE response by 200 ms so the two prompt requests exercise one active request followed by one queued request. The expected fixture call count is one direct prompt plus two service prompts.

Isolation boundaries are explicit. OpenCode uses temporary HOME, config, data, and cache directories; the provider points at the local HTTP fixture only; the service uses a separate temporary root and HistoryStore; the temporary password environment variable is restored in `finally`; and the service HTTP server, OpenCode child, model fixture, and temporary roots are closed or removed after the run. No user `.logviewer-ai` state or external model endpoint is used.

The command is:

```powershell
npm run verify:opencode-live
```

The command requires the locally bundled OpenCode 1.2.27 executable and may need the approved Windows `require_escalated` execution path when `tsx` cannot spawn its esbuild helper under the default sandbox.
