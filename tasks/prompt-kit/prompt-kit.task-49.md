# Task: TSK-49 — Bootstrap prompt-kit

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-49
- **Status:** [ ] TODO
- **Purpose:** Добавить prompt-kit в exports package.json, создать корневую директорию и tsconfig для модуля
- **Scope:** prompt-kit
- **Module:** N/A
- **Dependencies:** None
- **Spec References:**
  - Scope spec: [prompt-kit](../../specs/prompt-kit/prompt-kit.spec.md)
  - Bootstrap Requirements: [§8](../../specs/prompt-kit/prompt-kit.spec.md#8-bootstrap-requirements)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — bootstrap

- **Objective:** Добавить `./prompt-kit` и `./prompt-kit/*` в `exports` package.json, создать директории `prompt-kit/core/`, `prompt-kit/elements/`, `prompt-kit/format/`, проверить что `import {...} from 'gennady/prompt-kit'` резолвится
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
  - `prompt-kit/core/index.ts`
  - `prompt-kit/elements/index.ts`
  - `prompt-kit/format/index.ts`
- **Inputs:** none
- **Exit:** `npm run type-check` pass; `import 'gennady/prompt-kit'` резолвится без ошибок
<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Bootstrap — prompt-kit доступен для импорта

**Scenario:** Импорт из gennady/prompt-kit [`contract`]

- **Given** package.json содержит `"./prompt-kit": "./prompt-kit/index.ts"` в exports
- **When** другой модуль делает `import 'gennady/prompt-kit'`
- **Then** резолвится без ошибок, type-check проходит
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command              | Required by      |
| -------------------- | ---------------- |
| `npm run type-check` | nodejs-npm-setup |

- **Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario Импорт из gennady/prompt-kit → N/A (`contract`-level, проверяется type-check'ом)
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
    **Handoff →** artifacts: [...]; decisions: [...]; open: [...]
<!--/SECTION:EXECUTION_LOG-->
