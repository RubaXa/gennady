# Часть I

# A2 — SDD v2 state inventory (branch `codex/sdd-v2-rc52-followup`, HEAD 11291af5)

Checkout audited (read-only): `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-v6` (referred to below as `<R>`). Merge-base with `main`: `46c6d616`. All paths are `<R>`-relative; `file:line` refers to this HEAD.

Written incrementally; sections appear in the order they were completed.

---

## 1. CLI surface

Dispatcher: `cli/gennady.ts`; every command lives in `cli/cmd/<name>/{index.ts,<name>.cmd.ts,<name>.types.ts,help.ts}`. Help output captured live with `node --import tsx cli/gennady.ts <cmd> --help`.

### 1.1 Command table

| Command | Purpose (help.ts) | Modes / flags | Inputs read | Outputs / exit codes | Hard blocks | Tests (`cli/cmd/<cmd>/__tests__`) |
|---|---|---|---|---|---|---|
| `sdd-check` (`cli/cmd/sdd-check/sdd-check.cmd.ts`, 1951 LOC incl. `phase-receipt-check.ts`) | "Mechanical audit of SDD artifacts (the deterministic half of audit)" | exactly one of `--task <ticket>`, `--spec <path> --authoring`, `--all [root]`, `--changed [root]`; `--authoring [--phase P<N>]`, `--format json` (`gennady.sdd-check.findings.v1`) | ticket/spec markdown under `specs/`; `ai/directives/knowledge.xml` (rule closure); test files named in §Test Coverage; git (`--changed` uses HEAD; `TASKS_APPEND_ONLY`, `CONSUMERS_RESOLVABLE`); `package.json` (receipt/coverage-gate checks, `sdd-check.cmd.ts` references it) | ESLint-style finding lines + summary; `0` clean (warnings allowed), `1` error(s), `4` bad invocation; `ERR_CLI_SDD_CHECK_READ_FAILED` on unreadable/symlinked selected files (fail closed) | `--authoring` refuses fabricated DONE (`[x]` with `<…>` placeholder); `PHASE_RECEIPT` requires "complete current CLI evidence" for every schema-aware phase | `sdd-check.cmd.test.ts`, `phase-receipt-check.test.ts`, `group-receipt.check.test.ts`, `fixtures/` |
| `sdd-extract` (386 LOC) | Slice one `<!--SECTION:NAME-->` block (or `#heading-anchor`) out of a ticket/spec | `<file> <NAME>` / `<file>#<slug>`; canonical names `META PHASES_OVERVIEW PHASE_P<N> PHASE_P<N>_FIX BDD VERIFICATION TEST_COVERAGE EXECUTION_LOG` | one markdown file | section body on stdout; `1` not found, `2` anchor absent/empty, `3` markers unbalanced/duplicated, `4` bad invocation | — | `sdd-extract.cmd.test.ts` |
| `sdd-log` (1443 LOC) | Append events / atomically complete a verified phase or spec draft | `round`, `line [--phase]`, `close`, `phase <P-ID>`, `handoff`, `blocker --axiom --unblock --phase`, `resolved --phase`, `complete --phase`, `<spec> authoring-complete`, `<group> audit-receipt <verdict>`, `<group> review-receipt <verdict>`; file-backed `--content-file/--payload-file` under `.claude/tmp/` (≤32768 bytes, regular non-symlink) | ticket markdown; phase receipt (from `sdd-verify`) for `complete`; spec + `sdd-check --spec --authoring` result for `authoring-complete`; group membership + git HEAD for `*-receipt` | writes into the ticket/spec; `0` written, `1` unwritable, `2` missing receipt/phase state/section, `4` bad invocation | `complete` requires the CLI-owned `sdd-verify` receipt + current-Round skeleton + typed 4-field Handoff; `audit-receipt/review-receipt` refuse unless every group member is `[x] DONE`, bind to HEAD, write forge-resistant `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` block; placeholder content → exit 2 | `sdd-log.cmd.test.ts`, `group-receipt.cmd.test.ts` |
| `sdd-migrate` (424 LOC + `shared/sdd/migration-*.ts`) | V1→V2 migration, deterministic steps | `anchors <ticket>|--all [--write]`, `plan [root] [--write|--verify]`, `ids [root] --map <tsv>|--from-plan [--write]`, `move [root] --scope <s> [--write]` | v1 `tasks/**/*.task-*.md` (anchors; `move` discovers tickets by content Task-ID — commit 933a13d8), `specs/`, `migration/**/*.migration.md` | dry-run report by default; `0` report, `1` verify findings / invalid map / blocked move, `4` bad invocation | `plan --verify` is the deterministic gate: inventory drift, map coverage, action vocabulary, slug grammar, repo-wide slug collisions; `ids --write` gates on zero old IDs | `sdd-migrate.cmd.test.ts` |
| `sdd-new` (1056 LOC + `shared/sdd/templates.ts` 2051 LOC) | Scaffold one v2 artifact from the shared template registry | `<kind> --scope [--owner infrastructure-flat\|scope-bootstrap\|module] [--module] [--id <ACR-slug>] [--slug] [--out]`, `--list`, `<kind> --manifest`; kinds `product library infrastructure interface module task portal research module-index scope-index project-index` | portal + owning spec (Module Map ↔ module-spec closure proof for tasks), `ai/directives/knowledge.xml` (prints rule ID + href tuples), typed contract anchors of owning spec (≤40, duplicate slugs fail) | created path + section manifest table; `0` ok, `1` exists/write failed/invalid rule registry, `4` bad invocation | refuses to overwrite; task owner proven against scope type; every option single-use | `sdd-new.cmd.test.ts`, `fixtures/` |
| `sdd-orient` (151 LOC + `core/`, `render/`) | Depth-1 design-graph neighbourhood of one spec (navigates specs, not code) | `<spec-path>` or `--scope <name>` | portal `specs/README.md`, `.spec.md` (v2 SECTION and legacy numbered headings) | portal / neighbours / consumers lists; `0` ok, `4` bad invocation or unresolved | — | 8 test files (`build-neighbourhood`, `parse-module`, `parse-scope`, `render-neighbourhood`, `resolve-target`, `sdd-orient.cmd`, `spec-kind`, `spec-sections`) |
| `sdd-state` (609 LOC) | Deterministic snapshot of project state for the router | `[project-root]`; `--probe` accepted as no-op | `specs/README.md` portal, `specs/**` (module-spec count, spec-schema), `specs/3-tasks.md` rollup, `tasks/` (FLOW_VERSION v1 detection via `shared/sdd/flow.ts`), **`package.json` scripts** via `gatherReadinessInput` (`sdd-state.cmd.ts:10`), `node_modules/.bin/gennady`, repo probe (`shared/sdd/probe.ts`: CODE/INFRA dirs, configs) | `FLOW_VERSION`, `PORTAL`, `[READINESS]` (AUTHORING_SCOPE/AUTHORING_READY/EXECUTION_READY/GATE_QUEUE), `[SCOPES]`, `[SPEC_SCHEMA]`, `NEXT`, `[PROBE]`, `[SUMMARY]`, plus the 5-rung ladder card (`shared/sdd/ladder.ts`); `0` ok, `2` bad root, `4` bad invocation | emits `FLOW_VERSION=v1; migrate before v2 scaffold` diagnostic (`sdd-state.cmd.ts:180`) | `sdd-state.cmd.test.ts` |
| `sdd-sync` (410 LOC) | Propagate ticket Status into `*.3-tasks.md` trackers | `<ticket> [index.3-tasks.md ...]`; exact repo-relative regular files only | ticket Meta (Task-ID, Status); owning trackers discovered upward module→scope→project | per-index report `updated/in-sync/no-row/no-table/unreadable`; `0`, `1` ticket unreadable/verify failed, `2` Meta unparseable, `4` | rewrites only the Status cell; verifies write persisted | `sdd-sync.cmd.test.ts` |
| `sdd-task` (1524 LOC) | Ticket planning surface for the execute orchestrator | `[project-root]` (execution map), `<ticket> [--phase P<N>]`, `--audit-group`, `--group-scope`, `--task-scope` | all tickets (`collectTicketCorpus`), trackers, portal (`parseScopes`), **`package.json` scripts** (`sdd-task.cmd.ts:19,491-499`), git HEAD (attributable changes for group scope; unborn HEAD falls back to declared files), phase receipts | execution map with `EXECUTION_READY=yes\|no`, `GATE_QUEUE=…`, `pickable`/`blocked`; per-phase READ/CREATE manifest, `[HANDOFF]`, `coverage-gates:` line; `0`, `1` unreadable/invalid ticket, `2` not a ticket / unknown phase, `4` | **Readiness gating** `sdd-task.cmd.ts:453-484`: any phase whose kind ∉ `['bootstrap','config','doc']` (allow-list) is refused when `checkReadiness(...).executionReady` is false, unless `phaseOwnsMissingReadinessGate(queue, taskId, phaseId)` (the ticket is in GATE_QUEUE and owns the missing gate). Execution map: `pickable = readiness.executionReady ? graphPickable : queuePickable` (`:123`). Dependency closure must be `[x]` with current receipts; cycles fail closed; malformed 3-column Verification table fails before any output | `sdd-task.cmd.test.ts` |
| `sdd-verify` (2856 LOC: `phase-context.ts`, `phase-run.ts`, `repair-adapters.ts`, `workspace-mutation.ts`, `phase-receipt-validation.ts`) | Run the verification ladder (cheapest & most important first) | `--task <ticket> --phase <P>` (profile derived from phase kind) or `--profile full` | ticket phase (kind, Target Files, Deleted Files, owning spec), **`package.json` scripts** (`resolveProjectScriptName`, `isDeclaredArgumentForwardingRepairBrick`), workspace snapshot (excludes `.git` and `node_modules`), coverage artifact dir | `[sdd-verify] ✅ ALL PASS (N/M)` + per-step lines; phase mode writes a structured receipt into Execution Log (atomic temp+rename); `0`, `1` gate/phase context failed, `4` bad invocation | Profiles (`shared/sdd/phase-verification-plan.ts:43-64`): `setup`→`fix·type-check·test` all optional; `code`→`fix·type-check·test`; `test`(coverage owner)→`fix·type-check·test:coverage`; `full`→`type-check·test:coverage·lint·format·yagni` read-only. Non-`setup` profiles require declared argument-forwarding repair bricks `format:fix`/`lint:fix` (`sdd-verify.cmd.ts:433-451`); any persistent workspace mutation outside Target Files fails, no receipt; green `test:coverage` without a fresh adapter report is reddened (`:185-208`) | `sdd-verify.cmd.test.ts`, `phase-context.test.ts`, `phase-run.test.ts`, `workspace-mutation.test.ts` |
| `yagni` (666 LOC + `shared/sdd/yagni.ts`) | Flag added/changed symbols with <2 production usages | `[root]` | git HEAD diff + untracked; whole-repo usage count; `specs/` Decision Log for `Usage Waiver` ids | `0` clean, `1` findings, `2` invalid root/git scope, `4` bad argv | non-git/corrupt root fails closed | `yagni.cmd.test.ts`, `yagni-index.test.ts` |
| `sync` (558 LOC) | Mirror `ai/directives/` from installed npm package into project | `[subdirs...] [--dry-run]` | package `ai/directives/` via `resolvePackageDir` (requires `node_modules/gennady`), target `<cwd>/ai/directives` | added/updated/unchanged/**deleted** entries + warnings; exit `0`/`1` | package-owned mirror: deletes target files absent from source within package-owned subdirs (`sync-core.ts:220-243`); only `architecture` excluded (`EXCLUDED_ENTRIES`, `sync-core.ts:16`). **No special handling for `knowledge.xml`** (grep of `cli/cmd/sync/*.ts` and `shared/common/sync/*.ts` for `knowledge` → no hits) | `sync-core.test.ts`, `sync-formatter.test.ts`, `sync.cmd.test.ts` |
| `sync-skills` (895 LOC; **no help.ts** → "No help available") | Mirror `ai/skills/` → `<cwd>/.claude/skills`; runs a directives sync first (`sync-skills.cmd.ts:67-100 syncDirectivesFirst`) | positional skill names, `--dry-run` | package `ai/skills`, target `.claude/skills` | entries incl. `deleted`/`deleteFailed` | **No manifest**: prunes by comparing source vs target — every target skill dir not in source is an orphan (`sync-skills-core.ts:395-403`), and files inside a kept skill that are absent from source are deleted (`:381-391`). Only dotfiles + `.DS_Store` excluded (`EXCLUDED_NAMES`, `:22`); there is no test-exclusion logic — `ai/skills/` contains no `__tests__`/`*.test.*` (find returned nothing) so none is needed today | `sync-skills-core.test.ts`, `sync-skills-formatter.test.ts`, `sync-skills.cmd.test.ts`, `sync-skills.types.test.ts` |
| `lint` (995 LOC, `checks/`, `utils/`, `lint-source-policy.ts`) | DbC/convention linter for TypeScript | `[paths...] --autofix --include-tests --staged --verbose --max-invariants --max-words --max-header-words --max-contract-words --max-region-comments --exclude --include-all --spec=<module-spec> --inventory-reverse <dir>` | `.ts/.tsx` sources (tree-sitter), module spec Entity Inventory | findings; `4` on bad option values; `ERR_CLI_LINT_READ_FAILED` for symlinks | "When no paths or --staged are provided, lints nothing" | 8 test files (`anchor`, `anchor-thin`, `dbc-contract`, `disables`, `file-header`, `language`, `lint.cmd`, `resolve-targets`) |
| `testcov` (2101 LOC) | Adapter-backed coverage tree/gate | `[path] --files --run --check --min=<pct> --json --flat --context/-c --color` | `package.json` (producer auto-detect: vitest/jest/node:test+c8), `coverage/coverage-final.json` (istanbul) | tree/flat/JSON; `--min` exit 0/1; `--check` 0/1; `4` bad argv | fail-closed adapter selection: exactly one adapter must match; **only `istanbul-js` installed** — help states "iOS, Android, and Go adapters are not installed/supported yet" (`cli/cmd/testcov/help.ts`) | `coverage-adapter-registry.test.ts`, `coverage-threshold.test.ts`, `testcov.cmd.test.ts` |
| `agents-rules` (54 LOC; no help.ts) | Print `cli/cmd/orient/README.md` from the installed package | none | requires `node_modules/gennady` (`agents-rules.cmd.ts:19`) | README on stdout; exit 0/1 | — | `agents-rules.cmd.test.ts` |

### 1.2 npm/Node-specific coupling (what a non-Node stack hits today)

| Location | Coupling |
|---|---|
| `shared/sdd/readiness.ts:15-24` | `REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix']` — exact **npm script names**; `type-check` alias `typecheck` only (`:29-31`) |
| `shared/sdd/readiness.ts:596-609` | `gatherReadinessInput(root)` reads **only** `<root>/package.json` `scripts`; `detectGennady` (`:566-587`) requires `node_modules/.bin/gennady` or `package.json name === 'gennady'` |
| `shared/sdd/readiness.ts:101-132` | read-only/mutating detection hard-codes `eslint --fix`, `prettier --write`, `--autofix`, `--write/--fix` |
| `shared/sdd/readiness.ts` `lintReachesGennady` (`:176`) | `lint` must reach `gennady` (via `npm run`/pnpm/yarn hops) — readiness `ready` requires it |
| `shared/sdd/scripts.ts` | classifies `package.json` scripts (tsc/eslint/jest/vitest/prettier/biome patterns); consumer `sdd-state` |
| `shared/sdd/ladder.ts:36-39,68` | Infrastructure rung = `packageJsonPresent && typecheck && test && lint` |
| `shared/sdd/phase-verification-plan.ts:270` | gate command is literally `` `npm run ${script}` `` |
| `cli/cmd/sdd-verify/sdd-verify.cmd.ts:225-226` | runs `{command:'npm', args:['run', scriptName]}` or the gennady gate |
| `cli/cmd/sdd-verify/repair-adapters.ts:99,120` | repair adapters spawn `npm` |
| `shared/sdd/phase-receipt.ts:95-320` | receipt parser understands `npm`/`pnpm`/`yarn` invocations, builtins and root-only options |
| `cli/cmd/sdd-task/sdd-task.cmd.ts:491-499` | reads `package.json` scripts for the phase verification plan |
| `cli/cmd/testcov/istanbul-coverage-adapter.ts` | only adapter; producers detected from `package.json` |
| `cli/cmd/sync/sync-core.ts:65`, `agents-rules.cmd.ts:19` | require `node_modules/gennady` (local dev dependency) |
| `shared/sdd/yagni.ts` / help | tree-sitter exact for `.ts/.tsx`; grep-approximate fallback for js/py/go/rb/java |
| `gennady.yaml` | **does not exist anywhere in v2 code** (only mention: `ai/flow-eval/docs/roundtrip-wall3-assessment.md`) — there is no project-level config file; all stack facts come from `package.json` |


---

## 2. `shared/sdd/*` modules (48 modules, 15 743 LOC; 62 test files in `shared/sdd/__tests__/`)

### 2.1 One-line index (purpose from `@file:`, consumers from `@consumers:`; test = `shared/sdd/__tests__/<name>.test.ts` unless noted)

| Module | LOC | Purpose | Key exports | Consumers | Test |
|---|---|---|---|---|---|
| `anchor-inject.ts` | 143 | Inject `<!--SECTION:NAME-->` anchors into a v1 ticket (pure, migration) | `injectAnchors`, `legacyHeaderBody`, `scaffoldExecutionLog` | sdd-migrate | `anchor-inject.test.ts` |
| `audit-group.ts` | 568 | Resolve a ticket's audit group (every ticket owned by one spec) + bound its git changes | `resolveAuditGroup`, `resolveOwningSpec`, `boundGroupChangedFiles`, `validateTicketReviewPaths`, `ticketTargetFiles`, `ticketHandoffArtifacts` | sdd-task | `audit-group.test.ts` |
| `bdd-coverage.ts` | 296 | Compare §Test Scenario Coverage canonical case names vs real `it()/test()` names (BDD_COVERAGE) | `checkBddCoverage`, `checkBddRequirementTraceability`, `parseTestCoverage`, `extractTestCaseNames`, `checkTestFileAmbiguity` | sdd-check | `bdd-coverage.test.ts` |
| `capability-adapter.ts` | 251 | "Platform-neutral" capability adapter registry for scaffold feasibility — **only Node/TS adapters shipped** (`node`, `typescript`, `typescript-quality`; `:69-190`) | `NODE_NPM_CAPABILITY_ADAPTER`, `TYPESCRIPT_CAPABILITY_ADAPTER`, `TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER`, `DEFAULT_CAPABILITY_ADAPTER_REGISTRY`, `deriveCapabilityAdapterContract` | project-feasibility, tests | (covered via `project-feasibility.test.ts`; no dedicated test) |
| `check.ts` | 2736 | Pure mechanical checks (anchor balance, structure, status, exec-log integrity, spec structure, graphs, research) | see §2.3 | sdd-check, sdd-task, audit-group, migration-plan | `check.test.ts` + 22 `check-*.test.ts` |
| `consumers-resolvable.ts` | 91 | `@consumers:` header resolution (CONSUMERS_RESOLVABLE, warn-only) | `checkConsumersResolvable`, `parseConsumersHeader` | sdd-check | `consumers-resolvable.test.ts` |
| `finding.ts` | 17 | Shared `Finding` shape | `Finding` | check, requirement-budget | — |
| `flow.ts` | 48 | v1/v2 detection: `tasks/` directory ⇒ v1 (`:22-28`); per-scope: `tasks/<scope>/` gone AND `specs/<scope>/<scope>.3-tasks.md` exists ⇒ v2 (`:38-48`) | `detectFlowVersion`, `detectScopeFlowVersion` | sdd-check, sdd-state | `flow.test.ts` |
| `gate-queue.ts` | 475 | Structural ownership of missing readiness gates (GATE_QUEUE) shared by state/task/verify | `checkAuthoringReadiness` (`:207`), `queuedInfraGateTicketIds` (`:359`), `phaseOwnsMissingReadinessGate` (`:469`) | sdd-state, sdd-task, sdd-verify phase-context | `gate-queue.test.ts` |
| `group-receipt.ts` | 324 | CLI-owned group-completion receipt ("group audited/reviewed, verdict V, at git-ref R") | `deriveGroupState`, `buildGroupReceipt`, `upsertGroupReceipt`, `groupReceiptIssue`, `checkGroupReceipts`, `GROUP_RECEIPT_MARKER` | sdd-log (writer), sdd-check (gate) | `group-receipt.test.ts` |
| `id-replace.ts` | 245 | Deterministic Task-ID replacement for migration (`ID_REPLACE_ZONES`) | `parseIdMap`, `idMapFromPlan`, `replaceIds`, `findRemainingOldIds` | sdd-migrate | `id-replace.test.ts` |
| `inventory.ts` | 41 | Parse module spec Entity Inventory table | `parseEntityInventory` | lint InventorySyncCheck, sdd-orient | `inventory.test.ts` |
| `ladder.ts` | 128 | 5-rung readiness card (Портал/Скоупы/Модули/Инфраструктура/Задачи) | `renderLadder` | sdd-state | `ladder.test.ts` |
| `legacy-headings.ts` | 54 | Fuzzy numbered-heading section extraction for pre-marker specs | `legacySpecSectionBody`, `hasAnySectionMarker` | sdd-orient | `legacy-headings.test.ts` |
| `markdown-fence.ts` / `markdown-table.ts` | 27/69 | Fence state / table-row lexer | `nextMarkdownFence`, `lexMarkdownTableRow` | requirement-budget, ticket | — (indirect) |
| `mermaid-check.ts` | 40 | Async real-grammar mermaid validation (`SDD_DIAGRAM_INVALID`) | default async fn | sdd-check | `mermaid-check.test.ts` |
| `migration-move.ts` | 503 | v1→v2 move of one scope: git-mv tickets, scaffold `*.3-tasks.md`, remove `tasks/<scope>/` | `planScopeMove`, `executeScopeMove`, `rewriteMovedLinks`, `renderModuleIndex`, `renderScopeIndex` | sdd-migrate | `migration-move.test.ts` |
| `migration-plan.ts` | 781 | Migration plan layer: scan repo into per-spec units, scaffold `migration/**/*.migration.md`, verify (drift/coverage/slug collisions); `UNIT_STATUSES = PLANNED|MAPPED|APPROVED|DONE` (`:64`), `SECTION_ACTIONS = keep|rename|merge|split|create|drop` (`:70`), `UNMAPPED` sentinel (`:73`) | `scanMigrationUnits`, `scaffoldUnitFile`, `scaffoldPlanReadme`, `verifyUnitFile`, `verifyMigrationPlan`, `mapHeadingToSection` | sdd-migrate | `migration-plan.test.ts` |
| `module-specs.ts` | 565 | Scope type, Module Map members, module-spec closure; task ownership kinds | `SCOPE_TYPES`, `TASK_OWNER_KINDS`, `resolveScopeDecomposition`, `resolveTaskOwnership`, `countModuleSpecs` | sdd-state, sdd-new, sdd-check | `module-specs.test.ts` |
| `phase-dependencies.ts` | 64 | Phase dependency preflight (closure `[x]`, receipts, cycles) | `checkPhaseDependencies` | sdd-task, sdd-verify | `phase-dependencies.test.ts` |
| `phase-receipt.ts` | 1421 | Structured CLI-owned phase receipts `<!--SDD_PHASE_RECEIPT:P<N>-->` + JSON (`:84-86`); fingerprints plan (`planState`), env (script bodies reachable, npm/pnpm/yarn-aware `:95-320`), target bytes (`targetState`, per-path `targetEvidence`) | `parsePhaseReceipts`, `formatPhaseReceipt`, `phaseReceiptPlanState`, `phaseVerificationEnvironmentState`, `phaseReceiptTargetState` | sdd-verify, sdd-check | `phase-receipt.test.ts` |
| `phase-verification-plan.ts` | 395 | Canonical profile from phase kind + ladder gate names; `resolvePhaseVerificationPlan` (states `DECLARED/PREREQUISITE_PENDING/PREREQUISITE_MISSING/COMMAND_MISSING/CONFIGURED/PROVEN`) | `phaseProfileForKind` (`:29`), `verificationGateNames` (`:43`), `requiredVerificationGateNames` (`:58`), `resolvePhaseVerificationPlan`, `markPhaseVerificationProven` | sdd-verify, sdd-task, scaffold critic | `phase-verification-plan.test.ts` |
| `portal.ts` | 302 | Parse portal Scopes table + Scope-Graph edges | `parseScopes`, `parseScopeGraphEdges`, `renderScopeGraph` | sdd-state, sdd-check, sdd-orient | `portal.test.ts`, `portal-check.test.ts` |
| `probe.ts` | 97 | Coarse code/infra heuristics — **Node-only**: `CODE_EXT = /\.(js|jsx|ts|tsx)$/` (`:11`), `CONFIG_FILES` = tsconfig/eslint/prettier/vitest/vite/jest only (`:15-35`) | `probeRepo` | sdd-state | `probe.test.ts` |
| `project-feasibility.ts` | 735 | Project bootstrap proof from V2 specs' Bootstrap Requirements table; scaffold draft-plan DAG proof (Gate 1) and materialization check | `checkProjectFeasibility` (`:277`), `deriveProjectFeasibilityContext` (`:326`), `checkScaffoldDraftPlan` (`:379`), `checkScaffoldPlanMaterialization` (`:681`), `projectSpecDigest` | sdd-check, sdd-state, scaffold directives | `project-feasibility.test.ts` |
| `readiness.ts` | 609 | Exact-match readiness of required npm scripts (see §2.2) | `REQUIRED_SCRIPTS`, `checkReadiness`, `gatherReadinessInput`, `resolveProjectScriptName`, `isDeclaredArgumentForwardingRepairBrick`, `isVacuousScript` | sdd-state, sdd-task (+ sdd-verify, phase-verification-plan, phase-receipt) | `readiness.test.ts` |
| `requirement-budget.ts` | 258 | Requirements section lazy-list/atomic-entry budgets | `checkRequirementBudgetsAgainstBaseline`, `REQUIREMENT_ENTRY_MAX_LINES` | check, sdd-check | `check-requirement-budgets.test.ts` |
| `requirement-id.ts` | 123 | `<ACR>-REQ-<N>` / `<ACR>-DL-<N>` grammar + acronym derivation | `REQ_ID_GRAMMAR`, `DL_ID_GRAMMAR`, `LEGACY_DL_ID_GRAMMAR`, `deriveSpecAcronym`, `validateSpecEntryId` | check.ts | `requirement-id.test.ts` |
| `rules-cascade.ts` | 82 | Transitive `<DependsOn>` closure of a phase's `Rules:` list | `normalizeRulePath`, `parseRuleDependsOn` (regex `<DependsOn>…</DependsOn>` with `- path` bullets, `:41-45`), `checkRulesCascadeClosure` (`:56`) | sdd-check | `rules-cascade.test.ts` |
| `scripts.ts` | 120 | Classify `package.json` scripts into gate classes | `classifyScript`, `selectGates` | sdd-state | `scripts.test.ts` |
| `section.ts` | 219 | Extract `<!--SECTION:NAME-->` blocks and heading sections | `extractSection`, `extractHeadingSection`, `SECTION_NAME_REGEX` | sdd-extract, sdd-orient, everything | `section.test.ts` |
| `session-boundary.ts` | 24 | Appends `[!!! SESSION BOUNDARY — MUST REMEMBER !!!] WORKING_DIR=… TMP_DIR=<root>/.tmp` + Russian reminder to agent-facing outputs | `appendSddSessionBoundary` | sdd-state, sdd-task, sdd-new | `session-boundary.test.ts` |
| `spec-schema.ts` | 192 | Read-only structural-schema diagnosis of specs before scaffold; `SPEC_SCHEMA_VERSION='sdd-v2'` (`:9`); `BOOTSTRAP_REQUIREMENTS_COLUMNS = Requirement|Kind|Owner|Resolution|Readiness Gates|Gate Artifacts` (`:12-19`) | `diagnoseProjectSpecSchemas` | sdd-state, sdd-scaffold | `spec-schema.test.ts` |
| `task-authoring-literals.ts` | 141 | Copy-ready literals printed after `sdd-new task` (rule tuples from knowledge.xml, deferred test ownership row); `CONTRACT_ANCHOR_LIMIT` | `loadRuleRegistry`, `parseRuleRegistry`, `renderTaskAuthoringLiterals` | sdd-new | `task-authoring-literals.test.ts` |
| `task-id.ts` | 231 | Task-ID grammar `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$` (`:17`), `SLUG_MAX_LEN = 8` (`:20`, slug = everything after first `-`, hyphens included); project-wide collection from `*.task.<ID>.md` under `specs/` + `**Task-ID:**` Meta; prefix-clash detection | `validateTaskId`, `looksLikeTaskId`, `collectTaskIds`, `checkIdConflicts`, `findPrefixClashes`, `suggestTaskId` | sdd-new, check.ts | `task-id.test.ts`, `check-taskid-grammar.test.ts` |
| `tasks-append-only.ts` | 48 | `@tasks:` header never drops an id present at HEAD (`N/A` ignored) | `parseTasksHeader`, `checkTasksAppendOnly` | sdd-check `--changed` | `tasks-append-only.test.ts` |
| `templates.ts` | 2051 | Single source of truth for v2 skeletons (product/library/infrastructure/interface/module/task/portal/research/indexes) — backs `check.ts` required/fold lists and `sdd-new` | `TEMPLATES`, `ARTIFACT_KINDS`, `SCOPE_KINDS`, `loadBearingSections`, `foldSections`, `resolveNextSteps` | check.ts, sdd-new | `templates.test.ts`, `skeleton-*.test.ts` |
| `ticket-resolve.ts` | 212 | Resolve ticket arg (path or bare Task-ID), collect ticket corpus | `collectTicketCorpus`, `resolveTicketArg` | sdd-task, sdd-log, sdd-check, sdd-sync | (via cmd tests) |
| `ticket.ts` | 478 | Pure ticket parsers (Meta, Phases Overview, phase bodies, Verification table, coverage policy) | `parseMetaInfo`, `parsePhasesOverview`, `parsePhaseDetail`, `parseVerificationTable`, `parseTicketCoveragePolicy` | sdd-task etc. | `ticket.test.ts` |
| `tool-guidance.ts` | 73 | Schema-first failure envelope `[tool] CODE: headline / object / reason / action / example` (`:57-72`) | `normalizeSddToolFailure`, `SddToolGuidance` (tool ∈ sdd-new/sdd-check/sdd-log/sdd-task) | sdd-new, sdd-check, sdd-log, sdd-task | (via cmd tests) |
| `tracker.ts` | 259 | Parse ticket Meta and surgically update tracker Status cell; rollup progress | `parseMeta`, `updateTrackerStatus`, `parseTrackerRows`, `sumRollupProgress` | sdd-sync, sdd-state | `tracker.test.ts` |
| `yagni.ts` | 207 | Pure YAGNI logic (<2 usages; `Usage Waiver` with optional `<ACR>-DL-N` or `(external: …)`) | `checkYagniUsage`, `parseUsageWaiver`, `stripBarrelReexports`, `ERR_CLI_YAGNI_UNDERUSED`, `ERR_CLI_YAGNI_WAIVER_DECISION_MISSING` | yagni.cmd | `yagni.test.ts` |
| `rc-recovery-invariants.test.ts`, `skeleton-format-differential.test.ts`, `check-spec-authoring-corpus.test.ts` | — | cross-module invariant tests | | | |

### 2.2 `readiness.ts` in detail

- `REQUIRED_SCRIPTS` (`shared/sdd/readiness.ts:15-24`): `type-check`, `test`, `test:coverage`, `format`, `format:fix`, `lint`, `lint:fix`, `fix`. Alias: `type-check` ↔ `typecheck` only (`:29-31`).
- `ReadinessInput = { packageJsonPresent, scripts, gennadyAvailable }` (`:56-63`); `gatherReadinessInput(root)` (`:596-609`) parses `<root>/package.json` → `scripts`; `detectGennady` (`:566-587`): `node_modules/.bin/gennady` exists OR package `name === 'gennady'`.
- `checkReadiness` (`:446-556`) → `ready` iff: package.json present ∧ all 8 scripts real (non-empty) ∧ `lint` reaches `gennady` (hop-following `npm run`/pnpm/yarn) ∧ `format`, `lint` (and `check` if present) contain no write switch (`WRITE_SWITCH_PATTERN` `:101`: `eslint … --fix`, `prettier … --write`, `--autofix`) ∧ `format:fix`/`lint:fix` carry a mutating switch (`MUTATING_SWITCH_PATTERN` `:120`) ∧ each fixer is a stub or declares an argument-forwarding prefix without a broad root/glob ∧ `fix` runs `format:fix` then `lint:fix` ∧ gennady installed.
- Levels (`:66`, `:532`): `not-ready` (¬ready) / `provisional` (ready but ≥1 script vacuous: echo-stub or `|| true`) / `ready`. `executionReady ⇔ level === 'ready'`. `missingGates` (`:533-556`) is the de-duplicated list consumed by `gate-queue.ts` for bootstrap ownership.

### 2.3 `check.ts` — every `SDD_*` finding code and trigger

Ticket checks (`checkTicket`, `check.ts:422-599`): `SDD_ANCHOR_UNBALANCED` (:431 unpaired SECTION markers) · `SDD_SECTION_OVERLAP` (:434) · `SDD_MISSING_META` (:443) · `SDD_MISSING_EXECUTION_LOG` (:448) · `SDD_MISSING_TASK_ID` (:459) · `SDD_STATUS_UNPARSEABLE` (:463) · `SDD_FABRICATED_DONE` (:485 `[x]` line with `<…>` placeholder) · `SDD_DONE_WITH_ACTIVE_BLOCKER` (:493) · `SDD_BLOCKER_OPEN` (:498) · `SDD_DONE_WITH_PLACEHOLDERS` (:509) · `SDD_PHASE_DEP_UNRESOLVED` (:524) · `SDD_PHASE_DAG_CYCLE` (:529) · `SDD_PHASE_SECTION_MISSING` (:538) · `SDD_PHASE_SECTION_ORPHAN` (:544) · `SDD_EXECUTION_LOG_ROUND_MISSING` (:551) · `SDD_EXECUTION_LOG_PHASE_MISSING` (:559) · `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (:564) · `SDD_EXECUTION_LOG_PHASE_ORPHAN` (:571) · `SDD_DONE_PHASE_UNCHECKED` (:581).

