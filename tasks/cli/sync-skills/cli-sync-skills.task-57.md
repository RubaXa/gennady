# Task: TSK-57 — sync-skills command (типы, ядро, форматтер, CLI, тесты, регистрация)

## 1. Meta

- **Task-ID:** TSK-57
- **Status:** [ ] TODO
- **Purpose:** Реализовать команду `gennady sync-skills`: типы (`SyncSkillsOptions`, `SyncSkillsFileEntry`, `SyncSkillsResult`), ядро (`SyncSkillsCore` — scanSkills, collectAndCompareSkills с orphan-удалением), форматтер (`SyncSkillsFormatter`), CLI-обвязка (`run` с DI через shared `SyncCmdDeps`), unit + integration тесты, регистрация в `gennady.ts`/`AGENTS.md`/`help.cmd.ts`.
- **Scope:** cli
- **Module:** sync-skills
- **Dependencies:** TSK-56
- **Spec References:**
  - Module spec: [`sync-skills.spec.md`](../../../specs/cli/sync-skills/sync-skills.spec.md)
  - Scope spec: [`cli.spec.md §5.7`](../../../specs/cli/cli.spec.md)
  - FR: [`cli.spec.md §4.1.6`](../../../specs/cli/cli.spec.md) — FR-SS-01..16
  - DX: [`cli.spec.md §3.6`](../../../specs/cli/cli.spec.md)
  - Decision: [D-011](../../../specs/cli/cli.spec.md) — команда sync-skills
  - Decision: [D-M005](../../../specs/cli/sync-skills/sync-skills.spec.md) — отдельная команда
  - Decision: [D-M006](../../../specs/cli/sync-skills/sync-skills.spec.md) — orphan-удаление
  - Contract: [`SyncSkillsCore`](../../../specs/cli/sync-skills/sync-skills.spec.md)
  - Contract: [`SyncSkillsFormatter`](../../../specs/cli/sync-skills/sync-skills.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `type-check`, `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID | Kind     | Deps | Status |
|----|----------|------|--------|
| P1 | impl     | —    | [ ]    |
| P2 | test     | P1   | [ ]    |
| P3 | register | P2   | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать `sync-skills.types.ts`, `sync-skills-core.ts`, `sync-skills-formatter.ts`, `sync-skills.cmd.ts`, `index.ts`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/sync-skills/sync-skills.types.ts` (create — `SyncSkillsOptions`, `SyncSkillsFileEntry`, `SyncSkillsResult`)
  - `cli/cmd/sync-skills/sync-skills-core.ts` (create — `scanSkills`, `collectAndCompareSkills`; константы исключений скрытых файлов)
  - `cli/cmd/sync-skills/sync-skills-formatter.ts` (create — `format` с группировкой по скилам, отступами, маркером `-`)
  - `cli/cmd/sync-skills/sync-skills.cmd.ts` (create — `run(rawArgs, deps?)` с DI через shared `SyncCmdDeps`)
  - `cli/cmd/sync-skills/index.ts` (create — `import { run } from './sync-skills.cmd.ts'; run(process.argv)`)
- **Inputs:** none
- **Exit:** `npm run type-check` pass; модуль импортируется без ошибок

### P2 — test

- **Objective:** Unit + integration тесты для sync-skills core, formatter, CLI-обвязки.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts` (create — scanSkills, collectAndCompareSkills, orphan-детект, deleteFailed)
  - `cli/cmd/sync-skills/__tests__/sync-skills-formatter.test.ts` (create — format: mixed, dryRun, deleteFailed, empty, filter)
  - `cli/cmd/sync-skills/__tests__/sync-skills.cmd.test.ts` (create — happy path, --dry-run, filter, errors, deleteFailed)
- **Inputs:** P1 handoff
- **Exit:** `npm test` pass; все BDD-сценарии покрыты

### P3 — register

- **Objective:** Зарегистрировать команду `sync-skills` в `cli/gennady.ts`, `cli/AGENTS.md`, `cli/cmd/help/help.cmd.ts`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/gennady.ts` (modify — добавить `case 'sync-skills': await import('./cmd/sync-skills/index.ts'); break`)
  - `cli/AGENTS.md` (modify — добавить строку `sync-skills` в таблицу команд)
  - `cli/cmd/help/help.cmd.ts` (modify — добавить `sync-skills` в вывод help)
- **Inputs:** P2
- **Exit:** `npm run type-check` pass; `npx gennady sync-skills` вызывает команду

## 4. Acceptance Criteria (BDD)

**Feature:** Команда `gennady sync-skills` синхронизирует SDD-скилы из npm-пакета

**Scenario:** Типы и ядро компилируются [`type-check`]

- **Given** TSK-56 завершён (shared core доступен)
- **When** созданы `sync-skills.types.ts`, `sync-skills-core.ts`, `sync-skills-formatter.ts`
- **Then** `npm run type-check` → exit 0

**Scenario:** CLI-обвязка компилируется [`type-check`]

- **Given** P1 завершён
- **When** созданы `sync-skills.cmd.ts`, `index.ts`
- **Then** `npm run type-check` → exit 0

**Scenario:** scanSkills возвращает карту скилов [`unit`]

- **Given** source-директория с 2 тестовыми скилами (`sdd-audit/SKILL.md`, `sdd-check/SKILL.md`)
- **When** вызван `scanSkills(sourceDir)`
- **Then** возвращает `Map { 'sdd-audit' → Map { 'SKILL.md' → <Buffer> }, 'sdd-check' → ... }`
- **And** скрытые файлы (`.DS_Store`, `.hidden`) исключены

**Scenario:** scanSkills с фильтром возвращает только указанные скилы [`unit`]

- **Given** source-директория с 3 скилами
- **When** вызван `scanSkills(sourceDir, ['sdd-execute'])`
- **Then** возвращает только `sdd-execute`
- **And** ошибка если скил не существует — с перечислением доступных

**Scenario:** collectAndCompareSkills детектит added/updated/unchanged/deleted [`unit`]

- **Given** source с 2 скилами, target с 1 скилом (1 добавился, 1 orphan)
- **When** вызван `collectAndCompareSkills(deps, opts)`
- **Then** возвращает 1 `added`, 1 `deleted`, 0 `updated`, 0 `unchanged`

**Scenario:** orphan-удаление с фильтром не трогает неуказанные скилы [`unit`]

- **Given** target содержит `sdd-audit` (orphan — нет в source) и `sdd-execute` (указан в фильтре)
- **When** вызван `collectAndCompareSkills` с `skillNames: ['sdd-execute']`
- **Then** `sdd-audit` не появляется в deleted
- **And** `sdd-execute` проверен на изменения

**Scenario:** dry-run не пишет и не удаляет файлы [`unit`]

- **Given** source с новым скилом, target с orphan
- **When** вызван `collectAndCompareSkills` с `dryRun: true`
- **Then** ни один `writeFile` / `unlink` / `rmdir` не вызван
- **And** результат содержит entries с корректными статусами

**Scenario:** deleteFailed при ошибке удаления orphan [`unit`]

- **Given** orphan-файл с запретом на запись
- **When** вызван `collectAndCompareSkills` (не dry-run)
- **Then** файл помечен `status: 'deleteFailed'`
- **And** синхронизация остальных скилов продолжается

**Scenario:** Форматтер группирует по скилам с отступами [`unit`]

- **Given** entries: 1 added скил с 2 файлами, 1 updated с 1 файлом
- **When** вызван `format(entries, { dryRun: false })`
- **Then** вывод содержит `  + sdd-audit/` → `      SKILL.md` (с отступом 6 пробелов)
- **And** `  ~ sdd-execute/` → `      scripts/verify.sh`

**Scenario:** Форматтер dry-run использует (would add/update/delete) [`unit`]

- **Given** entries с added, updated, deleted
- **When** вызван `format(entries, { dryRun: true })`
- **Then** маркеры содержат `(would add)`, `(would update)`, `(would delete)`, `(unchanged, skip)`
- **And** итоговая строка: `Dry-run: no files written.`

**Scenario:** Форматтер показывает deleteFailed с кодом ошибки [`unit`]

- **Given** entry со статусом `deleteFailed`
- **When** вызван `format`
- **Then** вывод содержит `  ! my-skill/  (delete failed: EACCES)`

**Scenario:** CLI-обвязка парсит --dry-run и позиционные аргументы [`integration`]

- **Given** P1 завершён
- **When** `run(['node', 'gennady', 'sync-skills', '--dry-run', 'sdd-execute'])`
- **Then** `opts.dryRun === true`, `opts.skillNames === ['sdd-execute']`

**Scenario:** CLI-обвязка — ошибка при несуществующем скиле [`integration`]

- **Given** P1 завершён
- **When** `run(['node', 'gennady', 'sync-skills', 'nonexistent'])`
- **Then** exit 1, stderr содержит `not found` и перечисление доступных скилов

**Scenario:** Команда зарегистрирована [`contract`]

- **Given** P3 завершён
- **When** `npx gennady sync-skills`
- **Then** команда распознаётся (не «Unknown command»)

**Scenario:** Help показывает sync-skills [`contract`]

- **Given** P3 завершён
- **When** `npx gennady --help`
- **Then** вывод содержит `sync-skills`

**Scenario:** AGENTS.md содержит sync-skills [`contract`]

- **Given** P3 завершён
- **When** читаем `cli/AGENTS.md`
- **Then** таблица команд содержит строку `sync-skills`

## 5. Verification

| Command                          | Required by  |
| -------------------------------- | ------------ |
| `npm run type-check`             | typescript-rules |
| `npm test`                       | node-test    |

## 6. Test Scenario Coverage

| Scenario | Test File | Status |
|---|---|---|
| Типы и ядро компилируются | `npm run type-check` | [ ] |
| CLI-обвязка компилируется | `npm run type-check` | [ ] |
| scanSkills возвращает карту скилов | `sync-skills-core.test.ts :: scanSkills basic` | [ ] |
| scanSkills с фильтром | `sync-skills-core.test.ts :: scanSkills filter` | [ ] |
| collectAndCompareSkills added/updated/deleted | `sync-skills-core.test.ts :: collectAndCompareSkills mixed` | [ ] |
| orphan-удаление с фильтром | `sync-skills-core.test.ts :: orphan with filter` | [ ] |
| dry-run не пишет/не удаляет | `sync-skills-core.test.ts :: dry-run no mutations` | [ ] |
| deleteFailed при ошибке удаления | `sync-skills-core.test.ts :: deleteFailed EACCES` | [ ] |
| Форматтер группирует с отступами | `sync-skills-formatter.test.ts :: format mixed` | [ ] |
| Форматтер dry-run маркеры | `sync-skills-formatter.test.ts :: format dry-run` | [ ] |
| Форматтер deleteFailed | `sync-skills-formatter.test.ts :: format deleteFailed` | [ ] |
| CLI-обвязка парсит args | `sync-skills.cmd.test.ts :: parseArgs` | [ ] |
| CLI-обвязка ошибка несуществующего скила | `sync-skills.cmd.test.ts :: nonexistent skill` | [ ] |
| Команда зарегистрирована | `sync-skills.cmd.test.ts :: registered` | [ ] |
| Help содержит sync-skills | `sync-skills.cmd.test.ts :: help output` | [ ] |
| AGENTS.md содержит sync-skills | `sync-skills.cmd.test.ts :: AGENTS.md` | [ ] |

## 7. Execution Log

### Round 1 — <date>, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → <pass|fail> exit=<code>
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [sync-skills.types.ts, sync-skills-core.ts, sync-skills-formatter.ts, sync-skills.cmd.ts, index.ts]; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `npm test` → <pass|fail> exit=<code>
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [sync-skills-core.test.ts, sync-skills-formatter.test.ts, sync-skills.cmd.test.ts]; decisions: []; open: []

#### P3

- [ ] `<ts>` ver `npm run type-check` → <pass|fail> exit=<code>
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [gennady.ts, AGENTS.md, help.cmd.ts]; decisions: []; open: []

#### Round close

- [ ] DONE
