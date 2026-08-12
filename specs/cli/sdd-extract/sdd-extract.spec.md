# Module: `sdd-extract`

**Module:** sdd-extract · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Извлечение одной именованной секции `<!--SECTION:NAME-->` … `<!--/SECTION:NAME-->` из markdown-артефакта SDD (тикет / спека). Первый из механических тулов SDD-flow v2: оркестратор и фазовые агенты читают тикет не целиком, а по одному блоку за раз — это держит контекст агента узким. Реверс-спека — старый скрипт `ai/skills/sdd-execute/scripts/extract-section.sh`; контракт exit-кодов сохранён 1:1.

**Key properties:**

- Pure core — логика извлечения в `shared/sdd/section.ts` (`extractSection`), переиспользуется будущими `sdd-check` / `sdd-task`
- Never-silent — на любой промах stdout несёт actionable-инструкцию для оркестратора, не пустую строку (`AX_BASH_NO_SILENT_EMPTY`)
- Pipe-safe — на успехе stdout = только тело секции (без строк-маркеров); диагностика логгера → stderr

**Invariants:**

- Имя секции matched против `^[A-Z][A-Z0-9_]*$` — атомарный идентификатор, без кавычек/пробелов/атрибутов
- Маркеры распознаются сравнением строки целиком после `trim()` — ведущий отступ допускается
- Требуется ровно одна сбалансированная пара; ноль / дисбаланс / дубль / пусто — каждое отдельный статус и exit-код
- Exit-коды: `0` успех · `1` файл не найден/нечитаем · `2` секция отсутствует/пуста · `3` маркеры несбалансированы/дублированы · `4` плохой вызов / невалидное имя
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
# --- happy path: тело секции в stdout, exit 0 ---
$ npx gennady sdd-extract specs/cli/lint/lint.task-foo.md META
- **Task-ID:** cli-lint-foo
- **Status:** [ ] TODO

# --- секции нет: actionable-диагностика, exit 2 ---
$ npx gennady sdd-extract ticket.md EXECUTION_LOG
[sdd-extract] ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND: section EXECUTION_LOG in ticket.md
  searched: <!--SECTION:EXECUTION_LOG--> / <!--/SECTION:EXECUTION_LOG-->
  Read the file: if the section exists as a header, retrofit anchors; if absent, the ticket needs (re)scaffolding.
  Do not dispatch a phase agent until anchors are in place.

# --- маркеры несбалансированы, exit 3 ---
$ npx gennady sdd-extract ticket.md PHASE_P1
[sdd-extract] ERR_CLI_SDD_EXTRACT_ANCHOR_UNBALANCED: section PHASE_P1 in ticket.md
  <!--SECTION:PHASE_P1--> ×1, <!--/SECTION:PHASE_P1--> ×0
  ...

# --- невалидное имя, exit 4 ---
$ npx gennady sdd-extract ticket.md phase_p1
[sdd-extract] ERR_CLI_SDD_EXTRACT_INVALID_NAME: "phase_p1"
  ...
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

_Полный список сущностей модуля `sdd-extract` + общего ядра `shared/sdd/section.ts`. Любое введение сущности помимо этого списка — drift, требует обновления спеки._

| Name                    | Type         | Purpose                                                                                                                  |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `run`                   | Command      | Точка входа CLI: парсинг `<file> <NAME>`, чтение файла, маппинг в `ExtractOutcome`                                       |
| `extractSection`        | Utility      | Чистое ядро: возвращает `SectionResult` по контенту и имени секции (`shared/sdd`)                                        |
| `isValidSectionName`    | Utility      | Проверка имени против `SECTION_NAME_REGEX`                                                                               |
| `toOutcome`             | Utility      | Маппинг `SectionResult` → `ExtractOutcome` с actionable-сообщением и exit-кодом                                          |
| `badInvocation`         | Utility      | Билдер диагностики плохого вызова (exit 4)                                                                               |
| `invalidName`           | Utility      | Билдер диагностики невалидного имени (exit 4)                                                                            |
| `fileNotFound`          | Utility      | Билдер диагностики отсутствующего файла (exit 1)                                                                         |
| `fileNotReadable`       | Utility      | Билдер диагностики нечитаемого файла / директории (exit 1)                                                               |
| `SECTION_NAME_REGEX`    | Value Object | Каноническая грамматика имени секции: `^[A-Z][A-Z0-9_]*$`                                                                |
| `SectionResult`         | Type         | Дискриминированный union ядра: `ok` / `invalid_name` / `not_found` / `unbalanced` / `duplicated` / `empty`               |
| `ExtractOutcome`        | Type         | Результат команды: `{ok:true, content}` либо `{ok:false, code, exitCode, message}`                                       |
| `ERR_CLI_SDD_EXTRACT_*` | Value Object | 8 кодов ошибок (bad-invocation, invalid-name, file-not-found/-readable, anchor-not-found/-empty/-unbalanced/-duplicated) |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `extractSection`

- **Type:** Utility (pure)
- **Purpose:** Извлечь содержимое между маркерами секции, исключая строки-маркеры.
- **Public Operations:**
  - `extractSection(content: string, name: string) -> SectionResult`
- **Errors & Degradation:** Не бросает; любой промах — отдельный `status` в результате. CRLF переносится корректно (детекция по `trim()`).
- **Consumers:** Internal `run` (`sdd-extract.cmd`); будущие `sdd-check`, `sdd-task`.

### `run`

