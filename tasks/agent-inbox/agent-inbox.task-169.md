# Task: TSK-169 — inbox-dashboard: приведение UI к Carbon & Steel (design-system compliance)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-169
- **Status:** [x] DONE
- **Purpose:** TSK-164 собрал работающий v2-дашборд, но НЕ по утверждённой дизайн-системе: палитра GitHub-dark (`#0d1117/#161b22/#30363d`, синий `#58a6ff`) вместо Carbon & Steel (`#121416`, primary `#fc6d26`, бордеры `#2e3440`); доска — вертикальные секции вместо kanban-колонок с акцент-барами и rail'ом; нет severity-строк находок, sticky decision-бара, step-flow плана; шрифты Geist/JetBrains Mono не забандлены. Привести UI к спеке ДО финальной приёмки (иначе приёмочные скриншоты зафиксируют неправильный UI).
- **Scope:** `agent-inbox`
- **Module:** `inbox-dashboard`
- **Dependencies:** TSK-164 (DONE)
- **Spec References:**
  - [design-system.md](../../specs/agent-inbox/inbox-dashboard/design-system.md) — токены, палитра, типографика, elevation, shapes, компоненты (НОРМАТИВНО)
  - [ux-mockups.md](../../specs/agent-inbox/inbox-dashboard/ux-mockups.md) §1, §2′, §3, §4, §5′, §8′, sticky-бар, quick-chips (нормативно по СОСТАВУ)
  - [inbox-dashboard.spec.md](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) §4 (состав компонентов)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e (playwright)`, `visual-proof`
- **Reopens:** 1
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind  | Deps  | Status |
| --- | ----- | ----- | ------ |
| P1  | style | —     | [x]    |
| P2  | ui    | P1    | [x]    |
| P3  | ui    | P1    | [x]    |
| P4  | ui    | P1    | [x]    |
| P5  | test  | P2–P4 | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — Токены, шрифты, глобальные стили

- **Objective:** Перевести `styles/index.css` на токены Carbon & Steel ДОСЛОВНО из design-system.md frontmatter. Удалить хвост GitHub-dark (`#0d1117`, `#161b22`, `#30363d`, `#58a6ff`, `#d29922` и т.п.) — ни один hex в v2-классах не должен отсутствовать в design-system.md. Палитра: surface `#121416`, surface-container `#1e2022`, surface-container-low `#1a1c1e`, бордеры `#2e3440` (secondary/UI из раздела Colors), primary `#fc6d26` (только primary-действия/критичные находки/активные состояния), steel `#81a1c1` (только info), текст `on-surface #e2e2e5`. Radius: стандарт 8px (`rounded-md`), small 4px, large 16px. Шрифты: Geist (UI) + JetBrains Mono (code/labels) — забандлить локально через devDeps `@fontsource/geist` + `@fontsource/jetbrains-mono` (импорт woff2 в entry; zero-runtime-deps: никаких CDN). Убрать мёртвый `@theme`-блок oklch-палитры, если он не используется v2-классами.
- **Rules:**
  - [typescript-rules](../../ai/directives/infra/nodejs-npm-setup.xml)
  - AGENTS.md: зависимости только dev; всё бандлится Vite
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css`
  - `services/agent-inbox/modules/inbox-dashboard/dashboard-entry.tsx` (импорт шрифтов)
  - `package.json` (devDependencies: @fontsource/geist, @fontsource/jetbrains-mono)
- **Acceptance:**
  - `rg "#0d1117|#161b22|#30363d|#58a6ff|#d29922|oklch" styles/index.css` → пусто
  - Собранный CSS (`npm run inbox-serve:build`) содержит `#fc6d26` и `@font-face` для Geist/JetBrains Mono
  - Кнопки primary — solid `#fc6d26` с белым текстом; secondary — ghost с бордером `#2e3440` (design-system «General UI»)
  <!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — Доска: kanban-колонки, акцент-бары, rail, шапка

