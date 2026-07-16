# Task: TSK-131 — inbox-dashboard: e2e Review Chat (Playwright)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-131 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-dashboard | **Dependencies:** TSK-130 (Review Chat UI), TSK-108 (существующий e2e-харнесс, DONE), TSK-132 (ContextChip.origin file:line), TSK-133 (live serve-интеграция: chat-роуты в bootstrap, ArtifactBrowser refresh, revision в report)
- **Purpose:** Playwright e2e для Review Chat поверх существующего харнесса `e2e/inbox-serve/`, реального `gennady inbox serve` (не изолированных моков компонентов) и реальной привязки чипа к file:line: постоянный сплит на широком viewport / `ViewSwitch`+single-pane на узком (D-87, D-106); selection→chip→ask→stream→mutation полный флоу (CH-01…CH-05), где чип несёт РЕАЛЬНЫЙ `origin` (артефакт+строки, D-115), а не только текст выделения; ход реально едет через живой чат-роут (`bootstrap.ts` chat-конфиг из TSK-133) — playwright печатает вопрос, ждёт реального ответа сервера/агента, не таймаута/заглушки; Apply/Reject/Undo с provenance-тегом (CH-09/CH-10); Stop во время генерации (CH-11); `STALE_REVISION`-баннер (D-99/D-101); ARIA `aria-live` на активном стриме (NFC-CH-a11y); скриншот на каждом ключевом шаге флоу (выделение → чип → стрим → мутация → apply).
- **Spec:** [agent-inbox.spec.md](../../../specs/agent-inbox/agent-inbox.spec.md) Golden DX §3.3, CH-01…CH-14 | **Runtime:** not-implemented | **Verification:** e2e

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (e2e-сценарии)

- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
  - [playwright-e2e](../../../ai/directives/testing/playwright-e2e.xml)
- **Target Files:**
  - `e2e/inbox-serve/fixtures/mock-data.ts` — расширить: MR с seeded `review.json` (с полем `revision`, TSK-133), чат-транскриптом, кандидатами для мутаций, артефактом с построчными `data-line`-маркерами для реального захвата `origin` (TSK-132).
  - `e2e/inbox-serve/chat.spec.ts` — поведенческие сценарии поверх реального `gennady inbox serve` (chat-роуты живые, TSK-133): selection→chip→ask с реальным `origin` (TSK-132), ход стримится через живой сервер, Apply/Reject/Undo мутации, Stop во время генерации, `STALE_REVISION`-баннер; скриншот на каждом ключевом шаге.
  - `e2e/inbox-serve/chat.aria.spec.ts` — ARIA-снапшоты: `aria-live="polite"` на активном стриме, `SelectionPill` доступна с клавиатуры, `ContextChip` как `listitem` в `list`.
  - `e2e/inbox-serve/chat.layout.spec.ts` — layout: постоянный сплит `ActionPanel`↑/`ChatPanel`↓ на широком viewport, `ViewSwitch`+одна панель на узком (resize viewport в тесте).
- **Inputs:** P1 handoff (TSK-130: `ChatPanel`/`SelectionPill`/`ViewSwitch`/`MrDetailPage` split; TSK-132: origin file:line; TSK-133: живые chat-роуты + ArtifactBrowser refresh + report revision)
- **Exit:** Playwright-тесты покрывают поведение, ARIA-структуру, layout Review Chat поверх существующего харнесса (единый `webServer`, sidecar API — D-81), с реальным file:line origin на чипе и реальным чат-ходом через живой сервер (не заглушка).

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — verify

- **Rules:**
  - [playwright-e2e](../../../ai/directives/testing/playwright-e2e.xml)
- **Target Files:** none (verification-only phase)
- **Inputs:** P1 handoff
- **Exit:** `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` — все тесты (существующие + новые Review Chat) pass.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (Golden DX §3.3).

**Feature:** Review Chat — полный флоу от выделения до применённой мутации

