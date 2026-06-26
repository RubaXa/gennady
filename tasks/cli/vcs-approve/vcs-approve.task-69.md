# Task: TSK-69 — Команда vcs-approve

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-69
- **Status:** [ ] TODO
- **Purpose:** Реализовать команду `gennady vcs-approve` — approve GitLab MR через API, с авто-детектом через `vcs-context-resolver` и `--dry-run`
- **Scope:** `cli`
- **Module:** `vcs-approve`
- **Dependencies:** TSK-67, TSK-68
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [cli.spec.md §3.13, §4.1.15, §5.17, D-016](../../../specs/cli/cli.spec.md)
  - Resolver contract: [vcs-context-resolver §4.1.14](../../../specs/cli/cli.spec.md#4114-vcs-context-resolver-shared)
  - VCS-клиент: [vcs.spec.md §FR-26..FR-29](../../../specs/vcs/vcs.spec.md)
- **Runtime Backing:** `real-runtime` (vcs-context-resolver + VCS client approve API)
- **Verification Levels:** `unit`
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

- **Objective:** Реализовать CLI-команду `vcs-approve` (Pattern C: `run(rawArgs, deps)`). Парсинг: `--ref`, `--project`, `--iid`, `--branch`, `--host`, `--dry-run`. Вызов `resolveVcsContext` → MR lookup (при авто-детекте из ветки: `getOne(sourceBranch, state:'opened')`) → `approve(query)`. Обработка ошибок: idempotent (already approved), self-approve, merge conflict, общие ошибки API. Регистрация в `cli/gennady.ts`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-approve/vcs-approve.cmd.ts`
  - `cli/cmd/vcs-approve/index.ts`
  - `cli/cmd/vcs-approve/help.ts`
  - `cli/gennady.ts` (регистрация)
- **Inputs:** TSK-67 handoff (approve метод), TSK-68 handoff (resolveVcsContext)
- **Exit:** `gennady vcs-approve` запускается, авто-детектит MR, вызывает approve; `--dry-run` печатает без вызова; все ошибки обработаны с понятными сообщениями; зарегистрирована в gennady.ts
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: happy path, dry-run, already approved, self-approve, merge conflict, MR not found, no token, no origin, DI-моки для `resolveVcsContext` и `vcsClient`.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: `gennady vcs-approve [--ref | --project --iid | --branch] [--host] [--dry-run]`

**Feature:** Approve GitLab MR через CLI

**Scenario:** Авто-детект → approve success [`unit`]

- **Given** `resolveVcsContext` возвращает `{ host, project, branch, token }`
- **And** `getOne(sourceBranch, 'opened')` возвращает MR с `iid=42, web_url='https://.../42'`
- **And** `approve({ repository: project, iid: 42 })` успешен
- **When** вызывается `gennady vcs-approve`
- **Then** stdout содержит `✓ MR !42 approved: https://.../42`
- **And** exit code 0

**Scenario:** Явный ref → approve [`unit`]

- **Given** `resolveVcsContext({ ref: 'group/repo!99' })` возвращает `{ project: 'group/repo', iid: 99 }`
- **When** выполняется команда с `--ref group/repo!99`
- **Then** вызывает `approve({ repository: 'group/repo', iid: 99 })`

**Scenario:** Dry-run [`unit`]

- **Given** `--dry-run` флаг передан
- **When** команда запускается
- **Then** stdout содержит `Would approve: group/repo!42  host=gitlab.company.com`
- **And** stdout содержит `[DRY-RUN] no request sent`
- **And** `approve()` НЕ вызывается

**Scenario:** Уже approved (idempotent) [`unit`]

- **Given** `approve()` выбрасывает `VcsApproveError` с кодом `ALREADY_APPROVED`
- **When** команда запускается
- **Then** stdout содержит `ℹ MR !42 already approved`
- **And** exit code 0

**Scenario:** Self-approve forbidden [`unit`]

- **Given** `approve()` выбрасывает `VcsApproveError` с кодом `SELF_APPROVE_FORBIDDEN`
- **When** команда запускается
- **Then** stderr содержит `Self-approval is not permitted`
- **And** exit code 1

**Scenario:** Merge conflict [`unit`]

- **Given** `approve()` выбрасывает `VcsApproveError` с кодом `CANNOT_APPROVE` и статусом 409
- **When** команда запускается
- **Then** stderr содержит `✖ GitLab API error [409]`
- **And** exit code 1

**Scenario:** MR не найден (авто-детект) [`unit`]

- **Given** `getOne` возвращает `null`
- **When** команда запускается без явного ref
- **Then** stdout содержит `ℹ Merge Request не найден для ветки: <branch>`
- **And** exit code 0

**Scenario:** Ошибки резолва пробрасываются [`unit`]

- **Given** `resolveVcsContext` выбрасывает `VcsResolveError` с сообщением
- **When** команда запускается
- **Then** сообщение ошибки выводится в stderr
- **And** exit code 1
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                      | Required by      |
| ---------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                               | typescript-rules |
| `node --import tsx --test cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts` | node-test        |

- **Task-specific Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Авто-детект approve → `vcs-approve.test.ts` :: `auto-detect — approve success, exit 0`
- Явный ref → `vcs-approve.test.ts` :: `--ref group/repo!99 — passes ref to resolver`
- Dry-run → `vcs-approve.test.ts` :: `--dry-run — prints Would approve, does not call API`
- Already approved → `vcs-approve.test.ts` :: `ALREADY_APPROVED — info message, exit 0`
- Self-approve → `vcs-approve.test.ts` :: `SELF_APPROVE_FORBIDDEN — error message, exit 1`
- Merge conflict → `vcs-approve.test.ts` :: `409 CANNOT_APPROVE — error message, exit 1`
- MR not found → `vcs-approve.test.ts` :: `getOne returns null — info, exit 0`
- Resolver error → `vcs-approve.test.ts` :: `VcsResolveError — error message, exit 1`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `tsc --noEmit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [vcs-approve.cmd.ts, index.ts, help.ts, gennady.ts]; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `node --import tsx --test cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [vcs-approve.test.ts]; decisions: []; open: []

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