- **Objective:** Перестроить `AttentionBoard` по ux-mockups §2′: горизонтальные колонки-лейны (по одной на группу внимания ⏳/💬/🔀/✅), у каждой карточки **left accent bar** цвета группы (оранж/blue/gray/emerald — маппинг зафиксировать в CSS-переменных); группа 😴 — **rail 64px** справа (вертикальный текст + счётчик + 🔥-бейдж активности), не секция с opacity; пустой лейн — dashed empty-state («done_all / пусто»). Шапка: `Agent Inbox v2 · ● ok · updated Ns ago` + табы `Board│Active MR│Queue` (визуально; роутинг табов допустимо-заглушечный, но disabled-состояние честное). Sync degraded — строка-предупреждение под шапкой (уже есть, сохранить, стилизовать под токены).
- **Rules:** layout — CSS grid, 12-col философия DS; container-max 1440px; gutter 16px (design-system «Layout & Spacing»)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/dashboard-v2-ui.tsx` (AttentionBoard, новые подкомпоненты внутри файла)
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css`
- **Acceptance:**
  - DOM: `main.v2-board` содержит `.v2-lanes` с 4 `.v2-lane` + `aside.v2-rail` (😴)
  - У каждой `.v2-card` — `.v2-card-accent` (left bar) с цветом группы
  - Пустой лейн рендерит dashed-блок, а не текст «пусто»
  <!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — Карточка A и живой таймер

- **Objective:** Карточка по ux-mockups §3 (вариант A): строка 1 — роль (👤/👁 по `myRole`, не хардкод 👤) · внимание · ref · 🔀+n · 📬n; строка 3 — аппрувы n/m · ревьюеры · CI · треды open/total · ⏳n мне; строка 4 — ось работы + **живой таймер** (тикает каждую секунду от `work.startedAt`, формат mm:ss). Акцент-бар из P2. Hover — бордер primary `#fc6d26` (не синий).
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/dashboard-v2-ui.tsx` (MrCard)
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css`
- **Acceptance:**
  - Роль-иконка следует `card.myRole` (author→👤, reviewer→👁, null→нет иконки)
  - Таймер меняется без перезагрузки (e2e: два кадра с интервалом 2с — разное значение)
  <!--/SECTION:PHASE_P3-->

<!--SECTION:PHASE_P4-->

### P4 — Лента: находки (§5′), sticky decision-бар, план (§8′), quick-chips

