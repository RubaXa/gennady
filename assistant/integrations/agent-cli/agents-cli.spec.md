## agent-cli

Расширяемая система для определения начличия и обеспечения взаимодействия с различными CLI-агентами (Cursor, Codex, Claude).

### 1. Файловая структура (File Tree)

**Слой:** `Infrastructure / Integrations`
**Рабочая директория:** `assistant`

```text
integrations/
  └── agent-cli/
      ├── core/                                # [Contracts & DTOs]
      │   ├── agent-cli-adapter.type.ts        # IAgentCliAdapter
      │   ├── agent-cli-options.type.ts        # GenerateOptions
      │   ├── agent-cli-session.type.ts        # SessionContext
      │   └── agent-cli-event.type.ts          # AgentEvent, AgentEventType
      │
      ├── adapters/                            # [Implementations]
      │   ├── claude/
      │   │   ├── claude-cli-adapter.ts        # class ClaudeCliAdapter
      │   │   └── claude-cli-parser.ts         # JSON stream helper
      │   ├── codex/
      │   │   ├── codex-cli-adapter.ts         # class CodexCliAdapter
      │   │   └── codex-cli-toml.ts            # Config generation helper
      │   └── cursor/
      │       └── cursor-cli-adapter.ts        # class CursorCliAdapter
      │
      └── agent-cli-registry.ts                # [Discovery Module]
```

### IAgentCliAdapter (Interface)

#### Описание

- **Purpose**: Единый контракт для всех CLI-агентов (Cursor, Codex, Claude). Абстрагирует различия в синтаксисе флагов, управлении процессами и протоколах ввода-вывода. Обеспечивает полиморфизм: оркестратор не знает, с каким именно бинарником он работает.
- **Consumer**: Orchestrator Service, AI Gateway, CI/CD Pipeline Runners.

#### API:

- **id**: `string`
  - **Purpose**: Уникальный идентификатор реализации адаптера.
  - **Consumer**: Логирование, метрики, динамическая загрузка адаптеров.

- **detect**(): `Promise<ToolInstallation>`
  - **Purpose**: Проверка наличия CLI-инструмента в среде исполнения (PATH) и определение его версии.
  - **Consumer**: Health Check сервисы, инициализация воркеров.
  - **Returns**: Объект с флагом `isInstalled` и версией.
  - **Side Effects**: Запускает процесс с флагом `--version`.

- **getAvailableModels**(): `Promise<string[]>`
  - **Purpose**: Возвращает список доступных для данного CLI моделей (парсинг вывода команды `list-models` или хардкод-список поддерживаемых).
  - **Consumer**: UI (выпадающий список выбора модели).

- **createSession**(`baseDir`: string): `Promise<SessionContext>`
  - **Purpose**: Подготовка изолированного окружения для stateful-взаимодействия. Создает физическую директорию сессии и, при необходимости, инициирует внутреннюю БД агента.
  - **Consumer**: Оркестратор перед началом многошагового диалога.
  - **Arguments**:
    - **baseDir**: `string` — Корневой путь, где будут создаваться папки сессий (например `/tmp/agent_sessions`). (**required**)
  - **Returns**: Контекст сессии с уникальным ID и путями.
  - **Postcondition**: Директория `sessionDir` создана и готова к записи конфигов.

- **generate**(`options`: GenerateOptions): `Promise<GenerateResult>`
  - **Purpose**: Основной метод исполнения. Запускает агент, транслирует опции в аргументы командной строки, управляет жизненным циклом процесса и стримит события.
  - **Consumer**: Бизнес-логика выполнения задач.
  - **Invariants**:
    - Процесс всегда запускается в изолированном `cwd`.
    - `stdout` всегда перехватывается.
  - **Preconditions**: Если передан `session`, то `session.sessionDir` должен существовать.
  - **Arguments**:
    - **options**: `GenerateOptions` — Полная конфигурация запуска (промпт, тулы, контекст). (**required**)
  - **Returns**: Финальный результат выполнения (текст + код выхода).
  - **Side Effects**:
    - Spawns child process.
    - IO operations (создание временных файлов конфигов).
    - Network activity (если агент ходит в интернет).

- **cleanupSession**(`session`: SessionContext): `Promise<void>`
  - **Purpose**: Освобождение ресурсов. Удаление временных файлов, директорий сессий и остановка зомби-процессов.
  - **Consumer**: Garbage Collector, `finally` блок выполнения задачи.
  - **Side Effects**: `fs.rm + recursive` целевой директории сессии.

