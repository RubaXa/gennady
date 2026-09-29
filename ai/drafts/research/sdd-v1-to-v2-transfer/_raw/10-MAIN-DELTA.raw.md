# 10 — Дельта main (SDD v1) после merge-base: что сделано, инварианты, привязки

> Статус: **ВЕРИФИЦИРОВАНО** (независимая проверка V-A1, Opus, fresh eyes). Часть I — инвентарь (агент A1, английский, оставлен без правок; корректировки перечислены в части II и обязательны к учёту). Часть II — отчёт верификатора.
>
> **Итог верификации:** полнота 115/115 коммитов; описания 108 OK / 7 неточных; инварианты 74 CONFIRMED + 2 с поправкой + 1 REFUTED (C9: cascade-категорий пять — coding/testing/infra/architecture/quality); 7 пропущенных инвариантов добавлены; PR-таблица подтверждена полностью; счётчики файлов (425 main-only / 77 conflict-zone / 19 deleted) подтверждены; шапка issues «all filed against 0.8.4-next.10» опровергнута (#19–#23 ссылаются на main@62172906).
>
> **Как читать для плана:** каждая строка §3 (инварианты V1–V28, C1–C15, S1–S9, R1–R5, D1–D9, K1–K5, P1–P6) — единица переноса, получающая вердикт в треках 30–40 и в `20-ISSUES-VERDICTS.md`.

---

# Часть I — Инвентарь (A1)

# A1 — Main-side delta inventory (`46c6d616..origin/main`)

Baseline for the SDD v1 main vs SDD v2 RC (`codex/sdd-v2-rc52-followup`) audit. Describes ONLY main.

## 0. Facts

| Fact | Value |
|---|---|
| main HEAD | `8bb38477` (2026-09-03) `feat(sdd): single-source facts by reference, kill doc-to-doc drift (iter 3)` |
| merge-base | `46c6d616` (2026-06-29) `feat(vcs): unify --vcs-host flag + vcs-discussions --draft/--since/fullId` |
| RC HEAD | `11291af5` (2026-09-06) `chore(flow-eval): completion gate wiring + spec-receipt metrics + ledger E1-E3` |
| main `package.json` version | `0.9.0-next.3` |
| RC `package.json` version | `0.8.4` |
| commits main-only (`46c6d616..origin/main`) | **115** |
| `git rev-list --left-right --count codex/sdd-v2-rc52-followup...origin/main` | RC-only **535**, main-only **115** |
| Date span of main delta | 2026-08-10 .. 2026-09-03 |
| Authors on main delta | Лебедев Константин / Konstantin Lebedev / k.lebedev, Maxim Uymin / Maksim Uimin, "Claude Opus 5" (Uymin's agent commits inside PR #5), Test (RubaXa/Lebedev release bot identity), Artur Protska |

## 1. Commit inventory (`46c6d616..origin/main`, 115 commits, oldest first)

Notes on attribution: 50 commits are first-parent on main; the rest arrive via three merges — PR #4 (6 commits), PR #5 (58 commits incl. the fork-internal "PR #3" merge `cbc292a0` = `maksimuimin/feat/clean-tree-verify`, NOT this repo's PR #3), PR #8 (1 commit). PRs #10/#12/#14/#18 were squash-merged (single commits `62172906`, `4a47b9e8`, `90b123e9`, `d86c49dd`). Track codes: VERIFY, CHECK-LOG, SYNC-OWN (=SYNC-OWNERSHIP), RULES, DIR-SDD (=DIRECTIVES-SDD), SKILLS, REL-PKG (=RELEASE-PACKAGE), DOCS, TESTS, OTHER.

### 1.1 Pre-stack fixes (PR #4 + direct)

| # | sha | date | author | subject | PR | files (grouped) | behavioural change | track |
|---|---|---|---|---|---|---|---|---|
| 1 | `713fefd4` | 2026-08-10 | Лебедев К. | fix(sdd): port directive fixes from messenger proving ground | direct | `ai/directives/sdd/*.xml` (12 files, +1701/−316; NEW `critic-protocol.xml`, `interview-protocol.xml`, `visual-vocabulary.xml`) | Adds operator-dialogue axioms (AX_OPERATOR_DIALOGUE_STYLE, AX_NO_PROCESS_NARRATION, AX_PROGRESSIVE_DISCLOSURE, AX_DIVERGE_BEFORE_RECOMMEND…) to all 8 SDD directives; critic v2.1 (Polish mode, AX_MIN_ROUNDS — later reverted by #8); scaffold adopts `TSK-{PREFIX}-{NNN}` Task-ID format and `@file/@consumers/@tasks` headers; discovery drops Status field from Decision Log; module-decomposition v3.1 AX_REUSE_FIRST_ACROSS_MODULES; fix gains AX_VERIFY_CLAIM_AGAINST_CODE. English section headers, HTML entities → raw brackets. | DIR-SDD |
| 2 | `8dc1d1cd` | 2026-08-12 | Maxim Uymin | fix(agent-run): resolve readonly.config.json under Vite data: URL inlining | #4 | `services/agent-run/engines/opencode/opencode-engine.ts` | Vite lib mode inlined the JSON as a `data:` URL so `fileURLToPath` crashed every CLI command in the bundle (ERR_INVALID_URL_SCHEME); config path now resolved lazily — file: uses source, data: materialises a temp file. | REL-PKG |
| 3 | `5c5a1f6a` | 2026-08-12 | Maxim Uymin | fix(infra): keep executable bit on dist/gennady.js after vite build | #4 | `vite.config.ts` | `closeBundle` hook chmods `dist/gennady.js` to 755 (Vite wrote 644 → `permission denied` for the npm-linked bin). | REL-PKG |
| 4 | `3461d2fd` | 2026-08-12 | Maxim Uymin | docs: add install-from-source section | #4 | `README.md` | Install-from-clone instructions for environments without npm registry access. | DOCS |
| 5 | `5697f027` | 2026-08-12 | Лебедев К. | test(infra): guard publish bundle with offline smoke test | #4 | NEW `cli/__tests__/e2e/bundle-smoke.e2e.test.ts`; `package.json`; opencode-engine.ts (format) | `GENNADY_SMOKE=1` test builds the bundle and asserts exec bit + clean start over the inlined data: URL; wired into `prepublishOnly` (`test:smoke`). | REL-PKG / TESTS |
| 6 | `320c7e27` | 2026-08-12 | Лебедев К. | chore(format): normalize pre-existing prettier drift | #4 | 2 cli files, 4 specs, 2 tasks | Formatting only. | OTHER |
| 7 | `faf3b72f` | 2026-08-12 | Лебедев К. | fix(test): repair stale VCS tests + worktree symlink robustness | #4 | `cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts`, `agents-rules.cmd.test.ts`, `review-issues.cmd.test.ts`, `services/vcs-client/github/*` | Fixes 4 stale test expectations (host arg, GitHub supported, MergeDiscussions present); agents-rules test mkdirs node_modules parent so it runs in a worktree. | TESTS |
| 8 | `c5fa924f` | 2026-08-12 | Lebedev K. | Merge PR #4 (`maksimuimin/claude/gennady-backend-adoption-cef193`) | #4 | merge | "fix: make CLI work when built from a source clone". | REL-PKG |
| 9 | `620f0026` | 2026-08-12 | Лебедев К. | chore(deps): npm audit fix | direct | `package-lock.json` | Bumps ip-address, nanoid, postcss, vite, ws (lockfile only). | REL-PKG |
| 10 | `ea291ca2` | 2026-08-12 | Лебедев К. | chore(release): v0.8.4-next.1 | direct | package.json/lock | version bump | REL-PKG |

### 1.2 PR #5 — stack plugin system + `gennady verify` (58 commits, merged `b4840ca1` 2026-08-25)

Components (final state at `b4840ca1`): `services/stack/**` (gate-runner, stack-config, stack-registry, stack.types, env-fail, tree-guard, plugin-api; 6 unit test files ~1727 lines; e2e harness `__tests__/e2e/{setup,fixture,suite,fixture-integrity}` + 55 config fixture files), `services/config/config-loader.ts` (+test), `services/plugins/{resolve-plugins,plugin-assets}.ts` (+locality/resolver tests), `plugins/{index.ts, anystack, golang, node}` (code, `plugin.json`, `specs/`, `e2e/` fixtures: golang 210 files, node 27, anystack 20; golang `directives/infra/golang-setup.xml` + `skills/sdd-infra-golang/SKILL.md`), `cli/cmd/verify/**` (750 lines), `cli/cmd/fix/**` (380 lines), `cli/gennady.ts` dispatcher, `gennady.yaml` (dogfood), `ai/skills/sdd-execute/scripts/{verify.sh,classify-scripts.js,classify-scripts.ts}` (+ `scripts/__tests__/sdd-verify-delegation.test.ts`, originally at `ai/skills/sdd-execute/scripts/__tests__/`), `cli/cmd/sync*/**` + `shared/common/sync/**` (multi-root plugin surfaces, clone resolution), `specs/{stack,config,plugins,infra-e2e}/**`, `tasks/stack/**` (TSK-95, TSK-96), `.github/workflows/ci.yml`, `scripts/stack-e2e.ts`, `package.json` (yaml dep, `test:*-e2e` scripts, `gennady/stack` export, files), `shared/common/{exec.ts,damerau-levenshtein.ts}`, `shared/backend/rc/rc-config.ts`.

| # | sha | date | author | subject | files (grouped) | behavioural change | track |
|---|---|---|---|---|---|---|---|
| 11 | `d359a098` | 08-18 | Maksim Uimin | spec(stack): address review — capabilities, config spec, detection, per-gate timeouts | NEW `specs/stack/stack.spec.md`, `specs/stack/config/config.spec.md`, `tasks/stack/{README,task-95,task-96}`; specs/README, tasks/README | Spec-only: StackPlugin as capability facets (verify mandatory), detection algorithm, `gennady.yaml` + `.gennadyrc` config, skipGates/overrideGates/extraGates, mandatory per-gate timeout, external-plugin reservation. | VERIFY (spec) |
| 12 | `5e92ed5a` | 08-18 | Maksim Uimin | spec(stack): review round 2 | stack.spec, config.spec, tasks | Deep-merge across 3 config sources with provenance; fatal strict validation (exit 4); plugin-specific keys dropped; `--only/--skip` take `stack:gate`; envFail as predicates; root-marker detection; Fixer + `gennady fix` entity; external plugins out of scope. | VERIFY (spec) |
| 13 | `984f85de` | 08-18 | Maksim Uimin | spec(stack): drop config schema versioning | stack.spec, config.spec, task-95 | No `version` key — config validated against installed gennady (D-CFG-005). | VERIFY (spec) |
| 14 | `6d00bee5` | 08-18 | Maksim Uimin | spec(stack): review round 4 | stack.spec | No `gennady build`; `dbc-lint` facet naming; StackDetection payload rationale; `directives` facet (stack-specific directives move under plugins). | VERIFY (spec) |
| 15 | `52c03db9` | 08-18 | Maksim Uimin | feat(stack): implement the stack plugin system (TSK-95, TSK-96) | NEW `services/stack/{gate-runner,stack-config,stack-registry,stack.types}.ts`, `services/stack/plugins/{golang,node}/**` (+tests), NEW `cli/cmd/verify/**`, `cli/gennady.ts`, `gennady.yaml`, `ai/skills/sdd-execute/scripts/verify.sh`, NEW `ai/directives/infra/golang-setup.xml`, NEW `ai/skills/sdd-infra-golang/SKILL.md`, `shared/backend/rc/rc-config.ts`, README/cli README/help, package.json (`yaml@2.9.0`) | First `gennady verify`: detection by root markers (package.json / go.mod), golang gates build/vet/fmt/lint/test with per-gate timeouts, node gates from npm scripts, envFail predicate combinators, strict config (exit 4), `--only/--skip/--stack/--all/--plan/--json/--root`, exit 0/1/4/5; verify.sh delegates to `gennady verify` when present. | VERIFY |
| 16 | `fb312581` | 08-18 | Maksim Uimin | fix(stack): code-review round — 9 bugs, 11 cleanups | stack + verify + `shared/common/{exec,damerau-levenshtein}.ts` (moved from orient), `resolve-verify-commands.logic.ts` | `--relative` on git diff (subdir `--root` false-pass fixed); base ref prefers `origin/HEAD`; ZERO_GATES verdict (exit 1); node scripts with `--fix/--autofix/--write` planned as visible skips; go test panic = FAIL; broken foreign `.gennadyrc` `models` no longer bricks verify; head+tail output truncation (20+40); `--full-output`; spawnFailed combinator dropped; registry-rendered help. | VERIFY |
| 17 | `cac9169b` | 08-18 | Maksim Uimin | feat(stack): --only unskip, env-fail contract, mobile notes | verify.cmd, stack-config, specs | `--only` naming a gate lifts a config `skipGates` entry (CLI `--skip` still wins); `--json` gains `results[].status` + top-level `envFailed`; D-STACK-010 single-root limitation. | VERIFY |
| 18 | `f5936947` | 08-18 | Maksim Uimin | feat(stack): sandboxed golang:generate drift gate + `gennady fix` | NEW `cli/cmd/fix/**`, NEW `services/stack/tree-replica.ts`, gate-runner, golang plan/plugin, cli/gennady.ts | New `generate` gate first in GO_GATE_ORDER (sandboxed drift check via ephemeral worktree replica); `gennady fix [id…]` runs fixers in the real tree; exit 0/1/4/5. (Replica later removed by D-STACK-017.) | VERIFY |
| 19 | `63a3b4b3` | 08-18 | Maksim Uimin | fix(stack): missing generator binary is ENV_FAIL with hint | gate-runner, golang-plan, stack.types, specs | `EnvFailPredicate.hint`; `outputMatches(re, hint?)`; `/executable file not found/` → ENV_FAIL with `go install` hint; replica never copies gitignored files (D-STACK-012). | VERIFY |
| 20 | `3c28f776` | 08-18 | Maksim Uimin | feat(stack): observe-only gate contract — all gates in one replica | gate-runner (+270), tree-replica, stack-config, node-plugin, specs | Every gate runs in a per-toplevel replica; new `violation` status for gates that dirty the tree; `sandboxLinks` (node: node_modules); `UNSANDBOXED_RUN` diagnostic; `sandbox` GateSpec key (D-STACK-013). (Superseded by D-STACK-017.) | VERIFY |
| 21 | `06cde35c` | 08-19 | Maksim Uimin | spec(stack): add the e2e module | NEW `specs/stack/e2e/e2e.spec.md` | Fixture-as-data (`expect.yaml`) e2e doctrine; STRICT mode; hermetic HOME/GOPROXY. | VERIFY (spec) |
| 22 | `205334ad` | 08-19 | Maksim Uimin | spec(stack/e2e): pack the published artifact | e2e.spec | `build:publish` before `npm pack`; `--registry` param; cleanup in finally. | VERIFY (spec) |
| 23 | `2acb19c6` | 08-19 | Maksim Uimin | spec(e2e): split E2E doctrine from suites; per-plugin specs | NEW `specs/infra-e2e/infra-e2e.spec.md`, NEW `specs/stack/plugins/{golang,node}/*.spec.md`, config.spec §4.2 matrix, infra-base §2.1 | Project-wide E2E doctrine (no silent skips, tests as data, hermetic, no tracked-file mutation, CI proposed); per-stack fixture matrices. | VERIFY (spec) / DOCS |
| 24 | `34cbfc14` | 08-19 | Maksim Uimin | refactor(stack): sandbox → driftMeansFailure; split config-e2e; rename e2e scripts | services/stack, plugins, `.prettierignore`, `package.json`, specs | GateSpec key renamed `driftMeansFailure` (D-STACK-014); npm scripts `test:cli-e2e`/`test:stack-e2e`/`test:config-e2e`; prepublishOnly runs all three with STRICT; `**/__tests__/e2e/fixtures/**` excluded from prettier/tsc. | VERIFY / REL-PKG |
| 25 | `27cb0a50` | 08-19 | Maksim Uimin | feat(e2e): build the stack e2e framework | NEW `scripts/stack-e2e.ts`, `services/stack/__tests__/e2e/{setup,fixture,golang,node,config}.*`, 14 golang fixture files | Harness: pack tgz → install → run fixtures via `--json`; two product bugs fixed: `go build -o /dev/null` (was writing binary into cwd → false VIOLATION); `overrideGates.argv` no longer inherits exit-code predicates (`EnvFailPredicate.kind`). | VERIFY / TESTS |
| 26 | `aee24246` | 08-19 | Maksim Uimin | feat(stack): gate parity contract + envFail rules in config | NEW `services/stack/env-fail.ts`, NEW `gate-spec-parity.test.ts`, verify.cmd, 16 fixtures | FR-STACK-15 parity: every plugin gate field authorable in config except `stack/label/skipped`; config `envFail` rules (`exitCodeMatches`, `stdoutMatches/stderrMatches/outputMatches`, mandatory `hint`, catch-all rules fatal, config rules prepend plugin predicates); `describe` mandatory and rendered in `--plan --json`. | VERIFY |
| 27 | `c008ae77` | 08-19 | Maksim Uimin | feat(stack): one CmdSpec for gate/requires/fixer + requires preconditions | stack-config (+106), gate-runner, stack.types, 12 fixtures | `CmdSpec` = {argv,cwd,env,timeout,hint}; `requires` preconditions run before the gate (30s default), first failure → gate ENV_FAIL with the precondition's hint; not addressable, not counted. | VERIFY |
| 28 | `bb2406a7` | 08-19 | Maksim Uimin | refactor(stack): fixer is a field on its gate | cli/cmd/fix, stack-config, plugins, 10 fixtures | `Gate.fixer?: Cmd` / `GateSpec.fixer`; `fixers` config section and `fix` facet removed (stale `fixers:` = unknown-key error); `gennady fix` builds the same plan as verify; fixer inherits gate envFail; `hint` rejected on fixer. | VERIFY |
| 29 | `901159d9` | 08-19 | Maksim Uimin | fix(stack): envFail outranks timeout, violation and stdout contract | gate-runner, 16 fixtures | Verdict ladder (D-STACK-015, spec §8.2.1): skipped → spawn failure → matched envFail rule → timeout → violation → drift → stdout contract → exit code; TIMEOUT gets a report note. | VERIFY |
| 30 | `f65e2977` | 08-19 | Maksim Uimin | test(e2e): node and config fixture matrices — hollow green fixed | NEW `suite.ts` (`declareStackSuite`), 30 node + 44 config fixture files, `tsconfig.json` | Probe list = union of fixtures' `requires`; unknown toolchain id fails loudly; empty suite fails; 42 fixtures green under STRICT. | TESTS |
| 31 | `77b753b9` | 08-19 | Maksim Uimin | feat(stack): rule source attribution, bounded predicate window, reviewable --plan | env-fail, gate-runner, stack-config, verify.cmd, 4 fixtures | Matched envFail rule reports its config file; predicates see the same head+tail window the report prints; human `--plan` prints requires/envFail/fixer; `expect.homeRc` in harness. | VERIFY |
| 32 | `da3a53e9` | 08-19 | Maksim Uimin | ci: add .github/workflows/ci.yml — six jobs | NEW `.github/workflows/ci.yml`, package.json, setup.ts, infra-e2e.spec | Jobs lint (check-only), unit, cli-e2e, config-e2e, stack-e2e, dogfood; `STACK_E2E_GOCACHE`. | OTHER (CI) |
| 33 | `185bea20` | 08-19 | Maksim Uimin | ci: workflow_dispatch | ci.yml, infra-e2e.spec | Manual runs enabled; enablement documented. | OTHER (CI) |
| 34 | `1060129d` | 08-19 | Maksim Uimin | test(e2e): finish golang matrix; fix cli/e2e artifact and registry | `cli/__tests__/e2e/setup.ts`, fixture.ts, 100 golang fixture files, golang-plan | 39 golang fixtures; harness `treeUnchanged` compares post-materialisation; product bug: `git grep --untracked` so `//go:generate` in a NEW file is seen; cli/e2e builds with `build:publish`, `GENNADY_E2E_REGISTRY` + `--offline` fallback. | TESTS / VERIFY |
| 35 | `7af8d29e` | 08-19 | Maksim Uimin | test(e2e): close golang matrix (44) + pin golangci-lint in CI | ci.yml, fix.cmd, golang-plan/plugin, 22 fixtures | Module-fetch predicate second pattern for file-position form (`module lookup disabled by GOPROXY=off` → ENV_FAIL); `gennady fix` prints `ENV_FAIL` (was `ENV-FAIL`); CI installs golangci-lint v2.12.2. | VERIFY / TESTS |
| 36 | `bc7a4638` | 08-19 | Maksim Uimin | refactor(config): promote config to a peer scope | NEW `services/config/config-loader.ts` (+test), stack-config (−262), `specs/stack/config → specs/config/config.spec.md` | `loadConfigSection(root, name)` generic 3-source discovery/deep-merge/provenance/duration/did-you-mean; stack keeps only its schema + `applyStackConfig`. Behaviour unchanged. | VERIFY |
| 37 | `5ebdc2ad` | 08-19 | Maksim Uimin | spec(stack-plugins): a plugin is one directory | NEW `specs/stack-plugins/stack-plugins.spec.md` | Plugin = one dir with manifest; resolver; locality test; submodule acceptance criterion. | VERIFY (spec) |
| 38 | `837f4685` | 08-19 | Maksim Uimin | spec(plugins): rename scope to plugins/, manifest by example | → `specs/plugins/plugins.spec.md` | `kind` in manifest; single `plugins/` root; declared-but-missing path fatal, undeclared absent. | VERIFY (spec) |
| 39 | `35f9b559` | 08-19 | Maksim Uimin | spec(plugins): plugin specs become a directory | plugins.spec | `specs/` dir with conventional root `<id>.spec.md`. | VERIFY (spec) |
| 40 | `c76f94fd` | 08-19 | Claude Opus 5 | Close plugin-host code contract and packaging holes | plugins.spec | D-SP-007 host reached only via `gennady/stack` specifier; load order; locality by path segments; D-SP-008 packaging from manifests. | VERIFY (spec) |
| 41 | `fed54618` | 08-19 | Claude Opus 5 | Correct D-SP-008 rejected alternative | plugins.spec | Wording fix (ignore negation works; rejection is about ownership). | DOCS |
| 42 | `66b62e7a` | 08-19 | Claude Opus 5 | Add the plugin resolver | NEW `services/plugins/resolve-plugins.ts` (+test) | Reads `plugin.json`, returns absolute surface paths without importing code; missing manifest / duplicate id / missing entry are errors. | VERIFY |
| 43 | `86b47961` | 08-19 | Claude Opus 5 | One host API surface (`gennady/stack`) | NEW `services/stack/plugin-api.ts`, NEW `plugin-locality.test.ts`, package.json exports, 9 plugin files | Plugins import host only via `gennady/stack` barrel; locality test bans relative imports leaving a plugin dir. | VERIFY / REL-PKG |
| 44 | `13df864a` | 08-19 | Claude Opus 5 | Move golang into plugins/golang; E2E suite from resolver | `services/stack/plugins/golang → plugins/golang` (190 fixture files moved), NEW `plugins/index.ts`, `plugin-suite.e2e.test.ts`, stack-registry, gennady.yaml, tsconfig | Static `plugins/index.ts` = BUILTIN_PLUGINS (D-SP-009); `StackPlugin.gateIds`; registry no longer names paths; golang-generate.e2e unit test removed (covered by fixtures). | VERIFY |
| 45 | `a336f17b` | 08-19 | Claude Opus 5 | Move golang spec/directive/skill into the plugin; staged on publish | `ai/directives/infra/golang-setup.xml → plugins/golang/directives/infra/`, `ai/skills/sdd-infra-golang → plugins/golang/skills/`, NEW `services/plugins/plugin-assets.ts`, NEW `cli/__tests__/e2e/publish-contents.e2e.test.ts`, prepare/cleanup-publish-artifacts, ci.yml packaging job | Plugin assets staged into `ai/` on publish (reverted 2 commits later by `d6479748`). | VERIFY / SYNC-OWN |
| 46 | `5651c05f` | 08-19 | Claude Opus 5 | Move node into plugins/node | `services/stack/plugins/node → plugins/node`, `specs/stack/plugins/** → plugins/*/specs/` | Both stack suites resolver-derived; `nodejs-npm-setup.xml` stays in `ai/` (general, not gate-specific). | VERIFY |
| 47 | `0561630c` | 08-19 | Claude Opus 5 | Verify the submodule criterion; fix what it found | resolve-plugins, specs | Empty plugin dir (deinit'd submodule) = absent, not error; docs synced. | VERIFY |
| 48 | `ef3cd4e5` | 08-20 | Claude Opus 5 | Close four review findings: prototype keys, zero timeouts, preconditions, SIGKILL | config-loader, gate-runner, ci.yml | `__proto__/constructor/prototype` keys are ConfigError; duration must be positive integer; `requires` also enforced on unsandboxed path; `killSignal: SIGKILL` on timeout; GOCACHE via `runner.temp`. | VERIFY |
| 49 | `5d68ce05` | 08-20 | Claude Opus 5 | Stop a missing toolchain reading as a pass | golang-detect (−58: no `<bin> version` probe), gate-runner, stack-config, verify.cmd | `StackDiagnostic.blocking`; golang emits blocking `TOOLCHAIN_MISSING`; `ok` requires no blocking diagnostic; `BLOCKED` verdict line; golang `sandboxLinks: ['bin']`; `unmatchedGateOverrides` → exit 4 after planning. | VERIFY |
| 50 | `ea3f001e` | 08-20 | Claude Opus 5 | Filter unbuildable packages out of Go scope; widen on graph moves | golang-scope (+120), golang-plan, 12 fixtures | `go list -e` filter (nested module / build constraints / missing dir), fail-open; changes to go.mod/go.sum/go.work/.golangci.*/vendor widen scope to `./...`. | VERIFY |
| 51 | `23e972af` | 08-20 | Claude Opus 5 | ENOBUFS, precondition cwd, gofmt depth, fix scope | gate-runner, golang-scope/plan, fix.cmd, 6 fixtures | ENOBUFS overrun falls through ladder (default FAIL, output marked cut); precondition missing cwd → env-fail; `go test -timeout` = 90% of gate timeout; gofmt prunes vendor/testdata at every depth; `gennady fix <stack>:<id>` runs repo-wide. | VERIFY |
| 52 | `052cdd7e` | 08-20 | Claude Opus 5 | Record FR-STACK-16: kill the process group (deferred) | stack.spec | Deferred design note only (runVerify is sync). | DOCS |
| 53 | `d6479748` | 08-20 | Claude Opus 5 | Make sync work from a clone; ship plugin surfaces instead of staging | `cli/cmd/sync/**`, `cli/cmd/sync-skills/**`, `shared/common/sync/**`, plugin-assets, package.json `files`, prepare/cleanup scripts, 3 sync-skills e2e tests | `resolvePackageDir` walks up to `package.json` named gennady (works from checkout / npm link); sync + sync-skills merge base `ai/**` + each plugin's directives/skills roots; normalizer rule `plugins/<id>/directives/ → ai/directives/`; package ships `plugins/*/{plugin.json,*.ts,directives/**,skills/**}`; staging removed. | SYNC-OWN / REL-PKG |
| 54 | `2e304b0f` | 08-20 | Claude Opus 5 | Add the anystack placeholder plugin | NEW `plugins/anystack/**` (plugin, spec, 11 fixture files), stack-registry, stack.types, fixture.ts | `anystack` contributes no gates; all gates via `extraGates`; `optIn` (removed next commit); `noGatesRan` in expect.yaml. | VERIFY |
| 55 | `35318b6b` | 08-20 | Claude Opus 5 | Auto-detect anystack everywhere; multi-stack combos | verify.cmd, anystack, gate-runner, registry | anystack matches every repo and coexists with real stacks; a stack that planned no gate is omitted from all report surfaces; NO_STACK_DETECTED only when `--stack`/`use` names a non-matching stack; ZERO_GATES carries the fix hint. | VERIFY |
| 56 | `9af4db93` | 08-20 | Claude Opus 5 | Stop dropping broken packages from Go scope; commit fixture rc files | golang-scope, `.gitignore`, NEW `fixture-integrity.test.ts`, 4 fixture rc files | Only 4 whitelisted `go list -e` errors drop a package; unknown error KEEPS it; realpath canonicalisation; `.gitignore` negation for fixture `.gennadyrc`; fixture-integrity test (no untracked/ignored file under any fixture root). | VERIFY / TESTS |
| 57 | `b08546ec` | 08-20 | Claude Opus 5 | Document non-package filter classes + committed-fixture invariant | golang.spec, e2e.spec | Docs only. | DOCS |
| 58 | `fbad6cf9` | 08-21 | Maxim Uymin | ZERO_GATES in --json diagnostics; main-first base-ref fallback | verify.cmd, gate-runner, golang-scope | Stable `ZERO_GATES` diagnostic in `--json`; base-ref fallback prefers `origin/main` over stale `origin/master`. | VERIFY |
| 59 | `7cb69946` | 08-21 | Claude Opus 5 | Fix toolchain guard, align JSON verdict, config sandbox links | verify.cmd, golang-detect, stack-config, gate-runner, anystack fixtures | TOOLCHAIN_MISSING checks `tools['go']` (was golangci-lint); JSON `ok` uses same expression as exit code (`ok && total>0`); `stack.<id>.sandboxLinks` configurable (later removed). | VERIFY |
| 60 | `40d209d8` | 08-21 | Maxim Uymin | Fix P1 code findings: root-scan errors fatal, delegation probe, fixer timeout | sync-skills-core, `ai/skills/sdd-execute/scripts/{verify.sh,classify-scripts.js,classify-scripts.ts}`, NEW `sdd-verify-delegation.test.ts`, stack-config | `scanSkillRoots` tolerates only ENOENT/ENOTDIR on plugin roots (EACCES fatal — a swallowed error previously emptied the union and orphan-deleted every synced skill); verify.sh probes `gennady verify --plan --json` instead of grepping help; classifier twins screen `--fix/--autofix/--write` as mutating; config fixer defaults to its gate's timeout. | SYNC-OWN / CHECK-LOG (verify.sh) / VERIFY |
| 61 | `3b286bda` | 08-21 | Maxim Uymin | Close spec-vs-code drift (second-pass review) | 21 files: specs, skills, `cli/AGENTS.md`, eslint-setup.xml, plugin specs | Docs synced to code (gateIds, combinator roster, D-STACK-016 label, 7 CI jobs…). | DOCS |
| 62 | `0c0bc387` | 08-21 | Maxim Uymin | Unresolved sandboxLinks loud; config entries glob | NEW `services/stack/sandbox-links.ts` (deleted later), verify.cmd, 6 fixtures | `UNRESOLVED_SANDBOX_LINK` diagnostic; `*` glob; `**` rejected. (Removed by D-STACK-017.) | VERIFY |
| 63 | `9ea29083` | 08-21 | Claude Opus 5 | Fix P1s from pre-merge thread audit | gate-runner, tree-replica, sandbox-links, stack-config, env-fail, node classify, fix/verify help | Replica failure → env-fail (never real-tree run); nested link parents created; `sandboxLinks ['.']` rejected; envFail catch-all guard canonicalises whitespace (`> 0`); umbrella npm scripts screened across all shell separators (`&`, `;`, `||`, `wait`) with redirections stripped; help texts fixed. | VERIFY |
| 64 | `ecf0362d` | 08-24 | Maxim Uymin | spec(stack): D-STACK-017 — verify runs in the real tree on a clean HEAD | stack.spec, config.spec, plugin specs | Decision: replica removed; clean-tree precondition (`DIRTY_TREE`, exit 4); reset = `reset --hard` + `clean -fd` (no -x); per-repo lockfile; verdict binds to a commit; sandboxLinks removed. | VERIFY (spec) |
| 65 | `1d48432e` | 08-24 | Maxim Uymin | feat(stack): clean-tree guard replaces the run replica | NEW `services/stack/tree-guard.ts` (+test), DEL `tree-replica.ts`, DEL `sandbox-links.ts`, gate-runner (−170), verify.cmd, stack-config, plugins, 27 fixture files | Gates run in the real tree; `.git/gennady-verify.lock` (pid + cleanAtStart) with crash recovery; `--plan` allowed on dirty tree; `sandboxLinks` unknown key; e2e `commit:` key; `go-dirty-tree`, `any-ignored-workspace`, `any-dirty-tree` fixtures. | VERIFY |
| 66 | `cbc292a0` | 08-25 | Maksim Uimin | Merge fork PR #3 (`maksimuimin/feat/clean-tree-verify`) | merge of 64–65 | — | VERIFY |
| 67 | `e2b6087c` | 08-25 | Konstantin Lebedev | fix(stack): close pre-merge review findings — verify/fix correctness, CI | gate-runner, fix.cmd, node classify/plugin, golang-scope, stack-config, sync-core, verify.sh, help, rc-config, ci.yml | `outputMeansFailure` is output-driven (grep exit 1 on clean is not FAIL); `fix --plan/--dry-run` honoured; fixer does not inherit `outputMeansFailure`; fix rejects unmatched overrides; node screens mutating candidates before priority sort; gofmt prunes at any depth; override `requires/fixer` use overridden cwd; sync-core: one throwing statSync no longer disables a root; verify.sh delegates only on positive capability signal (JSON / exit 4|5) with probe timeout, `NO_SCRIPTS_DISCOVERED` exits 1; `getStack()` dropped from rc-config. | VERIFY / SYNC-OWN / CHECK-LOG |
| 68 | `ff943594` | 08-25 | Konstantin Lebedev | docs(stack): align specs/skills/AGENTS post-D-STACK-017 | AGENTS.md, README, cli README, specs, plugin specs/skills | Docs only (fix-facet mentions dropped, inventories completed, fixture counts). | DOCS |
| 69 | `b4840ca1` | 08-25 | Lebedev K. | Merge PR #5 (`maksimuimin/feat/sdd-infra-golang`) | merge of 11–68 | "stack plugin system + `gennady verify` — one verification verb for every stack". | VERIFY |

### 1.3 Post-#5 SDD flow rework, sync hardening, packaging (direct + PRs #8/#10/#12/#14/#18)

| # | sha | date | author | subject | PR | files (grouped) | behavioural change | track |
|---|---|---|---|---|---|---|---|---|
| 70 | `3763f3ce` | 08-25 | Лебедев К. | docs(sdd): unified SDD Flow guide; sync skill/directive docs with code | direct | NEW `docs/sdd-flow.md` (407), `ai/directives/sdd/README.md`, `ai/skills/README.md`, coding/infra READMEs, knowledge.xml, sdd-skills.spec; DEL `ai/fw-draft/**` (13 files), DEL `ai/fw/v1/**`, `ai/fw/v2/**` (6 files) | Scenario-driven flow guide; documents that `sync` MUST run before `sync-skills`; stale refs fixed; dead legacy trees removed. | DOCS |
| 71 | `db8fa198` | 08-25 | Лебедев К. | docs(sdd): drop sdd-hooks-install; TOC + skill picker | direct | DEL `ai/skills/sdd-hooks-install/SKILL.md`, docs/sdd-flow.md, specs (skill counts 17→16, 13→12) | `sdd-hooks-install` skill removed; skill picker table (continue = refine/pivot only). | SKILLS / DOCS |
| 72 | `c92a53bf` | 08-25 | Лебедев К. | build(publish): ship docs/** in the npm package | direct | package.json `files` | `docs/**/*` added to the tarball allowlist. | REL-PKG |
| 73 | `4c973c42` | 08-25 | Лебедев К. | chore(release): v0.8.4-next.2 | direct | version | | REL-PKG |
| 74 | `599cdb25` | 08-25 | Лебедев К. | style(format): prettier output of publish-gate lint | direct | AGENTS.md, sdd README, docs/sdd-flow.md, config/plugins/stack specs | Formatting only. | OTHER |
| 75 | `0e1b1ed5` | 08-25 | Лебедев К. | chore(release): v0.8.4-next.3 | direct | version | | REL-PKG |
| 76 | `cd7f3e01` | 08-26 | Лебедев К. | fix(sdd): remove the contradictions that deadlock the execute→audit flow | direct | `ai/skills/sdd-execute/scripts/lint-artifacts.sh` (+ 3 regression tests, then at `ai/skills/sdd-execute/scripts/__tests__/`), `verify.sh`, `phase-execution-protocol.xml`, `audit.directive.xml`, `sdd-execute/SKILL.md`, `sdd-execute-batch/SKILL.md`, `tasks/README.md` | `sdd lint` resolved gennady at RUNTIME (sync-skills had rewritten `GENNADY_CLI=~/…` into a non-assignment → `set -u` crash); ERROR OWNERSHIP bounded by AX_PHASE_SCOPE_LOCK (repo-wide gate failing outside scope = handoff, not deadlock); no per-gate `ver` "pass" lines; `RULE_FILE_INCOMPLETE` routed `rule-file-fix`; `sync <scope>+root` removed from Round-close template; audit cap resume token `--new-audit-session`; blocked lanes parked; tasks/README log template mirrors scaffold table. | CHECK-LOG / DIR-SDD / SKILLS |
| 77 | `b4cd8c00` | 08-26 | Лебедев К. | chore(release): v0.8.4-next.4 | direct | version | | REL-PKG |
| 78 | `780d449e` | 08-26 | Лебедев К. | chore(release): v0.8.4-next.5 | direct | version | | REL-PKG |
| 79 | `0e1e3ede` | 08-26 | Лебедев К. | chore(release): v0.8.4-next.6 | direct | version | | REL-PKG |
| 80 | `1e22e8ad` | 08-26 | Лебедев К. | fix(sdd): `[x] DONE` now means audited, not merely closed | direct | scaffold.directive (AX_AUDIT_HOOK), sdd-execute + batch SKILL.md, tasks/README | Round close leaves ticket `[~] IN_PROGRESS`; only audit PASS writes `[x] DONE` and re-syncs trackers; pickability (`DONE` deps) now truthful. | CHECK-LOG / SKILLS |
| 81 | `139448e3` | 08-26 | Лебедев К. | feat(sdd): `sdd check` owns rule-file schema | direct | `check.sh` (+220 incl. tests), audit.directive, sdd-check/SKILL.md | New `[RULES]` section: tolerant opening-tag scan for `<BeliefState>/<AntiPatterns>/<VerificationHooks>/<RewardCriteria>` in non-`*.directive.xml` rule files (coding/testing/infra, project + plugin trees); tree mode all, task mode only cited; separate `rule_findings` counter. Surfaced 6 incomplete rule files. | CHECK-LOG / RULES |
| 82 | `cf4f0470` | 08-26 | Лебедев К. | feat(sdd): `sdd check` owns Execution Log tokens and Round-close shape | direct | `check.sh` (+256 incl. tests), audit.directive, sdd-check/SKILL.md | New `[LOG]` section: `unknown-token`, `unclosed-round` (findings); `retired-token` (sync/file/test/cov/rules/recon + capitalised plan-template lines), `round-close-no-timestamp` (informational); trailing colon cosmetic; 🛑/✅ blocker markers recognised. | CHECK-LOG |
| 83 | `f66a77ee` | 08-26 | Лебедев К. | fix(sync-skills): stop deploying a skill's own tests | direct | sync-skills-core (+test) | `__tests__` and `*.test.*`/`*.spec.*` excluded from the deployed skill set (a checkout-relative import had broken consumers' `tsc`). Orphan deletion is per-skill-dir, so stale copies need manual removal. | SYNC-OWN |
| 84 | `7d48149d` | 08-26 | Лебедев К. | test(sync): guard what actually reaches a consumer project | direct | tests moved `ai/skills/sdd-execute/scripts/__tests__/* → scripts/__tests__/`; NEW `scripts/__tests__/deployed-surface.{test.ts,golden.txt}` | Golden snapshot of every path `sync`+`sync-skills` would write (76 files then), plugin surfaces included; `UPDATE_SURFACE_GOLDEN=1` to accept; invariants: no test artifact, no developer path in the surface. | SYNC-OWN / TESTS |
| 85 | `d531be09` | 08-26 | Лебедев К. | chore(release): v0.8.4-next.7 | direct | version | | REL-PKG |
| 86 | `9584796f` | 08-26 | Лебедев К. | chore(release): v0.8.4-next.8 | direct | version | | REL-PKG |
| 87 | `f8d42a33` | 08-26 | Лебедев К. | fix(sdd): `unclosed-round` no longer fires on a round that never ran | direct | check.sh, sdd-check-log.test.ts | `unclosed-round` requires ≥1 ticked phase line in the round (pristine scaffold is not a finding). | CHECK-LOG |
| 88 | `2a0282da` | 08-26 | Лебедев К. | feat(verify): --wip | direct | verify.cmd, gate-runner, tree-guard (+71), verify.sh, phase-execution-protocol, sdd-execute SKILL + scripts README | `gennady verify --wip` skips the clean precondition and drift detection, waits up to 15 min for a held lock; guard NEVER resets in wip mode (`cleanAtStart:false`); verify.sh forwards flags; protocol mandates `sdd verify --wip` before EMIT_HANDOFF. | VERIFY / CHECK-LOG / DIR-SDD |
| 89 | `ac2e9d73` | 08-26 | Лебедев К. | feat(sdd): compute the audit verdict; declare the testing-rules cascade | direct | audit.directive (AX_SEVERITY_TAGGING), `testing/vitest-rules.xml`, `testing/node-test.xml` | 4-row verdict table PASS / PASS_WITH_ACKNOWLEDGED_RISKS / FAIL; project-scope findings capped at MINOR; `<DependsOn>testing/common.xml` declared in vitest-rules and node-test. | DIR-SDD / RULES |
| 90 | `478e7319` | 08-26 | Лебедев К. | fix(lint): stop lint.cmd from running the CLI on import | direct | `cli/cmd/lint/{index.ts,lint.cmd.ts}` + 2 tests | Self-executing tail moved to `index.ts`; tests drop `process.exit` stubs (was a test-runner IPC flake). | OTHER |
| 91 | `8e378ad3` | 08-26 | Лебедев К. | chore(release): v0.8.4-next.9 | direct | version | | REL-PKG |
| 92 | `d6065c36` | 08-31 | Test (RubaXa) | fix(sdd): bound critic convergence loop | #8 | critic.directive, critic-protocol, sdd README, skills README, docs/sdd-flow, NEW `scripts/__tests__/critic-directive-contract.test.ts` | Critic stops on first CLEAN (5 rounds = emergency cap, AX_MIN_ROUNDS/Polish gone); round 1 baseline vs later focused verification; blocking findings need requirement provenance + concrete breakage; confusion triaged ARTIFACT_GAP / CONTEXT_MISSING / NON_BLOCKING_QUESTION; cross-artifact changes return to authoring. | DIR-SDD |
| 93 | `d4d2f3a7` | 08-31 | Lebedev K. | Merge PR #8 (`RubaXa/codex/critic-convergence`) | #8 | merge | | DIR-SDD |
| 94 | `c9c0977a` | 08-31 | Лебедев К. | chore(release): v0.8.4-next.10 | direct | version | | REL-PKG |
| 95 | `90b123e9` | 09-01 | Test (RubaXa) | feat(sdd): make adaptive execution evidence-driven | #14 (squash) | 28 files +2389/−498: audit.directive (+293), phase-execution-protocol, scaffold, critic, `sdd-execute/SKILL.md` (+176), `sdd-execute-batch/SKILL.md` (rewritten −194), sdd-audit/sdd-check SKILL, `scripts/{check.sh,scan.sh,_sdd-lib.sh,extract-section.sh,sdd}`, AGENTS.md, docs/sdd-flow, sdd-skills.spec, NEW `tasks/ai-skills/{README,sdd-skills.task-97}.md`, NEW tests `sdd-adaptive-execution-contract`, `sdd-review-lifecycle-contract`, `directive-markup-contract`; extended `sdd-check-log`, `sdd-check-rules` | Batch = serial dependency scheduler, no own state machine (one shared worktree); repeat depends on provable progress, not attempt count; runtime claims require an actually executed command/probe with exit code; `[REOPENS]` = bidirectional causation Audit FAIL ↔ next Round (OK/PENDING/MISMATCH/UNVERIFIABLE); Task-ID read from Meta, accepts `TSK-NN` and `TSK-PREFIX-NNN`; `fabricated-placeholder` LOG kind; tools from the loaded installation (`<sdd-path>`), model inherited; AGENTS.md declares directives as HTML-like prompt markup, not strict XML. | CHECK-LOG / DIR-SDD / SKILLS |
| 96 | `d86c49dd` | 09-02 | Test (RubaXa) | fix(rules): complete checkable rule surfaces | #18 (squash) | `coding/result-conventions.xml`, `coding/uikit-spec-drafting.xml`, `testing/common.xml`, `testing/node-test.xml`, `testing/vitest-rules.xml`, `plugins/golang/directives/infra/golang-setup.xml`, NEW `scripts/__tests__/testing-rule-contract.test.ts` | All six rule files flagged by `[RULES]` gain the missing sections (anti-patterns / hooks / rewards); contract test forbids empty section markers; `sdd check` tree mode → 19 RULES rows OK, rule_findings=0. | RULES |
| 97 | `62172906` | 09-02 | Artur Protska | fix(sdd): harden tooling portability and safe skill sync (#10) | #10 (squash) | `_sdd-lib.sh` (+60), `check.sh` (+106), `scan.sh`, `sdd`, discovery/module-decomposition directives, sdd-check SKILL, `cli/cmd/sync-skills/**` (+415 incl. tests), `shared/common/sync/sync-deps.type.ts`, sync-skills.spec, NEW `scripts/__tests__/sdd-task-id.test.ts` (300) | Strict Task-ID grammar `TSK-([A-Z]+-[0-9]{3}|[0-9]+)` with whole-token-then-anchored validation (`TSK-IB-0012` no longer green); `check --task` exit 4 on malformed/absent id; `NO_TICKETS_FOUND` never findings=0; orphan `@tasks` scan covers non-TS sources (Swift/ObjC…); sync-skills ownership manifest `.claude/skills/.gennady-synced` — prunes only skills a previous sync installed, first-run adoption policy, manifest merge on filtered sync; AX_LANG_PASS_ON_WRITE built-in fallback when `ai/directives/language/` absent; `fs.rm` recursive for Node 20+. | CHECK-LOG / SYNC-OWN / DIR-SDD |
| 98 | `4a47b9e8` | 09-03 | Artur Protska | feat(sdd): `sdd check` catches writes into a closed round (#12) | #12 (squash) | check.sh (+67), `sdd`, sdd-check SKILL, audit.directive, sdd-check-log.test.ts (+200) | New `[LOG]` kinds `entry-after-close` (ticked entry stamped later than its Round close) and `extra-close-entry` (live-token entry inside the close block), both findings; timestamp comparison normalises minute vs second precision; Execution Log region ends at ANY `## ` heading (critic `## Critic Rounds` no longer parsed as log). | CHECK-LOG |
| 99 | `580eb5d7` | 09-03 | Test | chore(release): move next line to 0.9.0-next.0 | direct | version | Prerelease base rebased above `latest` 0.8.4 so `gennady@next` is not semver-lower. | REL-PKG |
| 100 | `80a81fcd` | 09-03 | Test | fix(pkg): ship a real library exports surface | direct | package.json, tsconfig.json, vite.config.ts | `exports`: `.` → `dist/index.js` + d.ts; `./stack` → new vite entry `dist/stack.js` + `dist/services/stack/plugin-api.d.ts`; `./providers/*` dropped; `gennady/stack` aliased to source for bundle/type-check. | REL-PKG |
| 101 | `487b4b13` | 09-03 | Test | chore(pkg): add .npmignore | direct | NEW `.npmignore` | Subtractive guard: `*.test.*`, `__tests__/`, `fixtures/`, `e2e/`, coverage, `.map`, cruft. | REL-PKG |
| 102 | `8358bf8b` | 09-03 | Test | test: run the unit suite serially | direct | package.json | `npm test` pins `--test-concurrency=1` (Node test-runner IPC deserialisation crash ~50% under parallel). | REL-PKG / TESTS |
| 103 | `290b4248` | 09-03 | Test | refactor(pkg): default export condition; drop dead vite fileName | direct | package.json, vite.config.ts | `default` condition on `.`/`./stack`; `entryFileNames` single source of truth. | REL-PKG |
| 104 | `b90a802f` | 09-03 | Лебедев К. | chore(release): v0.9.0-next.1 (phantom) | direct | version | Pushed by a failed publish-next run — nothing on npm. | REL-PKG |
| 105 | `6256ee28` | 09-03 | Лебедев К. | chore(release): v0.9.0-next.2 (phantom) | direct | version | | REL-PKG |
| 106 | `b5dd081f` | 09-03 | Лебедев К. | chore(release): v0.9.0-next.3 (phantom) | direct | version | | REL-PKG |
| 107 | `bbee8efc` | 09-03 | Test | test(e2e): sync asserts the `<sdd-path>` token | direct | `cli/__tests__/e2e/sync.e2e.test.ts` | Synced `audit.directive.xml` must contain `<sdd-path>` (retired `npx gennady` assertion blocked prepublishOnly). | SYNC-OWN / TESTS |
| 108 | `009ff59a` | 09-03 | Test | fix(release): npm publish before any git commit/tag/push | direct | `scripts/publish-next.ts` | Order: `npm publish` (runs prepublishOnly gate) FIRST; git commit/tag/push only on success. | REL-PKG |
| 109 | `b2fbb234` | 09-03 | Test | chore(release): reset base to 0.9.0-next.0 after phantom bumps | direct | version | Phantom tags deleted out of band. | REL-PKG |
| 110 | `b1a43fd7` | 09-03 | Лебедев К. | chore(release): v0.9.0-next.1 | direct | version | first real 0.9.0 prerelease | REL-PKG |
| 111 | `f74c8c1d` | 09-03 | Test | feat(sync): knowledge.xml is project-owned | direct | `cli/cmd/sync/{sync-core,sync.types}.ts` (+test), `shared/common/sync/sync-formatter.shared.ts`, knowledge.xml header, scaffold.directive | `PROJECT_OWNED_ENTRIES = {knowledge.xml}`: seeded when absent, never overwritten (new status `preserved`, shown in output/summary); scaffold rules axiom: registry is project-owned, non-Node scopes author their own rules. | SYNC-OWN / RULES / DIR-SDD |
| 112 | `0c2307fc` | 09-03 | Лебедев К. | chore(release): v0.9.0-next.2 | direct | version | | REL-PKG |
| 113 | `5a237cd5` | 09-03 | Test | feat(rules): language-agnostic + Python/Go baseline rules (de-Node iter 2) | direct | NEW `coding/baseline-rules.xml`, `coding/python-rules.xml`, `coding/go-rules.xml`, NEW `testing/baseline-testing.xml`, knowledge.xml (+42), deployed-surface golden (+4) | Language-agnostic parents + thin Python/Go rules (`<DependsOn>` baseline); registered in knowledge.xml; `typescript-rules` trigger narrowed to `.ts/.tsx`; all four carry the four checkable sections. | RULES |
| 114 | `c7051379` | 09-03 | Лебедев К. | chore(release): v0.9.0-next.3 | direct | version | current main version | REL-PKG |
| 115 | `8bb38477` | 09-03 | Test | feat(sdd): single-source facts by reference (iter 3) | direct | scaffold.directive (AX_SSOT_TRACEABILITY, AX_TICKET_HAS_BDD_AND_TESTS), audit.directive | SSOT generalised: docs reference spec facts by anchor, never restate literals (literal lives in code+test); BDD expected outcome references the spec anchor; audit gains advisory INFO `dangling-spec-ref` (structural anchor resolution only). | DIR-SDD |

### 1.4 `chore(release)` commits, compact

| version | sha | date | note |
|---|---|---|---|
| 0.8.4-next.1 | `ea291ca2` | 08-12 | after PR #4 |
| 0.8.4-next.2 / .3 | `4c973c42` / `0e1b1ed5` | 08-25 | after PR #5 + flow guide |
| 0.8.4-next.4 / .5 / .6 | `b4cd8c00` / `780d449e` / `0e1e3ede` | 08-26 | around `cd7f3e01` |
| 0.8.4-next.7 / .8 | `d531be09` / `9584796f` | 08-26 | after `[RULES]`/`[LOG]` + sync-skills test exclusion |
| 0.8.4-next.9 | `8e378ad3` | 08-26 | after `--wip` |
| 0.8.4-next.10 | `c9c0977a` | 08-31 | after PR #8 — the version all GitHub issues #9–#24 report against |
| 0.9.0-next.0 (base) | `580eb5d7` | 09-03 | rebase of the prerelease line |
| 0.9.0-next.1/.2/.3 (phantom) | `b90a802f` / `6256ee28` / `b5dd081f` | 09-03 | never published; reset by `b2fbb234` |
| 0.9.0-next.1 | `b1a43fd7` | 09-03 | first real 0.9.0 prerelease |
| 0.9.0-next.2 | `0c2307fc` | 09-03 | knowledge.xml project-owned |
| 0.9.0-next.3 | `c7051379` | 09-03 | baseline rules; **= main HEAD version** (HEAD `8bb38477` is one unreleased commit past it) |

## 2. Track classification (every commit; a commit may sit in 2 tracks)

| Track | Commits (short sha) | Count |
|---|---|---|
| VERIFY | `52c03db9 fb312581 cac9169b f5936947 63a3b4b3 3c28f776 34cbfc14 27cb0a50 aee24246 c008ae77 bb2406a7 901159d9 77b753b9 1060129d 7af8d29e bc7a4638 66b62e7a 86b47961 13df864a a336f17b 5651c05f 0561630c ef3cd4e5 5d68ce05 ea3f001e 23e972af 2e304b0f 35318b6b 9af4db93 fbad6cf9 7cb69946 0c0bc387 9ea29083 1d48432e cbc292a0 e2b6087c b4840ca1 2a0282da 40d209d8(stack-config part)` + spec-only `d359a098 5e92ed5a 984f85de 6d00bee5 06cde35c 205334ad 2acb19c6 5ebdc2ad 837f4685 35f9b559 c76f94fd ecf0362d` | 51 |
| CHECK-LOG | `cd7f3e01 1e22e8ad 139448e3 cf4f0470 f8d42a33 2a0282da(verify.sh/protocol) 90b123e9 62172906 4a47b9e8 40d209d8(verify.sh, classify-scripts) e2b6087c(verify.sh)` | 11 |
| SYNC-OWNERSHIP | `d6479748 a336f17b(staging, reverted) 40d209d8(scanSkillRoots) e2b6087c(sync-core statSync) f66a77ee 7d48149d 62172906(manifest) bbee8efc f74c8c1d` | 9 |
| RULES | `139448e3([RULES] check) ac2e9d73(DependsOn) d86c49dd f74c8c1d(knowledge.xml header) 5a237cd5` | 5 |
| DIRECTIVES-SDD | `713fefd4 cd7f3e01 1e22e8ad 139448e3 cf4f0470 2a0282da ac2e9d73 d6065c36 d4d2f3a7 90b123e9 62172906(discovery/module-decomp model inheritance) 4a47b9e8(audit) f74c8c1d(scaffold) 8bb38477` | 14 |
| SKILLS | `52c03db9(sdd-infra, sdd-infra-golang) a336f17b/5651c05f/d6479748(golang skill moves) db8fa198(DEL sdd-hooks-install) cd7f3e01 1e22e8ad 139448e3 cf4f0470 2a0282da 90b123e9 62172906 4a47b9e8 3b286bda` | 13 |
| RELEASE-PACKAGE | `8dc1d1cd 5c5a1f6a 5697f027 c5fa924f 620f0026 34cbfc14(scripts) 86b47961(exports) d6479748(files) c92a53bf 580eb5d7 80a81fcd 487b4b13 8358bf8b 290b4248 009ff59a b2fbb234` + 17 version bumps (`ea291ca2 4c973c42 0e1b1ed5 b4cd8c00 780d449e 0e1e3ede d531be09 9584796f 8e378ad3 c9c0977a b90a802f 6256ee28 b5dd081f b1a43fd7 0c2307fc c7051379`) | 32 |
| DOCS | `3461d2fd 2acb19c6 fed54618 052cdd7e b08546ec 3b286bda ff943594 3763f3ce db8fa198` (+ spec-only VERIFY commits above) | 9 |
| TESTS-ONLY | `faf3b72f f65e2977 1060129d 7af8d29e 9af4db93(fixture-integrity) 7d48149d bbee8efc 8358bf8b` | 8 |
| OTHER | `320c7e27 599cdb25` (format), `da3a53e9 185bea20` (CI), `478e7319` (lint.cmd import side effect) | 5 |

## 3. Invariants / behaviours per track

Legend: **[N]** = Node/npm-specific, **[A]** = language-agnostic. `file:line` is main HEAD `8bb38477`. Test column = file → describe/it that locks it.

### 3.1 VERIFY (`gennady verify` / `gennady fix` / stack plugins / config)

| # | Invariant (checkable) | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| V1 | `gennady verify` exits 0 only when every executed gate passed AND ≥1 gate executed AND no blocking diagnostic; exit 1 = gates failed / ZERO_GATES / BLOCKED; exit 4 = bad invocation or invalid config (no gate ran); exit 5 = named stack did not match. | `52c03db9 fb312581 5d68ce05 fbad6cf9 7cb69946` | `cli/cmd/verify/verify.cmd.ts:42-46,371,376`; `services/stack/gate-runner.ts:376-381` | `cli/cmd/verify/__tests__/verify.cmd.test.ts` "verify command" (16 tests); `services/stack/__tests__/gate-runner.test.ts` "runVerify" | A |
| V2 | JSON `ok` uses the same expression as the exit code (`report.ok && total>0`); a zero-gate run carries a stable `ZERO_GATES` diagnostic in `--json` and the human report prints the fix hint. | `fbad6cf9 7cb69946 35318b6b` | `verify.cmd.ts:339-362`; `gate-runner.ts:116-121,371,485-494` | gate-runner.test.ts "runVerify"; e2e fixtures `any-detected-everywhere`, `go-*-zero-gates` | A |
| V3 | Verdict ladder per gate: skipped → spawn failure → matched envFail rule → timeout → violation → drift-FAIL → stdout contract → exit code (D-STACK-015). ENV_FAIL outranks TIMEOUT and VIOLATION. | `901159d9` | `gate-runner.ts:134-338` | gate-runner.test.ts "runVerify — verdict precedence (spec §8.2, D-STACK-015)" | A |
| V4 | Gate statuses are exactly `pass | fail | env-fail | skipped | timeout | violation`; `output` is empty on pass (see issue #17). | `3c28f776` | `services/stack/stack.types.ts:181`; `gate-runner.ts:331,335` | gate-runner.test.ts; `services/stack/__tests__/e2e/fixture.ts` closed expect.yaml schema | A |
| V5 | Verify runs gates in the REAL working tree behind a clean-tree precondition: `git status --porcelain` non-empty → `DIRTY_TREE`, exit 4, zero gates run; `--plan` still works on a dirty tree (D-STACK-017). | `1d48432e ecf0362d` | `verify.cmd.ts:307-329`; `services/stack/tree-guard.ts:79-82,132-200` | `services/stack/__tests__/tree-guard.test.ts` "acquireTreeGuard", "treeStatus"; fixtures `go-dirty-tree`, `any-dirty-tree` | A |
| V6 | One verify per worktree via `.git/gennady-verify.lock` (pid + `cleanAtStart`); a dead holder's lock with `cleanAtStart:true` triggers automatic `git reset --hard && git clean -fd` (no `-x`); after a run the guard resets only if it was clean at start. | `1d48432e` | `tree-guard.ts:54-58,126-128,148-200` | tree-guard.test.ts "acquireTreeGuard" | A |
| V7 | `--wip` skips the clean check and drift detection, waits up to 15 min (`LOCK_WAIT_MS`) for a held lock, and NEVER resets the tree (lock records `cleanAtStart:false`). | `2a0282da` | `verify.cmd.ts:89,307-313`; `gate-runner.ts:28,83`; `tree-guard.ts:41-43,145` | tree-guard.test.ts "acquireTreeGuard — wip mode" (incl. "release leaves uncommitted work untouched"); gate-runner.test.ts wip cases | A |
| V8 | Config = deep-merge of `<repo>/.gennadyrc` > `<repo>/gennady.yaml` > `$HOME/.gennadyrc` (objects merge, scalars/arrays replace) with per-key provenance shown in `--plan`; `__proto__`/`constructor`/`prototype` keys are fatal ConfigErrors. | `52c03db9 bc7a4638 ef3cd4e5` | `services/config/config-loader.ts:11-14,21,198-235` | `services/config/__tests__/config-loader.test.ts` "loadConfigSection", "…prototype-polluting keys (review #2)"; `services/stack/__tests__/stack-config.test.ts` "loadStackConfig — discovery and merge"; config e2e fixtures (17) | A (yaml dev-dep bundled) |
| V9 | Strict validation is fatal: unknown key anywhere (did-you-mean via Damerau-Levenshtein), wrong type, bad duration, unknown `use` id, override of an unknown gate → full error list, exit 4, zero gates. A stale `fixers:` or `sandboxLinks:` key is an unknown-key error. | `52c03db9 bb2406a7 1d48432e` | `services/stack/stack-config.ts:34,68,113-114,174-175`; `shared/common/damerau-levenshtein.ts` | stack-config.test.ts "loadStackConfig — strict validation (fatal errors)" | A |
| V10 | Duration grammar `^[1-9]\d*(s|m|h)$` — zero is rejected so a mandatory per-gate timeout cannot be switched off; runner refuses non-positive timeout. | `ef3cd4e5` | `config-loader.ts:23-25,72` | config-loader.test.ts "parseDuration — a mandatory timeout cannot be zeroed" | A |
| V11 | `overrideGates.<id>` that matches no planned gate is an error after planning (exit 4) in both `verify` and `fix`. | `5d68ce05 e2b6087c` | `stack-config.ts:398` (`unmatchedGateOverrides`); `cli/cmd/fix/fix.cmd.ts:111` | config e2e fixture (red-first) `cfg-override-unmatched`; fix.cmd.test.ts | A |
| V12 | Gate parity (FR-STACK-15): every field of a plugin-planned gate is authorable in config except `stack`, `label`, `skipped` (+ alias `timeoutMs`↔`timeout`). | `aee24246` | `services/stack/__tests__/gate-spec-parity.test.ts`; `stack-config.ts:34` GATE_SPEC_KEYS | gate-spec-parity.test.ts "GateSpec parity with built-in gates (FR-STACK-15)" (2 tests, runtime union) | A |
| V13 | One `CmdSpec` {argv,cwd,env,timeout,hint} for gate command, `requires` precondition and `fixer`; `hint` mandatory on `requires`, rejected on `fixer`; a precondition failure → gate ENV_FAIL with the precondition's hint, gate command never runs; default precondition timeout 30 s; config fixer defaults to its gate's timeout. | `c008ae77 bb2406a7 40d209d8` | `stack.types.ts:113-167`; `stack-config.ts:68`; `gate-runner.ts:152-190` | gate-runner.test.ts requires cases; stack-config.test.ts; fixtures `go-extra-requires-missing/ok`, `go-requires-config-error`, `go-gate-fixer` | A |
| V14 | Config `envFail` rules: `exitCodeMatches` (`== != >= <= > <`, scalar or AND-list; null exit never matches), `stdoutMatches`/`stderrMatches`/`outputMatches`; `hint` mandatory; catch-all rules (`>0`, `!=0`, `>=1`, empty regex) fatal after whitespace canonicalisation; config rules PREPEND plugin predicates; matched rule reports its source file; predicates see the same head(20)+tail(40) window the report prints. | `aee24246 77b753b9 9ea29083` | `services/stack/env-fail.ts:43-250`; `gate-runner.ts:19-21,397-405` | `services/stack/__tests__/env-fail.test.ts` (14; "catch-all guard is whitespace-insensitive"); gate-runner.test.ts "predicates see a bounded window"; fixtures `go-envfail-rules/-streams/-catchall/-hint-precedence` | A |
| V15 | Timeout kills with `SIGKILL`; ENOBUFS overrun is not a spawn failure (falls through the ladder, default FAIL, output marked cut). | `ef3cd4e5 23e972af` | `gate-runner.ts:198,240,256` | gate-runner.test.ts "output that overruns the capture cap" + SIGTERM-ignoring child regression | A |
| V16 | `outputMeansFailure` is output-driven, not exit-code-gated (grep exiting 1 on no-match is not FAIL). | `e2b6087c` | `gate-runner.ts:326-331` | gate-runner.test.ts "outputMeansFailure grep clean case" | A |
| V17 | `--only`/`--skip` take `stack:gate` or bare `gate`; `--only` lifts a config `skipGates` entry (CLI `--skip` still wins); unknown gate ids → exit 4; `--stack` is a one-shot `stack.use` (unknown plugin → exit 4). | `52c03db9 cac9169b` | `verify.cmd.ts:116-128,164-209` | verify.cmd.test.ts; fixtures `go-skip-lifted-by-only`, `go-skip-cli-wins` | A |
| V18 | Detection: node = root `package.json` exists (broken JSON stays detected → `NODE_INVALID_MANIFEST`), golang = root `go.mod`, anystack = always; `BUILTIN_PLUGINS = [anystack, golang, node]` via static `plugins/index.ts` (D-SP-009); a stack that planned zero gates is omitted from every report surface; `NO_STACK_DETECTED` (exit 5) only when `--stack`/`use` names a non-matching stack. | `52c03db9 13df864a 2e304b0f 35318b6b` | `plugins/index.ts:15`; `services/stack/stack-registry.ts:12-49`; `verify.cmd.ts:140-147` | `services/stack/__tests__/stack-registry.test.ts` "detectStacks", "registry composition"; fixtures `any-detected-everywhere`, `any-with-node-stack` | A (mechanism) / N,Go (plugins) |
| V19 | golang gate order `generate → build → vet → fmt → lint → test`; defaults build/vet/lint 5 m, fmt 1 m, test 10 m, generate 5 m; `go test -timeout` renders at 90 % of the gate timeout; `go build -o /dev/null`; `gofmt -l` never `go fmt`; panic is ENV_FAIL on build/vet/lint but FAIL on test; missing generator binary and blocked GOPROXY are ENV_FAIL with hints. | `52c03db9 27cb0a50 63a3b4b3 23e972af 7af8d29e` | `plugins/golang/golang-plan.logic.ts:17-24,135,139,162-180,207-213` | `plugins/golang/__tests__/golang-plan.test.ts` (20); golang e2e fixtures (49) | Go |
| V20 | golang scope: changed mode from `git diff --relative` vs base (origin/HEAD → origin/main → master); edits to `go.mod|go.sum|go.work|.golangci.*|vendor/` widen to `./...`; `go list -e` drops only 4 whitelisted non-package errors (unknown error KEEPS the package, fail-open), paths canonicalised via realpath; `vendor/testdata/node_modules` pruned at any depth; missing `go` toolchain → blocking `TOOLCHAIN_MISSING`, checked on `tools['go']`. | `fb312581 fbad6cf9 ea3f001e 9af4db93 23e972af 5d68ce05 7cb69946` | `plugins/golang/golang-scope.logic.ts:12,125,161-192,336-355`; `plugins/golang/golang-detect.logic.ts:297-305` | `plugins/golang/__tests__/golang-scope.test.ts` "resolveGoScope — changed mode in a real git repository", "isStructuralListError"; golang-detect.test.ts "TOOLCHAIN_MISSING guard"; fixtures `go-scope-*`, `go-proxy-blocked` | Go |
| V21 | node: gates classified from `package.json` scripts (typecheck/gennady/lint/test/format); bodies matching `--(fix|autofix|write)` are mutating and screened out BEFORE priority sort; umbrella scripts chained by `&& || ; & wait` (redirections stripped) and watch-like scripts are excluded; default gate timeout 10 m. | `52c03db9 fb312581 9ea29083 e2b6087c` | `plugins/node/classify-npm-scripts.ts:17-18,40-64,126-139` | `plugins/node/__tests__/node-plugin.test.ts` "classifyNpmScripts", "umbrella screening across shell separators", non-mutating fallback (14 tests); node fixtures (11) | N |
| V22 | anystack contributes no gates (`gateIds: []`); all gates authored as `stack.anystack.extraGates`; ENV_FAIL parity holds for config-authored gates. | `2e304b0f 35318b6b` | `plugins/anystack/anystack-plugin.ts` | anystack fixtures (7: `any-extra-gates`, `any-envfail-rule`, `any-ignored-workspace`, `any-dirty-tree`, …) | A |
| V23 | `gennady fix` builds the SAME plan as verify and runs the `fixer` of every planned gate that declares one, sequentially, fail-fast, in the real tree; honours `--plan/--dry-run`; fixer inherits gate envFail but not `outputMeansFailure`; `fix <stack>:<id>` runs repo-wide; prints `ENV_FAIL`. | `f5936947 bb2406a7 7af8d29e 23e972af e2b6087c` | `cli/cmd/fix/fix.cmd.ts:29-33,55,96-117` | `cli/cmd/fix/__tests__/fix.cmd.test.ts` (4); fixtures `go-gate-fixer`, `go-generate-fix-loop`, `go-fix-missing-tool` | A |
| V24 | Plugin = one directory under `plugins/<id>/` with `plugin.json` {id (= dir name), kind, entry?, specs?, directives?, skills?, e2eFixtures?}; declared-but-missing path fatal, undeclared absent, empty dir = absent (deinit'd submodule), files-without-manifest = error, duplicate id = error; resolver imports no code. | `66b62e7a 0561630c d6479748` | `services/plugins/resolve-plugins.ts:10-25,138-191` | `services/plugins/__tests__/resolve-plugins.test.ts` "discovery", "manifest schema", "surfaces" (17) | A |
| V25 | Plugins reach the host only via the published `gennady/stack` specifier (barrel `services/stack/plugin-api.ts`); no relative import (static or dynamic) may leave a plugin directory; no path outside `plugins/<id>/` mentions `<id>` except an allow-list (locality). | `86b47961 13df864a` | `services/stack/plugin-api.ts`; `vite.config.ts:65-70`; `tsconfig.json:30-35` | `services/plugins/__tests__/plugin-locality.test.ts` "plugin locality" (3) | A |
| V26 | E2E doctrine: fixtures are data (`expect.yaml` closed schema, mandatory `notes`, unknown gate id fails, `noGatesRan`, `ok`, `commit:`); suites run the packed tarball built with `build:publish`; missing toolchain = skip locally, failure under `*_E2E_STRICT=1` (in prepublishOnly + CI); probe list = union of fixtures' `requires`; empty suite fails; every fixture file must be tracked and not ignored. | `27cb0a50 f65e2977 1060129d 9af4db93 2e304b0f 7cb69946 1d48432e` | `services/stack/__tests__/e2e/{setup,fixture,suite,fixture-integrity}.ts`; `scripts/stack-e2e.ts`; `package.json` scripts `test:stack-e2e`, `test:config-e2e`, `prepublishOnly` | `fixture-integrity.test.ts` "e2e fixture integrity" (2); `plugin-suite.e2e.test.ts` (gated by `STACK_E2E=1`); fixture counts now anystack 7 / golang 49 / node 11 / config 17 | A |
| V27 | Dogfood: this repo's `gennady.yaml` skips node `lint` (mutating umbrella) and overrides `gennady` gate to check-only `lint cli/ shared/ services/ plugins/`; `verify --all` on the repo is green (CI `dogfood` job). | `52c03db9 13df864a` | `gennady.yaml`; `.github/workflows/ci.yml:132` | CI dogfood job (7 jobs: lint, unit, packaging, cli-e2e, config-e2e, stack-e2e, dogfood) | N |
| V28 | `verify.sh` (skill script) delegates to `gennady verify` only on a positive capability signal — `gennady verify --plan --json` (10 s timeout) returns JSON or exits 4/5 — never on a bare non-zero; forwards flags (`--wip`, `--json`, `--only=`), path-checks positionals; legacy npm fallback classifies scripts via `classify-scripts.js` (mutating never selected); `NO_SCRIPTS_DISCOVERED` exits 1. | `52c03db9 40d209d8 e2b6087c 2a0282da cd7f3e01` | `ai/skills/sdd-execute/scripts/verify.sh:15-16,40-52,70-83,107-147`; `classify-scripts.js:23-26` | `scripts/__tests__/sdd-verify-delegation.test.ts` "verify.sh capability probe" (2), "classify-scripts.js mutation screen" (1) | N (fallback) / A (delegation) |

### 3.2 CHECK-LOG (`sdd check` / Execution Log / Task-ID / rounds / reopens)

| # | Invariant | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| C1 | Task-ID grammar `TSK-([A-Z]+-[0-9]{3}|[0-9]+)`; path-based form takes EXACTLY three digits; parsing is whole-token-then-anchored-validate with boundary `([^A-Z0-9-]|$)` so `TSK-IB-0012` never reads as `TSK-IB-001` (Meta, tracker first cell, `@tasks`, filenames `*.task-NN.md` / `*.<PREFIX>-<NNN>.md`). | `90b123e9 62172906` | `ai/skills/sdd-execute/scripts/_sdd-lib.sh:36-97` | `scripts/__tests__/sdd-task-id.test.ts` "scan.sh path-based Task-ID", "check.sh --task path-based Task-ID" (incl. `TSK-IB-0012`/`TSK-IB-001X` cases) | A |
| C2 | `sdd check --task` with a malformed id or an id absent from the scope exits 4 (never `findings=0`); a tree with zero tickets is `NO_TICKETS_FOUND` exit 2 — `findings=0` is only emitted after something was checked; findings → exit 3. | `62172906 90b123e9` | `check.sh:49-54,97-120,160-161,193-199,663-666` | sdd-task-id.test.ts "rejects a malformed Task-ID instead of printing findings=0", "refuses to report a clean tree when no tickets were discovered"; sdd-check-log.test.ts "does not return clean for a well-formed but nonexistent prefixed Task-ID" | A |
| C3 | `[TASKID]` orphan `@tasks` scan covers `.ts .js .sh .go .swift .m .mm .h .kt .java .py .rb .rs .cs .php`. | `62172906` | `check.sh:282-286` | sdd-task-id.test.ts "still counts an in-grammar @tasks reference with no ticket as an orphan" | A |
| C4 | `[LOG]` kinds: findings = `unknown-token`, `unclosed-round`, `fabricated-placeholder`, `bad-round-close`, `entry-after-close`, `extra-close-entry`; informational = `retired-token` (`sync file test cov rules recon` + capitalised plan-template prose), `round-close-no-timestamp`. Trailing colon cosmetic; 🛑/✅ blocker markers are not tokens. | `cf4f0470 90b123e9 4a47b9e8` | `check.sh:21-29,495-651` | `scripts/__tests__/sdd-check-log.test.ts` "check.sh [LOG]" (18), "post-close integrity" (7), "region is scoped" (3) | A |
| C5 | `unclosed-round` fires only when the round has ≥1 ticked phase line (a pristine scaffold is not a finding). | `f8d42a33` | `check.sh` [LOG] awk (round close branch ~563-574) | sdd-check-log.test.ts "says nothing about a round that never ran" | A |
| C6 | Post-close integrity: a ticked entry stamped later than its own `Round close` → `entry-after-close`; a ticked, timestamped live-token entry inside the close block → `extra-close-entry`; `T09:00Z` vs `T09:00:00Z` compared at equal precision. | `4a47b9e8` | `check.sh:538,567,593-600,643` | sdd-check-log.test.ts "flags an entry stamped after its own Round close", "does not read a minute-precision entry as later…", "flags a live-token entry sitting inside the close block" | A |
| C7 | The Execution Log region ends at ANY `## ` heading; `## Critic Rounds` (`### Round N` written by critic) is not parsed as log and does not count as an execution round. | `4a47b9e8` | `check.sh` region exit in [LOG] awk | sdd-check-log.test.ts "leaves the critic section out of the log parse", "attributes a finding to its execution round, not to an intervening critic round" | A |
| C8 | `[REOPENS]`: Meta `Reopens` = count of rounds CAUSED by a persisted audit FAIL (bidirectional causation), verdict `OK|PENDING|MISMATCH|UNVERIFIABLE`; never `Round headers − 1`. | `90b123e9` | `check.sh:19,347-418` | sdd-check-log.test.ts "counts only audit-triggered reopens", "flags Reopens metadata that counts unrelated execution rounds", "reports the latest causative audit as pending…" | A |
| C9 | `[RULES]`: every non-`*.directive.xml` file in cascade categories coding/testing/infra (project + plugin trees) must expose `<BeliefState>`, `<AntiPatterns>`, `<VerificationHooks>`, `<RewardCriteria>` (tolerant opening-tag scan); tree mode scans all, task mode only the ticket's cited rules; counted as `rule_findings=` separately from `findings=`. | `139448e3` | `check.sh:20,33-43,436-494,664` | `scripts/__tests__/sdd-check-rules.test.ts` "check.sh [RULES]" (8) | A |
| C10 | `[x] DONE` means audited: Round close sets `[~] IN_PROGRESS`; only audit PASS writes `[x] DONE` and re-syncs trackers; pickability keys on DONE. | `1e22e8ad 90b123e9` | `ai/skills/sdd-execute/SKILL.md:49-50,124`; `ai/directives/sdd/scaffold.directive.xml:241` (AX_AUDIT_HOOK); `tasks/README.md` | `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` "persists only a validated audit candidate…", "audits choices through the existing finding taxonomy and persists PASS" | A |
| C11 | Canonical Execution Log token table lives ONLY in `scaffold.directive.xml` (`intro`, `ver`, `DONE`, …; `ROUND_CLOSE_FORMAT`); `tasks/README.md` mirrors it; `sync <scope>+root` is not a token. | `cd7f3e01` | `scaffold.directive.xml:711-721`; `tasks/README.md` | sdd-check-log.test.ts "accepts a log using only canonical tokens", "flags a token outside the vocabulary" | A |
| C12 | Phase agent MUST run `<sdd-path> verify --wip <target-files>` before EMIT_HANDOFF; ONE `ver` line per invocation; per-gate "pass" lines are forbidden (verify only names failures); `ver` command string must equal the executed bash invocation (else `fabricated-verification`). | `cd7f3e01 2a0282da 90b123e9` | `ai/directives/sdd/phase-execution-protocol.xml:90,322,332` | sdd-review-lifecycle-contract.test.ts "requires executed evidence and keeps harmless paper drift non-blocking"; sdd-adaptive-execution-contract.test.ts | A |
| C13 | `sdd lint` (`lint-artifacts.sh`) resolves gennady at RUNTIME (PATH → `$GENNADY_HOME` tsx → `./node_modules/.bin/gennady`), carries no path literal for the normalizer to mangle; unreachable gennady → actionable exit 1, never an unbound variable. | `cd7f3e01` | `ai/skills/sdd-execute/scripts/lint-artifacts.sh:7-47` | sdd-verify-delegation.test.ts "lint-artifacts.sh after sync-skills normalization" (3) | N (gennady is npm) |
| C14 | `sdd` tooling is invoked through the runtime-resolved `<sdd-path>` placeholder (orchestrator resolves `scripts/sdd` from the installed skill's own directory; synced directives contain `<sdd-path>`, not `npx gennady` or `~/.claude/skills`). Residual `~/.claude/skills` literals remain only in discovery (1) and module-decomposition (1). | `90b123e9 bbee8efc` | `ai/skills/sdd-execute/SKILL.md:17`; `audit.directive.xml:284,410-413`; `scripts/README.md:25` | `cli/__tests__/e2e/sync.e2e.test.ts:73-78` (synced audit.directive contains `<sdd-path>`) | A |
| C15 | Batch is a serial dependency scheduler (one shared worktree) dispatching canonical `sdd-execute` per task; no own state machine; repeat depends on provable progress, else BLOCKED/PAUSED with evidence. | `90b123e9` | `ai/skills/sdd-execute-batch/SKILL.md:8-15,33-60`; `sdd-execute/SKILL.md:38-67,106-118` | sdd-review-lifecycle-contract.test.ts "keeps one per-task lifecycle and makes batch a serial adaptive scheduler", "resumes a persisted audit FAIL without re-running completed phases blindly"; sdd-adaptive-execution-contract.test.ts (6) | A |

### 3.3 SYNC-OWNERSHIP (`gennady sync` / `sync-skills` / package resolution / deployed surface)

| # | Invariant | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| S1 | `ai/directives/knowledge.xml` is PROJECT-OWNED: `sync` seeds it when absent and never overwrites an existing one (status `preserved`, shown in output and summary). Other directives are still overwritten (`added|updated|unchanged`). | `f74c8c1d` | `cli/cmd/sync/sync-core.ts:23-27,239-254`; `cli/cmd/sync/sync.types.ts:8,64-76`; `ai/directives/knowledge.xml:3` | `cli/cmd/sync/__tests__/sync-core.test.ts` "collectAndCompare" (preserved on diff, seeded when absent) | A |
| S2 | `resolvePackageDir` finds the package root by walking up from the resolved entry to the `package.json` whose `name === 'gennady'` — works from a published install, a clone and `npm link`. | `d6479748` | `shared/common/sync/sync-core.shared.ts:10-46` | `shared/common/sync/__tests__/sync-core.shared.test.ts` "resolvePackageDir"; `cli/__tests__/e2e/sync-skills.e2e.test.ts` "plugin-owned skills" (checkout without node_modules/gennady resolves) | N |
| S3 | `sync` and `sync-skills` merge multiple roots: base `ai/directives` / `ai/skills` plus each plugin's `directives/` / `skills/` (from the resolver); package ships plugin dirs themselves (no staging into `ai/`); an empty directory cannot shadow a root with files. | `d6479748` | `cli/cmd/sync/sync.cmd.ts:91`; `cli/cmd/sync-skills/sync-skills.cmd.ts:101`; `services/plugins/plugin-assets.ts:43-52`; `sync-core.ts:76-88` (`scanSourceRoots`); `sync-skills-core.ts:133-168` | sync-core.test.ts "scanDirectives"; sync-skills-core.test.ts "scanSkillRoots"; sync-skills.e2e "plugin-owned skills" (3); `cli/__tests__/e2e/publish-contents.e2e.test.ts` (manifest-declared assets in `npm pack --dry-run`) | A |
| S4 | In `scanAllSkillRoots` only a MISSING plugin root (ENOENT/ENOTDIR, index>0) is tolerated; the base root and any EACCES/EIO are fatal (a swallowed error once emptied the union and orphan-deleted every synced skill). One throwing `statSync` in `sync` does not disable a whole directive root. | `40d209d8 e2b6087c` | `sync-skills-core.ts:136-168`; `cli/cmd/sync/sync-core.ts` (statSync guard) | sync-skills-core.test.ts "scanSkillRoots" (chmod-000 fixtures) | A |
| S5 | `sync-skills` prunes ONLY skills a previous sync installed, recorded in ownership manifest `.claude/skills/.gennady-synced`; first run adopts only names the package ships now; manifest merged on filtered syncs; failed deletions retried; project-authored skills are never deleted. | `62172906` | `sync-skills-core.ts:25-109` (`MANIFEST_NAME`, `adoptPackageInstalled`) | sync-skills-core.test.ts "collectAndCompareSkills manifest"; sync-skills.cmd.test.ts; `specs/cli/sync-skills/sync-skills.spec.md` | A |
| S6 | `sync-skills` never deploys a skill's tests: `__tests__` dirs and `*.test.*`/`*.spec.*` files are excluded; dotfiles and `.DS_Store` excluded. | `f66a77ee` | `sync-skills-core.ts:25,128,224,272,356` | sync-skills-core.test.ts; `scripts/__tests__/deployed-surface.test.ts` "ships no test file…" | A |
| S7 | The deployed surface (every path `sync` + `sync-skills` would write, plugin roots included) equals the committed golden `scripts/__tests__/deployed-surface.golden.txt` (80 entries at HEAD); any change must be accepted via `UPDATE_SURFACE_GOLDEN=1`; no test artifact and no developer path (`~/Developer/gennady`, `/Users/k.lebedev`) in it. | `7d48149d 5a237cd5` | `scripts/__tests__/deployed-surface.{test.ts,golden.txt}` | deployed-surface.test.ts "matches the committed golden file", "leaks no developer path into a consumer project" | A |
| S8 | Path normalisation on sync: `SYNC_PATH_RULES` (directives) rewrite dev paths to `ai/directives/` and `npx gennady`, and `plugins/<id>/directives/ → ai/directives/`; `SYNC_SKILLS_PATH_RULES` additionally rewrite `~/Developer/gennady/ai/skills/ → .claude/skills/`. Install target for skills is `<cwd>/.claude/skills` (project-local). | `d6479748` (+pre-existing) | `shared/common/sync/path-normalizer.ts:34-96`; `sync-skills.cmd.ts` targetDir | `shared/common/sync/__tests__/*.test.ts`; sync-skills.e2e "install and repeat" | N (npx literal) |
| S9 | Skill scripts' tests live in `scripts/__tests__/` (not under `ai/skills/**`, which is in `files[]`). | `7d48149d` | `scripts/__tests__/sdd-*.test.ts` | deployed-surface.test.ts | A |

### 3.4 RULES (`ai/directives/coding|testing|infra`, `knowledge.xml`, plugin directives)

| # | Invariant | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| R1 | Every rule file in cascade categories carries the four checkable sections; `sdd check` tree mode reports `rule_findings=0` (19 RULES rows OK at #18 merge; +4 files at `5a237cd5`, all complete). | `d86c49dd 5a237cd5` | `ai/directives/testing/common.xml`, `node-test.xml`, `vitest-rules.xml`, `coding/result-conventions.xml`, `coding/uikit-spec-drafting.xml`, `plugins/golang/directives/infra/golang-setup.xml`; `coding/{baseline-rules,python-rules,go-rules}.xml`, `testing/baseline-testing.xml` | `scripts/__tests__/testing-rule-contract.test.ts` "rule checkable surface contract" (3: no empty section markers; common runner-neutral, node rewards runner-specific); sdd-check-rules.test.ts | A |
| R2 | Testing cascade edges are declared, not prose: `vitest-rules.xml` and `node-test.xml` carry `<DependsOn>` → `testing/common.xml`; `python-rules`/`go-rules` `<DependsOn>` → `baseline-rules`. | `ac2e9d73 5a237cd5` | `testing/node-test.xml:8`, `testing/vitest-rules.xml:8`, `coding/go-rules.xml:8`, `coding/python-rules.xml:7` | testing-rule-contract.test.ts; (DependsOn is "optional and unchecked" by audit per `audit.directive.xml:240`) | A |
| R3 | `knowledge.xml` registers language-agnostic parents `baseline-rules`, `baseline-testing` and thin `python-rules`, `go-rules`; `typescript-rules` triggers only on `.ts/.tsx` (SkipWhen non-TypeScript); header declares the registry PROJECT-OWNED. | `5a237cd5 f74c8c1d` | `ai/directives/knowledge.xml:3,67-103,129` | deployed-surface golden (+4 entries); sync-core.test.ts preserved | A (content) |
| R4 | golang-specific directive/skill live in the plugin (`plugins/golang/directives/infra/golang-setup.xml`, `plugins/golang/skills/sdd-infra-golang/SKILL.md`) and are synced to consumers as `ai/directives/infra/golang-setup.xml` / `.claude/skills/sdd-infra-golang/`; node ships no directives/skills (`nodejs-npm-setup.xml` stays in `ai/`). | `a336f17b 5651c05f d6479748` | `plugins/golang/plugin.json`; `path-normalizer.ts:63-65` | publish-contents.e2e.test.ts; sync-skills.e2e "plugin-owned skills"; deployed-surface golden | Go |
| R5 | Scaffold: rule references must resolve to `ai/directives/<category>/<rule>.xml` or abort; a non-Node scope authors its own rule files and lists them in the project-owned registry; an empty rule set is valid, a dangling reference is not. | `f74c8c1d` | `scaffold.directive.xml:74,95,470` | (directive text; no mechanical test) | A |

### 3.5 DIRECTIVES-SDD (`ai/directives/sdd/*.xml` — 12 files + README at HEAD)

| # | Invariant | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| D1 | All SDD directives carry operator-dialogue axioms (AX_OPERATOR_DIALOGUE_STYLE, AX_NO_PROCESS_NARRATION — forbids "DIRECTIVE ACTIVATED" —, AX_PROGRESSIVE_DISCLOSURE, AX_DIVERGE_BEFORE_RECOMMEND…); protocols `critic-protocol.xml`, `interview-protocol.xml`, `visual-vocabulary.xml` exist. | `713fefd4` | `ai/directives/sdd/*.xml` | `scripts/__tests__/directive-markup-contract.test.ts`; sdd-review-lifecycle-contract "applies dispatched directives without exposing activation machinery" | A |
| D2 | Directives are HTML-like prompt markup, NOT strict XML (declared at the top of AGENTS.md); no XML validation is imposed. | `90b123e9` | `AGENTS.md:5` | directive-markup-contract.test.ts "defines directives as HTML-like prompt text at the start of AGENTS.md" | A |
| D3 | Critic: Round 1 = baseline; later rounds = focused verification of accepted fixes; CLEAN is terminal at any round; max 5 rounds emergency cap (AX_CAP_5); blocking finding needs evidence (AX_FINDING_EVIDENCE / AX_DEFAULT_ACCEPT); confusion triaged ARTIFACT_GAP / CONTEXT_MISSING / NON_BLOCKING_QUESTION; Polish off by default; critic receives ONLY artifact + parent spec (AX_ISOLATION_SIGNAL); scratch log `## Critic Rounds` with `### Round N — date` collapsed on CLEAN. | `d6065c36 90b123e9` | `critic.directive.xml:4-27,81-85,169`; `critic-protocol.xml` | `scripts/__tests__/critic-directive-contract.test.ts` "SDD critic convergence contract" (5) | A |
| D4 | Audit verdict is computed by a 4-row table in AX_SEVERITY_TAGGING (PASS / PASS_WITH_ACKNOWLEDGED_RISKS / FAIL); project-scope findings (e.g. `RULE_FILE_INCOMPLETE`) enter capped at MINOR and are routed `rule-file-fix`, never a phase re-run or this task's FAIL. | `ac2e9d73 cd7f3e01 139448e3` | `audit.directive.xml:85-125,137,155,164` | sdd-review-lifecycle-contract.test.ts "requires every blocking remediation to identify its owner", "routes behavior violations to findings and stale text to backflow" | A |
| D5 | Audit reads mechanical truth from `sdd check` (`[RULES]`, `[LOG]`, `[TASKID]`, `[TRACKER_SYNC]`, `[REOPENS]`) via `<sdd-path>`; `EXECUTION_LOG_INCOMPLETE` triggers include post-close writes; audit rounds numbered independently of execution rounds (`### Audit Round N — date, after Execution Round M`). | `139448e3 cf4f0470 90b123e9 4a47b9e8` | `audit.directive.xml:82,240,284,410-416` | sdd-review-lifecycle-contract "keeps audit numbering independent from execution numbering", "keeps standalone audit and check on the loaded installation" | A |
| D6 | SSOT: docs reference a spec fact by anchor and never restate the literal (AX_SSOT_TRACEABILITY generalised); BDD expected outcome references the spec anchor, `Given` inputs stay literal; audit emits advisory INFO `dangling-spec-ref` on unresolved anchors (structural only). | `8bb38477` | `scaffold.directive.xml:136-145,267`; `audit.directive.xml:281` | (no mechanical test) | A |
| D7 | Phase agent: AX_PERMITTED_BASH_COMMANDS forbids EVERY `git` subcommand, `npm run lint/format`, prettier, project-wide scans; ERROR OWNERSHIP bounded by AX_PHASE_SCOPE_LOCK (failure inside another phase's Target Files → Handoff `open:`, not a blocker; outside the ticket → AX_BLOCKER_ESCALATION); typed Handoff per HANDOFF_FORMAT. | `cd7f3e01 90b123e9` | `phase-execution-protocol.xml:31-39,88-97,154,187,336` | sdd-adaptive-execution-contract.test.ts "blocks when no in-scope choice preserves required behavior" | A |
| D8 | Scaffold: Task IDs `TSK-{PREFIX}-{NNN}` from the directory README counter (legacy `TSK-NN` valid for old tickets); `AX_REOPEN_TICKET_FORMAT` — reopens are appended Rounds, old rounds never edited; Round close ≠ DONE (AX_AUDIT_HOOK); model inherited by dispatched agents. | `713fefd4 1e22e8ad 62172906` | `scaffold.directive.xml:65,162,180,223,241,443` | sdd-task-id.test.ts; sdd-review-lifecycle-contract "inherits the configured model for every fresh reviewer and executor" | A |
| D9 | `discovery`/`module-decomposition`: AX_LANG_PASS_ON_WRITE falls back to a built-in language pass when `ai/directives/language/` is absent (no hard stop). | `62172906` | `discovery.directive.xml`, `module-decomposition.directive.xml` (language-pass block) | (directive text; PR #10 describes the fallback) | A |

### 3.6 SKILLS (`ai/skills/**`, `plugins/*/skills/**`; no `.claude/skills` is tracked in main)

| # | Invariant | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| K1 | Skill roster at HEAD: 16 in `ai/skills/` (agent-inbox, alt-opinion, prd-interview, sdd-audit, sdd-check, sdd-continue, sdd-critic, sdd-discover, sdd-execute, sdd-execute-batch, sdd-fix, sdd-infra, sdd-module-decomposition, sdd-scaffold, sdd-setup, workspace-permission-setup) + 1 plugin skill `plugins/golang/skills/sdd-infra-golang`; `sdd-hooks-install` removed. | `db8fa198 a336f17b` | `ai/skills/`, `plugins/golang/skills/` | deployed-surface golden | A |
| K2 | `sdd-execute` owns ONE adaptive lifecycle: resume from ticked phases, audit-only resume when all phases ticked and last audit FAIL, PAUSED on blockers, BLOCKED when findings repeat without new evidence; `<SDD_PATH>` resolved once from the installed skill dir and threaded into every dispatch; phases must run `sdd verify --wip <target-files>`. | `90b123e9 cd7f3e01 2a0282da` | `ai/skills/sdd-execute/SKILL.md:17,38-67,93-124` | sdd-adaptive-execution-contract.test.ts (6); sdd-review-lifecycle-contract.test.ts (24) | A |
| K3 | `sdd-check` skill delegates mechanics to `sdd check` (Check 3 TRACKER_SYNC, Check 5 LOG incl. post-close, Check 5b TASKID, Check 5c RULES as INFO, Check 6 headers via `--files`); never re-greps by hand; does not run `npm test`. | `139448e3 cf4f0470 90b123e9 4a47b9e8 62172906` | `ai/skills/sdd-check/SKILL.md:56-128` | sdd-review-lifecycle-contract "keeps standalone audit and check on the loaded installation and shared mechanics" | A |
| K4 | `sdd-execute/scripts/` = `sdd` (dispatcher: extract, lint, verify, check-blockers, scan, check, help), `_sdd-lib.sh`, `check.sh`, `scan.sh`, `verify.sh`, `lint-artifacts.sh`, `extract-section.sh`, `check-blockers.sh`, `classify-scripts.{js,ts}`, `README.md`; no tests inside. | `52c03db9 40d209d8 cd7f3e01 7d48149d` | `ai/skills/sdd-execute/scripts/` | deployed-surface.test.ts | A / N (classify-scripts) |
| K5 | Skills still open `Announce: 🔒 DIRECTIVE ACTIVATED …` in 7 SKILL.md files while the loaded directives forbid it (issue #16 unaddressed). | — | `grep -l 'DIRECTIVE ACTIVATED' ai/skills/*/SKILL.md` → 7 | none | A |

### 3.7 RELEASE-PACKAGE

| # | Invariant | commit(s) | main file:line | locking test | N/A |
|---|---|---|---|---|---|
| P1 | Published tarball `files[]`: `dist/**`, `README.md`, `docs/**`, `ai/**`, `cli/cmd/orient/README.md`, `services/agent-run/engines/opencode/readonly.config.json`, `plugins/*/plugin.json`, `plugins/*/*.ts`, `plugins/*/directives/**`, `plugins/*/skills/**`; `.npmignore` subtracts tests/fixtures/e2e/coverage/maps. | `d6479748 c92a53bf 487b4b13` | `package.json` `files`; `.npmignore` | publish-contents.e2e.test.ts; bundle-smoke.e2e.test.ts (`test:smoke` in prepublishOnly) | N |
| P2 | `exports`: `.` → `dist/index.js` (+`index.d.ts`), `./stack` → `dist/stack.js` (+`dist/services/stack/plugin-api.d.ts`), each with `types/import/default`; `gennady/stack` aliased to source in vite + tsconfig `paths`; `bin` = `dist/gennady.js` chmod 755 in `closeBundle`; entry names from `entryFileNames`. | `80a81fcd 290b4248 86b47961 5c5a1f6a` | `package.json` exports; `vite.config.ts:45-51,65-91`; `tsconfig.json:30-35` | bundle-smoke.e2e.test.ts (exec bit, data: URL start); manual tarball check recorded in commit | N |
| P3 | `prepublishOnly` = lint → test:smoke → test:cli-e2e → `CONFIG_E2E_STRICT=1 test:config-e2e` → `STACK_E2E_STRICT=1 test:stack-e2e` → build:publish; `postpublish` cleans publish artifacts; unit `npm test` runs with `--test-concurrency=1`. | `34cbfc14 5697f027 8358bf8b` | `package.json` scripts | CI `unit`, `packaging`, `*-e2e` jobs | N |
| P4 | `publish-next` publishes to npm FIRST (gate runs inside `npm publish`) and only then commits/tags/pushes; a failed gate leaves no phantom release. Prerelease line is `0.9.0-next.N` (> latest 0.8.4). | `009ff59a 580eb5d7 b2fbb234` | `scripts/publish-next.ts:258-279` | none (manual) | N |
| P5 | Bundled CLI must start from a `data:`-inlined `readonly.config.json` (materialised to a temp file). | `8dc1d1cd` | `services/agent-run/engines/opencode/opencode-engine.ts` | bundle-smoke.e2e.test.ts | N |
| P6 | `yaml@2.9.0` is an exact-pinned dev dependency bundled into dist (runtime deps stay `ink react tree-sitter tree-sitter-typescript`). | `52c03db9` | `package.json` devDependencies | build | N |

### 3.8 DOCS / TESTS-ONLY / OTHER (behavioural notes)

- `docs/sdd-flow.md` (407→~600 lines) is the single operator guide; shipped in the tarball; README/AGENTS link to it (`3763f3ce db8fa198 c92a53bf`).
- `ai/fw-draft/**`, `ai/fw/v1/**`, `ai/fw/v2/**` (19 files) deleted as dead legacy (`3763f3ce`).
- `specs/README.md` registers scopes `stack`, `config`, `plugins`, `infra-e2e`; `tasks/stack/` (TSK-95, TSK-96 DONE), `tasks/ai-skills/sdd-skills.task-97.md` (PR #14 record).
- CI `.github/workflows/ci.yml`: 7 non-mutating jobs (lint uses `format:check` + `type-check` + contracts lint WITHOUT `--autofix`; Go 1.24 + golangci-lint v2.12.2 pinned; `fetch-depth: 0` for dogfood; `workflow_dispatch`). Issue/PR bodies note Actions were blocked by an account billing lock at #10/#12/#14/#18 merge time.
- `cli/cmd/lint/lint.cmd.ts` is a plain module; `index.ts` owns run/print/exit (`478e7319`). Five sibling commands (inbox, inbox-context, resolve-conflicts, review-verify, vcs-worktree) still self-execute on import (recorded, untouched).

## 4. GitHub issues / PRs ↔ commits

### 4.1 PRs (`gh pr list --state all --limit 50`, read-only)

| PR | state | head → base | merged | merge/squash sha | title | in the 115? |
|---|---|---|---|---|---|---|
| #25 | OPEN | `codex/sdd-v2-rc52-followup` → `sdd-v2-readiness-105d19` | — | — | SDD v2: снятие зажимов флоу + фиксы eval-харнесса + документация | no (RC side) |
| #18 | MERGED | `codex/testing-rule-contracts` → main | 09-02 | `d86c49dd` | fix(rules): complete checkable rule surfaces | yes |
| #14 | MERGED | `codex/sdd-adaptive-execution` → main | 09-02 | `90b123e9` | feat(sdd): make adaptive execution evidence-driven | yes |
| #12 | MERGED | `fix/sdd-check-log-integrity` → main | 09-03 | `4a47b9e8` | `sdd check` catches writes into a closed round | yes |
| #10 | MERGED | `fix/sdd-tooling-portability` → main | 09-02 | `62172906` | strict Task-ID grammar, non-TS orphan scan, non-destructive sync-skills, language-pass fallback | yes |
| #8 | MERGED | `codex/critic-convergence` → main | 08-31 | `d4d2f3a7` (+`d6065c36`) | bound critic convergence loop | yes |
| #7 | CLOSED (unmerged) | `feat/yaml-verify` → main | — | — | Draft: yaml-declared verification gates — plugin-less counter-proposal to #5 | no |
| #6 | OPEN | `sdd-v2-readiness-105d19` → main | — | — | SDD v2 | no (RC side) |
| #5 | MERGED | `feat/sdd-infra-golang` → main | 08-25 | `b4840ca1` (58 commits) | stack plugin system + `gennady verify` | yes |
| #4 | MERGED | `claude/gennady-backend-adoption-cef193` → main | 08-12 | `c5fa924f` (6 commits) | fix: make CLI work when built from a source clone | yes |
| #3, #2, #1 | MERGED | — | ≤06-28 | `33eb65e9`, `b90c7f13`, `11bc43de` | vcs / agent-run / agents | no (before merge-base) |

### 4.2 Issues (`gh issue list --state all --limit 100`; all by akkrat, all filed against `0.8.4-next.10`)

| Issue | title (short) | state | addressed by (commit / PR) | coverage | what remains unaddressed in main |
|---|---|---|---|---|---|
| #9 | SDD tooling: 5 issues from a Swift project | OPEN | (1) path-based Task-IDs: `90b123e9` #14 + `62172906` #10 (C1, C2); (2) orphan `@tasks` scan non-TS: `62172906` (C3); (3) `ai/directives/language/` not shipped: `62172906` built-in fallback (D9); (4) sync-skills deletes local skills: `62172906` manifest (S5); (5) hardcoded model pins: `90b123e9` "inherit the caller's model" (0 `model: "sonnet|haiku"` pins left) | **fully** for the 5 numbered items | `ai/directives/language/` still not shipped (fallback only); `extraGates[].when` / per-gate `paths` (mentioned in #9/#20) not implemented — `stack-config.ts` has no `when`/`paths` key |
| #11 | Directives invoke `~/.claude/skills/…` but sync-skills installs `<cwd>/.claude/skills` | OPEN | `90b123e9` moved audit/phase-execution to `<sdd-path>` (C14); `bbee8efc` asserts it | **partially** | 1 literal `~/.claude/skills` each in `discovery.directive.xml` and `module-decomposition.directive.xml`; `SYNC_PATH_RULES` still lacks a tilde-skills rule |
| #13 | Reopens defined two ways (`Round headers − 1` vs audit-caused) | CLOSED 09-03 | `90b123e9` #14 `[REOPENS]` causation (C8); #12 dropped its own producer | **fully** (closed by RubaXa) | audit does not validate the `(<date> — <reason>)` parenthetical (secondary point) |
| #15 | critic writes `### Round N` into ticket, colliding with Execution Log heading | OPEN | `4a47b9e8` #12: log region ends at any `## `, critic section excluded (C7) | **partially** (counter fixed) | heading namespace collision intact: `critic.directive.xml:169` still prescribes `### Round N — YYYY-MM-DD` under `## Critic Rounds` |
| #16 | Nine skills announce `DIRECTIVE ACTIVATED` which AX_NO_PROCESS_NARRATION forbids | OPEN | none (only `90b123e9` "applies dispatched directives without exposing activation machinery" test for dispatch prompts) | **not** | 7 `ai/skills/*/SKILL.md` still contain `DIRECTIVE ACTIVATED` (K5) |
| #17 | Passing gate output discarded (`output: ''` on pass) | OPEN | none | **not** | `gate-runner.ts:331,335` still `output: ''` on pass; no `showOutputOnPass`, no marked-line pass-through |
| #19 | phase-execution forbids every git command; gate/script phases need throwaway git fixtures | OPEN | none | **not** | `phase-execution-protocol.xml:97` still "**Forbidden:** `git` ANY subcommand" with no fixture exception |
| #20 | `sdd verify --wip <target-files>` does not narrow gates; `--only` cannot name a new gate; bare `sdd` in template | OPEN | none (`2a0282da` introduced the `--wip` line itself) | **not** | `sdd-execute/SKILL.md:98` still `sdd verify --wip <target-files>` (bare `sdd`, positionals are targets not filters); `verify.sh` execs `gennady verify "$@"`; `--only` whole-id only; no `paths:`/`when:` in config |
| #21 | Isolated critic cannot see scope conventions (`tasks/README.md`) | OPEN | none | **not** | `critic.directive.xml:10` AX_ISOLATION_SIGNAL still "ONLY artifact + parent spec"; no `Conventions:` in dispatch template |
| #22 | Handoff/Inputs carry no provenance (`measured/reported/assumed`) | OPEN | none | **not** | `HANDOFF_FORMAT` unchanged; no provenance tag grammar |
| #23 | No Execution Log token for correcting an earlier line (`correction` → unknown-token) | OPEN | none | **not** | scaffold token table (`scaffold.directive.xml:711-721`) has no `correction`/`amend`; `check.sh` [LOG] rejects it |
| #24 | `gennady sync` overwrites locally modified directives incl. knowledge.xml | OPEN | `f74c8c1d` — knowledge.xml project-owned (S1) = proposal (2) | **partially** | proposals (1) hash manifest for `sync` and (3) `ai/directives.local/` overlay not implemented; every other directive is still overwritten (`updated`) |

Issues referencing code that changed underneath them: #9/#11/#13/#15/#16 quote `0.8.4-next.10` line numbers; #19–#24 quote `main@62172906`.

## 5. Main-only additions vs RC, and conflict zones

Method: `git diff --name-only 46c6d616 origin/main` (521 paths) intersected with `git ls-tree -r --name-only` of `origin/main` (1309 files) and `codex/sdd-v2-rc52-followup` (2804 files). Result: **425 paths main-only** (touched by the 115 commits, present in main, absent in RC), **77 paths in the conflict zone** (touched by the 115 commits AND present in RC), **19 paths deleted by main** (present at merge-base, absent in main).

RC layout facts relevant to the comparison (RC HEAD `11291af5`): RC has NO `ai/directives/sdd/` (it has `ai/directives/sdd-v2/**`, ~106 files under `ai/directives`), NO `ai/skills/sdd-execute/scripts/**` (RC ships `ai/skills/{sdd,sdd-audit,sdd-check,sdd-code-review,sdd-critic,sdd-execute,sdd-reconcile,sdd-scaffold}/SKILL.md` only — 14 files), NO `services/stack`, `services/plugins`, `services/config`, `plugins/`, `cli/cmd/verify`, `cli/cmd/fix` (0 matches); RC adds `ai/kit/**` (979 files), `ai/flow-eval`, `ai/flow-sim`, `ai/inspector`, `cli/cmd/sdd-check/**`, `e2e/`, `test/`, `utils/`. Therefore the entire SDD v1 directive/script surface changed by main is "main-only" by path even where RC has a functional counterpart under another path — the audit must map by behaviour, not by filename.

### 5.1 Main-only additions (425 paths, grouped)

| Group | Paths | Files | Origin commits |
|---|---|---|---|
| CI / packaging | `.github/workflows/ci.yml`, `.npmignore` | 2 | `da3a53e9 185bea20 487b4b13` |
| Rules (new in main / absent in RC) | `ai/directives/coding/{baseline-rules,go-rules,python-rules}.xml`, `ai/directives/testing/baseline-testing.xml` (NEW at `5a237cd5`); `ai/directives/coding/result-conventions.xml` (existed at merge-base, extended by `d86c49dd`; RC deleted it) | 5 | `5a237cd5 d86c49dd` |
| SDD v1 directives (whole dir absent in RC) | `ai/directives/sdd/{README.md, audit, critic-protocol, critic, discovery, fix, interview-protocol, module-decomposition, phase-execution-protocol, scaffold, setup, svelte-ui-discovery, visual-vocabulary}` | 13 | `713fefd4 cd7f3e01 1e22e8ad 139448e3 cf4f0470 2a0282da ac2e9d73 d6065c36 90b123e9 62172906 4a47b9e8 f74c8c1d 8bb38477 3763f3ce db8fa198 599cdb25` |
| SDD skill scripts | `ai/skills/sdd-execute/scripts/{README.md,_sdd-lib.sh,check.sh,classify-scripts.js,classify-scripts.ts,extract-section.sh,lint-artifacts.sh,scan.sh,sdd,verify.sh}`, `ai/skills/sdd-execute-batch/SKILL.md`, `ai/skills/sdd-infra/SKILL.md` | 12 | `52c03db9 40d209d8 cd7f3e01 139448e3 cf4f0470 f8d42a33 2a0282da 90b123e9 62172906 4a47b9e8 e2b6087c` |
| `gennady verify` / `fix` CLI | `cli/cmd/verify/{index,help,verify.cmd}.ts` + test, `cli/cmd/fix/{index,help,fix.cmd}.ts` + test, `cli/cmd/_shared/prompt/logic/verify-commands/__tests__/resolve-verify-commands.test.ts` | 9 | PR #5, `2a0282da` |
| Stack runtime | `services/stack/{env-fail,gate-runner,plugin-api,stack-config,stack-registry,stack.types,tree-guard}.ts` + 6 unit tests; `services/stack/__tests__/e2e/{config.e2e.test,fixture-integrity.test,fixture,plugin-suite.e2e.test,setup,suite}.ts` + 55 config fixture files | 74 | PR #5, `2a0282da` |
| Config + plugin services | `services/config/{config-loader.ts,__tests__/config-loader.test.ts}`, `services/plugins/{resolve-plugins,plugin-assets}.ts`, `__tests__/{plugin-locality,resolve-plugins}.test.ts` | 6 | PR #5 |
| Plugins | `plugins/index.ts`; `plugins/anystack/{anystack-plugin.ts,plugin.json,specs/anystack.spec.md}` + 20 e2e files; `plugins/golang/{golang-detect,golang-plan,golang-plugin,golang-scope}.ts`, `plugin.json`, 3 tests, `directives/infra/golang-setup.xml`, `skills/sdd-infra-golang/SKILL.md`, `specs/golang.spec.md` + 210 e2e files; `plugins/node/{node-plugin,classify-npm-scripts}.ts`, `plugin.json`, test, `specs/node.spec.md` + 27 e2e files | 279 | PR #5 |
| Shared | `shared/common/damerau-levenshtein.ts` (moved from `cli/cmd/orient/core/`) | 1 | `fb312581` |
| Scripts / tests | `scripts/stack-e2e.ts`; `scripts/__tests__/{critic-directive-contract,deployed-surface,directive-markup-contract,sdd-adaptive-execution-contract,sdd-check-log,sdd-check-rules,sdd-review-lifecycle-contract,sdd-task-id,sdd-verify-delegation,testing-rule-contract}.test.ts`, `deployed-surface.golden.txt`; `cli/__tests__/e2e/{bundle-smoke,publish-contents}.e2e.test.ts` | 14 | `27cb0a50 7d48149d 90b123e9 d6065c36 62172906 d86c49dd 5697f027 a336f17b 40d209d8` |
| Specs / tasks / docs | `specs/{config/config.spec.md, infra-e2e/infra-e2e.spec.md, plugins/plugins.spec.md, stack/stack.spec.md, stack/e2e/e2e.spec.md}`; `tasks/stack/{README.md,stack-library.task-95.md,verify-command.task-96.md}`, `tasks/ai-skills/{README.md,sdd-skills/sdd-skills.task-97.md}`; `docs/sdd-flow.md`; `gennady.yaml` | 12 | PR #5, `90b123e9`, `3763f3ce` |

### 5.2 Deleted by main (present at merge-base; RC status per its tree)

`ai/fw-draft/**` (12 files), `ai/fw/v1/**` (5), `ai/fw/v2/arch-universal.xml`, `ai/skills/sdd-hooks-install/SKILL.md` — removed by `3763f3ce` / `db8fa198`. (Also moved, not deleted: `services/stack/plugins/** → plugins/**`, `ai/directives/infra/golang-setup.xml → plugins/golang/directives/infra/`, `ai/skills/sdd-infra-golang → plugins/golang/skills/`, `specs/stack/config → specs/config`, `specs/stack/plugins/* → plugins/*/specs/`, `cli/cmd/orient/core/damerau-levenshtein.ts → shared/common/`, `ai/skills/sdd-execute/scripts/__tests__/* → scripts/__tests__/`.)

### 5.3 Conflict zone — 77 paths touched by main AND present in RC (`git diff --numstat 46c6d616..origin/main -- <path>`)

| Path | +/− | main commits touching it | risk note |
|---|---|---|---|
| `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts` | +341/−14 | `40d209d8 62172906 f66a77ee d6479748` | manifest + roots tests |
| `cli/cmd/sync-skills/sync-skills-core.ts` | +220/−8 | `d6479748 40d209d8 9ea29083 f66a77ee 62172906` | ownership manifest, multi-root, test exclusion |
| `ai/skills/sdd-execute/SKILL.md` | +138/−52 | `52c03db9 cd7f3e01 1e22e8ad 2a0282da 90b123e9 62172906 4a47b9e8 3b286bda` | lifecycle rewrite — RC has its own `sdd-execute/SKILL.md` |
| `cli/__tests__/e2e/sync-skills.e2e.test.ts` | +96/−3 | `d6479748` | plugin-owned skills e2e |
| `specs/ai-skills/sdd-skills/sdd-skills.spec.md` | +88/−9 | `3763f3ce db8fa198 90b123e9` | |
| `cli/cmd/sync/sync-core.ts` | +83/−7 | `d6479748 e2b6087c f74c8c1d` | multi-root + `PROJECT_OWNED_ENTRIES` |
| `specs/cli/sync-skills/sync-skills.spec.md` | +81/−41 | `d6479748 3b286bda db8fa198 62172906` | |
| `README.md` | +75/−0 | `3461d2fd 52c03db9 fb312581 f5936947 3c28f776 34cbfc14 3b286bda ff943594 3763f3ce` | verify section, install-from-source |
| `cli/cmd/README.md` | +53/−29 | PR #5 | verify/fix docs |
| `ai/directives/knowledge.xml` | +49/−5 | `3763f3ce f74c8c1d 5a237cd5` | rule registry; RC likely rewrote it |
| `tasks/README.md` | +48/−15 | `d359a098 52c03db9 cd7f3e01 1e22e8ad 90b123e9` | log template mirror |
| `ai/skills/sdd-check/SKILL.md` | +42/−7 | `139448e3 cf4f0470 90b123e9 62172906 4a47b9e8` | RC has own version |
| `cli/cmd/sync/__tests__/sync-core.test.ts` | +38/−3 | `d6479748 f74c8c1d` | |
| `shared/common/sync/sync-core.shared.ts` | +38/−7 | `d6479748 e2b6087c` | `resolvePackageDir` walk-up |
| `services/agent-run/engines/opencode/opencode-engine.ts` | +38/−4 | `8dc1d1cd 5697f027` | data: URL fix |
| `AGENTS.md` | +37/−24 | `ff943594 3763f3ce 599cdb25 90b123e9` | HTML-like markup declaration |
| `ai/directives/testing/common.xml` | +35/−0 | `d86c49dd` | |
| `package-lock.json` | +35/−18 | deps + version bumps | |
| `ai/skills/README.md` | +33/−11 | `3b286bda 3763f3ce db8fa198 d6065c36 90b123e9` | |
| `vite.config.ts` | +30/−3 | `5c5a1f6a 80a81fcd 290b4248` | chmod, `gennady/stack` alias, entries |
| `package.json` | +25/−9 | see §3.7 | version 0.9.0-next.3 vs RC 0.8.4; scripts, files, exports |
| `cli/__tests__/e2e/setup.ts` | +25/−8 | `1060129d d6479748` | `build:publish`, registry, offline |
| `specs/agent-inbox/agent-inbox.spec.md` | +20/−20 | `320c7e27` | format only |
| `shared/backend/rc/rc-config.ts` | +19/−10 | `52c03db9 e2b6087c` | stack section read; `getStack()` dropped |
| `ai/skills/sdd-audit/SKILL.md` | +19/−5 | `90b123e9` | |
| `shared/common/exec.ts` | +19/−2 | `fb312581` | `execFileTrimSafe` |
| `cli/gennady.ts` | +16/−0 | `52c03db9 f5936947` | verify/fix dispatch |
| `ai/directives/coding/uikit-spec-drafting.xml` | +15/−0 | `d86c49dd` | |
| `scripts/publish-next.ts` | +15/−10 | `009ff59a` | publish-before-git |
| `cli/cmd/sync/sync.types.ts` | +15/−4 | `f74c8c1d` | `preserved` status |
| `specs/README.md` | +15/−0 | PR #5 | new scopes |
| `cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts` | +14/−14 | `faf3b72f` | |
| `ai/directives/testing/vitest-rules.xml` | +14/−0 | `ac2e9d73 d86c49dd` | |
| `ai/directives/testing/node-test.xml` | +13/−0 | `ac2e9d73 d86c49dd` | |
| `specs/vcs/vcs-cli/vcs-cli.spec.md` | +11/−11 | `320c7e27` | format only |
| `shared/common/sync/path-normalizer.ts` | +11/−0 | `d6479748` | `RULE_PLUGIN_DIRECTIVES` |
| `shared/common/sync/sync-formatter.shared.ts` | +11/−1 | `f74c8c1d` | preserved in summary |
| `cli/cmd/sync-skills/__tests__/sync-skills.cmd.test.ts` | +9/−7 | `62172906` | |
| `cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts` | +9/−1 | `52c03db9 fb312581` | |
| `cli/cmd/lint/index.ts` | +8/−2 | `478e7319` | run moved here |
| `cli/__tests__/e2e/sync.e2e.test.ts` | +8/−1 | `bbee8efc` | `<sdd-path>` assertion |
| `specs/cli/e2e/e2e.spec.md` | +7/−7 | `34cbfc14 1060129d` | |
| `tsconfig.json` | +6/−2 | `f65e2977 13df864a 80a81fcd` | paths + fixture excludes |
| `cli/__tests__/e2e/e2e.test.ts` | +5/−1 | `1060129d` | |
| `cli/cmd/sync-skills/sync-skills.cmd.ts` | +5/−3 | `d6479748 9ea29083 62172906` | |
| `cli/cmd/orient/__tests__/damerau-levenshtein.test.ts` | +5/−1 | `fb312581` | import path |
| `ai/directives/coding/README.md` | +4/−0 | `3763f3ce` | |
| `cli/cmd/help/help.cmd.ts` | +4/−0 | `52c03db9 f5936947 e2b6087c` | |
| `cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` | +4/−1 | `faf3b72f` | |
| `shared/common/sync/__tests__/sync-core.shared.test.ts` | +4/−4 | `d6479748 62172906` | |
| `.gitignore` / `.prettierignore` | +3/−0 each | `9af4db93 34cbfc14 13df864a a336f17b` | fixture negation; plugin skills ignore |
| `cli/AGENTS.md` | +3/−0 | `3b286bda` | |
| `cli/cmd/lint/lint.cmd.ts` | +3/−4 | `478e7319` | |
| `cli/cmd/vcs-reply/vcs-reply.cmd.ts` | +3/−3 | `320c7e27` | format |
| `specs/cli/cli.spec.md` | +3/−3 | `320c7e27 db8fa198` | |
| `specs/vcs/vcs-mr-management/vcs-mr-management.spec.md`, `tasks/cli/vcs-discussions/*.md` (2) | +3/−3 each | `320c7e27` | format |
| `shared/common/sync/sync-deps.type.ts` | +3/−3 | `62172906` | `rm` recursive |
| `ai/directives/infra/README.md` | +2/−0 | `52c03db9 3763f3ce` | |
| `cli/cmd/sync-skills/sync-skills.types.ts` | +2/−0 | `d6479748` | |
| `cli/cmd/sync/sync.cmd.ts` | +2/−0 | `d6479748` | plugin roots |
| `services/vcs-client/github/vcs-github-client.ts` + test | +2/−2 each | `faf3b72f` | |
| `ai/directives/infra/eslint-setup.xml` | +1/−1 | `3b286bda` | check-only verify step |
| `specs/ai-skills/ai-skills.spec.md`, `specs/ai-skills/skill-contract/skill-contract.spec.md`, `specs/infra-base/infra-base.spec.md` | +1/−1 each | `3b286bda 3763f3ce db8fa198 2acb19c6` | counts / fixture exclusion |
| `cli/cmd/orient/core/{query-consumer,query-entity,query-keyword}.ts` | +1/−1 each | `fb312581` | import path |
| `cli/cmd/review/__tests__/review-issues.cmd.test.ts` | +1/−0 | `faf3b72f` | |
| `cli/cmd/sync/__tests__/sync.cmd.test.ts` | +1/−1 | `62172906` | |
| `cli/cmd/vcs-worktree/help.ts` | +1/−3 | `320c7e27` | format |
| `cli/cmd/lint/__tests__/{lint.cmd,resolve-targets}.test.ts` | +0/−8 each | `478e7319` | stubs removed |

## 6. Facts (repeat + extras)

- main HEAD `8bb38477` = `package.json` **0.9.0-next.3** (HEAD is one unreleased commit past the `c7051379` release).
- RC HEAD `11291af5` = `package.json` **0.8.4** (`git show codex/sdd-v2-rc52-followup:package.json`).
- Merge-base `46c6d616` (2026-06-29). `git rev-list --left-right --count codex/sdd-v2-rc52-followup...origin/main` → **535 RC-only / 115 main-only**.
- Main delta touches 521 paths; main tree 1309 files, RC tree 2804 files.
- Test counts reported along the way (from commit messages): 1248 (at `52c03db9`) → 1400 (PR #5 pre-merge) → 1416 (`478e7319`) → 1464 (#14) → 1507 (#12) → 1509 (`f74c8c1d`, `5a237cd5`, `8bb38477`).
- Skill scripts' own tests live in `scripts/__tests__/` (10 files); stack/plugin tests under `services/**/__tests__` and `plugins/*/__tests__`; e2e fixtures: anystack 7, golang 49, node 11, config 17.
- Open PRs on the RC side: #6 (`sdd-v2-readiness-105d19` → main) and #25 (`codex/sdd-v2-rc52-followup` → `sdd-v2-readiness-105d19`). PR #7 (yaml-verify counter-proposal to #5) closed unmerged.

---

# Часть II — Независимая верификация (V-A1)

# V-A1 — независимая верификация `A1-main-delta.md`

Проверяющий: свежий взгляд, read-only. Репозиторий: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`, `origin/main` = `8bb38477`. RC для сравнения: `codex/sdd-v2-rc52-followup`.

## § Итог

| Метрика | Значение |
|---|---|
| Полнота § 1 | **PASS** — 115/115 sha, порядок идентичен `git log --reverse`, лишних нет |
| Строк описаний проверено | 115 из 115 (`--stat` + полный текст сообщения); полный diff / состояние кода — для всех 74 нерелизных и недокументационных |
| OK | **108** |
| INACCURATE | **7** (все — фактические мелочи: один ложный «NEW», два числа файлов, два имени идентификаторов, один путь, смешение «+N» = insertions vs `--stat` total) |
| UNCHECKED | **0** |
| Инвариантов в § 3 | 77 (V1–V28, C1–C15, S1–S9, R1–R5, D1–D9, K1–K5, P1–P6) |
| CONFIRMED | **74** |
| CONFIRMED с поправкой | **2** (C4 — формулировка про 🛑/✅; V22 — неверные id фикстур) |
| REFUTED | **1** (C9 — перечень cascade-категорий) |
| UNVERIFIED | **0** (все процитированные файлы существуют; 33/33 процитированных тест-файла на месте, все заявленные счётчики тестов сошлись точно) |
| MISSED INVARIANTS | **7** (+1 отдельная внутренняя противоречивость main) |
| § 4 PR-мэппинг | **CONFIRMED** полностью (11 строк) |
| § 4 Issues | 12/12 заголовков и статусов CONFIRMED; шапка «all filed against `0.8.4-next.10`» **REFUTED** |
| § 5 счётчики | **CONFIRMED точно**: 521 / 425 / 77 / 19 / main-tree 1309 |
| § 0/§ 6 RC-факты | верны на заявленной базе `11291af5`, но **устарели** (RC ушёл на 2 коммита) |
| Ошибки арифметики | 3 (§ 2 SKILLS 13 vs 14; § 2 «17 version bumps» vs 16 перечисленных / 18 фактических; § 3.8 «19 files» vs 18) |
| Прочие числовые ошибки | 1 (§ 3.8 `docs/sdd-flow.md` «~600 lines» — фактически 487) |

Общая оценка: документ **очень точен**. Точность привязок `file:line` исключительная — из ~150 процитированных позиций подавляющее большинство совпадает символ-в-символ; отклонения не превышают 1–3 строк и всегда попадают в нужный блок. Найденные дефекты — почти все косметические/арифметические; содержательно значимы только C9 (перечень категорий), 7 пропущенных поведений и устаревшая RC-база.

## § Полнота

```
git rev-list --count 46c6d616..origin/main → 115
```

Механическое сличение: извлёк все 115 sha из таблиц § 1.1–§ 1.3 (`| N | \`sha\` |`) и сравнил с `git log --format='%h' --reverse 46c6d616..origin/main`:

- `comm -23` (в git, нет в документе) → **пусто**
- `comm -13` (в документе, нет в git) → **пусто**
- `diff` построчно → **ORDER IDENTICAL**

Вердикт: **PASS**. Нумерация 1…115 соответствует хронологическому (topo) порядку `git log --reverse`.

Структура merge-ов подтверждена независимо:

| Факт из § 1.1 | Проверка | Вердикт |
|---|---|---|
| 50 коммитов first-parent | `rev-list --count --first-parent` → **50** | OK |
| PR #4 — 6 коммитов | `rev-list --count c5fa924f^1..c5fa924f^2` → **6** | OK |
| PR #5 — 58 коммитов | `rev-list --count b4840ca1^1..b4840ca1^2` → **58** | OK |
| PR #8 — 1 коммит | `rev-list --count d4d2f3a7^1..d4d2f3a7^2` → **1** | OK |
| `cbc292a0` = merge of 64–65 | parents `9ea29083` + `1d48432e`, `rev-list --count` → **2** (= `ecf0362d`, `1d48432e`) | OK |
| PR #10/#12/#14/#18 — squash | `62172906`, `4a47b9e8`, `90b123e9`, `d86c49dd` — все single-parent (в делте ровно 4 merge-коммита: `c5fa924f`, `cbc292a0`, `d4d2f3a7`, `b4840ca1`) | OK |
| Сумма | 50 + 58 + 6 + 1 = **115** | OK |
| `713fefd4` = direct (до merge PR #4) | `c5fa924f^1 = 713fefd4` | OK |

§ 1.4 (таблица релизов) сверена с `package.json` на каждом из 18 `chore(release)`-коммитов делты — **все 18 версий совпали посимвольно**, включая фантомную тройку `b90a802f`/`6256ee28`/`b5dd081f` (0.9.0-next.1/.2/.3), сброс `b2fbb234` → 0.9.0-next.0 и `580eb5d7` → 0.9.0-next.0.

## § Точность описаний

Ниже — только отклонения. Остальные 108 строк — **OK**: `--stat`, набор файлов, состав изменений и заявленные поведенческие эффекты сверены с diff-ом и/или с состоянием кода на HEAD.

| # | sha | Вердикт | Что не так |
|---|---|---|---|
| 1 | `713fefd4` | **INACCURATE** | «NEW `critic-protocol.xml`, `interview-protocol.xml`, `visual-vocabulary.xml`». `critic-protocol.xml` **уже существовал** на `46c6d616` (`git ls-tree 46c6d616 ai/directives/sdd/`) и в этом коммите изменён `+120/−30`. `--diff-filter=A` даёт ровно два новых файла: `interview-protocol.xml` (+243), `visual-vocabulary.xml` (+206). Сообщение самого коммита утверждает «critic-protocol.xml: new file» — документ воспроизвёл ошибку коммита, не проверив дерево. Всё остальное в строке (12 файлов, +1701/−316, перечень аксиом, `TSK-{PREFIX}-{NNN}`, снятие Status из Decision Log, AX_REUSE_FIRST_ACROSS_MODULES, AX_VERIFY_CLAIM_AGAINST_CODE) — OK. |
| 20 | `3c28f776` | **INACCURATE (мелочь)** | «gate-runner (+270)» — это `--stat`-итог; `--numstat` даёт **+207/−63**. Ср. строку 27 (`c008ae77`, «stack-config (+106)» = ровно +106 insertions) и строку 36 (`bc7a4638`, «stack-config (−262)» = ровно 262 deletions) — документ непоследовательно смешивает «insertions» и «total changed». То же в строке 98 (`4a47b9e8`: «check.sh (+67)» = total; фактически +62/−5) и строке 97 (`62172906`: `_sdd-lib.sh (+60)` и `check.sh (+106)` — totals, а `cli/cmd/sync-skills/** (+415)` — сумма insertions). Числа проверяемы, но метрика не объявлена. |
| 54 / V22 | `2e304b0f` | **INACCURATE** | Идентификаторы фикстур приведены не дословно. Фактические имена на HEAD: `any-extra-gates-**only**`, `any-**env-fail**-rule` (документ пишет `any-extra-gates`, `any-envfail-rule`). Остальное (11 файлов фикстур, `optIn` удалён следующим коммитом — подтверждено `35318b6b`, `noGatesRan`) — OK. |
| 60 | `40d209d8` | **INACCURATE (мелочь)** | «NEW `sdd-verify-delegation.test.ts`». Файл создан как `ai/skills/sdd-execute/scripts/__tests__/**verify-delegation**.test.ts`; переименован в `sdd-verify-delegation.test.ts` только в `7d48149d` (`R091`). Преамбула § 1.2 упоминает старый *путь*, но не старое *имя*. Содержание строки (scanSkillRoots только ENOENT/ENOTDIR, probe через `--plan --json`, оба classify-твина, fixer наследует таймаут гейта) — OK. |
| 70 | `3763f3ce` | **INACCURATE** | «DEL `ai/fw-draft/**` (13 files)» — фактически **12**. `git show --name-status | grep '^D'` даёт **18** удалений: fw-draft 12 + fw/v1 5 + fw/v2 1. § 5.2 приводит правильные 12/5/1; § 3.8 повторяет ошибочные «19 files». |
| 95 | `90b123e9` | **INACCURATE (путь)** | «NEW `tasks/ai-skills/{README,sdd-skills.task-97}.md`» — фактический путь `tasks/ai-skills/**sdd-skills/**sdd-skills.task-97.md` (вложен в подкаталог). § 5.1 указывает верно. Остальное — 28 файлов, +2389/−498, `audit.directive (+293)`, `sdd-execute/SKILL.md (+176)`, переписанный batch, три новых контракт-теста, `<sdd-path>`, `fabricated-placeholder`, `[REOPENS]` — OK. |
| 98 | `4a47b9e8` | **INACCURATE (мелочь)** | см. строку 20: «check.sh (+67)» = `--stat` total, фактически +62/−5. `sdd-check-log.test.ts (+200)` — ровно +200, OK. |

Отдельно подтверждено точным пересчётом (примеры): `13df864a` — **190** перемещённых файлов фикстур (из 217 всего); `ea3f001e` — golang-scope **+120**, 12 файлов фикстур; `1d48432e` — gate-runner **−170**, 27 файлов фикстур; `2a0282da` — tree-guard **+71**; `f65e2977` — **30** node + **44** config файлов фикстур, новый `suite.ts`; `139448e3` — check.sh 71 + тест 149 = **220**; `cf4f0470` — 95 + 155 + 6 = **256**; `9af4db93` — 4 файла `.gennadyrc`; `7d48149d` — golden ровно **76** строк на момент коммита; `5a237cd5` — knowledge.xml **+42**, golden **+4**.

## § Инварианты

Легенда: **C** = CONFIRMED, **C\*** = CONFIRMED с поправкой, **R** = REFUTED. Колонка «строки» — фактическая позиция, если отличается от процитированной.

### 3.1 VERIFY (V1–V28)

| # | Вердикт | Проверка |
|---|---|---|
| V1 | **C** | `verify.cmd.ts:42,44,46` — ровно `EXIT_GATES_FAILED = 1`, `EXIT_BAD_INVOCATION = 4`, `EXIT_NO_STACK = 5`; `:371` и `:376` — ровно `return report.ok && report.total > 0 ? 0 : EXIT_GATES_FAILED;`; `gate-runner.ts:376-381` — ровно блок `ok: executed.every(...) && !diagnostics.some(d => d.blocking === true)`. Тест `verify.cmd.test.ts` describe `verify command` — **ровно 16 `it`** |
| V2 | **C** | `verify.cmd.ts:341` — `ok: report.ok && report.total > 0` (блок 339–362 ✓); `gate-runner.ts:371` — ровно `...(executed.length === 0 ? [ZERO_GATES_DIAGNOSTIC] : [])`; ZERO_GATES_DIAGNOSTIC объявлен на 119–123 (цит. 116–121 — смещение на комментарий); человеческий отчёт с `fix:` — 483–494 |
| V3 | **C** | Лестница вердиктов в `runGate` — 132…340; цитата `134-338` покрывает регион (начало `if (gate.skipped !== null)` — строка **133**) |
| V4 | **C** | `stack.types.ts:181` — ровно `readonly status: 'pass' \| 'fail' \| 'env-fail' \| 'skipped' \| 'timeout' \| 'violation';`; `gate-runner.ts:331` и `:335` — ровно `output: ''` на pass |
| V5 | **C** | `verify.cmd.ts` — блок DIRTY_TREE **307–331** (цит. 307–329; `return EXIT_BAD_INVOCATION` на 330); `tree-guard.ts:81-82` — `treeStatus` = `git status --porcelain` |
| V6 | **C** | `tree-guard.ts:54-58` — ровно `LockPayload {pid, startedAt, cleanAtStart}`; `:126-128` — ровно `lockPath` → `.git/gennady-verify.lock` через `rev-parse --absolute-git-dir` |
| V7 | **C** | `verify.cmd.ts:89` — ровно `wip: ['wip'],`; `gate-runner.ts:28` — ровно `const LOCK_WAIT_MS = 15 * 60 * 1000;`; `:83` — ровно `lockWaitMs: wip ? LOCK_WAIT_MS : 0,`; `tree-guard.ts:41-43` (`wip?`, `lockWaitMs?`), `:145` — ровно `const wip = options.wip === true;`; `:39` — инвариант «No `reset` under any exit path» |
| V8 | **C** | `config-loader.ts:11,14` (имена файлов), `:21` — ровно `FORBIDDEN_KEYS = ['__proto__','constructor','prototype']`, `mergeInto` 198–235 ✓. Приоритет проверен по `sources` (283–289): HOME rc → gennady.yaml → repo rc, merge «позже побеждает» ⇒ заявленный порядок `.gennadyrc > gennady.yaml > $HOME/.gennadyrc` **верен** |
| V9 | **C** | `stack-config.ts:34` (`GATE_SPEC_KEYS`), `:68` (`CMD_SPEC_KEYS = ['argv','cwd','env','timeout','hint']`), `:113-114`, `:174-175` — все четыре позиции символ-в-символ |
| V10 | **C** | `config-loader.ts:25` — ровно `const DURATION_RE = /^([1-9]\d*)(s\|m\|h)$/;`; `:72` — `DURATION_RE.exec(value)` |
| V11 | **C** | `stack-config.ts:398` — ровно `export function unmatchedGateOverrides(`; `fix.cmd.ts:111` — ровно `overrideErrors.push(...unmatchedGateOverrides(configured, pluginConfig, plugin.id));` |
| V12 | **C** | `gate-spec-parity.test.ts` describe `GateSpec parity with built-in gates (FR-STACK-15)` — **ровно 2 `it`**, второй «keeps the derived list honest: no derived field is authorable» = обратная проверка, как описано |
| V13 | **C** | `stack.types.ts:113-167` — от `Cmd` до `readonly fixer?: Cmd;` (167) ✓; `gate-runner.ts:152` — ровно `const failedPrecondition = firstFailingPrecondition(gate);`, 185–192 — env-fail с hint при отсутствующем cwd |
| V14 | **C** | `env-fail.ts:43` — ровно `export function exitCodeMatches(`, файл 255 строк (цит. 43–250 ✓); `gate-runner.ts:19,21` — ровно `TRUNCATE_HEAD_LINES = 20` / `TRUNCATE_TAIL_LINES = 40`; окно усечения 395–407. `env-fail.test.ts` — **ровно 14 тестов**, есть describe **`catch-all guard is whitespace-insensitive`** |
| V15 | **C** | `gate-runner.ts:198` и `:240` — ровно `killSignal: 'SIGKILL',` (precondition и gate); `:256` — ровно ENOBUFS-детект |
| V16 | **C** | `gate-runner.ts:326-331` — ровно output-driven ветка `outputMeansFailure` с комментарием про grep exit 1 |
| V17 | **C** | `verify.cmd.ts` 119–131 (`--stack`, unknown → exit 4) и 164–209 (`unskipIds`, `--only`/`--skip`); цит. 116–128 смещена на 3 строки, регион верен |
| V18 | **C** | `plugins/index.ts:15` — ровно `BUILTIN_PLUGINS = [anystackPlugin, golangPlugin, nodePlugin]`; `stack-registry.ts:12-49` (`BUILTIN_STACK_PLUGINS`, `BUILTIN_GATE_IDS`, `detectStacks`); `verify.cmd.ts:140-147` — блок `NO_STACK_DETECTED` → `EXIT_NO_STACK` |
| V19 | **C** | `golang-plan.logic.ts:17-24` — ровно `GO_GATE_ORDER = [generate,build,vet,fmt,lint,test]`; `:135` — ровно `Math.floor((gateTimeoutMs * 0.9)/1000)`; `:139` — `PANIC_RE`; 162–180 — три набора предикатов (panic только в TOOL, не в TEST) + hint `go install`; 207–213 — инварианты `gofmt -l` / `-o /dev/null`. Дефолты подтверждены на **`:37-43`** (generate/build/vet/lint `5*60_000`, fmt `60_000`, test `10*60_000`) — этой позиции документ не цитирует, но значения верны. `golang-plan.test.ts` — **ровно 20 тестов** |
| V20 | **C** | `golang-scope.logic.ts:12` — ровно `EXCLUDED_SEGMENTS = new Set(['vendor','testdata','node_modules'])`; `:125` — `WIDENING_RE` c `go.mod\|go.sum\|go.work\|go.work.sum\|.golangci.*\|vendor/`; 165–169 — **ровно 4** `STRUCTURAL_LIST_ERRORS`, 180 — `isStructuralListError`, 186–192 — `canonical`/realpath; 342+ — `goBearingTopLevelPaths` с прунингом на любой глубине. Base-ref: `:57` origin/HEAD, `:63` `['origin/main','origin/master','main','master']`; `--relative` на `:85-86`. `golang-detect.logic.ts:297-305` — TOOLCHAIN_MISSING `blocking: true`; вызов на `:356` — ровно `collectDiagnostics(modules, tools['go'], ...)` |
| V21 | **C** | `classify-npm-scripts.ts:18` — ровно `MUTATING_FLAG_RE = /(^\|\s)--(fix\|autofix\|write)(?:[=\s]\|$)/`; 46–65 — классификация + `chainable`/`hasChain` c `&& \|\| ; & wait` и снятыми редиректами; 124–139 — `mutating` до priority-sort. Дефолт 10 м — `node-plugin.ts:19` (`NPM_GATE_TIMEOUT_MS = 10 * 60_000`). `node-plugin.test.ts` — **ровно 14 тестов**, есть describe `umbrella screening across shell separators` |
| V22 | **C\*** | Поведение верно (`anystack-plugin.ts:22` `gateIds: ANYSTACK_GATE_IDS`, `:24` `detect`). Фикстур на HEAD — **ровно 7**, как заявлено. Но **id перечислены неверно**: фактически `any-detected-everywhere`, `any-dirty-tree`, `any-env-fail-rule`, `any-extra-gates-only`, `any-ignored-workspace`, `any-no-gates-configured`, `any-with-node-stack` |
| V23 | **C** | `fix.cmd.ts:29,31,33` — коды 1/4/5; `:55` — ровно `plan: ['plan', 'dry-run'],`; `:96` — ровно `#region START_FIXER_PLAN`, `:111` — reuse `unmatchedGateOverrides`. `fix.cmd.test.ts` — **ровно 4 теста** |
| V24 | **C** | `resolve-plugins.ts:10` — `PLUGIN_MANIFEST_FILENAME = 'plugin.json'`; 13–21 — `PLUGIN_MANIFEST_KEYS` = **точно** `id,kind,entry,specs,directives,skills,e2eFixtures`; 24+ — `DEFAULTS`; 139–146 — пустой каталог = absent, файлы без манифеста = ошибка. `resolve-plugins.test.ts` — **ровно 17 тестов**, describes `discovery` / `manifest schema` / `surfaces` |
| V25 | **C** | `plugin-api.ts` есть; `vite.config.ts:65-70` — ровно alias `'gennady/stack' → services/stack/plugin-api.ts`; `tsconfig.json:30-35` — ровно `paths` с `"gennady/stack"` на 35. `plugin-locality.test.ts` describe `plugin locality` — **ровно 3 `it`**, включая «no plugin reaches outside its own directory for host code» |
| V26 | **C** | `fixture-integrity.test.ts` describe `e2e fixture integrity` — **ровно 2 `it`**; `plugin-suite.e2e.test.ts` есть. Счётчики фикстур пересчитаны на HEAD: **anystack 7 / golang 49 / node 11 / config 17** — все четыре совпали точно. `package.json`: `test:stack-e2e`, `test:config-e2e`, `prepublishOnly` — на месте |
| V27 | **C** | `gennady.yaml` — ровно `skipGates: [lint]` + override `gennady.argv = [npx, tsx, cli/gennady.ts, lint, cli/, shared/, services/, plugins/]`; `ci.yml:132` — ровно `dogfood:`. Джобов **ровно 7**: `lint`(23) `unit`(40) `packaging`(52) `cli-e2e`(67) `config-e2e`(80) `stack-e2e`(95) `dogfood`(132) |
| V28 | **C** | `verify.sh` есть; `sdd-verify-delegation.test.ts` — describe `verify.sh capability probe` **ровно 2 `it`** (второй: «does not delegate to an older gennady that answers everything with its help and exit 0»), describe `classify-scripts.js mutation screen` **ровно 1 `it`** |

### 3.2 CHECK-LOG (C1–C15)

| # | Вердикт | Проверка |
|---|---|---|
| C1 | **C** | `_sdd-lib.sh:40` — ровно `SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}\|[0-9]+)'`; `:51` — ровно `SDD_TASK_ID_BOUNDARY='([^A-Z0-9-]\|$)'`; `:54` — `sdd_lib_task_id_valid` с `^…$`; `sdd_lib_task_id_from_path` — оба sed-паттерна `^…$`-анкорены; комментарий на 44–48 дословно описывает `TSK-IB-0012` ⊃ `TSK-IB-001`. Цитата `36-97` — регион верен |
| C2 | **C** | `check.sh:47-53` — таблица кодов 0/3/2/4 + «`findings=0` … only ever emitted after something was actually checked»; 97/107/117 — три `exit 4` на BAD_INVOCATION; `:193-199` — ровно `NO_TICKETS_FOUND` → `exit 2`; `:661-666` — `findings=`, `rule_findings=`, `exit 3\|0`. Цит. 49–54 / 160–161 смещены на 1–2 строки, регионы верны |
| C3 | **C** | `check.sh:282-286` — список `--include` **дословно** совпадает с заявленными 15 расширениями: `.ts .js .sh .go .swift .m .mm .h .kt .java .py .rb .rs .cs .php` |
| C4 | **C\*** | `check.sh:21-29` — набор kinds **дословно**: findings = `unknown-token \| unclosed-round \| fabricated-placeholder \| bad-round-close \| entry-after-close \| extra-close-entry`; informational = `retired-token \| round-close-no-timestamp`; `:651` — ровно фильтр `$4 != "retired-token" && $4 != "round-close-no-timestamp"`. `sdd-check-log.test.ts` — describes `check.sh [LOG]` / `… post-close integrity` / `… region is scoped`, **всего ровно 28 `it`** (= 18+7+3). **Поправка**: «🛑/✅ blocker markers are **not tokens**» неточно — на `:531` они явно **регистрируются как валидные токены** (`valid["🛑"] = 1; valid["✅"] = 1`). Наблюдаемый эффект (отсутствие finding) тот же, но механизм иной |
| C5 | **C** | Условие `roundwork == 1` присутствует в обеих ветках закрытия раунда — `:562` (`/^### Round /`) и `:574` (`/^#### /`), плюс END-блок `:640`. Документ сам хеджирует («~563-574») — регион верен |
| C6 | **C** | `:567` — ровно `printf … entry-after-close …` в ветке `/^### Round /`; `:599-600` — ровно `else if ((tok in valid) && ts != "" && $0 ~ /^- \[x\]/)` → `extra-close-entry`; `:643` — тот же `entry-after-close` в END. `norm_ts` объявлена на **:540** (цитата `:538` — комментарий о ней, смещение 2 строки) |
| C7 | **C** | `check.sh:559` — ровно `/^## / { if (inlog) inlog = 0 }`. Утверждение «region ends at ANY `## ` heading» подтверждено символ-в-символ. См. MISSED-7 про условие **входа** |
| C8 | **C** | `check.sh:19` — ровно строка шапки `[REOPENS] — task_id \t meta \t audit_triggered \t verdict(OK\|PENDING\|MISMATCH\|UNVERIFIABLE)`; `:347` — заголовок секции, `:350` — `printf '\n[REOPENS]\n…'`, вердикты OK/MISMATCH с `FINDINGS++` в `reopens_one`. Цит. 347–418 — регион верен ([RULES] начинается на 439) |
| C9 | **R** (частично) | `check.sh:20` и `:33-43` процитированы **точно** (включая «tolerant opening-tag scan, NOT an XML parse», «project and … plugin directive trees», «Tree mode scans every rule file; task mode scans only the ones that ticket's phases cite», отдельный `rule_findings=`) и `:664` — ровно `printf 'rule_findings=%d\n'`. **Но перечень категорий неверен.** Документ: «cascade categories coding/testing/infra». Фактический предикат — `_sdd-lib.sh:14`: `SDD_RULE_PATH_RE='(^\|/)(ai/directives\|plugins/[a-z0-9-]+/directives)/(**architecture\|coding\|infra\|quality\|testing**)/[^/]+\.xml$'`, и `check.sh:447,464` вызывают именно `sdd_lib_is_rule_path`. Категорий **пять**, не три. Документ воспроизвёл устаревший комментарий в шапке `check.sh:38`, а не код. То же в R1 (там перечень не приводится — R1 остаётся CONFIRMED) |
| C10 | **C** | `sdd-execute/SKILL.md:49-50` — pickable = `[ ] TODO` AND every Dependency `[x] DONE`; `:124` — ровно «Set ticket Meta Status → `[~] IN_PROGRESS`. **Not `[x] DONE` — the round is closed, not verified.**»; `scaffold.directive.xml:241` — ровно `<Axiom id="AX_AUDIT_HOOK">`. `sdd-review-lifecycle-contract.test.ts` — **ровно 24 `it`** |
| C11 | **C** | `scaffold.directive.xml:711-721` — **ровно** таблица токенов: заголовок на 711, разделитель 712, девять строк `intro/decision/tried/discovery/insight/verified/ver/BLOCKED/DONE` на 713–721; «Round structure:» на 723 |
| C12 | **C** | `phase-execution-protocol.xml:90` — ровно «**Must run:** `<sdd-path> verify --wip <target-files>` — MANDATORY… ONE `ver` line per invocation»; `:322` — ровно шаг 1 STEP_5; про «`ver` == исполненная bash-команда» см. **:333** (цитата `:332` — пустая строка, смещение 1). Побочно: в `STEP_5` дважды нумерация «2.» (строки 326 и 327) — дефект директивы, документом не отмечен |
| C13 | **C** | `lint-artifacts.sh:7-49` — порядок разрешения **ровно** PATH (`command -v gennady`) → `$GENNADY_HOME/node_modules/.bin/tsx` + `cli/gennady.ts` → `./node_modules/.bin/gennady`; коды выхода 0/1/2/3/4 документированы на 20–25; явный комментарий «Keep this file path-literal-free». Тест — describe `lint-artifacts.sh after sync-skills normalization`, **ровно 3 `it`** |
| C14 | **C** (с оговоркой) | `sdd-execute/SKILL.md:17` — ровно «Resolve `SDD_PATH` once from this installed skill's own directory as `scripts/sdd`»; `audit.directive.xml:284` и `:410-413` — ровно `<sdd-path> extract` / «Use the exact absolute `<sdd-path>` … a missing path is a structural halt»; `scripts/README.md:25` — ровно `"Bash(<resolved-sdd-path> *)"`; `sync.e2e.test.ts:73-78` — ровно assert на `<sdd-path>`. Остаточные литералы `~/.claude/skills`: **discovery.directive.xml:614 (1)** и **module-decomposition.directive.xml:661 (1)** — как заявлено. **Оговорка**: есть ещё один в `ai/skills/README.md:8` (файл деплоится через `sync-skills`), который документ не учитывает |
| C15 | **C** | `sdd-execute-batch/SKILL.md:8` — ровно `<SddExecuteBatchOrchestrator role="queue-scheduler-only">`, 9–12 — «You do not implement a second phase/audit state machine here», 14–15 — «every task currently shares one working tree». `sdd-adaptive-execution-contract.test.ts` — **ровно 6 `it`** |

### 3.3 SYNC-OWNERSHIP (S1–S9)

| # | Вердикт | Проверка |
|---|---|---|
| S1 | **C** | `sync-core.ts:27` — ровно `export const PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml']);`; `:239-241` — ветка `preserved`; `:253-254` — ровно `if (!opts.dryRun && status !== 'unchanged' && status !== 'preserved')`; `sync.types.ts:8` — ровно `'added' \| 'updated' \| 'unchanged' \| 'preserved'`, `:64-76` — getter `preserved` + `summary` с «preserved (project-owned)»; `knowledge.xml:3` — ровно «PROJECT-OWNED. …» |
| S2 | **C** (формулировка) | `sync-core.shared.ts:16-38` — `packageRootOf` идёт вверх до `package.json` с `name === 'gennady'`; `:44` — `resolvePackageDir`. **Уточнение**: обход вверх делает `packageRootOf`; `resolvePackageDir` сначала пробует `<projectRoot>/node_modules/gennady/<subdir>`, обход — резервный путь. Формулировка S1 их сливает; суть верна |
| S3 | **C** | `sync.cmd.ts:91` — ровно `extraSourceDirs: pluginSurfaceDirs(_resolvePackageDir(cwd, 'plugins'), 'directives')`; `sync-skills.cmd.ts:101` — то же с `'skills'`; `plugin-assets.ts:43-52` — ровно `pluginSurfaceDirs`; `sync-core.ts:84` — `scanSourceRoots` с инвариантом «A requested subdir must exist in at least one root … the base root wins a path collision» |
| S4 | **C** | `sync-skills-core.ts:159-170` — `scanAllSkillRoots` с комментарием «Only a MISSING plugin root is normal … The base root, and any other failure (EACCES, EIO), must stay fatal» и условием `index > 0 && (code === 'ENOENT' \|\| code === 'ENOTDIR')`. `sync/sync-core.ts:95-98` и `:147-149` — оба statSync-гарда на месте. Цит. 136–168 — регион верен (точно 143–170) |
| S5 | **C** | `sync-skills-core.ts:32` — ровно `const MANIFEST_NAME = '.gennady-synced';`; `:96` — `export function adoptPackageInstalled(`; `:583` — `manifest ?? adoptPackageInstalled(...)`. Целевой каталог — `<cwd>/.claude/skills` ⇒ путь `.claude/skills/.gennady-synced` верен |
| S6 | **C** | Все пять процитированных позиций символ-в-символ: `:25` `EXCLUDED_NAMES = new Set(['.DS_Store','__tests__'])`, `:128` `isTestArtifact`, `:224`/`:272`/`:356` — фильтры readdir (на `:272` — с `isTestArtifact`) |
| S7 | **C** | `deployed-surface.golden.txt` — **ровно 80 строк** на HEAD, как заявлено |
| S8 | **C** | `path-normalizer.ts` 34–96: `RULE_CLI_TSX_FULL` (36–39, → `npx gennady`), `RULE_SKILLS_TILDE` (49–51, → `.claude/skills/`), `RULE_PLUGIN_DIRECTIVES` (63–66, `plugins/<id>/directives/` → `ai/directives/`), `RULE_AI_ABS` (→ `ai/`). `RULE_SKILLS_TILDE` входит **только** в `SYNC_SKILLS_PATH_RULES` (`:100`), не в `SYNC_PATH_RULES` (`:84`) — «additionally» верно |
| S9 | **C** | `scripts/__tests__/` содержит **ровно 10** `*.test.ts` + golden; под `ai/skills/**` тестов нет (`ls-tree` подтверждает 11 файлов в `scripts/`, все не-тестовые); `scripts/` отсутствует в `package.json#files` |

### 3.4 RULES (R1–R5)

| # | Вердикт | Проверка |
|---|---|---|
| R1 | **C** | Все **10** перечисленных rule-файлов на HEAD несут все четыре секции (`<BeliefState>`, `<AntiPatterns>`, `<VerificationHooks>`, `<RewardCriteria>`) — проверено grep-ом по каждому. Арифметика «19 rows at #18 merge, +4 at `5a237cd5`» = 23 ⇒ фактическое число rule-файлов (non-`*.directive.xml`, категории `architecture\|coding\|infra\|quality\|testing`, проект + плагины) на HEAD = **ровно 23**. `testing-rule-contract.test.ts` describe `rule checkable surface contract` — **ровно 3 `it`**, дословно совпадают с описанием в скобках |
| R2 | **C** | Все четыре `<DependsOn>` — символ-в-символ на процитированных строках: `node-test.xml:8`, `vitest-rules.xml:8`, `go-rules.xml:8`, `python-rules.xml:7`. Ремарка «DependsOn is optional and unchecked per `audit.directive.xml:240`» — цитата **точна** (строка 240 буквально этим и заканчивается). См. MISSED-8: строки 253/264 той же директивы утверждают обратное |
| R3 | **C** | `knowledge.xml:3` (PROJECT-OWNED), `:67` — ровно `<Rule id="baseline-rules">`, `:129` — ровно `<Rule id="baseline-testing">`; `typescript-rules` Triggers = «Target Files include .ts / .tsx source files», SkipWhen = «non-TypeScript language (see python-rules / go-rules)»; `python-rules`/`go-rules` несут `<CrossRef id="baseline-rules">` |
| R4 | **C** (слабая привязка) | Файлы на месте: `plugins/golang/directives/infra/golang-setup.xml`, `plugins/golang/skills/sdd-infra-golang/SKILL.md`; `nodejs-npm-setup.xml` остаётся в `ai/directives/infra/`; `path-normalizer.ts:63-66` — правило переписывания. **Но** процитированный `plugins/golang/plugin.json` содержит только `{id, kind, entry}` — ключей `directives`/`skills` там **нет**; поверхности разрешаются через `DEFAULTS` резолвера (`resolve-plugins.ts:24+`), т.е. цитата не показывает то, что заявлено. Механизм верен, ссылка выбрана неудачно |
| R5 | **C** | `scaffold.directive.xml:74` — одна строка содержит **весь** заявленный инвариант дословно: «Each ref must exist as `ai/directives/<category>/<rule>.xml`», «The rule set is PROJECT-OWNED», «a non-Node scope authors its own rule files», «A scope that legitimately activates no rules yet declares an empty set (valid); this is distinct from a dangling reference (abort)». `:95` и `:470` — оба про чтение `knowledge.xml`. Механического теста действительно нет (как и сказано) |

### 3.5 DIRECTIVES-SDD (D1–D9)

| # | Вердикт | Проверка |
|---|---|---|
| D1 | **C** | Все три протокола существуют на HEAD (`critic-protocol.xml`, `interview-protocol.xml`, `visual-vocabulary.xml`); `directive-markup-contract.test.ts` есть |
| D2 | **C** | `AGENTS.md:5` — ровно «Файлы `ai/directives/**/*.xml` и `plugins/*/directives/**/*.xml` — **HTML-like prompt markup, а не XML-документы**»; заголовок «## Directive markup — mandatory» на `:3` |
| D3 | **C** | `critic.directive.xml` 4–27 покрывает **всё** заявленное: Mission `:4` («Round 1 is the baseline review», «stop immediately on CLEAN (max 5 rounds as an emergency cap)»), `AX_ISOLATION_SIGNAL:10`, `AX_CLEAN_TERMINAL:12`, `AX_CAP_5:14`, `AX_FINDING_EVIDENCE:16`, `AX_DEFAULT_ACCEPT:17`, `AX_CONFUSION_TRIAGE:19`, `AX_ROUND_FRONTIER:20`, `AX_SCRATCH_LOG:25`, `AX_POLISH_MODE:27` («Default dispatch is `Polish: off`»). `:81-85` — антипаттерны `AP_NO_RE_DISPATCH`/`AP_SPIN`/`AP_POLISH_SPIN`. `:169` — ровно `### Round N — YYYY-MM-DD`. `critic-directive-contract.test.ts` describe `SDD critic convergence contract` — **ровно 5 `it`** |
| D4 | **C** | `audit.directive.xml:87` — `AX_SEVERITY_TAGGING`; `:117` — «**Overall status is computed from severities, never judged.** First matching row wins»; таблица на 119–123 (**4 строки условий** → FAIL/FAIL/PASS_WITH_ACKNOWLEDGED_RISKS/PASS); `:125` — cap на MINOR для project-scope; `:137` и `:155` — маршрутизация `rule-file-fix` («never `ticket-update`, never a phase owner, never `FAIL` for this task»); `:164` — `phase=—`. Все точно |
| D5 | **C** | `:82` — ровно строка `EXECUTION_LOG_INCOMPLETE`; `:240` — ровно «Section presence is NOT judged by eye — `sdd check --task <Task-ID>` emits `[RULES]`…»; `:284`, `:410-416` — точно |
| D6 | **C** | `scaffold.directive.xml:136` — ровно `<Axiom id="AX_TICKET_HAS_BDD_AND_TESTS">`; `:145` — ровно «A scenario's expected outcome REFERENCES the spec's canonical fact by anchor … Concrete input instances in `Given` stay literal»; `:267` — ровно `<Axiom id="AX_SSOT_TRACEABILITY">`; `audit.directive.xml:281` — ровно «**Spec-anchor references resolve (SSOT, advisory).**» |
| D7 | **C** | `phase-execution-protocol.xml:31` — `AX_PHASE_SCOPE_LOCK`, `:39` — ровно абзац про границы ownership («A repo-wide gate that fails inside ANOTHER phase's `Target Files` … Record it in Handoff `open:`»); `:97` — ровно «**Forbidden:** `git` ANY subcommand (status, branch, log, diff, add, commit); `npm run lint` alone …; `npm run format`; prett…»; `:154` — `AX_BLOCKER_ESCALATION`; `:187` — HANDOFF_FORMAT; `:336` — `STEP_6_EMIT_HANDOFF` |
| D8 | **C** (с пробелом) | Все шесть строк точны: `:65` (счётчик README), `:162` («**Task IDs use path-based prefixes: `TSK-{PREFIX}-{NNN}`.**»), `:180` (`AX_REOPEN_TICKET_FORMAT`), `:223` («legacy `TSK-NN` IDs remain valid for pre-convention tickets»), `:241` (`AX_AUDIT_HOOK`), `:443` (`H_ID_COLLISION`). **Пробел**: заявленное «model inherited by dispatched agents» не подтверждается ни одной из шести цитат — правило наследования модели живёт в другом месте (по строке 97 — в discovery/module-decomposition), ссылка отсутствует |
| D9 | **C** | `AX_LANG_PASS_ON_WRITE` существует в обоих файлах: `discovery.directive.xml:320` (использование на `:502`) и `module-decomposition.directive.xml:327` (использование на `:545`). Документ сам помечает «no mechanical test» — верно |

### 3.6 SKILLS (K1–K5)

| # | Вердикт | Проверка |
|---|---|---|
| K1 | **C** | `ls-tree -d ai/skills/` — **ровно 16** каталогов, и перечень в документе совпадает **посимвольно и по составу**: agent-inbox, alt-opinion, prd-interview, sdd-audit, sdd-check, sdd-continue, sdd-critic, sdd-discover, sdd-execute, sdd-execute-batch, sdd-fix, sdd-infra, sdd-module-decomposition, sdd-scaffold, sdd-setup, workspace-permission-setup. `plugins/golang/skills/sdd-infra-golang` есть. `ai/skills/sdd-hooks-install` отсутствует |
| K2 | **C** | `sdd-execute/SKILL.md:17` (SDD_PATH), 38–67 и 93–124 — lifecycle/resume/Round-close. `sdd-adaptive-execution-contract.test.ts` **6**, `sdd-review-lifecycle-contract.test.ts` **24** — оба счётчика точны |
| K3 | **C** | `ai/skills/sdd-check/SKILL.md` существует; тест `sdd-review-lifecycle-contract` присутствует |
| K4 | **C** | `ls-tree -r ai/skills/sdd-execute/scripts/` — **ровно 11** файлов, состав совпадает посимвольно: `README.md`, `_sdd-lib.sh`, `check-blockers.sh`, `check.sh`, `classify-scripts.js`, `classify-scripts.ts`, `extract-section.sh`, `lint-artifacts.sh`, `scan.sh`, `sdd`, `verify.sh`. Тестов внутри нет — подтверждено |
| K5 | **C** (неполно) | `git grep -l 'DIRECTIVE ACTIVATED' -- 'ai/skills/*/SKILL.md'` → **ровно 7**: sdd-continue, sdd-discover, sdd-fix, sdd-infra, sdd-module-decomposition, sdd-scaffold, sdd-setup. **Неполнота**: восьмой файл — `plugins/golang/skills/sdd-infra-golang/SKILL.md` (тоже деплоится в `.claude/skills/`). Итого **8** SKILL.md, а issue #16 говорит про «Nine SDD skills» — расхождение между issue и деревом документом не разобрано |

### 3.7 RELEASE-PACKAGE (P1–P6)

| # | Вердикт | Проверка |
|---|---|---|
| P1 | **C** | `package.json#files` — **10 записей, дословно** те, что перечислены: `dist/**/*`, `README.md`, `docs/**/*`, `ai/**/*`, `cli/cmd/orient/README.md`, `services/agent-run/engines/opencode/readonly.config.json`, `plugins/*/plugin.json`, `plugins/*/*.ts`, `plugins/*/directives/**/*`, `plugins/*/skills/**/*`. `.npmignore` существует (35 строк) |
| P2 | **C** | `exports` **дословно**: `"."` → `types dist/index.d.ts`, `import`/`default` `dist/index.js`; `"./stack"` → `types dist/services/stack/plugin-api.d.ts`, `import`/`default` `dist/stack.js`. `bin` = `./dist/gennady.js`. `vite.config.ts:45-53` — plugin `gennady:executable-bin` с `chmodSync(dist/gennady.js, 0o755)` в `closeBundle`; `:87-93` — `entryFileNames` как единственный источник имён; `tsconfig.json:35` — `"gennady/stack"` в `paths` |
| P3 | **C** | `prepublishOnly` **дословно**: `npm run lint && npm run test:smoke && npm run test:cli-e2e && CONFIG_E2E_STRICT=1 npm run test:config-e2e && STACK_E2E_STRICT=1 npm run test:stack-e2e && npm run build:publish`; `postpublish` = `cleanup-publish-artifacts.ts`; `test` содержит `--test-concurrency=1` |
| P4 | **C** | `publish-next.ts:258-279` — комментарий «Publish to npm FIRST … turned every failed gate into a phantom release», затем `run('npm',['publish','--tag','next'])` и только после — `git add/commit/tag/push`, плюс catch с инструкцией восстановления. Версия main = `0.9.0-next.3` > latest 0.8.4 |
| P5 | **C** | `opencode-engine.ts` присутствует; `bundle-smoke.e2e.test.ts` присутствует и включён в `test:smoke` |
| P6 | **C** | `devDependencies.yaml` = **ровно `"2.9.0"`** (точный пин, без `^`); `dependencies` = **ровно** `ink`, `react`, `tree-sitter`, `tree-sitter-typescript` |

### 3.8 (прозаические заметки)

| Утверждение | Вердикт |
|---|---|
| `docs/sdd-flow.md` (407→**~600** строк) | **REFUTED (число)**: на HEAD **487** строк. «407» на момент `3763f3ce` — верно |
| `ai/fw-draft/**`, `ai/fw/v1/**`, `ai/fw/v2/**` (**19 файлов**) удалены | **REFUTED (число)**: **18** (12 + 5 + 1). § 5.2 приводит верную разбивку |
| `specs/README.md` регистрирует `stack`, `config`, `plugins`, `infra-e2e` | **CONFIRMED** (все четыре упоминаются) |
| CI: **7** незамутняющих джобов, lint без `--autofix`, golangci-lint v2.12.2, `fetch-depth: 0`, `workflow_dispatch` | **CONFIRMED**: 7 джобов; `lint` job = «lint (check-only)» с шагами «prettier (check, never --write)», «tsc --noEmit», «DbC contracts (check, never --autofix)»; `workflow_dispatch` на `ci.yml:12` |
| `lint.cmd.ts` — обычный модуль, `index.ts` владеет run/print/exit | **CONFIRMED**: в `lint.cmd.ts` `process.exit` встречается только в комментарии (`:352`); `lint/index.ts` содержит `await run(process.argv)` + `process.exit(report.exitCode)` |
| **Пять** соседних команд по-прежнему self-execute (inbox, inbox-context, resolve-conflicts, review-verify, vcs-worktree) | **CONFIRMED**: все пять оканчиваются `process.exit(...)`; для review-verify это `cli/cmd/review/**review-verify.cmd.ts** ` (а `cli/cmd/review-verify/index.ts` — лишь `import '../review/review-verify.cmd.ts'`), т.е. каталог не тот, что можно предположить по названию |

## § Пропущенные инварианты

Найдено 7 поведений в указанных коммитах, не отражённых в § 3, плюс 1 внутреннее противоречие main.

**MISSED-1 — канонический предикат rule-файла: пять категорий, не три** (`90b123e9`; `_sdd-lib.sh:14-19`).
Введены `SDD_RULE_PATH_RE` и `sdd_lib_is_rule_path()`:
```
SDD_RULE_PATH_RE='(^|/)(ai/directives|plugins/[a-z0-9-]+/directives)/(architecture|coding|infra|quality|testing)/[^/]+\.xml$'
sdd_lib_is_rule_path() { [[ "$1" =~ $SDD_RULE_PATH_RE ]] && [[ "$1" != *.directive.xml ]]; }
```
`check.sh:447` и `:464` вызывают именно его. Это единый источник истины «что есть rule-файл» для `[RULES]` и `[TASKID]`, и он покрывает **architecture** и **quality** тоже. Прямо опровергает перечень в C9 (см. выше) и должно быть отдельным инвариантом.

**MISSED-2 — обнаружение тикетов стало контентным, не по имени файла** (`90b123e9`; `scan.sh:226-228`).
Было: `find … -name '*.task-*.md'`. Стало:
```
find -L "$ROOT_ABS/tasks" -name '*.md' ! -name 'README.md' -type f \
  -exec grep -lE 'Task-ID:\*?\*?[[:space:]]*TSK-([A-Z][A-Z0-9]*-)?[0-9]+' {} \;
```
Тикетом считается любой `*.md` (кроме README.md) с строкой `Task-ID:` в грамматике. Это меняет область действия **всех** проверок `sdd scan`/`sdd check` в tree-режиме и напрямую относится к issue #9 (path-based Task-IDs invisible). В § 3 отсутствует. Тот же коммит расширил все четыре tracker-грепа в `scan.sh` на префиксную форму `TSK-([A-Z][A-Z0-9]*-)?[0-9]+`.

**MISSED-3 — `extract-section.sh` получил код выхода 5 `ANCHOR_EMPTY`** (`90b123e9`).
«markers are present and balanced, but the section payload is empty»; предыдущий путь возвращал 2. D5 упоминает exit 5 только как то, что **потребляет** audit (`audit.directive.xml:284-286`); самого контракта кодов выхода `sdd extract` (0/2/3/5) в § 3 нет, хотя это единственный механический интерфейс проверки анкоров тикета. Тот же коммит убрал из скрипта dev-литерал `~/Developer/gennady/ai/directives/sdd/scaffold.directive.xml` → «the scaffold directive installed with this SDD skill set» (относится к S8/C14, тоже не отмечено).

**MISSED-4 — переписанный `critic-protocol.xml` v1.1 → v1.2** (`d6065c36`).
D3 упоминает файл, но ни одного его инварианта. Фактически изменено ядро протокола:
- **Инверсия `AX_ISOLATION`**: было «If you are confused, the artifact is underspecified» → стало «Missing project context may explain confusion; confusion alone never proves that the artifact is underspecified».
- `AX_UNCERTAINTY_IS_SIGNAL` **заменён** на `AX_UNCERTAINTY_NOT_FINDING` («valid output but not a finding»).
- Новые: `AX_FINDING_PROVENANCE`, `AX_CONFUSION_TRIAGE`, `AX_REVIEW_MODE` (baseline vs verification frontier), `AX_AUTHOR_BOUNDARY`.
- Новые антипаттерны `AP_COAUTHOR`, `AP_CONFUSION_AS_FINDING`, `AP_VERIFICATION_RESET`.
- Формат строки finding расширен: `Location | **Requirement anchor** | Finding | **Concrete breakage** | Severity | **Minimal fix**`.
- Вердикт CLEAN переопределён как «no evidence-backed CRITICAL/MAJOR **inside the active frontier**».
Это протокольная (dispatched-critic) половина того же изменения, что D3 описывает только со стороны оркестратора.

**MISSED-5 — порт `SyncDeps` сменил `rmdir` на `rm`** (`62172906`; `shared/common/sync/sync-deps.type.ts`).
`rmdir?: (path, {recursive})` → `rm?: (path, {recursive, force})`, инвариант в docstring обновлён. Строка 97 § 1.3 упоминает «`fs.rm` recursive for Node 20+», но в § 3.3 нет инварианта на контракт порта, хотя это единственная точка удаления в `sync-skills` (напрямую связано с S5 «failed deletions retried»).

**MISSED-6 — `sdd` dispatcher: справка стала контрактом секций** (`4a47b9e8`).
`sdd check --help` теперь перечисляет полный набор `[REOPENS]`, `[RULES]`, `[LOG]` (включая post-close `entry-after-close`/`extra-close-entry`) наравне с `[TASKID]`/`[TRACKER_SYNC]`/`[HEADERS]`. Поверхность документации, но именно её читает оркестратор при выборе команды; в § 3 не зафиксировано.

**MISSED-7 — условие ВХОДА в регион Execution Log сознательно узкое** (`4a47b9e8`; `check.sh:558`).
C7 фиксирует только выход (`:559`). Вход — `/^## 7\. Execution Log/ { inlog = 1; next }`, и комментарий на 550–553 объясняет, что расширять его до любого `## <n>. Execution Log` **отказались намеренно**: это начало бы разбирать логи тикетов, нумерующих секцию 4/5/6, — «49 counted `unknown-token` rows across this tree». Следствие: **тикет, у которого Execution Log не седьмая секция, вообще не проверяется `[LOG]`** — большая дырка в покрытии, парная к C7 и релевантная issue #15/#23.

**MISSED-8 (не из делты, но опровергает рамку R2) — audit ВСЁ-ТАКИ проверяет `<DependsOn>`.**
R2 цитирует `audit.directive.xml:240` («`<DependsOn>` is optional and unchecked») — цитата точна. Но та же директива на `:253` требует, чтобы список `Rules:` фазы равнялся каскаду «**plus transitive closure of every rule's `<DependsOn>`**», а на `:264` вводит явную проверку: «open its file, read its `<DependsOn>` … Missing transitive dep → `RULES_CASCADE_MISMATCH` (`MAJOR`) tagged `unresolved-dependency`». `git log -S 'RULES_CASCADE_MISMATCH' 46c6d616..origin/main` — пусто, т.е. правило предшествует merge-base и в делту не входит. Тем не менее § 3 описывает main HEAD, и R2 в текущей формулировке скрывает и сам инвариант, и внутреннее противоречие директивы. Рекомендую отдельную строку R6 и пометку о конфликте `:240` ↔ `:253/:264`.

## § Issues↔PR

### PR (`gh pr list --repo rubaxa/gennady --state all --limit 50`)

Всего 13 PR. Таблица § 4.1 — **CONFIRMED полностью**, все 11 строк:

| PR | Документ | Факт | Вердикт |
|---|---|---|---|
| #25 | OPEN, `codex/sdd-v2-rc52-followup` → `sdd-v2-readiness-105d19` | идентично | OK |
| #18 | MERGED 09-02, `codex/testing-rule-contracts` → main, `d86c49dd` | `mergedAt 2026-09-02T13:29:09Z`, `d86c49dd0d85…` | OK |
| #14 | MERGED 09-02, `codex/sdd-adaptive-execution` → main, `90b123e9` | `2026-09-02T13:27:01Z`, `90b123e94355…` | OK (коммит датирован 09-01, merge — 09-02; § 1.3 и § 4.1 не противоречат) |
| #12 | MERGED 09-03, `fix/sdd-check-log-integrity` → main, `4a47b9e8` | `2026-09-03T07:22:27Z`, `4a47b9e8df3e…` | OK |
| #10 | MERGED 09-02, `fix/sdd-tooling-portability` → main, `62172906` | `2026-09-02T16:36:17Z`, `621729064859…` | OK |
| #8 | MERGED 08-31, `codex/critic-convergence` → main, `d4d2f3a7` (+`d6065c36`) | `2026-08-31T12:10:41Z`, `d4d2f3a75e21…`; `d6065c36` — единственный коммит ветки | OK |
| #7 | CLOSED unmerged, `feat/yaml-verify` → main | `state CLOSED`, `mergedAt null` | OK |
| #6 | OPEN, `sdd-v2-readiness-105d19` → main | идентично | OK |
| #5 | MERGED 08-25, `feat/sdd-infra-golang` → main, `b4840ca1` (58 коммитов) | `2026-08-25T12:48:13Z`, `b4840ca1ffa9…`, 58 подтверждено `rev-list` | OK |
| #4 | MERGED 08-12, `claude/gennady-backend-adoption-cef193` → main, `c5fa924f` (6) | `2026-08-12T14:07:49Z`, 6 подтверждено | OK |
| #3/#2/#1 | MERGED ≤06-28, `33eb65e9`, `b90c7f13`, `11bc43de` | #3 `33eb65e9…` 06-28; #2 `b90c7f13…` 06-06; #1 `11bc43de…` 2026-04-03 | OK («≤06-28» держится) |

Ремарка § 1.1 «fork-internal “PR #3” `cbc292a0` = `maksimuimin/feat/clean-tree-verify`, NOT this repo's PR #3» — **подтверждено обоими способами**: subject `cbc292a0` = «Merge pull request #3 from maksimuimin/feat/clean-tree-verify», а PR #3 этого репозитория — `opencode/clever-cactus` → `33eb65e9`, слит 2026-06-28 (до merge-base). Полезная и верная дисамбигуация.

Заголовки PR в документе сокращены (сняты conventional-префиксы `fix(sdd):`/`feat(verify):`), но содержательно верны — не считаю расхождением.

### Issues (`gh issue list --repo rubaxa/gennady --state all --limit 100`)

Всего **12** issue: #9, #11, #13, #15, #16, #17, #19, #20, #21, #22, #23, #24 — ровно те, что в таблице § 4.2, лишних и пропущенных нет. Автор всех — `akkrat` (Artur Protska) — **CONFIRMED**. Статусы: #13 CLOSED (`closedAt 2026-09-03T07:22:33Z` — совпадает с датой 09-03 и с merge PR #12 в тот же час), остальные 11 OPEN — **CONFIRMED**. Все 12 заголовков в сокращении переданы верно.

**REFUTED** — шапка § 4.2 «all by akkrat, **all filed against `0.8.4-next.10`**». Грепом по телам issue:

| Issue | Версия/база в теле |
|---|---|
| #9, #11, #13, #15, #16, **#17** | `0.8.4-next.10` |
| #19, #20, #21, #22, #23 | **только** `main@62172906` |
| #24 | **и** `0.8.4-next.10`, **и** `main@62172906` |

То есть пять issue (#19–#23) вообще не ссылаются на `0.8.4-next.10`. Сноска в конце § 4.2 («#9/#11/#13/#15/#16 quote `0.8.4-next.10` line numbers; #19–#24 quote `main@62172906`») почти верна, но: (а) пропускает **#17** в первой группе, (б) #24 принадлежит **обеим** группам. Шапку и сноску надо согласовать между собой.

Содержательные графы «addressed by» / «coverage» / «what remains» проверены выборочно и подтверждены на коде:

| Issue | Проверка утверждения «что осталось» | Вердикт |
|---|---|---|
| #11 | ровно **1** литерал `~/.claude/skills` в `discovery.directive.xml:614` и **1** в `module-decomposition.directive.xml:661` | CONFIRMED (плюс третий — в `ai/skills/README.md:8`, не учтён) |
| #15 | `critic.directive.xml:169` по-прежнему предписывает `### Round N — YYYY-MM-DD` под `## Critic Rounds` | CONFIRMED дословно |
| #16 | 7 файлов `ai/skills/*/SKILL.md` с `DIRECTIVE ACTIVATED` | CONFIRMED; всего 8 SKILL.md (см. K5) |
| #17 | `gate-runner.ts:331` и `:335` — по-прежнему `output: ''` на pass; `showOutputOnPass` в дереве отсутствует | CONFIRMED |
| #19 | `phase-execution-protocol.xml:97` — по-прежнему «**Forbidden:** `git` ANY subcommand», исключения для фикстур нет | CONFIRMED дословно |
| #23 | таблица токенов `scaffold.directive.xml:711-721` — 9 токенов, `correction`/`amend` отсутствуют | CONFIRMED |
| #24 | `PROJECT_OWNED_ENTRIES` = только `{knowledge.xml}`; остальные директивы получают статус `updated` | CONFIRMED |
| #9 | «`extraGates[].when` / per-gate `paths` не реализованы» — в `GATE_SPEC_KEYS` (`stack-config.ts:34+`) ключей `when`/`paths` нет | CONFIRMED |

## § Файлы

Метод переизведён с нуля:
```
git diff --name-only 46c6d616 origin/main | sort -u                      → 521
git ls-tree -r --name-only origin/main | sort -u                          → 1309
touched ∩ main                                                            → 502
(touched ∩ main) \ RC                                                     → 425
(touched ∩ main) ∩ RC                                                     →  77
touched \ main                                                            →  19
```

| Утверждение § 5 / § 6 | Факт | Вердикт |
|---|---|---|
| touched 521 | **521** | CONFIRMED |
| main tree 1309 | **1309** | CONFIRMED |
| main-only **425** | **425** | CONFIRMED точно |
| conflict zone **77** | **77** | CONFIRMED точно |
| deleted by main **19** | **19**, и перечень § 5.2 (12 fw-draft + 5 fw/v1 + 1 fw/v2 + `ai/skills/sdd-hooks-install/SKILL.md`) совпадает **пофайлово** | CONFIRMED точно |
| RC tree **2804** | **2805** на текущем RC HEAD; **2804** на заявленной базе `11291af5` | верно на базе, устарело |
| RC-only **535** / main-only 115 | `11291af5...origin/main` → **535 / 115**; `codex/sdd-v2-rc52-followup...origin/main` → **537 / 115** | верно на базе, устарело |
| RC HEAD `11291af5` (09-06) | RC HEAD сейчас **`3d5f66a7`** (2026-09-07); `11291af5` — предок, ушли 2 коммита (`95329c19`, `3d5f66a7`, оба `flow-eval`) | **устарело** |
| RC `package.json` = 0.8.4 | 0.8.4 (и на базе, и на HEAD) | CONFIRMED |

Важно: 425/77 я считал против **текущего** RC HEAD и получил те же числа — оба новых RC-коммита не задели ни одного пути из делты main, так что вывод § 5 устойчив.

Утверждения о раскладке RC также подтверждены: в RC нет `ai/directives/sdd/`, `services/stack`, `services/plugins`, `services/config`, `plugins/`, `cli/cmd/verify`, `cli/cmd/fix`; есть `ai/directives/sdd-v2/**` и `ai/kit/**`. Вывод «the audit must map by behaviour, not by filename» — обоснован.

§ 0 прочее: merge-base `46c6d616` (2026-06-29, «feat(vcs): unify --vcs-host flag …») — CONFIRMED; main HEAD `8bb38477` 2026-09-03 — CONFIRMED; версия main `0.9.0-next.3` — CONFIRMED; диапазон дат делты `2026-08-10 .. 2026-09-03` — CONFIRMED точно.
Мелочь по авторам: фактические distinct `%an` — `Artur Protska`, `Claude Opus 5`, `Konstantin Lebedev`, `Lebedev Konstantin`, `Maksim Uimin`, `Maxim Uymin`, `Test`, `Лебедев Константин` (8). Документ упоминает «k.lebedev» — такого `%an` нет (это часть e-mail); четвёртый вариант `Lebedev Konstantin` (merge-коммиты) в перечисление не выделен.

## § Классификация

Общая структура треков разумна, суммы почти все сходятся. Замечания:

**Арифметика**
1. **SKILLS: заявлено 13, перечислено 14 sha** (`52c03db9 a336f17b 5651c05f d6479748 db8fa198 cd7f3e01 1e22e8ad 139448e3 cf4f0470 2a0282da 90b123e9 62172906 4a47b9e8 3b286bda`). Число в колонке надо исправить на 14 либо удалить одну строку.
2. **RELEASE-PACKAGE: проза говорит «17 version bumps», перечислено 16**; итог 32 = 16 + 16, т.е. верен для перечисленного. Фактически `chore(release)`-коммитов в делте **18** (16 из группы bumps + `580eb5d7` и `b2fbb234`, которые документ отнёс в первую группу). Слово «17» — опечатка в любой трактовке.
3. Остальные суммы пересчитаны и сходятся: VERIFY 39+12=51, CHECK-LOG 11, SYNC-OWNERSHIP 9, RULES 5, DIRECTIVES-SDD 14, DOCS 9, TESTS-ONLY 8, OTHER 5.

**Содержательные переклассификации, которые я бы сделал**

| sha | Сейчас | Предлагаю | Почему |
|---|---|---|---|
| `8358bf8b` | TESTS-ONLY / REL-PKG | **только REL-PKG** (или OTHER/infra) | Коммит меняет **ровно один файл — `package.json`** (`--test-concurrency=1`). Ни один тест-файл не тронут; ярлык «TESTS-**ONLY**» ложно подсказывает, что менялись тесты |
| `9af4db93` | VERIFY / TESTS-ONLY(fixture-integrity) | **VERIFY** (тест — побочный) | Ядро коммита — продуктовая инверсия фильтра `go list -e` (`golang-scope.logic.ts` +74/−7: drop-by-default → keep-by-default, whitelist из 4 классов, realpath-канонизация). Это исправление ложного зелёного, а не тестовая работа |
| `1060129d`, `7af8d29e` | TESTS-ONLY (+VERIFY) | оставить в VERIFY, **убрать из TESTS-ONLY** | Каждый содержит продуктовый фикс: `git grep --untracked` (иначе `//go:generate` в новом файле невидим) и второй паттерн module-fetch + переименование `ENV-FAIL`→`ENV_FAIL`. Название трека «TESTS-**ONLY**» противоречит собственному описанию строк |
| `bbee8efc` | SYNC-OWN / TESTS-ONLY | **только TESTS-ONLY** | Меняет один assert в `cli/__tests__/e2e/sync.e2e.test.ts`; ни строки sync-кода. Отнесение к SYNC-OWNERSHIP растягивает трек |
| `da3a53e9`, `185bea20` | OTHER (CI) | **отдельный трек CI** или REL-PKG | Это реализация § 6 спеки `infra-e2e` (7 джобов, пины toolchain, STRICT в CI) — полноценная инфраструктурная линия, а не «прочее»; в OTHER она соседствует с двумя prettier-коммитами и одним import-фиксом |
| `a336f17b` | VERIFY / SYNC-OWN | оставить, но пометка уже есть | Staging откачен через 2 коммита (`d6479748`); документ это отмечает — приемлемо |

Практическая рекомендация: переименовать `TESTS-ONLY` в `TESTS` (или `TESTS-HEAVY`) — состав трека тогда перестанет противоречить содержанию четырёх из восьми его строк.

## § Рекомендуемые правки к A1

Приоритет: **P1** — фактическая ошибка, влияющая на выводы аудита; **P2** — числовая/арифметическая; **P3** — косметика.

**P1**

1. **C9** — заменить «cascade categories coding/testing/infra» на фактические **пять**: `architecture | coding | infra | quality | testing`, со ссылкой на `_sdd-lib.sh:14` (`SDD_RULE_PATH_RE`) и на вызовы `check.sh:447,464`. Добавить оговорку, что шапка `check.sh:38` устарела относительно кода.
2. **Добавить MISSED-1…MISSED-7** как новые инварианты: канонический предикат rule-пути (C-новый), контентное обнаружение тикетов в `scan.sh:226-228` (C-новый), контракт кодов выхода `extract-section.sh` 0/2/3/5 с `ANCHOR_EMPTY` (C-новый), протокольные аксиомы `critic-protocol.xml` v1.2 с инверсией `AX_ISOLATION` (D-новый), порт `SyncDeps.rm` (S-новый), роспись секций в справке `sdd` (C-новый), узкое условие входа `^## 7\. Execution Log` (дополнить C7 — это дырка покрытия, а не деталь).
3. **R2** — добавить R6 про `audit.directive.xml:253,264` (`RULES_CASCADE_MISMATCH`, `MAJOR`, тег `unresolved-dependency`, требование полного транзитивного замыкания `<DependsOn>` в списке `Rules:` фазы) и явно зафиксировать противоречие директивы `:240` ↔ `:253/:264`.
4. **§ 4.2 шапка** — «all filed against `0.8.4-next.10`» неверно. Переписать: «#9, #11, #13, #15, #16, #17, #24 указывают `0.8.4-next.10`; #19–#24 указывают `main@62172906`; #24 — обе базы». Согласовать со сноской в конце § 4.2 (там пропущен #17).
5. **Строка 1 (`713fefd4`)** — убрать `critic-protocol.xml` из списка NEW (он существовал на `46c6d616`; здесь `+120/−30`). Оставить NEW только `interview-protocol.xml`, `visual-vocabulary.xml`. Стоит добавить ремарку, что сообщение самого коммита в этой части ошибочно.
6. **§ 0 / § 5 / § 6** — пометить RC-факты как снимок на `11291af5`: RC HEAD сейчас `3d5f66a7` (2026-09-07), RC-only 537, RC tree 2805. Числа 425/77/19 переигранной проверкой не изменились — это стоит указать прямо, чтобы читатель не пересчитывал.

**P2**

7. **Строка 70** — `ai/fw-draft/**` = **12** файлов (не 13); всего удалено `3763f3ce` — **18** файлов.
8. **§ 3.8** — «19 files» → **18**; `docs/sdd-flow.md` «~600 lines» → **487**.
9. **§ 2 SKILLS** — счётчик 13 → **14** (или удалить лишний sha).
10. **§ 2 RELEASE-PACKAGE** — «17 version bumps» → **16 перечисленных** (всего `chore(release)` в делте — 18).
11. **Объявить метрику «+N»** в начале § 1: сейчас это то `--stat`-итог (`3c28f776` gate-runner «+270» = +207/−63; `4a47b9e8` check.sh «+67» = +62/−5; `62172906` `_sdd-lib.sh` «+60», `check.sh` «+106»), то чистые insertions (`c008ae77` «+106», `bc7a4638` «−262», `62172906` sync-skills «+415», `5a237cd5` knowledge.xml «+42»). Достаточно одной сноски «+N = `--stat` total, если не указано иное» — либо привести всё к insertions.

**P3**

12. **V22 и строка 54** — исправить id фикстур на дословные: `any-extra-gates-**only**`, `any-**env-fail**-rule`. Полный список 7 на HEAD: `any-detected-everywhere`, `any-dirty-tree`, `any-env-fail-rule`, `any-extra-gates-only`, `any-ignored-workspace`, `any-no-gates-configured`, `any-with-node-stack`.
13. **Строка 60** — тест создан как `verify-delegation.test.ts`, переименован в `sdd-verify-delegation.test.ts` только в `7d48149d`.
14. **Строка 95** — путь тикета: `tasks/ai-skills/**sdd-skills/**sdd-skills.task-97.md` (как в § 5.1).
15. **C4** — 🛑/✅ **регистрируются как валидные токены** (`check.sh:531`), а не «не являются токенами».
16. **K5 и issue #16** — файлов SKILL.md с `DIRECTIVE ACTIVATED` **8** (7 в `ai/skills/` + `plugins/golang/skills/sdd-infra-golang/SKILL.md`); issue заявляет «Nine» — расхождение стоит явно проговорить. Отдельно: 7 самих SDD-директив тоже содержат эту строку, что делает формулировку «loaded directives forbid it» требующей уточнения.
17. **C14** — третий остаточный литерал `~/.claude/skills` в `ai/skills/README.md:8` (этот файл деплоится `sync-skills`) — добавить в перечисление и в графу «что осталось» issue #11.
18. **S2** — уточнить: обход вверх делает `packageRootOf`; `resolvePackageDir` сначала пробует `<projectRoot>/node_modules/gennady/<subdir>`, обход — фолбэк.
19. **R4** — заменить ссылку `plugins/golang/plugin.json` (там только `{id, kind, entry}`) на `resolve-plugins.ts` `DEFAULTS` (`:24+`) плюс сами файлы поверхностей: манифест намеренно молчит, поверхности приходят из конвенции.
20. **D8** — добавить ссылку на место, где живёт правило наследования модели (сейчас утверждение не покрыто ни одной из шести цитат).
21. **C6 / C12 / C2** — сдвиги на 1–2 строки: `norm_ts` объявлена на `:540` (цит. 538); правило «`ver` == исполненная команда» — на `:333` (цит. 332); блок DIRTY_TREE — 307–**331** (цит. 329).
22. **Строка 24 / § 3.8** — `34cbfc14` вводил «пять джобов»; на HEAD их 7 (документ это верно фиксирует в § 3.8 и в `3b286bda`) — стоит добавить в строку 24 «(→ 7 к моменту merge PR #5)», чтобы не читалось как расхождение.
23. **§ 0 авторы** — `k.lebedev` не является `%an` ни одного коммита; добавить фактический четвёртый вариант `Lebedev Konstantin` (merge-коммиты `c5fa924f`, `b4840ca1`, `d4d2f3a7`).
24. **§ 3.8** — уточнить, что файл self-executing команды review-verify лежит по пути `cli/cmd/review/review-verify.cmd.ts`, а `cli/cmd/review-verify/index.ts` — лишь реэкспорт; иначе проверяющий не найдёт файл по имени каталога.
25. **§ 3.2 C12** — попутно зафиксировать дефект main: в `phase-execution-protocol.xml` STEP_5 дважды пункт «2.» (строки 326 и 327).