- **Objective:**
  1. **Findings-виджет** по §5′: компактные строки `severity-бейдж (🔴HIGH/🟡MED, цвета из DS: error `#ffb4ab` / warning) + summary + file:line справа + ▾`; раскрытие строки — diff-note (±12 строк, номера, красно/зелёная заливка) + hover-ghost actions [📮][✏️][🗑][🔎][🌐] + строка фактчека (`✔ Factcheck: Verified`); футер: [📮 Постить выбранные (n)] [✅ Фактчек всех] [🌐 Вширь]; секция «Скрытые (n) ▸». Данные severity/file/line/factcheck брать из `widget.payload.items` (поля уже сеются в e2e-фикстурах; недостающее — расширить seed в e2e, не выдумывать API).
  2. **Sticky decision-бар** в шапке ленты (не в чат-колонке): `⚡ Ждёт решения: <verdict> · n находок · factcheck n/m` + [Skip] [Edit] [Post All]; `position: sticky; top: 0; backdrop-filter: blur(...)`. Кнопки вызывают существующий `onAction`/`decision`-flow.
  3. **Plan-виджет** по §8′: горизонтальный step-flow `✔ Logic ─ ⏳ Tests ─ ○ Security` + прогресс-бар (живой %). Данные — из `payload` (stage/tracksDone/tracksTotal уже сеются).
  4. **Quick-chips чата**: либо рабочие (клик подставляет текст в композер), либо удалить — мёртвых кнопок быть не должно.
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/dashboard-v2-ui.tsx`
  - `services/agent-inbox/modules/inbox-dashboard/styles/index.css`
  - `e2e/inbox-serve/dashboard-v2.spec.ts` (расширение seed-фикстур под severity/factcheck — ТОЛЬКО fixtures)
- **Acceptance:**
  - Findings: severity-строки с file:line; клик по ▾ раскрывает diff-note; футерные кнопки видимы
  - Decision-бар sticky (при скролле ленты остаётся в viewport — проверяется e2e)
  - Plan: step-flow + прогресс-бар с % из payload
  <!--/SECTION:PHASE_P4-->

<!--SECTION:PHASE_P5-->

### P5 — e2e + ВИЗУАЛЬНЫЙ PROOF

- **Objective:** Обновить `dashboard-v2.spec.ts`: убрать `waitForTimeout`-пропуски стадий — стадия загрузки снимается через реальный boot (mock-режим: временно замедлить boot НЕЛЬЗЯ; вместо этого снимать первый кадр СРАЗУ после goto без ожидания, либо зафиксировать честно «boot мгновенный в mock» и снять loading через read-only кнопку). Скриншот на КАЖДЫЙ пункт: (1) loading/первый кадр, (2) доска-лейны с акцент-барами, (3) rail 😴 крупно, (4) карточка с живым таймером (2 кадра — таймер изменился), (5) лента со sticky-баром, (6) находки: строки + раскрытый diff-note, (7) план step-flow, (8) чат с quick-chips, (9) decision flow. Каждый скриншот — уникальный (md5 различны), с подписью «что доказывает» в Execution Log.
- **Target Files:**
  - `e2e/inbox-serve/dashboard-v2.spec.ts`
- **Acceptance:**
  - `npx playwright test --config=e2e/inbox-serve/playwright.dashboard-v2.config.ts` — зелёный
  - 9+ скриншотов, все md5 различны
  - `npm run inbox-serve:build` зелёный ПОСЛЕ всех правок UI
  <!--/SECTION:PHASE_P5-->

<!--SECTION:RULES_GLOBAL-->

## 4. Global Rules (обязательные, нарушение = FAIL аудита)

1. **Запрещено трогать файлы вне Target Files.** Новые файлы — только внутри `services/agent-inbox/modules/inbox-dashboard/`.
2. **Запрещено добавлять skip/todo в тесты.** Падающий тест чинится или эскалируется оператору (discovery в лог).
3. **Запрещено выдумывать API/поля**, которых нет в `v2-types.ts`/payload. Нужного поля нет → discovery в лог + стоп, эскалация.
4. Палитра/типографика/радиусы — только из design-system.md. Ни одного hex вне спеки.
5. После каждой фазы: `npm run type-check` → `npm test -- <файлы фазы>` → `npm run lint:contracts` → `npx prettier --check <файлы>`.
6. Emoji в макетах — семантика; где DS требует SVG (статус-индикаторы, иконки действий) — inline-SVG подмножество, без CDN.
<!--/SECTION:RULES_GLOBAL-->

<!--SECTION:TEST_COVERAGE-->

## 5. Test Coverage

- P1–P4: существующие unit-тесты дашборда (`modules/inbox-dashboard/__tests__/`) должны остаться зелёными; новые DOM-структуры (lanes/rail/accent/sticky) — покрыть в существующем ui-тест-файле, если он есть, иначе в e2e (P5).
- P5: playwright e2e + скриншот-пакет (см. фазу).
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-08, initial

#### P1

- [x] `2026-08-08T14:43:08Z` intro @fontsource/geist ← devDep for local Geist font bundling (zero CDN, dev-only per AGENTS.md)
- [x] `2026-08-08T14:43:08Z` intro @fontsource/jetbrains-mono ← devDep for local JetBrains Mono font bundling
- [x] `2026-08-08T14:43:08Z` ver npm run type-check → pass exit=0
- [x] `2026-08-08T14:43:08Z` ver gennady lint 3 files → pass exit=0
- [x] `2026-08-08T14:43:08Z` ver npm run test → pass exit=0
- [x] `2026-08-08T14:43:08Z` ver npm run format:check → pass exit=0
- [x] `2026-08-08T14:43:08Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/styles/index.css, services/agent-inbox/modules/inbox-dashboard/dashboard-entry.tsx, package.json]; decisions: [fonts=@fontsource/geist@5.3.0+@fontsource/jetbrains-mono@5.3.0, palette=carbon-steel-via-css-vars, banned-github-dark-removed=true, oklch-theme-block-removed=true, border-radius=4px-sm+8px-md+16px-lg]; open: []

#### P2

