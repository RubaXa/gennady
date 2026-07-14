# Task: TSK-120 — inbox-eval: e2e РЕАЛЬНОГО прогона + скрины с настоящей диаграммой/планом/артефактами

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-120 | **Status:** [x] DONE (харнесс; real-proof §7 → TSK-122) | **Scope:** agent-inbox | **Module:** inbox-eval | **Dependencies:** TSK-119 (драйвер), TSK-121 (run-mode), TSK-107 (dashboard + shot-хелпер)
- **Purpose:** Доказать флоу глазами ревьювера НА РЕАЛЬНОМ MR. Playwright гоняет `runEval` через реальный run-mode (TSK-121) на живом MR (`EVAL_MR_URL`, дефолт `vk-workspace/superapp!571` / `calendar/board!1296`), событийно ждёт стадий и снимает дашборд, где на скринах — **настоящий PLAN, настоящие артефакты дорожек, настоящий REPORT с НАРИСОВАННОЙ mermaid-диаграммой** (реальный `<svg>`, а не текст «отрисовка…»), настоящая панель предложенных действий, и финальный `eval-report` (PASS + гейты). Моковый e2e (TSK-108) остаётся как быстрый UI-чек; этот тикет добавляет **реальный** слой.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §5, §6, §7 (реальные скрины) | **Runtime:** not-implemented | **Verification:** e2e

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (real-flow e2e + real screenshots)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `e2e/inbox-serve/reviewer-eval.spec.ts` — прогоняет `runEval` (TSK-119) на РЕАЛЬНОМ MR из `EVAL_MR_URL` (дефолт-фикстура URL) с seed=fresh, dry-run; поднимает дашборд на произведённых реальных артефактах; событийно ждёт стадий (context→scaffold→enriched→filled→report→actions) и на каждой значимой снимает `shot(page, 'eval-real-NN-<stage>')`. Обязательные кадры: `01-plan` (реальный PLAN.md), `02-report-diagram` (REPORT.md с **реально отрисованной** mermaid `<svg id^=mmd->`), `03-track` (артефакт дорожки), `04-actionpanel` (предложенные действия/кандидаты), `05-eval-report` (PASS + таблица гейтов).
  - `e2e/inbox-serve/helpers/wait-render.ts` (new) — ждёт РЕАЛЬНУЮ отрисовку mermaid: `svg[id^="mmd-"]` visible И непустой (есть узлы/рёбра), НЕ label «отрисовка…»/«raw source»; генеровый таймаут (реальная диаграмма больше моковой).
  - `e2e/inbox-serve/fixtures/eval-fixture.ts` — фикстура-фолбэк для быстрого CI (записанные реальные артефакты одного прогона), но acceptance требует хотя бы один **живой** прогон.
