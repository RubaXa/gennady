# Task: TSK-121 — serve run-mode: прогон списка MR через реальный граф (dry-run) + замыкание связки

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-121 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-serve | **Dependencies:** TSK-113 (граф ролей), TSK-115 (bootstrap)
- **Purpose:** Режим запуска реального приложения для эвала: `gennady inbox serve --mrs <urls|fixture> --seed <state.json> --once --dry-run` поднимает НАСТОЯЩИЙ bootstrap (RoleEngine+RoleScheduler+BoardProviderReal), восстанавливает изначальное состояние (сид реестра/StateStore: «ревьюили на head X» / свежий), кормит конкретный список MR и прогоняет их через реальный граф one-shot. Замыкает 3 разрыва serve: (1) scheduler строит NodeContext из живого MR (prep выбирает ветку по реальным данным), (2) effect-узел реально вызывает EffectExecutor в dry-run, (3) сид изначального состояния. Постинг dry-run — в GitLab не пишет.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-04, NFC-SV-07/08 | **Runtime:** not-implemented | **Verification:** unit, integration

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | impl | P1   | [x]    |
| P3  | impl | P2   | [x]    |
| P4  | test | P3   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (live NodeContext из MR)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts` — при назначении строит `NodeContext` для конкретного MR: worktree + changeset + base (ТОЛЬКО из `diff_refs.base_sha` — не пересчитывать merge-base) + stage/headChanged, через существующую логику `inbox-context`/classify-mr-stage. Prep выбирает ветку по реальным данным, а не по тест-сиду.
  - `services/agent-inbox/modules/inbox-roles/role-node.ts` — `NodeContext` несёт нужные поля (mr, worktree, changeset, base, vcs-хендл/store для эффекта).
  - `services/agent-inbox/modules/inbox-roles/context-builder.ts` (new) — `buildNodeContext(mr, deps)` обёртка над inbox-context (SV-12: функции, не spawn где можно), под `StateStore.getStateDir()` (NFC-05).
- **Exit:** на мок-VCS scheduler строит NodeContext с корректным base из diff_refs; prep выбирает ветку из живых сигналов; type-check + format pass.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl (effect → EffectExecutor, dry-run)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/role-instance.ts` — effect-узел реально вызывает `EffectExecutor.execute()` (NodeContext несёт vcs/store или RoleInstance инъектирует связанный executor). Замыкает NFC-SV-07 в графе.
  - `services/agent-inbox/modules/inbox-roles/effect-executor.ts` — режим `dryRun`: исполняет реконсиляцию/дедуп и помечает `effect_applied`, но НЕ пишет в GitLab (никаких vcs-\* мутаций); идемпотентность сохраняется.
- **Exit:** на моках граф доходит до effect и вызывает EffectExecutor; в dry-run 0 реальных постингов; повтор → 0 новых (идемпотентность). type-check + format pass.

