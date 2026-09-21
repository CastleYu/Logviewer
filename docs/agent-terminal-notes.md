# AI terminal launcher

`AiTerminal.open()` validates the requested directory and resolves the configured `opencode` executable before launching a visible Windows `cmd.exe` window. The only command-line values are fixed launcher tokens and a Base64 encoded PowerShell program. The endpoint, session, directory, executable, and inherited authentication variables cross the process boundary through the environment; PowerShell invokes the executable with `&` and changes directory with `Set-Location -LiteralPath`.

The resolver recognizes the standard npm `opencode.cmd` shim whose body targets `node_modules\\opencode-ai\\bin\\opencode.exe`, and invokes that executable directly. This avoids a second `cmd.exe` argument expansion, so endpoint/session/directory values containing Chinese characters, spaces, `&`, and `%` reach the underlying executable unchanged. An unrecognized `.cmd` or `.bat` file is rejected when those values contain shell metacharacters; configure the underlying `opencode.exe` in that case.

This keeps supported values out of the extra shim parsing layer and prevents authentication values from appearing in the child argument vector. A child `error` event or synchronous spawn failure rejects the returned promise with a readable error. Non-Windows callers receive an explicit unsupported-platform error.

The CLI contract used here is the OpenCode v1.2.27 `attach` command: `attach <url>` accepts `--session`/`-s` and `--dir`; authentication is supplied through `OPENCODE_SERVER_PASSWORD` (and the username variable where supported by the installed version). See the [official v1.2.27 attach command source](https://github.com/anomalyco/opencode/blob/v1.2.27/packages/opencode/src/cli/cmd/tui/attach.ts).

Run the focused fixture verification with `npm exec tsx scripts/verify-ai-terminal.ts`. It starts a real visible-launch path with a temporary standard npm shim and `.exe`, checks cwd and special-value argv delivery, records and kills only its own process tree, and reports that native OpenCode TUI rendering was not tested.