- **Exit:**
  1. `EVAL_LIVE=1 EVAL_MR_URL=<real> npx playwright test reviewer-eval.spec.ts` даёт скрины `eval-real-*` в `test-results/screenshots/`, где `02-report-diagram` содержит **настоящую отрисованную** диаграмму (не «отрисовка…»/не raw-source), а PLAN/дорожки/actions — реальный контент MR.
  2. Скрин `05-eval-report` показывает `status` и гейты G1–G10.
  3. Без `EVAL_LIVE` спек идёт по фикстуре (воспроизводимо, зелёно).
  4. Оркестратор фактически выполняет живой прогон и предъявляет реальные скрины оператору.
  - Пререквизиты живого прогона (у оператора есть): токен `gitlab.corp.mail.ru`, opencode+KLM подняты (для реальной сессии).

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN EVAL_LIVE + реальный MR WHEN прогон THEN скрин `02-report-diagram` содержит отрисованный `svg[id^=mmd-]` с узлами (не «отрисовка…», не raw-source)
- GIVEN реальный прогон WHEN скрины THEN `01-plan`/`03-track`/`04-actionpanel` показывают настоящий контент этого MR
- GIVEN финал WHEN `05-eval-report` THEN виден status + гейты G1–G10
- GIVEN нет EVAL_LIVE WHEN прогон THEN идёт по фикстуре, зелено и воспроизводимо
- GIVEN mermaid ещё «отрисовка…» WHEN wait-render THEN ждёт до настоящего svg, не снимает placeholder

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npx playwright test --config=e2e/inbox-serve/playwright.config.ts reviewer-eval.spec.ts` — pass (фикстура)
- Живой прогон: `EVAL_LIVE=1 EVAL_MR_URL=<real>` → реальные скрины `eval-real-*` предъявлены (диаграмма реально нарисована)
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                        | Level | Test File             |
| ----------------------------------------------- | ----- | --------------------- |
| Реальный прогон + скрины (диаграмма нарисована) | e2e   | reviewer-eval.spec.ts |
| Фикстура-фолбэк (воспроизводимо)                | e2e   | reviewer-eval.spec.ts |
| wait-render: не снимать «отрисовка…»            | e2e   | reviewer-eval.spec.ts |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-07-14T15:40:14Z` intro `waitForRealMermaidRender` ← real-diagram wait helper (e2e/inbox-serve/helpers/wait-render.ts), Target File of this phase
- [x] `2026-07-14T15:40:14Z` intro `EVAL_FIXTURE_MR_URL, evalFixtureBoardData, evalFixtureMrDetail, evalFixtureArtifactRefs, evalFixtureArtifactContents` ← fixture module (e2e/inbox-serve/fixtures/eval-fixture.ts) for the fast/CI fallback path, Target File of this phase
- [x] `2026-07-14T15:40:14Z` tried live run via CLI: `unset HTTPS_PROXY && gennady inbox serve --mrs https://gitlab.corp.mail.ru/vk-workspace/superapp/-/merge_requests/571 --once --dry-run` → immediate CONFIG error `No VCS host configured. Pass host to constructor.` (opencode serve on :4096 also not running — never reached that far)
- [x] `2026-07-14T15:40:14Z` discovery `runRunModeCli` (cli/cmd/inbox/serve.cmd.ts) and `_resolveRunModeDeps` (services/agent-inbox/modules/inbox-eval/eval-driver.ts) both construct `new VcsInboxReal({ token: process.env.GITLAB_PERSONAL_TOKEN })` without `host` — every real-MR call fails fast at `VcsInboxReal#getMrContext`, before opencode is ever reached
- [x] `2026-07-14T15:40:14Z` discovery `runMrsOnce` (services/agent-inbox/serve/run-mode.ts) keeps `RoleArtifacts` in-memory on the RoleInstance checkpoint only — no PLAN.md/REPORT.md/mermaid is ever written to disk under `reports/<mr>/`
- [x] `2026-07-14T15:40:14Z` discovery `BoardProviderReal.listArtifacts`/`.readArtifact` (services/agent-inbox/modules/inbox-api/board-provider.port.ts default; board-provider.real.ts does not override) return `[]`/`null` unconditionally — the production HTTP path has no real artifact-browsing backing yet (pre-TSK-113 stub)
- [x] `2026-07-14T15:40:14Z` discovery the e2e/dev dashboard (`services/agent-inbox/modules/inbox-dashboard/vite.config.ts`'s `inboxServePlugin`) is hardcoded to `BoardProviderMock` + `dev-seed.ts` — it never reads any `StateStore` a live `runMrsOnce` pass writes to, so a live pass would not appear at `http://localhost:5174` even if the two gaps above were fixed
- [x] `2026-07-14T15:40:14Z` insight three structural gaps above make spec §7's real-diagram screenshot unattainable from this phase's Target Files alone (none of the three files are in scope: cli/cmd/inbox/serve.cmd.ts, eval-driver.ts, board-provider.real.ts, vite.config.ts) → spec §7/Surface, follow-up ticket needed to (a) pass `host` into both `VcsInboxReal` constructions, (b) write real-graph artifacts to `reports/<mr>/` on disk, (c) implement `BoardProviderReal.listArtifacts/readArtifact`, (d) wire the dashboard to a live `StateStore` — only then can `EVAL_LIVE=1` produce a real `02-report-diagram` screenshot
- [x] `2026-07-14T15:40:14Z` decision live-run test (`reviewer-eval.spec.ts`, EVAL_LIVE describe block) asserts only the honest floor reachable today — that `runEval` drove the real graph end-to-end and returned a real (FAIL) report — and explicitly does not attempt a dashboard screenshot, per spec §7 Инвариант R-01 (никогда не снимать placeholder/raw-source как «нарисовано»)
- [x] `2026-07-14T15:40:14Z` tried `EVAL_LIVE=1 EVAL_MR_URL=https://gitlab.corp.mail.ru/vk-workspace/superapp/-/merge_requests/571 npx playwright test reviewer-eval.spec.ts` → live test passed on the honest assertion; observed `status=FAIL`, `stages=[{stage:S0,done:false,detail:"...state=error"}]`, confirming the CONFIG-error discovery above end-to-end through the officially supported `runEval` API (not just the raw CLI)
- [x] `2026-07-14T15:40:14Z` ver `.claude/skills/sdd-execute/scripts/sdd verify e2e/inbox-serve/reviewer-eval.spec.ts e2e/inbox-serve/helpers/wait-render.ts e2e/inbox-serve/fixtures/eval-fixture.ts` → pass exit=0
- [x] `2026-07-14T15:40:14Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T15:40:14Z` ver `npx playwright test --config=e2e/inbox-serve/playwright.config.ts reviewer-eval.spec.ts` → pass exit=0 (fixture path: 1 passed, 1 skipped — live describe skipped without EVAL_LIVE, real screenshots `eval-real-01..05` written under `e2e/inbox-serve/test-results/screenshots/`, `02-report-diagram` visually confirmed as a real drawn `<svg>` with Context→Scaffold→Enrich→FanOut→Synthesize nodes/edges, not the "отрисовка…" placeholder)
- [x] `2026-07-14T15:40:14Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T15:40:14Z` DONE
      **Handoff →** artifacts: [e2e/inbox-serve/helpers/wait-render.ts, e2e/inbox-serve/fixtures/eval-fixture.ts, e2e/inbox-serve/reviewer-eval.spec.ts]; decisions: [fixture-MR=vk-workspace/superapp!571, live-diagram-status=BLOCKED-not-fabricated]; open: [gap-1: VcsInboxReal missing host in serve.cmd.ts + eval-driver.ts, gap-2: runMrsOnce artifacts never reach disk, gap-3: BoardProviderReal.listArtifacts/readArtifact stubbed empty, gap-4: e2e dashboard hardcoded to BoardProviderMock/dev-seed with no live StateStore wiring — real §7 diagram screenshot needs a follow-up ticket closing all four]

#### Round close

- [x] `2026-07-14T15:45:00Z` P1 DONE — e2e-харнесс + wait-render построены; фикстурный путь даёт реальные скрины (диаграмма реально нарисована). type-check/format/playwright(fixture) зелёные.
- [!] `2026-07-14T15:45:00Z` real-proof (spec §7) НЕ достигнут: живой прогон на реальном MR не производит настоящую диаграмму из-за 4 разрывов (host-config / артефакты не на диске / BoardProviderReal-заглушки / дашборд на моках). НЕ подделано. Вынесено в TSK-122.
- [x] `2026-07-14T15:45:00Z` orchestrator sync trackers → §7 real-proof carried to TSK-122

<!--/SECTION:EXECUTION_LOG-->