**Scenario:** Постоянный сплит на широком viewport [`e2e`]

- **Given** дашборд открыт на `#/mr/:id` на широком viewport
- **When** playwright проверяет DOM
- **Then** `ActionPanel` и `ChatPanel` видны одновременно, без клика по вкладке (D-87)

**Scenario:** ViewSwitch на узком viewport [`e2e`]

- **Given** viewport сужен до мобильного размера
- **When** playwright проверяет DOM на `#/mr/:id`
- **Then** видна ровно одна панель + всегда видимый `ViewSwitch` (не скрытое меню, D-106); клик переключает панель

**Scenario:** Selection→chip→ask→stream→mutation полный флоу с реальным origin [`e2e`]

- **Given** оператор выделяет фразу в кандидате, отрендеренную с построчными `data-line`-маркерами (TSK-132)
- **When** кликает `SelectionPill` → чип прикрепляется в композер → playwright печатает реальный вопрос → Send
- **Then** прикреплённый чип показывает `artifact#L<start>-L<end>` (не голый текст, D-115); playwright ждёт реального стриминга ответа через живой чат-роут (`bootstrap.ts` chat-конфиг, TSK-133), не искусственную задержку; ход отображается в `ChatThread`, ассистент предлагает мутацию, `MutationProposalCard` отображает диф-превью
- **And** playwright делает скриншот на каждом ключевом шаге: выделение+пилюля, чип в композере, активный стрим, предложенная мутация

**Scenario:** Apply мутации обновляет ActionPanel [`e2e`]

- **Given** предложенная мутация `set-severity`
- **When** playwright кликает «Применить»
- **Then** `ActionPanel` перерисовывается с новым severity, карточка получает `[↺ Undo]`

**Scenario:** Undo восстанавливает находку [`e2e`]

- **Given** применённая мутация
- **When** playwright кликает «↺ Undo»
- **Then** находка возвращается к исходному severity

**Scenario:** Stop прерывает генерацию [`e2e`]

- **Given** ход стримится
- **When** playwright кликает «Stop»
- **Then** генерация прерывается, стримленный текст остаётся видимым (CH-11)

**Scenario:** STALE_REVISION баннер [`e2e`]

- **Given** `review.json` изменился в фоне между чтением ревизии и Apply
- **When** playwright применяет мутацию с устаревшей revision
- **Then** баннер «MR обновился в фоне» отображается, мутация не применена (D-99/D-101)

**Scenario:** aria-live на активном стриме [`e2e`]

- **Given** ход в процессе стрима
- **When** captureAriaSnapshot вызывается
- **Then** YAML содержит `aria-live="polite"` регион с текущим текстом ответа (NFC-CH-a11y)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                             | Required by      |
| ------------------------------------------------------------------- | ---------------- |
| `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` | playwright-e2e   |
| `npm run format:check`                                              | typescript-rules |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                                         | Level | Test File           |
| ---------------------------------------------------------------- | ----- | ------------------- |
| Постоянный сплит на широком viewport                             | e2e   | chat.layout.spec.ts |
| ViewSwitch на узком viewport                                     | e2e   | chat.layout.spec.ts |
| Selection→chip→ask→stream→mutation полный флоу с реальным origin | e2e   | chat.spec.ts        |
| Apply мутации обновляет ActionPanel                              | e2e   | chat.spec.ts        |
| Undo восстанавливает находку                                     | e2e   | chat.spec.ts        |
| Stop прерывает генерацию                                         | e2e   | chat.spec.ts        |
| STALE_REVISION баннер                                            | e2e   | chat.spec.ts        |
| aria-live на активном стриме                                     | e2e   | chat.aria.spec.ts   |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-15, initial

#### P1

- [ ] `<ts>` ver `npx playwright test --config=e2e/inbox-serve/playwright.config.ts --list` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npx playwright test --config=e2e/inbox-serve/playwright.config.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
