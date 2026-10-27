# shared: Infrastructure Specification

<!--SECTION:SPEC_ID-->

SHARED

<!--/SECTION:SPEC_ID-->

## scope-type

infrastructure

## 1. Vision

Фундаментальный shared-слой всего проекта. Утилиты, используемые всеми сервисами и CLI-командами. Zero внешних runtime-зависимостей (только Node.js built-in + chalk). Чистая архитектура: каждый модуль — независимая pure-функция или класс с минимальными сайд-эффектами.

## 2. Entity Inventory (Closed-World)

### 2.1 `shared/common/`

| Name                      | Type      | Purpose                                                               |
| ------------------------- | --------- | --------------------------------------------------------------------- |
| `SimpleLogger`            | Interface | Контракт логгера: debug/info/warn/error                               |
| `Logger`                  | Class     | Имплементация с уровневой фильтрацией (`setLogLevel`)                 |
| `logger`                  | Instance  | Глобальный экземпляр Logger, алиас `#logger`                          |
| `parseArgs`               | Function  | Парсинг CLI-аргументов (ключ-значение + флаги)                        |
| `exec`                    | Function  | Запуск процессов (spawn)                                              |
| `readFile`                | Function  | Чтение файла с авто-детектом кодировки                                |
| `writeFile`               | Function  | Атомарная запись файла (temp + rename)                                |
| `fileExists`              | Function  | Проверка существования файла/директории                               |
| `globFiles`               | Function  | Glob-поиск файлов                                                     |
| `globToRegex`             | Function  | Компиляция bounded repository glob dialect                            |
| `matchesAnyGlob`          | Function  | Проверка repo-relative path по shared glob dialect                    |
| `gennadyLintSourcePolicy` | Function  | Общая selection/exclusion policy для lint observation и Verify repair |
| `isGennadyLintTarget`     | Function  | Поддерживаемые расширения Gennady contract lint                       |
| `style`                   | Module    | Chalk-обёртка для терминального вывода                                |
| `xml`                     | Module    | XML-генерация (эскейпинг, теги)                                       |
| `countTokens`             | Function  | Подсчёт токенов в строке                                              |
| `wrapThink`               | Function  | Оборачивание текста в think-теги для AI                               |
| `unguard`                 | Module    | Type narrowing утилиты (assert, isDefined)                            |
| `detectLanguage`          | Function  | Детекция языка по расширению файла                                    |

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

### 2.4 `shared/sdd/` — bounded execution transitions

| Name                             | Type     | Purpose                                                                                                                           |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `technicalReplanBase`            | Function | Exact observed ticket identity for a stale-read precondition                                                                      |
| `prepareTechnicalReplan`         | Function | Bounded target/local-edge/provider-phase/test ownership transition preserving scenario/check declarations and recording its delta |
| `TechnicalPhaseInsertion`        | Type     | Exact provider ID/objective/targets/dependencies; kind/rules/exit/inputs inherited, not arbitrary authority                       |
| `parseTechnicalPhaseInsertion`   | Function | Validate the exact bounded insertion payload before candidate bytes are prepared                                                  |
| `prepareTechnicalPhaseInsertion` | Function | Preserve covered-test ownership and provider ordering, recheck insertion/log postconditions on replay                             |
| `withSddReplanMutation`          | Function | Serialize replan corpus claim checks, then use the existing ticket/Verify lease and expected-byte atomic writer                   |

`technical-replan.ts` does not prove preserved business meaning. It mechanically preserves kinds,
rules and product/BDD/verification/test-coverage declarations, refuses unsafe paths, cycles,
detached inputs and unordered writers, and keeps old evidence. Supported means changes are
implementation neighbors, local edges, one inherited provider phase and exact covered-test ownership
transfer to it; the source retains a mapped test target. Arbitrary target/phase removal, changed
scenario/level and weaker checks remain unsupported.
The replan-corpus lease coordinates replan CLI operations, not external editors or arbitrary authoring.
Redispatch and fresh Verify use the existing rule resolver/facade, never a second runner.

### 2.5 Declared SDD coverage

| Name                  | Type     | Purpose                                                                                                                |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `resolveSddCoverage`  | Function | Pure projection of structural spec/file/phase declarations and fresh observations into stage-aware ownership diagnosis |
| `CoverageStage`       | Type     | Authoring, preflight, phase exit or selected audit                                                                     |
| `CoverageSpec`        | Type     | Explicit spec identity, structural child IDs and exact owned file paths                                                |
| `CoverageTarget`      | Type     | Read/write/delete phase claim; read inputs never assign ownership                                                      |
| `CoverageObservation` | Type     | Fresh safe-file/missing/unsafe observation and current/prior headers                                                   |
| `CoverageSelection`   | Type     | Project, structural spec subtree or exact task/phase                                                                   |
| `CoverageInput`       | Type     | Explicit declarations and observations; no persistent source inventory                                                 |
| `CoverageFinding`     | Type     | Error or visible pending obligation with exact origin/path                                                             |
| `CoverageRow`         | Type     | One path, expected owners, declaration provenance and materialization state                                            |
| `CoverageResult`      | Type     | Completeness and permission to proceed; never runner-owned Verify evidence                                             |