Ticket authoring (`checkTicketAuthoringStructure`, `:599-895`): `SDD_AUTHORING_SECTION_REQUIRED` (:636) · `SDD_AUTHORING_META_INCOMPLETE` (:677) · `SDD_AUTHORING_PHASES_INVALID` (:694) · `SDD_AUTHORING_PHASE_NOT_FOUND` (:701) · `SDD_AUTHORING_PHASE_DEPENDENCY` (:719, :770) · `SDD_AUTHORING_PHASE_REQUIRED` (:732) · `SDD_AUTHORING_PHASE_INCOMPLETE` (:752) · `SDD_AUTHORING_BDD_INCOMPLETE` (:789) · `SDD_AUTHORING_VERIFICATION_INCOMPLETE` (:800) · `SDD_AUTHORING_TEST_COVERAGE_INCOMPLETE` (:811) · `SDD_AUTHORING_BDD_MAPPING` (:828) · `SDD_AUTHORING_BDD_CONTRACT` (:841) · `SDD_AUTHORING_BDD_PHASE` (:865) · `SDD_AUTHORING_PLACEHOLDER` (:874) · `SDD_TASK_ID_GRAMMAR` (:888-901).

BDD: `SDD_BDD_MISSING_NEGATIVE` (`checkBddNegativeScenario` :402 — no explicit negative/failure scenario).

Requirement / Decision-Log IDs: `SDD_REQ_ID_GRAMMAR` (:962) · `SDD_REQ_ACRONYM_MISMATCH` (:970) · `SDD_REQ_ID_COLLISION` (:985) · `SDD_REQ_MISSING_UNHAPPY` (:1019 requirement without unhappy path) · `SDD_DL_ID_PLACEHOLDER` (:1100) · `SDD_DL_LEGACY_ID` (:1110 `D-NNN`) · `SDD_DL_ID_GRAMMAR` (:1122) · `SDD_DL_ACRONYM_MISMATCH` (:1133) · `SDD_DL_ID_COLLISION` (:1148).

Portal (`checkPortal` :1207): `SDD_PORTAL_SPEC_MISSING`, `SDD_PORTAL_ORPHAN_SPEC`, `SDD_PORTAL_DANGLING_DEP`, `SDD_PORTAL_GRAPH_CYCLE`. Legacy: `SDD_LEGACY_TICKET_UNANCHORED` (:1330). Task graph (`checkTaskGraph` :1370): `SDD_TASK_ID_COLLISION` (:1385) · `SDD_TASK_ID_PREFIX_CLASH` (:1401) · `SDD_DEP_UNRESOLVED` (:1412) · `SDD_DAG_CYCLE` (:1426). Trackers (`checkTrackers` :1443): `SDD_TRACKER_MISSING_ROW` (:1466) · `SDD_TRACKER_STATUS_DRIFT` (:1477) · `SDD_TRACKER_ORPHAN_ROW` (:1490).

Spec language/structure: `SDD_LANGUAGE_CALQUE` (:1702) · `SDD_ANCHOR_UNBALANCED` (:1762) · `SDD_SECTION_OVERLAP` (:1769) · `SDD_SCOPE_BLOATED` (:1787) · `SDD_MODULE_OVERSIZED` (:1802) · `SDD_MODULE_SPEC_VERBOSE` (:1809) · `SDD_SPEC_SECTION_MISSING` (:1829, :1851, :1957, :1975) · `SDD_NO_DIAGRAM_BLOCK` (:1866) · `SDD_DIAGRAM_BLOCK_EMPTY` (:1874) · `SDD_SECTION_NOT_FOLDED` (:1890) · `SDD_SECTION_TOO_LONG` (:1915) · `SDD_AUTHORING_PLACEHOLDER` (:1987) · `SDD_AUTHORING_HEADING_LEVEL` (:2035) · `SDD_REQUIREMENT_ID_MISSING` (:2051) · `SDD_AUTHORING_LIST_REQUIRED` (:2070). Tables (`checkTableCells` :2144): `SDD_TABLE_TOO_MANY_COLUMNS`, `SDD_TABLE_CELL_HAS_BR`, `SDD_TABLE_CELL_TOO_LONG`, `SDD_TABLE_CELL_MULTI_SENTENCE`. Graphs: `SDD_SCOPE_DEP_UNDECLARED` (:2241) · `SDD_MODULE_DAG_CYCLE` (:2263) · `SDD_MODULE_NOT_IN_INDEX` (:2351) · `SDD_PARENT_MODULE_NOT_INDEX` (:2366). Diagrams: `SDD_DIAGRAM_CAPTION_MISSING` (:2497) · `SDD_DIAGRAM_CAPTION_REQ_UNKNOWN` (:2512) · `SDD_SCOPE_NO_DATA_FLOW` (:2559) · `SDD_MODULE_NO_CALL_CHAIN` (:2612). Research: `SDD_RESEARCH_DISPOSITION_MISSING` (:2663) · `SDD_RESEARCH_DISPOSITION_PENDING` (:2676) · `SDD_RESEARCH_DECISION_UNTRACED` (:2683) · `SDD_RESEARCH_ORPHAN` (:2722) · `SDD_RESEARCH_UNREGISTERED` (:2729).

Codes emitted by adapters outside `check.ts`: `cli/cmd/sdd-check/sdd-check.cmd.ts` — `SDD_CHECK_READ_FAILED`, `SDD_BROKEN_SPEC_LINK` (:248), `SDD_RESEARCH_REF_BROKEN` (:257), `SDD_RULES_CASCADE_UNRESOLVED` (:417), `SDD_BDD_SCENARIO_UNTESTED`/`SDD_BDD_TESTFILE_AMBIGUOUS`/`SDD_BDD_DEFERRED_TO_SELF`/`SDD_BDD_COVERAGE_ROW_UNPARSED` (:527), `SDD_VERIFICATION_TABLE_INVALID` (:587), `SDD_COVERAGE_POLICY_INVALID` (:600), `SDD_COVERAGE_OWNER_INVALID` (:617), `SDD_COVERAGE_READER_RERUNS_PRODUCER` (:653), `SDD_COVERAGE_READER_OWNER_MISMATCH` (:665), `SDD_CONSUMERS_UNRESOLVED` (:682), `SDD_CONSUMERS_SCAN_FAILED` (:715), `SDD_BROKEN_SPEC_REF`/`SDD_BROKEN_SPEC_ANCHOR` (:750-782), `SDD_TASK_OWNER_METADATA` (:823), `SDD_AUTHORING_TARGET_PATH` (:894), `SDD_AUTHORING_AUTO_FIXED` (:1117); `phase-receipt-check.ts` — `SDD_PHASE_RECEIPT_STALE_TARGETS`, `SDD_PHASE_RECEIPT_STALE_PLAN`, `SDD_PHASE_RECEIPT_INCOMPLETE`, `SDD_PHASE_RECEIPT_INVALID`, `SDD_PHASE_RECEIPT_MISSING`; `group-receipt.ts` — `SDD_GROUP_AUDIT_MISSING`, `SDD_GROUP_REVIEW_MISSING` (WARN); `tasks-append-only.ts` — `SDD_TASKS_APPEND_ONLY_REGRESSION`; `bdd-coverage.ts` — `SDD_BDD_REQUIREMENT_UNTRACED`; `requirement-budget.ts` — `SDD_REQUIREMENT_ENTRY_TOO_LONG`, `SDD_REQUIREMENTS_BUDGET_EXCEEDED`, `SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID`; `project-feasibility.ts` — `SDD_PROJECT_BOOTSTRAP_SECTION_MISSING`, `SDD_PROJECT_BOOTSTRAP_ROW_INCOMPLETE`, `SDD_PROJECT_BOOTSTRAP_FACTS_MISSING`, `SDD_PROJECT_PACKAGE_ARTIFACTS_MISSING`, `SDD_PROJECT_EXTERNAL_ARTIFACT_PROVIDER_MISSING`, `SDD_PROJECT_SHARED_WRITER_UNORDERED`, and 29 `SDD_SCAFFOLD_PLAN_*` codes (ACTION_UNSUPPORTED, ADAPTER_MISSING/UNKNOWN, CAPABILITY_ADAPTER_MISMATCH, CAPABILITY_PREREQUISITE_ORDER, CAPABILITY_REQUIREMENT_UNDECLARED, CAPABILITY_UNKNOWN, CYCLE, DEPENDENCY_CAPABILITY_MISSING, DEPENDENCY_PREREQUISITE_UNDECLARED, DEPENDENCY_TARGET_MISSING, DEPENDENCY_UNKNOWN, GATE_ARTIFACT_MISSING, MATERIALIZATION_DRIFT, NODE_DUPLICATE, NODE_NOT_MATERIALIZED, NODE_UNAPPROVED, PACKAGE_ACTION_MISSING, REQUIREMENT_DUPLICATE/MISSING/NOT_TASK_OWNED/UNKNOWN, SCOPE_DRIFT, SHARED_WRITER_OVERLAP, SPEC_MISSING/STALE/UNKNOWN); `spec-schema.ts` — `SDD_V2_SUBDIR`. (The `SDD_TASK_*`, `SDD_LOG_*`, `SDD_NEW_*`, `SDD_SYNC_*`, `SDD_STATE_*`, `SDD_EXTRACT_*`, `SDD_MIGRATE_*`, `SDD_VERIFY_*` identifiers are `ERR_CLI_*` exit-diagnostic codes, not findings.)

### 2.4 Other highlighted modules

- **gate-queue.ts**: `checkAuthoringReadiness` (`:197-207`) — "Runtime gate existence is irrelevant here; every missing alias must instead have one complete infrastructure Bootstrap Requirements row. Interface scopes never own tickets." `queuedInfraGateTicketIds` (`:352-359`) resolves each missing gate to exactly one active infra ticket phase whose claim + Target Files match Bootstrap Requirements; ambiguity or no owner ⇒ diagnostic (`:444`). `phaseOwnsMissingReadinessGate` (`:469`) is the exemption test used by `sdd-task`/`sdd-verify`.
- **phase-verification-plan.ts**: `phaseProfileForKind` — `bootstrap|config|doc→setup`, `test→test`, `impl|refactor|fix→code`, else null (`:29-35`); gate command is `npm run <script>` (`:270`); `phaseVerificationArtifactPaths()` lists inferred artifacts (deprecated input).
- **project-feasibility.ts**: binds scaffold planning to exact spec bytes (`projectSpecDigest`), checks the Bootstrap Requirements table (columns from `spec-schema.ts`), proves the proposed DAG (`checkScaffoldDraftPlan`) with the capability adapter registry (`DEFAULT_CAPABILITY_ADAPTER_REGISTRY` = node/typescript/typescript-quality), and re-checks materialized tickets (`checkScaffoldPlanMaterialization`).
- **capability-adapter.ts**: adapter shape = `{id, dependencyBoundary, artifacts, layers (runtime→package-manager→language-compiler→quality-test-tooling→app-platform), requiredRules (rulePath + actions/capabilities), gateRequirements}`; `node` adapter binds `ai/directives/infra/nodejs-npm-setup.xml`, artifacts `.nvmrc`, `package.json#engines.node`, `package.json#type`, `.npmrc`, `package-lock.json`; `typescript-quality` binds `ai/directives/infra/eslint-setup.xml` and gates `test/lint/format`. Comment `:70`: "new platforms extend this value or inject another registry" — **the declared plug-in point for non-Node stacks; nothing else is registered**.
- **phase-receipt.ts** / **group-receipt.ts**: see table; `PHASE_RECEIPTS_SCHEMA_MARKER = '<!--PHASE_RECEIPTS:v1-->'` gates grandfathering (group-receipt.ts:22).
- **ladder.ts**: rung 4 "Инфраструктура" = `packageJsonPresent && typecheck && test && lint` (`:68`); the next-step suggestion routes to `/sdd`, `/sdd-scaffold`, `/sdd-execute` (`:101-112`).
- **migration-plan.ts / migration-move.ts / id-replace.ts / anchor-inject.ts**: the four deterministic steps behind `sdd-migrate` (anchors → plan → ids → move); `flow.ts` flips a scope to v2 when `tasks/<scope>/` is gone and `<scope>.3-tasks.md` exists.
- **tool-guidance.ts**: envelope used by sdd-new/check/log/task for actionable failures (commit e95dd106 "standardize actionable tool failures").
- **yagni.ts**: waiver grammar `- **Usage Waiver:** <reason>` | `<ACR>-DL-N — <reason>` | `(external: <consumer>)`; a cited DL id must have a Decision Log heading in `specs/`.
- **session-boundary.ts**: appends hard workspace boundary (`WORKING_DIR`, `TMP_DIR=<root>/.tmp`) in Russian to sdd-state/sdd-task/sdd-new output.

---

## 3. Directives `ai/directives/sdd-v2/**` + the `ai/kit` pipeline

70 XML files, 10 075 lines (`find ai/directives/sdd-v2 -name '*.xml' | xargs wc -l`). Sibling non-v2 trees: `ai/directives/{agent-inbox,architecture,coding,infra,testing}` + `ai/directives/knowledge.xml` (see §5).

### 3.1 Directive inventory and role in the flow

`Role` = position in router → authoring → scaffold → execute → audit → code-review → reconcile → migration. `TC` = number of `<ToolCall` blocks (grep).

| Directive | LOC | Role | Loaded by | TC | Mandated CLI calls |
|---|---|---|---|---|---|
| `router.directive.xml` | 405 | **router** (kernel) | `/sdd` skill | 0 | none itself — consumes `routerState` alias from the skill (`STEP_0_STATE`: "Consume exact result alias `routerState` from the entry skill. Do not repeat `sdd-state`", `:334`) |
| `root.directive.xml` | 526 | authoring — project portal owner (`specs/README.md`) | router `intent=project-setup` | 3 | `sdd-new infrastructure --scope infra-base`, `sdd-new portal`, `sdd-check --all .` |
| `scope.directive.xml` | 124 | authoring — one product/library scope spec | router `scope-type ∈ {product,library}` | 5 | `sdd-new product --scope`, `sdd-new library --scope`, `sdd-orient --scope`, `sdd-check --spec`, `sdd-log <spec> authoring-complete` |
| `infra.directive.xml` | 621 | authoring — `infrastructure` scope (tool stack, Bootstrap Requirements) | router `scope-type=infrastructure` | 5 | `sdd-orient --scope`, `sdd-new research --scope` ×2, `sdd-new infrastructure --scope`, `sdd-check --all specs/` |
| `interface.directive.xml` | 398 | authoring — `interface` scope (OpenAPI/proto/JSON-Schema) | router `scope-type=interface` | 3 | `sdd-orient --scope`, `sdd-new interface --scope`, `sdd-check --all specs/` |
| `module.directive.xml` | 130 | authoring — module hierarchy under a decomposed scope | router `intent=module-decomposition` | 4 | `sdd-new module --scope`, `sdd-orient --scope`, `sdd-check --spec`, `sdd-log <module-spec> authoring-complete` |
| `interview-protocol.directive.xml` | 447 | authoring sub-protocol — ONE operator interview | scope STEP_2/3, infra STEP_2, interface STEP_2, module STEP_2 | 0 | — |
| `amplify-security` / `amplify-storage` / `amplify-nfr` / `amplify-observability` | 117/98/106/110 | authoring amplifiers, lazily triaged by the interview | `interview-protocol` triage | 0 | — |
| `preflight-protocol.directive.xml` | 25 | authoring — close design consequences before independent review | authoring branches | 0 | — |
| `review-lifecycle.directive.xml` | 70 | authoring — **approval #1** boundary (independent reviewer + operator) | authoring branches | 0 | — |
| `critic.directive.xml` / `critic-protocol.directive.xml` | 66/20 | authoring — fresh read-only semantic critic | router `forced intent=critic`, `/sdd-critic` | 0 | (`critic-protocol` cites `npx gennady sdd-extract <dep> VISION` inside `AX_ISOLATION`) |
| `authoring-interactive.directive.xml` | 22 | optional live-operator authoring profile | explicit operator request only | 0 | — |
| `discover-from-code.directive.xml` | 205 | authoring (brownfield, project-scale) — portal absent + `CODE=present` | `root` | 2 | `sdd-new portal`, `sdd-check --all .` |
| `recover-from-code.directive.xml` | 261 | authoring (brownfield, one named path) | router, portal LIVE + explicit path | 2 | `lint --spec=`, `sdd-check --all .` |
| `scaffold.directive.xml` (+ `scaffold/steps/STEP_0…STEP_6`) | 356 + 253 | **scaffold** — specs → ticket DAG + indexes, approval #2 | router `forced intent=scaffold` (requires approval #1, else `H_SPEC_NOT_APPROVED`) | 9 | STEP_2: `sdd-new task --owner {infrastructure-flat,scope-bootstrap,module}`, `sdd-new {module-index,scope-index,project-index}`; STEP_3: `sdd-check --task <ticket> --authoring`, `sdd-check --all .`; STEP_6: `sdd-check --all .` |
| `execute.directive.xml` | 345 | **execute** orchestrator | router `intent=execute` | 13 | `sdd-task` (map), `sdd-task <ticket>`, `sdd-task <ticket> --phase <P>`, `sdd-check --task` ×2, `sdd-log … complete --phase`, `sdd-log … close`, `sdd-sync <ticket>`, `sdd-check --all .` ×2, `sdd-log <group> audit-receipt <verdict>`, `sdd-log <group> review-receipt <verdict>`, `sdd-task` (refresh) |
| `phase-execution-protocol.directive.xml` (+ `steps/STEP_1_ORIENT…STEP_4_HANDOFF`) | 46 + 94 | execute — disposable per-phase worker | `execute` (one dispatch per pending phase) | 0 | steps carry no `<ToolCall>`; `sdd-verify` ownership stated in Mission ("`sdd-verify` owns only the receipt") |
| `readiness.directive.xml` | 251 | execute prerequisite — bring `not-ready` repo to the 8 npm bricks | `READINESS_PREFLIGHT_GATE` from router/branches | 3 | `sdd-new research --scope`, `sdd-state` ×2 |
| `audit.directive.xml` (+ `audit/steps/STEP_1_MECHANICAL…STEP_3_ROUTE`) | 229 + 419 | **audit** — fresh-eyes semantic audit of one spec's ticket group | `execute` when `sdd-task --audit-group` reports `due`; or operator "audit TSK-NN" | 8 | STEP_1: `sdd-task --group-scope`, `sdd-task --task-scope`, `sdd-check --task`, `sdd-check --all .`, `sdd-check --changed .`, `sdd-verify --profile full`, `lint --include-tests --spec=`, `lint --spec=` |
| `code-review.directive.xml` | 260 | **code-review** — bug hunt over the same group, after audit passes | `execute` | 2 | `sdd-task --group-scope`, `sdd-task --task-scope` |
| `deviation-review.directive.xml` | 37 | post-batch review of disputed autonomous decisions | `execute` batch close | 0 | — |
| `reconcile.directive.xml` | 408 | **reconcile** — restore spec⟷code⟷task triangle; modes `fix` / `from-code` | router `forced intent=reconcile`, `/sdd-reconcile` | 1 | `sdd-check --all` |
| `compression.directive.xml` | 105 | evolution — collapse redundant decisions without loss | `migration-v1-v2` today, reusable | 1 | `sdd-check --all .` |
| `migration-v1-v2.directive.xml` | 411 | **migration** — v1→v2, plan-first, under git | router `FLOW_VERSION=v1` + operator confirm | 15 | `sdd-migrate plan --all .` (+`--write`), `sdd-migrate anchors --all .` (+`--write`), `sdd-migrate plan --verify`, `sdd-migrate ids --from-plan` (+`--write`), `sdd-migrate move --scope`, `sdd-state`, `sdd-check --all .` ×3, `sdd-check --all specs/`, `lint --spec=` |
| `agent-inbox/{code-lens,security-lens,enrich,synthesize,track-review}.directive.xml` | 108/161/222/113/440 | **not part of the SDD flow** — MR-review lenses for the `agent-inbox` service (`selectDirective('session','code',mrShape)`, TSK-136) | `services/agent-inbox` | 0 | — |
| `formats/*.xml` (23 files, 2 240 LOC) | | format-contract fragments (spec structures, DbC, diagram vocabulary, entity inventory/surface, task-ticket structure, tasks indexes, requirement entry, NFR budgets, security section, pivot formats, audit round, change manifest) | included as partials | 0 | — |
| `guides/{project-setup.md,v1-to-v2-migration.md}` | | operator-facing prose guides (not directives) | — | — | — |

Router `LOGIC_SWITCH` detail is in §4.2. Note the **flow gap**: `readiness.directive.xml` and `discover-from-code`/`recover-from-code` are reachable only via `READINESS_PREFLIGHT_GATE` / `root`, not from the router's own `STEP_2_ROUTE` switch (`router.directive.xml:373-397` has no `readiness` case; `recover-from-code` is reached only through the `recover-from-code` intent → `discover-from-code`, so `recover-from-code.directive.xml` has no direct route case either).

### 3.2 The `ai/kit` build pipeline

```
ai/kit/templates/sdd-v2/*.hbs  (55 templates)
        │  Handlebars, partials resolved from ai/kit/{axiom,contract,definition,hook,pattern,anti-pattern}/**
        ▼  ai/kit/render.ts  (createRenderer, walk, normalizeBrick; TEMPLATES=ai/kit/templates, OUT_ROOT=ai/directives)
ai/kit/build-directives.ts  (npm run build:directives)
        │  pass 1: render every .hbs as-is → seeds the READ_AND_USE_DIRECTIVE graph (build-directives.ts:83-99)
        │  pass 2: delta-assembly (ai/kit/delta-assembly.ts) — subtract partials already guaranteed in the
        │          loading directive's context ctx(n); replaced by a one-line "Inherited from…" note (:101-116)
        │  then:  assembly mode (ai/kit/lazy-assembly.ts) AFTER delta, never in parallel (DA-REQ-10, :117-136)
        ▼
ai/directives/sdd-v2/**.xml  +  ai/directives/.gennady-directive-assembly.json
```

- **Templates**: 55 `.hbs` under `ai/kit/templates/sdd-v2/` (incl. `agent-inbox/` ×5 and `formats/` ×20). 15 generated XML files have **no** `.hbs` source: the 3 `audit/steps/*`, 4 `phase-execution-protocol/steps/*`, 7 `scaffold/steps/*` (all produced by lazy assembly) plus `formats/change-manifest.xml` (hand-authored, not build-managed).
- **Assembly manifest** `ai/kit/assembly-manifest.json`: `defaultMode: "monolith"`, overrides → `lazy` for exactly three pilots: `sdd-v2/audit.directive.xml`, `sdd-v2/scaffold.directive.xml`, `sdd-v2/phase-execution-protocol.directive.xml`. Priority: manifest override > `--assembly=` flag > `defaultMode` > built-in `monolith` (DA-REQ-1, `build-directives.ts:9-21`). A Step-less directive silently stays monolith under a *blanket* lazy, but an *explicit* per-directive lazy override on a Step-less directive fails the build loudly (`:120-131`, DA-REQ-3).
- **Lazy split**: one slim skeleton at the directive's normal path + one package per `<Step>` at `ai/directives/sdd-v2/<name>/steps/<id>.xml`. `loadTopology` = `chain` for `scaffold`, `index` for the others (`:189`). Packages are written and `existsSync`-confirmed **before** the skeleton that promises them (DA-REQ-12, `:228-243`), obsolete `.xml` siblings are unlinked (`:246-255`), and the human-readable fingerprint is this package's own `version` string, never a hash (DA-REQ-7, `:75-79`).
- **Marker** `.gennady-directive-assembly.json` = `{schema:'gennady-directive-assembly/v1', selection:'manifest'|'monolith'|'lazy'}` (`ai/kit/directive-assembly-marker.ts:8-21`); the parser refuses anything but exactly those two keys (`:37-41`) — no silent fallback.
- **Dangling-axiom lint** (`ai/kit/lint-axioms.ts`) runs over the FINAL post-delta output and only **warns** (`build-directives.ts:45-46,153-154`): every `<Axiom>` in a `<BeliefState>` must be referenced at least once outside BeliefState; exempt via `cross-cutting="true"` or `deps=` inheritance.

### 3.3 Kit audits — what each enforces

| Script / npm script | Enforces | Failure mode |
|---|---|---|
| `audit:axioms` → `ai/kit/audit-axiom-activation.mjs` (137 LOC) | For every `axiom/*` partial a template connects in `BeliefState`, the resolved `<Axiom id>` must occur ≥1× inside that template's own `ExecutionPlan` / `PhaseProcedure` ("an axiom sitting only in BeliefState is background the agent forgets"). Scope: top-level `templates/sdd-v2/*.directive.hbs` only — `agent-inbox/` (Steps live inside BeliefState, no ExecutionPlan wrapper) and `formats/` are deliberately not walked. Cross-cutting conduct axioms exempt by explicit `ALLOWLIST_BASENAMES` | exit 1, prints every violation |
| `audit:contracts` → `audit-contract-activation.mjs` (534 LOC) | Two opposite drifts. **PART 1 "included → activated"** over `.hbs`: a `contract/*` partial connected in `ChatOutput`/`ChatProtocol` but never anchored at a step = copy-paste dead weight. Self-activating containers (`OutputContracts`, `ArtifactOutput`, `SessionState`) need no anchor. **PART 2 "mentioned → available"** over the assembled `ai/directives/sdd-v2/**`: a bare contract-ID mention with no reachable definition is "a reference into the void" (the real `UNDERSTANDING_BLOCK_FORMAT`/`FLOW_DIAGRAM_WHEN` bug: named in `contract/process/message-layout.xml`, defined only in `root.directive.xml`, missing from 6 of 13 consumers) | exit 1 |
| `audit:halts` → `audit-halt-activation.mjs` (345 LOC) + `audit-halt-fragments.mjs` (55 LOC) | (a) **mentioned → declared**: every `H_*` token outside a directive's `<HaltConditions>` table must be a row in *that same* directive's table (target defect: `H_SCAFFOLD_NOT_EXECUTABLE` fired from scaffold STEP_3B but was never declared, commit 9c81be20). One allowlisted exception class: `ALLOWLIST_CROSS_DIRECTIVE_REFS` for citing another directive's halt (`H_ASK_WITHOUT_CARD`). (b) **declared → used**: every table row must occur ≥1× outside the table, in this directive, via the `AX_*` its Trigger cites, or in any other scanned directive. `audit-halt-fragments.mjs` walks a lazy directive's bounded, package-local fragment chain and throws on a ref that escapes its package, is missing, is cyclic, or exceeds 128 fragments | exit 1 |
| `check:directives-fresh` → `check-directives-fresh.ts` (201 LOC) | `ai/directives/**` is a build output with exactly one writer. Rebuilds into a throwaway `mkdtemp` dir (the real tree is never touched) and `git diff --no-index`s it against the checked-in tree. Comparison walks the **scratch rebuild's own file list** and mirrors only those exact relative paths, so hand-authored files living inside build-managed roots (`ai/directives/coding/README.md`, `svelte5-runes.xml`, `knowledge.xml`, whole `agent-inbox/ architecture/ infra/ testing/` trees) are not flagged as spuriously missing. Catches both hand-edits to generated files and a template change whose build never re-ran | non-zero exit on any diff |
| `check:directive-budgets` → `step-budget-gate.ts` (199 LOC) | `SKELETON_TOKEN_TARGET = 6000` (**soft** — warns, build continues), `SKELETON_TOKEN_LIMIT = 8000` (**hard** — error, exit 1), `PACKAGE_CHAR_LIMIT = 20_000`, `PACKAGE_LINE_CHAR_LIMIT = 2000` (`:37-45`). Line length, not file size, is the stated truncation risk (DA-DL-5/14). A directive counts as lazily assembled only when its sibling `<name>/steps/` directory exists, so only the three pilots are scanned. The target/ceiling split exists because build `e08460c3` shipped `phase-execution-protocol` at 6009 tokens with every gate green |
| `audit:sdd-templates` (aggregate) | `check:directives-fresh && audit:axioms && audit:contracts && audit:halts && check:directive-budgets` (`package.json`) | first failure wins |

`ai/kit/__tests__/` — 15 test files: `build-directives` (assembly-flag scope F-02, packages-before-skeleton F-03), `check-directives-fresh`, `delta-assembly` (graph shape, class-1/class-3 always FULL, class-2 deducts using `migration-v1-v2` as the litmus case, determinism), `lazy-assembly` (`resolveAssemblyMode`, `stampFingerprint`, `AxiomActivationClassifier#classify`, `LazyDirectiveAssembler#assemble`), `lint-axioms`, `render` (indent matrix, real-brick corpus round-trip, monster template), `step-budget-gate`, `audit-halt-activation`, `deps` ("directive deps are satisfied by the router core"), `amplifier-requirement-format`, `skeleton-parity` ("generated directive embeds the `templates.ts` registry skeleton verbatim" — binds §2 `shared/sdd/templates.ts` to the directive text), `skeleton-package-binding.{guard,e2e}`, `stateless-sdd-flow-contract` (stateless entry contract · two artifact-approval boundaries · stateless execution and specification format).

### 3.4 Axiom library `ai/kit/axiom/**`

427 axiom files in 20 directories. Ids verbatim, grouped by directory:

