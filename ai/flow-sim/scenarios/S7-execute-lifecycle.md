# S7 — полный контур `/sdd-execute`: план → фазы → аудит → code-review → summary

Проверяет: `execute.directive` целиком — `sdd-task` для плана, открытие Round через `sdd-log`,
диспетчеризацию фаз через `phase-execution-protocol` (каждая фаза читает строго по манифесту,
пишет только свой Target Files, гоняет верификацию, закрывается типизированным Handoff), закрытие
Round, `sdd-sync`, тул-вердикт `sdd-task --audit-group` (`due`/`not yet`) как единственный триггер
аудита, автоматический (не операторский) диспетч `audit.directive` на ГРУППУ тикетов спеки, ветвление
по вердикту, ленивый `code-review.directive` — тоже на группу, тем же тул-триггером — после PASS, и
финальный оператору summary. Отдельно проверяет различие `BLOCKED` ≠ `FAIL`
(`AX_HALT_VS_FAIL_DISTINCTION`) и что audit + code-review запускаются «automatically» по вердикту
инструмента, а не по команде оператора и не после каждого тикета в отрыве от его группы
(`AX_AUDIT_HOOK`). Фикстура S7 — единственный тикет в своей спеке, значит его группа замыкается сразу
на его же закрытии («due» с первого раунда) — упрощённый, но валидный случай общего механизма.

**Важно для Executor — одна сессия играет обе роли.** В этом прогоне нет отдельных субагентов:
Executor последовательно ИСПОЛНЯЕТ роль orchestrator (планирование, диспетч, синк, чтение
`execute.directive`) и роль worker (каждая фаза, чтение `phase-execution-protocol.directive.xml`),
затем роль audit-subagent и роль code-review-subagent — та же сессия, тот же контекст, роли не
изолированы реальной песочницей процесса. Изоляция ИМИТИРУЕТСЯ дисциплиной чтения: находясь в роли
worker, Executor читает СТРОГО по манифесту фазы (не заглядывает в чужие секции тикета), находясь в
роли audit (или code-review) — резолвит область через `sdd-task --group-scope <id>` (диффа руками не
гоняет — `AX_GIT_DIFF_SCAN` запрещает ручную git-археологию), а не читает весь тикет с нуля. Каждая смена роли — своя
строка трейса: `note: role=orchestrator` / `note: role=worker P1` / `note: role=worker P2` /
`note: role=audit-subagent` / `note: role=code-review-subagent`, ПЕРЕД первым действием в этой роли.

