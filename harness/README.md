# SDD Flow v2 — Eval Harness

Headless automation that runs the SDD Flow v2 end-to-end against a real, disposable
repository and **proves working code comes out** — files actually written, `npm test`
actually green, the app actually runs. Manual walkthroughs are the ground truth; this
harness is the fast, repeatable check that a green verdict is earned, not narrated.

> Not published. `package.json#files` whitelists `dist/`, `README.md`, `ai/**` only, so
> everything under `harness/` stays dev-only.

## Why it exists

A green SDD verdict must mean real verification (the whole point of the v2 reform). The
only way to keep proving that is to run the flow for real and inspect the artifacts it
leaves behind — not the agent's self-report. This harness is that outer check.

## Architecture

```
scenario ──▶ workspace ──▶ gennady-setup ──▶ run-flow ──▶ verify-output ──▶ report
             (temp repo)   (sync + skills)   (agent)      (files/tests/run)
```

- **workspace** — creates a disposable git repo (temp dir, `git init`, package skeleton).
- **gennady-setup** — installs the local gennady build, runs `sync` (directives) +
  `sync-skills` (skills) so the agent sees the real v2 flow.
- **run-flow** — drives an agent session through the flow over `AgentPort` (below).
- **verify-output** — the honest gate: source files present (from the tool-trace, not
  the agent's word), `npm test` green, the built app runs.
- **report** — structured pass/fail with the evidence attached.

### AgentPort — decoupled on purpose

The harness talks to a **harness-local minimal port** (`port/agent.port.ts`), not to
agent-inbox's `OpenCodePort`. agent-inbox is experimental and may be broken at any time;
importing its internals (SessionPool, registry) would drag that fragility into the eval
infra. We reuse only the _approach_ agent-inbox validated — Server mode via
`opencode serve` + `@opencode-ai/sdk` — in a thin adapter the harness owns.

Two implementations:

| Impl                  | Use                            | What it does                                                                                                            |
| --------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `MockAgent`           | dev / CI of the harness itself | Writes seeded files on prompt — exercises the whole orchestration + verification chain with no network, no model spend. |
| `OpencodeServerAgent` | real eval runs                 | Connects to `opencode serve`, drives deepseek-4-pro via llm-proxy.                                                      |

**CLI vs Server — chose Server.** The SDD flow is multi-step (router → scaffold →
execute → audit); Server mode gives session continuation and a tool-trace (what the
agent actually touched — exactly what the verifier needs), which one-shot CLI does not.
agent-inbox already proved the Server path; the deleted alt-opinion CLI example would
have to be rebuilt for strictly less capability.

## Scenario matrix (evals)

| ID     | Start state                    | Exercises                                               | Status         |
| ------ | ------------------------------ | ------------------------------------------------------- | -------------- |
| **S1** | Ready specs + tickets          | scaffold → execute → audit                              | building first |
| **S2** | Idea only                      | full flow incl. spec-design (prepared Approval answers) | planned        |
| **S3** | Existing project + feature ask | extend an existing codebase                             | planned        |

First task everywhere: **Tic-tac-toe (CLI, `node:test`, zero-deps)** — a task every model
knows cold, same stack as gennady, so a red result is the flow's fault, not the task's.

## Running

```bash
# harness self-test on the mock (no model, no network)
npm run harness:test

# real eval run (needs `opencode serve` + llm-proxy deepseek-4-pro)
npm run harness -- --scenario s1 --agent opencode
```