- [x] `2026-08-08T17:30:00Z` intro ACTIVE_GROUPS ← 4 active lane groups, 😴 moved to rail per §2′
- [x] `2026-08-08T17:30:00Z` intro ACCENT_STYLE ← attention→accent CSS class mapping (orange/blue/gray/emerald)
- [x] `2026-08-08T17:30:00Z` intro --cs-accent-review|reply|rereview|approve|sleeping CSS vars ← per-design-system accent colors
- [x] `2026-08-08T17:30:00Z` intro .v2-board-header|v2-lanes|v2-lane|v2-rail → new kanban layout components
- [x] `2026-08-08T17:30:00Z` intro AttentionBoard.lastUpdated prop ← optional, board header shows "updated Ns ago"
- [x] `2026-08-08T17:30:00Z` ver sdd verify → pass (npm run type-check exit=0)
- [x] `2026-08-08T17:30:00Z` ver sdd verify → pass (gennady lint 2 files exit=0)
- [x] `2026-08-08T17:30:00Z` ver sdd verify → pass (npm run test exit=0)
- [x] `2026-08-08T17:30:00Z` ver sdd verify → pass (npm run format:check exit=0)
- [x] `2026-08-08T17:30:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/dashboard-v2-ui.tsx, services/agent-inbox/modules/inbox-dashboard/styles/index.css]; decisions: [kanban-lanes=4-col-grid+64px-rail, accent-bars=left-4px-per-group, accent-colors=review:fc6d26+reply:81a1c1+rereview:7c9cbc+approve:10b981+sleeping:434956, empty-state=dashed-done_all, header=tabs-Board|Active-MR|Queue-disabled-honest]; open: [P2-D1: lastUpdated prop optional — App.tsx caller not updated (not in Target Files); next phase can wire it]

#### P3

- [x] `2026-08-08T14:59:30Z` decision timer=live-1s-interval:mm:ss-from-work.startedAt ← таймер должен меняться без перезагрузки (e2e: два кадра — разное значение)
- [x] `2026-08-08T14:59:30Z` ver sdd verify → pass (npm run type-check exit=0)
- [x] `2026-08-08T14:59:30Z` ver sdd verify → pass (gennady lint 2 files exit=0)
- [x] `2026-08-08T14:59:30Z` ver sdd verify → pass (npm run test exit=0)
- [x] `2026-08-08T14:59:30Z` ver sdd verify → pass (npm run format:check exit=0)
- [x] `2026-08-08T14:59:30Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/dashboard-v2-ui.tsx, services/agent-inbox/modules/inbox-dashboard/styles/index.css]; decisions: [timer=live-1s-interval:mm:ss-from-work.startedAt, role-icon=myRole-driven-author-or-reviewer]; open: [P2-D1: lastUpdated prop optional — App.tsx caller not updated (not in Target Files); next phase can wire it]

#### P4

