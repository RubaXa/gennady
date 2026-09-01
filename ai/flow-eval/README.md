# External SDD eval harness

This harness evaluates small SDD scenarios through an already running OpenCode server and the
installed `@opencode-ai/sdk`. It never invokes the `codex` or `opencode` binaries and it does not
write a hand-maintained TRACE/JSON artifact.

The runner creates one OpenCode session per scenario and sends the worker prompt through
`session.promptAsync`. `SddEvalObserver` independently polls a bounded message tail, status, diff,
and event reader. It derives progress, repeated snapshots, errors, waiting/approval, and a stuck
marker after `stuckAfter` unchanged observations. The five-minute interval is the production
default; every observation prints one compact, scenario-prefixed tail line. Tests inject
`observeEveryMs: 0` and fake evidence. `SddEvalRunner.runAll` executes batches with bounded
concurrency.

The judge is a separate OpenCode session. Its input boundary is deliberately narrow: only
`intent`, `diff`, `events`, and the bounded `tail` are sent. It cannot receive the worker prompt,
full transcript, or runner internals.

The SDK adapter is `SddEvalOpenCodeRuntime`; evidence is read by
`SddEvalOpenCodeEvidenceSource`. The evidence source accepts an injected event reader because
OpenCode's global event endpoint is a long-lived SSE stream; an application can feed that reader
from its existing OpenCode provider/session store without coupling the evaluator to a database.
For a password-protected local server, set `OPENCODE_SERVER_PASSWORD` and optionally
`OPENCODE_SERVER_USERNAME`; credentials never appear in CLI arguments or reports.

Defaults:

- worker: `openai/gpt-5.6-luna`
- judge: `openai/gpt-5.6-sol`
- concurrency: `3`
- observe interval: `300000ms`
- bounded tail: `20` messages

## Live command

The runnable command is:

```bash
npm run sdd-flow-eval -- --scenario-file ./ai/flow-eval/scenarios.json \
  --directory "$(mktemp -d "${TMPDIR:-/tmp}/sdd-flow-eval-root.XXXXXX")" \
  --base-url http://localhost:4096 \
  --model llm-proxy/deepseek-v4-flash \
  --judge-model llm-proxy/deepseek-v4-flash \
  --concurrency 3 --observe-every-ms 300000
```

`--directory` above is only the root under which the provisioner creates one temporary sandbox per
scenario; it is not used as a shared scenario working directory. The repository includes three prepared scenarios in `ai/flow-eval/scenarios.json`:

The source root for the assembled flow defaults to the repository root (or its enclosing checkout
when running from a worktree); use `--gennady-root /path/to/gennady` to select it explicitly. The
provisioner copies `ai/skills/sdd`, `ai/directives/sdd-v2`, and `.claude/skills/sdd*` from current
`ai/skills` sources, plus `package.json`, `dist/**`, and `ai/**` into an immutable package snapshot.
The executable shim targets that sandbox copy, so `npx --no-install gennady sdd-state` resolves
without installation or network access and worker writes cannot reach the source checkout.

- Fibonacci library — full spec authoring through Approval #1.
- Tic-tac-toe — actual ticket scaffolding from an approved spec through Approval #2.
- Slugify/toolchain — execution against canonical spec and ticket.

Missing directories are provisioned as unique
`sdd-flow-eval-*` temporary workspaces; custom directories are rejected if any two scenarios share
one. A stuck worker is aborted through `session.abort` after the first unchanged observation by
default (`--stuck-after 1`). Tool parts are summarized in the bounded tail, so repeated commands
such as `bash npm test` remain observable without storing a full transcript.

For now, the package-level fake-backed regression suite is:

```bash
npm run test:sdd-flow-eval
```