#### Specificity:

1.  **Изоляция (Environment Isolation)**:
    - Реализация **должна** устанавливать переменную окружения `HOME` (и `XDG_CONFIG_HOME`) равной `session.sessionDir`. Это заставляет CLI писать логи, историю и кэши строго внутрь папки сессии, не загрязняя хост-систему.
2.  **Обработка MCP**:
    - Адаптер **не должен** передавать JSON-конфиги MCP через аргументы командной строки (избегание `ARG_MAX` и инъекций).
    - Вместо этого адаптер должен сериализовать `options.mcpServers` во временный файл внутри `sessionDir` и передать путь к этому файлу через соответствующий флаг (напр. `--mcp-config` или `-c include`).

---

### GenerateOptions (Type)

#### Описание

- **Purpose**: Data Transfer Object (DTO), описывающий "Intent" (намерение) выполнения. Содержит всё необходимое для запуска агента, но очищен от специфики конкретного CLI.
- **Consumer**: IAgentCliAdapter.

#### API:

- **prompt**: `string`
  - **Purpose**: Текст инструкции для LLM.
- **cwd**: `string`
  - **Purpose**: Рабочая директория, в которой агент будет выполнять файловые операции (читать код, писать файлы). Это **не** директория хранения сессии, а директория проекта пользователя.
- **session**: `SessionContext` (**optional**)
  - **Purpose**: Если передано, агент восстанавливает контекст предыдущего диалога. Если `undefined` — режим "One-shot" (амнезия).
- **mcpServers**: `McpServerConfig[]` (**optional**)
  - **Purpose**: Список внешних инструментов (MCP), которые должны быть доступны агенту.
- **allowedBashCommands**: `string[]` (**optional**)
  - **Purpose**: Whitelist для нативных команд (glob patterns). Например: `['git status', 'npm test']`.
- **env**: `Record<string, string>` (**optional**)
  - **Purpose**: Дополнительные переменные окружения, специфичные для проекта (например `API_KEY` для кода пользователя).
- **onProgress**: `(event: AgentEvent) => void` (**optional**)
  - **Purpose**: Callback для получения событий в реальном времени (стриминг токенов, логи использования инструментов).
- **model**: `string` (**optional**)
  - **Purpose**: Явный выбор модели LLM (например, `claude-3-5-sonnet`, `o3-mini`). Если не указано, адаптер использует дефолтную модель инструмента.
- **temperature**: `number` (**optional**, 0.0–1.0)
  - **Purpose**: Управление креативностью генерации.

#### Specificity:

1.  **Приоритет конфигурации**: Опции `allowedBashCommands` и `mcpServers` имеют приоритет над любыми внутренними настройками агента.
2.  **Безопасность**: Адаптер должен игнорировать попытки передать опасные переменные в `env` (например, переопределить `PATH`, если это запрещено политикой).

---

### AgentEvent (Type)

#### Описание

- **Purpose**: Универсальная структура события для Observability. Позволяет UI рисовать "думающий" интерфейс, а системе логов — трекать вызовы инструментов.
- **Consumer**: Frontend UI, Logging Systems.

#### API:

- **type**: `'thought' | 'tool_call' | 'tool_result' | 'text_delta' | 'error'`
  - **Purpose**: Тип события.
- **payload**: `any`
  - **Purpose**: Данные события.
  - **Consumer**:
    - Для `text_delta`: строка (токен).
    - Для `tool_call`: `{ tool: string, args: object }`.
    - Для `thought`: строка (chain of thought log).
- **timestamp**: `number`
  - **Purpose**: Unix timestamp момента возникновения.

#### Specificity:

1.  **Различия в разрешении (Resolution Discrepancy)**:
    - **Claude/Cursor**: Генерируют богатые события (`tool_call` с аргументами). Адаптер парсит JSON-стрим.
    - **Codex**: Генерирует преимущественно `text_delta`. Адаптер может пытаться эвристически детектировать использование тулов, но по умолчанию маркирует вывод как текст.

---

### SessionContext (Type)

#### Описание

- **Purpose**: Дескриптор, связывающий логическую сессию с физическими ресурсами.
- **Consumer**: Оркестратор, Адаптер.

#### API:

- **sessionId**: `string`
  - **Purpose**: Уникальный ID (UUID).
- **sessionDir**: `string`
  - **Purpose**: Абсолютный путь к изолированной папке на диске, где хранится state агента (история чата, конфиги).

#### Specificity:

1.  **Codex Implementation**: Для Codex `sessionDir` используется как значение `HOME`. Восстановление сессии происходит через `codex resume --last` _в контексте этой директории_.
2.  **Claude Implementation**: Использует `sessionId` для флагов `--session-id`. Файлы хранит в `sessionDir/.claude`.

---

### McpServerConfig (Type)

#### Описание

- **Purpose**: Декларативное описание запускаемого MCP-сервера. Агент сам (через адаптер) поднимет этот сервер или подключится к нему.
- **Consumer**: Адаптер (для генерации конфиг-файлов).

#### API:

- **id**: `string`
  - **Purpose**: Внутренний идентификатор для логов.
- **command**: `string`
  - **Purpose**: Исполняемый файл (например `docker`, `node`, `uv`).
- **args**: `string[]` (**optional**)
  - **Purpose**: Аргументы запуска.
- **env**: `Record<string, string>` (**optional**)
  - **Purpose**: Env vars для процесса MCP-сервера.

#### Specificity:

1.  **Transport**: Подразумевается `stdio` транспорт.
2.  **Injection Strategy**:
    - **Claude**: Конвертируется в JSON для `--mcp-config`.
    - **Codex**: Конвертируется в TOML для `-c`.
    - **Cursor**: Требует предварительной записи в `.cursor/mcp.json` (или воркспейс-конфиг).

---

### GenerateResult (Type)

#### Описание

- **Purpose**: Итог выполнения задачи.
- **Consumer**: Оркестратор.

#### API:

- **stdout**: `string`
  - **Purpose**: Полный текст ответа агента (агрегированный из стрима).
- **stderr**: `string`
  - **Purpose**: Логи ошибок процесса.
- **exitCode**: `number`
  - **Purpose**: Код выхода процесса (0 - успех).

#### Specificity:

1.  **Error Handling**: Если `exitCode !== 0`, оркестратор должен считать задачу проваленной, даже если в `stdout` есть текст.
2.  **Structured Output**: Если агент был проинструктирован возвращать JSON, `stdout` будет содержать этот JSON (возможно, обрамленный markdown-блоками, которые консумер должен уметь чистить).

---

### ClaudeAgentAdapter (Class)

- https://code.claude.com/docs/en/cli-reference

#### Описание

- **See**: `IAgentCliAdapter` (Implementation)
- **Purpose**: Реализация для Claude Code. Обеспечивает самую высокую гранулярность контроля безопасности и лучшую наблюдаемость (JSON-стриминг).
- **Target Version**: Claude Code CLI (2026 release).

#### Specific Implementation Details:

1.  **Session Management (Изоляция)**:
    - **Strategy**: `Explicit ID`.
    - **Implementation**:
      - При `createSession`: Генерирует UUID v4. Создает структуру папок `sessionDir/.claude`.
      - При `generate`: Всегда передает флаг `--session-id <session.sessionId>`.
      - **Обязательно** использовать флаг `--setting-sources local` вместе с изоляцией директорий (`HOME`/`XDG_CONFIG_HOME` = `sessionDir`), чтобы предотвратить чтение глобальных конфигов пользователя.

2.  **MCP Injection (Native Support)**:
    - **Strategy**: `Ephemeral Config File`.
    - **Implementation**:
      - Сериализует массив `McpServerConfig[]` в файл `mcp_config.json` внутри `sessionDir`.
      - Вызывает CLI с флагами: `--mcp-config <path/to/mcp_config.json> --strict-mcp-config`.

3.  **Command Construction (Mapping)**:
    - **Mode**: Headless (`-p`).
    - **Bash Control**:
      - Массив `allowedBashCommands` (строки) транслируется в формат `Bash(<glob>)` для флага `--allowedTools`, например: `["git:*", "npm:*"]` → `--allowedTools "Bash(git:*)" "Bash(npm:*)"`.
      - Если пуст/null: Используется дефолт или `--dangerously-skip-permissions` (если разрешено политикой).
    - **Output**: `--output-format stream-json` для парсинга событий.

4.  **Observability (Mapping)**:
    - Парсит `stdout` построчно как JSON.
    - `type: "content_block_delta"` → `AgentEvent.text_delta`.
    - `type: "tool_use"` → `AgentEvent.tool_call` (с аргументами).
    - `type: "tool_result"` → `AgentEvent.tool_result`.

---

### CodexAgentAdapter (Class)

- https://developers.openai.com/codex/cli/features
- https://developers.openai.com/codex/cli/reference

#### Описание

