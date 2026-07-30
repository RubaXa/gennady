# Task: TSK-160 — inbox-opencode: TTL-паркинг + единый пул + промпт-компиляция

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-160
- **Status:** [ ] TODO
- **Purpose:** Один opencode-сервер, жизненный цикл сессии create→work→park(TTL)→resume→close, session registry, единый приоритетный пул, единый маршрут промптов (Handlebars+кирпичи, указатели), X-ray + tool-trace (источник coverage-гейта), outcome-лесенка.
- **Scope:** `agent-inbox`
- **Module:** `inbox-opencode`
- **Dependencies:** TSK-156
- **Spec References:**
  - Module spec: [inbox-opencode](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) §2–§5
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
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

### P1 — impl

- **Objective:** SessionLifecycle (park/resume/close, idle-TTL конфиг дефолт 45 мин), SessionRegistry (`sessionId ↔ {taskId, mr, artifacts[], model}`), UnifiedPool (приоритет 👤>🦊>🏗, без вытеснения, aging), PromptCompiler (единый маршрут Handlebars+partials из ai/kit, system=директивы, task=указатели, схема в тексте), tool-trace fetch → `telemetry/tool-trace.jsonl`, outcome-классификация + лесенка continue/restart (переезд из inbox-roles).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/session-lifecycle.ts`
  - `services/agent-inbox/modules/inbox-opencode/session-registry.ts`
  - `services/agent-inbox/modules/inbox-opencode/session-pool.ts`
  - `services/agent-inbox/modules/inbox-opencode/prompt-compile.ts`
  - `services/agent-inbox/modules/inbox-opencode/opencode.real.ts`
- **Inputs:** TSK-156 P1 handoff
- **Exit:** `npm run type-check` exit 0; parked-сессия резюмируется (не пересоздаётся)
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** тесты lifecycle (park→resume→TTL close), пула (приоритет+aging, без вытеснения), компилятора (указатели не инлайн, схема в task), tool-trace записи, лесенки.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/__tests__/session-lifecycle.test.ts`
  - `services/agent-inbox/modules/inbox-opencode/__tests__/session-pool.test.ts`
  - `services/agent-inbox/modules/inbox-opencode/__tests__/prompt-compile.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** сессии opencode как управляемый ресурс

**Scenario:** типинг-контракт OpenCodePort/SessionRegistry [`contract`]

- **Given** порт (createSession/prompt/continue/park/resume/close/abort/status/messages) и реестр
- **When** type-check
- **Then** все методы типизированы; реестр несёт {taskId, mr, artifacts[], model}

**Scenario:** park→resume — та же сессия [`integration`]

- **Given** сессия после work переведена в park
- **When** задача deepen приходит в пределах TTL
- **Then** resume той же сессии (X-ray — continuation, system-промпт не дублируется)

**Scenario:** TTL истёк → close [`unit`]

- **Given** parked-сессия старше TTL (45 мин по конфигу)
- **When** tick уборщика
- **Then** сессия закрыта, реестр очищен

**Scenario:** пул без вытеснения, с приоритетом и aging [`unit`]

- **Given** пул заполнен 🏗-сессиями, приходит 👤-задача
- **When** освобождается слот
- **Then** слот достаётся 👤 (приоритет); долго ждущий 🏗 стареет и не голодает

**Scenario:** промпт содержит указатели, не инлайн [`unit`]

- **Given** контекст задачи synthesize (результаты дорожек на диске)
- **When** компиляция
- **Then** в тексте — пути к артефактам, их содержимого нет; схема — в task, не в system

**Scenario:** outcome-классификация запускает лесенку [`unit`]

- **Given** ход завершился parse_error / schema_mismatch / timeout
- **When** классификация
- **Then** outcome ≠ ok; первый сбой → continue той же сессии, повторный → restart; пустой/битый ответ не принимается за ok

**Scenario:** инвариант одного сервера при протухшем pid [`integration`]

- **Given** pid-файл указывает на мёртвый процесс
- **When** boot адаптера
- **Then** поднят ровно один opencode serve; дублей нет; падение health-check видимо

**Scenario:** resume после TTL не воскрешает мёртвую сессию [`integration`]

- **Given** parked-сессия закрыта уборщиком, реестр очищен
- **When** приходит deepen по её артефакту
- **Then** создаётся новая сессия с указателем на артефакт; resume несуществующей не происходит
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                              | Required by      |
| -------------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                                 | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-opencode/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `session-registry.test.ts` :: `contract: opencode port and session registry`
- park/resume → `session-lifecycle.test.ts` :: `parked session resumes within TTL as same session`
- TTL close → `session-lifecycle.test.ts` :: `expired parked session is closed and purged`
- пул → `session-pool.test.ts` :: `pool honors priority and aging without preemption`
- указатели → `prompt-compile.test.ts` :: `compiled prompt carries pointers not inlined content`

- лесенка → `session-lifecycle.test.ts` :: `outcome classification drives continue restart ladder`
- один сервер → `session-lifecycle.test.ts` :: `stale pid yields exactly one opencode server`
- TTL-resume → `session-lifecycle.test.ts` :: `expired session is not resurrected new session gets artifact pointer`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-opencode/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
