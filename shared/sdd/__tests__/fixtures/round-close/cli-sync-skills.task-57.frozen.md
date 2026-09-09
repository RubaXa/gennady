# Task: TSK-57 — sync-skills command (типы, ядро, форматтер, CLI, тесты, регистрация)

<!--SECTION:META-->

## 1. Meta

<!--/SECTION:META-->

- **Task-ID:** TSK-57
- **Status:** [x] DONE
- **Purpose:** Реализовать команду `gennady sync-skills`: типы (`SyncSkillsOptions`, `SyncSkillsFileEntry`, `SyncSkillsResult`), ядро (`SyncSkillsCore` — scanSkills, collectAndCompareSkills с orphan-удалением), форматтер (`SyncSkillsFormatter`), CLI-обвязка (`run` с DI через shared `SyncCmdDeps`), unit + integration тесты, регистрация в `gennady.ts`/`AGENTS.md`/`help.cmd.ts`.
- **Scope:** cli
- **Module:** sync-skills
- **Dependencies:** TSK-56 (provides: `resolvePackageDir`, `compareBytes` from `shared/common/sync/sync-core.shared.ts`; `SyncFormatter` from `shared/common/sync/sync-formatter.shared.ts`; `SyncCmdDeps` type from `shared/common/sync/sync-deps.type.ts`)
- **Prerequisite:** `ai/skills/` (13 каталогов скилов, скопированных из `~/.config/opencode/skills/` и `~/.claude/skills/sdd-critic/`) должны существовать до запуска `sync-skills`. Создание `ai/skills/` — вне scope TSK-57 (выполняется отдельно или в TSK-56)
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
- **Reopens:** 1

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

<!--/SECTION:PHASES_OVERVIEW-->

| ID  | Kind     | Deps   | Status |
| --- | -------- | ------ | ------ |
| P1  | impl     | TSK-56 | [x]    |
| P2  | test     | P1     | [x]    |
| P3  | register | P2     | [x]    |

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

<!--/SECTION:PHASE_P1-->

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

<!--SECTION:PHASE_P2-->

### P2 — test

<!--/SECTION:PHASE_P2-->

- **Objective:** Unit + integration тесты для sync-skills core, formatter, CLI-обвязки.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts` (create — scanSkills, collectAndCompareSkills, orphan-детект, deleteFailed)
  - `cli/cmd/sync-skills/__tests__/sync-skills-formatter.test.ts` (create — format: mixed, dryRun, deleteFailed, empty)
  - `cli/cmd/sync-skills/__tests__/sync-skills.cmd.test.ts` (create — happy path, --dry-run, filter, errors, deleteFailed)
- **Inputs:** P1 handoff
- **Exit:** `npm test` pass; все BDD-сценарии покрыты

<!--SECTION:PHASE_P3-->

### P3 — register

<!--/SECTION:PHASE_P3-->

- **Objective:** Зарегистрировать команду `sync-skills` в `cli/gennady.ts`, `cli/AGENTS.md`, `cli/cmd/help/help.cmd.ts`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/gennady.ts` (modify — добавить `case 'sync-skills': await import('./cmd/sync-skills/index.ts'); break`)
  - `cli/AGENTS.md` (modify — добавить строку `sync-skills` в таблицу команд)
  - `cli/cmd/help/help.cmd.ts` (modify — добавить `sync-skills` в вывод help)
- **Inputs:** P2
- **Exit:** `npm run type-check` pass; `npx gennady sync-skills` вызывает команду

<!--SECTION:BDD-->

## 4. Acceptance Criteria

<!--/SECTION:BDD--> (BDD)

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

**Scenario:** deleteFailed при ошибке удаления orphan-файла [`unit`]

- **Given** orphan-файл с запретом на запись
- **When** вызван `collectAndCompareSkills` (не dry-run)
- **Then** файл помечен `status: 'deleteFailed'` с `errorCode: 'EACCES'`
- **And** синхронизация остальных скилов продолжается

**Scenario:** deleteFailed при ошибке удаления orphan-директории [`unit`]

- **Given** orphan-директория не может быть удалена (EBUSY)
- **When** вызван `collectAndCompareSkills`
- **Then** директория помечена `status: 'deleteFailed'` с `errorCode: 'EBUSY'`
- **And** синхронизация остальных скилов продолжается

**Scenario:** `.claude` как файл → ошибка [`unit`]

- **Given** `<cwd>/.claude` существует как файл (не директория)
- **When** запущен `collectAndCompareSkills`
- **Then** выбрасывается ошибка c сообщением `.claude exists but is not a directory`

**Scenario:** Форматтер — пустой entries [`unit`]

- **Given** `entries` — пустой массив
- **When** вызван `format(entries, { dryRun: false })`
- **Then** возвращает одну строку `Synced: 0 added, 0 updated, 0 skipped, 0 deleted`

