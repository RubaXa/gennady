# Module: `sdd-sync`

**Module:** sdd-sync · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Распространение статуса тикета в трекеры `*.3-tasks.md`. `execute` (STEP_4) и `reconcile` (STEP_6) вызывают `sdd-sync <ticket>`; тул читает `Task-ID` + `Status` из Meta тикета и приводит строку этого Task-ID в каждом трекере (module → scope → project) к этому статусу, **с пост-проверкой записи** (`AX_VERIFY_AND_FINALIZE`). Колонка Status ищется по заголовку, не по индексу (в module-трекере она 4-я, в scope-трекере 5-я). После Status-синка тул отдельным проходом пересчитывает Progress-роллап (`Tasks`/`Done`, например `0/1`) в любом обнаруженном `## Scope Tracker`/`## Module Tracker` (`specs/3-tasks.md` — плоский `3-tasks.md`, без scope-префикса — и scope-индексы, которые сами держат такую таблицу) — иначе счётчик молча устаревает после каждого Status-обновления (см. D-SY004).

**Key properties:**

- Header-located column — `updateTrackerStatus` находит `Task-ID`/`Status` по шапке таблицы; переносимо между разными формами трекеров
- Surgical — переписывается только сегмент Status совпавшей строки; прочие ячейки/строки байт-в-байт нетронуты
- Verified — после записи файл перечитывается и проверяется, что строка уже в синке (иначе exit 1)
- Walk-up discovery — без явных индексов синкаются все `*.3-tasks.md`/`3-tasks.md` от каталога тикета вверх
- Progress recompute — отдельный проход после Status-синка пересчитывает `Tasks`/`Done` в любом роллапе (`Index`+`Tasks`+`Done` колонки) по актуальным строкам связанного трекера

**Invariants:**

- Идемпотентно: совпадающий статус → `in-sync`, файл не трогается; совпадающий Progress → без строки `progress:` в отчёте, файл не трогается
- exit `0` синк (отчёт) · `1` файл тикета / verify-fail · `2` Meta без Task-ID/Status · `4` нет тикета
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-sync specs/cli/core/core.task-foo.md
[sdd-sync] cli-foo → [x] DONE
  updated:    specs/cli/core/core.3-tasks.md
  in-sync:    specs/cli/cli.3-tasks.md
  no-table:   specs/3-tasks.md
  progress:   specs/3-tasks.md (./cli/cli.3-tasks.md)

# --- явные индексы ---
$ npx gennady sdd-sync ticket.md module.3-tasks.md scope.3-tasks.md
[sdd-sync] cli-foo → [x] DONE
  updated:    module.3-tasks.md
  updated:    scope.3-tasks.md
```

`no-table` and `progress` — same file (`specs/3-tasks.md`), two independent tables: it has no `Task-ID`/`Status` columns (so the Status-sync loop reports `no-table`), but it DOES have `Index`/`Tasks`/`Done` columns (the Scope Tracker), which the separate Progress-recompute pass updates by re-reading `cli.3-tasks.md`'s own rows.

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                        | Type         | Purpose                                                                                                              |
| ------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `run`                                       | Command      | Точка входа CLI: Meta → Task-ID/Status, обнаружение индексов, синк, verify, progress-пересчёт                        |
| `discoverIndexes`                           | Utility      | Сбор `*.3-tasks.md` + плоского `3-tasks.md` от каталога тикета вверх (cap 8)                                         |
| `recomputeProgress`                         | Utility      | Прогоняет `recomputeRollupProgress` по каждому обнаруженному индексу, резолвя Index-ссылки относительно его каталога |
| `parseMeta`                                 | Utility      | (`shared/sdd/tracker`) Task-ID + Status из тела Meta                                                                 |
| `updateTrackerStatus`                       | Utility      | (`shared/sdd/tracker`) хирургическая правка ячейки Status по Task-ID                                                 |
| `parseTrackerRows`                          | Utility      | (`shared/sdd/tracker`) строки Task-ID/Status трекера — источник для Progress-пересчёта                               |
| `recomputeRollupProgress`                   | Utility      | (`shared/sdd/tracker`) пересчёт `Tasks`/`Done` в Scope/Module-роллапе по строкам связанного трекера                  |
| `isRowDone`                                 | Utility      | (`shared/sdd/tracker`) `[x]`-чекбокс статуса строки (любой регистр)                                                  |
| `extractSection`                            | Utility      | (`shared/sdd/section`) извлечение Meta                                                                               |
| `badInvocation` / `fileError` / `metaError` | Utility      | Билдеры диагностик                                                                                                   |
| `TicketMeta`                                | Value Object | `{ taskId, status }` (оба nullable)                                                                                  |
| `TrackerUpdate`                             | Type         | ok(text, changed) либо fail(`no_table`/`task_not_found`)                                                             |
| `SyncOutcome`                               | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                             |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Status Propagation

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<ticket>` задан; Meta содержит парсимые `Task-ID` + `Status`
- Postconditions:
  - В каждом трекере строка Task-ID получает статус тикета; прочее нетронуто
  - Совпадающий статус → `in-sync` (без записи); строки нет → `no-row`; таблицы нет → `no-table`
  - После записи verify подтверждает синк, иначе exit 1
  - ПОСЛЕ Status-синка: каждый обнаруженный индекс с роллап-таблицей (`Index`+`Tasks`+`Done`) получает пересчитанные `Tasks`/`Done` по СВЕЖЕ прочитанным строкам связанного трекера (резолв Index-ссылки относительно каталога роллапа) — строка `progress:` в отчёте на изменённых; совпадающий счёт не трогает файл и не даёт строки