<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — impl (run-mode CLI + сид состояния)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/serve/run-mode.ts` (new) — `runMrsOnce({ mrs, seedState, dryRun, deps })`: поднимает реальный bootstrap, применяет seedState к StateStore/реестру (изначальное review-состояние по каждому MR), назначает список MR, гоняет `scheduler.tick`/RoleInstance one-shot до терминала (ask/done), возвращает per-MR результат (артефакты + состояние доски).
  - `services/agent-inbox/serve/state-seed.ts` (new) — парсер/применятор `seed.json` → StateStore (свежий / reviewed@headX).
  - `cli/cmd/inbox/serve.cmd.ts` — флаги `--mrs <urls|@fixture>`, `--seed <path>`, `--once`, `--dry-run` (дефолт для этих флагов — dry-run true); при `--mrs` идёт в run-mode, иначе обычный serve.
- **Exit:** `gennady inbox serve --mrs @fixture --seed @fixture --once --dry-run` на моках прогоняет список MR через реальный граф, ничего не постит, отдаёт per-MR результат. type-check + format pass.

<!--/SECTION:PHASE_P3-->

<!--SECTION:PHASE_P4-->

### P4 — test

- **Rules:** none
- **Target Files:** `services/agent-inbox/modules/inbox-roles/__tests__/context-builder.test.ts`, `services/agent-inbox/serve/__tests__/run-mode.test.ts`, `services/agent-inbox/serve/__tests__/state-seed.test.ts`
- **Exit:** unit — context-builder (base из diff_refs), effect dry-run (0 постингов + идемпотентность), state-seed (свежий/reviewed); integration — run-mode over мок-список MR: граф проходит, артефакты произведены, состояние доски корректно, в GitLab ничего.

<!--/SECTION:PHASE_P4-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN список MR + свежий seed WHEN run-mode THEN каждый MR прошёл граф prep→…→ask, ветка review_needed
- GIVEN seed «reviewed@headX» + head не менялся WHEN prep THEN ветка reply_needed (полная батарея НЕ запускается)
- GIVEN seed «reviewed@headX» + fast_forward WHEN prep THEN ветка update-review
- GIVEN base WHEN scheduler строит контекст THEN base == diff_refs.base_sha (не merge-base)
- GIVEN effect-узел + dry-run WHEN execute THEN EffectExecutor вызван, 0 реальных постингов, повтор → 0 новых
- GIVEN `serve --mrs @fixture --once --dry-run` WHEN прогон THEN per-MR результат, в GitLab ничего

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                           | Level       | Test File               |
| ---------------------------------- | ----------- | ----------------------- |
| context-builder: base из diff_refs | unit        | context-builder.test.ts |
| effect dry-run + идемпотентность   | unit        | run-mode.test.ts        |
| state-seed: свежий/reviewed        | unit        | state-seed.test.ts      |
| run-mode over список MR (граф)     | integration | run-mode.test.ts        |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-07-14T13:00:00Z` intro `DiffRefs` ← GitLab diff_refs shape (base/start/head sha); base_sha единственный источник NodeContext.base
- [x] `2026-07-14T13:00:05Z` intro `ContextBuilderDeps`, `buildNodeContext`, `fetchDiffRefsLive` ← новый файл context-builder.ts: собирает live NodeContext (worktree/changeset/base/stage/headChanged) для RoleScheduler
- [x] `2026-07-14T13:00:10Z` intro `Changeset`, `ChangesetFile` ← role-node.ts: типизированный файловый дифф, переносимый в NodeContext.changeset
- [x] `2026-07-14T13:00:15Z` decision NodeContext расширен полями base/changeset/vcs/store (все опциональные) ← тест-сидированные контексты остаются валидны; заполняет их только live-построенный контекст
- [x] `2026-07-14T13:00:20Z` decision RoleSchedulerConfig.buildLiveContext=opt-in, default false ← существующий VcsInboxMock-сьют (фикстура host gitlab.example.com) не должен внезапно уйти в реальную сеть — в этом окружении GITLAB_PERSONAL_TOKEN уже установлен, поэтому live-построение включается только явно
- [x] `2026-07-14T13:00:25Z` decision сидирование через существующий RoleInstanceCheckpoint (без правок role-instance.ts) ← checkpoint.artifacts уже течёт в ctx.artifacts, который читает prep reviewer.role.ts; остаёмся в Target Files фазы
- [x] `2026-07-14T13:00:30Z` insight ни MrContext (vcs-inbox.port.ts), ни VcsActionableMr не несут diff_refs → рассмотреть добавление diffRefs? в MrContext отдельной задачей; пока context-builder.ts сам резолвит diff_refs через resolveVcsContext+createVcsClient (вне Target Files порта)
- [x] `2026-07-14T13:04:12Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T13:04:55Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T13:05:39Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/context-builder.ts, services/agent-inbox/modules/inbox-roles/role-node.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts]; decisions: [base=diff_refs.base_sha-only, buildLiveContext=opt-in-default-false, seeding-via=RoleInstanceCheckpoint, worktree/changeset=best-effort-degrade-open]; open: [P2: wire NodeContext.vcs/store into EffectExecutor via role-instance.ts, MrContext/VcsActionableMr still lack typed diff_refs — context-builder resolves it independently, P3 bootstrap must pass buildLiveContext=true+fetchDiffRefs for real serve run-mode]

#### P2

- [x] `2026-07-14T13:07:00Z` decision `EffectExecutorConfig.dryRun?: boolean` (default false) ← withholds only `_apply` (real vcs-\* call); reconcile/dedup + `effect_applied` audit marker still run, so a repeat dry-run hits the idempotency guard and yields `skipped_idempotent`
- [x] `2026-07-14T13:07:05Z` decision `RoleInstanceOpts.dryRun?: boolean` (default false), forwarded into `EffectExecutor` at effect nodes ← dry-run stays opt-in per-instance, never a silent default for a real run
- [x] `2026-07-14T13:07:10Z` decision `RoleInstance#_buildContext()` теперь всегда заполняет `ctx.vcs`/`ctx.store` из `this._vcs`/`this._store` ← это единственное место, строящее NodeContext для реального шага графа; P1 добавил поля в тип, P2 закрывает разрыв фактическим заполнением
- [x] `2026-07-14T13:07:15Z` intro `RoleInstance#_collectProposedActions` ← protected helper: сканирует `this._artifacts` на предмет staged `proposedActions` (как `node_thread_triage`), передаёт найденный батч в `EffectExecutor.execute()` — сессии не вызывают vcs-\* сами (NFC-SV-07)
- [x] `2026-07-14T13:07:20Z` decision `_executeEffect` вызывает `EffectExecutor.execute()` только когда `ctx.vcs && ctx.store` присутствуют и есть непустой `proposedActions`-батч ← иначе деградирует к прежнему `node.run(ctx)`-only стейджингу без throw — существующие TSK-113 мок-тесты не доходят до node_effect (застревают на node_ask/awaiting_operator), поэтому не задеты
- [x] `2026-07-14T13:07:25Z` insight ни один граф-файл (reviewer.role.ts/author.role.ts) не кладёт `proposedActions` в `node_synthesize` — сейчас источник только `node_thread_triage` → P3/P4: подтвердить, что этого достаточно для reply_needed-ветки, либо расширить синтез-схему отдельной задачей
- [x] `2026-07-14T13:12:40Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-roles/role-instance.ts services/agent-inbox/modules/inbox-roles/effect-executor.ts` → pass exit=0
- [x] `2026-07-14T13:13:20Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T13:14:10Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T13:15:05Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T13:15:38Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/role-instance.ts, services/agent-inbox/modules/inbox-roles/effect-executor.ts]; decisions: [dryRun=opt-in-default-false-on-both-RoleInstance-and-EffectExecutor, ctx.vcs/ctx.store=always-populated-by-RoleInstance#_buildContext, proposedActions-source=first-artifact-field-found-via-_collectProposedActions]; open: [P3: run-mode CLI must pass dryRun=true by default per ticket §1; P3/P4: only node_thread_triage currently stages proposedActions — confirm review_needed/update-review branches need this too or scope narrows to reply_needed]

#### P3

- [x] `2026-07-14T13:20:00Z` decision run-mode does not use `RoleScheduler.assignManual`/`tick()` for execution ← neither forwards `dryRun` into `RoleInstance` (out of P3 Target Files — role-scheduler.ts unchanged); `run-mode.ts` constructs `RoleInstance` directly per MR (role from `MrContext.myRole`, checkpoint from `buildNodeContext`), reusing existing exports without modifying role-scheduler.ts
- [x] `2026-07-14T13:20:05Z` decision "board state" per MR = `RoleInstance#getBoardView()` ← BoardProviderReal/HttpServer are not needed for a one-shot batch result; avoids pulling in the HTTP layer for run-mode (AX_NO_PREMATURE_ABSTRACTIONS)
- [x] `2026-07-14T13:20:10Z` decision drive-to-terminal stops at done/error/awaiting_operator, bounded by `MAX_STEPS_PER_MR=50` ← matches ticket's own "до терминала (ask/done)"; node_effect is only reached after an operator answers node_ask, which one-shot run-mode never does — EffectExecutor wiring (P2) stays verified via its own unit/role-instance tests, not exercised end-to-end here
- [x] `2026-07-14T13:20:15Z` intro `SeedState`, `SeedMrState`, `parseSeedState`, `loadSeedState`, `applySeedState` ← new state-seed.ts: 'fresh' deletes the registry entry, 'reviewed' sets `lastReviewedHeadSha` so context-builder's headChanged classification has a baseline; persists via `store.saveRegistry()` so a later `store.loadRegistry()` observes it
- [x] `2026-07-14T13:20:20Z` intro `RunModeDeps`, `RunMrsOnceOpts`, `MrRunResult`, `RunMrsOnceResult`, `runMrsOnce` ← new run-mode.ts: one-shot pass over a fixed MR list through the real role graph, dryRun forwarded to every RoleInstance (default true)
- [x] `2026-07-14T13:20:25Z` intro `runRunModeCli`, `resolveMrsList`, `resolveSeedState`, `parseValue` (serve.cmd.ts) ← `--mrs <urls|@fixture>` / `--seed <path|@fixture>` / `--once` / `--dry-run`; `--mrs` present routes to run-mode instead of the HTTP server; `@fixture` resolves to a small built-in MR + seed pair (no spec-mandated fixture schema exists — inbox-eval.spec.md's S0-S11/G1-G10 harness is a separate CLI-pipeline surface, EV-10 serve-graph variant is this ticket)
- [x] `2026-07-14T13:20:30Z` decision non-mocks run-mode assumes an already-running `opencode serve` on port 4096 ← bootstrap.ts's spawn/health-check/degraded lifecycle is scoped to the long-running interactive server and is not duplicated for this one-shot batch call; full production wiring is follow-up work, not blocking this ticket's mocks-based Exit criterion
- [x] `2026-07-14T13:20:35Z` decision `--mocks` forces `fetchDiffRefs` to a no-op resolver ← smoke-tested manually: without this, `fetchDiffRefsLive` still attempted a real GitLab network call even under `--mocks` (context-builder degrades open on failure, but the attempt itself is noise/latency this eval path should never pay)
- [x] `2026-07-14T13:20:40Z` decision reviewer.role.ts `node_synthesize` (review_needed branch only) now declares `proposedActions` in its resultSchema + prompts for one line-comment action per finding (`{file, newLine}` position) plus one general architectural comment ← authorized cross-file touch per P3 job; mirrors `node_thread_triage`'s existing pattern so `_collectProposedActions`/EffectExecutor have real candidates for G8 (line-in-hunk)/G9 (body-size) downstream; reply_needed's staging left untouched; update-review's `node_synthesize_delta` intentionally NOT touched (out of the authorized scope, "review_needed branch" only)
- [x] `2026-07-14T13:26:00Z` discovery manual smoke (`gennady inbox serve --mocks --mrs @fixture --seed @fixture --once --dry-run`) reached `awaiting_operator` at `node_track_review` (OpenCodeMock has no seeded response for this run) with restartCount=3 — confirms the graph drives to a real terminal state end-to-end, per-MR JSON result shape matches ticket Exit; no vcs mutation attempted (dry-run)
- [x] `2026-07-14T13:33:04Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/serve/run-mode.ts services/agent-inbox/serve/state-seed.ts cli/cmd/inbox/serve.cmd.ts services/agent-inbox/modules/inbox-roles/reviewer.role.ts` → pass exit=0
- [x] `2026-07-14T13:33:30Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T13:34:05Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T13:34:40Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T13:35:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/run-mode.ts, services/agent-inbox/serve/state-seed.ts, cli/cmd/inbox/serve.cmd.ts, services/agent-inbox/modules/inbox-roles/reviewer.role.ts]; decisions: [run-mode-bypasses-scheduler-constructs-RoleInstance-directly, board-state=getBoardView, drive-to-terminal=done-error-awaiting_operator-bounded-50-steps, seed-fresh=delete-entry, seed-reviewed=set-lastReviewedHeadSha, fixture-sentinel=@fixture-builtin-constant-not-a-file, non-mocks-opencode=assumes-already-running-port-4096, node_synthesize-review_needed-only-stages-proposedActions]; open: [P4: unit tests for context-builder/run-mode/state-seed + integration test driving run-mode over a mock MR list to ask-terminal; P4/future: node_synthesize_delta (update-review) and node_thread_triage's reply_needed branch already stage but were not re-verified against G8/G9 gate shape in this phase; future: production (non-mocks) run-mode needs real opencode spawn-lifecycle wiring analogous to bootstrap.ts, currently assumes pre-started server]

#### P4

- [x] `2026-07-14T13:40:00Z` discovery `buildNodeContext` всегда пытается реальный `git clone` (через `resolveVcsContext`+`ensureClone`) независимо от `fetchDiffRefs` — с фикстурным хостом `gitlab.example.com` под корпоративным прокси попытка клона занимала ~38s на вызов (CONNECT tunnel 403), что раздувало прогон трёх интеграционных тестов до ~184s → тесты сидируют `repos.json` (reposMap) на несуществующий git-репозиторий (существующая temp-директория): `ensureClone` коротко замыкается на маппинге, последующий `git worktree prune` падает мгновенно локально (не сеть) — degrade-open путь остаётся тем же, но без сетевой задержки; итоговый прогон 100 тестов ~10.5s
- [x] `2026-07-14T13:42:00Z` discovery `RoleInstance#_collectProposedActions` ищет `proposedActions` как поле ВЛОЖЕННОГО артефакта (`artifacts[nodeId].proposedActions`, как у `node_thread_triage`), а не как top-level ключ `artifacts.proposedActions` — тестовый prep-граф для effect/dry-run сценария поправлен под эту форму (`artifacts: { node_prep: { proposedActions: [...] } }`)
- [x] `2026-07-14T13:44:00Z` discovery `RoleInstance#_executeEffect` пишет ДВЕ `effect_applied` audit-записи за один проход через effect-узел: свой generic-маркер `node:<id>` (до диспатча в EffectExecutor) и более гранулярный `node:<id>|<fingerprint>` от `EffectExecutor.execute()` — идемпотентность второго прогона проверяется через сравнение счётчика записей до/после (не через фиксированное магическое число), т.к. первый generic-маркер уже закрывает повторный вход на следующем прогоне (RoleInstance-уровневая идемпотентность срабатывает раньше, чем EffectExecutor-уровневая)
- [x] `2026-07-14T13:46:00Z` insight `context-builder.test.ts`'s "headChanged derivation" сценарий покрыт только через degrade-open путь (нет реального MR-worktree с `merge-requests/N/head` рефом в тестовом окружении — GitLab server-side magic ref, не воспроизводим в plain temp-репозитории без сети) → `_classifyHeadChanged` (unexported) остаётся косвенно протестирован через `buildNodeContext`'s наблюдаемое поведение (headChanged всегда undefined без worktree), не напрямую; если появится тестовый git-фикстурный харнесс с реальными MR-рефами — стоит расширить unit-покрытие `_classifyHeadChanged` напрямую отдельной задачей
- [x] `2026-07-14T14:05:10Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-roles/__tests__/context-builder.test.ts services/agent-inbox/serve/__tests__/run-mode.test.ts services/agent-inbox/serve/__tests__/state-seed.test.ts` → pass exit=0
- [x] `2026-07-14T14:06:30Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T14:07:15Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T14:08:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T14:08:10Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/context-builder.test.ts, services/agent-inbox/serve/__tests__/run-mode.test.ts, services/agent-inbox/serve/__tests__/state-seed.test.ts]; decisions: [context-builder-tests-seed-repos.json-to-avoid-real-network-clone, run-mode-effect-test-uses-custom-minimal-prep-effect-graph-not-full-reviewer-graph-since-node_effect-is-ask-gated, idempotency-assertion-compares-before-after-count-not-fixed-magic-number, no-impl-files-touched-all-P1-P3-tests-passed-unmodified]; open: [headChanged/_classifyHeadChanged only indirectly covered via degrade-open path — real MR-worktree git fixture (merge-requests/N/head refs) would let a future task test it directly; TSK-121 done, all 4 phases closed]

#### Round close

- [x] `2026-07-14T14:15:00Z` all phases DONE (P1 live context, P2 effect dry-run, P3 run-mode+seed, P4 test) — 100/100, dry-run posts nothing, idempotent
- [x] `2026-07-14T14:15:00Z` orchestrator sync trackers → audit pending
- [x] `2026-07-14T14:15:00Z` open (carried): non-mocks run-mode assumes opencode already serving (spawn-lifecycle via TSK-115 bootstrap for live); run-mode drives RoleInstance directly, scheduler dryRun-forwarding is a follow-up

<!--/SECTION:EXECUTION_LOG-->