- **See**: `IAgentCliAdapter` (Implementation)
- **Purpose**: Реализация для Codex CLI. Основной вызов — обход отсутствия явного управления ID сессий и работа с TOML-конфигурацией.
- **Target Version**: Codex CLI v2+.

#### Specific Implementation Details:

1.  **Session Management (Изоляция)**:
    - **Strategy**: `Environment Hijacking`.
    - **Implementation**:
      - При `createSession`: Создает `sessionDir`.
      - При `generate`: **Критически важно** установить переменную окружения `HOME` = `sessionDir`. Это заставляет Codex хранить стейт сессии (`.codex/sessions`) изолированно.
      - Флаг запуска: `codex resume --last` (внутри изолированного HOME это всегда будет "текущая" сессия). Для первого запуска используется `codex exec`.

2.  **MCP Injection (TOML Injection)**:
    - **Strategy**: `Config Override File`.
    - **Implementation**:
      - Сериализует `McpServerConfig[]` в файл `config.toml` по пути `sessionDir/.codex/config.toml`.
      - ИЛИ использует флаг `-c` для инъекции пути к этому файлу, если версия позволяет.
      - Альтернатива: `-c 'mcp.servers.server1={...}'` (менее надежно из-за экранирования). Рекомендуется файловый метод.

3.  **Command Construction (Mapping)**:
    - **Mode**: `exec` (или `-a never` для подавления вопросов).
    - **Model**: Поддержка флага `--model` (или `--oss` для локальных моделей); передача `options.model` из `GenerateOptions`.
    - **Bash Control**:
      - Codex не поддерживает whitelist команд.
      - Если `allowedBashCommands` передан → Игнорируется (с Warning в лог), включается `-s workspace-write`.
      - Безопасность обеспечивается только на уровне файловой системы (Sandboxing).

4.  **Observability (Mapping)** и **GenerateResult**:
    - **Формат вывода**: `GenerateResult` формируется из **Raw Text** (`text_delta`). Структурированный JSON-вывод событий (`tool_call`) в текущей версии CLI нестабилен или отсутствует.
    - Весь `stdout` транслируется как `AgentEvent.text_delta`.
    - События `tool_call` недоступны (или требуют сложного Regex-парсинга вывода "Thinking").

---

### CursorAgentAdapter (Class)

- https://cursor.com/docs/cli/overview

#### Описание

- **See**: `IAgentCliAdapter` (Implementation)
- **Purpose**: Реализация для Cursor Agent. Работает через внутренний API IDE. Требует управления состоянием "чата" через проприетарные команды.
- **Target Version**: Cursor CLI (Agent Mode).

#### Specific Implementation Details:

1.  **Detection**:
    - Адаптер проверяет наличие исполняемого `cursor` (с подкомандой) **или** `agent`. Приоритет — `cursor`.

2.  **Session Management (Изоляция)**:
    - **Strategy**: `Chat ID Token`.
    - **Implementation**:
      - При `createSession`: Вызывает `agent create-chat`. Парсит `stdout` для извлечения ID (например, `chat-12345`). Сохраняет ID в контексте.
      - При `generate`: Использует флаг `--resume <session.sessionId>`.

3.  **MCP Injection (Workspace Config)**:
    - **Strategy**: `Pre-flight Setup`.
    - **Implementation**:
      - Cursor считывает MCP из настроек воркспейса.
      - Адаптер должен записать файл `.cursor/mcp.json` в `options.cwd` **перед** запуском агента.
      - Флаг запуска: `--approve-mcps` (обязательно для headless, иначе процесс зависнет).

4.  **Command Construction (Mapping)**:
    - **Mode**: `-p` (print mode).
    - **Model**: Поддержка флага `--model` при вызове генерации (передача `options.model` из `GenerateOptions`).
    - **Bash Control**:
      - Бинарная логика: `--force` (разрешить всё) или отсутствие флага (интерактивный режим, который зависнет в headless).
      - Если `allowedBashCommands` не пуст → Добавляет `--force`.
    - **Output**: `--output-format stream-json` (JSONL поток).

5.  **Observability (Mapping)**:
    - Аналогично Claude, поддерживает JSON-стрим.
    - Парсит строки JSONL.
    - Маппит внутренние события Cursor (могут отличаться схемой от Claude) в универсальный `AgentEvent`.

---

### Сводная таблица специфики ("Cheat Sheet" для разработчика)