- Invariants:
  - Колонка Status определяется по шапке (не по фиксированному индексу)
  - Хирургическая правка: только сегмент Status совпавшей строки
  - Progress-пересчёт не может провалить гейт (verify-fail только для Status-записи); нерезолвимая Index-ссылка молча пропускается, не ошибка

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument      | Type   | Description                                                 |
| ------------- | ------ | ----------------------------------------------------------- |
| `<ticket>`    | string | Тикет-источник статуса (читается Meta)                      |
| `[index ...]` | string | Явные трекеры; без них — авто-обход вверх по `*.3-tasks.md` |

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-sync/
├── index.ts             # Entry point for dynamic import
├── sdd-sync.cmd.ts      # Command: Meta → status, discover indexes, update + verify each
├── sdd-sync.types.ts    # error codes, SyncOutcome, diagnostic builders
├── help.ts              # Help text output
└── __tests__/sdd-sync.cmd.test.ts

shared/sdd/tracker.ts    # parseMeta + updateTrackerStatus + parseTrackerRows + recomputeRollupProgress + isRowDone + __tests__/tracker.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit (pure + run) + lint + typecheck.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-SY001 — Колонка Status по заголовку, не по индексу

- **Status:** active
- **Why:** module-трекер (`Task-ID|Title|Dependencies|Status|Reopens`) и scope-трекер (`…|Module|Dependencies|Status|Reopens`) держат Status в разных колонках. Поиск по шапке делает один код корректным для обоих и устойчивым к смене формата.
- **Risk accepted:** Нет.

### D-SY002 — Хирургическая правка только ячейки Status

- **Status:** active
- **Why:** Переписывать всю строку — шумный diff и риск задеть Title со спецсимволами. Правится только сегмент `raw[statusCol+1]` по сырому split('|'); остальное байт-в-байт.
- **Risk accepted:** Зависит от наличия ведущего `|` (трекер-строки всегда с него начинаются — guard есть).

### D-SY003 — Walk-up обнаружение индексов + явный override

- **Status:** active
- **Why:** Резолв task-id → пути сложен; co-located layout кладёт module/scope/project индексы по пути тикета вверх. Авто-обход (cap 8) покрывает типовой случай; явные пути — для детерминизма и тестов.
- **Risk accepted:** Обход поднимается до корня ФС (cap 8) — лишние `*.3-tasks.md` вне дерева теоретически попали бы; на практике их там нет, а `no-row` безвреден.

### D-SY004 — Progress-роллап (`Tasks`/`Done`) пересчитывается отдельным проходом после Status-синка

- **Status:** active
- **Why:** `sdd-sync` обновлял только Task-ID/Status строки трекеров; Scope/Module-роллап (`## Scope Tracker` в `specs/3-tasks.md`, формат `Tasks: 12`/`Done: 0/12`) — статическая таблица, никем не пересчитываемая. После каждого Status-обновления счётчик тихо расходился с реальностью (flow-sim S7 finding). Плоский `3-tasks.md` (без scope-префикса, в отличие от `<scope>.3-tasks.md`) не матчился `discoverIndexes`'s суффиксным фильтром вовсе — расширен на точное имя `3-tasks.md`. `recomputeRollupProgress` (`shared/sdd/tracker.ts`, чистая функция) детектит роллап-таблицу по колонкам `Index`+`Tasks`+`Done` (не по имени секции — `## Scope Tracker` и `## Module Tracker` — одна и та же форма), резолвит каждую Index-ссылку и пересчитывает счёт от СВЕЖИХ `parseTrackerRows` связанного файла — работает на любом уровне вложенности (project→scope, scope→module) без специального кода под каждый уровень.
- **Risk accepted:** Пересчёт применяется к КАЖДОМУ обнаруженному индексу, включая роллап-строки, не относящиеся к текущему тикету (например другие scope в `specs/3-tasks.md`) — намеренно: это гарантирует, что Progress везде остаётся точным после любого синка, не только для тронутой строки. Нерезолвимая/отсутствующая ссылка — тихо пропускается (не ошибка, не verify-fail), т.к. цель — best-effort актуализация счётчика, не гейт.

### `recomputeProgress`

- **Usage Waiver:** Единственный вызов внутри `run()` — изолирует I/O-обёртку Progress-пересчёта (обход индексов, чтение/запись файлов) от чистого ядра (`recomputeRollupProgress`), тестируемого отдельно юнит-тестами без файловой системы.

### `isRowDone`

- **Usage Waiver:** Единственный вызов внутри `recomputeRollupProgress` — вынесена именованной функцией (не инлайн-регэксп) ради собственного JSDoc-контракта и прямого юнит-теста семантики "[x]-чекбокс, любой регистр" отдельно от роллап-пересчёта.

### `findRollupHeader`

- **Usage Waiver:** Единственный вызов внутри `recomputeRollupProgress` — зеркало `findTaskStatusHeader` (та же роль: локализация таблицы по шапке, не по индексу), выделена отдельно для симметрии с уже существующим паттерном модуля.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/section.ts`, `shared/sdd/tracker.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (STEP_4) и `reconcile` (STEP_6)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