- **Type:** Command
- **Purpose:** Точка входа `gennady sdd-extract` — валидация аргументов, чтение файла, маппинг в `ExtractOutcome`.
- **Public Operations:**
  - `run(rawArgs: string[]) -> Promise<ExtractOutcome>`
  - Self-executing tail: печатает `content` (успех) или `message` (промах) в stdout, `process.exit(exitCode)`
- **Errors & Degradation:** ENOENT → `fileNotFound`; прочие ошибки чтения (EACCES, EISDIR) → `fileNotReadable`.
- **Consumers:** Internal `gennady.ts`; External — CLI, оркестратор / фазовые агенты SDD.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

### 5.1 Section Extraction

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - Передано ровно 2 позиционных аргумента: `<file>` и `<NAME>`
  - `<NAME>` matched против `^[A-Z][A-Z0-9_]*$`
- Postconditions:
  - Ровно одна сбалансированная пара маркеров → тело секции (без строк-маркеров) в stdout, exit `0`
  - Секция отсутствует → exit `2`, код `ANCHOR_NOT_FOUND`
  - Маркеры есть, но тело пусто/только пробелы → exit `2`, код `ANCHOR_EMPTY`
  - Счётчики open ≠ close → exit `3`, код `ANCHOR_UNBALANCED` (с counts)
  - Секция встречается > 1 раза → exit `3`, код `ANCHOR_DUPLICATED`
  - Невалидное имя / не 2 аргумента → exit `4`
  - Файл не найден → exit `1`, `FILE_NOT_FOUND`; нечитаем → exit `1`, `FILE_NOT_READABLE`
- Invariants:
  - На любом промахе stdout непустой и содержит actionable-инструкцию (`AX_BASH_NO_SILENT_EMPTY`)
  - На успехе stdout не содержит строк-маркеров `<!--SECTION:...-->`
  - Логи состояния идут в stderr (logger) — pipe-safe

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

| Argument       | Type    | Default | Description                                          |
| -------------- | ------- | ------- | ---------------------------------------------------- |
| `<file>`       | string  | —       | Путь к markdown-артефакту SDD (тикет / спека)        |
| `<NAME>`       | string  | —       | Имя якоря секции, matched против `^[A-Z][A-Z0-9_]*$` |
| `--help`, `-h` | boolean | false   | Показать справку                                     |

**Канонические имена секций:** `META`, `PHASES_OVERVIEW`, `PHASE_P<N>`, `PHASE_P<N>_FIX`, `BDD`, `VERIFICATION`, `TEST_COVERAGE`, `EXECUTION_LOG`.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```
cli/cmd/sdd-extract/
├── index.ts                 # Entry point for dynamic import
├── sdd-extract.cmd.ts       # Command: parseArgs, read, map → ExtractOutcome, self-exec
├── sdd-extract.types.ts     # Error codes, ExtractOutcome, diagnostic builders
├── help.ts                  # Help text output
└── __tests__/
    └── sdd-extract.cmd.test.ts   # Integration tests for run()

shared/sdd/
├── section.ts               # Pure core: extractSection / isValidSectionName / SECTION_NAME_REGEX
└── __tests__/
    └── section.test.ts      # Unit tests for the extractor
```

**Registration points (4 files):**

- `cli/gennady.ts` — help dispatch + command switch
- `cli/cmd/help/help.cmd.ts` — main help listing
- `cli/AGENTS.md` — commands table
- `cli/cmd/README.md` — scenarios + commands table

**E2E:** `cli/__tests__/e2e/sdd-extract.e2e.test.ts` + fixture `cli/__tests__/e2e/fixtures/sdd/ticket.md`, registered in `cli/__tests__/e2e/e2e.test.ts`.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

### D-SX001 — Ядро извлечения в `shared/sdd/`, не в папке команды

- **Status:** active
- **Why:** `extractSection` переиспользуется будущими `sdd-check` (скан секций тикета) и `sdd-task` (чтение Meta + фаз). Переиспользование известно достоверно (план SDD v2), поэтому вынос в `shared/sdd/section.ts` — не спекулятивный.
- **Risk accepted:** Низкий — pure-функция без зависимостей.

### D-SX002 — Exit-коды сохранены 1:1 из `extract-section.sh`

- **Status:** active
- **Why:** Старые скиллы/агенты могут ветвиться по кодам `1/2/3/4`. Сохранение контракта избегает тихой поломки потребителей при переходе bash → TypeScript.
- **Risk accepted:** Нет — это совместимость.

### D-SX003 — Маркеры matched по `trim()`-сравнению целой строки

- **Status:** active
- **Why:** `extract-section.sh` (awk `$0 == start`) требовал маркер flush-влево, а `scan.sh` допускал отступ (`^[[:space:]]*`). Расхождение в старом коде. v2 берёт более терпимый вариант — отступ допускается, что устойчивее к ручному редактированию.
- **Risk accepted:** Маркер внутри inline-кода на отдельной строке теоретически совпадёт — на практике маркеры всегда на своих строках.

### D-SX004 — Диагностика промаха идёт в stdout (не stderr)

- **Status:** active
- **Why:** Потребитель — AI-агент, читающий stdout тула; `AX_BASH_NO_SILENT_EMPTY` требует actionable-инструкцию в stdout. Exit-код разделяет успех/промах. Совпадает с поведением `extract-section.sh`.
- **Risk accepted:** Низкий — логи состояния идут в stderr через logger, поэтому pipe тела секции не загрязняется.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts` (парсинг CLI-аргументов), `shared/sdd/section.ts` (ядро), `#logger`
- **Provides to:** `gennady.ts` (регистрация команды); `shared/sdd/section.ts` — будущим `sdd-check` / `sdd-task`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