**`AX_WORKER_SESSION_REUSE` в этой фикстуре.** Ключ сессии — (спека, вид фазы); P1 = `impl`, P2 =
`test` — РАЗНЫЕ виды, значит по политике им ВСЕГДА полагаются разные сессии, реального
переиспользования здесь не происходит независимо от того, умеет ли среда продолжать сессию
субагента. Эта фикстура (ровно одна фаза каждого вида в спеке) поэтому не покрывает ветку
«тот же вид → та же сессия» — её отдельно проверяет юнит-уровень/другой прогон, не S7. Что S7
ВСЁ ЖЕ проверяет: (а) диспетч-сообщение остаётся тем же самодостаточным 3-строчным шаблоном
независимо от переиспользования (`note: role=worker P1`/`P2` + `directive: ... loaded` перед
каждым первым действием — см. чекпоинты 4 и 12, требование не ослабляется новой аксиомой); (б) ни
одна роль не полагается на память соседней роли — worker P2 не помнит контекст worker P1, тот же
класс изоляции, что и раньше, теперь дополнительно обоснованный `AX_WORKER_SESSION_REUSE` («an
`impl` session MUST NOT see a `test` session's context, or vice versa»), а не только `AX_READ_PER_MANIFEST`.

## Fixture

Изолированная песочница — git-репозиторий (`git init`), фикстура коммитится как baseline ДО
запуска флоу (`git add -A && git commit -m fixture-baseline`) — `AX_GIT_DIFF_SCAN` аудита читает
`git diff` относительно этого коммита, значит baseline обязателен. Ниже `<GENNADY_WORKTREE>` —
абсолютный путь к worktree gennady, который выдаёт оркестратор (тот же, что и для прямого вызова
бинарей из его `node_modules/.bin/`); подставить его дословно, без переноса в другой чекаут, во
все места, где он встречается — `package.json` (`test`/`test:coverage`/`lint`/`yagni`/`format`
scripts), `tsconfig.json` (`typeRoots`) и ссылки `Rules:` тикета.

**Проверено живьём во времянке** (`node` v22.19.0, `tsx@4.21.0`, `typescript` из
`<GENNADY_WORKTREE>/node_modules`): `node --import <bin-shim>` (CLI-обёртка тsx, например
`node_modules/.bin/tsx`) резолвится как ESM-модуль, но процесс не завершается после того, как
`node:test` допечатал `ok`-строки — зависание без exit (наблюдалось: 120s таймаут, процесс убит
вручную). Рабочая форма — `--import` на сам ESM-загрузчик пакета,
`node_modules/tsx/dist/loader.mjs`, — тесты и coverage-прогон завершаются штатно (`exit=0`).

`package.json`:

```json
{
  "name": "demo-project",
  "version": "0.1.0",
  "devDependencies": {
    "c8": "^12.0.0"
  },
  "scripts": {
    "typecheck": "<GENNADY_WORKTREE>/node_modules/.bin/tsc --noEmit",
    "test": "node --import <GENNADY_WORKTREE>/node_modules/tsx/dist/loader.mjs --test src/app/greeting/*.test.ts",
    "test:coverage": "node --test --import <GENNADY_WORKTREE>/node_modules/tsx/dist/loader.mjs src/app/greeting/*.test.ts",
    "lint": "<GENNADY_WORKTREE>/node_modules/.bin/tsx <GENNADY_WORKTREE>/cli/gennady.ts lint .",
    "yagni": "<GENNADY_WORKTREE>/node_modules/.bin/tsx <GENNADY_WORKTREE>/cli/gennady.ts yagni .",
    "format": "<GENNADY_WORKTREE>/node_modules/.bin/prettier --check ."
  }
}
```

`lint` дословно вызывает `gennady lint .` — не `lint --all .`: у CLI (проверено `gennady lint
--help` во времянке) нет флага `--all`, `--all` — `ERR_CLI_LINT_UNKNOWN_FLAG`. `lint` вызывается
через репо-относительный `node_modules/.bin/tsx`, не через `npx tsx` (`npx` резолвит `tsx` из PATH
или ставит его заново — не гарантирует ту же версию, что закреплена в worktree). `yagni` добавлен
как npm-скрипт с тем же репо-относительным вызовом — устойчив к тому, вызывает ли audit-роль
`npm run yagni` или напрямую `gennady yagni` (обе формы бьют в тот же CLI).

<!-- sync: проверено живьём — `gennady testcov --run --min=80` читает `coverage-final.json`
(Istanbul JSON), которого `node --test --experimental-test-coverage` НЕ производит
(`ERR NATIVE_COVERAGE_UNSUPPORTED`, `cli/cmd/testcov/testcov.cmd.ts`). Рабочая пара, повторяющая
паттерн реального `package.json` этого репо: `devDependencies.c8` присутствует, и `test:coverage`
пишет `--test` СРАЗУ после `node` (до `--import`) — `testcov`'s `detectRunners()` матчит скрипт
регэкспом `/\bnode\s+--test\b/` (не матчит `test`-скрипт этой же фикстуры, где `--import` стоит
первым), затем сам оборачивает найденный скрипт в `npx c8 --reporter=json npm run test:coverage`.
Живой прогон: `exit=0`, `line coverage 100.0% (15/15 statements) — required ≥80% ✅`. -->

<!-- sync: `.prettierignore` обязателен — `test:coverage`/`testcov --run` пишет `coverage/`
(включая `coverage/tmp/*.json` от c8) прямо в корень фикстуры; без игнора `npm run format` /
`gennady lint`'s `prettier --check .` находит "неформатированные" сгенерированные JSON-файлы,
что и было причиной, по которой воркер в предыдущих прогонах порывался `prettier --write` по
всему baseline. -->

`.prettierignore`:

```
coverage/
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "typeRoots": ["<GENNADY_WORKTREE>/node_modules/@types"],
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
```

<!-- sync: `typeRoots` предварительно разбит на несколько строк — с ПОДСТАВЛЕННЫМ реальным
абсолютным путём worktree (не коротким плейсхолдером) одна строка `"typeRoots": ["<путь>/node_modules/@types"]`
превышает print-width prettier (`80`), и `prettier --check .` находит "неформатированность" уже
на baseline — то, из-за чего воркер решает, что нужен `prettier --write` по всему проекту, а не
только по своим Target Files. Проверено живьём: `prettier <tsconfig.json>` с реальным путём
воркера даёт именно эту многострочную форму. -->

Три добавленных поля — все проверены живьём во времянке против фикстурных `.ts`-файлов
(`greeter.port.ts` / `echo-greeter.adapter.ts` / `echo-greeter.adapter.test.ts` с `import ... from
'./x.ts'` и `import { test } from 'node:test'`): без `allowImportingTsExtensions` — `TS5097` на
`.ts`-импортах; без типов для `node:test`/`node:assert` — `TS2307 Cannot find module 'node:test'`
(проект не тянет `@types/node` автоматически — в фикстуре нет собственного `node_modules`); голое
`"types": []` глушит и то, что нужно — держит `TS2307`, поэтому решение по факту прогона — `"types":
["node"]` + `typeRoots`, указывающий на `@types` внутри `<GENNADY_WORKTREE>/node_modules` (фикстура
своих `@types` не имеет). С этими тремя полями `tsc --noEmit` на файлах P1/P2 — `exit=0`.

`.prettierrc.json`: `{ "semi": true, "singleQuote": true }`

`node_modules/.bin/gennady` — рабочий шим, НЕ пустой файл (пустой стаб был дефектом предыдущих
прогонов S1/S6/S7: `sdd-verify --profile code` теперь зовёт `npx gennady yagni .`, которое резолвит
именно этот бинарь — пустой невыполняемый файл давал `exit=126`; проверено живьём — с шимом ниже
`npx gennady yagni .` из фикстуры даёт `exit=0`). Файл создаётся исполняемым (`chmod +x
node_modules/.bin/gennady` — отдельный шаг рецепта сразу после записи файла):

```sh
#!/bin/sh
exec "<GENNADY_WORKTREE>/node_modules/.bin/tsx" "<GENNADY_WORKTREE>/cli/gennady.ts" "$@"
```

`specs/README.md`:

````markdown
# demo-project

## Vision

Сервис приветствий.

## Scope Graph

```mermaid
graph TD
  app --> infra-base
```

## Scopes

| Scope                                           | Type           | Spec | Description                   |
| ----------------------------------------------- | -------------- | ---- | ----------------------------- |
| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅   | TS + node:test + gennady lint |
| [`app`](./app/app.spec.md)                      | product        | ✅   | Сервис приветствий            |
````

`specs/app/app.spec.md`:

````markdown
# Scope: app

<!--SECTION:VISION-->

## Vision

Приветствие пользователя по имени.

<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->

## Overview

```mermaid
flowchart LR
  caller -->|greet name| core
```

<!--/SECTION:OVERVIEW-->

<!--SECTION:RULES-->

## Rules

Нет scope-специфичных правил сверх cascade инфры.

<!--/SECTION:RULES-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->

## Bootstrap Requirements

| Requirement                              | Kind | Owner           | Resolution         |
| ---------------------------------------- | ---- | --------------- | ------------------ |
| Нет внешних зависимостей сверх toolchain | —    | this-scope-task | нечего бутстрапить |

<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->

## Handoff

Единственный модуль — `greeting`. См. `specs/app/greeting/greeting.spec.md`.

<!--/SECTION:HANDOFF-->
````

`specs/app/app.3-tasks.md`:

```markdown
# app — Tasks

## Cascade Table

| Tier         | Source                                       |
| ------------ | -------------------------------------------- |
| target-scope | specs/app/app.spec.md — Rules (нет активных) |

## Tracker Index

| Task-ID            | Title                | Dependencies | Status   | Reopens |
| ------------------ | -------------------- | ------------ | -------- | ------- |
| APP-greet-greeting | Приветствие по имени | —            | [ ] TODO | —       |
```

`specs/app/greeting/greeting.spec.md`:

````markdown
# Module: greeting

<!--SECTION:MODULE_VISION-->

## Module Vision

Формирует приветствие по имени. Родительский scope: `../../app.spec.md`.

<!--/SECTION:MODULE_VISION-->

<!--SECTION:OVERVIEW-->

## Overview

```mermaid
flowchart LR
  caller -->|greet name| GreeterPort
  GreeterPort --> EchoGreeterAdapter
```

<!--/SECTION:OVERVIEW-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## Module Usage Example

```typescript
const greeter: GreeterPort = new EchoGreeterAdapter();
greeter.greet('Alice'); // 'Привет, Alice!'
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## Inter-Module Dependencies

- **Depends on:** нет (единственный модуль)
- **Provides to:** нет

<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:ENTITY_INVENTORY-->

## Entity Inventory

_Это полный список сущностей модуля. Любое введение сущности execution-агентом помимо этого списка считается drift'ом и требует обновления spec._

| Name                 | Type    | Purpose                                                   |
| -------------------- | ------- | --------------------------------------------------------- |
| `GreeterPort`        | Port    | Абстракция формирования приветствия по имени              |
| `EchoGreeterAdapter` | Adapter | Реализация GreeterPort — синхронное форматирование строки |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## Module Contracts

#### Port: `GreeterPort`

- **Purpose:** Формирует приветственную строку по имени.
- **Consumers:** internal: `src/app/greeting/echo-greeter.adapter.ts`
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None

**Contract (DbC):**

- Preconditions:
  - `name` — непустая строка после `trim()`
- Postconditions:
  - результат содержит `name` и начинается с «Привет, »
- Invariants:
  - вызов не имеет побочных эффектов

#### Adapter: `EchoGreeterAdapter`

- **Implements:** `GreeterPort` (`src/app/greeting/greeter.port.ts`)
- **Purpose:** Синхронно форматирует строку приветствия.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None

**Side Effects:**

- нет — чистая функция

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:FILE_STRUCTURE-->

## File Structure

```
src/app/greeting/
├── greeter.port.ts
├── echo-greeter.adapter.ts
└── echo-greeter.adapter.test.ts
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:HANDOFF-->

## Handoff to Tasks

- **Implementation files to be created:** `greeter.port.ts`, `echo-greeter.adapter.ts`
- **Test files to be created:** `echo-greeter.adapter.test.ts`
- **Stack dependencies:**
  - Language: `typescript`
  - Test framework: `node:test`
- **Module Rules Additions:** None

<!--/SECTION:HANDOFF-->
````

`specs/app/greeting/greeting.3-tasks.md`:

````markdown
# greeting — Tasks

## Tracker Index

| Task-ID            | Title                | Dependencies | Status   | Reopens |
| ------------------ | -------------------- | ------------ | -------- | ------- |
| APP-greet-greeting | Приветствие по имени | —            | [ ] TODO | —       |

## Slug Registry

- greet-greeting

## Intra-Module DAG

```mermaid
graph TD
  A[greet-greeting]
```

## Decision Log (module-task level)

Нет.

## Conventions

Project-wide conventions declared once in `specs/3-tasks.md`.
````

`specs/3-tasks.md`:

```markdown
# Project — Tasks

## Scopes

<!-- sync: канон — PROJECT_INDEX_SKELETON (shared/sdd/templates.ts) даёт заголовки `Index`/`Tasks`/`Done` (ссылка в `Index`, общее число в `Tasks`, отношение в `Done`); прежняя фикстура смешивала ссылку под `Tasks` и отношение под `Progress` без отдельной колонки-счётчика — findRollupHeader (shared/sdd/tracker.ts) теперь принимает `Progress` как алиас колонки-отношения, но всё равно требует отдельную колонку-ссылку `Index`, так что фикстура приведена к канону, а не наоборот. -->

| Scope | Type    | Index                           | Tasks | Done |
| ----- | ------- | ------------------------------- | ----- | ---- |
| app   | product | [3-tasks](./app/app.3-tasks.md) | 1     | 0/1  |

## Conventions

Execution-Log token vocabulary: `intro` / `yagni` / `decision` / `tried` / `discovery` / `insight` /
`verified` / `ver` / `DONE`. Baseline Completion Rule: `sdd-verify --profile <kind>` + ticket §5
commands green. Audit/code-review hook: per-group, mandatory once the group's last ticket closes
(`AX_AUDIT_HOOK`). File header: `@file` / `@consumers`
/ `@tasks`.
```

Готовый тикет — `specs/app/greeting/greeting.task.APP-greet-greeting.md` (Status `[ ] TODO`,
Execution Log пуст — ни одна фаза ещё не запускалась, ни один Target File фаз P1/P2 ещё не
существует — `src/app/greeting/` пуст). Единственный файл, уже существующий под `src/` на baseline —
ambient-плейсхолдер `src/scaffold.d.ts` (не Target File никакой фазы, не сущность Entity Inventory):

```typescript
// @file: src/scaffold.d.ts
// @consumers: none — ambient placeholder, keeps `tsc --noEmit` from TS18003 while src/ has no Target Files yet
```

Без него `tsc --noEmit` (через `"include": ["src"]` при пустом `src/`) падает `TS18003: No inputs
were found` — проверено живьём (`exit=2`) на этой самой фикстуре до того, как файл был добавлен;
`sdd-verify --profile code` соответственно уходил в 1 FAILED (`typecheck`) на нетронутом baseline.
Файл коммитится как часть baseline вместе со всем остальным.

`specs/app/greeting/greeting.task.APP-greet-greeting.md`:

```markdown
# Task: APP-greet-greeting — Приветствие по имени

<!--SECTION:META-->

## Meta

- **Task-ID:** APP-greet-greeting
- **Status:** [ ] TODO
- **Purpose:** Сформировать приветствие по имени через GreeterPort/EchoGreeterAdapter
- **Scope:** app
- **Module:** greeting
- **Dependencies:** None
- **Spec References:**
  - Contract: [GreeterPort](../greeting/greeting.spec.md#module-contracts)
  - Adapter: [EchoGreeterAdapter](../greeting/greeting.spec.md#module-contracts)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Создать `GreeterPort` и `EchoGreeterAdapter` (метод `greet(name: string): string`).
- **Rules:**
  - [ai/directives/coding/typescript-rules.xml](<GENNADY_WORKTREE>/ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - src/app/greeting/greeter.port.ts
  - src/app/greeting/echo-greeter.adapter.ts
- **Inputs:** none
- **Exit:** `tsc --noEmit` проходит; `EchoGreeterAdapter` присваивается типу `GreeterPort`.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Покрыть тестами BDD-сценарии (unit + contract typing).
- **Rules:**
  - [ai/directives/testing/node-test.xml](<GENNADY_WORKTREE>/ai/directives/testing/node-test.xml)
- **Target Files:**
  - src/app/greeting/echo-greeter.adapter.test.ts
- **Inputs:** P1 handoff
- **Exit:** `node --test` — все 3 сценария зелёные.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## Acceptance Criteria (BDD)

**Feature:** EchoGreeterAdapter формирует приветствие по имени

**Scenario:** greets a non-empty name [`unit`] [APP-REQ-1]

- **Given** имя "Alice"
- **When** вызван `greet(name)`
- **Then** возвращена строка "Привет, Alice!"

**Scenario:** rejects an empty name [`unit`] [APP-REQ-1]

- **Given** пустая строка ""
- **When** вызван `greet(name)`
- **And** выбрасывается ошибка

**Scenario:** EchoGreeterAdapter satisfies GreeterPort [`contract`] [APP-REQ-1]

- **Given** экспортированный экземпляр `EchoGreeterAdapter`
- **When** он присвоен переменной типа `GreeterPort`
- **Then** TypeScript принимает присвоение на этапе компиляции

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## Verification

| Command                 | Required by                               |
| ----------------------- | ----------------------------------------- |
| `npm run typecheck`     | ai/directives/coding/typescript-rules.xml |
| `npm run test`          | ai/directives/testing/node-test.xml       |
| `npm run test:coverage` | ai/directives/testing/node-test.xml       |
| `npm run lint`          | ai/directives/coding/typescript-rules.xml |
| `npm run format`        | ai/directives/coding/typescript-rules.xml |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## Test Scenario Coverage

- Scenario greets a non-empty name → `src/app/greeting/echo-greeter.adapter.test.ts` :: `greets a non-empty name`
- Scenario rejects an empty name → `src/app/greeting/echo-greeter.adapter.test.ts` :: `rejects an empty name`
- Scenario EchoGreeterAdapter satisfies GreeterPort → `src/app/greeting/echo-greeter.adapter.test.ts` :: `EchoGreeterAdapter satisfies GreeterPort`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## Execution Log

<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:DECISION_LOG-->

## Decision Log

<!--/SECTION:DECISION_LOG-->
```

## Entry

Скилл: `/sdd-execute`. Первая реплика оператора:

> Выполни APP-greet-greeting.

## Operator Script

`execute` — автономный контур (`AX_AUDIT_HOOK`: audit + code-review запускаются по вердикту `sdd-task
--audit-group` — оператор их не вызывает вручную); в
штатном прогоне этой фикстуры нет ни одной обязательной остановки к оператору — ни `H_*`, ни
`## Stop` карты. Скрипт держит ОДИН запасной ответ на случай непредвиденной паузы:

1. Если агент всё же остановится и спросит оператора (например, `H_PAUSED_AWAITING_OPERATOR` из-за
   расхождения, которого фикстура не должна провоцировать) — ответ: «продолжай, блокера нет,
   перепроверь и продолжи выполнение». Это НЕ ожидаемый путь — попадание в этот ответ само по себе
   находка для Verifier (см. «Импровизации» в `PROTOCOL.md`), а не штатная ветка карты.

## Stop

Сразу после того, как code-review вернул `CLEAN` (STEP*7B_CODE_REVIEW) и orchestrator показал
финальный `EXECUTE_SUMMARY_FORMAT` (STEP_8_SUMMARY). Прогон НЕ уходит дальше — возврат управления
оператору после summary уже не часть сценария. Трейс заканчивается строкой
`stop: per-map — <это условие дословно>` (не `halt:` — остановка по карте, не директивный
`H*\*`-гейт).

## Checkpoints

1.  STEP_0_RESOLVE: первый вызов — `sdd-task` БЕЗ Task-ID, за детерминированной картой исполнения —
    «FIRST run `sdd-task` (no Task-ID) for the deterministic execution map — the pickable set
    ... and the blocked tickets» — до этого нет ни одного `tool:` с конкретным `sdd-task
APP-greet-greeting`.
2.  `LogicSwitch on="intent"` в STEP_0_RESOLVE сработал по ветке «WHEN intent is a specific Task-ID /
    ticket path -> run that ticket (STEP_1–8)» — оператор назвал конкретный Task-ID, значит НЕ
    ветка `next`/`pick`, НЕ `batch`/`all`/`queue`.
3.  STEP_1_PLAN: единственное чтение тикета НА РОЛИ `orchestrator` до диспетча P1 — `sdd-task
APP-greet-greeting` без `--phase` («one tool call, no broad ticket read»), возвращающее Meta +
    Phases Overview + per-phase read-manifests + gates + `[BLOCKERS]`; preflight blocker scan
    читается прямо из секции `[BLOCKERS]` этого же вызова (`blockers: none` → clear,
    `AX_BLOCKER_RESOLUTION_TRAIL`) — БЕЗ отдельного вызова `sdd-check --task` на этом шаге (явно
    запрещён директивой как потраченный ход); Round открыт через `sdd-log` — есть ровно ОДНА
    `tool:`-строка с `sdd-task APP-greet-greeting` (без `--phase`) ДО диспетча P1, и НЕТ отдельной
    `tool: sdd-check --task ...` строки между ней и диспетчем P1. Состояние по Phases Overview — все
    `[ ]` → «fresh (all phases by `Deps`)», не resume/audit-only/pause.
    <!-- sync: execute.directive.xml STEP_2_DISPATCH no longer pastes the phase's read-manifest into
    the worker prompt — the dispatch activation is now the fixed 3-line template (directive path ·
    ticket+phase · "run `sdd-task --phase` and follow its output"), and the worker itself calls
    `sdd-task APP-greet-greeting --phase P1` as ITS OWN first action, on the `worker P1` role, AFTER
    this checkpoint's orchestrator-role call. That later call (checkpoint 4b) is a SEPARATE,
    expected `tool:` line on a different role — it does not violate "ровно ОДНА" above, which scopes
    strictly to calls made under `role=orchestrator` before dispatch. --> A `tool: sdd-task
    APP-greet-greeting --phase P1`line appearing on`role=orchestrator`here (instead of on`role=worker P1`at checkpoint 4b) — the orchestrator itself running the phase-scoped call — is
    itself a finding: STEP_1_PLAN's own call never takes`--phase`.
4.  Смена роли на worker перед P1 зафиксирована строкой `note: role=worker P1` (или аналогичной,
    дословно называющей роль и фазу), и загрузка `ai/directives/sdd-v2/phase-execution-protocol.directive.xml`
    отражена строкой `directive: ... loaded` — per Mission phase-execution-protocol: «A worker
    directive — runs in isolation on a cheaper model». Обе строки ОБЯЗАТЕЛЬНЫ и раздельны: `note:
role=...` без последующей `directive: ... loaded` для той же роли, или наоборот, — сам по себе FAIL
    этого чекпоинта, независимо от того, читал ли исполнитель директиву по существу (это был
    повторяющийся провал исполнителя в предыдущих прогонах — Verifier проверяет присутствие СТРОКИ, а
    не намерение). Диспетч-промпт, который читает эта роль, — ТОЛЬКО фиксированный 3-строчный шаблон
    STEP_2_DISPATCH (путь к директиве · тикет+фаза · «выполни `sdd-task --phase` и следуй выводу»),
    без пересказанного read-манифеста, Rules, Target Files или gates от оркестратора — их пересказ
    здесь (`tool:`-цитата, вставленная в промпт диспетча, а не сделанная воркером самостоятельно на
    его роли) — находка (устаревший, wave-1 путь диспетча). Per `AX_WORKER_SESSION_REUSE`: P1 — первая
    фаза вида `impl` в этой спеке, значит сессия под ключ (спека, `impl`) в любом случае поднимается
    заново (нечего переиспользовать) — отсутствие в трейсе строки про поиск/переиспользование
    существующей сессии здесь НЕ находка, это ожидаемое поведение для первой фазы своего вида;
    сообщение диспетча остаётся тем же 3-строчным шаблоном независимо от того, новая это сессия или
    продолженная — сам шаблон не несёт различия «new vs continued».
    4b. Первое действие роли `worker P1` ПОСЛЕ `directive: ... loaded` (чекпоинт 4) — `tool: sdd-task
    APP-greet-greeting --phase P1` (`phase-execution-protocol.directive.xml` STEP_1_GET_PHASE_CONTEXT:
    «Run `npx gennady sdd-task <ticket> --phase <PhaseID>`... FIRST action»). Его вывод — objective ·
    gates (с satisfy-hint) · exit · phase-scoped read-manifest · `[HANDOFF]` (пусто для P1, первая
    фаза) — и есть весь контекст P1; отсутствие этого вызова, или чтение Meta/Phases Overview/другого
    вместо него как первого действия — FAIL. Затем — STEP_1B_RESUME_OR_START: `tool: sdd-extract
    APP-greet-greeting EXECUTION_LOG` для проверки, нет ли уже открытого (без `DONE`+Handoff) блока
    `#### P1` в текущем Round от прерванной попытки; в этом (первом, безошибочном) прогоне блока нет
    → «fresh start» → `tool: sdd-log APP-greet-greeting phase P1` пишет заголовок фазы. Появление
    ветки resume (пропуск повторного `sdd-log phase P1`, продолжение с места обрыва) здесь было бы
    находкой — эта фикстура не создаёт прерванных попыток.
5.  Worker P1 читает СТРОГО по манифесту фазы, полученному ИЗ ЕГО СОБСТВЕННОГО вызова `sdd-task
APP-greet-greeting --phase P1` (чекпоинт 4b), не из чужой цитаты в промпте диспетча
    (`AX_READ_PER_MANIFEST`: «read EXACTLY that, nothing beyond it») — в трейсе нет чтения секций
    тикета за пределами того, что этот вызов вернул (P1-объектив/gates/exit/manifest) до момента,
    когда P1 обращается к ним по манифесту; нет чтения `PHASE_P2` до его собственного диспетча.
6.  STEP_2_NARROW_RECON (P1): recon-строка появляется в трейсе ТОЛЬКО если есть расхождение
    (`AX_NARROW_RECON`: «log a recon line ONLY on divergence; when state matches the plan, stay
    silent») — поскольку `src/app/greeting/` пуст и это ожидаемо (Target Files ещё не существуют,
    так и заявлено манифестом P1), молчание — норма, не находка.
7.  P1 открывает ТОЛЬКО правило, перечисленное в его собственном `Rules:` — `typescript-rules.xml`
    (`AX_RULES_LOAD_FROM_PHASE_BLOCK`: «Open ONLY rule files listed under this phase's `Rules:` bullet
    list»); `node-test.xml` (правило фазы P2) не загружается на P1.
8.  P1 пишет ТОЛЬКО `src/app/greeting/greeter.port.ts` и `echo-greeter.adapter.ts` (`AX_PHASE_SCOPE_LOCK`:
    «Touch only this phase's `Target Files`»; `H_OUT_OF_PHASE_WRITE` не сработал) — нет `write:` под
    `echo-greeter.adapter.test.ts` на P1.
9.  Оба новых файла P1 получают заголовок `@file` / `@consumers` / `@tasks: APP-greet-greeting`
    (`AX_FILE_HEADER_APPEND_ONLY`: «New file: create header with all three»).
10. <!-- sync: profile `code` includes the yagni gate (phase-execution-protocol.directive.xml STEP_5: "`code` (format · lint · typecheck · yagni — a code phase skips tests, but still runs the yagni gate since it is a code-diff check, not a test run)") — a `ver sdd-verify --profile code` line on P1 that omits an implicit yagni pass is stale against this wording, even though yagni has no separate `ver`-line of its own (it runs INSIDE the `sdd-verify` gate, not as a §5 command). --> P1 STEP_5_VERIFY: сначала `sdd-verify --profile code` (per Phase-execution `AX_VERIFICATION_BEFORE_HANDOFF`
            / STEP_5: «Profile by phase kind: `impl` / ... → `code` (format · lint · typecheck · yagni — a
            code phase skips tests, but still runs the yagni gate since it is a code-diff check, not a test
            run)»), затем `gennady lint --spec=specs/app/greeting/greeting.spec.md <Target Files>`, ЗАТЕМ
            каждая команда §5 **verbatim** — точная строка из тикета (`npm run typecheck`, `npm run lint`,
            `npm run format`), с логом `ver <cmd> → pass exit=<N>` per `AX_VERIFICATION_BEFORE_HANDOFF`: «the
            log line `ver <cmd>` MUST be the exact string of the command that was actually executed». `npm run
        test`/`npm run test:coverage`НЕ входят в P1-профиль`code`(«a code phase skips tests») —
    отсутствие их`ver`-строк на P1 — ожидаемо, не находка.
11. P1 закрывается `**Handoff →** artifacts: [...]; decisions: [...]; open: [...]` (`AX_HANDOFF_TYPED`
    / `HANDOFF_FORMAT`) — свободная проза вместо типизированной строки запрещена; Phases Overview
    `[ ]` → `[x]` для P1 (`AX_TICKET_WRITE_SCOPE`: «`Phases Overview` Status column for THIS phase ID
    only»).
12. STEP_2_DISPATCH ветка `LogicSwitch on="worker Handoff status"` — P1 вернул `DONE` → «record
    Handoff, thread it into the next phase's Inputs» — P2 диспетчится ТОЛЬКО после появления P1
    Handoff в текущем Round (`AX_EXECUTION_ORDER`: «a phase starts only after every phase it depends
    on reaches `[x] DONE`»; `H_INPUT_HANDOFF_MISSING` не сработал), Inputs P2 = P1 Handoff verbatim.
    Диспетч-промпт P2 остаётся тем же фиксированным 3-строчным шаблоном (чекпоинт 4) — P1 Handoff НЕ
    пересказывается туда оркестратором построчно; воркер P2 получает его сам, verbatim, в блоке
    `[HANDOFF]` собственного вызова `tool: sdd-task APP-greet-greeting --phase P2` (первое действие
    роли `worker P2`, тот же чекпоинт 4b, применённый к P2) — отсутствие `[HANDOFF]` там при наличии
    P1 `DONE` было бы `H_INPUT_HANDOFF_MISSING`. Per `AX_WORKER_SESSION_REUSE`: P2 — вид `test`,
    ДРУГОЙ ключ сессии, чем у P1 (`impl`) — эта фаза ВСЕГДА поднимает свою, отдельную от P1, сессию
    (первую для ключа (спека, `test`)), никогда не продолжает сессию P1; появление в трейсе
    какого-либо переиспользования P1-сессии для P2 (или утечки контекста P1 в P2 сверх явно
    переданного `[HANDOFF]`) — находка (нарушение «different kinds ALWAYS get different sessions —
    no peeking»).
13. P2 STEP_5_VERIFY: сначала `sdd-verify --profile test` (STEP_5: «`test` → `test` (format ·
    typecheck · test:coverage)») — это внутренний авто-профиль `sdd-verify`, отдельный от §5 и не
    логируется построчно как `ver <cmd>`. Затем §5-команды **verbatim**, но НЕ все пять и не «четыре
    покрывающие профиль» — per `AX_VERIFICATION_BEFORE_HANDOFF`: «Each command from ticket §5
    Verification whose `Required by` rules overlap with this phase's `Rules`». P2's `Rules:` — только
    `node-test.xml`. Пересечение с колонкой `Required by` таблицы §5 даёт РОВНО ДВЕ команды: `npm run
test` и `npm run test:coverage` (обе `Required by: node-test.xml`). `npm run typecheck` и `npm run
format` — `Required by: typescript-rules.xml`, вне `Rules:` этой фазы — их `ver`-строки принадлежат
    P1 (чекпоинт 10), не P2; появление здесь `ver npm run typecheck` или `ver npm run format` на роли
    worker P2 — находка (не покрыто `Rules:` этой фазы, дублирование гейта чужой фазы). `npm run
lint` также не входит (P2 — `test`-kind, не покрыт ни профилем, ни `Rules:`). `AX_BDD_NAME_DISCIPLINE`:
    канонические имена сценариев из Test Scenario Coverage использованы verbatim как имена test-кейсов
    (`greets a non-empty name`, `rejects an empty name`, `EchoGreeterAdapter satisfies GreeterPort`).
14. STEP_3_CLOSE_ROUND: `sdd-log` вызван для Round close (`ROUND_CLOSE_FORMAT`), Meta Status →
    `[x] DONE` — обе строки после P2 `DONE`, не раньше.
15. STEP_4_SYNC: `tool: sdd-sync APP-greet-greeting` — «updates the scope + project trackers and
    verifies the write».
16. STEP_5_AUDIT — на роли `orchestrator`, СРАЗУ после `sdd-sync` (чекпоинт 15): `tool: sdd-task
--audit-group APP-greet-greeting` — вердикт инструмента, не догадка исполнителя
    (`AX_AUDIT_HOOK`: «`sdd-task --audit-group <id>` returns `due` once every ticket in the group is
    `[x] DONE`»). Эта спека несёт РОВНО один тикет (`specs/app/app.3-tasks.md` Tracker Index — одна
    строка), значит его закрытие само закрывает группу — ожидаемый вердикт `due` (`1/1` закрыто), НЕ
    `not yet`. Появление здесь `not yet` при единственном тикете спеки, уже `[x] DONE`, — само по себе
    находка (инструмент солгал или неверно посчитал группу). Только ПОСЛЕ строки с вердиктом `due`
    следует смена роли `note: role=orchestrator` → `note: role=audit-subagent`; диспетч произошёл БЕЗ
    вопроса оператору (`AX_AUDIT_HOOK`: audit — на вердикте инструмента, не на ручном вызове
    оператора) — в трейсе между вердиктом `due` и появлением `directive:
ai/directives/sdd-v2/audit.directive.xml loaded` нет ни одной строки `operator:`/`ask:`. Обе строки
    — `note: role=audit-subagent` И `directive: ... loaded` — обязательны и раздельны (см. чекпоинт 4);
    отсутствие любой из них — FAIL сам по себе, это тот же класс пропуска, что исполнитель ранее
    допускал на этой роли. Диспетч-промпт называет ГРУППУ (id `APP-greet-greeting`, mode=per-group), но
    не пересказывает Target Files/диф/артефакты построчно — та же self-bootstrap дисциплина, что и у
    диспетча фазы (чекпоинт 4b): их резолвит сам audit-subagent на своей роли (чекпоинт 17).
17. Первое действие роли `audit-subagent` (`STEP_1_MECHANICAL`, `AX_GIT_DIFF_SCAN`) — `tool: sdd-task
--group-scope APP-greet-greeting`: возвращает spec, список тикетов группы (один — сам тикет),
    объединение `Target Files`, git-дифф над этим объединением (либо честную строку об отсутствии
    git-ссылок), объединение Handoff-артефактов — эта строка ПЕРЕД `sdd-check --task <ticket-path>`, не
    после и не вместо неё. Ручной `git diff`/`git log` на этой роли ДЛЯ ПОСТРОЕНИЯ ОБЛАСТИ — находка
    (`AX_GIT_DIFF_SCAN`: «hand-run git archaeology is never the way to build it»); область — только из
    вывода `--group-scope`. Затем `sdd-check --task <ticket-path>` взят «as given», ЗАТЕМ независимый
    повторный прогон гейта — «INDEPENDENTLY re-run the green gate — `sdd-verify --profile full`,
    `gennady lint --spec=<module-spec>` ..., and `gennady testcov --run --min=80`» — все три вызова
    есть как отдельные `tool:`-строки на audit-роли, а не переиспользование `ver`-строк, логированных
    воркерами P1/P2 (`AX_MECHANICAL_VIA_SDD_CHECK` / STEP_1_MECHANICAL: «Always re-derive the gate
    yourself rather than trust the worker's logged `ver` lines»).
18. Audit STEP_2_SEMANTIC: closed-world sweep выполнен ПЕРВЫМ (`AX_CLOSED_WORLD_PRIMARY_CHECK` /
    STEP_2: «Run the closed-world inventory sweep FIRST») — сверка `GreeterPort` + `EchoGreeterAdapter`
    против Entity Inventory находит их присутствующими (нет `CLOSED_WORLD_DRIFT`, оба объявлены
    заранее — не через `intro`-строку).
19. Вердикт аудита `PASS` (или `PASS_WITH_ACKNOWLEDGED_RISKS`) → `LogicSwitch on="group audit verdict +
attempt"` в STEP_6_BRANCH сработал по ветке «-> STEP_7B_CODE_REVIEW» — НЕ `STEP_7_RESOLVE` (нет
    повторного Round `fix`, нет второго вызова audit R2 в трейсе).
20. STEP_7B_CODE_REVIEW диспетчится «lazy, same trigger as audit — right after it passes» — на ГРУППУ,
    тем же id, что и аудит (`AX_AUDIT_HOOK`: «`due` → dispatch the group audit, then, once it passes, the
    group code-review»); смена роли `note: role=code-review-subagent` появляется ПОСЛЕ строки с
    вердиктом audit `PASS`, не до неё; загрузка `ai/directives/sdd-v2/code-review.directive.xml`
    отражена `directive: ... loaded`. Как и на предыдущих сменах роли (чекпоинты 4, 16) — `note:
role=...` и `directive: ... loaded` обе обязательны и раздельны; пропуск любой из двух строк — FAIL.
21. Первое действие роли `code-review-subagent` (`STEP_1_READ_DIFF`, `AX_GIT_DIFF_SCAN`) — `tool:
sdd-task --group-scope APP-greet-greeting`: та же tool-строка, что audit вызвал на своей роли
    (чекпоинт 17, независимый повторный вызов — каждая роль резолвит область сама, не переиспользует
    чужой вывод), а не весь тикет с нуля. Ручной `tool: git diff` на этой роли — находка (устаревший,
    pre-group-scope путь: `AX_GIT_DIFF_SCAN` запрещает hand-run git archaeology, `sdd-task
--group-scope` — единственный источник диффа и для code-review тоже).
22. Вердикт code-review `CLEAN` → «`CLEAN` → STEP_8» (не `H_CODE_REVIEW_BLOCKER`, поскольку в
    фикстуре нет умышленного бага) — в трейсе нет строки `halt: H_CODE_REVIEW_BLOCKER`.
23. STEP_8_SUMMARY показан оператору как `EXECUTE_SUMMARY_FORMAT` — трейс содержит `show:`-строку,
    перечисляющую состав итога (Round-таблица фаз, вердикт audit, вердикт финальный, файлы,
    проблемы) — без неё этот чекпоинт непроверяем.
    <!-- sync: execute.directive.xml STEP_8_SUMMARY now also collects every worker Handoff
    `deviations:` entry (+ any the orchestrator self-resolved directly) across the whole cycle,
    per `AX_DEVIATION_SELF_RESOLVE`, and raises them as ONE batched `AskUserQuestion` after the
    summary — but only when that set is non-empty. --> Ни P1, ни P2 не самостоятельно решают за
    оператора вопрос, которого спека/тикет не покрывает (фикстура заранее полная — Meta/Rules/BDD
    покрывают весь Objective обеих фаз), значит собранный на STEP_8 набор `deviations:` — пустой:
    ни в одном Handoff (`**Handoff →** ...`) нет непустого поля `deviations:`, и после `show:`-строки
    итога НЕТ строки `ask:`/`AskUserQuestion` про «внести в спеку / откатить / принять как есть» —
    появление такого batched-вопроса здесь, при пустом наборе deviations, само по себе находка
    (спрашивает, когда нечего спрашивать). Per `AX_WORKER_SESSION_REUSE`: группа этой спеки
    закрывается ИМЕННО в этом цикле (audit `PASS` на попытке 1 → code-review `CLEAN`, чекпоинты 19, 22) — обе worker-сессии этого прогона (`impl`-ключ P1, `test`-ключ P2) закрываются вместе с
    группой; трейс не обязан печатать отдельную строку про закрытие сессий (это состояние
    оркестратора между прогонами, не событие внутри ОДНОГО прогона S7), но если бы карта продолжалась
    диспетчем СЛЕДУЮЩЕЙ спеки в этом же трейсе, контекст P1/P2 не должен был бы туда перетечь — в
    рамках S7 (один тикет, одна спека, один цикл) эта ветка не наблюдаема напрямую и остаётся
    утверждением аксиомы, а не отдельно проверяемым чекпоинтом.
24. Ни разу не спутаны `halt:` и `stop:` — единственный `halt:` в этом прогоне мог быть только
    настоящим `H_*` из `execute.directive`/`phase-execution-protocol` (например
    `H_PAUSED_AWAITING_OPERATOR`), и в штатном (безошибочном) исполнении фикстуры такого `halt:` НЕТ
    вовсе — прогон закрывается единственной строкой `stop: per-map — ...` в самом конце, что
    отдельно подтверждает `AX_HALT_VS_FAIL_DISTINCTION`: «Halt is NOT failure ... A skill or phase
    that stops awaiting operator decision is in a PAUSED state, not a FAILED state» — в этой карте
    ни PAUSED, ни FAILED не должны возникнуть, раз фикстура собрана без блокеров. Эта посылка
    держится ТОЛЬКО потому, что фикстура сама исполнима: `test`/`test:coverage` через
    `tsx/dist/loader.mjs` не виснут (раздел Fixture, проверено живьём — `exit=0`), `tsconfig.json`
    компилирует P1/P2-файлы без `TS2307`/`TS5097` (тот же раздел), `lint`/`yagni` бьют в
    существующие флаги/подкоманды CLI. Раньше именно поломанная фикстура (зависающий `--import`,
    несуществующий `--all`, нерезолвящиеся типы `node:test`) была той средой, что провоцировала
    `H_VERIFICATION_FAIL` → `H_PAUSED_AWAITING_OPERATOR` независимо от качества исполнения. Теперь,
    когда все гейты фикстуры проходимы, PAUSED в этой карте — не «фикстура виновата», а находка про
    исполнителя или про сам `execute.directive`/`phase-execution-protocol` — фиксировать её как
    таковую, не списывать на среду.
25. Audit НЕ выдаёт `PASS` на красном или неисполнившемся гейте (`STEP_1_MECHANICAL`: «**PASS is
    never the verdict when any gate is red OR any gate did not execute**» — включая случай
    `ENVIRONMENT_GATE_UNAVAILABLE`, «neither PASS nor a failure to diagnose», требующий `FAIL` с
    пустым `phases_to_fix`, а не молчаливого пропуска гейта). В штатном прогоне этой (починенной)
    фикстуры все три независимых re-run гейта в STEP_1_MECHANICAL (`sdd-verify --profile full`,
    `gennady lint --spec=...`, `gennady testcov --run --min=80` — чекпоинт 17) реально исполняются и
    зелены — значит вердикт `PASS` в трейсе стоит НЕ потому, что аудит принял на веру `ver`-строки
    воркеров (запрещено тем же STEP_1_MECHANICAL: «Always re-derive the gate yourself rather than
    trust the worker's logged `ver` lines»), а потому что independent re-run сам вернул зелень.
    Отсутствие хотя бы одного из трёх `tool:`-вызовов re-run перед строкой с вердиктом `PASS` —
    находка (`AX_MECHANICAL_VIA_SDD_CHECK` нарушен, вердикт не обоснован).
26. <!-- sync: execute.directive.xml now names THREE narrow, non-overlapping orchestrator write
            channels, not two — (a) `AX_ENV_FIX_CHANNEL`, (b) `STEP_7_RESOLVE` Path B (administrative
            edits to ticket / Decision Log / spec waiver-labels, applying an ACCEPTED audit finding
            directly), and (c) a ticket-local Decision Log append when the orchestrator itself
            self-resolves a spec/ticket hole it hit directly, not delegated to a worker
            (`AX_DEVIATION_SELF_RESOLVE`) — distinct from (b), which is gated on an operator-accepted
            audit finding, while (c) fires on a gap the orchestrator decided on its own and reports
            only in the STEP_8 batch. NONE of the three fires in THIS trivial no-blocker fixture: (b)
            only exists on the FAIL+MAJOR+operator-accepted branch, which checkpoint 19 already
            establishes does not occur here (audit returns plain `PASS` on attempt 1); (c) only fires
            on a spec/ticket hole, and this fixture's Meta/Rules/BDD are fully specified for both
            phases — nothing for P1/P2 to self-resolve (checkpoint 23 already establishes the
            collected `deviations:` set is empty). So the verdict below is unchanged, but "the ONLY
            legitimate exception" (singular) or "РОВНО ДВА" (two) would itself read as stale against
            the current directive. --> Оркестратор ни в одной роли `orchestrator` не пишет код (`Target Files` любой
            фазы) и не правит `specs/**` — «The orchestrator does not write code or specs (`HardForbidden`)».
            Если в трейсе на роли `role=orchestrator` встречается `write:` строка — легитимны РОВНО ТРИ
            узких, невзаимоперекрывающихся канала: `AX_ENV_FIX_CHANNEL` (точечный фикс `package.json`-скрипта
            / конфига инструмента, никогда production-кода из `Target Files` и никогда `specs/**`, допустим
            ТОЛЬКО после явного `operator:`-одобрения конкретного диффа, за которым следует `<ts> env-fix
        <file> ← <operator decision ref>`строка в Execution Log); `STEP_7_RESOLVE`Path B (админ-правки
    тикета/Decision Log/waiver-меток спеки, применяющие уже принятую находку аудита — легален только
    на ветке`FAIL`+ только`MAJOR`-находки + оператор принял риск, см. `execute.directive.xml` STEP_6_BRANCH);
    и правка (c) — append-only Decision Log тикета при самостоятельном решении оркестратора по дыре
    спеки/тикета (`AX_DEVIATION_SELF_RESOLVE`), без предшествующего вопроса оператору, но с обязательной
    записью в собранный на STEP_8 batch. В штатном (безошибочном) прогоне этой фикстуры НИ ОДИН из трёх каналов не должен
    сработать (фикстура уже исправна — см. чекпоинт 24 — вердикт аудита`PASS`с первой попытки —
    см. чекпоинт 19, так что ветка Path B недостижима — и фикстура полностью специфицирована, так что
    канал (c) тоже недостижим, см. чекпоинт 23) — появление`env-fix`, админ-правки
    тикета/спеки или самостоятельной Decision-Log-записи здесь без предшествующего легитимного триггера — находка; появление ЛЮБОГО`write:` на роли`orchestrator` без одного из этих трёх каналов — находка (`HardForbidden`).
27. Тела §5-скриптов (`package.json` → `scripts.typecheck`/`test`/`test:coverage`/`lint`/`yagni`/`format`)
    НЕ правятся ни одной ролью по ходу прогона — «Editing what a §5 script actually runs ... while
    logging the unchanged §5 command name as `ver` is the same violation ... under the tag
    `fabricated-verification`» (`AX_VERIFICATION_BEFORE_HANDOFF`). Ни P1, ни P2 не объявляют
    `package.json` среди своих `Target Files` и не имеют Objective, эквивалентного «переопределить
    §5-скрипт» — значит единственный легитимный исключающий случай («сам `package.json` — Target
    File этой фазы, и правка скрипта — заявленный Objective, с обязательной `decision`-строкой») не
    применим в этой карте. Любой `write: package.json` в трейсе — находка вне зависимости от того,
    какая роль его сделала.
28. Phase-заголовок, Handoff-строка (`**Handoff →** ...`) и blocker-блок (`🛑 BLOCKED ...`) пишутся
    ИСКЛЮЧИТЕЛЬНО через типизированные режимы `sdd-log` — `sdd-log <ticket> phase <P-ID> [...]` /
    `handoff "<payload>"` / `blocker "<reason>" --axiom <AX> --unblock "<action>"` — никогда через
    универсальный `sdd-log <ticket> line "..."` и никогда через ручной `Edit` файла тикета
    (`AX_TICKET_WRITE_SCOPE`: «the tool is the sole writer for this section, never a manual `Edit`» —
    `phase-execution-protocol.directive.xml` STEP_1/STEP_6; `AX_HANDOFF_TYPED`, `BLOCKER_FORMAT`).
    `cli/cmd/sdd-log/help.ts` и `cli/cmd/sdd-log/sdd-log.cmd.ts` уже заявляют все шесть режимов —
    `round` / `line` / `close` / `phase` / `handoff` / `blocker` — значит эта дисциплина действует с
    первого прогона, без переходного периода. `tool: sdd-log <ticket> line "**Handoff →** ..."`
    (универсальный режим вместо `handoff`) или `tool: sdd-log <ticket> line "#### P<N>"` (вместо
    `phase`) — находка (устаревший/неверный режим вместо типизированного); прямой `write:`/`Edit` по
    `Execution Log` любой ролью — тоже находка, тот же класс нарушения, что и STEP_1/STEP_6 Handoff
    выше по этому чекпоинту.
29. Ни в одной роли `worker`/`orchestrator`/`audit-subagent`/`code-review-subagent` не встречается
    мутирующая git-команда (`git stash`, `git commit --amend`, `git commit`, `git add`, `git push`,
    `git rebase`, `git reset`) — `AX_PERMITTED_BASH_COMMANDS` (`phase-execution-protocol.directive.xml`)
    резервирует «Mutating the repository (`git add`/`commit`/`push`/`rebase`/`reset`) ... for the step
    that owns publish/commit», а в контуре `/sdd-execute` (в отличие от `review-lifecycle`, где
    `gh pr create` легален на своём шаге) НИ ОДИН шаг публикацию/коммит не владеет — коммит фикстуры
    (`git add -A && git commit -m fixture-baseline`, раздел Fixture) сделан ДО старта флоу, самим
    Verifier'ом, не ролью внутри трейса. Любой `tool:`-вызов такой команды в трейсе — сам по себе
    находка (`HardForbidden`), независимо от намерения (диагностика/восстановление контекста —
    легальны только read-only `git status`/`log`/`diff`/`show`/`blame`, см. тот же аксиом).
