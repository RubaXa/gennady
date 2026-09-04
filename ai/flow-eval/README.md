# External SDD eval harness

Checks whether a real model can walk one **phase** of the SDD flow like an ordinary developer —
authoring specs, scaffolding tickets, or executing a ticket — inside an isolated, disposable git
sandbox. It is **not** a unit test of the directives and **not** a search for a pre-planted bug: the
model gets a working repo, follows the assembled SDD flow, and an external observer + isolated judge
score its progress from a bounded session tail and the file diff.

## Documentation map

| Read this                                          | For                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| this file                                          | What it is, how it is wired, the one canonical command.                                                                   |
| [`RUNBOOK.ru.md`](./RUNBOOK.ru.md)                 | **How to run** — server setup, env, live-run procedure, reading observations, verdict rules, gotchas.                     |
| [`WRITING-EVALS.ru.md`](./WRITING-EVALS.ru.md)     | **How to add your own eval** — scenario shape, fixture anatomy, coverage-passability rules, judge contract, step-by-step. |
| [`operator-approve.sh`](./operator-approve.sh)     | Helper that simulates a complete operator approval between phases (portal + Decision Log).                                |
| [`PROGRESS-REPORT.ru.md`](./PROGRESS-REPORT.ru.md) | **Before → after report** for colleagues: what was broken, what was fixed, the numbers, why it is progress.               |

## How it is wired

| Component        | Responsibility                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.ts`         | Parses flags, provisions isolated sandboxes, runs the batch, persists each judge rationale.                                                    |
| `provision.ts`   | Builds one temp git repo per scenario from `FIXTURE_FILES`; copies the built SDD (`dist/**`, `ai/**`) + a CLI shim into an immutable snapshot. |
| `runner.ts`      | Creates one OpenCode worker session per scenario; bounds concurrency and the observation budget.                                               |
| `observer.ts`    | Every interval reads only a bounded tail + status + events + diff; derives progress, repeats, waiting/approval, and a `stuck` marker.          |
| `judge.ts`       | In a separate session, scores final artifacts/state from a narrow evidence boundary.                                                           |
| `evidence.ts`    | Reads the bounded evidence (tracked + untracked files) the observer/judge consume.                                                             |
| `scenarios.json` | The reference scenarios (authoring, scaffold, execute, repair).                                                                                |
| `types.ts`       | Source of truth for scenario / phase / mode / fixture / judge types.                                                                           |

The harness never spawns `codex` or an `opencode` binary — it connects through `@opencode-ai/sdk` to
an **already-running** OpenCode HTTP server. The source checkout is never used as a sandbox and is
not modified during a run.

The judge is deliberately narrow: it receives only `intent`, `acceptance`, final bounded `state`,
`diff`, `events`, and the bounded parent/child `tail` — never the worker prompt, full transcript, or
runner internals. It must emit `VERDICT: pass|fail|inconclusive` on its first line; a missing verdict
line is read as `inconclusive`, never a prose-guessed fail.

## Canonical command

```bash
npm run sdd-flow-eval -- \
  --scenario-file ./ai/flow-eval/scenarios.json \
  --directory "$(mktemp -d "${TMPDIR:-/tmp}/sdd-flow-eval-root.XXXXXX")" \
  --gennady-root "$PWD" \
  --base-url "http://127.0.0.1:$OPENCODE_EVAL_PORT" \
  --model llm-proxy/deepseek-v4-flash \
  --judge-model llm-proxy/deepseek-v4-flash \
  --concurrency 1 --observe-every-ms 300000 --stuck-after 2 --max-observations 8
```

`--directory` is only the root under which the provisioner creates one `sdd-flow-eval-*` sandbox per
scenario — it is never a shared working directory. `--gennady-root` selects the source checkout
(defaults to the enclosing repo/worktree). Full setup and per-flag meaning: **[RUNBOOK](./RUNBOOK.ru.md)**.

### Defaults (code) vs what we run

The code defaults in `runner.ts` are `openai/gpt-5.6-luna` (worker) / `openai/gpt-5.6-sol` (judge),
concurrency `3`, interval `300000ms`, budget `6`, tail `20`. Cheap smoke runs override the models to
`llm-proxy/deepseek-v4-flash` and — for authoring batches — drop concurrency to `1` (see the
sequential-batch note in the RUNBOOK: parallel authoring sessions overload a single test server).

## Fake-backed regression suite

```bash
npm run test:sdd-flow-eval
```

Runs the harness unit tests (fake evidence, `observeEveryMs: 0`) — no OpenCode server needed.