**Scenario:** Форматтер — все статусы в normal mode [`unit`]

- **Given** entries: 1 added скил с файлом, 1 updated с файлом, 1 deleted скил, 1 unchanged скил
- **When** вызван `format(entries, { dryRun: false })`
- **Then** вывод содержит `  + <скил>/` → `      <файл>`
- **And** `  ~ <скил>/` → `      <файл>`
- **And** `  - <скил>/`
- **And** `  = <скил>/                                                   (unchanged)`
- **And** итоговая строка: `Synced: 1 added, 1 updated, 1 skipped, 1 deleted`

**Scenario:** SyncSkillsResult.summary и dryRunSummary [`unit`]

- **Given** `SyncSkillsResult` с entries: 2 added, 1 updated, 3 unchanged, 1 deleted
- **When** вызван `.summary`
- **Then** возвращает `Synced: 2 added, 1 updated, 3 skipped, 1 deleted`
- **And** `.dryRunSummary` возвращает `Dry-run: no files written.`

**Scenario:** Fresh install — targetDir не существует [`integration`]

- **Given** `.claude/skills/` не существует, source содержит скилы
- **When** запущен `collectAndCompareSkills`
- **Then** все скилы отмечены как `added`, директория `.claude/skills/` создана

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

**Scenario:** CLI-обвязка — пакет не найден [`integration`]

- **Given** `resolvePackageDir` возвращает `null`
- **When** запущен `run(['node', 'gennady', 'sync-skills'])`
- **Then** exit 1, stderr содержит `gennady package not found. Install it locally: npm i -D gennady`

**Scenario:** sourceDir не существует → ошибка [`unit`]

- **Given** `sourceDir` указывает на несуществующий путь
- **When** вызван `collectAndCompareSkills`
- **Then** бросает `Error` с anchor-префиксом `[sync-skills]`

**Scenario:** sourceDir — файл → ошибка [`unit`]

- **Given** `sourceDir` — файл, а не директория
- **When** вызван `collectAndCompareSkills`
- **Then** бросает `Error` с сообщением `sourceDir is not a directory`

**Scenario:** .claude/ без прав на запись → ошибка [`unit`]

- **Given** `.claude/` существует с правами read-only
- **When** вызван `collectAndCompareSkills`
- **Then** бросает `Error` с `[sync-skills] cannot write to .claude/skills/`

**Scenario:** Ошибка записи файла → фатальная [`unit`]

- **Given** `writeFile` бросает ошибку
- **When** вызван `collectAndCompareSkills`
- **Then** бросает `Error` с `[sync-skills]`, операция прервана

**Scenario:** Повторный запуск — все файлы unchanged [`unit`]

- **Given** source и target идентичны
- **When** вызван `collectAndCompareSkills`
- **Then** все entries имеют статус `unchanged`

**Scenario:** entries отсортированы лексикографически [`unit`]

- **Given** source с несколькими скилами (`sdd-execute`, `sdd-audit`, `sdd-check`) и файлами внутри
- **When** вызван `collectAndCompareSkills`
- **Then** `result.entries` отсортированы: скилы лексикографически, файлы внутри каждого скила лексикографически

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

<!--SECTION:VERIFICATION-->

## 5. Verification

<!--/SECTION:VERIFICATION-->

| Command              | Required by      |
| -------------------- | ---------------- |
| `npm run type-check` | typescript-rules |
| `npm test`           | node-test        |

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

<!--/SECTION:TEST_COVERAGE-->