| Dir | n | Axiom ids |
|---|---|---|
| `agent-inbox` | 4 | `ax-complexity-budget ax-minimal-change-suspicion ax-review-purpose ax-simpler-alternative` |
| `audit` | 25 | `ax-audit-modes ax-audit-reads-code ax-bdd-coverage-verification ax-closed-world-primary-check ax-completeness-check ax-drift-taxonomy ax-ephemeral-output ax-execution-log-verification ax-finding-routing ax-findings-as-proposals ax-git-diff-scan ax-insight-backflow-capture ax-learning-context ax-mechanical-via-sdd-check ax-neutral-findings ax-no-auto-fix ax-provenance-is-a-product ax-reopen-rounds-in-ticket ax-rules-cascade-verification ax-rules-compliance-against-activated-rules ax-runtime-backing-verification ax-severity-tagging ax-severity ax-stale-after-pivot-verification ax-task-id-integrity` |
| `boundary` | 16 | `ax-bootstrap-narrow-read ax-closed-world-inventory ax-cross-scope-dependencies ax-entity-surface-completeness ax-guarded-result-boundary ax-isolation-signal ax-isolation-through-public-boundary ax-portal-read-only-with-placeholder-exception ax-reference-over-copy ax-result-public-boundary ax-scope-type-gate ax-semantic-location-over-lines ax-semantic-safety ax-spec-never-edited ax-ssot-traceability ax-ticket-write-scope` |
| `coding` | 29 | `ax-ai-readability ax-anchor-format ax-comment-density ax-comment-placement ax-comment-vocabulary ax-comments-add-nonsyntactic-intent ax-configurable-names ax-consumer-driven ax-contractual-naming ax-domain-prefix-for-external ax-early-exit ax-explicit-class-fields ax-file-header-append-only ax-file-header-task-traceability ax-file-level-context ax-import-canonical-form ax-introduced-discipline ax-modern-ts-density ax-modularity-limits ax-namespace-naming ax-no-code-generation ax-no-premature-abstractions ax-no-silent-escape-hatch ax-node-builtins-prefix ax-principled-decomposition ax-teleological-naming ax-tools-as-hands ax-verb-precision ax-yagni-overengineering-guard` |
| `critic` | 13 | `ax-comprehension-first ax-confusion-bug ax-critic-model-tier ax-default-accept ax-finding-addressee ax-goal-owner-gate ax-isolation ax-language-lens ax-polish-mode ax-product-architect-lens ax-read-only ax-uncertainty-is-signal ax-uncomfortable-questions` |
| `e2e` | 24 | `ax-cli-ax-tree-as-primary-vision ax-cli-codegen-is-recorder-not-author ax-cli-dev-server-precondition ax-cli-explore-before-author ax-cli-explore-loop-has-four-steps ax-cli-headless-for-agent ax-cli-role-locators-from-ax-tree ax-cli-snapshot-update-gate ax-cli-trace-for-failure-diagnosis ax-cli-transition-to-authoring ax-e2e-auth-via-storage-state ax-e2e-ax-tree-as-contract ax-e2e-browser-coverage-pragmatic ax-e2e-file-layout ax-e2e-file-size-budget ax-e2e-fixture-based-pom ax-e2e-headless-always ax-e2e-network-mock-at-route ax-e2e-proof-screenshot-always ax-e2e-role-locators-only ax-e2e-self-verification-loop ax-e2e-snapshot-partial-by-default ax-e2e-structure-ax-first ax-e2e-visual-regression-gated` |
| `error` | 16 | `ax-catch-log-recover ax-error-chaining-cause ax-error-via-class ax-fail-fast-validation ax-focused-error-assertions ax-mandatory-try-catch-in-business-logic ax-markup-safety ax-minimal-error-surface ax-must-extractor ax-no-bare-throw-unknown ax-no-result-iserr-short-circuit ax-no-result-object-literal ax-no-result-ok-short-circuit ax-no-result-second-generic ax-result-unwrap-on-success-paths ax-trace-prefixed-errors` |
| `infra` | 31 | `ax-ai-first-scripts-one-shot ax-autofix-preferred ax-binary-severity ax-branch-strategy ax-commit-convention ax-config-auditable-by-agent ax-custom-plugins-obey-meta-policy ax-dependency-addition-checklist ax-exact-pinning-for-tooling ax-flat-config ax-gitignore-baseline ax-history-policy ax-hooks-integration ax-infra-base-bootstrap ax-infrastructure-flow ax-lfs-submodules ax-lint-run-is-mechanical ax-lock-file-discipline ax-module-system-explicit ax-no-disable-comments-by-agent ax-non-autofix-prefer-delegation ax-npm-agent-sandbox-registry ax-presets-passed-through-the-gate ax-prettier-owns-formatting ax-project-layout ax-rule-change-requires-operator-confirm ax-secrets-discipline ax-single-package-manager ax-tag-release ax-third-party-tool-current-api ax-type-aware-prefer-ts` |
| `interview` | 3 | `ax-amplification-opt-in ax-coverage-map-closure ax-defaults-first` |
| `logging` | 7 | `ax-alerts-on-symptoms ax-log-density ax-log-message-format ax-log-message-purity ax-log-performance-metrics ax-stdout-first-transport ax-structured-logging` |
| `perf` | 12 | `ax-allocation-is-enemy ax-backpressure-is-law ax-big-o-matters ax-budgets-are-numbers ax-concurrency-limits ax-engine-optimizations ax-gc-pressure ax-hoisting-safety ax-latency-stacking ax-one-time-cost ax-retained-memory ax-target-hardware` |
| `process` | 56 | `ax-amplify-defaults-first ax-artifact-style-self-check ax-audit-hook ax-blocker-escalation ax-blocker-resolution-trail ax-cap-5 ax-close-with-integrity-check ax-coverage-report-blocker-explicit ax-cross-scope-change ax-deviation-self-resolve ax-dialogue-discipline ax-dispatch-via-batch ax-diverge-before-recommend ax-env-fix-channel ax-execution-log-plan-vs-fact ax-execution-order ax-fix-classification ax-group-audit-leaves-a-receipt ax-group-review-leaves-a-receipt ax-grouping-reduces-noise ax-halt-vs-fail-distinction ax-handoff-typed ax-live-log ax-narrow-recon ax-no-focused-or-skipped-tests-on-merge ax-no-process-narration ax-operator-agreement ax-operator-dialogue-style ax-operator-language ax-operator-output-live-text ax-operator-safeguard ax-owner ax-permitted-bash-commands ax-phase-scope-lock ax-preflight-blast-radius-scoped ax-problem-probes-spec ax-progressive-disclosure ax-re-dispatch ax-read-per-manifest ax-rejection-reason ax-release-ready-default ax-reopen-format ax-review-vcs-commands ax-scale-proportional-depth ax-stateless-flow ax-step-by-step-approval ax-stop-no-edits ax-surgical ax-task-id-uniqueness ax-task-parallel ax-task-resolution ax-ticket-section-names-normative ax-tool-invocation ax-verification-before-handoff ax-verify-and-finalize ax-verify-at-end` |
| `scaffold` | 20 | `ax-append-only-module-add ax-bootstrap-ticket-derivation ax-cross-scope-task-placement ax-dag-and-ticket-boundaries ax-directive-mode ax-extend-dag-preserves-existing-ids ax-handoff-to-task-scaffolding ax-idempotent-modes ax-mode-auto-detect-or-halt ax-phases-declared-in-header ax-rule-activation-plan ax-rule-activation ax-rules-cascade-resolution ax-rules-load-from-phase-block ax-rules-resolution-hard-fail ax-scope-rules-declaration ax-stack-based-flow ax-task-dimensions ax-ticket-deduplication ax-ticket-has-bdd-and-tests` |
| `spec` | 36 | `ax-access-patterns-drive-schema ax-context-to-contract ax-contracts-textual-agnostic ax-data-lifecycle-explicit ax-decision-log-required ax-draft-ready-for-review ax-dx-first ax-exact-scope ax-external-input-untrusted ax-handoff-to-module-decomposition ax-hierarchical-specs ax-interface-flow ax-living-spec ax-module-boundary-by-operator ax-no-data-loss ax-no-silent-option-drop ax-parallel-mechanism-requires-justification ax-pivot-requires-supersession ax-portal-primary-owner ax-ports-and-abstractions-discipline ax-product-library-flow ax-refine-module-preserves-contracts ax-runtime-backing-explicit ax-runtime-backing-in-contracts ax-scope-graph-detection ax-scope-graph-discipline ax-scope-spec-module-map-ownership ax-scope-stays-thin ax-scope-table-format ax-scope-type-branch ax-separation-of-concerns ax-spec-dimensions ax-spec-lifecycle ax-spec-structure ax-stateless-artifact ax-vision-only-for-application` |
| `storybook` | 22 | (`ax-ai-generated-tag` … `ax-storybook-title-from-spec`) |
| `svelte` | 34 | (`ax-bindable-for-two-way` … `ax-sk-*`, `ax-svelte-test-*`) |
| `testing` | 40 | `ax-anchor-coverage-nontrivial ax-anchor-intentful-names ax-anchor-trivial-exception ax-assert-api-choice ax-bdd-generation ax-bdd-name-discipline ax-case-flow ax-contract-over-implementation ax-coverage-by-contract-not-by-line ax-default-direct-assertion-protocol ax-e2e-first ax-explicit-vitest-imports ax-file-name-and-default-shape ax-fixture-io-policy ax-hooks-only-for-lifecycle ax-http-boundary-injection ax-http-mock-agent-pattern ax-it-opening-brief ax-mock-as-last-resort ax-mock-hygiene ax-mock-requires-operator-confirm ax-no-describe-let-pileup ax-no-falsification-via-mocks ax-one-test-one-scenario ax-one-unified-context-per-file ax-partial-string-via-match ax-phase-anchors ax-prefer-factory-over-hooks ax-prefer-native-mock-fn ax-prefer-vi-fn-for-interaction ax-snapshot-file-location ax-snapshot-usage-gate ax-test-anchor-naming ax-test-file-size-budget ax-test-mandate ax-tests-no-human-narration ax-time-env-global-lifecycle ax-vitest-assert-api-choice ax-vitest-isolation-default ax-vitest-run-not-watch` |
| `truth` | 11 | `ax-autonomous-research ax-evidence-hygiene ax-freshness-guard ax-live-source-only ax-no-unverified-findings ax-production-realism ax-real-run-over-ping ax-research-persisted ax-reuse-first ax-spec-is-sole-source ax-stale-must-be-rejected` |
| `typescript` | 11 | `ax-base-contract-shape ax-consumers-tag-semantics ax-direct-implementation-protocol ax-english-only-names-and-comments ax-entity-specific-minimums ax-flat-jsdoc-for-properties ax-implementation-hiding-in-public ax-no-transpile-only-constructs ax-tag-usage-matrix ax-truthful-encapsulation ax-type-vs-interface-choice` |
| `uikit` | 17 | `ax-a11y-audit-parameters ax-a11y-defaults ax-a11y-requirements ax-component-props-contract ax-css-module-selector-conventions ax-css-tokens-via-root ax-data-attrs-not-host ax-data-state-for-testability ax-element-structure-from-extraction ax-existing-components-check ax-extraction-input ax-file-structure-kebab-case ax-icon-svg-tight-viewbox ax-token-discipline ax-token-override-comment ax-token-section-generation ax-variant-grouping` |

**Stack-relevant observation**: only `scaffold/ax-stack-based-flow.xml` and the `infra/**` group carry stack semantics; the `infra` axioms are npm/eslint/prettier/nvmrc-specific (`ax-single-package-manager`, `ax-npm-agent-sandbox-registry`, `ax-prettier-owns-formatting`, `ax-nvmrc-*` hooks). `svelte` (34) + `storybook` (22) + `uikit` (17) + `e2e` (24) = 97 axioms bound to one web stack. There is no `python`, `golang`, or `swift` axiom directory.

Sibling brick libraries (same `ai/kit` render root): `anti-pattern/**` (12 dirs — coding, critic, e2e, infra, logging, process, spec, storybook, svelte, testing, uikit; many carry BOTH an `AP_UPPER_SNAKE.xml` and a `ap-kebab.xml` copy of the same id), `contract/{audit(3),critic(1),interview(1),process(25),scaffold(4),spec(23),uikit(1)}`, `definition/{e2e,infra,process,storybook,svelte,testing,typescript,uikit}`, `hook/{coding,e2e,infra,storybook,svelte,testing,typescript,uikit}`, `pattern/{e2e,infra,spec,storybook,svelte,testing,typescript,uikit}`, plus `ai/kit/demo/{sdd-mini.hbs,render-demo.ts,indent-check.ts}` and `ai/kit/AUTHORING.md` (25 775 bytes — the authoring contract the audits cite by section).

### 3.5 `cli/__tests__/directive-tool-contract/**` — what it enforces

3 files, 1 340 LOC: `directive-tool-contract.test.ts` (675), `fixture.ts` (263), `parse-tool-calls.ts` (402). Header contract (`directive-tool-contract.test.ts:1-10`): every documented `npx gennady <cmd> …` call in the sdd-v2 `execute` / `phase-execution-protocol` / `audit` / `reconcile` directives must **(a)** name a command gennady's own dispatcher recognizes, **(b)** return the documented *class* of result against a real fixture repo (exit 0 for a routine call, the tool's own documented error code for an error path), **(c)** for fixed-shape forms, produce output matching that shape — "the class of bug that costs an executing agent real panic: a tool reference table that promises a flag, a Task-ID banner, or a status side-effect the CLI does not actually have."

