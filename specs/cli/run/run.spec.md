# Module: run

## 1. Module Vision

CLI-обёртка `gennady run` над `services/agent-run/`. Парсит `--dir`, `--model`, `--engine`, `--timeout` и делегирует в движок запуска агентов (opencode). Тонкий слой: вся логика запуска, обнаружения движков и маппинга ошибок — в `agent-run`. CLI только валидирует аргументы, вызывает `run()` и печатает результат или ошибку.

→ Parent scope: [../../agent-run/agent-run.spec.md](../../agent-run/agent-run.spec.md)

> **Не дублирует `agent-run.spec.md`.** Описывает только CLI-слой: парсинг аргументов, валидацию, формат вывода. Вся логика движков, маппинг ошибок, readonly-профиль, env-гигиена — в спеке `agent-run`.

## 2. Entity Inventory (Closed-World)

| Name            | Type     | Purpose                                                                               |
| --------------- | -------- | ------------------------------------------------------------------------------------- |
| `runCommand`    | Function | Точка входа CLI: парсинг аргументов → валидация → `run()` → stdout/stderr + exit code |
| `parseRunArgs`  | Function | Внутренняя: парсинг `process.argv` в `{ task, dirs?, model?, engine?, timeout? }`     |
| `run`           | Function | Импорт из `@services/agent-run`: запуск AI-движка с заданием                          |
| `AgentRunError` | Class    | Импорт из `@services/agent-run`: типизированная ошибка с `code` и `hint`              |
| `printHelp`     | Function | Вывод справки по команде                                                              |

## 3. Entity Surfaces

### `runCommand`

- **Type:** Function
- **Purpose:** Точка входа для `gennady run`: валидация задачи, вызов `run()`, печать результата или ошибки.
- **Signature:** `(argv: string[]) => Promise<void>`
- **Contract:**
  - Пустая/отсутствующая задача → usage в stderr, exit 1
  - `AgentRunError` → stderr `✗ <hint>   [<code>]`, exit 1 (message не печатается)
  - Другие ошибки → stderr `✗ Unexpected error: ...`, exit 1
  - Успех → stdout `result.text + '\n'`, exit 0
- **Side Effect:** stdout (результат), stderr (ошибки/usage), process.exit

### `parseRunArgs`

- **Type:** Function (internal)
- **Purpose:** Нормализация `process.argv` в структурированный объект опций.
- **Signature:** `(argv: string[]) => { task, dirs?, model?, engine?, timeout? }`
- **Contract:**
  - `--dir` — repeatable; отсутствие → `dirs` = undefined (движок использует cwd)
  - `--timeout` — валидация: должен быть положительным конечным числом; иначе stderr + exit 1
  - Первый позиционный аргумент — `task` (текст задания)

## 4. CLI Interface

### Аргументы

| Флаг             | Кратко | Описание                                                                              |
| ---------------- | ------ | ------------------------------------------------------------------------------------- |
| `<task>`         | —      | Текст задания для AI-агента (обязательный, позиционный)                               |
| `--dir <path>`   | —      | Рабочая директория; repeatable для нескольких репозиториев/папок (default: cwd)       |
| `--model <id>`   | —      | Модель в формате `provider/model`, напр. `llm-proxy/glm-4.7` (default: дефолт движка) |
| `--engine <id>`  | —      | Движок для запуска (default: `opencode`, первый установленный)                        |
| `--timeout <ms>` | —      | Жёсткий лимит времени на запуск в мс (default: 1800000 = 30 мин)                      |
| `--help`, `-h`   | —      | Вывод справки                                                                         |

### Golden DX

```bash
# --- базовый запуск ---
$ gennady run "опиши этот репозиторий в одном предложении"
<markdown-ответ движка>

# --- несколько директорий (анализ связей) ---
$ gennady run "как связаны эти репозитории?" --dir ../repoA --dir ../repoB
<markdown-ответ движка>

# --- явная модель ---
$ gennady run "проверь cli/cmd/run на баги" --model llm-proxy/glm-4.7

# --- явный движок ---
$ gennady run "..." --engine opencode

# --- таймаут 10 минут ---
$ gennady run "..." --timeout 600000

# --- ошибка: нет задания ---
$ gennady run
Usage: gennady run "<task>" [--dir <dir>]... [--model <model>] [--engine <engine>] [--timeout <ms>]

# --- ошибка: модель недоступна ---
$ gennady run "..." --model нет/такой
✗ Модель «нет/такой» недоступна. Доступные: llm-proxy/deepseek-v4-pro, google/gemini-2.5-pro, ...
  Что сделать: выбери модель из списка через --model.   [MODEL_UNAVAILABLE]

# --- ошибка: движок не установлен ---
$ gennady run "..." --engine missing
✗ Агент не найден. Установите opencode.   [AGENT_NOT_INSTALLED]

# --- ошибка: невалидный таймаут ---
$ gennady run "..." --timeout abc
✗ --timeout must be a positive number of milliseconds, got: abc
```

