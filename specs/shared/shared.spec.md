# shared: Infrastructure Specification

## scope-type

infrastructure

## 1. Vision

Фундаментальный shared-слой всего проекта. Утилиты, используемые всеми сервисами и CLI-командами. Zero внешних runtime-зависимостей (только Node.js built-in + chalk). Чистая архитектура: каждый модуль — независимая pure-функция или класс с минимальными сайд-эффектами.

## 2. Entity Inventory (Closed-World)

### 2.1 `shared/common/`

| Name             | Type      | Purpose                                               |
| ---------------- | --------- | ----------------------------------------------------- |
| `SimpleLogger`   | Interface | Контракт логгера: debug/info/warn/error               |
| `Logger`         | Class     | Имплементация с уровневой фильтрацией (`setLogLevel`) |
| `logger`         | Instance  | Глобальный экземпляр Logger, алиас `#logger`          |
| `parseArgs`      | Function  | Парсинг CLI-аргументов (ключ-значение + флаги)        |
| `exec`           | Function  | Запуск процессов (spawn)                              |
| `readFile`       | Function  | Чтение файла с авто-детектом кодировки                |
| `writeFile`      | Function  | Атомарная запись файла (temp + rename)                |
| `fileExists`     | Function  | Проверка существования файла/директории               |
| `globFiles`      | Function  | Glob-поиск файлов                                     |
| `style`          | Module    | Chalk-обёртка для терминального вывода                |
| `xml`            | Module    | XML-генерация (эскейпинг, теги)                       |
| `countTokens`    | Function  | Подсчёт токенов в строке                              |
| `wrapThink`      | Function  | Оборачивание текста в think-теги для AI               |
| `unguard`        | Module    | Type narrowing утилиты (assert, isDefined)            |
| `detectLanguage` | Function  | Детекция языка по расширению файла                    |

### 2.2 `shared/backend/`

| Name       | Type  | Purpose                                    |
| ---------- | ----- | ------------------------------------------ |
| `GitCore`  | Class | Работа с git (diff, remote, branch)        |
| `GitDiff`  | Class | Git diff парсинг (hunks, files)            |
| `RcConfig` | Class | Чтение/запись конфигурации (`~/.gennady/`) |

### 2.3 `shared/common/sync/`

| Name             | Type     | Purpose                                             |
| ---------------- | -------- | --------------------------------------------------- |
| `syncCore`       | Function | Общая логика синхронизации файлов (source → target) |
| `syncFormatter`  | Function | Форматирование вывода синхронизации (+, ~, =, -, !) |
| `pathNormalizer` | Function | Нормализация путей (разделители, trailing slash)    |

## 3. File Structure

```
shared/
├── common/
│   ├── logger.ts              # SimpleLogger interface + Logger class + logger instance
│   ├── parse-args.ts          # CLI args parsing (key-value + flags)
│   ├── exec.ts                # Process spawn wrapper
│   ├── files.ts               # File operations (read, write, exists, glob)
│   ├── style.ts               # Chalk wrapper for terminal output
│   ├── xml.ts                 # XML generation (escaping, tags)
│   ├── tokens.ts              # Token counting
│   ├── think.ts               # think-tag wrapping for AI
│   ├── unguard.ts             # Type narrowing utilities
│   ├── language.ts            # Language detection by file extension
│   └── sync/
│       ├── sync-core.ts       # Core sync logic
│       ├── sync-formatter.ts  # Sync output formatting
│       └── path-normalizer.ts # Path normalization
└── backend/
    ├── git/
    │   ├── git-core.ts        # Git operations (diff, remote, branch)
    │   └── git-diff.ts        # Git diff parsing (hunks, files)
    └── rc/
        └── rc-config.ts       # Configuration read/write (~/.gennady/)
```

## 4. Decision Log

### D-001 — `shared/` как фундаментальный слой без зависимостей от других слоёв

- **Status:** active
- **Recorded:** session Discovery, shared
- **Why:** `shared/` — нижний слой архитектуры. Не импортирует из `services/`, `cli/`. Зависит только от Node.js built-in и chalk. Это гарантирует переиспользование во всех вышележащих слоях без циклических зависимостей.
- **Rejected alternatives:** Размазывание утилит по сервисам (дублирование, сложность рефакторинга).

### D-002 — `SimpleLogger` как интерфейс, `Logger` как имплементация

- **Status:** active
- **Recorded:** session Discovery, shared
- **Why:** Интерфейс `SimpleLogger` позволяет подменять логгер в тестах и будущих адаптерах (файловый логгер, JSON-логгер). `Logger` — основная имплементация с уровневой фильтрацией через `setLogLevel`.
- **Rejected alternatives:** Единый класс без интерфейса (слабее тестируемость).

### D-003 — Глобальный экземпляр `logger` через алиас `#logger`

- **Status:** active
- **Recorded:** session Discovery, shared
- **Why:** `#logger` (маппинг на `shared/common/logger.ts`) — единая точка доступа к логгированию во всём проекте. Инстанс создаётся один раз, уровень выставляется глобально через `setLogLevel`.
- **Rejected alternatives:** Создание логгера в каждом модуле (рассинхрон уровней, сложность смены адаптера).

### D-004 — `shared/backend/` для бэкенд-специфичных утилит

- **Status:** active
- **Recorded:** session Discovery, shared
- **Why:** Git и конфигурационные утилиты не являются общими для всех окружений (например, browser). Выделение в `backend/` делает границу явной и позволяет tree-shaking в будущем.
- **Rejected alternatives:** Всё в `common/` (размывает границу между универсальным и бэкенд-специфичным).

### D-005 — Атомарная запись файлов (temp + rename)

- **Status:** active
- **Recorded:** session Discovery, shared
- **Why:** Защита от повреждения файлов при параллельных запусках. Пишем во временный файл, затем `fs.renameSync(temp, target)` — атомарно на уровне FS.
- **Rejected alternatives:** Прямая запись `writeFileSync` (гонка при параллельных запусках).

### D-006 — `shared/common/sync/` — общая логика синхронизации

- **Status:** active
- **Recorded:** session Discovery, shared
- **Why:** Команды `sync` и `sync-skills` разделяют общую логику: сравнение файлов, форматирование вывода, нормализация путей. Вынос в `shared/` предотвращает дублирование.
- **Rejected alternatives:** Дублирование логики в каждой команде (расходится при изменениях).