The SC1 core has no filesystem/process/network writes or reads. Adapters supply validated structural
edges and safe observations; the core never infers ownership from folders or arbitrary Markdown links.
Ordinary undeclared files do not require headers. Preflight may proceed with pending ownership;
phase exit requires its materialized targets, while selected audit still exposes all other declared
obligations. Missing observations, conflicting owners, unsafe paths, broken child identities and
cycles cannot produce complete coverage. Removing a header does not withdraw a declaration.
Explicit deletion differs from unexplained disappearance; a future declaration remains pending,
not verified implementation. Phase claims may temporarily extend File Mapping but audit requires
the mapping to catch up. SC2 exposes explicit read-only `--coverage` projections; default/lifecycle
cutover remains SC3. A parsed phase identity also supports a genuine no-write phase without a fake
target; empty ownership coverage does not prove that its declared Verify gates ran.

Repository path proof retains its existing pattern-free default. The coverage reader explicitly
opts into literal brackets, never glob expansion; identity revalidation preserves that syntax while
still rejecting traversal, symlink components and non-regular files. Prior Git headers are observed
for selected paths in one batch, not stored in a separate source inventory.

JSON artifacts use exact declaration ownership rather than inline comments: the adapter must prove a
regular contained file and parse valid JSON. At phase exit one unambiguous target owner is required;
at audit the owning File Mapping is also required. This representation is host-derived from `.json`,
cannot waive a code file's header, and does not replace the project's schema or functional gates.
Source ownership is parsed only from the canonical leading comment region; an `@spec` inside a
declaration body is not a file header.

Spec projections use the same selected target set for path inclusion, owner inference and row
diagnostics. Foreign targets cannot add write/delete duties to a selected spec; the project view
still diagnoses real collisions. Prior headers are historical provenance for removal/disappearance,
not current owners. An exact phase checks its outputs without traversing its owner's child subtree.
A real no-write phase has no ownership rows; this is not execution or Verify evidence.

Repository adapters use the same pure filename convention as audit groups to resolve the structural
task owner (`<name>.task.<ID>.md` → co-located `<name>.spec.md`). An explicit Owning Spec must agree
with that exact path; malformed, duplicate or foreign declarations fail closed. Scope and arbitrary
Spec References do not assign ownership. Exact inline and nested phase path lists are supported;
parenthesized annotations are labels, not extra paths. The closed no-write labels are `none`, `—`
and `(нет — проверочная фаза)`; mixing a label and paths is invalid. Directory expansion and prose
such as conditional `remove …` are not write/delete declarations: list exact files and explicit
Deleted Files instead. Visible text around HTML comments remains declarative; commented/fenced
examples never add claims.

Coverage source reads conservatively exclude the reserved segments `node_modules`, `.git`, `dist`,
`coverage`, `build` and `out`, case-insensitively at any depth. This is an explicit coverage-reader
boundary, not a claim that every directory called `build` is unsafe, and not a new Verify/write
permission. Excluded, unsafe, unreadable and unsupported-format paths cannot enter either worktree
reads or Git prior-content batches. Supported missing files retain prior evidence for tombstones
and unexpected deletion. No repository-wide source scan or persistent exception list is introduced.

**File Mapping:**

- `shared/sdd/coverage.ts`: stage-aware coverage projection
- `shared/sdd/coverage.types.ts`: canonical input and result types
- `shared/sdd/coverage-repository.ts`: read-only repository observations shared across SDD consumers
- `shared/sdd/__tests__/coverage.test.ts`: deterministic ownership and scale controls

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
│   ├── glob-match.ts          # Shared repository path glob matcher
│   ├── gennady-lint-source-policy.ts # Shared lint observation/repair scope
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

### D-007 — `ExecSyncSafeOptions.expectedExitCodes` — тихий execSyncSafe для штатных кодов выхода

- **Status:** active
- **Recorded:** session ModuleDecomposition, shared
- **Why:** `execSyncSafe` логировал `logger.error` со стеком на любой ненулевой код выхода, включая штатные (grep «не найдено» = 1, `git show HEAD:<новый файл>` = 128). Опциональный параметр `expectedExitCodes` подавляет лог именно для этих кодов, не меняя поведение по умолчанию для остальных вызывающих (`git-core`, `resolve-conflicts-context-git-build.logic`).
- **Risk accepted:** Низкий — параметр опциональный, старое поведение по умолчанию сохранено.

### `ExecSyncSafeOptions`

- **Usage Waiver:** Тип параметра публичной сигнатуры `execSyncSafe`; каждый вызывающий передаёт объект структурно, имя типа при этом не упоминается — единственное явное упоминание неизбежно.
