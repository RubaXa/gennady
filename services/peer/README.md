# Codex peer transport contracts

The peer adapter sends a message to an existing Codex session through the app's
`codex queue` command. It does not create a new session or substitute an unrelated
npm CLI.

## Executable selection

1. `GENNADY_CODEX_BIN` has priority when explicitly set, even if its path is missing.
   A missing explicit executable is reported rather than silently replaced.
2. Prefer the existing current ChatGPT app executable at
   `Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`.
3. Retain the existing legacy app executable at `Contents/Resources/codex` as a
   fallback. If neither exists, report the current bundle path as missing.

## Waiting for a reply

A standalone `peer ask` process stays alive until a reply or the configured
bounded timeout, including when the transport has no socket that keeps Node alive.
The reply poller and timeout remain referenced during this wait. The existing
`finally` block clears both and stops the inbox on success, timeout or send error,
so completion does not leave the process running.

The subprocess regression suite verifies delayed replies, no-reply timeout and
send failure with an isolated peer ledger. Other transport timers are unchanged.