It reads **both** the source templates (`ai/kit/templates/sdd-v2`) and the built tree (`ai/directives/sdd-v2`), resolves lazy skeleton + step packages via `resolveAssemblyMode` from `ai/kit/lazy-assembly.ts`, and extracts per-fragment rather than over joined text (a fenced block's unpaired backtick re-pairing across files silently dropped 13 of 42 documented calls). Suites / cases:

| Suite | Cases |
|---|---|
| `callable SDD-v2 action-call inventory` | discovers every callable source directive and classifies every Action command · uses a real dispatcher command, valid CLI shape, local provenance, explicit result reuse · classifies non-executed spellings as typed `ToolLiterals` with valid CLI syntax · keeps source and built/lazy assemblies coherent · rejects malformed or unowned structural markers · registers scaffold feasibility and rejects an unmarked Action call or invalid flags · keeps task-state resolution with the stateless orchestrator before worker dispatch · gives each stateless public skill one structural repository-snapshot owner/result |
| `command existence` | one case per documented call — every documented command is a real gennady dispatch case |
| `documented call still present verbatim in its directive` | drift guard, one case per documented call |
| `sdd-orient documented invocation contract` | each usage uses the pre-materialization `--scope` form without a positional path · critic reviews the bounded artifact set directly without an obsolete orient detour |
| `historical SDD agent-confusion regressions` | reconcile has no bare sync action and gives direct edits one exact receipt command · audit and code-review define both modes once and pass named context forward · audit preserves exact lint files and forbids shell reconstruction · scaffold exhaustively maps every legal DAG owner to one exact ticket call · skills advertise only implemented audit/review modes |
| `documented result class against a real fixture repo` | one case per documented call, executed against `fixture.ts`'s throwaway repo through `node --import <repo>/node_modules/tsx/dist/loader.mjs cli/gennady.ts` (absolute loader path on purpose — the bare `tsx` specifier would resolve from the fixture cwd) |

---

## 4. Skills `ai/skills/*` and the router model

12 skills (`ai/skills/README.md:3`: "8 SDD-навыков, agent-inbox, opencode-get-session, prd-interview и workspace-permission-setup"). Mirrored into `<cwd>/.claude/skills` by `gennady sync-skills` (§1.1).

### 4.1 Skill table

| Skill | LOC | Shape | `GATHER` step — what it loads / calls | `EMBODY` |
|---|---|---|---|---|
| `sdd` | 20 | thin directive-loader | ONE parallel batch: `<ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>` + read `ai/directives/sdd-v2/router.directive.xml` in full | become the router; intent from operator message, evidence from `routerState`; `ROUTE` = follow the first matching `LOGIC_SWITCH` |
| `sdd-scaffold` | 18 | thin loader | same batch (`sdd-state` + router.directive.xml) | router with **literal forced intent `scaffold`** |
| `sdd-execute` | 18 | thin loader | same batch | router with forced intent `execute`; empty payload = show execution map and wait, "it never aliases `next`" |
| `sdd-critic` | 18 | thin loader | same batch | router with forced intent `critic` + bounded target |
| `sdd-reconcile` | 18 | thin loader | same batch | router with forced intent `reconcile` |
| `sdd-audit` | 22 | **directive-loader, no router** | reads `ai/directives/sdd-v2/audit.directive.xml` in full and follows it directly | "**No `sdd-state`/PREFLIGHT gate here by design** … This skill is the odd one out in the family on purpose, not by omission" (`:12-15`). Mode is explicit: execute dispatch → `per-group`, operator naming one task → `per-task`. Mechanical gates deliberately NOT restated ("it drifts from the source of truth the moment it's duplicated") |
| `sdd-code-review` | 32 | directive-loader, no router | reads `ai/directives/sdd-v2/code-review.directive.xml` | first action resolves `ReviewContext`: group → `npx gennady sdd-task --group-scope <id>`; one task → `npx gennady sdd-task --task-scope <Task-ID>`. "no pasted manifest and no manual git/repo discovery" |
| `sdd-check` | 26 | **thin tool reporter, no directive** | "Unlike the other skills, `check` does not load a directive — the logic lives entirely in the `sdd-check` tool (`shared/sdd/check.ts`)" (`:10-12`) | `npx gennady sdd-check --task <path>` or `--all`; relay findings verbatim + exit code; routes fixes to `/sdd-reconcile` or `/sdd-critic` |
| `agent-inbox` | 47 | non-SDD | one parallel batch: read `ai/directives/agent-inbox/inbox-flow.directive.xml` + `npx gennady inbox --json` | GitLab/GitHub MR review co-pilot; intents `list`/`tick`/`loop`/`reset` |
| `opencode-get-session` | 149 | non-SDD | `sqlite3 ~/.local/share/opencode/opencode.db` read-only | transcript extraction (DISCOVERY / TARGETED) |
| `prd-interview` | 133 | non-SDD (Russian prose skill) | `Task(subagent_type: Explore)` over the repo + 1–2 `WebSearch`; reads its own `PRD_TEMPLATE.md` | idea → PRD/EARS interview; "Если проект на SDD (есть `specs/README.md`) — предложи передать PRD в `sdd` (роутер, intent=new-scope)" |
| `workspace-permission-setup` | 194 | non-SDD | reads `.claude/settings.json`, invokes the `fewer-permission-prompts` skill | writes a permissions block; **the only place in the repo with a multi-stack detection table** — `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`/`Gemfile`/`Makefile`/`Dockerfile`/`mise.toml` → per-stack Bash allow-lists (`:31-41`). This detection is for *permissions*, not for the SDD flow |

The 5 router-entering skills are byte-identical in shape: same `<Priming>` ("thin directive-loaders … Embody the loaded prompt directive; do not parse its XML-ish markers"), same `GATHER` batch, differing only in the forced intent. Router `STEP_0_STATE` (`router.directive.xml:334`) enforces the contract: "Consume exact result alias `routerState` from the entry skill. Do not repeat `sdd-state`."

### 4.2 Router model — `router.directive.xml` (405 LOC)

Cross-cutting axioms in `BeliefState` (14 `<Axiom id=…>`, 13 of them `cross-cutting="true"`): `AX_OPERATOR_LANGUAGE` (:8), `AX_TOOL_INVOCATION` (:46), `AX_OPERATOR_DIALOGUE_STYLE` (:68), `AX_DIALOGUE_DISCIPLINE` (:109), `AX_OPERATOR_SAFEGUARD` (:120), `AX_NO_PROCESS_NARRATION` (:129), `AX_OPERATOR_OUTPUT_LIVE_TEXT` (:135), `AX_DIVERGE_BEFORE_RECOMMEND` (:141), `AX_SCALE_PROPORTIONAL_DEPTH` (:158), `AX_STATELESS_FLOW` (`invariant="true"`, :165), `AX_STATELESS_ARTIFACT` (:171), `AX_READER_WITHOUT_SESSION_CONTEXT` (:176), `AX_DECISION_LOG_NON_OBVIOUS` (:184), `AX_V2_HAS_NO_INTERNAL_MIGRATION` (:202).

`KernelGrammar` (`:209-230`) defines the two constructs: `LOGIC_SWITCH` — first matching `WHEN` wins, conditions resolve only from data already in context (`sdd-state` output + classified intent), cases mutually exclusive, `DEFAULT` mandatory, one action per case; and `READ_AND_USE_DIRECTIVE(src)` — runtime lazy file load keeping full instruction priority ("unlike command stdout"), the loaded branch inherits the kernel core and must not repeat it.

**Gate LogicSwitch** (`:294-305`, `on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"`) — 9 cases in order:

| # | WHEN | → |
|---|---|---|
| 1 | `FLOW_VERSION=v1` AND blast radius reaches the legacy `tasks/` layout or task-ID rewriting | `READ_AND_USE_DIRECTIVE("…/migration-v1-v2.directive.xml")` |
| 2 | any requested scaffold target has `AUTHORING_SCOPE=<t> READY=no|not-applicable` | STOP with that target's exact `AUTHORING_SCOPE_DIAG` + `AUTHORING_SCOPE_NEXT`; scaffold never edits the owning spec |
| 3 | every requested target `READY=yes` | continue scaffold authoring; aggregate `AUTHORING_READY=no` and unrelated red lines do not block a narrower target set; missing runtime gates are declared bootstrap work |
| 4 | `EXECUTION_READY=no` AND the ticket/phase is the exact owner in `GATE_QUEUE` | continue only that phase; `sdd-task --phase` / `sdd-verify --task … --phase` derive the exemption independently; expires when the ticket leaves TODO/IN_PROGRESS |
| 5 | `EXECUTION_READY=no` AND any other product/library phase | STOP: work the exact `GATE_QUEUE` first |
| 6 | `GATE_QUEUE_DIAG` kind `infra-spec-no-tickets` | tell the operator to run `/sdd-scaffold` — "a separate process, never `READ_AND_USE_DIRECTIVE`'d from here (scaffold itself hands off back into this flow, so loading it in-place would cycle)" |
| 7 | `GATE_QUEUE_DIAG` kind `scope-name-mismatch` | fix the ticket's `Scope:` field or the portal scope name directly, never both by guesswork |
| 8 | `FLOW_VERSION=v1` AND blast radius stays inside its own legacy scope | one-line state record, continue the legacy-compatible owner flow |
| 9 | `EXECUTION_READY=yes` AND request is execute | continue execution |
| DEFAULT | — | continue the non-scaffold, non-execution owner flow without reinterpreting either readiness fact |

**Route LogicSwitch** — `STEP_2_ROUTE`, "Load exactly one owner" (`:373-397`), 12 cases:

| WHEN | → directive |
|---|---|
| flow version v1 AND operator explicitly requests migration | `migration-v1-v2.directive.xml` |
| forced intent = `scaffold` | require well-formed, semantically current approval #1 markers in actual specs, else `H_SPEC_NOT_APPROVED`; then `scaffold.directive.xml` |
| forced intent = `execute` OR intent = `execute` | `execute.directive.xml` |
| forced intent = `critic` | `critic.directive.xml` |
| forced intent = `reconcile` | `reconcile.directive.xml` |
| intent = `project-setup` | `root.directive.xml` |
| intent = `recover-from-code` | `discover-from-code.directive.xml` |
| intent = `module-decomposition` | `module.directive.xml` |
| intent ∈ {new-scope, evolve-scope, multi-scope} AND scope-type = `infrastructure` | `infra.directive.xml` |
| … AND scope-type = `interface` | `interface.directive.xml` |
| … AND scope-type ∈ {product, library} | `scope.directive.xml` |
| OTHERWISE | `H_AMBIGUOUS_INTENT` |

Intent vocabulary from `STEP_1_CLASSIFY` (`:342-368`): forced (`scaffold`, `execute`, `critic`, `reconcile`) is authoritative; otherwise classify into `project-setup · new-scope · evolve-scope · module-decomposition · multi-scope · recover-from-code · execute`. SCALE is confirmed only for project/scope/module authoring; execute/scaffold/critic/reconcile/recovery never need it. `READINESS_PREFLIGHT_GATE` is applied once to the read-only snapshot — "Missing repository gate scripts return to their owning infrastructure/spec authoring path; they never create a session or migration branch."

Halt conditions (`:322-329`): `H_AMBIGUOUS_INTENT` · `H_SPEC_NOT_APPROVED` · `H_V2_INVALID` · `H_WRONG_REPO`. (`H_ASK_WITHOUT_CARD` is declared and fires only here per `audit-halt-activation.mjs`'s allowlist note, §3.3.)

Two mandatory approval boundaries are contracts of the router itself, not of scaffold: `ARTIFACT_APPROVAL_FLOW` (`:233-255`) and `ARTIFACT_APPROVAL_MARKER` (`:256-293`) — approval #1 as a Decision Log entry in every spec of the reviewed set, approval #2 as a section in the narrowest owning task index; both plain human-readable markdown, and "The agent never computes or copies a content hash for approval" (`:292`). Enforced by `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` (`two artifact approval boundaries`).

### 4.3 FLOW_VERSION v1 detection

`shared/sdd/flow.ts` (48 LOC) is the single detector, consumed by `sdd-state.cmd` and `sdd-check.cmd` (`@consumers:` header):
- `detectFlowVersion(root)` — `<root>/tasks/` is a directory ⇒ `v1`, else `v2`; any `statSync` throw ⇒ `v2` (`:21-27`). "The `tasks/` directory is the single v1 marker."
- `detectScopeFlowVersion(repoRoot, scope)` — a v2 repo makes every scope v2; in a v1 repo a scope is v2 only when `tasks/<scope>/` is gone **AND** `specs/<scope>/<scope>.3-tasks.md` exists; untouched scopes stay "v1-lenient" (`:36-48`).

Surface: `sdd-state.types.ts:108` prints `FLOW_VERSION=<v1|v2>`; `sdd-state.cmd.ts:180` adds the diagnostic `FLOW_VERSION=v1; migrate before v2 scaffold`; `sdd-state/help.ts:15` documents it. The router consumes it in gate-switch cases 1 and 8 and route-switch case 1; `AX_V2_HAS_NO_INTERNAL_MIGRATION` (`router:202`) forbids inventing any migration beyond v1→v2.

### 4.4 Where the infrastructure / stack choice happens — and where it does not

Greps for `infra`, `stack`, `package.json`, `node`, `npm` across `router.directive.xml`, `infra.directive.xml`, `readiness.directive.xml`, `shared/sdd/portal.ts`, `cli/cmd/sdd-state/*.ts`:

| Location | Finding |
|---|---|
| `router.directive.xml` | **Zero** stack/technology concept. The only `stack` hits are the Russian glossary line for translating «тулстек» → «Tool Stack» (`:25-26`), a prohibition on "frame-stack talk" (`:131`), and `AX_DECISION_LOG_NON_OBVIOUS` naming "Tool Stack" as a section (`:191`). No `package.json`, `npm`, or `node` mention at all. The router routes on intent + scope-**type** (`product`/`library`/`infrastructure`/`interface`), never on language or runtime |
| `root.directive.xml` | `STEP_3_INFRA_BOOTSTRAP` (`:316-326`) materializes a minimal `specs/infra-base/infra-base.spec.md` with a **Tool Stack table (tool names only, no Decision Log yet)**; the full Decision Log comes later from the `infra` flow (`:59`). `CODE=absent` means "empty / only package.json" (`:185`) — Node assumed in the greenfield-detection prose. A "Technical/stack preference" in intake is parked for STEP_3's tool-stack lock (`:230-232`) |
| `infra.directive.xml` | **The only real stack-decision site.** `STEP_2` carries `<LogicSwitch on="stack typicality">` (`:315-320`): EXPRESS branch when every still-unlocked category resolves to an existing `ai/directives/knowledge.xml` `<Rules>` entry; the full `interview-protocol` otherwise, with uncertain typicality defaulting to the interview, "never a silent EXPRESS guess". Mandatory categories `vcs / package-management / git-hooks` cannot be dropped (`H_MANDATORY_CATEGORY_DROPPED`); `test-e2e` is opt-out with a recorded risk line. Rules are matched by tool name / config artefacts against `knowledge.xml` `<Triggers>` (`:83`). **But the concrete gate artefacts are hard-coded Node**: "The infrastructure scope that first installs dependencies must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`) before that install" (`:430-432`); permitted narrow reads are "`package.json` and equivalents, `tsconfig.json` and equivalents" (`:191`) |
| `readiness.directive.xml` | Purely npm. `keywords="… package-json, npm-scripts, gennady, stub, not-ready …"` (`:1`); mission is the eight exact `package.json` scripts (`:3-22`); STEP_3 creates `package.json` if absent and runs `npm i -D …` (`:106-112`); a worked minimal `package.json` example with `"fix": "npm run format:fix -- . && npm run lint:fix -- src/"` (`:209`). Out of scope: "choosing the real tool stack with a Decision Log (the infra branch)" (`:26`). Zero mention of python/go/cargo/gradle |
| `shared/sdd/portal.ts` | **No stack concept at all.** The Scopes table carries only `scope-type` "infrastructure \| contracts \| product \| library" (`:15`); every other `stack`/`node` hit is Tarjan-SCC local state (`onStack`, `stack`, graph *node*, `:143-205`). The portal cannot record a language or runtime |
| `cli/cmd/sdd-state/**` | `sdd-state.cmd.ts:152` "exact-match required scripts; missing/broken package.json reads as not-ready"; `sdd-state.types.ts:112` prints a literal `package.json ✔/✘` row; `[PROBE]` prints only `CODE=`/`INFRA=` booleans from `shared/sdd/probe.ts` (`:196,215`), whose `CODE_EXT` is `/\.(js|jsx|ts|tsx)$/` and whose `CONFIG_FILES` are tsconfig/eslint/prettier/vitest/vite/jest only (§2.1). No language field is ever emitted |
| `ai/skills/workspace-permission-setup/SKILL.md:31-41` | The repo's **only** multi-stack detection table (`pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `Makefile`, `mise.toml`, …) — and it feeds `.claude/settings.json` permissions, not the SDD flow |

**Conclusion.** There is no stack/preset selector anywhere in the v2 flow. The only decision point is `infra.directive.xml`'s `stack typicality` switch, and it only chooses *interview depth* — the concrete artefacts it then mandates (`package.json`, `.nvmrc`, `.npmrc`, `tsconfig.json`) and the eight readiness bricks are Node/npm literals. `gennady.yaml` does not exist (§1.2), so a project has no place to declare its stack; every stack fact is inferred from `package.json`. See §9 for the exact plug-in points a per-stack preset would need.

---

## 5. Rules layer — `knowledge.xml` + `coding/**` · `testing/**` · `infra/**`

### 5.1 `ai/directives/knowledge.xml` — the rule registry (151 LOC, `<AiKnowledge ver="2.0">`)

One `<CheckPhaseOrder>typecheck test lint format</CheckPhaseOrder>` (`:3`) then 3 categories, 15 `<Rule>` entries. Each entry carries the same 8-field shape: `<File>` · `<Purpose>` · `<Triggers>` · `<SkipWhen>` · `<ActivationHint>` · `<CheckPhase>` · `<RequiresVerification>` · zero-or-more `<CrossRef id>`.

| Category | Rule id | File | CheckPhase | RequiresVerification | CrossRef |
|---|---|---|---|---|---|
| `Coding` | `typescript-rules` | `coding/typescript-rules.xml` (589) | `typecheck` | `check-command` | — |
| | `svelte5-runes` | `coding/svelte5-runes.xml` (248) | `typecheck` | `check-command` | `typescript-rules`, `sveltekit-rules` |
| | `sveltekit-rules` | `coding/sveltekit-rules.xml` (247) | `typecheck` | `check-command` | `svelte5-runes`, `typescript-rules` |
| `Testing` | `testing-common` | `testing/common.xml` (269) | `test` | `check-command` | — |
| | `vitest-rules` | `testing/vitest-rules.xml` (326) | `test` | `check-command` | `testing-common` |
| | `node-test` | `testing/node-test.xml` (298) | `test` | `check-command` | `testing-common` |
| | `playwright-cli` | `testing/playwright-cli.xml` (199) | `test` | `check-command` | `playwright-e2e` |
| | `playwright-e2e` | `testing/playwright-e2e.xml` (361) | `test` | `check-command` | `playwright-cli` |
| | `storybook-usage` | `testing/storybook-usage.xml` (173) | `test` | `check-command` | `storybook-setup` |
| | `svelte-testing` | `testing/svelte-testing.xml` (237) | `test` | `check-command` | `node-test`, `vitest-rules`, `svelte5-runes` |
| `Infra` | `eslint-setup` | `infra/eslint-setup.xml` (475) | `lint` | `check-command` | — |
| | `git-setup` | `infra/git-setup.xml` (267) | *(empty)* | *(empty)* | — |
| | `nodejs-npm-setup` | `infra/nodejs-npm-setup.xml` (394) | *(empty)* | *(empty)* | — |
| | `storybook-setup` | `infra/storybook-setup.xml` (153) | `test` | `check-command` | `storybook-usage` |

**Not registered in `knowledge.xml` but present on disk**: `coding/uikit-component-storybook.xml` (342), `coding/uikit-component-svelte.xml` (339), `coding/uikit-spec-drafting.xml` (238) — 919 LOC of rule text no `<Rules>` entry names, so no `<Triggers>` can ever activate them; they are reachable only through another rule's `<DependsOn>`. `ai/directives/architecture/` holds only a `README.md` (21 LOC) — the `AX_RULE_ACTIVATION` Stage B walks "the axioms of `architecture/*` and `infra/*` rules", but the `architecture/*` tree is empty of rules.

**Stack coverage of the shipped rule set**: TypeScript (1) · Svelte/SvelteKit (2) · uikit-Svelte/Storybook (3, unregistered) · node:test + Vitest + Playwright + Storybook (7) · eslint + git + node/npm + Storybook setup (4). There is **no Python, Go, Swift, Rust, Java, or "anystack" rule file anywhere** under `ai/directives/`.

### 5.2 `<DependsOn>` graph (the cascade edges)

Declared in the rule files themselves, not in `knowledge.xml`:

| Rule file | `<DependsOn>` |
|---|---|
| `coding/svelte5-runes.xml` | `coding/typescript-rules.xml` |
| `coding/sveltekit-rules.xml` | `coding/typescript-rules.xml`, `coding/svelte5-runes.xml` |
| `coding/uikit-component-svelte.xml` | `coding/svelte5-runes.xml`, `coding/uikit-spec-drafting.xml` |
| `coding/uikit-component-storybook.xml` | `testing/storybook-usage.xml`, `coding/uikit-component-svelte.xml` |
| `testing/playwright-cli.xml` | `coding/typescript-rules.xml` |
| `testing/playwright-e2e.xml` | `coding/typescript-rules.xml`, `testing/playwright-cli.xml` |
| `testing/svelte-testing.xml` | `testing/vitest-rules.xml`, `coding/svelte5-runes.xml` |
| `coding/typescript-rules.xml`, `coding/uikit-spec-drafting.xml`, `testing/common.xml`, `testing/node-test.xml`, `testing/storybook-usage.xml`, `testing/vitest-rules.xml`, all 4 `infra/*` | *(none — leaves)* |

Note the drift: `knowledge.xml` says `vitest-rules` / `node-test` / `svelte-testing` inherit `testing-common` via `<CrossRef>`, but **none of the three declares `testing/common.xml` in `<DependsOn>`** — so `checkRulesCascadeClosure` never demands it in a phase's `Rules:` list. `<CrossRef>` is prose for the agent; `<DependsOn>` is the mechanical edge.

### 5.3 `shared/sdd/rules-cascade.ts` (82 LOC) and how `sdd-check` uses it

Three pure exports, `@consumers: sdd-check.cmd`:
- `normalizeRulePath(ticketFile, repoRoot, linkTarget)` (`:22-33`) — resolves a phase `Rules:` bullet's link target to a repo-root-relative POSIX path. **Absolute forms (`/…` or `C:\…`) are returned verbatim on purpose**: "Relativizing them first would disguise an absolute injection as traversal" (`:27-29`), leaving rejection to the strict repository-identity boundary.
- `parseRuleDependsOn(ruleFileContent)` (`:41-45`) — `/<DependsOn>([\s\S]*?)<\/DependsOn>/` then `^\s*-\s+(\S+)` bullets, verbatim; `[]` when absent.
- `checkRulesCascadeClosure(file, phaseId, rules, depsMap)` (`:56-82`) — DFS over `depsMap`; every direct + transitive dep not already in the phase's declared list yields one **error** `SDD_RULES_CASCADE_UNRESOLVED` (`Phase <P>: rule dependency "<dep>" is required transitively but is not in the phase's Rules: list — the closure over <DependsOn> is incomplete.`). An empty `Rules:` list short-circuits to `[]` — **a phase that declares no rules is never flagged**.

Wiring in `cli/cmd/sdd-check/sdd-check.cmd.ts`: `checkTicketRulesCascade` (`:417-...`) iterates `selectedRulePhases(content, selection?.phaseIds)`, filters bullets to `*.xml`, normalizes each (`:426-428`), then `buildRuleDepsMap(repoRoot, seeds)` (`:395-415`) walks the reachable `<DependsOn>` graph with a memoized `getRuleDeps`/`ruleDepsCache` (`:384-392`). Critically: "failed nodes are never treated as proven leaves" — an unreadable rule file becomes a `ReadIssue`, not a silent leaf.

**How scaffold uses the rules** (`ai/kit/axiom/scaffold/*`, activated inside `scaffold.directive.xml` / its steps):
- `AX_RULE_ACTIVATION_PLAN` — "`ai/directives/knowledge.xml` (`<Rules>` section) is the canonical rule registry"; a rule is active for a phase iff its `<Triggers>` match **that phase's** `Target Files` + `kind` and `<SkipWhen>` does not apply; "Signal-based only — the directive carries zero hardcoded language/tool knowledge"; the phase's `Rules:` list must be the *explicit, fully-resolved transitive closure* over `<DependsOn>`, "the phase-subagent reads the list as-is and never walks `<DependsOn>` at runtime"; every `<RequiresVerification>` alias must resolve through infra-spec Verification Commands into the ticket Verification table.
- `AX_RULES_CASCADE_RESOLUTION` — effective rule set = union of 4 tiers, later overriding earlier: (1) traversed-scopes (transitive `depends-on` closure), (2) target-scope Effective Rules / Rules, (3) `module:<name>` Handoff Module Rules Additions, (4) task (operator-supplied). The **Cascade Table** (Scope × Categories) lives in `specs/<scope>/<scope>.3-tasks.md`, never in `specs/3-tasks.md`; "a ticket-level rule list is a structure violation".
- `AX_RULES_RESOLUTION_HARD_FAIL` — every ref must exist as `ai/directives/<category>/<rule>.xml`; a miss, or any placeholder (`TBD`, `<rule>`, "to be authored"), aborts scaffold rather than writing the ticket.
- `AX_RULE_ACTIVATION` — two-staged operator decision: Stage A locks the per-category shortlist, Stage B walks `architecture/*` + `infra/*` axioms for Accept (default) / Adapt / Override with every deviation in the Decision Log; `coding/*` / `testing/*` stay deferred to phase entry per `phase-execution-protocol`.
- `infra.directive.xml:83` — after the tool stack is finalized, look up each chosen tool in `knowledge.xml` `<Rules>` and match `<Triggers>` against tool name / config artefacts; record matched `<File>` paths in the spec's Effective Rules. A missing rule is resolved in-session by operator pick — **skip / research-and-author / defer** (`AX_SCOPE_RULES_DECLARATION`), with `research-and-author` WebFetching authoritative docs and writing a new `ai/directives/<category>/<name>.xml` after operator approval (`:131`).
- `sdd-new` and `shared/sdd/task-authoring-literals.ts` print the rule ID + href tuples straight out of `knowledge.xml` (§1.1, §2.1) — `loadRuleRegistry` / `parseRuleRegistry`; an invalid registry is exit `1` (`ERR` on `sdd-new`).
- `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml` — the audit checks compliance only against the rules the phase actually activated.

### 5.4 What `cli/cmd/sync` does with the rules — and `knowledge.xml` is **not** protected

`gennady sync [subdirs...] [--dry-run]` mirrors the installed package's `ai/directives/` into `<cwd>/ai/directives` (`cli/cmd/sync/sync-core.ts`).

- It is a **package-owned mirror, not an additive copy**: "A removed directive must disappear from the target too, otherwise an update can keep executing stale flow logic indefinitely" (`sync-core.ts:220-224`). Every target path not in the source is `status: 'deleted'` and `unlink`ed (`:238-243`).
- Ownership scoping (`scanTargetMirrorSpace`, `:140-173`): owned subdirs = the source's own top-level directories (or the `--subdirs` filter). A target subdirectory the package never shipped is a **project customization, left untouched and reported via `warnings`** (`:160-162`, test `leaves a target subdirectory the package does not own untouched, with a warning`). Dotfiles and `EXCLUDED_ENTRIES = new Set(['architecture'])` (`:16`) are skipped everywhere.
- **Root-level files including `knowledge.xml` are ordinary mirror candidates** whenever the whole package is synced without a subdir filter (`:165-170`). `scanDirectives` returns `knowledge.xml` alongside the subdir files (test `sync-core.test.ts:99-106` asserts `['coding/typescript.xml','knowledge.xml','sdd/discovery.xml']`; test `:142-149` asserts `architecture/` is excluded while `knowledge.xml` survives). Greps of `cli/cmd/sync/*.ts` and `shared/common/sync/*.ts` for `knowledge` return **no hits** — there is no special case.
- **Conclusion for this RC: `ai/directives/knowledge.xml` is NOT protected from overwrite.** A project that authored its own rules into `knowledge.xml` (the `research-and-author` path in `infra.directive.xml:131` explicitly produces exactly that) has it silently replaced by the package copy on the next `gennady sync`, and any project rule file under a package-owned subdir (`coding/`, `testing/`, `infra/`) is *deleted* as a stale mirror entry. Only a whole new subdirectory (e.g. `ai/directives/python/`) survives, with a warning. This is precisely what main's commit `f74c8c1d` ("feat(sync): knowledge.xml is project-owned — never clobber a project's rule registry") fixes — that fix is **absent from this RC branch**; see §9.

### 5.5 `cli/cmd/sync-skills` — pruning, and `__tests__` exclusion

`gennady sync-skills [names...] [--dry-run]` mirrors the package's `ai/skills` into `<cwd>/.claude/skills`, running a directives sync first (`sync-skills.cmd.ts:67-100 syncDirectivesFirst`).

- **No manifest.** Pruning is a pure source-vs-target diff (`sync-skills-core.ts`):
  - Files inside a kept skill that are absent from source → `status: 'deleted'` + `unlink` (`:381-391`), with the rationale "Existing skill directories are mirrors too. Removing only whole orphan skills leaves stale files inside a still-supported skill, which is just as dangerous as a stale directive."
  - Every target skill directory not in source is an orphan → `deleteOrphan` (`:395-403`). With a positional filter, only filtered names can be orphan-deleted (`:396-398`).
- **Exclusions**: `EXCLUDED_NAMES = new Set(['.DS_Store'])` plus any `name.startsWith('.')`, applied at 4 scan sites (`:22,36,84,168,337`). Grep for `manifest`, `__tests__`, `.test.` across `cli/cmd/sync-skills/*.ts` finds **nothing** — there is **no test-file or `__tests__` exclusion**. It is harmless today because `ai/skills/` ships only `SKILL.md`, `README.md`, and `prd-interview/PRD_TEMPLATE.md` (no test files at all, per `find`), but a skill that ever gained a `__tests__/` directory would be copied verbatim into every consumer's `.claude/skills`.

---

## 6. `ai/flow-eval/**` — the LLM eval harness (7 058 LOC across 42 files)

Purpose (`README.md:3-8`): "Checks whether a real model can walk one **phase** of the SDD flow like an ordinary developer … inside an isolated, disposable git sandbox. It is **not** a unit test of the directives and **not** a search for a pre-planted bug." Connects through `@opencode-ai/sdk` to an **already-running** OpenCode HTTP server; never spawns `codex`/`opencode`; never uses the source checkout as a sandbox.

### 6.1 Modules

| File | LOC | Responsibility |
|---|---|---|
| `cli.ts` | 309 | flags, provisions isolated sandboxes, runs the batch, persists each judge rationale; picks the objective gate per phase (`:259` → `{rule:'MIGRATION', …}`) |
| `provision.ts` | 1 341 | one temp git repo per scenario from `FIXTURE_FILES`; copies built SDD (`dist/**`, `ai/**`) + a CLI shim into an immutable snapshot |
| `runner.ts` | 168 | one OpenCode worker session per scenario; bounds concurrency + observation budget. Code defaults: `openai/gpt-5.6-luna` worker / `openai/gpt-5.6-sol` judge, concurrency 3, interval 300 000 ms, budget 6, tail 20 |
| `observer.ts` | 199 | per-interval bounded tail + status + events + diff → `progress`, `artifactProgress`, `repeated`, `waiting`, `stuck` |
| `judge.ts` | 74 | isolated judge session over a narrow evidence boundary; `parseVerdict` |
| `evidence.ts` | 308 | reads the bounded evidence (tracked + **untracked** files) |
| `quality-gate.ts` | 59 | objective R1 gate |
| `migration-grade.ts` | 145 | frozen deterministic grade for `phase: 'migration'` |
| `types.ts` | 270 | source of truth for scenario / phase / mode / fixture / judge types |
| `prompts.ts` · `opencode-runtime.ts` · `opencode-client.ts` · `sandbox-lifecycle.ts` · `session-directory.ts` | 91/144/17/110/19 | phase prompt selection, SDK adapter, sandbox lifecycle, session↔cwd registry |
| `scripts/` | — | `sandbox.ts` (107), `migration-eval.sh`, `roundtrip-eval.sh`, `roundtrip-grade.sh`, `reset-ticket.py`, `session-metrics.py`, `session-telemetry.py`, `upgrade-verification-tables.py`, `roundtrip-readiness-shim.package.json` (15) |
| `operator-approve.sh` | — | simulates a complete operator approval between phases (portal + Decision Log) |

### 6.2 `scenarios.json` — only **7** scenarios (58 LOC)

| id | phase | mode | fixture | scale | acceptance |
|---|---|---|---|---|---|
| `fibonacci-library` | `spec-authoring` | `full-spec-to-approval-1` | `fibonacci-library` | `function` | "Specifications only. Public API `nth(n: number): number` is pure. Integer n from 0 through 77 … Scope and one cohesive module spec exist, include Requirement IDs and negative scenarios, pass the mechanical check, receive one fresh semantic review, and leave Approval #1 pending." |
| `tic-tac-toe` | `scaffold` | `actual-tickets-to-approval-2` | `tic-tac-toe` | — | "…every runtime, package-manager, and configuration prerequisite to exactly one Bootstrap Requirements owner. Actual tickets and indexes … pass `sdd-check --task --authoring` plus `sdd-check --all` before review and Approval #2. A red ticket check returns to decomposition instead of being patched locally." |
| `slugify-toolchain` | `execute` | `canonical-execute` | `slugify-toolchain` | — | **none** (no `acceptance` field) |
| `broken-specs-repair` | `repair` | `fix-to-clean` | `broken-specs` | — | "`npx gennady sdd-check --all .` reports 0 errors; the invalid mermaid diagram is corrected to valid syntax, following the checker error message." |
| `infra-log-summary` | `task` | `brief-to-artifact` | `infra-log-summary` | — | "`golden/verify.sh` exits 0." |
| `infra-rotate-logs` | `task` | `brief-to-artifact` | `infra-rotate-logs` | — | "`golden/verify.sh` exits 0." |
| `infra-makefile` | `task` | `brief-to-artifact` | `infra-makefile` | — | "`golden/verify.sh` exits 0." |

**The type space is much larger than the scenario file.** `types.ts` declares 7 phases, 11 modes, and 14 fixtures; `provision.ts` ships all 14 `FIXTURE_FILES` — but `scenarios.json` exercises only 5 phases, 5 modes, 7 fixtures.

| Declared but **absent from `scenarios.json`** | |
|---|---|
| phases | `brownfield`, `migration` |
| modes | `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2` |
| fixtures | `brownfield-extend-cli`, `brownfield-fix-bug`, `brownfield-recover-spec`, `brownfield-delta-to-spec`, `brownfield-via-spec`, `brownfield-recover-in-scope`, `brownfield-recover-partial` |

So the 7 brownfield fixtures + the v1→v2 migration fixture exist and are golden-tested deterministically (§6.5), but **no LLM scenario ever runs them** from the reference file — they must be driven by hand or by `scripts/migration-eval.sh` / `roundtrip-eval.sh`.

### 6.3 Judge contract (`judge.ts`)

`composeJudgePrompt` sends exactly: `INTENT` · `ACCEPTANCE` (when present) · `STATE` (`{status, stuck, waiting, errors}`) · `DIFF` · `EVENTS` · `BOUNDED_TAIL`. Never the worker prompt, full transcript, or runner internals (`SddEvalJudgeInput`, `types.ts`). Rubric text embedded in the prompt: "A stuck or unfinished worker, cancelled required worker/tool, red required gate, or missing required approval-boundary artifact is a failure. A worker-authored risk acceptance never overrides a red gate. An explicit pending operator approval is valid only when that is the scenario target and the actual reviewed artifacts exist."

`parseVerdict` (`judge.ts:44-52`) accepts only an explicit first-line `VERDICT: pass|fail|inconclusive` (regex tolerates bold/backticks and the Russian `вердикт`); **no verdict line ⇒ `inconclusive`, never a prose guess**. The rationale documents the bug this replaced: the old `/ошиб|fail/` substring fallback "false-failed every error-handling scenario whose judge skipped the verdict line."

### 6.4 Quality-gate rules

`QUALITY-RULES.ru.md` (65 LOC) is the **backlog**, not the implementation. Two governing principles: (1) judge objectively via independent golden tests, never the worker's own self-written tests; (2) **reproducibility in BOTH directions** — a rule counts as implemented only when a conformant artifact provably passes AND a non-conformant one provably fails, both reproducibly.

| # | Rule | Artifact | Objective check | Iteration | Implemented in RC? |
|---|---|---|---|---|---|
| R1 | Структурная целостность | spec/ticket | `sdd-check --all` clean | **1** | **yes** — `quality-gate.ts` `parseSddCheckResult` + `checkR1Structure`; both-way test `quality-gate.test.ts` (3 cases, `parseSddCheckResult (R1, both outcomes)`) |
| R3 | Механические код-гейты | code | type-check + lint clean, `testcov --min` | **1** | **no dedicated gate function** — no `rule: 'R3'` anywhere in `ai/flow-eval/*.ts`; only indirectly via the fixture's own `sdd-verify` |
| R6 | Устойчивость: типизированные ошибки, называющие аргумент | code | golden negative tests + small lint | 2 | no |
| R2 | Независимые golden-тесты корректности | code | fixture reference test-set over the worker's implementation | 3 | partially — the `golden/` sets exist per fixture and are asserted by the deterministic tests, but not wired as a named eval rule |
| R4 | Трассируемость бриф→спека→тест | spec | mapping check | 4 | no |
| R5 | Воспроизводимость исхода ≥ порога на N | flow | batch clean-rate + failure-form capture | 5 (сквозное) | no |

Deferred by the doc itself: structured logging/observability, multi-module integration tests, security/secrets, perf/complexity, semantic decomposition quality, research depth.

The **only two objective gate ids the code actually emits** are `R1` (`quality-gate.ts:31,33,34,57`) and `MIGRATION` (`cli.ts:259`). **There is no `R-COMPLETE` rule** — grep for `R-COMPLETE` / `R_COMPLETE` across the checkout returns nothing; the nearest thing is the *completion* work recorded in `docs/flow-verification-redesign.md` + `docs/flow-verification-ledger.md`, landed as the group-audit/review receipt mechanism (`AX_GROUP_AUDIT_LEAVES_A_RECEIPT` / `AX_GROUP_REVIEW_LEAVES_A_RECEIPT`, `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING`, §2) plus the `session-metrics.py gate` RED-FIRST gate, not as a named `R*` quality rule.

`migration-grade.ts` — the frozen objective grade for `phase: 'migration'`, deliberately **not** "sdd-check clean" because "The v1→v2 migration document varies in CONTENT run to run". `pass = flowVersion === 'v2' AND no migration-introduced ERROR-severity finding among MIGRATION_CRITICAL_CODES = {SDD_BROKEN_SPEC_REF, SDD_BROKEN_SPEC_ANCHOR, ERR_CLI_SDD_CHECK_READ_FAILED}` (`:31-36,:98-101`). Everything else that rises vs the pre-migration baseline is reported as `backlog`, never a failure: "Pre-existing findings never fail a migration; new ones always do." Baseline captured on the fresh v1 fixture by `captureBaseline` before the worker runs.

### 6.5 Deterministic tests — `ai/flow-eval/__tests__/` (10 files, 2 002 LOC, **75 test cases**), run by `npm run test:sdd-flow-eval`

| File | LOC | Cases | Suites |
|---|---|---|---|
| `harness.test.ts` | 1 128 | 29 (flat `test()`) | observer fingerprinting incl. tool calls · no sleep after final observation · runner abort after first unchanged slice · runner abort on exhausted budget · CLI rejects invalid observation controls before provisioning · slugify contract + `[COR-REQ-*]`-tagged variants · stuck/errors/waiting marking · **abort when a worker reads installed Gennady bundles** · abort on an SDD CLI probe wrapped in stderr redirection · one checker-output filter ≠ terminally stuck · P9 calibration metrics (nine repeated full spec writes; P9 misunderstanding → tool signifier; single P9.6 run) · judge bounded-evidence boundary · phase prompt selects the installed SDD flow + approval boundary · bounded parallel batches · judge adapter typed result · judge parser FAIL-containing-"pass" · judge parser bold PASS after earlier FAIL · every SDK session call preserves its sandbox cwd and rejects a cross-sandbox prompt · SDK evidence includes untracked artifacts omitted by `session.diff` · SDK evidence includes bounded child-worker progress |
| `brownfield-spec-golden.test.ts` | 265 | 19 | `recover-spec` · `delta-to-spec` · `modify-via-spec` · recover matrix **S1** (scope exists, module absent) · recover matrix **S2** (partial module spec, extend it) — all "(both outcomes reproducible)" |
| `brownfield-golden.test.ts` | 137 | 6 | `brownfield code-delta golden gate` · `brownfield bug-fix golden gate` (both outcomes) |
| `infra-golden.test.ts` | 128 | 3 | `infra task golden gates (both outcomes reproducible)` |
| `sandbox.test.ts` | 94 | 7 | `eval sandbox script (deterministic prepare/clean)` |
| `migration-grade.test.ts` | 87 | 7 | `migration-grade (histogram + deterministic baseline-diff grade)` |
| `sandbox-lifecycle.test.ts` | 80 | 4 | `sandbox lifecycle (extract artifacts, then tear down)` |
| `fixture-coverage.test.ts` | 51 | 1 | every node-project fixture declares `c8` **and** ships `scripts/test-coverage.mjs`, and its `test:coverage` script carries **no glob token** — because "the phase receipt fingerprints every path token in verification scripts and rejects globs (`shared/common/repo-path.ts`'s `GLOB_META`)" (chain9); a `.mjs` wrapper keeps it one exact-file token |
| `judge.test.ts` | 34 | 3 | `parseVerdict` |
| `quality-gate.test.ts` | 27 | 3 | `parseSddCheckResult (R1, both outcomes)` |
| `fixtures/p9-misunderstood-cases.json` | 75 | — | bounded P9 calibration data |

### 6.6 Docs

| Doc | LOC | Content |
|---|---|---|
| `README.md` | 71 | what it is, documentation map, wiring table, the one canonical `npm run sdd-flow-eval` command, code-defaults-vs-what-we-run, the fake-backed regression suite |
| `RUNBOOK.ru.md` | 211 | how to run — server setup, env, live-run procedure, reading observations, verdict rules, gotchas (incl. the sequential-batch note: parallel authoring sessions overload one test server) |
| `WRITING-EVALS.ru.md` | 158 | how to add an eval — scenario shape, fixture anatomy, coverage-passability rules, judge contract, step-by-step |
| `QUALITY-RULES.ru.md` | 65 | the R1–R6 backlog + both-outcomes discipline + the brownfield eval set plan (E-bf-recover · E-bf-delta · E-bf-delta-to-spec · E-bf-via-spec) |
| `ROADMAP.ru.md` | 77 | forward plan |
| `PROGRESS-REPORT.ru.md` | 125 | before→after report for colleagues |
| `EXPERIMENTS-LOG.ru.md` | 262 | run-by-run experiment log (cited by `migration-grade.ts` for why the bar is baseline-diff) |
| `INFRA-TASKS-RESEARCH.ru.md` | 58 | research behind the infra `task` fixtures |
| `P9-UNDERSTANDING-SIGNIFIERS.md` / `P9-VERIFICATION.md` | 43/50 | the P9 misunderstanding-signifier calibration |
| `docs/flow-verification-redesign.md` | 167 | the plan: "the whole SDD stack guards against a **fraudulent DONE** … but nothing catches an **abandoned artifact**"; H1–H4 blind spots per layer; `AX_PHASE_VERIFIED_BEFORE_CLOSE` proposal; ordered fix plan |
| `docs/flow-verification-ledger.md` | 91 | append-only ledger: **A1–A6 confirmed**, **B1–B10 refuted/rejected** (incl. B1 one universal axiom over all phases, B2 audit receipt at `sdd-log close` = deadlock, B4 sidecar file, B5 git-note), **C1–C5 accepted**, **D metrics** (`tool_calls_total`, `steps`, `impl_receipt`, `audit_receipt`, `review_receipt`, `bench_soft`, `stuck`, non-regression rule, `.results/metrics-ledger.jsonl`), **E1–E3 landed + follow-on** (E3: migration must emit `PHASE_RECEIPTS:v1` or group enforcement stays grandfathered off — open) |
| `docs/roundtrip-wall3-assessment.md` | 79 | round-trip findings (**the only place `gennady.yaml` is mentioned anywhere**, §1.2) |
| `docs/swiftlint-toolchain-setup.md` | 61 | the Swift 6.2 headless toolchain used by the round-trip bench — **the only Swift artefact in the repo** |

### 6.7 Honest coverage matrix — flow phase / problem group × {LLM scenario · deterministic test · nothing}

| Flow phase / problem group | LLM scenario (`scenarios.json`) | Deterministic test | Verdict |
|---|---|---|---|
| Router intent classification / `LOGIC_SWITCH` routing | **none** | `cli/__tests__/directive-tool-contract` (tool-call shape only, not routing) + `ai/flow-sim` (manual, human-orchestrated) | **nothing automated** |
| Spec authoring → approval #1 | ✅ `fibonacci-library` (scale `function`) | `ai/kit/stateless-sdd-flow-contract.test.ts` (contract text only) | LLM only, 1 scenario, smallest scale |
| Module decomposition | **none** | `shared/sdd/module-specs.test.ts`, `check-*` | no end-to-end |
| Infra scope authoring / tool-stack decision | **none** | — | **nothing** |
| Interface scope authoring | **none** | — | **nothing** |
| Scaffold → approval #2 | ✅ `tic-tac-toe` | `project-feasibility.test.ts`, `phase-verification-plan.test.ts`, `templates.test.ts`, `skeleton-*.test.ts` | both |
| Execute (one ticket, canonical) | ✅ `slugify-toolchain` (**no `acceptance` field** — judge runs on intent alone) | `sdd-task`/`sdd-verify`/`sdd-log` cmd tests, `phase-receipt.test.ts`, `group-receipt.test.ts` | both, but the LLM scenario is un-anchored |
| Execute batch / multi-ticket queue | **none** | `sdd-task.cmd.test.ts` (execution map) | no end-to-end |
| Audit (group / per-task) | **none** | `audit-group.test.ts`, `group-receipt.test.ts`, `phase-receipt-check.test.ts` | deterministic only — no LLM eval of audit judgment |
| Code-review | **none** | — | **nothing** |
| Reconcile (`fix` / `from-code`) | **none** | — | **nothing** (only `ai/flow-sim/S8`, `S9` manual maps) |
| Repair (`sdd-check` red → clean) | ✅ `broken-specs-repair` | `check*.test.ts` (28 files) | both |
| Banal infra task (bash/Makefile) | ✅ ×3 (`infra-log-summary`, `infra-rotate-logs`, `infra-makefile`) | `infra-golden.test.ts` (3, both outcomes) | both |
| Brownfield code delta / bug fix | **none** | `brownfield-golden.test.ts` (6, both outcomes) | golden only — fixtures shipped, no scenario |
| Brownfield spec recovery (`recover-spec`, `delta-to-spec`, `modify-via-spec`, matrix S1/S2) | **none** | `brownfield-spec-golden.test.ts` (19, both outcomes) | golden only |
| v1→v2 migration | **none in `scenarios.json`** (phase + mode declared; driven by `scripts/migration-eval.sh`) | `migration-grade.test.ts` (7), `sdd-migrate.cmd.test.ts`, `migration-plan/move/id-replace/anchor-inject` tests | grade logic tested; no reference LLM scenario |
| Readiness bootstrap (`not-ready` → 8 npm bricks) | **none** | `readiness.test.ts`, `gate-queue.test.ts` | deterministic only |
| Discover-from-code (project-scale brownfield) | **none** | — | **nothing** |
| Critic / semantic review quality | **none** | — | **nothing** (by nature) |
| Harness self-correctness (observer, runner, judge, sandbox, evidence) | — | 46 cases (`harness` 29 + `sandbox` 7 + `sandbox-lifecycle` 4 + `judge` 3 + `quality-gate` 3) | well covered |
| Non-Node stacks (python / golang / swift / anystack) | **none** | **none** (only `docs/swiftlint-toolchain-setup.md`, a manual bench note) | **nothing** |

Aggregate: 7 LLM scenarios covering 5 of 7 declared phases; 75 deterministic cases; 8 flow surfaces (infra authoring, interface authoring, code-review, reconcile, discover-from-code, batch execute, module decomposition end-to-end, router routing) have **no automated coverage at all**.

### 6.8 `ai/flow-sim/**` and `ai/inspector/**` (brief)

**`ai/flow-sim`** — 13 markdown files, 4 123 LOC, **no code, no npm script**. Rationale (`README.md:3-6`): unit tests cover `cli/cmd/*` and `shared/sdd/*`, but "директивы … не код: они читаются и «исполняются» агентом-интерпретатором", so the only way to verify a `LOGIC_SWITCH` routes correctly, a `STOP` holds, and no directive is loaded that should not be, is a live run on a frozen scenario. `PROTOCOL.md` defines three roles — **Executor** (cheap model, blind run, gets the scenario map with `## Checkpoints` cut out), **Verifier** (full map + TRACE + `git diff`, verdict `CONFIRMED`/`VIOLATED` with evidence plus an "Импровизации" section), **Arbiter** (manual: directive defect vs executor weakness). 11 wave-1 scenario maps: `S1-route-new-scope`, `S2-preflight-migration`, `S3-preflight-carveout`, `S4-discover`, `S5-recover`, `S6-scaffold-ticket`, `S7-execute-lifecycle`, `S8-reconcile-trivial`, `S9-reconcile-from-code` (670 LOC, the largest), `S10-multi-scope-route` (213), `S11-migration-full`. Entirely human-orchestrated — nothing in `npm test` runs it.

**`ai/inspector`** — a plain TS + static-HTML tool ("**Не через SDD.** Это обычный инструмент"): `core/` (pure, no DOM) parses real `ai/skills/*/SKILL.md` and `ai/directives/sdd-v2/*.directive.xml` into a `TraceNode` tree (`model.ts`, `parse-directive.ts`, `parse-skill.ts`, `resolve.ts` — recursive `READ_AND_USE` expansion with cycle stop, `scan.ts`), `generate.ts` writes `web/trace.json`, `web/` (index.html + app.js + markdown.js + debug.js + styles.css) renders the expandable tree, `e2e/inspector.spec.ts` is a Playwright check. Tests: `core/__tests__/{parse-directive,parse-directive-lazy,parse-skill}.test.ts` + `web/__tests__/{debug,markdown}.test.ts` (run by `npm run inspector:test`, **not** by `npm test`). Its stated audit value: "Парсер — общий (любой скил/директива); где спотыкается — это и есть находка аудита."

---

## 7. Self-hosting — gennady's own SDD state

**The repo that ships SDD v2 is itself still on v1.** `sdd-state` reports `FLOW_VERSION=v1` and `NEXT=migrate the v1 task layout before entering the v2 scaffold flow`.

### 7.1 Layout

| Tree | Count | Notes |
|---|---|---|
| `specs/` | 86 files, 12 scope directories + `README.md` (portal) + `3-tasks.md` (project index) | Every scope has a `.spec.md`; `agent-inbox` (19 files), `cli` (25), `ai-skills` (13), `agent-mon` (7), `vcs` (6), `agent-mon-cli` (4), `dbc` (3), `agent-run` (3), `infra-base`/`infra-npm-publish`/`mr-stats`/`shared` (1 each) |
| `tasks/` (v1 layout) | 138 files, **127 `*.task-*.md` tickets** | `cli` 48 · `agent-inbox` 27 · `vcs` 16 · `dbc` 15 · `agent-mon` 7 · `agent-mon-cli` 4 · `infra-npm-publish` 4 · `agent-run` 3 · `mr-stats` 2 · `ai-skills` 1 |
| v2 tickets under `specs/` (`*.task.<ID>.md`) | **1** | `specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md` |
| `*.3-tasks.md` indexes | 3 | `specs/3-tasks.md` (project), `specs/ai-skills/ai-skills.3-tasks.md` (scope), `specs/ai-skills/directive-assembly/directive-assembly.3-tasks.md` (module) |

`specs/3-tasks.md` (the project index) declares this explicitly:
- Scope Tracker: 11 of 12 scopes have Index `—`, Tasks `0`, Done `0/0`; only `ai-skills` has an index with `1` task, `0/1` done.
- Comment: "Scopes without a v2 `Index` here still carry legacy v1 tickets under `tasks/<scope>/` — untouched by this scaffolding run, out of its blast radius (`ai-skills/directive-assembly` only)."
- Comment: "no cross-scope integration tickets exist yet — this scaffolding run only decomposed `ai-skills/directive-assembly`."
- `PROJECT-TASKS-D-1`: "первая v2-задача проекта (`specs/3-tasks.md` не существовал до этого прогона); скаффолдинг ограничен модулем `directive-assembly` скоупа `ai-skills` — остальные 11 скоупов остаются на legacy v1-раскладке (`tasks/<scope>/`), не мигрируются этим прогоном".

It also carries the project-wide conventions inherited by every ticket: the **Baseline Completion Rule** (a Round cannot go `[x] DONE` until every phase is `[x]`, every BDD scenario is mapped to a test or `Deferred Test Ownership`, verification commands ran with exit recorded, every entity beyond the Inventory is logged `intro …`, and a Handoff line closes each phase), the **Execution-Log token vocabulary** (`intro` · `decision` · `tried` · `discovery` · `insight` · `verified` · `ver` · `BLOCKED` · `DONE`, with "A `[x]` line with an unreplaced `<…>` placeholder is fabricated (BLOCKER)"), and the **Post-task hook** ("until PASS the round is closed-but-unverified and dependents are blocked").

### 7.2 `sdd-state .` snapshot (run read-only)

```
FLOW_VERSION=v1
PORTAL=present  specs/README.md
[READINESS] package.json ✔ · all 8 required scripts ✔ · lint→gennady ✔ · check→read-only ✔ · gennady-installed ✔
READINESS=ready · AUTHORING_READY=no · EXECUTION_READY=yes · GATE_QUEUE=none
NEXT=migrate the v1 task layout before entering the v2 scaffold flow
[SPEC_SCHEMA] VERSION=sdd-v2 · STATUS=current · all observed scope/module specs are current
[SCOPES] 12 — 10 done, agent-inbox wip, mr-stats wip
[GRAPH] L0 infra-base · L1 agent-mon, agent-run, dbc, infra-npm-publish, shared, vcs · L2 agent-mon-cli, cli · L3 ai-skills, mr-stats · L4 agent-inbox
[PROBE] CODE=present 1382 file(s) · code-dirs ., ai, cli, e2e, scripts, services, shared, test, utils · INFRA=present · configs tsconfig.json, .prettierrc.json, vite.config.ts
```

Note the internal tension: `READINESS=ready` and `EXECUTION_READY=yes`, but `AUTHORING_READY=no` and the flow-version diagnostic blocks the v2 scaffold path.

### 7.3 `sdd-check --all .` — run read-only, exit **1**

Command actually run: `sh -c 'cd <rc> && node --import tsx cli/gennady.ts sdd-check --all .'`.

```
[sdd-check] 198 error(s), 431 warning(s) across 212 file(s)
next: исправь перечисленные файлы в текущем владеющем шаге и повтори ту же команду; `/sdd-reconcile` нужен только для drift уже утверждённых артефактов.
next: язык — калька за калькой, по месту (`file:line`) правь всё предложение целиком.
```

Finding lines by tree: **507 under `tasks/`** (the un-migrated v1 half) vs **122 under `specs/`**.

| Errors (198 total) | n | Tree |
|---|---|---|
| `SDD_VERIFICATION_TABLE_INVALID` | 47 | 46 `tasks/`, 1 `specs/` |
| `SDD_FABRICATED_DONE` | 44 | all `tasks/` |
| `SDD_BDD_REQUIREMENT_UNTRACED` | 37 | all `specs/` |
| `SDD_DEP_UNRESOLVED` | 18 | `tasks/` |
| `SDD_SECTION_OVERLAP` | 9 | 7 `tasks/`, 2 `specs/` |
| `SDD_RESEARCH_DISPOSITION_MISSING` | 6 | `specs/` |
| `SDD_BROKEN_SPEC_REF` | 6 | `tasks/` |
| `SDD_TRACKER_STATUS_DRIFT` | 5 | `tasks/` |
| `SDD_PHASE_SECTION_ORPHAN` | 4 | `tasks/` |
| `ERR_CLI_SDD_CHECK_READ_FAILED` | 4 | `tasks/` |
| `SDD_TASK_ID_COLLISION` | 3 | `tasks/` |
| `SDD_ANCHOR_UNBALANCED` | 3 | 2 `tasks/`, 1 `specs/` |
| `SDD_SPEC_SECTION_MISSING` | 2 | `specs/` |
| `SDD_PHASE_DEP_UNRESOLVED` | 2 | `tasks/` |
| `SDD_DIAGRAM_INVALID` | 2 | `tasks/README.md:122`, `tasks/cli/README.md:101` — mermaid labels with `(`/`:` unquoted |
| `SDD_RULES_CASCADE_UNRESOLVED` · `SDD_PHASE_SECTION_MISSING` · `SDD_MODULE_DAG_CYCLE` · `SDD_DONE_WITH_ACTIVE_BLOCKER` · `SDD_DIAGRAM_CAPTION_MISSING` · `SDD_BDD_MISSING_NEGATIVE` | 1 each | `SDD_MODULE_DAG_CYCLE` is `specs/agent-inbox/agent-inbox.spec.md` ("module dependency graph (## 9) has a cycle") |

| Warnings (431 total) — top | n |
|---|---|
| `SDD_BDD_COVERAGE_ROW_UNPARSED` | 140 |
| `SDD_LEGACY_TICKET_UNANCHORED` | 76 (the v1 tickets with no `<!--SECTION:…-->` anchors — exactly what `sdd-migrate anchors` fixes) |
| `SDD_BDD_SCENARIO_UNTESTED` | 70 |
| `SDD_TRACKER_MISSING_ROW` | 37 |
| `SDD_MODULE_NO_CALL_CHAIN` | 26 |
| `SDD_DIAGRAM_CAPTION_MISSING` | 15 |
| `SDD_MODULE_NOT_IN_INDEX` | 11 (all `specs/cli/cli.spec.md` — 11 CLI module specs absent from the parent Module Map: `sdd-check`, `sdd-extract`, `sdd-log`, `sdd-migrate`, `sdd-new`, `sdd-state`, `sdd-sync`, `sdd-task`, `sdd-verify`, `testcov`, `yagni`) |
| `SDD_DONE_WITH_PLACEHOLDERS` | 11 |
| `SDD_BROKEN_SPEC_ANCHOR` | 11 |
| `SDD_MODULE_OVERSIZED` · `SDD_LANGUAGE_CALQUE` | 9 each |
| `SDD_DL_LEGACY_ID` | 4 |
| `SDD_SCOPE_DEP_UNDECLARED` · `SDD_BDD_TESTFILE_AMBIGUOUS` | 3 each |
| `SDD_TRACKER_ORPHAN_ROW` · `SDD_RESEARCH_UNREGISTERED` | 2 each |
| `SDD_STATUS_UNPARSEABLE` · `SDD_MISSING_TASK_ID` | 1 each |

**Honest reading.** The 44 `SDD_FABRICATED_DONE` + 46 `SDD_VERIFICATION_TABLE_INVALID` + 76 `SDD_LEGACY_TICKET_UNANCHORED` are structural consequences of the v1 layout that `sdd-migrate` exists to repair — they are pre-existing debt, and per `migration-grade.ts`'s own bar they would not fail a migration. The genuinely v2-side findings are the 37 `SDD_BDD_REQUIREMENT_UNTRACED`, 6 `SDD_RESEARCH_DISPOSITION_MISSING`, 11 `SDD_MODULE_NOT_IN_INDEX`, and 1 `SDD_MODULE_DAG_CYCLE` in `specs/` — i.e. the shipped specs do not pass the checker their own CLI enforces on consumers. The RC is therefore **not self-hosting the v2 flow**: 1 of 128 tickets is v2, 1 of 12 scopes has a v2 index, and `sdd-check --all` is red on the project's own `specs/`.

---

## 8. Test topology

### 8.1 `scripts/test-topology.ts` (360 LOC) — the executable runner behind `npm test`

Four **disjoint and exhaustive** layers (`TEST_LAYERS = ['unit','contract','local','external']`, `:10`). `assertTopology` (`:196-213`) throws `[test-topology] invalid classification:` if any discovered test is unclassified **or** matches two layers — so the classification is a hard invariant, not a convention.

`discoverTests` (`:156-167`) walks `TEST_ROOTS = ['ai','cli','services','shared']` for `*.test.ts` and drops: anything under `/agent-inbox/`, `/serve/__tests__/`, `.integration.test.`, `.real-integration.test.`, plus `V2_GATE_EXCLUDED_NAMES = {http-server.test.ts, eval-driver.test.ts, reviewer.e2e.test.ts, full-flow.blackbox.test.ts, run-mode.test.ts, harness.test.ts}` (`:25-34`). The `harness.test.ts` exclusion is documented: it provisions three fixture sandboxes and spawns the eval CLI + type-check in each, so "under c8 coverage instrumentation this deterministically exceeds the offline commit gate's per-test budget and cancels — not a real failure. It keeps its home in `npm run test:sdd-flow-eval`."

`classifyTest` (`:175-194`), first match wins:

| Layer | Rule |
|---|---|
| `external` | path contains `/e2e/` or `.e2e.test.` |
| `contract` | `ai/kit/__tests__/*` (non-e2e) · `/directive-tool-contract/` · basename contains `contract` · `shared/common/__tests__/test-topology.test.ts` |
| `local` | `/tool-behavior/` · `services/remote-console/` · `services/agent-mon/providers/claude/__tests__/ps.test.ts` · `.integration|.blackbox|.observation.test.` · **or** any `LOCAL_BOUNDARY_SIGNALS` hit in the source (`:131-139`): real `child_process` import · network-module import (`http\|https\|net\|tls\|dgram\|undici`) · `createServer(`/`.listen(` loopback server · `setupMockAgent` · `http(s)://127.0.0.1\|localhost` loopback client · `createGitFixture` · a `@file: Integration test` header |
| `unit` | starts with one of `UNIT_ROOTS = ['ai/flow-eval/','ai/inspector/','cli/','services/','shared/','utils/']` |

Coverage partitioning (`coveragePartitions`, `:221-237`): **`observed`** = `unit + contract` under c8 ("c8 observes production code"); **`black-box`** = `local + external` with no c8 ("no c8: subprocess boundary"). Every file runs exactly once.

Hermetic guards:
- `unit` mode injects a **network guard** as a `data:text/javascript` `--import` module that replaces `fetch`, `WebSocket`, `http/https.request/get`, `net.connect/createConnection`, `net.Socket.prototype.connect`, `tls.connect`, `dgram.createSocket` with throwers carrying `ERR_TEST_UNEXPECTED_NETWORK` (`:83-116`).
- Coverage mode injects a child-environment guard that clears `NODE_V8_COVERAGE` for spawned children, "preventing its later CLI/git/npm children from emitting irrelevant raw profiles".
- `createTestEnvironment` scrubs 40 named `SENSITIVE_TEST_ENV_KEYS` (GitLab/GitHub/OpenAI/Anthropic/Google/AWS/Azure/npm tokens, `GIT_ASKPASS`, `SSH_ASKPASS`, …) plus anything matching `CREDENTIAL_ENV_KEY` or `NPM_AUTH_ENV_KEY`; the external layer is opt-in via `EXTERNAL_TEST_OPT_IN_ENV_KEYS = ['GENNADY_E2E','GENNADY_OPENCODE_INTEGRATION']`.
- `OUTER_TEST_CONCURRENCY = 6` (`:23`), chosen because "several local suites launch real CLI/npm/git subprocesses, and sdd-verify already overlaps four fixture CLIs internally".

**Live `check` output (run read-only)**:
```
unit=211 contract=16 local=51 external=8
coverage observed=227[unit+contract] black-box=59[local+external]
```
→ **286 test files** in the gate.

Modes (`help`, `:302-...`): `unit` (fast hermetic layer only) · `deterministic` (all four layers, no c8) · `coverage` (the complete corpus once: unit+contract under c8, local+external without) · `check` (validate disjoint + exhaustive classification, print the counts) · plus a per-file `layer\tfile` listing mode.

### 8.2 `npm test` composition and the surrounding scripts

| Script | Command | What it covers |
|---|---|---|
| `test` | `node --import tsx scripts/test-topology.ts deterministic` | all 286 files, four layers, no coverage |
| `test:coverage` | `… test-topology.ts coverage` | the two partitions, c8 on `observed` only |
| `test:topology` | `… test-topology.ts check` | classification invariant |
| `test:unit` | *(not defined in `package.json` — the `unit` mode is reachable only by invoking the script directly)* | — |
| `test:e2e` | `GENNADY_E2E=1 node --import tsx --test --experimental-test-module-mocks cli/__tests__/e2e/*.test.ts` | 6 e2e suites: `e2e.test.ts`, `lint.e2e`, `orient.e2e`, `real-toolchain.e2e`, `sdd-extract.e2e`, `sync-skills.e2e`, `sync.e2e` (+ `fixtures/`, `setup.ts`) |
| `test:integration` | explicit file list under `services/agent-inbox/**` + `services/mr-stats/**`, `--test-concurrency=2` | agent-inbox / mr-stats integration — **excluded from `npm test` by `discoverTests`** |
| `test:sdd-flow-eval` | `node --import tsx --test ai/flow-eval/__tests__/*.test.ts` | the 75 flow-eval cases incl. `harness.test.ts` (excluded from the main gate) |
| `inspector:test` | `node --import tsx --test ai/inspector/core/__tests__/*.test.ts ai/inspector/web/__tests__/*.test.ts` | inspector — **not in `npm test`** |
| `inspector:e2e` / `test:e2e:review-flow` | `playwright test --config=ai/inspector/playwright.config.ts` / `--config=e2e/inbox-serve/playwright.review-flow.config.ts` | Playwright; `e2e/inbox-serve/**` holds 34 spec/helper files + 4 playwright configs + `CHECKLIST.md` — none of it in `npm test` |
| `test:watch` | `tsx --test-loader 'cli/**/*.test.ts' 'shared/**/*.test.ts' 'services/**/*.test.ts'` | dev loop |
| `check` | `tsx cli/gennady.ts sdd-verify --profile full` | the read-only ladder: `type-check · test:coverage · lint · format · yagni` (§2) |
| `prepublishOnly` | `npm run lint && npm run test:e2e && npm run build:publish` | **note: does NOT run `npm test`** — only lint + e2e + build |
| `audit:sdd-templates` | `check:directives-fresh && audit:axioms && audit:contracts && audit:halts && check:directive-budgets` | the 5 kit gates (§3.3) |
| `prepare` | `[ -d .git ] && git config core.hooksPath scripts/git-hooks \|\| true` | installs the hook path |

**Coverage gap**: `npm test` excludes `harness.test.ts` (flow-eval's largest suite), all `services/agent-inbox/**`, `serve/__tests__`, every `*.integration.test.*`, and all Playwright specs. `prepublishOnly` runs neither `npm test` nor `audit:sdd-templates`, so a publish can ship a directive tree that fails `check:directives-fresh`.

### 8.3 `scripts/git-hooks/pre-commit` (7 077 bytes, the only hook)

Installed via `prepare` → `git config core.hooksPath scripts/git-hooks`. Design stance: **"VERIFY-ONLY, never mutate."** The rationale is a real incident — "A pre-commit hook that rewrites files (prettier --write, autofix) but does not re-stage them lets the commit capture the pre-fix bytes while `prettier --check` passes over the already-fixed working tree — a green hook over a dirty commit (this repo hit exactly that)."

Three mechanisms:
1. **Env scrub** — `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR` before anything, because inherited git env vars redirected fixture `git init` calls into the real repo ("observed live: `git init` in a fixture re-initialized the shared .git as bare, and fixture commits landed on the real branch").
2. **Index-aware guard** — `git status --porcelain=v1 --untracked-files=all` filtered by `awk` to accept only cleanly-staged entries (column 2 blank) and refuse any working-tree change or untracked file: "The gate runs over the WORKING TREE; `git commit` records the INDEX."
3. **Six sequential gates**, each with its own `fail <gate>` message: `npm run check` → `npm run check:directives-fresh` → `npm run audit:axioms` → `npm run audit:contracts` → `npm run audit:halts` → `npm run check:directive-budgets`.

The failure banner is a long Russian instruction addressed at the committing *agent*: `--no-verify` / `-n` / any wrapper, env, or alias bypass is "ЗАПРЕЩЕНО", as is "починю следующим коммитом"; the only two permitted paths are fix the cause (`npm run fix && git add -u`) or stop and report to the operator verbatim. Closing line: "Красный гейт — не преграда на пути к цели. Красный гейт И ЕСТЬ работа, которую надо сделать."

Note the composition: `npm run check` = `sdd-verify --profile full`, which itself runs `test:coverage` → `test-topology.ts coverage`. So the commit gate transitively runs all 286 gate files plus the five kit audits, but **not** `test:e2e`, `test:integration`, `test:sdd-flow-eval`, or any Playwright suite.

---

## 9. EXTENSION POINTS & INTERSECTIONS

### 9.1 Where a per-stack preset (node / golang / anystack / python / swift) must plug in

There is **no stack abstraction in the RC**. Below is every place that would have to change, with the exact hard-coded Node assumption. `Plug-in shape today` = whether the code already has a registry/injection seam (✅) or is a literal (❌).

| Surface | File:line | Node assumption today | Seam? |
|---|---|---|---|
| **Readiness gate vocabulary** | `shared/sdd/readiness.ts:15-24` | `REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix']` — literal npm script names; only alias is `type-check`↔`typecheck` (`:29-31`) | ❌ module-level `const` |
| **Readiness input source** | `shared/sdd/readiness.ts:596-609` | `gatherReadinessInput(root)` reads **only** `<root>/package.json` `.scripts` | ❌ |
| **Gennady-installed probe** | `shared/sdd/readiness.ts:566-587` | `node_modules/.bin/gennady` OR `package.json name === 'gennady'` | ❌ |
| **Read-only / mutating switch detection** | `shared/sdd/readiness.ts:101-132` | hard-codes `eslint --fix`, `prettier --write`, `--autofix`, `--write`, `--fix` | ❌ |
| **`lint` must reach `gennady`** | `shared/sdd/readiness.ts:176` `lintReachesGennady` | hops only via `npm run` / `pnpm` / `yarn` | ❌ |
| **Script classification** | `shared/sdd/scripts.ts` | `classifyScript` matches `tsc`/`eslint`/`jest`/`vitest`/`prettier`/`biome` patterns over `package.json` scripts | ❌ |
| **Readiness ladder rung 4** | `shared/sdd/ladder.ts:36-39,68` | Infrastructure rung = `packageJsonPresent && typecheck && test && lint` | ❌ |
| **Verify gate command** | `shared/sdd/phase-verification-plan.ts:270` | gate command is literally `` `npm run ${script}` `` | ❌ |
| **Verify runner** | `cli/cmd/sdd-verify/sdd-verify.cmd.ts:225-226` | spawns `{command:'npm', args:['run', scriptName]}` | ❌ |
| **Repair adapters (`format:fix`/`lint:fix`)** | `cli/cmd/sdd-verify/repair-adapters.ts:99,120` | spawn `npm` | ❌ |
| **Argument-forwarding repair-brick requirement** | `cli/cmd/sdd-verify/sdd-verify.cmd.ts:433-451` | every non-`setup` profile requires declared `format:fix` / `lint:fix` bricks | ❌ |
| **Phase-receipt env fingerprint** | `shared/sdd/phase-receipt.ts:95-320` | understands `npm`/`pnpm`/`yarn` invocations + builtins; `SCRIPT_RUNNERS` (`:467-481`) **does** already list `python`, `python3`, `ruby`, `perl`, `php`, `deno`, `bun`, `bash/sh/zsh`, and `:948` has a dedicated `go run` operand parser — **the receipt layer is the one place already multi-language** | ✅ partial |
| **Phase verification plan input** | `cli/cmd/sdd-task/sdd-task.cmd.ts:491-499` | reads `package.json` `.scripts` | ❌ |
| **Coverage adapter registry** | `cli/cmd/testcov/coverage-adapter-registry.ts:7` — `COVERAGE_ADAPTERS`, "**Sole registration point; add future platform adapters without changing orchestration**"; selection is fail-closed (exactly one must match; 0 ⇒ `unsupported`, ≥2 ⇒ `ambiguous`, `:20-30`) | only `istanbulCoverageAdapter` registered; producers detected from `package.json`; help says "iOS, Android, and Go adapters are not installed/supported yet" | ✅ **the cleanest existing seam** |
| **Repo probe (CODE/INFRA)** | `shared/sdd/probe.ts:11,15-35` | `CODE_EXT = /\.(js\|jsx\|ts\|tsx)$/`; `CONFIG_FILES` = tsconfig/eslint/prettier/vitest/vite/jest only | ❌ |
| **Capability adapter registry (scaffold feasibility)** | `shared/sdd/capability-adapter.ts:69-190`, comment at `:70`: "**new platforms extend this value or inject another registry**" | `DEFAULT_CAPABILITY_ADAPTER_REGISTRY` = `node` (binds `ai/directives/infra/nodejs-npm-setup.xml`, artifacts `.nvmrc`, `package.json#engines.node`, `package.json#type`, `.npmrc`, `package-lock.json`), `typescript`, `typescript-quality` (binds `ai/directives/infra/eslint-setup.xml`, gates `test/lint/format`) | ✅ **the declared plug-in point — nothing else is registered** |
| **Bootstrap Requirements schema** | `shared/sdd/spec-schema.ts:12-19` | columns `Requirement\|Kind\|Owner\|Resolution\|Readiness Gates\|Gate Artifacts` — stack-neutral shape, but the *values* the infra directive mandates are Node artefacts | ✅ shape / ❌ values |
| **YAGNI symbol analysis** | `shared/sdd/yagni.ts` + `cli/cmd/yagni/help.ts` | tree-sitter exact only for `.ts/.tsx`; grep-approximate fallback for js/py/go/rb/java | ✅ partial |
| **DbC linter** | `cli/cmd/lint/**` (`lint-source-policy.ts`, `checks/`) | tree-sitter TypeScript only; `.ts/.tsx` sources | ❌ |
| **Infra directive gate artefacts** | `ai/directives/sdd-v2/infra.directive.xml:430-432` | "must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`) before that install"; permitted reads `:191` "`package.json` and equivalents, `tsconfig.json` and equivalents" | ❌ prose literals |
| **Readiness directive** | `ai/directives/sdd-v2/readiness.directive.xml:1,3-22,106-112,209` | entirely `package.json` + `npm i -D` + a worked npm `fix` script | ❌ |
| **Rules registry** | `ai/directives/knowledge.xml` (15 rules) + `ai/directives/{coding,testing,infra}/**` | TypeScript / Svelte / SvelteKit / node:test / Vitest / Playwright / Storybook / eslint / git / node-npm only; no python/go/swift/rust rule file exists (§5.1). Adding a stack means new `<Rule>` entries + `<DependsOn>` edges + rule XML files; a *project* adding them locally is then clobbered by `gennady sync` (§5.4) | ✅ registry shape / ❌ empty for other stacks |
| **Rules cascade closure** | `shared/sdd/rules-cascade.ts` | stack-neutral (pure path + `<DependsOn>` math) — **needs no change** | ✅ |
| **Scaffold rule activation** | `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml` — "Signal-based only — the directive carries zero hardcoded language/tool knowledge" | already correct by design; it just has nothing non-Node to match | ✅ |
| **Axiom library** | `ai/kit/axiom/infra/**` (31) + `svelte` (34) + `storybook` (22) + `uikit` (17) + `e2e` (24) | 97 of 427 axioms are bound to one web stack; `infra/*` names npm/prettier/nvmrc explicitly (`ax-single-package-manager`, `ax-npm-agent-sandbox-registry`, `ax-prettier-owns-formatting`) | ❌ |
| **Project config file** | *(none)* | `gennady.yaml` **does not exist in the RC** — the only mention is `ai/flow-eval/docs/roundtrip-wall3-assessment.md`. A project has nowhere to declare its stack; every stack fact is inferred from `package.json` | ❌ **the missing keystone** |
| **flow-eval fixtures / scenarios** | `ai/flow-eval/provision.ts` `FIXTURE_FILES`, `types.ts` `SddEvalFixtureId` | 14 fixtures: 11 Node, 3 bash/Makefile; `fixture-coverage.test.ts` gates only `package.json`-bearing fixtures. No python/go/swift fixture; the only Swift artefact is the manual `docs/swiftlint-toolchain-setup.md` | ❌ |

**Minimum viable set for one new stack preset** (derived from the above): (1) a config file to declare it — does not exist; (2) a `ReadinessProfile` abstraction replacing `REQUIRED_SCRIPTS` + `gatherReadinessInput` + `scripts.ts` + `ladder.ts` rung 4; (3) a gate-runner abstraction replacing the literal `npm run <script>` at `phase-verification-plan.ts:270` / `sdd-verify.cmd.ts:225` / `repair-adapters.ts`; (4) a capability adapter registered in `DEFAULT_CAPABILITY_ADAPTER_REGISTRY`; (5) a coverage adapter registered in `COVERAGE_ADAPTERS`; (6) `probe.ts` extension patterns; (7) `knowledge.xml` `<Rule>` entries + rule XML files, plus sync protection so a project can own them; (8) an axiom sub-tree; (9) a flow-eval fixture. Points (4) and (5) are the only two with an existing declared seam.

### 9.2 Track intersections

| Track | Where v2 touches it | State in the RC |
|---|---|---|
| **VERIFY** | `cli/cmd/sdd-verify` (2 856 LOC, 5 modules) + `shared/sdd/phase-verification-plan.ts` + `phase-receipt.ts` + `phase-receipt-validation.ts` + the 4 profiles `setup\|code\|test\|full`. Receipt is forge-resistant: atomic temp+rename with `O_EXCL\|O_NOFOLLOW`, plan+env+target-bytes re-derived on read; `sdd-log complete` refuses without it | Mature and the model the ledger says to copy (`docs/flow-verification-ledger.md` A2). **Collides head-on with main's `cli/cmd/verify` + `services/stack/gate-runner.ts`** — two independent verify implementations |
| **CHECK-LOG** | `cli/cmd/sdd-check` (1 951 LOC, 100+ `SDD_*` codes) writes nothing; `cli/cmd/sdd-log` (1 443 LOC) is the sole writer of Execution Log / receipts. `--format json` emits `gennady.sdd-check.findings.v1`. Hard split: check reads, log writes, verify mints receipts | Complete; the known blind spot is the **abandoned artifact** (`docs/flow-verification-redesign.md`: every `SDD_DONE_*` finding is gated on `isDone`, so "no `SDD_AUDIT_MISSING` / `SDD_PHASE_NOT_CLOSED` / `SDD_EXECUTION_LOG_INCOMPLETE` code exists"). Partially closed by the group receipts (E1) |
| **SYNC-OWNERSHIP** | `cli/cmd/sync` (package-owned mirror of `ai/directives/`, deletes stale, `EXCLUDED_ENTRIES={'architecture'}`) + `cli/cmd/sync-skills` (mirror of `ai/skills/` → `.claude/skills`, no manifest, prunes files inside kept skills) | **`knowledge.xml` is NOT protected** (§5.4) — main's `f74c8c1d` "knowledge.xml is project-owned — never clobber a project's rule registry" is absent here. `sync-skills` has no `__tests__` exclusion (§5.5). `sync` requires `node_modules/gennady` (`sync-core.ts:65`), as does `agents-rules` (`:19`) |
| **RULES** | `ai/directives/knowledge.xml` registry → `<Triggers>`/`<SkipWhen>`/`<CheckPhase>`/`<RequiresVerification>` → scaffold 4-tier cascade (`AX_RULES_CASCADE_RESOLUTION`) → per-phase `Rules:` list → `shared/sdd/rules-cascade.ts` closure check → `SDD_RULES_CASCADE_UNRESOLVED`; `shared/sdd/task-authoring-literals.ts` prints tuples in `sdd-new` | Mechanically complete and stack-neutral in the *plumbing*; the *content* is one web stack. Drift found: `<CrossRef>` says `testing-common` is inherited but no `<DependsOn>` declares it, so the closure check never demands it. 3 uikit rule files (919 LOC) are unregistered in `knowledge.xml`; `ai/directives/architecture/` has no rules at all despite `AX_RULE_ACTIVATION` Stage B walking it |
| **DIRECTIVES-SDD** | 70 XML / 10 075 LOC generated from 55 `.hbs` by `ai/kit/build-directives.ts`; delta-assembly + 3 lazy pilots; 5 kit audits in `audit:sdd-templates`; `.gennady-directive-assembly.json` marker; `cli/__tests__/directive-tool-contract` binds every documented `gennady …` call to a real dispatcher case + a fixture-verified result class | Mature. Router has **no route case for `readiness` or `recover-from-code`** (§3.1). `formats/change-manifest.xml` is hand-authored inside a build-managed tree (survives only because `check-directives-fresh` walks the scratch rebuild's own file list) |
| **SKILLS** | 12 `SKILL.md`; 5 identical router-entering loaders (forced intent), `sdd-audit`/`sdd-code-review` load a directive directly with no `sdd-state`, `sdd-check` loads no directive at all | **Diverges from main's skill set**: main ships 15 skills incl. `sdd-continue`, `sdd-discover`, `sdd-execute-batch`, `sdd-fix`, `sdd-infra`, `sdd-module-decomposition`, `sdd-setup`, `alt-opinion` — none of which exist in the RC; the RC ships `sdd`, `sdd-reconcile`, `opencode-get-session`, which main lacks |
| **RELEASE-PACKAGE** | `package.json` `files`, `exports`, `prepublishOnly`, `publish-next`, `.npmignore` | See the table below — **large divergence** |

### 9.3 RC vs `main` — `package.json` and repository shape

Merge-base **`46c6d616`** (2026-06-29, `feat(vcs): unify --vcs-host flag …`). RC (`11291af5`, 2026-09-06) is **535 commits ahead**; `main` (`8bb38477`, 2026-09-03) is **115 commits ahead**. Two independent tracks for ~10 weeks.

| Aspect | RC `codex/sdd-v2-rc52-followup` @ `11291af5` | `main` @ `8bb38477` |
|---|---|---|
| `version` | `0.8.4` | `0.9.0-next.3` |
| `imports` | `#snapshot-path-setup`, `#logger`, **`#utils/*`** | `#snapshot-path-setup`, `#logger` |
| `exports` | `"."` → `./services/agent-mon/index.ts` (a **source** path, not `dist`), `./providers/claude`, `./providers/opencode` | `"."` → typed `dist/index.{d.ts,js}`; **`./stack`** → `dist/services/stack/plugin-api.d.ts` / `dist/stack.js` |
| `files` | `dist/**/*`, `README.md`, `ai/**/*`, `cli/cmd/orient/README.md` | + `docs/**/*`, `services/agent-run/engines/opencode/readonly.config.json`, `plugins/*/plugin.json`, `plugins/*/*.ts`, `plugins/*/directives/**/*`, `plugins/*/skills/**/*` |
| `.npmignore` | **absent** | present — "Defense-in-depth on top of the `package.json` files allowlist": subtractively bans `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `__snapshots__/`, `*.snap`, `fixtures/`, `e2e/`, `coverage/`, `.nyc_output/`, `*.tsbuildinfo`, `*.map`, `scratch/`, `*.local.*` |
| `test` | `node --import tsx scripts/test-topology.ts deterministic` (4-layer topology, 286 files) | `node --import tsx --test --experimental-test-module-mocks --test-concurrency=1` (bare runner, no topology script) |
| `test:coverage` | `test-topology.ts coverage` (c8 on unit+contract only) | **absent** |
| `test:topology` | `test-topology.ts check` | **absent** |
| `test:smoke` | **absent** | `GENNADY_SMOKE=1 … cli/__tests__/e2e/bundle-smoke.e2e.test.ts cli/__tests__/e2e/publish-contents.e2e.test.ts` |
| `test:e2e` | `GENNADY_E2E=1 … cli/__tests__/e2e/*.test.ts` | renamed `test:cli-e2e`; plus **`test:stack-e2e`** (`scripts/stack-e2e.ts`) and **`test:config-e2e`** (`--suite=config`) |
| `lint` | `npm run lint:contracts` → `tsx cli/gennady.ts lint cli/ shared/ services/` (read-only) | `npm run format && npm run type-check && npm run lint:contracts` → `lint --autofix cli/ shared/ services/ plugins/` (**mutating**) |
| `format` | `prettier --check .` (read-only) + `format:fix` = `prettier --write` | `format` = `prettier --write .` (**mutating**); `format:check` = `prettier --check .` |
| `fix` / `check` | `fix` = `format:fix -- . && lint:fix -- cli/ shared/ services/`; `check` = `sdd-verify --profile full` | **both absent** |
| `prepublishOnly` | `lint && test:e2e && build:publish` | `lint && test:smoke && test:cli-e2e && CONFIG_E2E_STRICT=1 test:config-e2e && STACK_E2E_STRICT=1 test:stack-e2e && build:publish` |
| `publish-next` | present (+ `publish-draft`, `pack-draft`) | present (no draft variants) |
| SDD build scripts | `build:directives`, `check:directives-fresh`, `check:directive-budgets`, `audit:axioms`, `audit:contracts`, `audit:halts`, `audit:sdd-templates`, `sdd-flow-eval`, `test:sdd-flow-eval`, `inspector*`, `yagni` | **all absent** |
| `cli/cmd/sdd-*` | 11 commands: `sdd-check sdd-extract sdd-log sdd-migrate sdd-new sdd-orient sdd-state sdd-sync sdd-task sdd-verify` + `yagni` | **none** — main instead has `verify`, `fix`, `commit`, `resolve-conflicts`, `alt-opinion`, `review-*` |
| `shared/sdd/` | 48 modules, 15 743 LOC, 62 tests | **does not exist** (`shared/` = `AGENTS.md`, `backend`, `common`) |
| `ai/` | `directives` (incl. `sdd-v2/`), `kit`, `skills`, `flow-eval`, `flow-sim`, `inspector` | `agents`, `directives` (incl. **`sdd/`** — the v1 directive tree), `docs`, `drafts`, `skills` — **no `kit`, no `flow-eval`, no `flow-sim`, no `inspector`** |
| Stack mechanism | **none** (no `gennady.yaml`, no plugins) | `gennady.yaml` at the root + `plugins/{node,golang,anystack}` (each with `plugin.json`, `<id>-plugin.ts`, `specs/`, `e2e/`, and for golang also `directives/`, `skills/`, `__tests__/`) + `services/stack/{plugin-api,stack-registry,stack-config,gate-runner,tree-guard,env-fail,stack.types}.ts` + `services/config/config-loader.ts`. `StackPlugin` = `{id, marker, description, detect(root), gateIds, verify:{resolveScope, planGates,…}}`; `StackPluginConfig` = `{skipGates, overrideGates, extraGates}` with `GateSpec` carrying `argv/cwd/env/timeout/outputMeansFailure/driftMeansFailure/envFail/requires/fixer` |
| SDD layout | v1 `tasks/` (127 tickets) + 1 v2 ticket under `specs/` | v1 `tasks/` (100 tickets); specs add `config`, `plugins`, `stack`, `infra-e2e` scopes |
| Skills | `sdd`, `sdd-check`, `sdd-audit`, `sdd-code-review`, `sdd-critic`, `sdd-execute`, `sdd-reconcile`, `sdd-scaffold`, `agent-inbox`, `opencode-get-session`, `prd-interview`, `workspace-permission-setup` | `sdd-setup`, `sdd-discover`, `sdd-infra`, `sdd-module-decomposition`, `sdd-scaffold`, `sdd-execute`, `sdd-execute-batch`, `sdd-audit`, `sdd-check`, `sdd-critic`, `sdd-continue`, `sdd-fix`, `alt-opinion`, `agent-inbox`, `prd-interview`, `workspace-permission-setup` |

**The single most important intersection finding.** `main` has already built, on the v1 SDD base, exactly the per-stack preset mechanism §9.1 says the RC lacks: a root `gennady.yaml` declaring `stack:<plugin>:{skipGates,overrideGates,extraGates}`, a typed `StackPlugin` contract published as `gennady/stack`, a `stack-registry` with marker-file detection, a `gate-runner` replacing `npm run <script>`, and three shipped plugins (`node`, `golang`, `anystack`) with per-plugin `directives/` and `skills/`. The RC has built the v2 flow (48 `shared/sdd` modules, 11 CLI commands, the `ai/kit` directive pipeline, `flow-eval`) with **no stack abstraction at all**. Any merge is therefore not a rebase but a design reconciliation: the RC's `sdd-verify` profile ladder + `phase-verification-plan.ts:270`'s literal `npm run` must be re-expressed on top of main's `services/stack/gate-runner.ts` + `GateSpec`, and the RC's `REQUIRED_SCRIPTS`/`gatherReadinessInput`/`scripts.ts`/`ladder.ts` must become a plugin facet. Conversely main's stack plugins carry no `sdd-check`/`sdd-task`/`sdd-log` concept, so its `verify` cannot mint the RC's forge-resistant phase receipts.

---

## 10. Version and recent history

`package.json` `version` = **`0.8.4`** (main is `0.9.0-next.3`). Branch `codex/sdd-v2-rc52-followup`, HEAD **`11291af5`** (2026-09-06 22:33:26 +0300), checked out detached. Working tree clean except one untracked `.npm-ci-done` marker (from the `npm ci` this audit's provisioning ran).

### 10.1 `git log --oneline -30`

```
11291af5 chore(flow-eval): completion gate wiring + spec-receipt metrics + ledger E1-E3
94164668 chore(flow-eval): snapshot pre-existing untracked eval scaffolding
4bb00f4b feat(sdd-v2): mechanical group-audit/review completion receipts
23ea4032 chore(flow-eval): controlled migration-eval runner with telemetry (run/status/grade)
8ab9b363 fix(sdd-v2/migration): STEP_7 makes reference-integrity the hard invariant
75ce4db8 refine(flow-eval): migration grade fails only on introduced structural findings
c1c7625f fix(sdd-migrate): recompute ALL ticket links on move, not just moved-ticket links (supersedes F9)
c8c0c7c7 fix(flow-eval): migration prompt states the real baseline-diff bar, not 'sdd-check clean'
815015fa feat(flow-eval): freeze deterministic migration grade (v2 + baseline-diff)
a9eab0e3 fix(sdd-migrate): normalize `..`-relative evidence paths during move (F9)
8189a153 feat(flow-eval): migration phase + fix(sdd-migrate) slug-cap at plan --verify
933a13d8 fix(sdd-migrate): discover tickets by content (Task-ID), not filename glob
b7dc3749 feat(flow-eval): auto-teardown sandboxes + persist artifacts outside them
43c28c7f docs(flow-eval): close D1 — recover code->spec process complete, all goals green
d61ed1d8 docs(flow-eval): B4 — 10-variation isolation of recover degradation
4d72fb3d feat(flow-eval): recover matrix (scope/module/partial) + matrix-aware prompt
f374f41b feat(flow-eval): recover code->spec process + spec-branch scaffold + sandbox script
ce541cab fix(dbc-linter): make lint --autofix JSDoc output Prettier-compatible
87b7b063 docs(flow-eval): record H3 — task-prompt A/B shows the flow is not prompt-compressible
fcdee206 feat(flow-eval): add brownfield eval class (E-bf-delta, E-bf-bugfix)
d8afa21e feat(flow-eval): complete infra `task` eval suite (E-infra-1/2/3), all golden-passing
f5f6ad45 feat(flow-eval): quality-rules framework + infra `task` evals + experiment log
77943062 feat(flow-eval): capture per-run token + cost usage (A/B currency)
a28e3d2a feat(flow-eval): add broken-specs fixture + repair phase; land colleague report
383e3f73 feat(sdd): unclamp flow over-constraints, fix eval harness, add eval docs
04ee52fd test(sdd): record P9 authoring pass
f58a37da feat(sdd): teach authoring concepts at action time
e95dd106 feat(sdd): standardize actionable tool failures
6bb90784 feat(sdd): expose structured checker findings
40bbd551 fix(sdd): explain invalid module structure
```

### 10.2 Shape of the recent work

Commit-type histogram over the last 60: `feat` 25 · `fix` 14 · `docs` 8 · `test` 4 · `refactor` 3 · `chore` 3 · `wip` 1 · `refine` 1 · 1 revert (`Revert "fix(sdd): prove project plan before scaffold gate"`). Scope histogram: `(sdd)` 30 · `(flow-eval)` 18 · `(sdd-migrate)` 4 · `(sdd-v2)` 3 · one each for `sdd-v2/migration`, `sdd-state`, `sdd-log`, `sdd-check`, `lint`, `dbc-linter`.

So the last ~30 commits are dominated by two themes: **the eval harness** (migration phase + deterministic grade, brownfield/recover matrix, infra task suite, quality-rules framework, token/cost accounting, sandbox teardown) and **migration correctness** (`sdd-migrate` link recomputation, `..`-relative evidence normalization, content-based ticket discovery, slug cap at `plan --verify`).

Files changed since the merge-base `46c6d616`, by area: `ai/kit` 979 · `services/agent-inbox` 360 · `cli/cmd` 219 · `shared/sdd` 114 · `ai/directives` 112 · `ai/flow-eval` 50 · `e2e/inbox-serve` 41 · `ai/skills` 34 · `tasks/agent-inbox` 30 · `cli/__tests__` 23 · `ai/inspector` 22 · `ai/flow-sim` 13.

### 10.3 Latest commit

```
commit 11291af5cca35e5fafe45eccd31681b15c9efd26
Author: k.lebedev <k.lebedev@corp.my.com>
Date:   Sun Sep 6 22:33:26 2026 +0300

    chore(flow-eval): completion gate wiring + spec-receipt metrics + ledger E1-E3

 ai/flow-eval/docs/flow-verification-ledger.md | 19 +++++++++++++++++++
 ai/flow-eval/scripts/session-metrics.py       |  6 ++++--
 2 files changed, 23 insertions(+), 2 deletions(-)
```

A documentation-and-telemetry commit: it recorded ledger entries **E1** (group-audit/review receipt mechanism landed and green, commits `4bb00f4b` + `94164668`), **E2** (the RED-FIRST `session-metrics.py gate` proven to exit 1 on the abandoned-artifact state and wired into `roundtrip-eval.sh`), and **E3** — the open follow-on: "migration must emit `PHASE_RECEIPTS:v1` (and full v2 ticket schema)", because migrated `infra-base` tickets carry no `PHASE_RECEIPTS:v1` marker and the new group enforcement is therefore grandfathered OFF for them. That is the last named open item on this branch.

The functional work of the RC's tip is the commit before it, **`4bb00f4b` feat(sdd-v2): mechanical group-audit/review completion receipts** — `shared/sdd/group-receipt.ts`, `sdd-log <group> audit-receipt|review-receipt <verdict>`, `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING` (WARN, grandfathered on `PHASE_RECEIPTS:v1`), and axioms `AX_GROUP_AUDIT_LEAVES_A_RECEIPT` / `AX_GROUP_REVIEW_LEAVES_A_RECEIPT`, with STEP_6 of `execute.directive.xml` gaining real `<ToolCall>`s for both receipts instead of prose.

# Часть II

# V-A2 — независимая верификация `A2-v2-state.md`

Проверяющий: свежие глаза, read-only. Объект проверки: `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/A2-v2-state.md` (885 строк, 10 разделов, написан против RC HEAD `11291af5`).

Чекаут RC: `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-v6` (ниже `<R>`). Основной репозиторий для `git`: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` (ниже `<G>`).

Обозначения: **CONFIRMED** — проверено, совпадает; **INACCURATE** — факт по сути верен, но число/`file:line`/имя расходится; **REFUTED** — утверждение ложно; **MISSED** — материальный факт, которого в A2 нет.

---

## § Итог

| Вердикт | Кол-во проверенных утверждений |
|---|---|
| **CONFIRMED** | 117 |
| **INACCURATE** | 26 |
| **REFUTED** | 4 |
| **MISSED** | 5 |

**Общая оценка достоверности: высокая.** Все «дорогие» воспроизводимые факты повторились байт-в-байт: `sdd-check --all .` → **198 error(s), 431 warning(s) across 212 file(s)** с полностью совпадающими гистограммами кодов (включая разбивку 507 `tasks/` vs 122 `specs/`); `test-topology.ts check` → `unit=211 contract=16 local=51 external=8`, `observed=227 black-box=59`; 127 v1-тикетов и 1 v2-тикет; все LOC модулей `shared/sdd/*` (43 значения из 43); все `file:line` кодов в `check.ts` (93 литерала); все 20 per-dir счётчиков `ai/kit/axiom`; вся таблица `<DependsOn>`; все различия RC↔`main` в `package.json`.

Дефекты сконцентрированы в двух классах:

1. **Счётчики «сколько файлов/правил/кейсов»** — систематически завышены на 1–9. Самые значимые: `knowledge.xml` содержит **14** `<Rule>`, а не 15 (при этом собственная таблица A2 §5.1 перечисляет ровно 14); `shared/sdd` — **43** модуля, а не 48; детерминированных кейсов в `ai/flow-eval/__tests__` — **84**, а не 75.
2. **`file:line` в `readiness.ts`** — почти весь блок ссылок §1.2/§2.2 сдвинут (реальные `WRITE_SWITCH_PATTERN` :260, `MUTATING_SWITCH_PATTERN` :279 против заявленных :101/:120).

Четыре утверждения опровергнуты: `SDD_V2_SUBDIR` (не код находки), «все `SDD_VERIFY_*` — это `ERR_CLI_*`» (есть реальный код находки), «`H_ASK_WITHOUT_CARD` объявлен в роутере» (не объявлен нигде) и «`main` имеет `ai/drafts`» (такого пути в `main` нет).

Один пропуск — материальный: `TEST_ROOTS` не содержит `utils/` и `test/`, поэтому 25 тестовых файлов не попадают в гейт `npm test`, а ветка `utils/` в `classifyTest` недостижима.

---

## § 1 — CLI surface

### 1.1 Таблица команд

`--help` реально запущен для 14 команд: `sh -c 'cd <R> && node --import tsx cli/gennady.ts <cmd> --help'`.

| Строка | Вердикт | Детали проверки |
|---|---|---|
| `sdd-check` (1951 LOC) | **CONFIRMED** | LOC ровно 1951 (все `.ts` вне `__tests__`). Help-заголовок дословно: «Mechanical audit of SDD artifacts (the deterministic half of audit)». Exit codes из help: «0 clean (warnings allowed)   1 error(s) found   4 bad invocation» ✓. `ERR_CLI_SDD_CHECK_READ_FAILED` подтверждён в `cli/cmd/sdd-check/sdd-check.types.ts:19` и help.ts:79. Тесты: `sdd-check.cmd.test.ts`, `phase-receipt-check.test.ts`, `group-receipt.check.test.ts` + `fixtures/` ✓ |
| `sdd-extract` (386 LOC) | **CONFIRMED** | LOC 386 ✓. Exit codes из help дословно: «1 file not found / unreadable   2 anchor absent / empty   3 markers unbalanced / duplicated   4 bad invocation / invalid name» ✓. Канонические имена секций в help совпадают ✓ |
| `sdd-log` (1443 LOC) | **CONFIRMED** | LOC 1443 ✓. Help: «Append events or atomically complete a verified phase/spec draft». Подтверждено в help: «No fabricated DONE — content with an unreplaced `<…>` placeholder is rejected (exit 2)»; «Payload files are exact regular non-symlink UTF-8 files under .claude/tmp/, bounded to 32768 bytes»; требование receipt+Round+typed 4-field Handoff для `complete` ✓. Тесты `sdd-log.cmd.test.ts`, `group-receipt.cmd.test.ts` ✓ |
| `sdd-migrate` (424 LOC) | **CONFIRMED** | LOC 424 ✓. Все 4 режима (`anchors`/`plan`/`ids`/`move`) в help; `plan --verify` описан как «verify the layer (exit 1 on findings)»; `ids --write` «gates on zero old IDs» ✓ |
| `sdd-new` (1056 LOC + `templates.ts` 2051) | **CONFIRMED** | LOC 1056 и 2051 ✓. `sdd-new --list` выдал ровно 11 kinds в том же составе, что в A2: `product library infrastructure interface module task module-index scope-index project-index portal research` ✓. Help подтверждает доказательство owner против scope-type, печать rule ID+href-кортежей из `knowledge.xml`, строку Deferred Test Ownership ✓ |
| `sdd-orient` («151 LOC + `core/`, `render/`») | **CONFIRMED** | 151 — это ровно сумма top-level файлов (`help.ts` 36 + `index.ts` 5 + `sdd-orient.cmd.ts` 103 + `sdd-orient.types.ts` 7). Полное дерево с `core/`+`render/` = 821 LOC. Квалификатор A2 корректен. Exit codes: «0 neighbourhood printed   4 bad invocation / target did not resolve» ✓. 8 тест-файлов, имена совпадают ✓ |
| `sdd-state` (609 LOC) | **CONFIRMED** | LOC 609 ✓. Exit codes: «0 snapshot emitted   2 bad project root   4 bad invocation» ✓ |
| `sdd-sync` (410 LOC) | **CONFIRMED** | LOC 410 ✓. Exit codes: «0 synced (report)   1 ticket unreadable / verify failed   2 Meta unparseable   4 bad invocation» ✓ |
| `sdd-task` (1524 LOC) | **CONFIRMED** | LOC 1524 ✓. Help подтверждает `--audit-group`/`--group-scope`/`--task-scope` семантику дословно, включая «no glob, `../`, absolute path, directory target, or any symlink component» ✓ |
| `sdd-verify` (2856 LOC, 5 модулей) | **CONFIRMED** | LOC 2856 ✓. Названные модули существуют: `phase-context.ts`, `phase-run.ts`, `repair-adapters.ts`, `workspace-mutation.ts`, `phase-receipt-validation.ts` ✓. Help подтверждает «Full is runtime-enforced read-only: only the test:coverage segment may write its narrow coverage artifact directory» и формат `[sdd-verify] ✅ ALL PASS (N/M)` ✓ |
| `yagni` (666 LOC) | **CONFIRMED** | LOC 666 ✓. Exit code строка из help дословно: «Exit code: 0 clean, 1 findings, 2 invalid/unavailable root or Git scope, 4 bad argv.» ✓ |
| `sync` (558 LOC) | **CONFIRMED** | LOC 558 ✓. Help: «Requires gennady as a local dev dependency (npm i -D gennady)» ✓. `EXCLUDED_ENTRIES = new Set(['architecture'])` на `sync-core.ts:16` ✓. Grep `knowledge` по `cli/cmd/sync/*.ts` и `shared/common/sync/*.ts` → 0 попаданий ✓ |
| `sync-skills` (895 LOC, **нет help.ts**) | **CONFIRMED** | LOC 895 ✓; `cli/cmd/sync-skills/help.ts` отсутствует ✓. `EXCLUDED_NAMES = new Set(['.DS_Store'])` на `:22`, применён на `:36,84,168,337` ✓. Grep `manifest`/`__tests__`/`.test.` по `cli/cmd/sync-skills/*.ts` → 0 ✓ |
| `lint` («995 LOC, `checks/`, `utils/`») | **CONFIRMED** | 995 — ровно сумма top-level (`help.ts` 65 + `index.ts` 5 + `lint-source-policy.ts` 16 + `lint.cmd.ts` 712 + `lint.types.ts` 197). Полное дерево = 2964. Help: «Bad/missing/repeated option values stop before linting with exit 4 + usage» ✓. 8 тест-файлов, имена совпадают ✓ |
| `testcov` (2101 LOC) | **CONFIRMED** | LOC 2101 ✓. `cli/cmd/testcov/help.ts:59` дословно: «iOS, Android, and Go adapters are not installed/supported yet.» ✓ Единственный адаптер — `istanbul-coverage-adapter.ts` ✓ |
| `agents-rules` (54 LOC, нет help.ts) | **CONFIRMED** | LOC 54, `help.ts` отсутствует ✓ |

Дополнительно: диспетчер `cli/gennady.ts` действительно содержит `case` для всех 16 перечисленных команд (плюс ~30 не-SDD команд, что A2 корректно не заявляет как v2).

### 1.2 npm/Node-coupling

| Строка A2 | Вердикт | Факт |
|---|---|---|
| `readiness.ts:15-24` `REQUIRED_SCRIPTS` | **CONFIRMED** | Дословно на `:15-24`: `'type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix'`. Заявленный алиас `:29-31` — фактически `SCRIPT_ALIASES` на `:30-32` (сдвиг 1 строка), но состав верен: единственный алиас `'type-check': ['type-check','typecheck']` |
| `readiness.ts:596-609` `gatherReadinessInput` | **CONFIRMED** | Функция начинается ровно на `:596`, читает только `<root>/package.json` `.scripts` |
| `readiness.ts:566-587` `detectGennady` | **INACCURATE** | Реально `:572-591`. Семантика верна: `statSync(node_modules/.bin/gennady)` ИЛИ `pkg.name === 'gennady'` |
| `readiness.ts:101-132` детекция read-only/mutating | **INACCURATE** | `:96-135` — это доккоммент полей типа `ReadinessResult`. Реальные литералы: `WRITE_SWITCH_PATTERN` на `:260-261` (`/(?:eslint\b[^&\|;\n]*\s--fix(?![\w-])\|prettier\b[^&\|;\n]*\s--write(?![\w-])\|\s--autofix(?![\w-]))/`), `MUTATING_SWITCH_PATTERN` на `:279` (`/\s--(?:write\|fix\|autofix)(?![\w-])/`). Содержание утверждения верно |
| `readiness.ts:176` `lintReachesGennady` | **INACCURATE** | На `:176` находится `scriptReachesGennady` (экспортируемая). `lintReachesGennady` — приватная обёртка на `:199-201`, вызывается из `checkReadiness` на `:454`. Утверждение по сути верно |
| `shared/sdd/scripts.ts` классификация | **CONFIRMED** | 120 LOC, `classifyScript`/`selectGates`, потребитель `sdd-state` |
| `ladder.ts:36-39,68` рунг «Инфраструктура» | **CONFIRMED** | `:68` дословно: `const infraDone = s.packageJsonPresent && s.gates.typecheck && s.gates.test && s.gates.lint;` |
| `phase-verification-plan.ts:270` | **CONFIRMED** | `:270` дословно: `return script ? \`npm run ${script}\` : null;` |
| `sdd-verify.cmd.ts:225-226` | **CONFIRMED** | `:226` дословно: `: { command: 'npm', args: ['run', scriptName] };` |
| `repair-adapters.ts:99,120` | **CONFIRMED** | `command: 'npm'` ровно на `:99` и `:120` |
| `phase-receipt.ts:95-320` парсер npm/pnpm/yarn | **CONFIRMED** | 1421 LOC, парсер понимает `npm`/`pnpm`/`yarn`, builtins, root-only options |
| `sdd-task.cmd.ts:491-499` | **INACCURATE** | Чтение `package.json` `.scripts` фактически на `:495-500` (`readFileSync` на `:498`). `:19` — импорт, верно |
| `testcov` istanbul only | **CONFIRMED** | см. выше |
| `sync-core.ts:65`, `agents-rules.cmd.ts:19` требуют `node_modules/gennady` | **CONFIRMED** | Подтверждено help-текстом `sync` и кодом |
| `yagni.ts` tree-sitter только `.ts/.tsx` | **CONFIRMED** | 207 LOC, fallback для js/py/go/rb/java |
| `gennady.yaml` не существует | **INACCURATE** | Файла действительно нет ✓, но A2 утверждает «only mention: `ai/flow-eval/docs/roundtrip-wall3-assessment.md`». Реально **два** файла упоминают: он и `ai/flow-eval/scripts/roundtrip-readiness-shim.package.json` |

---

## § 2 — `shared/sdd/*`

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| «48 модулей» | **INACCURATE** | **43** файла `.ts` в `shared/sdd/` (вне `__tests__`); подкаталогов с кодом нет. Собственная таблица §2.1 A2 перечисляет 43 модуля (при подсчёте `markdown-fence.ts`/`markdown-table.ts` как двух) — то есть таблица верна, шапка нет |
| «15 743 LOC» | **CONFIRMED** | `ls shared/sdd/*.ts \| xargs wc -l` → ровно `15743 total` |
| «62 test files в `shared/sdd/__tests__/`» | **INACCURATE** | **61** `*.test.ts` в `shared/sdd/__tests__/` (top-level). Всех файлов в дереве `__tests__` включая `fixtures/**` — 71 |
| §2.1: все LOC модулей | **CONFIRMED** | Проверены все 43 значения — **совпадение 43/43** (`check.ts` 2736, `phase-receipt.ts` 1421, `templates.ts` 2051, `migration-plan.ts` 781, `project-feasibility.ts` 735, `audit-group.ts` 568, `module-specs.ts` 565, `migration-move.ts` 503, `ticket.ts` 478, `gate-queue.ts` 475, `phase-verification-plan.ts` 395, `group-receipt.ts` 324, `portal.ts` 302, `bdd-coverage.ts` 296, `requirement-budget.ts` 258, `tracker.ts` 259, `capability-adapter.ts` 251, `id-replace.ts` 245, `task-id.ts` 231, `section.ts` 219, `ticket-resolve.ts` 212, `yagni.ts` 207, `spec-schema.ts` 192, `anchor-inject.ts` 143, `task-authoring-literals.ts` 141, `ladder.ts` 128, `requirement-id.ts` 123, `scripts.ts` 120, `probe.ts` 97, `consumers-resolvable.ts` 91, `rules-cascade.ts` 82, `tool-guidance.ts` 73, `markdown-table.ts` 69, `phase-dependencies.ts` 64, `legacy-headings.ts` 54, `flow.ts` 48, `tasks-append-only.ts` 48, `inventory.ts` 41, `mermaid-check.ts` 40, `markdown-fence.ts` 27, `session-boundary.ts` 24, `finding.ts` 17, `readiness.ts` 609) |
| §2.1: модули без собственного теста | **CONFIRMED** | Ровно 7 модулей без одноимённого теста: `capability-adapter`, `finding`, `markdown-fence`, `markdown-table`, `requirement-budget`, `ticket-resolve`, `tool-guidance` — точно те, что A2 помечает «—» или отдельной сноской |
| §2.1: «`check.test.ts` + 22 `check-*.test.ts`» | **INACCURATE** | **21** файла `check-*.test.ts` (+ `check.test.ts` = 22 «check*» суммарно) |
| §2.1: `probe.ts` `CODE_EXT :11`, `CONFIG_FILES :15-35` | **INACCURATE** | `CODE_EXT` на `:12`, `CONFIG_FILES` на `:15-33`. Состав верен: `/\.(js\|jsx\|ts\|tsx)$/` и tsconfig/eslint/prettier/vitest/vite/jest |
| §2.1: доп. тесты `rc-recovery-invariants`, `skeleton-format-differential`, `check-spec-authoring-corpus` | **CONFIRMED** (неполно) | Существуют; помимо них есть также `skeleton-heading-structure.test.ts`, не упомянутый в A2 |
| §2.2 `REQUIRED_SCRIPTS` verbatim | **CONFIRMED** | Все 8 имён дословно и в том же порядке |
| §2.2 `ReadinessInput` `:56-63` | **CONFIRMED** | Тип начинается ровно на `:56` |
| §2.2 `checkReadiness :446-556` | **CONFIRMED** | Функция начинается ровно на `:446` (возврат заканчивается `:563`) |
| §2.2 `WRITE_SWITCH_PATTERN :101`, `MUTATING_SWITCH_PATTERN :120` | **INACCURATE** | Реально `:260-261` и `:279` (см. §1.2) |
| §2.2 «Levels (`:66`, `:532`)» | **INACCURATE** | `ReadinessLevel` действительно на `:66` ✓; присвоение `level` — на `:519`, не `:532`. `executionReady: level === 'ready'` на `:562` ✓ |
| §2.2 `missingGates :533-556` | **INACCURATE** | Реально `:520-...`, поле типа на `:107` |
| §2.3: все коды `check.ts` с `file:line` | **CONFIRMED** | **Идеальное совпадение.** Проверены все 93 строковых литерала `'SDD_*'` в `check.ts` — каждый код и каждый номер строки из A2 совпал (402, 431, 434, 443, 448, 459, 463, 485, 493, 498, 509, 524, 529, 538, 544, 551, 559, 564, 571, 581, 636, 677, 694, 701, 719, 732, 752, 770, 789, 800, 811, 828, 841, 865, 874, 901, 962, 970, 985, 1019, 1100, 1110, 1122, 1133, 1148, 1330, 1385, 1401, 1412, 1426, 1466, 1477, 1490, 1702, 1762, 1769, 1787, 1802, 1809, 1829, 1851, 1866, 1874, 1890, 1915, 1957, 1975, 1987, 2035, 2051, 2070, 2241, 2263, 2351, 2366, 2497, 2512, 2559, 2612, 2663, 2676, 2683, 2722, 2729). Функции тоже: `checkBddNegativeScenario :390`, `checkTicket :422`, `checkTicketAuthoringStructure :599`, `checkPortal :1207`, `checkTaskGraph :1370`, `checkTrackers :1443`, `checkTableCells :2144` |
| §2.3 «29 `SDD_SCAFFOLD_PLAN_*` кодов» | **INACCURATE** | Уникальных `SDD_SCAFFOLD_PLAN_*` в `project-feasibility.ts` — **27**. Перечисленный A2 список сам содержит 27 элементов, то есть неверно только число |
| §2.3 6 кодов `SDD_PROJECT_*` | **CONFIRMED** | Ровно 6, на `:149,161,255,267,300,316` |
| §2.3 `SDD_CHECK_READ_FAILED` | **INACCURATE** | Реальный идентификатор — `ERR_CLI_SDD_CHECK_READ_FAILED` (`sdd-check.types.ts:19`). В §1.1 A2 называет его правильно, в §2.3 — усечённо |
| §2.3 `SDD_RESEARCH_REF_BROKEN (:257)` | **INACCURATE** | Реально `sdd-check.cmd.ts:269` |
| §2.3 прочие коды `sdd-check.cmd.ts` | **CONFIRMED** | `SDD_BROKEN_SPEC_LINK :248`, `SDD_VERIFICATION_TABLE_INVALID :587`, `SDD_COVERAGE_POLICY_INVALID :600`, `SDD_COVERAGE_OWNER_INVALID :617`, `SDD_COVERAGE_READER_RERUNS_PRODUCER :653`, `SDD_COVERAGE_READER_OWNER_MISMATCH :665`, `SDD_CONSUMERS_SCAN_FAILED :715`, `SDD_BROKEN_SPEC_REF :762`, `SDD_BROKEN_SPEC_ANCHOR :782`, `SDD_TASK_OWNER_METADATA :823`, `SDD_AUTHORING_TARGET_PATH :894`, `SDD_AUTHORING_AUTO_FIXED :1117` — все совпали |
| §2.3 атрибуция `SDD_RULES_CASCADE_UNRESOLVED (:417)`, `SDD_BDD_* (:527)`, `SDD_CONSUMERS_UNRESOLVED (:682)` к `sdd-check.cmd.ts` | **INACCURATE** | Сами литералы живут в `shared/sdd/rules-cascade.ts:78`, `shared/sdd/bdd-coverage.ts:223,257,270,291`, `shared/sdd/consumers-resolvable.ts:84`; `sdd-check.cmd.ts` только их проводит. В §5.3 A2 атрибутирует `rules-cascade` правильно — расхождение внутри одного документа |
| §2.3 `phase-receipt-check.ts` 5 кодов | **CONFIRMED** | `STALE_TARGETS :22`, `STALE_PLAN :28`, `INCOMPLETE :32`, `INVALID :33/48/77`, `MISSING :67` |
| §2.3 `group-receipt.ts` 2 WARN-кода | **CONFIRMED** | `SDD_GROUP_AUDIT_MISSING :21`, `SDD_GROUP_REVIEW_MISSING :23`; маркеры `SDD_AUDIT_RECEIPT :16`, `SDD_REVIEW_RECEIPT :17` |
| §2.3 `spec-schema.ts` → `SDD_V2_SUBDIR` | **REFUTED** | `SDD_V2_SUBDIR` — это **путь-константа** `'ai/directives/sdd-v2'`, объявленная в `cli/cmd/sdd-state/sdd-state.types.ts:25` и используемая в `sdd-state.cmd.ts:120,123`. Никакого отношения к `spec-schema.ts` и к кодам находок не имеет. В `spec-schema.ts` строковых кодов `SDD_*` вообще нет |
| §2.3 «все `SDD_VERIFY_*` — это `ERR_CLI_*` exit-диагностика, не находки» | **REFUTED** | `cli/cmd/sdd-verify/phase-run.ts:255` эмитит `code: 'SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED'` как реальную находку (и печатает `[sdd-verify] SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED: ${required.name} ${required.state}` на `:258`); он проверяется в `cli/__tests__/tool-behavior/bootstrap-path.test.ts:211,364`. Код в A2 полностью отсутствует |
| §2.3 `SDD_DIAGRAM_INVALID` в списке адаптеров | **INACCURATE** (неполно) | Код существует (`shared/sdd/mermaid-check.ts:32`) и упомянут в §2.1, но в перечислении §2.3 «кодов вне `check.ts`» пропущен |
| §2.4 `capability-adapter.ts` состав | **CONFIRMED** | `NODE_NPM_CAPABILITY_ADAPTER :75`, `TYPESCRIPT_CAPABILITY_ADAPTER :128`, `TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER :150`, `DEFAULT_CAPABILITY_ADAPTER_REGISTRY :202` — ровно три зарегистрированных адаптера |
| §2.4 `phaseProfileForKind :29`, `verificationGateNames :43`, `requiredVerificationGateNames :58` | **CONFIRMED** | Все три на заявленных строках |
| §2.4 `PHASE_RECEIPTS_SCHEMA_MARKER` в `group-receipt.ts:22` | **CONFIRMED** | — |

---

## § 3 — Директивы `sdd-v2/**` и `ai/kit`

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| «70 XML файлов, 10 075 строк» | **CONFIRMED** | `find <R>/ai/directives/sdd-v2 -name '*.xml' \| wc -l` → 70; `wc -l` → `10075 total` |
| «55 `.hbs` под `ai/kit/templates/sdd-v2/`» | **CONFIRMED** | 28 top-level + 22 `formats/` + 5 `agent-inbox/` = 55 |
| «… (incl. `formats/` ×20)» | **INACCURATE** | `formats/*.hbs` — **22**, не 20 (28+22+5 всё равно даёт заявленные 55, то есть top-level A2 неявно считает как 28) |
| «15 сгенерированных XML без `.hbs`-источника» | **CONFIRMED** | Проверено пофайлово: ровно 15 — 3 `audit/steps/*`, 4 `phase-execution-protocol/steps/*`, 7 `scaffold/steps/*`, `formats/change-manifest.xml`. Состав совпадает дословно |
| §3.1: LOC каждой директивы | **CONFIRMED** | Совпадение 18/18: `router` 405, `root` 526, `scope` 124, `infra` 621, `interface` 398, `module` 130, `interview-protocol` 447, `amplify-security/storage/nfr/observability` 117/98/106/110, `preflight-protocol` 25, `review-lifecycle` 70, `critic`/`critic-protocol` 66/20, `authoring-interactive` 22, `discover-from-code` 205, `recover-from-code` 261, `scaffold` 356 (+ steps 253), `execute` 345, `phase-execution-protocol` 46 (+ steps 94), `readiness` 251, `audit` 229 (+ steps 419), `code-review` 260, `deviation-review` 37, `reconcile` 408, `compression` 105, `migration-v1-v2` 411 |
| §3.1: ToolCall-счётчики (5+ директив) | **CONFIRMED** | `router` 0 ✓; `execute` 13 ✓; `migration-v1-v2` 15 ✓; `code-review` 2 ✓; `reconcile` 1 ✓; `readiness` 3 ✓; `root` 3 ✓; `scope` 5 ✓; `infra` 5 ✓; `interface` 3 ✓; `module` 4 ✓; `compression` 1 ✓; `discover-from-code` 2 ✓; `recover-from-code` 2 ✓. Для `scaffold` (9) и `audit` (8) счётчик приходится на **step-пакеты**, а не на скелет (скелеты дают TC=0): `scaffold/steps` = 9 (`STEP_2_MATERIALIZE` 6 + `STEP_3_MECHANICAL_CHECK` 2 + `STEP_6_HANDOFF` 1), `audit/steps` = 8 (весь в `STEP_1_MECHANICAL`). Числа A2 верны, но их источник в таблице неочевиден |
| §3.1 «`phase-execution-protocol` steps не несут `<ToolCall>`» | **CONFIRMED** | 0 в четырёх step-файлах |
| §3.1 `agent-inbox/{code-lens,security-lens,enrich,synthesize,track-review}` 108/161/222/113/440 | **CONFIRMED** | Все пять файлов существуют в `ai/directives/sdd-v2/agent-inbox/` с ровно такими LOC (не путать с непересекающимся деревом `ai/directives/agent-inbox/` из 9 других файлов) |
| §3.1 «`formats/*.xml` (23 файла, 2 240 LOC)» | **INACCURATE** | Реально **24** файла, **2066** LOC |
| §3.1 «flow gap: у роутера нет case для `readiness` / `recover-from-code`» | **CONFIRMED** | В `STEP_2_ROUTE` (`router.directive.xml:373-397`) нет ни `readiness`, ни `recover-from-code.directive.xml`; intent `recover-from-code` ведёт в `discover-from-code.directive.xml` |
| §3.2 конвейер сборки, delta→lazy порядок, маркер | **CONFIRMED** | `.gennady-directive-assembly.json` = `{"schema":"gennady-directive-assembly/v1","selection":"manifest"}` дословно; `directive-assembly-marker.ts:8-21` тип и `serializeDirectiveAssemblyMarker`, парсер без silent fallback |
| §3.2 `assembly-manifest.json`: `defaultMode: "monolith"` + 3 lazy-пилота | **CONFIRMED** | Файл дословно: overrides для `sdd-v2/audit.directive.xml`, `sdd-v2/scaffold.directive.xml`, `sdd-v2/phase-execution-protocol.directive.xml` |
| §3.3 LOC скриптов аудитов | **CONFIRMED** | `audit-axiom-activation.mjs` 137, `audit-contract-activation.mjs` 534, `audit-halt-activation.mjs` 345, `audit-halt-fragments.mjs` 55, `check-directives-fresh.ts` 201, `step-budget-gate.ts` 199 — все 6 совпали |
| §3.3 бюджеты | **CONFIRMED** | `step-budget-gate.ts:37,39,43,45`: `SKELETON_TOKEN_TARGET = 6000`, `SKELETON_TOKEN_LIMIT = 8000`, `PACKAGE_CHAR_LIMIT = 20_000`, `PACKAGE_LINE_CHAR_LIMIT = 2000` — дословно |
| §3.3 `audit:sdd-templates` композиция | **CONFIRMED** | `package.json:48` дословно: `check:directives-fresh && audit:axioms && audit:contracts && audit:halts && check:directive-budgets` |
| §3.3 «15 тест-файлов в `ai/kit/__tests__/`» | **INACCURATE** | **14**. Перечисленный A2 список содержит ровно 14 имён, все существуют: `amplifier-requirement-format`, `audit-halt-activation`, `build-directives`, `check-directives-fresh`, `delta-assembly`, `deps`, `lazy-assembly`, `lint-axioms`, `render`, `skeleton-package-binding.e2e`, `skeleton-package-binding.guard`, `skeleton-parity`, `stateless-sdd-flow-contract`, `step-budget-gate` |
| §3.4 427 аксиом в 20 каталогах | **CONFIRMED** | 427 XML, 20 каталогов |
| §3.4 per-dir счётчики | **CONFIRMED** | Совпадение 20/20: `agent-inbox` 4, `audit` 25, `boundary` 16, `coding` 29, `critic` 13, `e2e` 24, `error` 16, `infra` 31, `interview` 3, `logging` 7, `perf` 12, `process` 56, `scaffold` 20, `spec` 36, `storybook` 22, `svelte` 34, `testing` 40, `truth` 11, `typescript` 11, `uikit` 17 |
| §3.4 sibling-библиотеки: `contract/*` счётчики | **CONFIRMED** | `audit` 3, `critic` 1, `interview` 1, `process` 25, `scaffold` 4, `spec` 23, `uikit` 1 |
| §3.4 `anti-pattern/**` «12 dirs» | **INACCURATE** | **11** каталогов; перечисленный A2 список содержит ровно 11 имён (`coding critic e2e infra logging process spec storybook svelte testing uikit`) |
| §3.4 `AUTHORING.md` 25 775 байт | **CONFIRMED** | `wc -c` → 25775 |
| §3.5 `directive-tool-contract/**` 3 файла, 1 340 LOC | **CONFIRMED** | `directive-tool-contract.test.ts` 675, `fixture.ts` 263, `parse-tool-calls.ts` 402 = 1340 |

### Запуск гейтов kit (то, чего A2 не сообщал)

```
$ sh -c 'cd <R> && node --experimental-strip-types ai/kit/check-directives-fresh.ts'
✓ ai/directives/** matches a fresh rebuild.
exit=0

$ sh -c 'cd <R> && node --experimental-strip-types ai/kit/step-budget-gate.ts'
✓ every lazy directive under ai/directives/sdd-v2/** is within budget.
exit=0
```

Оба скрипта запускаются без `cd`-обёртки только из корня RC (используют `PROJECT_ROOT`, выведенный из своего пути), поэтому запуск был сделан через `sh -c 'cd <R> && …'`. Оба зелёные — сгенерированное дерево `ai/directives/**` действительно свежее и в бюджете на HEAD `11291af5`. **MISSED**: A2 описывает семантику этих гейтов, но не фиксирует их фактическое состояние.

---

## § 4 — Скиллы и роутер

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| 12 скиллов, цитата `ai/skills/README.md` | **CONFIRMED** | 12 каталогов + `README.md`; строки 3-4 README дословно: «12 навыков: 8 SDD-навыков, agent-inbox, opencode-get-session, prd-interview и workspace-permission-setup.» |
| §4.1 LOC всех `SKILL.md` | **CONFIRMED** | Совпадение 12/12: `sdd` 20, `sdd-scaffold` 18, `sdd-execute` 18, `sdd-critic` 18, `sdd-reconcile` 18, `sdd-audit` 22, `sdd-code-review` 32, `sdd-check` 26, `agent-inbox` 47, `opencode-get-session` 149, `prd-interview` 133, `workspace-permission-setup` 194 |
| §4.2 «14 `<Axiom id=…>`» + номера строк | **CONFIRMED** | Ровно 14, и все 14 номеров строк совпали: 8, 46, 68, 109, 120, 129, 135, 141, 158, 165, 171, 176, 184, 202 |
| §4.2 «13 из них `cross-cutting="true"`» | **INACCURATE** | `grep -c 'cross-cutting="true"'` → **10**. Без атрибута: `AX_DIVERGE_BEFORE_RECOMMEND` (:141), `AX_SCALE_PROPORTIONAL_DEPTH` (:158), `AX_STATELESS_FLOW` (:165, `invariant="true"`), `AX_V2_HAS_NO_INTERNAL_MIGRATION` (:202) |
| §4.2 `KernelGrammar :209-230` | **CONFIRMED** | `<KernelGrammar>` на `:208`, `DEF_LOGIC_SWITCH` `:209`, `DEF_READ_AND_USE_DIRECTIVE` `:220`, закрытие `:231` |
| §4.2 **Gate LogicSwitch: 9 кейсов** | **CONFIRMED** | `:294-305`. Прочитан целиком: 9 `WHEN` + обязательный `DEFAULT`, **в точности в том же порядке и с той же семантикой**, что в таблице A2 (включая формулировку про `/sdd-scaffold` как «a separate process, never READ_AND_USE_DIRECTIVE'd from here (scaffold itself hands off back into this flow, so loading it in-place would cycle)»). Атрибут `on=` дословно: `"FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"` |
| §4.2 **Route LogicSwitch: 12 кейсов** | **CONFIRMED** | `:373-397`, `<Goal>Load exactly one owner.</Goal>` дословно. 11 `WHEN` + `OTHERWISE -> H_AMBIGUOUS_INTENT` = 12; целевые директивы совпадают построчно со всеми 12 строками таблицы A2 |
| §4.2 4 halt-условия | **CONFIRMED** | Таблица `<HaltConditions>` содержит ровно `H_AMBIGUOUS_INTENT`, `H_SPEC_NOT_APPROVED`, `H_V2_INVALID`, `H_WRONG_REPO` |
| §4.2 «`H_ASK_WITHOUT_CARD` объявлен и срабатывает только здесь [в роутере]» | **REFUTED** | Grep по `ai/directives/**` и `ai/kit/**`: `H_ASK_WITHOUT_CARD` встречается **только** в `ai/directives/sdd-v2/root.directive.xml:190`, в его источнике `ai/kit/templates/sdd-v2/root.directive.hbs:66` и в аллоулисте `ai/kit/audit-halt-activation.mjs:25-26,120-125,338`. **В `router.directive.xml` и в `router.directive.hbs` его нет вообще** — ни в `<HaltConditions>`, ни в тексте. Аллоулист `ALLOWLIST_CROSS_DIRECTIVE_REFS` разрешает `root.directive::H_ASK_WITHOUT_CARD` и `scope.directive::H_ASK_WITHOUT_CARD` как «ссылки на halt чужой директивы», ссылаясь в комментарии на несуществующее объявление. A2 воспроизвёл устаревший комментарий самого аудит-скрипта как факт |
| §4.2 два approval-контракта `:233-255` / `:256-293` + цитата «The agent never computes or copies a content hash for approval» (`:292`) | **CONFIRMED** | Цитата найдена дословно в блоке, заканчивающемся `:292` |
| §4.3 `flow.ts` 48 LOC, детекторы | **CONFIRMED** | — |
| §4.4 роутер: **ноль** упоминаний `package.json`/`npm`/`node` | **CONFIRMED** | `grep -niE "package\.json\|npm\|\bnode\b" router.directive.xml` → 0 попаданий |
| §4.4 роутер: `stack`-попадания только `:25-26`, `:131`, `:191` | **CONFIRMED** | Ровно 4 строки, ровно те: глоссарий «тулчейн / тулстек» → «Tool Stack» (:25-26), запрет «frame-stack talk» (:131), «Tool Stack» как имя раздела в `AX_DECISION_LOG_NON_OBVIOUS` (:191) |
| §4.4 `infra.directive.xml` `<LogicSwitch on="stack typicality">` `:315-320` | **CONFIRMED** | Найден на `:315-318`, оба `WHEN` дословно, включая «Uncertain typicality defaults to THIS branch — never a silent EXPRESS guess» |
| §4.4 `infra.directive.xml:430-432` Node/npm-артефакты | **CONFIRMED** | Дословно: «The infrastructure scope that first installs dependencies must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`) before that install» |
| §4.4 `infra.directive.xml:191` разрешённые чтения | **CONFIRMED** | Дословно: «`package.json` and equivalents, `tsconfig.json` and equivalents» |
| §4.4 `readiness.directive.xml:1` keywords, `:209` пример `fix` | **CONFIRMED** | `:1` содержит `package-json, npm-scripts, gennady, stub, not-ready`; `:209` дословно `"fix": "npm run format:fix -- . && npm run lint:fix -- src/"` |
| §4.4 `portal.ts` — нет концепции стека | **CONFIRMED** | Единственная типовая строка `:15`: «Scope type passthrough from the table: infrastructure \| contracts \| product \| library»; все прочие `stack`/`node` — локальные переменные Tarjan-SCC (`onStack`, `stack`, `nodes`) на `:143-221` |

---

## § 5 — Слой правил

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| `knowledge.xml` 151 LOC, `<AiKnowledge ver="2.0">` | **CONFIRMED** | — |
| «`<CheckPhaseOrder>typecheck test lint format</CheckPhaseOrder>` (`:3`)» | **CONFIRMED** | Дословно на `:3` |
| «3 категории» | **CONFIRMED** | `<Coding>`, `<Testing>`, `<Infra>` внутри `<Rules>` (`:2`) |
| **«15 `<Rule>` entries»** (также §9.1 «15 rules») | **INACCURATE** | `grep -c '<Rule '` → **14**. Собственная таблица §5.1 A2 перечисляет ровно 14 правил, все на подтверждённых строках: `typescript-rules :6`, `svelte5-runes :15`, `sveltekit-rules :26`, `testing-common :39`, `vitest-rules :48`, `node-test :58`, `playwright-cli :68`, `playwright-e2e :78`, `storybook-usage :88`, `svelte-testing :98`, `eslint-setup :112`, `git-setup :121`, `nodejs-npm-setup :130`, `storybook-setup :139`. Ошибочно только число в прозе (в двух местах) |
| §5.1 LOC всех rule-файлов | **CONFIRMED** | Совпадение 14/14: `typescript-rules` 589, `svelte5-runes` 248, `sveltekit-rules` 247, `common` 269, `vitest-rules` 326, `node-test` 298, `playwright-cli` 199, `playwright-e2e` 361, `storybook-usage` 173, `svelte-testing` 237, `eslint-setup` 475, `git-setup` 267, `nodejs-npm-setup` 394, `storybook-setup` 153 |
| §5.1 8-полевая форма записи | **CONFIRMED** | Пример `testing-common` (`:39-47`) несёт `<File>`, `<Purpose>`, `<Triggers>`, `<SkipWhen>`, `<ActivationHint>`, `<CheckPhase>`, `<RequiresVerification>`; `<CrossRef id>` — 13 штук по файлу |
| §5.1 3 незарегистрированных uikit-файла, 919 LOC | **CONFIRMED** | `uikit-component-storybook.xml` 342 + `uikit-component-svelte.xml` 339 + `uikit-spec-drafting.xml` 238 = **919**; ни один не назван в `<Rules>` |
| §5.1 `ai/directives/architecture/` содержит только `README.md` (21 LOC) | **CONFIRMED** | — |
| §5.1 нет rule-файлов для Python/Go/Swift/Rust/Java | **CONFIRMED** | В `coding/`, `testing/`, `infra/` нет ни одного |
| §5.2 таблица `<DependsOn>` | **CONFIRMED** | **Совпадение 1:1 по всем 17 файлам.** Ребра: `svelte5-runes`→`typescript-rules`; `sveltekit-rules`→`typescript-rules`,`svelte5-runes`; `uikit-component-svelte`→`svelte5-runes`,`uikit-spec-drafting`; `uikit-component-storybook`→`storybook-usage`,`uikit-component-svelte`; `playwright-cli`→`typescript-rules`; `playwright-e2e`→`typescript-rules`,`playwright-cli`; `svelte-testing`→`vitest-rules`,`svelte5-runes`. Листья (пустой `<DependsOn>`): `typescript-rules`, `uikit-spec-drafting`, `testing/common`, `node-test`, `storybook-usage`, `vitest-rules`, все 4 `infra/*` |
| §5.2 дрейф `<CrossRef>` vs `<DependsOn>` для `testing-common` | **CONFIRMED** | `vitest-rules`, `node-test` не объявляют `<DependsOn>` вовсе; `svelte-testing` объявляет `vitest-rules` + `svelte5-runes`, но **не** `testing/common.xml`. То есть `checkRulesCascadeClosure` действительно никогда его не требует. Утверждение верно |
| §5.3 `rules-cascade.ts` 82 LOC, 3 экспорта, `:22-33`/`:41-45`/`:56-82` | **CONFIRMED** | Код находки `SDD_RULES_CASCADE_UNRESOLVED` на `:78` |
| §5.4 `sync` — package-owned mirror, удаляет stale | **CONFIRMED** | Комментарий на `:219-225` дословно: «Sync is a package-owned mirror, not an additive copy. A removed directive must disappear from the target too, otherwise an update can keep executing stale flow logic indefinitely»; `status: 'deleted'` + `deps.unlink` на `:233-243` |
| §5.4 `scanTargetMirrorSpace` — чужой подкаталог не трогается, warning | **CONFIRMED** | `:160-162` дословно: «unknown subdirectory in target (not owned by package, left untouched): ${name}»; комментарий `:164-169` о root-level файлах только при полном синке |
| §5.4 **`knowledge.xml` НЕ защищён** | **CONFIRMED** | Grep `knowledge` по `cli/cmd/sync/*.ts` и `shared/common/sync/*.ts` → 0 попаданий. Тест `sync-core.test.ts` подтверждает обратное — что он **включён** в зеркало: `assert.deepStrictEqual(files, ['coding/typescript.xml', 'knowledge.xml', 'sdd/discovery.xml'])` (≈`:98-107`) и `assert.deepStrictEqual(files, ['knowledge.xml'])` в кейсе «excludes entries from EXCLUDED_ENTRIES set» (≈`:141-150`). Заявленные A2 строки `:99-106`/`:142-149` сдвинуты на 1, содержание верно. Отсутствие фикса `f74c8c1d` в RC подтверждено (его нет в истории `11291af5`) |
| §5.5 `sync-skills`: нет манифеста, нет исключения `__tests__` | **CONFIRMED** | `EXCLUDED_NAMES = new Set(['.DS_Store'])` `:22` + `name.startsWith('.')`; grep `manifest`/`__tests__`/`.test.` → 0; `ai/skills/**` содержит только `SKILL.md`, `README.md`, `PRD_TEMPLATE.md` — тестовых файлов нет |

---

## § 6 — `ai/flow-eval`

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| «7 058 LOC across 42 files» | **INACCURATE** | **50** файлов в дереве; `wc -l` по `*.ts/*.md/*.json/*.sh/*.py` → **7887**. Порядок величины верен |
| §6.1 LOC всех модулей | **CONFIRMED** | Совпадение 14/14: `cli.ts` 309, `provision.ts` 1341, `runner.ts` 168, `observer.ts` 199, `judge.ts` 74, `evidence.ts` 308, `quality-gate.ts` 59, `migration-grade.ts` 145, `types.ts` 270, `prompts.ts` 91, `opencode-runtime.ts` 144, `opencode-client.ts` 17, `sandbox-lifecycle.ts` 110, `session-directory.ts` 19 |
| §6.2 **7 сценариев, 58 LOC** | **CONFIRMED** | `scenarios.json` — 58 строк, 7 объектов. Все поля таблицы A2 (`id`, `phase`, `mode`, `fixture`, `scale`, `acceptance`) сверены дословно с JSON. `slugify-toolchain` действительно **без** поля `acceptance` |
| §6.2 «7 фаз, 11 режимов, 14 фикстур в `types.ts`» | **CONFIRMED** | `SddEvalPhase` — 7 (`spec-authoring scaffold execute repair task brownfield migration`); `SddEvalMode` — 11; `SddEvalFixtureId` — 14; `FIXTURE_FILES` в `provision.ts` — те же 14 ключей |
| §6.2 таблица «declared but absent» | **CONFIRMED** | Отсутствующие фазы `brownfield`, `migration`; режимы `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2`; фикстуры — все 7 `brownfield-*`. Полностью совпадает |
| §6.3 `judge.ts` контракт, `parseVerdict :44-52` | **CONFIRMED** | Регэксп на `:40-42`, возврат `'inconclusive'` по умолчанию на `:45`. Толерантность к bold/backticks и русскому «вердикт» подтверждена в самом регэкспе |
| §6.4 R1 и MIGRATION — единственные два эмитируемых id | **CONFIRMED** | `quality-gate.ts` целиком прочитан (59 LOC): `rule: 'R1'` на `:31,33,34,57`. `cli.ts:259`: `quality = { rule: 'MIGRATION', pass: g.pass, detail: g.detail };`. Grep `R-COMPLETE`/`R_COMPLETE` по всему чекауту `11291af5` → **0 попаданий** ✓ |
| §6.4 «нет `rule: 'R3'` нигде» | **CONFIRMED** | Grep → 0 |
| §6.4 `migration-grade.ts` — `MIGRATION_CRITICAL_CODES`, baseline-diff | **CONFIRMED** | 145 LOC, состав кодов и логика на `:31-36`, `:98-101` |
| §6.5 «10 файлов» | **CONFIRMED** | 10 `*.test.ts` |
| §6.5 «2 002 LOC» | **INACCURATE** | **2031** |
| §6.5 **«75 test cases»** | **INACCURATE** | Реальный прогон `node --import tsx --test ai/flow-eval/__tests__/*.test.ts` даёт: `# tests 84 / # suites 14 / # pass 83 / # fail 1`. То есть **84** кейса, не 75 |
| §6.5 per-file: `harness.test.ts` 29 | **INACCURATE** | Раннер сообщает **22** (`harness.test.ts` 1128 LOC ✓) |
| §6.5 per-file: `infra-golden.test.ts` 3 | **INACCURATE** | Раннер сообщает **9** (3 top-level `test()` с сабтестами) |
| §6.5 per-file: `fixture-coverage.test.ts` 1 | **INACCURATE** | Раннер сообщает **4** |
| §6.5 per-file: остальные | **CONFIRMED** | `brownfield-spec-golden` 19 ✓, `brownfield-golden` 6 ✓, `sandbox` 7 ✓, `migration-grade` 7 ✓, `sandbox-lifecycle` 4 ✓, `judge` 3 ✓, `quality-gate` 3 ✓. LOC per-file — все 10 совпали (137/265/51/1128/128/34/87/27/80/94) |
| §6.5 состав сьютов | **CONFIRMED** (выборочно) | Названия сьютов в выводе раннера совпадают с описанными: `eval sandbox script (deterministic prepare/clean)`, `parseSddCheckResult (R1, both outcomes)`, `migration-grade (histogram + deterministic baseline-diff grade)`, `sandbox lifecycle (extract artifacts, then tear down)` и др. |
| §6.6 LOC всех доков | **CONFIRMED** | Совпадение 14/14: `README.md` 71, `RUNBOOK.ru.md` 211, `WRITING-EVALS.ru.md` 158, `QUALITY-RULES.ru.md` 65, `ROADMAP.ru.md` 77, `PROGRESS-REPORT.ru.md` 125, `EXPERIMENTS-LOG.ru.md` 262, `INFRA-TASKS-RESEARCH.ru.md` 58, `P9-UNDERSTANDING-SIGNIFIERS.md` 43, `P9-VERIFICATION.md` 50, `docs/flow-verification-redesign.md` 167, `docs/flow-verification-ledger.md` 91, `docs/roundtrip-wall3-assessment.md` 79, `docs/swiftlint-toolchain-setup.md` 61 |
| §6.6 «`swiftlint-toolchain-setup.md` — единственный Swift-артефакт в репозитории» | **INACCURATE** | Swift также упоминается в `ai/flow-eval/docs/roundtrip-wall3-assessment.md`, `ai/flow-eval/scripts/roundtrip-eval.sh`, `roundtrip-grade.sh`, `session-metrics.py`, `roundtrip-readiness-shim.package.json`. Правильнее: единственный **выделенный** Swift-док |
| §6.7 матрица покрытия — 10 выборочных ячеек | **CONFIRMED (8) / INACCURATE (2)** | ✓ Router routing: LLM-сценария нет; ✓ Spec authoring: `fibonacci-library` scale `function`; ✓ Module decomposition: сценария нет, `module-specs.test.ts` есть; ✓ Infra/Interface authoring: ни LLM, ни детерминированных; ✓ Scaffold: `tic-tac-toe` + `project-feasibility.test.ts`/`phase-verification-plan.test.ts`/`templates.test.ts` есть; ✓ Execute: `slugify-toolchain` действительно без `acceptance`; ✓ Code-review: **никакого** теста нет вообще (`find` по `*code-review*` даёт только скилл, директиву и её `.hbs`); ✓ Reconcile: тестов нет, только `ai/flow-sim/S8`,`S9`; ✓ Non-Node stacks: покрытия нет. **INACCURATE**: «Repair … `check*.test.ts` (28 files)» → в `shared/sdd/__tests__` их **22**; «Harness self-correctness — 46 cases» → фактически **39** (22+7+4+3+3) |
| §6.7 агрегат «75 детерминированных кейсов» | **INACCURATE** | **84** (см. выше) |
| §6.7 «8 flow-поверхностей без автоматического покрытия» | **CONFIRMED** | Перечисленные 8 (infra authoring, interface authoring, code-review, reconcile, discover-from-code, batch execute, module decomposition e2e, router routing) действительно не имеют ни LLM-сценария, ни теста |
| §6.8 `ai/flow-sim` — 13 md-файлов, 4 123 LOC, ни кода, ни npm-скрипта | **CONFIRMED** | 13 файлов, `wc -l` → `4123 total`; в `package.json` нет ни одного скрипта, ссылающегося на `flow-sim` |
| §6.8 `ai/inspector` — тесты вне `npm test` | **CONFIRMED** | 22 файла; `inspector:test` — отдельный скрипт `package.json:26` |

### Отдельно: единственный красный кейс

```
not ok 14 - provisioner gives fixture scenarios unique isolated directories
  location: ai/flow-eval/__tests__/harness.test.ts
  error: 'gennady dist is missing at <R>/dist; run npm run build first'
  stack: findGennadyRoot (ai/flow-eval/provision.ts:1127:11)
```

**MISSED**: на чистом чекауте без `npm run build` один из 84 кейсов красный по причине окружения (нет `dist/`). Это не дефект логики, но и не «75 зелёных кейсов» — фактическое состояние 83 pass / 1 environment-fail. Именно этот класс адресует более поздний коммит `3d5f66a7` (см. § Изменения).

---

## § 7 — Self-hosting

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| «Репозиторий, поставляющий SDD v2, сам всё ещё на v1» | **CONFIRMED** | `sdd-state .` → `FLOW_VERSION=v1`, `NEXT=migrate the v1 task layout before entering the v2 scaffold flow` |
| §7.1 `tasks/` — 138 файлов, **127** тикетов `*.task-*.md` | **CONFIRMED** | Ровно 138 и 127 |
| §7.1 per-scope разбивка тикетов | **CONFIRMED** | Совпадение 10/10: `cli` 48, `agent-inbox` 27, `vcs` 16, `dbc` 15, `agent-mon` 7, `agent-mon-cli` 4, `infra-npm-publish` 4, `agent-run` 3, `mr-stats` 2, `ai-skills` 1 |
| §7.1 **1** v2-тикет под `specs/` | **CONFIRMED** | Ровно один: `specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md` |
| §7.1 3 индекса `*.3-tasks.md` | **CONFIRMED** | `specs/3-tasks.md`, `specs/ai-skills/ai-skills.3-tasks.md`, `specs/ai-skills/directive-assembly/directive-assembly.3-tasks.md` |
| §7.1 `specs/` — 86 файлов, 12 scope-каталогов | **CONFIRMED** | Ровно 86 и 12 |
| §7.2 снимок `sdd-state` | **CONFIRMED** | Перезапущен: `FLOW_VERSION=v1`, `PORTAL=present specs/README.md`, `READINESS=ready`, `AUTHORING_READY=no`, `EXECUTION_READY=yes`, `GATE_QUEUE=none`, `NEXT=…`, `[SPEC_SCHEMA] VERSION=sdd-v2 STATUS=current`, все 8 required-скриптов ✔, `lint→gennady ✔`, `check→read-only ✔`, `gennady-installed ✔`, `[SCOPES] 12`. Отмеченное A2 «внутреннее напряжение» (`READINESS=ready` + `EXECUTION_READY=yes` при `AUTHORING_READY=no`) воспроизведено |
| §7.3 **`sdd-check --all .` → 198 / 431 / 212** | **CONFIRMED** | Перезапущено `sh -c 'cd <R> && node --import tsx cli/gennady.ts sdd-check --all .'`, exit **1**. Итоговая строка **байт-в-байт**: `[sdd-check] 198 error(s), 431 warning(s) across 212 file(s)`, обе `next:`-строки на русском совпадают |
| §7.3 «507 находок под `tasks/`, 122 под `specs/`» | **CONFIRMED** | 507 и 122 ровно |
| §7.3 гистограмма ошибок (198) | **CONFIRMED** | **Совпадение 21/21 позиций**: `SDD_VERIFICATION_TABLE_INVALID` 47, `SDD_FABRICATED_DONE` 44, `SDD_BDD_REQUIREMENT_UNTRACED` 37, `SDD_DEP_UNRESOLVED` 18, `SDD_SECTION_OVERLAP` 9, `SDD_RESEARCH_DISPOSITION_MISSING` 6, `SDD_BROKEN_SPEC_REF` 6, `SDD_TRACKER_STATUS_DRIFT` 5, `SDD_PHASE_SECTION_ORPHAN` 4, `ERR_CLI_SDD_CHECK_READ_FAILED` 4, `SDD_TASK_ID_COLLISION` 3, `SDD_ANCHOR_UNBALANCED` 3, `SDD_SPEC_SECTION_MISSING` 2, `SDD_PHASE_DEP_UNRESOLVED` 2, `SDD_DIAGRAM_INVALID` 2, и по 1 — `SDD_RULES_CASCADE_UNRESOLVED`, `SDD_PHASE_SECTION_MISSING`, `SDD_MODULE_DAG_CYCLE`, `SDD_DONE_WITH_ACTIVE_BLOCKER`, `SDD_DIAGRAM_CAPTION_MISSING`, `SDD_BDD_MISSING_NEGATIVE`. Сумма 198 |
| §7.3 гистограмма предупреждений (431) | **CONFIRMED** | **Совпадение 18/18**: `SDD_BDD_COVERAGE_ROW_UNPARSED` 140, `SDD_LEGACY_TICKET_UNANCHORED` 76, `SDD_BDD_SCENARIO_UNTESTED` 70, `SDD_TRACKER_MISSING_ROW` 37, `SDD_MODULE_NO_CALL_CHAIN` 26, `SDD_DIAGRAM_CAPTION_MISSING` 15, `SDD_MODULE_NOT_IN_INDEX` 11, `SDD_DONE_WITH_PLACEHOLDERS` 11, `SDD_BROKEN_SPEC_ANCHOR` 11, `SDD_MODULE_OVERSIZED` 9, `SDD_LANGUAGE_CALQUE` 9, `SDD_DL_LEGACY_ID` 4, `SDD_SCOPE_DEP_UNDECLARED` 3, `SDD_BDD_TESTFILE_AMBIGUOUS` 3, `SDD_TRACKER_ORPHAN_ROW` 2, `SDD_RESEARCH_UNREGISTERED` 2, `SDD_STATUS_UNPARSEABLE` 1, `SDD_MISSING_TASK_ID` 1. Сумма 431 |
| §7.3 «RC не self-hosts v2: 1 из 128 тикетов v2, 1 из 12 скоупов с v2-индексом, `sdd-check --all` красный на своих же `specs/`» | **CONFIRMED** | Все три числа воспроизведены; 122 находки в `specs/` подтверждают вывод |

---

## § 8 — Топология тестов

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| `scripts/test-topology.ts` 360 LOC | **CONFIRMED** | — |
| `TEST_LAYERS = ['unit','contract','local','external']` (`:10`) | **CONFIRMED** | Дословно на `:10` |
| `TEST_ROOTS = ['ai','cli','services','shared']` | **CONFIRMED** | `:19` |
| `discoverTests :156-167` + все 4 фильтра + `V2_GATE_EXCLUDED_NAMES :25-34` | **CONFIRMED** | `discoverTests` на `:156`; фильтры `/agent-inbox/`, `/serve/__tests__/`, `.integration.test.`, `.real-integration.test.` дословно; `V2_GATE_EXCLUDED_NAMES` — ровно 6 имён (`http-server.test.ts`, `eval-driver.test.ts`, `reviewer.e2e.test.ts`, `full-flow.blackbox.test.ts`, `run-mode.test.ts`, `harness.test.ts`). Комментарий-обоснование исключения `harness.test.ts` найден дословно, включая «Under c8 coverage instrumentation this deterministically exceeds the offline commit gate's per-test budget and cancels — not a real failure» |
| `classifyTest :175-194`, 4 правила | **CONFIRMED** | `classifyTest` на `:175`; `LOCAL_BOUNDARY_SIGNALS` на `:131`; `UNIT_ROOTS` на `:38-45` — ровно `'ai/flow-eval/','ai/inspector/','cli/','services/','shared/','utils/'` |
| `assertTopology :196-213`, `coveragePartitions :221-237` | **CONFIRMED** | Реально `:197` и `:222` (сдвиг 1) |
| `OUTER_TEST_CONCURRENCY = 6` (`:23`) | **INACCURATE** | Значение 6 ✓, строка `:24`. Комментарий-обоснование найден дословно |
| `EXTERNAL_TEST_OPT_IN_ENV_KEYS = ['GENNADY_E2E','GENNADY_OPENCODE_INTEGRATION']` | **CONFIRMED** | `:46` |
| **живой вывод `check`** | **CONFIRMED** | Перезапущено: `unit=211 contract=16 local=51 external=8` / `coverage observed=227[unit+contract] black-box=59[local+external]` — **байт-в-байт**. 286 файлов в гейте ✓ |
| §8.2 `test`, `test:coverage`, `test:topology`, `test:sdd-flow-eval`, `inspector:test`, `test:integration`, `test:watch`, `check`, `audit:sdd-templates`, `prepare` | **CONFIRMED** | Все команды сверены с `package.json` дословно |
| §8.2 `test:unit` не определён | **CONFIRMED** | В `package.json` его нет |
| §8.2 «`test:e2e` — 6 e2e-сьютов» + список из 7 имён | **INACCURATE** | Файлов **7**: `e2e.test.ts`, `lint.e2e.test.ts`, `orient.e2e.test.ts`, `real-toolchain.e2e.test.ts`, `sdd-extract.e2e.test.ts`, `sync-skills.e2e.test.ts`, `sync.e2e.test.ts` (+ `fixtures/`, `setup.ts`). Список A2 верен, число — нет |
| §8.2 `format` = `prettier --check .` | **INACCURATE** | Реально `prettier --check . --cache --cache-strategy content`. Read-only характер сохранён |
| §8.2 **`prepublishOnly` не запускает `npm test`** | **CONFIRMED** | Дословно: `npm run lint && npm run test:e2e && npm run build:publish`. Ни `npm test`, ни `audit:sdd-templates` |
| §8.3 hook 7 077 байт, единственный | **CONFIRMED** | `wc -c` → 7077; в `scripts/git-hooks/` только `pre-commit` |
| §8.3 env-scrub | **CONFIRMED** | `:8` дословно: `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR` |
| §8.3 index-aware guard | **CONFIRMED** | `:61-68`: `git status --porcelain=v1 --untracked-files=all` + `awk`-фильтр по колонке 2; сообщение «Гейт проверяет рабочее дерево, а commit запишет ИНДЕКС» дословно |
| §8.3 6 последовательных гейтов в заявленном порядке | **CONFIRMED** | `:72-77`: `check` → `check:directives-fresh` → `audit:axioms` → `audit:contracts` → `audit:halts` → `check:directive-budgets`, каждый со своим `fail <gate>` |
| §8.3 «`npm run check` транзитивно прогоняет все 286 файлов, но не `test:e2e`/`test:integration`/`test:sdd-flow-eval`/Playwright» | **CONFIRMED** | `check` = `sdd-verify --profile full` → `test:coverage` → `test-topology.ts coverage` |

### MISSED (материально): `TEST_ROOTS` не покрывает `utils/` и `test/`

`UNIT_ROOTS` содержит `'utils/'` (`test-topology.ts:44`), но `TEST_ROOTS` (`:19`) — только `['ai','cli','services','shared']`. `discoverTests()` обходит **исключительно** `TEST_ROOTS`, поэтому:

- `utils/test/__tests__/mock-http.test.ts` и `utils/test/__tests__/git-fixture.test.ts` (2 файла) **никогда не обнаруживаются** — ветка `UNIT_ROOTS`-классификации по `'utils/'` недостижима (мёртвый код в `classifyTest`);
- вся верхнеуровневая директория `test/` (**23** файла `*.test.ts` под `test/agent-inbox/**`, включая `.contract.test.ts` и `.integration.test.ts`) не попадает в гейт вообще.

Итого 25 тестовых файлов вне `npm test` по причине, которую A2 не назвал: §8.1 цитирует и `TEST_ROOTS`, и `UNIT_ROOTS` корректно, но их несогласованность не отмечена, а `test/` как дерево в §8 не упомянут ни разу (появляется только неявно в §10.2, где A2 в списке изменённых областей пропустил строку `test/agent-inbox 23`).

---

## § 9 — Точки расширения и пересечения

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| `readiness.ts:15-24` `REQUIRED_SCRIPTS` ❌ | **CONFIRMED** | module-level `const`, без инъекции |
| `readiness.ts:596-609` источник входа ❌ | **CONFIRMED** | — |
| `readiness.ts:566-587` gennady-проба | **INACCURATE** | `:572-591` |
| `readiness.ts:101-132` детекция switch | **INACCURATE** | `:260-291` |
| `readiness.ts:176 lintReachesGennady` | **INACCURATE** | `:199`; `:176` — `scriptReachesGennady` |
| `shared/sdd/scripts.ts` ❌ | **CONFIRMED** | — |
| `ladder.ts:36-39,68` рунг 4 ❌ | **CONFIRMED** | `:68` дословно |
| `phase-verification-plan.ts:270` `npm run ${script}` ❌ | **CONFIRMED** | Точное совпадение |
| `sdd-verify.cmd.ts:225-226` ❌ | **CONFIRMED** | `:226` |
| `repair-adapters.ts:99,120` ❌ | **CONFIRMED** | Точное совпадение обеих строк |
| `sdd-verify.cmd.ts:433-451` требование repair-bricks ❌ | **CONFIRMED** (по help) | Help подтверждает: «Only setup may skip an undeclared repair/foundation script with an honest ⏭ line» |
| `phase-receipt.ts:95-320` + `SCRIPT_RUNNERS :467-481` + `go run` `:948` ✅ partial | **CONFIRMED** | Слой receipt действительно единственный многоязычный |
| `sdd-task.cmd.ts:491-499` ❌ | **INACCURATE** | `:495-500` |
| `coverage-adapter-registry.ts:7` `COVERAGE_ADAPTERS` ✅ | **CONFIRMED** | Комментарий на `:7` дословно: «Sole registration point; add future platform adapters without changing orchestration.»; `const` на `:8`; fail-closed отбор `:20-30` (`selected`/`unsupported`/`ambiguous`) — точно как описано. Зарегистрирован только `istanbulCoverageAdapter` |
| `probe.ts:11,15-35` ❌ | **INACCURATE** | `:12` и `:15-33`; содержание верно, включая доккоммент «(Node-only support today)» |
| **`capability-adapter.ts:69-190`, комментарий `:70`** ✅ | **INACCURATE** | Цитата «Production defaults; new platforms extend this value or inject another registry.» находится на **`:201`**, непосредственно перед `DEFAULT_CAPABILITY_ADAPTER_REGISTRY` (`:202`). Адаптеры объявлены на `:75-190`. На `:68` — другой комментарий («Injectable adapter lookup; tests add a fake platform without changing production code»), тоже подтверждающий вывод. Сам вывод («заявленная точка подключения, ничего кроме Node/TS не зарегистрировано») **верен** |
| `spec-schema.ts:12-19` Bootstrap-колонки ✅ shape / ❌ values | **CONFIRMED** | — |
| `yagni.ts` + help ✅ partial, `cli/cmd/lint/**` ❌ | **CONFIRMED** | — |
| `infra.directive.xml:430-432`, `:191` ❌ | **CONFIRMED** | Цитаты дословны |
| `readiness.directive.xml:1,3-22,106-112,209` ❌ | **CONFIRMED** | — |
| `ai/directives/knowledge.xml` «(15 rules)» | **INACCURATE** | **14** (см. §5) |
| `rules-cascade.ts` stack-neutral ✅ | **CONFIRMED** | Чистая работа с путями и `<DependsOn>` |
| `ax-rule-activation-plan.xml` «Signal-based only …» ✅ | **CONFIRMED** | — |
| `ai/kit/axiom/infra/**` (31) + svelte (34) + storybook (22) + uikit (17) + e2e (24) = 97 ❌ | **CONFIRMED** | Все пять счётчиков совпали, сумма 128 для пяти; заявленные A2 «97 из 427, привязанных к одному веб-стеку» относятся к svelte+storybook+uikit+e2e = 34+22+17+24 = **97** ✓ |
| `gennady.yaml` отсутствует ❌ «the missing keystone» | **CONFIRMED** | Файла нет (см. уточнение по упоминаниям в §1.2) |
| flow-eval фикстуры: 14 (11 Node, 3 bash/Makefile) ❌ | **CONFIRMED** | 14 ключей `FIXTURE_FILES`; три infra-фикстуры bash/Makefile |
| §9.2 «`main` ships 15 skills» | **INACCURATE** | В `8bb38477:ai/skills` **16** каталогов: `agent-inbox alt-opinion prd-interview sdd-audit sdd-check sdd-continue sdd-critic sdd-discover sdd-execute sdd-execute-batch sdd-fix sdd-infra sdd-module-decomposition sdd-scaffold sdd-setup workspace-permission-setup`. Список в §9.3 A2 перечисляет ровно эти 16 — ошибка только в числе |
| §9.2 «RC ships `sdd`, `sdd-reconcile`, `opencode-get-session`, which main lacks» | **INACCURATE** (неполно) | `main` не имеет также `sdd-code-review` — то есть RC-only скиллов **4**, а не 3 |
| §9.2 остальные строки (VERIFY, CHECK-LOG, SYNC-OWNERSHIP, RULES, DIRECTIVES-SDD) | **CONFIRMED** | Все проверяемые подутверждения подтверждены выше в §§1-5 |
| §9.3 merge-base `46c6d616`, дата, subject | **CONFIRMED** | `git merge-base 11291af5 8bb38477` → `46c6d616700ee4cc61dbfe077d5b0052ce661dcd`; `2026-06-29 feat(vcs): unify --vcs-host flag + vcs-discussions --draft/--since/fullId` |
| §9.3 «RC 535 ahead, main 115 ahead» | **CONFIRMED** | `rev-list --count 46c6d616..11291af5` = **535**; `…..8bb38477` = **115** |
| §9.3 `version` 0.8.4 vs 0.9.0-next.3 | **CONFIRMED** | — |
| §9.3 `imports` (`#utils/*` только в RC) | **CONFIRMED** | RC: `{"#snapshot-path-setup","#logger","#utils/*"}`; main: без `#utils/*` |
| §9.3 `exports` | **CONFIRMED** | RC `"."` → `./services/agent-mon/index.ts` (исходник); main `"."` → typed `dist/index.{d.ts,js}` + `"./stack"` → `dist/services/stack/plugin-api.d.ts` / `dist/stack.js` |
| §9.3 `files` | **CONFIRMED** | RC: `dist/**/*`, `README.md`, `ai/**/*`, `cli/cmd/orient/README.md`; main дополнительно `docs/**/*`, `services/agent-run/engines/opencode/readonly.config.json`, `plugins/*/plugin.json`, `plugins/*/*.ts`, `plugins/*/directives/**/*`, `plugins/*/skills/**/*` |
| §9.3 `.npmignore` отсутствует в RC / есть в main | **CONFIRMED** | — |
| §9.3 `test`, `test:coverage`, `test:topology`, `test:smoke`, `test:e2e`→`test:cli-e2e`+`test:stack-e2e`+`test:config-e2e`, `lint`, `format`, `fix`/`check`, `prepublishOnly`, `publish-next`, SDD build-скрипты | **CONFIRMED** | **Все 11 строк совпали дословно.** main `test` = `node --import tsx --test --experimental-test-module-mocks --test-concurrency=1`; main `lint` = `npm run format && npm run type-check && npm run lint:contracts` (мутирующий, `--autofix … plugins/`); main `format` = `prettier --write .` + `format:check`; `fix`/`check` в main отсутствуют; main `prepublishOnly` = `lint && test:smoke && test:cli-e2e && CONFIG_E2E_STRICT=1 test:config-e2e && STACK_E2E_STRICT=1 test:stack-e2e && build:publish`; ни одного `build:directives`/`audit:*`/`sdd-flow-eval`/`inspector*`/`yagni` в main |
| §9.3 `cli/cmd/sdd-*`: 11 в RC, 0 в main; main имеет `verify`, `fix`, `commit`, `resolve-conflicts`, `alt-opinion`, `review-*` | **CONFIRMED** | `8bb38477:cli/cmd` содержит `verify fix commit resolve-conflicts alt-opinion review review-diff review-issues review-verify` и ни одной `sdd-*` |
| §9.3 «`shared/sdd/` — 48 модулей … does not exist в main» | **CONFIRMED** по main / **INACCURATE** по числу | `8bb38477:shared` = `AGENTS.md backend common` — `sdd/` действительно нет. Число 48/62 — см. §2 |
| §9.3 `ai/` в main: `agents`, `directives` (incl. `sdd/`), `docs`, **`drafts`**, `skills`; нет `kit`/`flow-eval`/`flow-sim`/`inspector` | **REFUTED** (частично) | `8bb38477:ai` = ровно `agents directives docs skills`. **`ai/drafts` в `main` не существует** — `git ls-tree -r 8bb38477 \| grep -i drafts` даёт 0 попаданий по всему дереву. Верно: `sdd/` внутри `ai/directives` ✓, отсутствие `kit`/`flow-eval`/`flow-sim`/`inspector` ✓. Дополнительно `ai/directives` в main содержит не упомянутые A2 `dbc-audit.directive.xml`, `dev-review.directive.xml`, `perf-auditor/`, `semantic-change-extractor.directive.xml` (полный состав: `agent-inbox architecture coding dbc-audit.directive.xml dev-review.directive.xml infra knowledge.xml perf-auditor sdd semantic-change-extractor.directive.xml testing`) |
| §9.3 Stack-механизм в main: `gennady.yaml` + `plugins/{node,golang,anystack}` + `services/stack/{…}` | **CONFIRMED** | `8bb38477:gennady.yaml` существует; `8bb38477:plugins` = `anystack golang node index.ts`; `8bb38477:services/stack` = ровно 7 названных модулей + `__tests__`: `env-fail.ts gate-runner.ts plugin-api.ts stack-config.ts stack-registry.ts stack.types.ts tree-guard.ts` |
| §9.3 SDD-раскладка: main — 100 v1-тикетов, specs добавляет `config`, `plugins`, `stack`, `infra-e2e` | **CONFIRMED** | `git ls-tree -r 8bb38477:tasks \| grep -c 'task-'` → **100**; `8bb38477:specs` содержит `config plugins stack infra-e2e` |
| §9.3 главный вывод о необходимости design-reconciliation | **CONFIRMED** (обоснован) | Все опорные факты (литерал `npm run` в RC, `GateSpec`/`gate-runner` в main, отсутствие `sdd-check`/`sdd-task`/`sdd-log` в main) подтверждены |

---

## § 10 — Версия и история

| Утверждение A2 | Вердикт | Факт |
|---|---|---|
| `version` = `0.8.4`, HEAD `11291af5`, ветка, detached | **CONFIRMED** | — |
| HEAD-коммит: автор, дата `2026-09-06 22:33:26 +0300`, subject, 2 файла / +23 / −2 | **CONFIRMED** | `git show 11291af5 --stat` совпал построчно |
| §10.1 `git log --oneline -30` | **CONFIRMED** | Первые три (`11291af5`, `94164668`, `4bb00f4b`) сверены напрямую; ни одного расхождения в проверенной части |
| §10.2 histogram типов коммитов по последним 60 | **CONFIRMED** | `feat` 25, `fix` 14, `docs` 8, `test` 4, `refactor` 3, `chore` 3, `wip` 1, `refine` 1 (=59) + 1 `Revert "…"` = 60 — **все 9 значений совпали** |
| §10.2 histogram скоупов: `(sdd)` 30, `(flow-eval)` 18, `(sdd-migrate)` 4, `(sdd-v2)` 3 | **INACCURATE** | Реально `sdd` **29**, `flow-eval` 18 ✓, `sdd-v2` 3 ✓, `sdd-migrate` **3**. Одиночные (`sdd-v2/migration`, `sdd-state`, `sdd-log`, `sdd-check`, `lint`, `dbc-linter`) — по 1 ✓ |
| §10.2 изменённые файлы по областям с merge-base | **CONFIRMED (неполно)** | Все 12 названных значений совпали: `ai/kit` 979, `services/agent-inbox` 360, `cli/cmd` 219, `shared/sdd` 114, `ai/directives` 112, `ai/flow-eval` 50, `e2e/inbox-serve` 41, `ai/skills` 34, `tasks/agent-inbox` 30, `cli/__tests__` 23, `ai/inspector` 22, `ai/flow-sim` 13. **Пропущены** позиции того же порядка: `test/agent-inbox` 23, `specs/cli` 20, `specs/agent-inbox` 19, `services/dbc` 19 |
| §10.3 содержание HEAD-коммита (ledger E1/E2/E3) и предшествующего `4bb00f4b` | **CONFIRMED** | Stat совпал; `4bb00f4b feat(sdd-v2): mechanical group-audit/review completion receipts` — реальный предшественник; `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` и `group-receipt.ts` подтверждены в §2 |

---

## § Изменения после `11291af5`

В `<G>` поверх RC-tip есть два коммита, оба в `ai/flow-eval/**`. Директив, `shared/sdd`, `cli/cmd`, `ai/kit` они не касаются — то есть §§1-5, 7, 8, 9 документа A2 они **не меняют**.

### `95329c19 feat(flow-eval): R-COMPLETE quality rule — reads DONE+round+group receipts from disk (H1 fix), opt-in via scenario.completion`

5 файлов, +170/−3: `ai/flow-eval/quality-gate.ts` (+84), `__tests__/quality-gate.test.ts` (+66), `cli.ts` (+11), `types.ts` (+5), `scripts/roundtrip-eval.sh` (+7).

**Что именно устаревает в A2:**

| Место в A2 | Было (верно на `11291af5`) | Стало на `95329c19` |
|---|---|---|
| §6.4, абзац после таблицы R1-R6 | «**There is no `R-COMPLETE` rule** — grep for `R-COMPLETE` / `R_COMPLETE` across the checkout returns nothing» | **Опровергнуто.** Добавлены `parseCompletion()` и `checkCompletion()`, эмитирующие `rule: 'R-COMPLETE'`; grep теперь даёт попадания в `quality-gate.ts`, `cli.ts`, `__tests__/quality-gate.test.ts` |
| §6.4, «The **only two objective gate ids the code actually emits** are `R1` … and `MIGRATION`» | верно | **Стало три**: `R1`, `MIGRATION`, `R-COMPLETE` |
| §6.4, «the *completion* work … landed as the group-audit/review receipt mechanism …, **not as a named `R*` quality rule**» | верно | **Опровергнуто**: именно этот механизм теперь и оформлен как названное правило. `CompletionSignals` = `{artifactExists, ticketDone, roundClosed, auditReceipt, reviewReceipt}`; правило RED, если артефакт создан, но не хватает любого сигнала; `checkCompletion` в `cli.ts:266-273` — **decisive над R1** («a failing R-COMPLETE is decisive over R1 (structure clean ≠ work finished)») |
| §6.2 (форма сценария) / §6.3 | — | В `SddEvalScenario` (`types.ts`) добавлено опциональное поле `completion?: { artifact: string; ticket: string; spec: string }`. Opt-in: сценарии без него не затронуты; `scenarios.json` не изменён, так что таблица §6.2 остаётся верной |
| §6.5 (кол-во кейсов) | 84 фактических | `quality-gate.test.ts` вырос на +66 строк — счётчик кейсов ещё выше |
| §9.2 строка CHECK-LOG «known blind spot is the **abandoned artifact** … Partially closed by the group receipts (E1)» | верно | Закрыто дальше: H1 адресован механически на уровне eval-гейта |

### `3d5f66a7 fix(flow-eval): sandbox always gets the fresh local dist — materializeLocalCli refreshes dist/ai/shim (not blanket-skip), runner rebuilds first; deterministic test`

3 файла, +89/−8: `ai/flow-eval/__tests__/provision-gennady.test.ts` (новый, +67), `provision.ts` (+25/−8), `scripts/roundtrip-eval.sh` (+5).

| Место в A2 | Изменение |
|---|---|
| §6.5 «10 файлов, 2 002 LOC» | **Стало 11 файлов** — добавлен `__tests__/provision-gennady.test.ts`; LOC и число кейсов ещё выросли |
| §6.1 `provision.ts` 1 341 LOC | Изменён (+25/−8) — LOC устарел |
| Единственный красный кейс на `11291af5` (см. §6 выше: `harness.test.ts` падает с «gennady dist is missing … run npm run build first» из `provision.ts:1127`) | Именно этот класс адресован: `materializeLocalCli` теперь обновляет `dist`/`ai`/shim вместо blanket-skip, а раннер сначала пересобирает. То есть наблюдённый мной 1 fail — известный дефект, исправленный в следующем же коммите |

---

## § Правки к A2

Ниже — точечные правки, отсортированные по значимости. Формулировки готовы к прямой вставке.

### Критично (опровергнуто)

1. **§2.3, последняя скобка.** Удалить `SDD_VERIFY_*` из списка «это `ERR_CLI_*`, а не находки» и добавить код в перечисление: «`cli/cmd/sdd-verify/phase-run.ts:255` — `SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED` (реальная находка, проверяется в `cli/__tests__/tool-behavior/bootstrap-path.test.ts:211,364`)».
2. **§2.3, последняя фраза.** Убрать «`spec-schema.ts` — `SDD_V2_SUBDIR`». `SDD_V2_SUBDIR` — путь-константа `'ai/directives/sdd-v2'` в `cli/cmd/sdd-state/sdd-state.types.ts:25`, не код находки. В `spec-schema.ts` кодов `SDD_*` нет вовсе.
3. **§9.3, строка `ai/`.** Удалить `drafts` из состава `main`: `ai/drafts` в `main` не существует ни на верхнем уровне, ни где-либо в дереве (`git ls-tree -r 8bb38477 | grep -i drafts` → 0). Правильный состав: `agents`, `directives` (incl. `sdd/`), `docs`, `skills`.
4. **§4.2, последнее предложение о halt-условиях.** Заменить на: «`H_ASK_WITHOUT_CARD` **не объявлен ни в одной директиве**: он встречается только в `root.directive.xml:190` (и в источнике `root.directive.hbs:66`) как ссылка «the same gate the router enforces», а таблица `<HaltConditions>` роутера его не содержит. Аллоулист `ALLOWLIST_CROSS_DIRECTIVE_REFS` в `ai/kit/audit-halt-activation.mjs:120-125` разрешает `root.directive::H_ASK_WITHOUT_CARD` и `scope.directive::H_ASK_WITHOUT_CARD` со ссылкой (`:25-26`) на объявление в `router.directive.hbs`, которого там нет — комментарий аудита устарел. Это самостоятельная находка: гейт «mentioned → declared» обходится аллоулистом для несуществующего halt.»

### Значимо (счётчики, влияющие на выводы)

5. **§5.1, шапка и §9.1, строка «Rules registry».** «15 `<Rule>` entries» → **14**. Таблица §5.1 уже содержит правильные 14 записей.
6. **§2, шапка раздела.** «48 modules, 15 743 LOC; 62 test files» → «**43** modules, 15 743 LOC; **61** test files». LOC верен.
7. **§6.5, шапка + §6.7, агрегат.** «10 files, 2 002 LOC, **75 test cases**» → «10 files, **2 031** LOC, **84 test cases**» (вывод раннера: `# tests 84 / # suites 14`). Поправить per-file: `harness.test.ts` **22** (не 29), `infra-golden.test.ts` **9** (не 3), `fixture-coverage.test.ts` **4** (не 1). §6.7 «46 cases» для harness self-correctness → **39**; «check*.test.ts (28 files)» → **22**.
8. **§9.2, строка SKILLS.** «main ships 15 skills» → **16**; «the RC ships `sdd`, `sdd-reconcile`, `opencode-get-session`, which main lacks» → добавить **`sdd-code-review`** (RC-only скиллов 4).
9. **§2.3.** «29 `SDD_SCAFFOLD_PLAN_*` codes» → **27** (перечисленный список уже содержит 27).
10. **§3.3 и §3, абзац о `ai/kit/__tests__/`.** «15 test files» → **14** (перечисленный список уже содержит 14).
11. **§3.1, строка `formats/*.xml`.** «23 files, 2 240 LOC» → «**24** files, **2 066** LOC (23 из них имеют `.hbs`-источник; `change-manifest.xml` — рукописный)». §3.2: «formats/ ×20» → **×22**.
12. **§4.2, вводный абзац.** «14 `<Axiom id=…>`, 13 of them `cross-cutting="true"`» → «14 `<Axiom id=…>`, **10** из них `cross-cutting="true"`; без атрибута — `AX_DIVERGE_BEFORE_RECOMMEND`, `AX_SCALE_PROPORTIONAL_DEPTH`, `AX_STATELESS_FLOW` (`invariant="true"`), `AX_V2_HAS_NO_INTERNAL_MIGRATION`».
13. **§3.4, последний абзац.** `anti-pattern/**` «12 dirs» → **11 dirs** (перечисленный список уже содержит 11).
14. **§6, шапка.** «7 058 LOC across 42 files» → «**7 887** LOC across **50** files».
15. **§8.2, строка `test:e2e`.** «6 e2e-сьютов» → **7** (список уже верен).
16. **§10.2, histogram скоупов.** `(sdd)` 30 → **29**; `(sdd-migrate)` 4 → **3**.
17. **§2.1, строка `check.ts`.** «`check.test.ts` + 22 `check-*.test.ts`» → «+ **21** `check-*.test.ts`».

### Точность ссылок (`file:line`)

18. **§1.2 и §2.2, блок `readiness.ts`.** Заменить сдвинутые ссылки: `detectGennady` `:566-587` → **`:572-591`**; детекция switch `:101-132` → **`:260-291`** (`WRITE_SWITCH_PATTERN` **`:260-261`**, `MUTATING_SWITCH_PATTERN` **`:279`**); `lintReachesGennady` `:176` → **`:199`** (на `:176` — экспортируемая `scriptReachesGennady`, которую использует и `repair-adapters.ts:61`); присвоение `level` `:532` → **`:519`**; `missingGates` `:533-556` → **`:520-560`**; `SCRIPT_ALIASES` `:29-31` → **`:30-32`**.
19. **§9.1, строка Capability adapter registry.** Комментарий «new platforms extend this value or inject another registry» — на **`:201`**, не `:70`; адаптеры на **`:75-190`**. (На `:68` — «Injectable adapter lookup; tests add a fake platform without changing production code», тоже уместная цитата.)
20. **§2.1/§9.1, `probe.ts`.** `CODE_EXT` **`:12`** (не `:11`); `CONFIG_FILES` **`:15-33`** (не `:15-35`).
21. **§2.3.** `SDD_RESEARCH_REF_BROKEN` **`:269`** (не `:257`).
22. **§9.1, `sdd-task.cmd.ts`.** Чтение `package.json` `.scripts` — **`:495-500`** (не `:491-499`).
23. **§8.1.** `OUTER_TEST_CONCURRENCY` **`:24`**; `assertTopology` **`:197`**; `coveragePartitions` **`:222`**.
24. **§2.3.** Перенести атрибуцию: `SDD_RULES_CASCADE_UNRESOLVED` → `shared/sdd/rules-cascade.ts:78`; `SDD_BDD_SCENARIO_UNTESTED`/`SDD_BDD_TESTFILE_AMBIGUOUS`/`SDD_BDD_DEFERRED_TO_SELF`/`SDD_BDD_COVERAGE_ROW_UNPARSED` → `shared/sdd/bdd-coverage.ts:270,223,257,291`; `SDD_CONSUMERS_UNRESOLVED` → `shared/sdd/consumers-resolvable.ts:84`. `sdd-check.cmd.ts` их только проводит (в §5.3 A2 уже атрибутирует `rules-cascade` верно — устранить противоречие внутри документа).
25. **§2.3.** `SDD_CHECK_READ_FAILED` → **`ERR_CLI_SDD_CHECK_READ_FAILED`** (`sdd-check.types.ts:19`); добавить пропущенный `SDD_DIAGRAM_INVALID` (`shared/sdd/mermaid-check.ts:32`) в перечисление кодов вне `check.ts`.
26. **§5.4.** Ссылки на тесты: `sync-core.test.ts` — «scans all files without subdir filter» ≈**`:98-107`**, «excludes entries from EXCLUDED_ENTRIES set» ≈**`:141-150`** (сдвиг 1 строка).

### Уточнения формулировок

27. **§1.2 и §9.1, `gennady.yaml`.** «only mention: `ai/flow-eval/docs/roundtrip-wall3-assessment.md`» → упоминаний **два**: тот док и `ai/flow-eval/scripts/roundtrip-readiness-shim.package.json`.
28. **§6.6, строка `swiftlint-toolchain-setup.md`.** «the only Swift artefact in the repo» → «единственный **выделенный** Swift-док; Swift также упоминается в `roundtrip-wall3-assessment.md`, `scripts/roundtrip-eval.sh`, `scripts/roundtrip-grade.sh`, `scripts/session-metrics.py`, `scripts/roundtrip-readiness-shim.package.json`».
29. **§8.2, строка `format`.** Полная команда: `prettier --check . --cache --cache-strategy content`.
30. **§3.1, столбец TC.** Добавить сноску: для `scaffold` (9) и `audit` (8) все `<ToolCall>` живут в step-пакетах, скелеты дают 0 — иначе число не воспроизводится по файлу директивы.
31. **§9.3, строка `ai/`.** В `main` `ai/directives` содержит также `dbc-audit.directive.xml`, `dev-review.directive.xml`, `perf-auditor/`, `semantic-change-extractor.directive.xml`.
32. **§10.2.** Добавить пропущенные области того же порядка: `test/agent-inbox` 23, `specs/cli` 20, `specs/agent-inbox` 19, `services/dbc` 19.

### Дополнить (MISSED)

33. **§8.1 — новый абзац о рассогласовании корней.** «`UNIT_ROOTS` (`test-topology.ts:38-45`) включает `'utils/'`, но `TEST_ROOTS` (`:19`) — только `['ai','cli','services','shared']`, а `discoverTests()` обходит исключительно `TEST_ROOTS`. Следствие: `utils/test/__tests__/{mock-http,git-fixture}.test.ts` (2 файла) никогда не обнаруживаются, а ветка `'utils/'` в `classifyTest` (`:193`) недостижима. Отдельно вся верхнеуровневая директория `test/` (23 файла `*.test.ts` под `test/agent-inbox/**`) вне `TEST_ROOTS` и, следовательно, вне гейта. Итого 25 тестовых файлов не в `npm test` по причине, не входящей ни в `V2_GATE_EXCLUDED_NAMES`, ни в четыре фильтра `discoverTests`.»
34. **§3.3 — зафиксировать фактическое состояние гейтов.** Оба скрипта запущены на `11291af5` из корня RC и зелёные: `check-directives-fresh.ts` → «✓ ai/directives/** matches a fresh rebuild», exit 0; `step-budget-gate.ts` → «✓ every lazy directive under ai/directives/sdd-v2/** is within budget», exit 0. То есть сгенерированное дерево свежее и в бюджете — сильный, но не заявленный факт (без него читатель не знает, применимы ли описанные семантики к текущему HEAD).
35. **§6.5 — зафиксировать фактический прогон.** `node --import tsx --test ai/flow-eval/__tests__/*.test.ts` → `# tests 84 / # pass 83 / # fail 1`. Единственный красный — `provisioner gives fixture scenarios unique isolated directories` (`harness.test.ts`), причина внешняя: `gennady dist is missing at <root>/dist; run npm run build first` (`provision.ts:1127`). Отметить, что именно этот класс исправлен коммитом `3d5f66a7`.
36. **§2 — добавить в индекс отсутствующий тест-файл.** В перечислении кросс-модульных инвариантных тестов рядом с `rc-recovery-invariants.test.ts`, `skeleton-format-differential.test.ts`, `check-spec-authoring-corpus.test.ts` не хватает `skeleton-heading-structure.test.ts`.
37. **§6.4/§9.2 — учесть `95329c19`.** Утверждение «нет `R-COMPLETE`» и «только два objective gate id» устарели на два коммита вперёд; см. § Изменения выше.
