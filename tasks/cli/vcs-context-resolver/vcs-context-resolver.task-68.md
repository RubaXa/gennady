# Task: TSK-68 — vcs-context-resolver: унифицированный резолв VCS-контекста

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-68
- **Status:** [x] DONE
- **Purpose:** Реализовать `resolveVcsContext(args, deps) → VcsCliContext` в `cli/cmd/_shared/` — унифицированный механизм авто-детекта ветки, проекта, хоста и токена для всех VCS-команд
- **Scope:** `cli`
- **Module:** `vcs-context-resolver`
- **Dependencies:** None
- **Reopens:** 1 (2026-06-26 — audit-driven fix: F-01 @consumers, F-02 env placeholder)
- **Spec References:**
  - Scope spec: [cli.spec.md §4.1.14, §5.16, D-015](../../../specs/cli/cli.spec.md)
  - Contract: [VcsCliContext, VcsCliArgs, VcsCliDeps](../../../specs/cli/cli.spec.md#4114-vcs-context-resolver-shared)
- **Runtime Backing:** `real-runtime` (git CLI, process.env)
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать `resolveVcsContext(args, deps?) → VcsCliContext` с DI: авто-детект ветки (`git rev-parse --abbrev-ref HEAD`), удалённого репозитория (`git config remote.origin.url` — HTTP и SSH форматы), токена (`GITLAB_PERSONAL_TOKEN`). Приоритет: `ref › project+iid › branch (auto)`. Проверка провайдера через `/gitlab/i`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/_shared/vcs-context-resolver.ts`
- **Inputs:** none
- **Exit:** `resolveVcsContext` возвращает `VcsCliContext { provider: 'gitlab', host, project, iid?, branch?, token }`; все экспорты покрыты DBC-контрактами; typecheck pass
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты: авто-детект (HTTP/SSH remote), явные override (ref, project+iid, branch, host), приоритет, ошибки (нет origin, нет токена, не-GitLab host, ветка не найдена без явного ref).
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: `resolveVcsContext(args, deps?) → VcsCliContext`

**Feature:** Резолв VCS-контекста из git + env

**Scenario:** Авто-детект — HTTP remote [`unit`]

- **Given** `git rev-parse --abbrev-ref HEAD` → `"feat/payments"`
- **And** `git config remote.origin.url` → `"https://gitlab.company.com/group/repo.git"`
- **And** `GITLAB_PERSONAL_TOKEN` = `"glpat-xxx"`
- **When** вызывается `resolveVcsContext({})`
- **Then** возвращается `{ provider: 'gitlab', host: 'gitlab.company.com', project: 'group/repo', branch: 'feat/payments', token: 'glpat-xxx' }`

**Scenario:** SSH remote [`unit`]

- **Given** `git config remote.origin.url` → `"git@gitlab.company.com:group/repo.git"`
- **When** вызывается `resolveVcsContext({})`
- **Then** `host = 'gitlab.company.com'`, `project = 'group/repo'`

**Scenario:** Явный ref (приоритет) [`unit`]

- **Given** `resolveVcsContext({ ref: 'group/other!99' })`
- **When** git показывает ветку `feat/x`
- **Then** `project = 'group/other'`, `iid = 99` (авто-детект ветки не вызывается)

**Scenario:** Явный project + iid [`unit`]

- **Given** `resolveVcsContext({ project: 'a/b', iid: 55 })`
- **Then** `project = 'a/b'`, `iid = 55`

**Scenario:** --ref и --branch одновременно → ошибка [`unit`]

- **Given** `resolveVcsContext({ ref: 'g/r!1', branch: 'feat/x' })`
- **Then** выбрасывается `VcsResolveError` с сообщением о взаимоисключении

**Scenario:** Не-GitLab host → ошибка [`unit`]

- **Given** `git config remote.origin.url` → `"https://github.com/user/repo.git"`
- **When** вызывается `resolveVcsContext({})`
- **Then** выбрасывается `VcsResolveError` с сообщением "GitHub is deferred"

**Scenario:** Нет origin remote → ошибка [`unit`]

- **Given** `git config remote.origin.url` падает
- **When** вызывается `resolveVcsContext({})` без явного ref/project
- **Then** выбрасывается `VcsResolveError` с сообщением "Не найден удалённый репозиторий origin"

**Scenario:** Нет токена → ошибка [`unit`]

- **Given** `GITLAB_PERSONAL_TOKEN` не установлен
- **When** вызывается `resolveVcsContext({})`
- **Then** выбрасывается `VcsResolveError` с сообщением о необходимости токена

**Scenario:** Типизация `VcsCliContext` [`contract`]

- **Given** возвращаемое значение
- **Then** все обязательные поля (`provider`, `host`, `project`, `token`) присутствуют
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                           | Required by      |
| --------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                    | typescript-rules |
| `node --import tsx --test cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts` | node-test        |

- **Task-specific Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Авто-детект HTTP → `vcs-context-resolver.test.ts` :: `auto-detect HTTP remote — returns full context`
- SSH remote → `vcs-context-resolver.test.ts` :: `SSH remote URL — parses host and project`
- Явный ref → `vcs-context-resolver.test.ts` :: `explicit ref — skips branch auto-detect`
- project + iid → `vcs-context-resolver.test.ts` :: `explicit project+iid — returns iid directly`
- ref + branch → `vcs-context-resolver.test.ts` :: `ref and branch mutually exclusive — throws`
- Не-GitLab → `vcs-context-resolver.test.ts` :: `non-GitLab host — throws with GitHub deferred`
- Нет origin → `vcs-context-resolver.test.ts` :: `no origin remote — throws`
- Нет токена → `vcs-context-resolver.test.ts` :: `no GITLAB_PERSONAL_TOKEN — throws`
- Типизация → `vcs-context-resolver.test.ts` :: `VcsCliContext type contract`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — 2026-06-26, initial

#### P1

- [x] `2026-06-26T14:55:33Z` intro VcsCliDeps ← DI-контракт для git и env
- [x] `2026-06-26T14:55:33Z` intro VcsCliArgs ← входные параметры резолва VCS-контекста
- [x] `2026-06-26T14:55:33Z` intro VcsCliContext ← результат резолва VCS-контекста
- [x] `2026-06-26T14:55:33Z` intro VcsResolveError ← ошибка резолва с cause-chain
- [x] `2026-06-26T14:55:33Z` intro resolveVcsContext ← унифицированный резолв VCS-контекста с DI
- [x] `2026-06-26T14:55:33Z` ver npm run type-check → pass exit=0
- [x] `2026-06-26T14:55:33Z` ver npx tsx cli/gennady.ts lint cli/cmd/\_shared/vcs-context-resolver.ts → pass exit=0
- [x] `2026-06-26T14:55:33Z` ver npm run test → pass exit=0
- [x] `2026-06-26T14:55:33Z` ver npm run format:check → pass exit=0
- [x] `2026-06-26T14:55:33Z` ver tsc --noEmit → pass exit=0
- [x] `2026-06-26T14:55:33Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/vcs-context-resolver.ts]; decisions: [priority=ref>project+iid>branch, provider-check=/gitlab/i, di-pattern=git+env-injection, ref-format=group/repo!iid]; open: []

