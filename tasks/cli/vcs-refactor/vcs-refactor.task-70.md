# Task: TSK-70 — Рефакторинг VCS-команд на vcs-context-resolver

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-70
- **Status:** [ ] TODO
- **Purpose:** Перевести `review-issues`, `vcs-reply`, `vcs-worktree` на унифицированный `vcs-context-resolver` — заменить inline-логику авто-детекта ветки/проекта/хоста/токена на вызов `resolveVcsContext`
- **Scope:** `cli`
- **Module:** N/A (рефакторинг 3 команд)
- **Dependencies:** TSK-68
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [cli.spec.md §4.1.16, D-017](../../../specs/cli/cli.spec.md)
  - Resolver contract: [vcs-context-resolver §4.1.14](../../../specs/cli/cli.spec.md#4114-vcs-context-resolver-shared)
- **Runtime Backing:** `real-runtime` (через vcs-context-resolver)
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | refactor | —    | [ ]    |
| P2  | test     | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — refactor

- **Objective:** В трёх командах заменить inline-логику git-детекта на вызов `resolveVcsContext(args)`. Парсинг аргументов извлечь `ref/branch/project/iid/host` → передать в resolver → использовать `VcsCliContext`. Поведение команд не меняется, только механизм.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/review-issues/index.ts` (или `cli/cmd/review/review-issues.cmd.ts`)
  - `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
  - `cli/cmd/vcs-worktree/vcs-worktree.cmd.ts`
- **Inputs:** TSK-68 handoff (resolveVcsContext)
- **Exit:** все 3 команды используют `resolveVcsContext` вместо прямых вызовов `git rev-parse`/`git config`; typecheck pass; команды функционально идентичны
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: каждая команда после рефакторинга вызывает `resolveVcsContext` с правильными аргументами; при ref парсит `group/repo!iid`; при отсутствии аргументов делает авто-детект; ошибки резолва пробрасываются.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/review-issues/__tests__/` или `cli/cmd/review/__tests__/`
  - `cli/cmd/vcs-reply/__tests__/`
  - `cli/cmd/vcs-worktree/__tests__/`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass; существующие тесты не сломаны
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: `review-issues`, `vcs-reply`, `vcs-worktree` → используют `resolveVcsContext`

**Feature:** Рефакторинг VCS-команд на унифицированный резолвер

**Scenario:** review-issues с --ref [`unit`]

- **Given** команда вызвана с `--ref group/repo!42`
- **When** резолв выполняется
- **Then** `resolveVcsContext` вызван с `{ ref: 'group/repo!42' }`
- **And** `VcsCliContext.host`, `.project`, `.iid` используются вместо прямых git-вызовов

**Scenario:** review-issues без аргументов — авто-детект [`unit`]

- **Given** команда вызвана без аргументов
- **When** резолв выполняется
- **Then** `resolveVcsContext` вызван с `{}`
- **And** поведение идентично старому (поиск MR по sourceBranch)

**Scenario:** vcs-reply с --project --iid [`unit`]

- **Given** команда вызвана с `--project g/p --iid 42`
- **When** резолв выполняется
- **Then** `resolveVcsContext` вызван с `{ project: 'g/p', iid: 42 }`

**Scenario:** vcs-worktree с --ref [`unit`]

- **Given** команда вызвана с `--ref group/repo!510`
- **When** резолв выполняется
- **Then** `resolveVcsContext` вызван с `{ ref: 'group/repo!510' }`

**Scenario:** Ошибка резолва пробрасывается [`unit`]

- **Given** `resolveVcsContext` выбрасывает `VcsResolveError`
- **When** любая команда выполняется
- **Then** сообщение ошибки выводится в stderr
- **And** exit code 1

**Scenario:** Существующие тесты не сломаны [`unit`]

- **Given** существующие unit-тесты команд
- **When** тесты запущены после рефакторинга
- **Then** все существующие тесты проходят (функциональность не изменилась)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                     | Required by      |
| ----------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                              | typescript-rules |
| `node --import tsx --test cli/cmd/review-issues/__tests__/` | node-test        |
| `node --import tsx --test cli/cmd/vcs-reply/__tests__/`     | node-test        |
| `node --import tsx --test cli/cmd/vcs-worktree/__tests__/`  | node-test        |

- **Task-specific Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- review-issues --ref → `review-issues` :: `ref passed to resolveVcsContext, VcsCliContext used`
- review-issues авто-детект → `review-issues` :: `no args — resolveVcsContext with empty args, behavior unchanged`
- vcs-reply --project --iid → `vcs-reply` :: `project+iid passed to resolveVcsContext`
- vcs-worktree --ref → `vcs-worktree` :: `ref passed to resolveVcsContext`
- Resolver error → `review-issues` :: `VcsResolveError — error message, exit 1`
- Existing tests → all 3 commands :: `existing tests still pass after refactoring`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `tsc --noEmit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [review-issues, vcs-reply.cmd.ts, vcs-worktree.cmd.ts — refactored]; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `node --import tsx --test ...` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [tests for all 3 commands]; decisions: []; open: []

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
