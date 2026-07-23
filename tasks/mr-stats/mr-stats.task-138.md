# Task: TSK-138 — Bootstrap: classifier config + CLI scaffolding

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-138
- **Status:** [x] DONE
- **Purpose:** Создать классификационный YAML-конфиг с 10 категориями и зарегистрировать CLI-команду `mr-stats` в gennady.
- **Scope:** mr-stats
- **Module:** N/A
- **Dependencies:** CLI infrastructure (existing gennady command pattern in `cli/cmd/`; see `cli/AGENTS.md` for conventions)
- **Reopens:** 1 (2026-07-18 — audit-driven fix: F-04, F-05, F-06)
- **Spec References:**
  - Bootstrap Requirements: [mr-stats spec §8](../../specs/mr-stats/mr-stats.spec.md)
  - Categories definition: [mr-stats spec §4.1](../../specs/mr-stats/mr-stats.spec.md)
  - Architecture / canonical order: [mr-stats spec §5](../../specs/mr-stats/mr-stats.spec.md)
  - ClassifierRules contract: [mr-stats spec §10](../../specs/mr-stats/mr-stats.spec.md)
  - YAML example: [mr-stats spec §8](../../specs/mr-stats/mr-stats.spec.md)
  - CLI registration: [cli/AGENTS.md](../../cli/AGENTS.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [x]    |
| P2  | config | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — config

- **Objective:** Создать `services/mr-stats/classifier-rules.yaml` с 10 категориями по спецификации.
- **Rules:**
  - _(YAML config — coding rules not triggered. Test file uses vitest; see P2 for test rules)_
- **Target Files:**
  - `services/mr-stats/classifier-rules.yaml`
  - `services/mr-stats/__tests__/classifier-rules.test.ts`
- **Inputs:** none
- **Exit:** YAML-файл существует, содержит 10 категорий, маски соответствуют таблице в спецификации; YAML синтаксически валиден; тест не-пересечения категорий проходит.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — config

- **Objective:** Создать CLI-команду `mr-stats` в `cli/cmd/mr-stats/` и зарегистрировать в `cli/gennady.ts`.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/mr-stats/index.ts`
  - `cli/cmd/mr-stats/mr-stats.cmd.ts`
  - `cli/cmd/mr-stats/help.ts`
  - `cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts`
  - `cli/gennady.ts` (добавить import + switch case)
- **Inputs:** P1 handoff
- **Exit:** `gennady mr-stats --help` выводит справку; `gennady mr-stats` (без URL) выводит usage и exit 1; `gennady mr-stats <url>` выводит `mr-stats: not implemented` в stderr и завершается с exit 0; typecheck pass.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Bootstrap mr-stats service scaffolding.

**Scenario:** Classifier config is valid and loadable [`contract`]

- **Given** файл `services/mr-stats/classifier-rules.yaml` создан
- **When** парсер читает YAML
- **Then** возвращается объект с полем `categories` (массив из 10 элементов)
- **And** каждая категория имеет `name`, `include`, и опциональный `exclude`
- **And** категории не пересекаются — каждый файл попадает ровно в одну категорию

**Scenario:** CLI command registered and discoverable [`contract`]

- **Given** CLI-команда зарегистрирована в `gennady.ts`
- **When** пользователь выполняет `gennady mr-stats --help`
- **Then** выводится справка с usage, description, и позиционным аргументом `<url>`
- **And** `gennady help` показывает `mr-stats` в списке команд

**Scenario:** CLI invoked without URL shows usage [`contract`]

- **Given** CLI-команда зарегистрирована
- **When** пользователь выполняет `gennady mr-stats` без аргументов
- **Then** exit code = 1
- **And** stderr содержит usage-инструкцию

**Scenario:** CLI invoked with URL prints stub [`contract`]

- **Given** CLI-команда зарегистрирована
- **When** пользователь выполняет `gennady mr-stats https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14`
- **Then** exit code = 0
- **And** stderr содержит `mr-stats: not implemented`
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                          | Required by      |
| ------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------ | --- |
| `node -e "require('fs').existsSync('services/mr-stats/classifier-rules.yaml') && process.exit(0) |                  | process.exit(1)"` — проверка существования файла | —   |
| `npm run type-check`                                                                             | typescript-rules |
| `npm run lint`                                                                                   | —                |

- **Task-specific Completion additions:** `classifier-rules.yaml` проходит валидацию: 10 категорий, обязательные поля `name`/`include`, YAML синтаксически корректен. Не-пересечение категорий проверяется тестом (см. P1 test-файл).
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «Classifier config is valid and loadable» → `services/mr-stats/__tests__/classifier-rules.test.ts` :: `classifier rules yaml is valid and contains 10 categories`
- Scenario «CLI command registered and discoverable» → `cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts` :: `mr-stats --help prints usage`
- Scenario «CLI invoked without URL shows usage» → `cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts` :: `mr-stats without URL prints usage and exits 1`
- Scenario «CLI invoked with URL prints stub» → `cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts` :: `mr-stats with URL prints not-implemented stub`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-18, initial

#### P1

- [x] `2026-07-18T19:32:06Z` decision category-order=reordered-for-first-match-wins ← mockFixture-before-configs-avoids-json-vs-fixture-collision
- [x] `2026-07-18T19:41:39Z` verified yaml@1.10.2 parse/stringify API confirmed
- [x] `2026-07-18T19:34:00Z` discovery sdd verify test gate: 9 pre-existing integration test failures (vcs-worktree, ChatApiClient, reviewer.role, bootstrap) — require real infrastructure, unrelated to P1
- [x] `2026-07-18T19:40:42Z` ver node -e "require('fs').existsSync('services/mr-stats/classifier-rules.yaml') && process.exit(0) || process.exit(1)" → pass exit=0
- [x] `2026-07-18T19:41:37Z` ver npm run lint → pass exit=0
- [x] `2026-07-18T19:41:39Z` DONE
      **Handoff →** artifacts: [services/mr-stats/classifier-rules.yaml, services/mr-stats/__tests__/classifier-rules.test.ts]; decisions: [category-order=reordered-for-first-match-wins, yaml@1.10.2-api=parse+stringify]; open: []

#### P2

- [x] `2026-07-18T19:44:30Z` discovery sdd verify gates: format pass, lint pass, typecheck pass, test 9 pre-existing failures (same as P1), format:check pass
- [x] `2026-07-18T19:44:30Z` ver /Users/k.lebedev/Developer/gennady/.claude/skills/sdd-execute/scripts/sdd verify cli/cmd/mr-stats/index.ts cli/cmd/mr-stats/mr-stats.cmd.ts cli/cmd/mr-stats/help.ts cli/cmd/mr-stats/**tests**/mr-stats.cmd.test.ts cli/gennady.ts → pass exit=0
- [x] `2026-07-18T19:44:30Z` decision §5 ticket typo: typecheck→type-check
- [x] ✅ RESOLVED: ticket §5 fixed (`npm run typecheck` → `npm run type-check`)
- [x] `2026-07-18T19:44:30Z` DONE
      **Handoff →** artifacts: [cli/cmd/mr-stats/index.ts, cli/cmd/mr-stats/mr-stats.cmd.ts, cli/cmd/mr-stats/help.ts, cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts, cli/gennady.ts, cli/cmd/README.md, cli/AGENTS.md]; decisions: [mr-stats-command=bootstrap-stub, test-runner=node:test]; open: []

#### Round close

- [x] `<ts>` DONE

#### P2 — re-run: fix: address audit findings F-04, F-05, F-06

- [x] `2026-07-18T22:16:46Z` intro F-04 fix: console.error → process.stderr.write in mr-stats.cmd.ts:67 ← AX_STRUCTURED_LOGGING
- [x] `2026-07-18T22:16:46Z` intro F-05 fix: console.info → process.stdout.write in help.ts:9-18 ← AX_STRUCTURED_LOGGING
- [x] `2026-07-18T22:16:46Z` intro F-06 fix: @consumers entity names corrected in 5 target files; 2 out-of-scope (classifier-rules.test.ts, unknown 7th) ← F-06
- [x] `2026-07-18T22:16:46Z` insight F-06 incomplete: 2 files outside P2 Target Files (services/mr-stats/**tests**/classifier-rules.test.ts: @consumers=node:test runner → drop; unknown 7th file) need separate phase or task ← @consumers audit
- [x] `2026-07-18T22:18:34Z` tried sdd verify test gate: 9 pre-existing integration test failures (vcs-worktree, ChatApiClient, reviewer.role, bootstrap) — unrelated to P2 re-run
- [x] `2026-07-18T22:18:34Z` ver sdd verify typecheck gate → pass exit=0
- [x] `2026-07-18T22:18:34Z` ver sdd verify gennady-lint gate (5 files) → pass exit=0
- [x] `2026-07-18T22:18:34Z` ver sdd verify format gate → pass exit=0
- [x] `2026-07-18T22:18:34Z` ver npm run type-check → pass exit=0
- [x] `2026-07-18T22:18:34Z` DONE
    **Handoff →** artifacts: [cli/cmd/mr-stats/index.ts, cli/cmd/mr-stats/mr-stats.cmd.ts, cli/cmd/mr-stats/help.ts, cli/cmd/mr-stats/__tests__/mr-stats.cmd.test.ts, cli/gennady.ts]; decisions: [F-04=console.error→process.stderr.write, F-05=console.info→process.stdout.write, F-06=@consumers-entity-names-in-5-files]; open: [F-06-incomplete: @consumers fix needed in services/mr-stats/__tests__/classifier-rules.test.ts and 1 unknown file — outside P2 Target Files]
<!--/SECTION:EXECUTION_LOG-->