## 5. Architecture

```
cli/cmd/run/
├── index.ts              # import { runCommand } → runCommand(process.argv)
├── run.cmd.ts            # parseRunArgs + runCommand: CLI-обвязка над agent-run
├── help.ts               # printHelp()
└── __tests__/
    └── run.cmd.test.ts
```

**Поток выполнения:**

1. `gennady.ts` → динамический импорт `cmd/run/index.ts`
2. `index.ts` → `runCommand(process.argv)`
3. `parseRunArgs(argv)` → `{ task, dirs?, model?, engine?, timeout? }`
4. Валидация: `task` пуст → usage в stderr, exit 1
5. `run({ task, dirs, model, engine, timeout })` → делегирование в `services/agent-run`
6. Успех: `stdout.write(result.text + '\n')`, exit 0
7. `AgentRunError`: `stderr.write('✗ <hint>   [<code>]\n')`, exit 1
8. Другие ошибки: `stderr.write('✗ Unexpected error: ...\n')`, exit 1

**Граница ответственности:**

- CLI (`run.cmd.ts`): парсинг, валидация, формат вывода (`✗ <hint>   [<code>]`), exit codes
- `agent-run` (`services/agent-run/`): обнаружение движков, запуск `opencode run`, маппинг ошибок (stderr → `AgentRunError`), readonly-профиль, env-гигиена, timeout

## 6. Decision Log

### D-001 — CLI как тонкая обёртка, не содержащая логики движков

- **Status:** active
- **Recorded:** session Discovery, cli/run
- **Why:** Вся логика запуска, обнаружения движков, маппинга ошибок и env-гигиены — в `services/agent-run`. CLI только парсит аргументы, вызывает `run()` и форматирует вывод. Это разделение позволяет переиспользовать `agent-run` из других контекстов (не только CLI).
- **Rejected alternatives:** Встроить логику движка в CLI (нарушает переиспользование, смешивает слои).

### D-002 — Валидация `--timeout` на уровне CLI, а не в `agent-run`

- **Status:** active
- **Recorded:** session Discovery, cli/run
- **Why:** CLI принимает строку из командной строки, `agent-run` ожидает `number`. CLI валидирует и парсит на границе ввода, чтобы `agent-run` не работал со строками и NaN не просочился в `setTimeout`.
- **Rejected alternatives:** Парсить в `agent-run` (входной тип был бы `string | number`, слабее контракт).

### D-003 — `process.exit` в CLI, а не проброс кода наверх

- **Status:** active
- **Recorded:** session Discovery, cli/run
- **Why:** `runCommand` вызывается как точка входа CLI и сама управляет exit code. Это изолирует тесты (мок `process.exit`) от реального завершения процесса, и `agent-run` не зависит от `process.exit`.
- **Rejected alternatives:** Возвращать exit code и вызывать `process.exit` в `index.ts` (усложняет обработку ошибок тестами).

### D-004 — `--dir` отсутствует → undefined (не cwd)

- **Status:** active
- **Recorded:** session Discovery, cli/run
- **Why:** CLI передаёт `dirs` только если явно указан `--dir`. Если не указан — `undefined`, и движок сам использует cwd. CLI не должен подставлять `[process.cwd()]`, чтобы не переопределять поведение движка по умолчанию.
- **Rejected alternatives:** Всегда передавать `[cwd()]` (ломает семантику «дефолт движка»).

## 7. File Structure

```
cli/cmd/run/
├── index.ts
├── run.cmd.ts
├── help.ts
└── __tests__/
    └── run.cmd.test.ts
```

## 8. Bootstrap Requirements

| Requirement     | Kind          | Owner              | Resolution                                                 |
| --------------- | ------------- | ------------------ | ---------------------------------------------------------- |
| `run`           | external-fn   | services/agent-run | ✅ `@services/agent-run` index.ts                          |
| `AgentRunError` | external-type | services/agent-run | ✅ `@services/agent-run` index.ts                          |
| `logger`        | external-fn   | shared/common      | ✅ `#logger`                                               |
| opencode CLI    | tool          | operator-action    | Оператор устанавливает; отсутствие → `AGENT_NOT_INSTALLED` |

## 9. Handoff to Task Scaffolding

- **Implementation files:** 3 исходных файла + 1 тестовый
- **Stack dependencies:** TypeScript, node:test, `node:util` (parseArgs), `@services/agent-run`
- **Named abstractions:** `runCommand`, `parseRunArgs`, `AgentRunError`
- **Open risks:**
  - `runCommand` вызывает `process.exit` — тесты должны мокать `process.exit`
  - `--timeout` валидация на уровне CLI дублирует контракт `agent-run` (должна быть синхронной)
  - Новые `ErrorCode` в `agent-run` не требуют изменений CLI (вывод инвариантен: `✗ <hint>   [<code>]`)