#### P2

- [x] `2026-06-26T15:00:27Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-06-26T15:00:27Z` ver node --import tsx --test cli/cmd/\_shared/**tests**/vcs-context-resolver.test.ts → pass exit=0
- [x] `2026-06-26T15:00:27Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts]; decisions: [canonical-case-names=from-ticket§6, test-runner=node:test, mock-pattern=mock.fn-via-di-seam]; open: []

#### Round close

- [x] `2026-06-26T15:02:00Z` DONE

### Round 2 — 2026-06-26, fix: address audit findings F-01 and F-02

#### P2 — re-run: fix: address audit findings F-01 and F-02

- [x] `2026-06-26T15:08:46Z` ver ~/.config/opencode/skills/sdd-execute/scripts/sdd verify cli/cmd/\_shared/**tests**/vcs-context-resolver.test.ts → pass exit=0 (4/4 gates: typecheck, gennady lint, tests, format:check)
- [x] `2026-06-26T15:08:46Z` ver node --import tsx --test cli/cmd/\_shared/**tests**/vcs-context-resolver.test.ts → pass exit=0
- [x] `2026-06-26T15:08:46Z` DONE
      **Handoff →** artifacts: [cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts]; decisions: [f01-fix=removed-@consumers-no-entity-consumers-for-test-file, f02-fix=env-empty-object-for-no-token-test]; open: []

#### Round close

- [x] `2026-06-26T15:12:00Z` DONE
<!--/SECTION:EXECUTION_LOG-->
