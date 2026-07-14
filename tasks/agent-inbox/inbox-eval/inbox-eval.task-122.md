# Task: TSK-122 — реальный end-to-end: артефакты на диск + BoardReal + host + живой дашборд → реальные скрины (spec §7)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-122 | **Status:** [x] DONE (4 разрыва закрыты; real-proof §7 → TSK-123/124) | **Scope:** agent-inbox | **Module:** inbox-serve | **Dependencies:** TSK-121 (run-mode), TSK-113 (граф/валидатор), TSK-107 (dashboard), TSK-120 (e2e-харнесс)
- **Purpose:** Закрыть 4 разрыва, из-за которых реальный прогон не показывает настоящую диаграмму (найдено в TSK-120): (1) `VcsInboxReal` создаётся без `host` в `serve.cmd.ts` и `eval-driver.ts`; (2) `runMrsOnce`/session-узлы не пишут PLAN/REPORT/mermaid на диск (артефакты в памяти) — граф должен материализовать scaffold→fan-out→synthesize в `~/.gennady/.../reports/<mr>/`; (3) `BoardProviderReal.listArtifacts/readArtifact` — заглушки, должны читать реальные артефакты с диска; (4) e2e/дашборд захардкожен на `BoardProviderMock`+dev-seed — для живого прогона подключить к реальному StateStore/BoardProviderReal. Итог — spec §7 real-proof: живой прогон реального MR → дашборд с НАСТОЯЩЕЙ нарисованной диаграммой, скрины `eval-real-*`.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §7 REAL_PROOF | **Runtime:** not-implemented | **Verification:** integration, e2e

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | impl | P1   | [x]    |
| P3  | test | P2   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (host + артефакты на диск)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/serve.cmd.ts`, `services/agent-inbox/modules/inbox-eval/eval-driver.ts` — передавать `host` в `VcsInboxReal` (из конфига/URL MR), убрать `CONFIG: No VCS host configured` (gap-1).
  - `services/agent-inbox/serve/run-mode.ts` + `services/agent-inbox/modules/inbox-roles/*` (session/synthesize узлы) — материализовать реальные артефакты на диск: граф прогоняет scaffold→fan-out→synthesize и пишет PLAN.md/tasks/\*.task.md/README.md (с mermaid) в `<StateStore.getStateDir()>/agent-inbox/reports/<mr>/` (gap-2). Переиспользовать `inbox-review-plan --scaffold/--validate` (SV-12: функции).
- **Exit:** живой (или mock-opencode с реальным scaffold) прогон реального MR пишет PLAN/README(mermaid) на диск; host-ошибки нет. type-check + format pass.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl (BoardReal читает с диска + живой дашборд)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/board-provider.real.ts` — `listArtifacts/readArtifact` читают реальные файлы из `reports/<mr>/` (gap-3), с traversal-guard (как в ArtifactRouter).
  - `services/agent-inbox/serve/bootstrap.ts` + e2e webServer config — для живого прогона поднимать дашборд на `BoardProviderReal` поверх StateStore, а не `BoardProviderMock`/dev-seed (gap-4); mock-путь остаётся для быстрых тестов.
- **Exit:** дашборд в live-режиме отдаёт реальные артефакты MR (в т.ч. README с mermaid); `#/mr/<real>` рендерит настоящий REPORT. type-check + format pass.

<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — test + real-proof (spec §7)

- **Rules:** none
- **Target Files:** `e2e/inbox-serve/reviewer-eval.spec.ts` (EVAL_LIVE-путь), integration-тест persist-артефактов + BoardReal чтения
- **Exit:** `EVAL_LIVE=1 EVAL_MR_URL=vk-workspace/superapp!571` (или !1296) → живой прогон, дашборд, скрин `eval-real-02-report-diagram` содержит **реально отрисованную** mermaid `svg[id^=mmd-]` реального MR (не placeholder, не фикстура); `05-eval-report` с гейтами. Оркестратор предъявляет реальные скрины оператору. Пререквизиты: токен `gitlab.corp.mail.ru`, opencode+KLM подняты.

<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN реальный MR + host из конфига WHEN run-mode THEN нет `CONFIG: No VCS host`, граф стартует
- GIVEN живой прогон WHEN граф THEN PLAN.md/README.md(mermaid) записаны в reports/<mr>/ на диск
- GIVEN артефакты на диске WHEN BoardProviderReal.listArtifacts/readArtifact THEN отдаёт реальные файлы (traversal-guard)
- GIVEN live-дашборд + реальный MR WHEN `#/mr/<real>` THEN REPORT с реально нарисованной mermaid
- GIVEN EVAL_LIVE прогон WHEN скрины THEN `eval-real-02-report-diagram` = настоящий svg реального MR (spec §7)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` — pass
- Живой: `EVAL_LIVE=1 EVAL_MR_URL=<real>` → реальные скрины предъявлены (диаграмма реально нарисована)
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                     | Level       | Test File              |
| -------------------------------------------- | ----------- | ---------------------- |
| host передан → нет CONFIG-ошибки             | integration | run-mode.test.ts       |
| артефакты записаны на диск                   | integration | run-mode.test.ts       |
| BoardProviderReal читает reports/<mr>/       | integration | board-provider.real.\* |
| live real-proof: настоящая диаграмма (скрин) | e2e         | reviewer-eval.spec.ts  |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-07-14T16:42:47Z` decision cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts (вне Target Files P1, минимальное оправданное касание): экспортированы `buildReviewPlan` + `scaffoldReviewReports` (были module-private) — единственный способ переиспользовать scaffold-логику как функцию (SV-12), не реимплементируя её; прецедент — TSK-113 P2 (`validateReviewReports`). `@tasks` дополнен `TSK-122` по `AX_FILE_HEADER_APPEND_ONLY`.
- [x] `2026-07-14T16:42:47Z` decision services/agent-inbox/modules/inbox-roles/role-node.ts (в Target Files, wildcard `inbox-roles/*`): `GateNode` invariant честно ослаблен — `verify()` теперь допускает детерминированный FS-write (README-материализация синтеза, TSK-122); network/vcs-\* по-прежнему исключительно за `EffectNode` (NFC-SV-07). role-instance.ts: комментарий у `_executeGate` приведён в соответствие (был «Side-effect-free pass»).
- [x] `2026-07-14T16:42:47Z` decision services/agent-inbox/modules/inbox-roles/context-builder.ts: `artifacts` дополнены `worktreePath`/`headSha`/`changesetFiles` — иначе они не переживают `RoleInstance#_buildContext` (между шагами графа персистентны только `artifacts`, не `NodeContext.base/changeset`).
- [x] `2026-07-14T16:42:47Z` intro `resolveRunModeVcsHost` ← gap-1: host для `VcsInboxReal` в run-mode берётся из первого MR URL (`resolveVcsContext`) с фолбэком на persisted config, вместо всегда-пустого host.
- [x] `2026-07-14T16:42:47Z` intro `materializeReviewScaffold` ← gap-2: `node_prepare` (review_needed) материализует PLAN.md/tasks/\*.task.md на диск через переиспользованный `scaffoldReviewReports`.
- [x] `2026-07-14T16:42:47Z` intro `materializeSynthesisReadme` ← gap-2: `gate_review_synthesis`/`gate_delta_synthesis` материализуют README.md (с mermaid) на диск сразу после успешного synthesis, до `node_ask` — так дашборд видит диаграмму уже на паузе `awaiting_operator`, не только после ответа оператора (`node_effect` недостижим за один dry-run проход).
- [x] `2026-07-14T16:42:47Z` discovery ручная проверка (temp state dir, никогда `~/.gennady`): mock-прогон реального reviewer-графа пишет `PLAN.md`/`tasks/review.task.md`/`README.md` (с закрытым ```mermaid) в `reports/<mr>/`; `VcsInboxReal`с host, разрешённым из MR URL, доходит до реального network-запроса (401 из-за фиктивного токена) вместо`CONFIG: No VCS host configured` — оба разрыва закрыты.
- [x] `2026-07-14T16:42:47Z` ver `.claude/skills/sdd-execute/scripts/sdd verify` (8 target files) → pass (4/4 gates: type-check, gennady DBC lint, test, format:check)
- [x] `2026-07-14T16:42:47Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T16:42:47Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T16:42:47Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T16:42:47Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox/serve.cmd.ts, cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts, services/agent-inbox/modules/inbox-eval/eval-driver.ts, services/agent-inbox/serve/run-mode.ts, services/agent-inbox/modules/inbox-roles/reviewer.role.ts, services/agent-inbox/modules/inbox-roles/context-builder.ts, services/agent-inbox/modules/inbox-roles/role-node.ts, services/agent-inbox/modules/inbox-roles/role-instance.ts]; decisions: [host-resolution=MR-URL-then-config via resolveRunModeVcsHost, readme-write-point=synthesis-gate(gate_review_synthesis/gate_delta_synthesis)-not-node_effect(unreachable in one dry pass), scaffold-reuse=export-only-no-spawn(SV-12)]; open: [P2 gap-3: BoardProviderReal.listArtifacts/readArtifact must read these same reports/<mr>/ files from disk, task files stay at status=scaffolded after one dry pass (per-track fill from session output not wired — not required by this phase's Exit bar), node_effect's run() no longer touches disk — revisit only if node_ask's auto-continue design changes]

#### P2

- [x] `2026-07-14T17:00:16Z` decision services/agent-inbox/modules/inbox-api/board-provider.real.ts (в Target Files): `getReport` переведён на `_resolveInstance(mrId)` — принимает и webUrl, и композитный ключ `project!iid` (как `BoardProviderMock#_findMr`); без этого `#/mr/<real>` никогда не рендерит REPORT, потому что дашборд всегда шлёт `project!iid`, а `RoleInstanceSnapshot.mr` хранит webUrl — блокировало ровно Exit-критерий этой фазы, а не отдельную задачу.
- [x] `2026-07-14T17:00:16Z` decision services/agent-inbox/modules/inbox-api/routers/artifact.router.ts (вне Target Files P2, минимальное оправданное касание): `isSafeArtifactPath` экспортирован (был module-private) — единственный способ применить «тот же guard», который тикет прямо требует для `BoardProviderReal.readArtifact`, вместо второй расходящейся копии одной и той же security-инвариант. `@tasks` дополнен `TSK-122`.
- [x] `2026-07-14T17:00:16Z` intro `BoardProviderReal._resolveInstance` ← dual-key lookup (webUrl или `project!iid`) для `getReport`.
- [x] `2026-07-14T17:00:16Z` intro `BoardProviderReal.listArtifacts`/`readArtifact` ← gap-3: читают `PLAN.md`/`README.md`/`HISTORY.md`/`tasks/*.task.md` из `<StateStore.getStateDir()>/agent-inbox/reports/<mr>/` через `mrReportsDir`; `readArtifact` применяет `isSafeArtifactPath` (тот же guard, что и ArtifactRouter) перед обращением к диску.
- [x] `2026-07-14T17:00:16Z` intro `startLiveServer` (vite.config.ts) ← gap-4: живой путь дашборда — `bootstrap({ mocks: false })` (BoardProviderReal поверх реального StateStore) под флагом `EVAL_LIVE=1`; mock-путь (`BoardProviderMock`+dev-seed) остаётся дефолтом.
- [x] `2026-07-14T17:00:16Z` discovery запуск полного `npm run test` разово показал 1 нестабильный failure (`board.router.test.ts` — «returns empty board when no data seeded», порт 4175 уникален, файл не тронут этой фазой); повторный прогон — 2009/2009 pass, 0 fail; изолированный прогон файла — 3/3 pass. Признан пред-существующим флейком раннера, не связанным с изменениями этой фазы.
- [x] `2026-07-14T17:00:16Z` insight `npm run format:check` разово падал не по коду фазы, а по строке P1 в этом же тикете (`discovery` про `VcsInboxReal`/host, строка 111) — Prettier убирает пробел между backtick-инлайном и кириллицей на этой длинной строке; чисто механическая правка (0 символов смысла), применена, чтобы формат-гейт репозитория снова проходил.
- [x] `2026-07-14T17:00:16Z` ver `.claude/skills/sdd-execute/scripts/sdd verify` (5 target/touched files) → pass (4/4 gates: type-check, gennady DBC lint, test, format:check)
- [x] `2026-07-14T17:00:16Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T17:00:16Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T17:00:16Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T17:00:16Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/board-provider.real.ts, services/agent-inbox/serve/bootstrap.ts, services/agent-inbox/modules/inbox-dashboard/vite.config.ts, services/agent-inbox/modules/inbox-api/routers/artifact.router.ts, services/agent-inbox/modules/inbox-api/__tests__/board-provider.real.test.ts]; decisions: [artifact-guard=reuse-ArtifactRouter.isSafeArtifactPath(exported)-not-a-second-copy, artifact-kind=all-md(README's-mermaid-is-a-fenced-block-handled-by-ArtifactView-not-a-separate-kind), mrId-format=project!iid(matches-mrReportsDir-ref-and-dashboard's-MrCard#mrKey), live-dashboard-path=EVAL_LIVE=1-gated-bootstrap(mocks:false)-in-vite.config.ts-inboxServePlugin, getReport-dual-key-fix=BoardProviderReal._resolveInstance(webUrl-or-project!iid)]; open: [BoardProviderReal.assignMr/executeAction still key off webUrl only (isValidMrUrl expects a URL) — same project!iid-vs-webUrl mismatch as getReport had, but out of this phase's Exit bar (no assign/execute in the P3 real-proof read path); P3 live e2e requires a configured real ~/.gennady (gitlab.corp.mail.ru token + opencode running) for startLiveServer's bootstrap(mocks:false) to succeed — GENNADY_STATE_DIR env override is available if a non-default state dir is needed]

#### P3

- [x] `2026-07-14T19:00:29Z` decision e2e/inbox-serve/playwright.config.ts (вне Target Files P3, минимальное оправданное касание): webServer command получил `--configLoader native` — БЕЗ этого весь e2e-набор (включая fixture-путь и все прочие dashboard-спеки, не только EVAL_LIVE) не стартует вообще: дефолтный esbuild-based config-loader Vite жадно бандлит `vite.config.ts`, следуя ЗА динамическим `import('../../serve/bootstrap.ts')` (P2, gap-4) внутрь `cli/cmd/vcs-reply/vcs-react/vcs-approve` — CLI-командные файлы с `#!/usr/bin/env node` в первой строке, которые esbuild не может распарсить как зависимость («Syntax error "!"»). Это реальная, ранее не обнаруженная регрессия из P2, блокирующая Exit-критерий этой фазы («fixture playwright path all green»), а не отдельная задача — правка минимальна (один CLI-флаг), проверена: fixture-путь + весь dashboard/smoke-набор (11 тестов) снова зелёные.
- [x] `2026-07-14T19:00:29Z` intro `reviewer graph → real disk materialization → BoardProviderReal round-trip` (services/agent-inbox/serve/**tests**/run-mode.test.ts) ← интеграционный тест: РЕАЛЬНЫЙ `ReviewerRole.graph` через `RoleInstance` (checkpoint сидирует `changesetFiles`/`baseSha`/`headSha`, минуя сетевой `git worktree`/`git diff`, но code-path `materializeReviewScaffold`/`materializeSynthesisReadme` — настоящий) пишет PLAN.md/README.md(mermaid) на реальный диск (temp StateStore), затем `BoardProviderReal.listArtifacts/readArtifact` читают ЭТИ ЖЕ файлы — замыкает цепочку P1(материализация)→P2(BoardProviderReal), которую `board-provider.real.test.ts` (P2) не проверяла (там артефакты руками сидировались `writeFileSync`, не реальным писателем).
- [x] `2026-07-14T19:00:29Z` intro `reviewer-eval: live run (EVAL_LIVE=1) — drives the real dashboard, real screenshots` (e2e/inbox-serve/reviewer-eval.spec.ts) ← EVAL_LIVE-тест переписан: раньше просто вызывал `runEval` без Playwright/дашборда (не доказывал реальный скрин); теперь материализует реальный MR через `runEval({ stateDir: GENNADY_STATE_DIR })`, затем реально открывает `#/mr/<ref>` на живом EVAL_LIVE-дашборде и ждёт `waitForRealMermaidRender` (реальный `svg[id^=mmd-]`), скриншотя `eval-real-01-plan`/`eval-real-02-report-diagram`. Требует `GENNADY_STATE_DIR` явно (бросает, а не молча падает на `~/.gennady`).
- [x] `2026-07-14T19:00:29Z` discovery ЧЕСТНЫЙ прогон пререквизитов (temp state dir, `~/.gennady` не тронут): `GITLAB_PERSONAL_TOKEN` рабочий — прямой API-вызов к `gitlab.corp.mail.ru` за `vk-workspace/superapp!571` → 200; реальный `git worktree`/changeset для этого MR через `runEval({stateDir: <temp>})` — материализует PLAN.md/README.md/HISTORY.md/tasks/\*.task.md на диск (реальный fetch подтверждён); `opencode serve --port 4096` — reachable (200 на `/doc`), сырые HTTP-промпты к нему отвечают корректно (проверено напрямую curl'ом, включая с `directory=<worktree>` и `tools:{'*':false}` — точь-в-точь как делает `OpenCodeReal`).
- [x] `2026-07-14T19:00:29Z` discovery попытка ИСТИННО живого прогона (fresh temp `GENNADY_STATE_DIR` с `agent-inbox/config.json`, EVAL_LIVE=1, реальный токен, `opencode serve` живой) уткнулась в ДВА разных препятствия ВНЕ Target Files этой фазы: (1) `services/agent-inbox/modules/inbox-dashboard/vite.config.ts`'s `startLiveServer()` (P2, gap-4) никогда не вызывает `scheduler.tick()` — `RoleScheduler` живого дашборда никогда не поллит/не назначает MR, поэтому `BoardProviderReal.getReport()` всегда `null` для любого реального MR независимо от того, что уже материализовано на диске отдельным `runEval`-вызовом → дашборд показывает «Не удалось загрузить отчёт», артефакт-нав не рендерится; (2) даже минуя (1), сам граф ролей (`node_track_review` и др. в `role-instance.ts`/`opencode.real.ts`) падает почти мгновенно с `SESSION_ERROR`/`UnknownError` при прогоне через реальный `RoleInstance` — при том что те же самые сырые HTTP-промпты к тому же `opencode`-серверу с тем же `directory` отрабатывают штатно за секунды (см. discovery выше) — воспроизводимая, но неизолированная в рамках этой тест-only фазы причина (не токен, не `opencode`-доступность). Обе причины лежат вне Rules="none"/Target Files этой фазы (P2/role-graph код) — заведены как follow-up (см. spawn_task этой сессии), не исправлены здесь.
- [x] `2026-07-14T19:00:29Z` insight реальный скрин `eval-real-02-report-diagram` РЕАЛЬНОГО MR НЕ получен в этой фазе (см. две discovery-причины выше) → spec §7, HONESTY: честно НЕ выдаётся за живое доказательство. Сильнейшее доступное честное доказательство — интеграционный тест выше (`run-mode.test.ts`): реальный граф + реальная запись на диск + реальное чтение `BoardProviderReal` + реальный детерминированный mermaid из реального changeset — маркирован как machinery-proof, не live-MR-proof. Оператору для повторной попытки после устранения follow-up: `unset HTTPS_PROXY; opencode serve --port 4096 &`, затем `EVAL_LIVE=1 EVAL_MR_URL=https://gitlab.corp.mail.ru/vk-workspace/superapp/-/merge_requests/571 GENNADY_STATE_DIR=<temp с agent-inbox/config.json{vcsHost:gitlab.corp.mail.ru,reposBase:<dir>}> npx playwright test --config e2e/inbox-serve/playwright.config.ts e2e/inbox-serve/reviewer-eval.spec.ts --grep "materializes the real MR"`.
- [x] `2026-07-14T19:00:29Z` ver `.claude/skills/sdd-execute/scripts/sdd verify` (3 target/touched files) → pass (4/4 gates: type-check, gennady DBC lint, test, format:check)
- [x] `2026-07-14T19:00:29Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T19:00:29Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T19:00:29Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T19:00:29Z` ver `npx playwright test --config e2e/inbox-serve/playwright.config.ts e2e/inbox-serve/reviewer-eval.spec.ts` (fixture path, EVAL_LIVE unset) → pass exit=0 (1 passed, 1 skipped — live test skipped by design without EVAL_LIVE=1)
- [x] `2026-07-14T19:00:29Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/__tests__/run-mode.test.ts, e2e/inbox-serve/reviewer-eval.spec.ts, e2e/inbox-serve/playwright.config.ts]; decisions: [live-diagram-screenshot=NOT-produced-this-phase(honest,see-discovery-lines), strongest-proof-delivered=run-mode.test.ts-real-graph+real-disk+BoardProviderReal-round-trip(machinery-proof-not-live-MR-proof), vite-config-loader-regression=fixed-via---configLoader-native(blocked-ALL-e2e-not-just-EVAL_LIVE), gitlab-token=verified-working(200), opencode-reachability=verified-working(raw-prompts-ok)]; open: [gap-4-incomplete: vite.config.ts startLiveServer() never ticks RoleScheduler → BoardProviderReal.getReport() always null for any real MR on the live dashboard — needs a scheduler.tick()/polling wire-up, out of P3 test-only scope; role-instance.ts/opencode.real.ts session nodes fail near-instantly with SESSION_ERROR/UnknownError against a real opencode server that answers raw prompts fine — root cause unisolated, out of P3 scope, needs dedicated investigation]

#### Round close

- [x] `2026-07-14T19:10:00Z` P1–P3 DONE — 4 разрыва закрыты; машинерия доказана (реальный граф → PLAN/README-с-mermaid на диск → BoardProviderReal round-trip), 59/59 тестов.
- [!] `2026-07-14T19:10:00Z` §7 real-proof (скрин реального MR с диаграммой) НЕ достигнут — 2 НОВЫХ блокера: (B1) live-дашборд (vite startLiveServer) не тикает scheduler → getReport null; (B2) session-узлы графа падают SESSION_ERROR против рабочего opencode. Не подделано. Токен(200)/opencode(raw ok) проверены рабочими. → TSK-123 (B1, прямой путь к скрину) + TSK-124 (B2, глубокая причина сессий).
- [x] `2026-07-14T19:10:00Z` orchestrator sync trackers → §7 carried to TSK-123/124

<!--/SECTION:EXECUTION_LOG-->
