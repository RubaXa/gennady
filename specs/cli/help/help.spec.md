# Module: help

## 1. Module Vision

Статическая команда `gennady help` — выводит таблицу всех CLI-команд с описанием и примерами в stdout. Без аргументов (кроме опционального имени команды для детальной справки), без DI, без опций.

→ Parent scope: [../../cli/cli.spec.md](../../cli/cli.spec.md)

## 2. Entity Inventory (Closed-World)

| Name            | Type     | Purpose                                                     |
| --------------- | -------- | ----------------------------------------------------------- |
| `helpCommand`   | Function | Точка входа CLI: печать таблицы команд или справки по одной |
| `COMMAND_TABLE` | Constant | Статическая таблица всех команд: имя, описание, пример      |
| `printHelpAll`  | Function | Вывод полной таблицы команд в stdout                        |
| `printHelpOne`  | Function | Вывод детальной справки по одной команде                    |

## 3. Entity Surfaces

### `helpCommand`

- **Type:** Function
- **Purpose:** Точка входа для `gennady help`: печать таблицы всех команд или справки по конкретной.
- **Signature:** `(argv: string[]) => void`
- **Contract:**
  - Без аргументов → печать полной таблицы команд, exit 0
  - `<command>` → печать справки по конкретной команде (если найдена), exit 0
  - Неизвестная команда → stderr `Unknown command: <name>`, exit 1
- **Side Effect:** stdout (таблица команд), stderr (ошибки)

### `COMMAND_TABLE`

- **Type:** Constant
- **Purpose:** Канонический источник описаний всех CLI-команд.
- **Contract:** Каждая запись содержит: `name`, `description`, `example`. Таблица статична — добавление новой команды требует обновления `COMMAND_TABLE`.

### `printHelpAll`

- **Type:** Function (internal)
- **Purpose:** Форматирование и вывод полной таблицы команд.
- **Signature:** `() => void`
- **Contract:** Выводит таблицу в stdout: имя команды | описание | пример.

### `printHelpOne`

- **Type:** Function (internal)
- **Purpose:** Форматирование и вывод детальной справки по одной команде.
- **Signature:** `(commandName: string) => void`
- **Contract:** Выводит в stdout: имя команды, описание, список флагов, примеры использования.

## 4. CLI Interface

### Аргументы

| Флаг          | Кратко | Описание                                    |
| ------------- | ------ | ------------------------------------------- |
| `[command]`   | —      | Имя команды для детальной справки (опционально) |

### Golden DX

```bash
# --- полная таблица команд ---
$ gennady help

Commands:

  lint           Lint TypeScript files with 3-pass validation
  cat            Collect file contents in XML/MD for AI agents
  sync           Sync ai/directives/ from npm package
  sync-skills    Sync SDD skills into .claude/skills/
  orient         Navigate project via file-header and DBC contracts
  run            Run AI agent with a task
  review-issues  Fetch GitLab MR discussions as XML
  inbox          Interactive GitLab MR inbox assistant
  vcs-worktree   Prepare read-only git worktree for code review
  vcs-reply      Post replies to GitLab MR discussions
  vcs-approve    Approve GitLab MR via API
  alt-opinion    Get alternative opinions from AI models
  agents-rules   Print agent instructions for orient command

Examples:
  gennady lint src/**/*.ts
  gennady cat src/ --ext=".ts,.md" -o md
  gennady orient --task=TSK-01
  gennady run "explain this repo" --dir ../other

Run gennady help <command> for detailed help on a specific command.

# exit 0

# --- справка по конкретной команде ---
$ gennady help lint

lint — Lint TypeScript files with 3-pass validation

Usage: gennady lint [--autofix] [--staged] [--max-words <n>] [--max-region-comments <n>] [--max-invariants <n>] <paths...>

Flags:
  --autofix         Auto-fix fixable errors
  --staged          Lint only staged .ts files (mutually exclusive with positional targets)
  --max-words <n>   Max words per file (default: 50)
  ...

Examples:
  gennady lint src/foo.ts
  gennady lint --staged
  gennady lint --autofix src/

See: specs/cli/cli.spec.md §3 (lint DX)

# exit 0

# --- справка по orient ---
$ gennady help orient

orient — Navigate project via file-header and DBC contracts

Usage: gennady orient [--task=<id>] [--consumer=<name>] [--file=<path>] [--entity=<name>] [--graph] [--specs] [--spec=<path>] [--detail] [--fuzzy] [--dir=<path>] [--max-results=<n>] [<keyword>]

Flags:
  --task=<id>        Find files by task ID
  --consumer=<name>  Find files consumed by a module
  --file=<path>      Inspect a specific file in detail
  --entity=<name>    Search for an exported entity (supports --fuzzy)
  --graph            Show dependency graph
  --specs            Overview of all specs and their tasks
  --spec=<path>      Search by a specific spec
  --detail           Show exports for each file
  --fuzzy            Enable fuzzy matching for --entity
  --dir=<path>       Filter results by directory
  --max-results=<n>  Limit number of results

Examples:
  gennady orient                           # project map
  gennady orient --task=TSK-01             # find files by task
  gennady orient --consumer=DbcTsLinter    # find consumers
  gennady orient "merge conflict"          # keyword search
  gennady orient --file=src/foo.ts         # file detail
  gennady orient --entity=DbcJsDocParser   # entity search

See: specs/cli/cli.spec.md §3.5 (orient DX)

# exit 0

# --- ошибка: неизвестная команда ---
$ gennady help nonexistent

Unknown command: nonexistent
Run gennady help for a list of available commands.

# exit 1
```