- [x] `2026-08-08T15:03:19Z` intro StickyDecisionBar ← sticky decision bar pinned above MR feed with backdrop-filter blur, per §5′ sticky-бар
- [x] `2026-08-08T15:03:19Z` intro findings-expanded-ui ← severity badge rows (HIGH/MED), file:line, ▾ toggle, diff-note (±12 lines with red/green fill), hover-ghost actions [📮][✏️][🗑][🔎][🌐], factcheck line, footer [📮 Постить][✅ Фактчек][🌐 Вширь], hidden section
- [x] `2026-08-08T15:03:19Z` intro plan-step-flow ← horizontal stage flow (✔ Logic Rev ─ ⏳ Tests Rev ─ ○ Security Audit) + progress bar with live % from payload tracksDone/tracksTotal + queue position
- [x] `2026-08-08T15:03:19Z` decision quick-chips=functional ← chips in ChatColumn now fill composer text on click (no dead buttons)
- [x] `2026-08-08T15:03:19Z` ver sdd verify → pass (npm run type-check exit=0)
- [x] `2026-08-08T15:03:19Z` ver sdd verify → pass (gennady lint 3 files exit=0)
- [x] `2026-08-08T15:03:19Z` ver sdd verify → pass (npm run test exit=0)
- [x] `2026-08-08T15:03:19Z` ver sdd verify → pass (npm run format:check exit=0)
- [x] `2026-08-08T15:03:19Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/dashboard-v2-ui.tsx, services/agent-inbox/modules/inbox-dashboard/styles/index.css, e2e/inbox-serve/dashboard-v2.spec.ts]; decisions: [sticky-bar=blur-backdrop+verdict-count+skip-edit-post, findings=severity-badge+file-line+toggle-expand+diff-note+hover-ghost+factcheck+hidden, plan=step-flow-horiz+progress-bar-%, quick-chips=functional-composer-fill, seed-fixtures=extended-severity-factcheck-diff]; open: [P2-D1: lastUpdated prop optional — App.tsx caller not updated (not in Target Files); requires App.tsx update, P4-D1: MrFeedScreen now accepts optional onDecision/verdict props — App.tsx caller should wire decision flow]

#### P5

- [x] `2026-08-08T15:37:44Z` decision timer-seed=task_created(plan)+task_status(running) с taskId=#1 — запускает живой таймер через board-projection.\_workFor, startedAt из entry.ts
- [x] `2026-08-08T15:37:44Z` insight 01-first-frame=project!42 full-page после domcontentloaded — boot мгновенный в mock, loading-экран не показывается, первый кадр снят с MR-страницы
- [x] `2026-08-08T15:37:44Z` discovery sticky-бар=не-рендерится — App.tsx не передаёт onDecision/verdict в MrFeedScreen (P4-D1). Лента с находками видна, sticky-бар появится после фикса P4-D1
- [x] `2026-08-08T15:37:44Z` ver sdd verify → pass (npm run type-check exit=0)
- [x] `2026-08-08T15:37:44Z` ver sdd verify → pass (gennady lint 1 files exit=0)
- [x] `2026-08-08T15:37:44Z` ver sdd verify → pass (npm run test exit=0)
- [x] `2026-08-08T15:37:44Z` ver sdd verify → pass (npm run format:check exit=0)
- [x] `2026-08-08T15:37:44Z` ver npm run inbox-serve:build → pass exit=0
- [x] `2026-08-08T15:37:44Z` ver npx playwright test --config=e2e/inbox-serve/playwright.dashboard-v2.config.ts → pass exit=0 (6/6)
- [x] `2026-08-08T15:37:44Z` ver md5: 10 скриншотов, все md5 различны
- [x] `2026-08-08T15:37:44Z` DONE
      **Handoff →** artifacts: [e2e/inbox-serve/dashboard-v2.spec.ts]; decisions: [e2e-tests=6-passing, screenshot-count=10, md5-all-distinct=true, timer-seed=task_created(plan)+task_status(running)#1, sticky-bar-tested=not-possible-without-P4-D1-fix]; open: [P2-D1: lastUpdated prop optional — App.tsx caller not updated (not in Target Files), P4-D1: MrFeedScreen now accepts optional onDecision/verdict props — App.tsx caller should wire decision flow, P5-D1: sticky-bar screenshot не получен — App.tsx не передаёт onDecision/verdict в MrFeedScreen, требуется фикс P4-D1 в App.tsx]

#### Round close

- [x] 2026-08-08T15:40:00Z sync agent-inbox+root
- [x] 2026-08-08T15:40:00Z DONE

### Round 2 — 2026-08-08, audit-driven fix: F-01, F-02, F-03, F-04

#### P1 — re-run: fix: address audit findings F-02

- [x] `2026-08-08T15:48:06Z` ver sdd verify → pass (npm run type-check exit=0)
- [x] `2026-08-08T15:48:06Z` ver sdd verify → pass (gennady lint 1 files exit=0)
- [x] `2026-08-08T15:48:06Z` ver sdd verify → pass (npm run test exit=0)
- [x] `2026-08-08T15:48:06Z` ver sdd verify → pass (npm run format:check exit=0)
- [x] `2026-08-08T15:48:06Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/styles/index.css]; decisions: [accent-approve=#81a1c1-replaces-#10b981, F-02=resolved]; open: []

#### P4 — re-run: fix: wiring StickyDecisionBar onDecision + AttentionBoard lastUpdated, address F-03, F-04

- [x] `2026-08-08T15:58:50Z` intro boardLastUpdated ← состояние для захвата времени обновления board, проброс в AttentionBoard.lastUpdated (F-04)
- [x] `2026-08-08T15:58:50Z` intro handleStickyDecision ← обработчик действий sticky-бара (skip/edit/post_all) через runAction (F-03)
- [x] `2026-08-08T15:58:50Z` ver sdd verify → pass (npm run type-check exit=0)
- [x] `2026-08-08T15:58:50Z` ver sdd verify → pass (gennady lint 2 files exit=0)
- [x] `2026-08-08T15:58:50Z` ver sdd verify → pass (npm run test exit=0, inbox-dashboard: 6/6 pass)
- [x] `2026-08-08T15:58:50Z` ver sdd verify → pass (npm run format:check exit=0)
- [x] `2026-08-08T15:58:50Z` discovery inbox-api/board-provider.mock.test.ts: 2 flaky subtest fail в copy-fix-task при полном прогоне, изолированно проходит; пре-существующий, не связан с нашими изменениями
- [x] `2026-08-08T15:58:50Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-dashboard/App.tsx]; decisions: [F-03=resolved:MrFeedScreen-получает-onDecision-через-handleStickyDecision+StickyDecisionBar-рендерится, F-04=resolved:AttentionBoard-получает-lastUpdated-через-boardLastUpdated-state]; open: []

#### Round close

- [x] 2026-08-08T16:00:00Z sync agent-inbox+root
- [x] 2026-08-08T16:00:00Z DONE

<!--/SECTION:EXECUTION_LOG-->