| Feature           | Claude Adapter                   | Codex Adapter                 | Cursor Adapter                  |
| :---------------- | :------------------------------- | :---------------------------- | :------------------------------ |
| **Session Flag**  | `--session-id <UUID>`            | `env.HOME=<DIR>` + `--last`   | `create-chat` → `--resume <ID>` |
| **MCP Config**    | `--mcp-config <FILE>`            | Write to `.codex/config.toml` | Write to `.cursor/mcp.json`     |
| **Headless Flag** | `-p`                             | `exec` / `-a never`           | `-p`                            |
| **Bash Safety**   | Regex Whitelist (`allowedTools`) | FS Sandbox only (`-s`)        | All (`--force`) or Nothing      |
| **Output Type**   | JSON Stream                      | Raw Text                      | JSON Stream                     |
| **Dependencies**  | Node.js Runtime                  | Local LLM / Server            | Installed Cursor IDE            |

---

### AgentCliRegistry (Class/Module)

#### Описание

- **Purpose**: Центральная точка входа (Entry Point) для подсистемы CLI-агентов. Отвечает за **Discovery** (обнаружение установленных инструментов в среде) и **Factory** (создание экземпляров адаптеров). Скрывает сложность инстанцирования конкретных классов.
- **Consumer**: Orchestrator Service, Startup Logic, User Settings UI (для отображения доступных бэкендов).

#### API:

- **listAvailableAdapters**(): `Promise<IAgentCliAdapter[]>`
  - **Purpose**: Возвращает список **только тех** адаптеров, которые реально установлены в системе и готовы к работе.
  - **Consumer**: Основной цикл оркестратора. Вызывается при старте приложения.
  - **Returns**: Массив инициализированных экземпляров, прошедших проверку `detect()`.
  - **Side Effects**: Запускает `child_process.spawn` для проверки версий (`--version`) каждого известного инструмента.

- **getAdapterById**(`id`: 'claude' | 'codex' | 'cursor'): `IAgentCliAdapter | undefined`
  - **Purpose**: Получение конкретного адаптера по ID (например, если пользователь выбрал "всегда использовать Claude").
  - **Returns**: Экземпляр адаптера (даже если он не установлен — проверка ложится на вызывающего) или `undefined`, если ID неизвестен системе.

- **registerAdapter**(`adapter`: IAgentCliAdapter): `void`
  - **Purpose**: (Optional/Advanced) Метод для динамической регистрации новых адаптеров в рантайме (плагинная система).
  - **Consumer**: Plugin Loader.

#### Specificity:

1.  **Parallel Discovery Strategy** и **Parallel Execution Policy**:
    - Реестр **должен** запускать проверки `detect()` параллельно, а не последовательно. Проверка версии CLI — это IO-операция (spawn процесса), и последовательный запуск трех инструментов добавит лишние секунды к старту приложения.
    - **Отказоустойчивость**: Метод `listAvailableAdapters` должен использовать стратегию `Promise.allSettled` (или аналог). Ошибка детекта одного инструмента не должна блокировать возврат остальных; упавшие адаптеры исключаются из результата и логируются.
    - **Пример логики**:
      ```typescript
      const adapters = [new ClaudeCliAdapter(), new CodexCliAdapter(), new CursorCliAdapter()];
      const results = await Promise.allSettled(
        adapters.map((a) => a.detect().then((info) => ({ adapter: a, info })))
      );
      return results
        .filter((r) => r.status === 'fulfilled' && r.value.info.isInstalled)
        .map((r) => r.value.adapter);
      ```

2.  **Singleton Pattern**:
    - Адаптеры, как правило, не хранят внутреннего стейта (стейт передается в `generate` через опции), поэтому Реестр может хранить и переиспользовать единственные экземпляры (Singletons) каждого адаптера, экономя память.

3.  **Fallback Mechanism**:
    - Реестр может (опционально) реализовывать логику "Default Adapter". Если запрошен список, но ни один CLI не найден, метод `listAvailableAdapters` должен возвращать пустой массив, а не выбрасывать ошибку. Обработка ситуации "нет доступных агентов" — ответственность UI/Consumer'а.

4.  **Error Handling**:
    - Если проверка `detect()` одного из адаптеров падает с ошибкой (например, бинарник поврежден), это **не должно** ломать весь процесс Discovery. Реестр должен поймать ошибку, залогировать её и просто исключить этот адаптер из списка доступных (fail-safe).

---

## Критерии приёмки:
- Код должен быть тестируемым с открытыми зависимостями.
- Все публичные методы и интерфейсы должны быть покрыты JSDoc-контрактами.
- Код должен иметь логирование и семантическую разметку.