| Scenario                                      | Test File                                                                                           | Status |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| Типы и ядро компилируются                     | `npm run type-check`                                                                                | [x]    |
| CLI-обвязка компилируется                     | `npm run type-check`                                                                                | [x]    |
| scanSkills возвращает карту скилов            | `sync-skills-core.test.ts :: finds .md files in skill directories`                                  | [x]    |
| scanSkills с фильтром                         | `sync-skills-core.test.ts :: filters to specified skill names`                                      | [x]    |
| collectAndCompareSkills added/updated/deleted | `sync-skills-core.test.ts :: detects orphan skills (deleted from source but present in target)`     | [x]    |
| orphan-удаление с фильтром                    | `sync-skills-core.test.ts :: orphan detection respects filter — only deletes orphans within filter` | [x]    |
| dry-run не пишет/не удаляет                   | `sync-skills-core.test.ts :: dry-run does not write or delete files`                                | [x]    |
| deleteFailed при ошибке удаления файла        | `sync-skills-core.test.ts :: marks file as deleteFailed when unlink throws EACCES`                  | [x]    |
| deleteFailed при ошибке удаления директории   | `sync-skills-core.test.ts :: marks dir as deleteFailed when rmdir throws EBUSY`                     | [x]    |
| .claude как файл → ошибка                     | `sync-skills-core.test.ts :: throws when .claude exists as a file`                                  | [x]    |
| sourceDir не существует → ошибка              | `sync-skills-core.test.ts :: throws when sourceDir does not exist`                                  | [x]    |
| sourceDir — файл → ошибка                     | `sync-skills-core.test.ts :: throws when sourceDir is a file, not a directory`                      | [x]    |
| .claude/ без прав на запись → ошибка          | `sync-skills-core.test.ts :: throws when target cannot be written (EACCES on mkdir)`                | [x]    |
| Ошибка записи файла → фатальная               | `sync-skills-core.test.ts :: throws on writeFile failure (fatal)`                                   | [x]    |
| Повторный запуск — все файлы unchanged        | `sync-skills-core.test.ts :: repeat run — all files unchanged`                                      | [x]    |
| entries отсортированы лексикографически       | `sync-skills-core.test.ts :: entries sorted lexicographically by skillName then relativePath`       | [x]    |
| Fresh install — targetDir не существует       | `sync-skills-core.test.ts :: fresh install — targetDir does not exist, all files added`             | [x]    |
| Форматтер группирует с отступами              | `sync-skills-formatter.test.ts :: groups entries by skillName`                                      | [x]    |
| Форматтер dry-run маркеры                     | `sync-skills-formatter.test.ts :: dry-run with all statuses shows correct labels`                   | [x]    |
| Форматтер deleteFailed                        | `sync-skills-formatter.test.ts :: shows delete failed with error code`                              | [x]    |
| Форматтер — пустой entries                    | `sync-skills-formatter.test.ts :: returns only summary for empty entries`                           | [x]    |
| Форматтер — все статусы в normal mode         | `sync-skills-formatter.test.ts :: formats added, updated, deleted, unchanged with correct markers`  | [x]    |
| SyncSkillsResult.summary и dryRunSummary      | `sync-skills-core.test.ts :: summary returns correct counts`                                        | [x]    |
| CLI-обвязка парсит args                       | `sync-skills.cmd.test.ts :: parses positional skill name arguments`                                 | [x]    |
| CLI-обвязка ошибка несуществующего скила      | `sync-skills.cmd.test.ts :: exits 1 when skill name not found in source`                            | [x]    |
| CLI-обвязка — пакет не найден                 | `sync-skills.cmd.test.ts :: exits 1 when package not found`                                         | [x]    |
| Команда зарегистрирована                      | `sync-skills.cmd.test.ts :: syncs all skills from source to target`                                 | [x]    |
| Help содержит sync-skills                     | `cli/cmd/help/help.cmd.ts` (file content verified)                                                  | [x]    |
| AGENTS.md содержит sync-skills                | `cli/AGENTS.md` (file content verified)                                                             | [x]    |

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

<!--/SECTION:EXECUTION_LOG-->

### Round 1 — 2026-05-31, initial

#### P1

- [x] `<ts>` ver `npm run type-check && npm test` → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [sync-skills.types.ts, sync-skills-core.ts, sync-skills-formatter.ts, sync-skills.cmd.ts, index.ts]; decisions: []; open: []

#### P2

- [x] `<ts>` ver `npm test` → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [sync-skills-core.test.ts, sync-skills-formatter.test.ts, sync-skills.cmd.test.ts, sync-skills.types.test.ts]; decisions: [tests=78-passes, coverage=scanSkills+collectAndCompare+format+run+types]; open: []

#### P3

- [x] `<ts>` ver `npm run type-check && npm test` → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [gennady.ts, AGENTS.md, help.cmd.ts]; decisions: []; open: []

#### Round close

- [x] DONE

## Critic Rounds

### Round 2 — 2026-05-30

- **Вердикт критика:** NEEDS_WORK
- **Принято:** 5 находок
  - Coverage table (§6) неполная — 9 BDD-сценариев из §4 не отражены (MAJOR)
  - Missing BDD для SyncSkillsResult.summary / dryRunSummary (MAJOR)
  - Missing BDD для форматтера normal-mode (все статусы) (MAJOR)
  - Missing BDD для сортировки entries (MINOR)
  - Scope ai/skills/ data creation неясен (MINOR, confusion)
- **Отклонено:** 0 находок
- **Изменения:**
  - §1 Meta: добавлен пункт Prerequisite — ai/skills/ вне scope TSK-57
  - §4: добавлен BDD-сценарий «Форматтер — все статусы в normal mode» (added/updated/deleted/unchanged)
  - §4: добавлен BDD-сценарий «SyncSkillsResult.summary и dryRunSummary»
  - §4: добавлен BDD-сценарий «entries отсортированы лексикографически»
  - §6: таблица покрытия дополнена 12 пропущенными строками (включая 3 новых сценария)