## 5. Architecture

```
cli/cmd/help/
├── help.cmd.ts           # helpCommand, COMMAND_TABLE, printHelpAll, printHelpOne
└── __tests__/
    └── help.cmd.test.ts
```

**Поток выполнения:**
1. `gennady.ts` → динамический импорт `cmd/help/help.cmd.ts`
2. `helpCommand(process.argv)`
3. Если нет позиционных аргументов → `printHelpAll()` → stdout, exit 0
4. Если есть позиционный аргумент `<command>` → поиск в `COMMAND_TABLE`
5. Найдена → `printHelpOne(commandName)` → stdout, exit 0
6. Не найдена → stderr `Unknown command: <name>`, exit 1

## 6. Decision Log

### D-001 — Статическая `COMMAND_TABLE` как канонический источник
- **Status:** active
- **Recorded:** session Discovery, cli/help
- **Why:** Все описания команд хранятся в одной константе — единый источник правды. При добавлении новой команды разработчик обновляет `COMMAND_TABLE`. Никакой магии с авто-дискавери или чтением других спек.
- **Rejected alternatives:** Авто-генерация из файловой системы (needless complexity для 13 команд). Чтение из спек (связывает CLI со структурой specs/).

### D-002 — `help` без DI, без внешних зависимостей
- **Status:** active
- **Recorded:** session Discovery, cli/help
- **Why:** Команда чисто статическая: печатает предопределённый текст. Не нуждается в DI-контейнере, VCS-клиентах или файловой системе. Самый простой возможный модуль.
- **Rejected alternatives:** Интеграция с DI (избыточно для статического вывода).

### D-003 — `help <command>` для детальной справки
- **Status:** active
- **Recorded:** session Discovery, cli/help
- **Why:** Пользователь (человек или агент) может получить детальную справку по конкретной команде: флаги, примеры, ссылку на спек. Без аргумента — обзорная таблица.
- **Rejected alternatives:** Только обзорная таблица (недостаточно для изучения конкретной команды). Слишком детальный вывод по всем командам сразу (перегружает stdout).

## 7. File Structure

```
cli/cmd/help/
├── help.cmd.ts
└── __tests__/
    └── help.cmd.test.ts
```

## 8. Bootstrap Requirements

| Requirement     | Kind          | Owner         | Resolution                |
| --------------- | ------------- | ------------- | ------------------------- |
| `COMMAND_TABLE` | internal-const | cli/cmd/help | Встроена в `help.cmd.ts`  |

## 9. Handoff to Task Scaffolding

- **Implementation files:** 1 исходный файл + 1 тестовый
- **Stack dependencies:** TypeScript, node:test
- **Named abstractions:** `helpCommand`, `COMMAND_TABLE`, `printHelpAll`, `printHelpOne`
- **Open risks:**
  - `COMMAND_TABLE` должна обновляться вручную при добавлении новых команд — риск рассинхронизации
  - `gennady help` не зависит от других модулей — можно реализовать в изоляции
