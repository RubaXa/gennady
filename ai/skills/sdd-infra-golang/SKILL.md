---
name: sdd-infra-golang
description: Bootstrap or evolve the Go infrastructure scope of an SDD project — module layout, verification gates via the stack plugin system (gennady verify), gennady.yaml overrides, toolchain diagnostics. Use when the scope is a Go service or library, especially brownfield monorepos where `./...` is too slow to be a per-phase gate. Also use to diagnose why Go gates fail or lie.
license: MIT
compatibility: opencode
---

<SddInfraGolang>

Go specialisation of `sdd-infra`. Scope-type is fixed: `infrastructure`; language is fixed: `go`.

The deterministic half of this skill is the stack plugin system — **one verb for every stack**: `gennady verify`. The golang plugin carries the Go knowledge; the repo's deviations live in `gennady.yaml` (section `stack`; personal `.gennadyrc` files deep-merge on top), never in ad-hoc per-repo commands. Read `ai/directives/infra/golang-setup.xml` for the reasoning behind every rule below.

## 1. Orient before designing

Never propose Go tooling for a repository you have not inspected. Run:

```bash
npx gennady verify --plan
```

This prints, without executing anything:

- which stacks were detected (a repo can be node + golang at once)
- module path and `go` directive; nested modules `./...` cannot reach
- `go.work` / vendoring — which decides the module flag
- the golangci config actually found, including non-dot names like `golangci.yml`
- toolchain diagnostics (notably Go-version skew that makes golangci-lint panic)
- the exact argv of every gate that would run

Machine-readable form for a subagent: `npx gennady verify --plan --json`.

## 2. Read the diagnostics honestly

| Diagnostic | Meaning | Correct response |
| --- | --- | --- |
| `GOLANGCI_GO_TOO_OLD` | Linter binary predates the module's Go; it will panic, not lint | Install a newer golangci-lint, or `gennady.yaml: stack.golang.skipGates: [lint]` |
| `GOLANGCI_CONFIG_MISSING` | Makefile points at a config absent from the checkout | Restore it, or set `lintConfig` in the stack config |
| `NESTED_MODULES` | Nested `go.mod` outside `./...` | Verify each with `--root=<dir>`, or state which modules are uncovered |
| `CONFIG_ERROR` | Stack config is broken or has unknown keys/types | Fix it — verify refuses to run on a config it does not understand (exit 4) |

## 3. Wire the gate into the SDD loop

The per-phase gate, run from the module root:

```bash
npx gennady verify
```

Golang defaults to the packages changed against the base branch — staged, unstaged and untracked. On a monorepo this is the difference between a 12-second gate and a CI-scale job.

Narrow or widen deliberately:

```bash
npx gennady verify internal/userapi           # explicit target
npx gennady verify --all                      # whole module — slow
npx gennady verify --only=golang:build,vet    # fast inner loop (stack:gate or bare gate)
npx gennady verify --skip=lint                # documented, visible skip
npx gennady verify --stack=golang             # one-shot stack.use
```

Contract (all stacks): **RUN-ALL** · **SUPPRESS-ON-SUCCESS** · exit `0` all pass, `1` gate failed, `4` bad invocation/config, `5` no stack detected.

Codegen loop: `golang:generate` runs `go generate` in a working-tree replica (sandbox) BEFORE build and fails with the drifted file list; `gennady fix golang:generate` materializes the generated code in the real tree for you to commit. Works whether generated files are committed or gitignored.

## 4. Encode repo deviations in `gennady.yaml`, not in prose

When a repo verifies differently (Makefile targets, codegen drift checks, custom timeouts), declare it **once, in the repo**:

```yaml
stack:
  golang:
    skipGates: [lint] # golangci-lint built with an older Go — restore after the image update
    overrideGates:
      test: { argv: [make, test], timeout: 15m }
      build: { env: { GOPROXY: "https://goproxy.example.com/" } }
    extraGates:
      - { id: tidy-drift, argv: [go, mod, tidy, -diff], timeout: 5m }
```

Application order: plugin plan → `overrideGates` → `skipGates` → `extraGates`. Personal `.gennadyrc` files deep-merge on top (per-key winner shown in `--plan`). An extra gate must be non-mutating like every other gate.

## 5. Distinguish FAIL from ENV_FAIL — this is the important one

- **`FAIL`** — the tool ran and found a problem in the code. Fix the code.
- **`ENV_FAIL`** — the tool could not run: a `panic:`, a golangci-lint exit above 1, a refused dependency fetch. **The code is not implicated.** Do not edit sources in response; fix the environment or skip the gate explicitly.

An agent that "fixes" code in response to `ENV_FAIL` produces confident, wrong diffs. Report it to the operator and stop rather than guessing.

## 6. Rules that survive contact with real repositories

Full reasoning in `ai/directives/infra/golang-setup.xml`; the short form:

1. **One verb, every stack.** Differences go into `gennady.yaml`, not into new commands.
2. **Gates never mutate.** `gofmt -l`, never `go fmt`; `go mod tidy -diff`, never `tidy`.
3. **Scope before depth.** Changed packages by default; `./...` on request only.
4. **Lint config passed via `-c`** — auto-discovery misses bare `golangci.yml` (seen in a real monorepo).
5. **`-mod=vendor` when vendored** — offline, reproducible; never together with `go.work`.
6. **`./...` stops at module boundaries** — nested modules need their own run.
7. **Bound everything** — mandatory per-gate timeout, rendered into `go test -timeout`; integration tests behind build tags are a separate, explicit scope.

## 7. Designing a new Go infra scope

When the operator wants tooling *designed* rather than merely run:

1. **Extract intent.** Confirm scope-type=`infrastructure`, language=`go`. Resolve the scope name (e.g. `infra-golang`).
2. **Load & activate.** Read in full: `~/Developer/gennady/ai/directives/sdd/discovery.directive.xml`, then `~/Developer/gennady/ai/directives/infra/golang-setup.xml`.
   Announce: `🔒 DIRECTIVE ACTIVATED: SddDiscovery | infrastructure | golang`
3. **Ground every requirement in observed state** — the `--plan --json` output above, not assumptions about how Go projects usually look.
4. **Apply.** Follow the discovery Execution_Plan end-to-end. Every proposed gate must be expressible as a `gennady verify` invocation or a `gennady.yaml` entry — or justified as to why it is not.

</SddInfraGolang>
