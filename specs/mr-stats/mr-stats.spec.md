# mr-stats: Scope Specification

<!--SECTION:SCOPE_TYPE-->

## scope-type

product

<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->

## 1. Vision & Primary Goal

Инструмент для AI-агентов: получение структурированной статистики по одному GitLab Merge Request. Агент передаёт URL MR — инструмент возвращает JSON с разбивкой изменений по 10 категориям, подсчётом строк кода/комментариев/пробелов, введённых и изменённых сущностей, а также долю дублирующегося кода.

<!--/SECTION:VISION-->

<!--SECTION:PROJECT_TYPE-->

## 2. Project Type

- **Type:** cli-utility
- **Why this type:** Одна CLI-команда с одним аргументом (URL MR), без UI, без долгоживущего сервера.
<!--/SECTION:PROJECT_TYPE-->

<!--SECTION:GOLDEN_DX-->

## 3. Approved Golden DX Example

```bash
$ gennady mr-stats https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/1420
```

```json
{
  "mr": {
    "iid": "!1420",
    "title": "fix(chat): scroll to bottom on new message",
    "project": "mail/messenger",
    "sourceBranch": "fix/chat-scroll",
    "targetBranch": "main",
    "mergedAt": "2026-07-15T10:23:00Z",
    "author": "someuser"
  },
  "categories": {
    "realCode": {
      "files": 8,
      "added": 342,
      "removed": 23,
      "commentLines": { "added": 45, "removed": 5 },
      "codeLines": { "added": 297, "removed": 18 },
      "blankLines": { "added": 12, "removed": 2 },
      "entities": {
        "introduced": 12,
        "modified": 3,
        "removed": 1
      },
      "duplicates": {
        "clonesFound": 2,
        "clonedLines": 34,
        "percentage": 10.2
      }
    },
    "configs": { "files": 1, "added": 5, "removed": 0 },
    "infraScripts": { "files": 0, "added": 0, "removed": 0 },
    "mockFixture": { "files": 2, "added": 80, "removed": 12 },
    "mediaStatic": { "files": 0, "added": 0, "removed": 0 },
    "uiSvelte": { "files": 4, "added": 120, "removed": 45 },
    "testingStorybook": { "files": 3, "added": 95, "removed": 20 },
    "specsTasksDocs": { "files": 0, "added": 0, "removed": 0 },
    "aiSkills": { "files": 0, "added": 0, "removed": 0 },
    "draftTodo": { "files": 0, "added": 0, "removed": 0 }
  }
}
```

<!--/SECTION:GOLDEN_DX-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

## 4. Requirements & Constraints

### 4.1 Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-01 | Принимает единственный аргумент — URL GitLab MR. Разбор URL через `parseVcsUrl` из `vcs` scope.                                                                                                                                            |
| FR-02 | Получает метаданные MR: `iid`, `title`, `sourceBranch`, `targetBranch`, `mergedAt`, `author` — через `VcsGitlabClient.MergeRequests.getByIid`. Поле `project` берётся из `parseVcsUrl(url).repository`. Полный набор → `MrMetadata` (§10). |
| FR-03 | Создаёт read-only git worktree для source- и target-веток через `vcs-worktree` (`prepareMrWorktree`).                                                                                                                                      |
| FR-04 | Вычисляет список изменённых файлов: `git diff --name-only target...source`.                                                                                                                                                                |
| FR-05 | Классифицирует каждый файл в одну из 10 категорий по маскам путей и расширений из YAML-конфига: `services/mr-stats/classifier-rules.yaml` (фиксированный путь).                                                                            |

**Категории классификации:**

| Категория          | Назначение                                                                                                                  | Примеры файлов / масок                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `realCode`         | Продакшен-код (TypeScript), исключая тесты, стори, фикстуры, конфиги. v1 — только `.ts` / `.tsx`; JavaScript не включается. | `src/**/*.ts`, `src/**/*.tsx`, `packages/**/*.ts`, `packages/**/*.tsx` (не `.test.ts`, не `.stories.ts`, не `.svelte`, не `.snap`) |
| `configs`          | Корневые конфигурационные файлы                                                                                             | `*.json`, `*.yml`, `.*rc`, `*.config.*`, `package.json`, `package-lock.json`                                                       |
| `infraScripts`     | Инструментарий: CLI, скрипты, глобальные типы, внешние зависимости                                                          | `cli/**`, `scripts/**`, `types/**`, `vendor/**`, `tooling-lab/**`                                                                  |
| `mockFixture`      | Тестовые данные и фикстуры                                                                                                  | `*fixture*`, `*fixtures*`, `*.mock*`, `*.snap`, `msw/**`, `__fixtures__/**`, `_figma-fixtures/**`                                  |
| `mediaStatic`      | Изображения, шрифты, статические ресурсы                                                                                    | `*.png`, `*.jpg`, `*.svg`, `*.woff2`, `*.html`, `*.map`, `public/**`                                                               |
| `uiSvelte`         | Svelte-компоненты и colocated стили                                                                                         | `*.svelte`, `*.module.css`, `*.tokens.css`, `*.appearance.css`                                                                     |
| `testingStorybook` | Тесты, storybook-истории, e2e                                                                                               | `*.test.ts`, `*.spec.ts`, `*.stories.*`, `e2e/**`, `*.integration.test.*`, `.storybook/**`                                         |
| `specsTasksDocs`   | Спецификации, таски, документация                                                                                           | `specs/**`, `tasks/**`, `docs/**`, `*.md`                                                                                          |
| `aiSkills`         | AI-директивы и навыки                                                                                                       | `ai/**`, `.superpowers/**`, `.claude/**`                                                                                           |
| `draftTodo`        | Черновики, временные файлы, TODO                                                                                            | `draft/**`, `tmp-*`, `*.todo*`                                                                                                     |

| FR-06 | Для категории **Real Code**: подсчёт строк через `cloc --diff` (code / comment / blank — added / removed). |
| FR-07 | Для категории **Real Code**: подсчёт сущностей через tree-sitter (types, interfaces, classes, functions, const, enum — introduced / modified / removed) относительно target-ветки. Только top-level объявления, только `.ts` / `.tsx` (JS пропускается с warning). Правила: (a) тело/поля изменились → modified; (b) только сигнатура → modified; (c) переименование → removed + introduced; (d) JSDoc-only изменения → не modified; (e) декораторы → часть сущности, изменение → modified; (f) импорты и ре-экспорты не считаются сущностями; (g) member reordering без изменения содержимого → не modified. Сравнение игнорирует whitespace и комментарии. |
| FR-08 | Для категории **Real Code**: поиск дубликатов через `jscpd` (clonesFound, clonedLines, percentage) на файлах source-ветки. |
| FR-09 | Для всех категорий: количество файлов, строк добавлено / удалено. |
| FR-10 | Очистка worktree после обработки (`removeWorktreeAt`). |
| FR-11 | Вывод — структурированный JSON на stdout. Ошибки — в stderr. |
| FR-12 | Если MR не найден (ветка удалена, нет доступа) — понятная ошибка с ненулевым exit code. |

**Failure modes — поведение при отказах внешних зависимостей:**

| Ситуация                                             | Exit code | stderr                                                                  | stdout                                                                                                               |
| ---------------------------------------------------- | --------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Некорректный URL (не GitLab MR)                      | 1         | `mr-stats: invalid URL — expected GitLab MR URL, got "<input>"`         | —                                                                                                                    |
| `glab` не установлен / не аутентифицирован           | 2         | `glab: command not found` или `glab: not authenticated`                 | —                                                                                                                    |
| `cloc` не найден в PATH                              | 3         | `cloc: command not found`                                               | —                                                                                                                    |
| `jscpd` не найден в PATH                             | 4         | `jscpd: command not found`                                              | —                                                                                                                    |
| JS-файл в realCode (entity-counter)                  | 0         | `entity-counter: skipping <file> (JS, not TS)` (warning)                | —                                                                                                                    |
| MR не найден (ветка удалена, 404)                    | 5         | `MR !NNNN: source branch deleted or MR not merged`                      | —                                                                                                                    |
| Ошибка создания worktree (нет места, permission)     | 6         | `worktree: <syscall error>`                                             | —                                                                                                                    |
| YAML-конфиг классификатора отсутствует или невалиден | 7         | `classifier-rules.yaml: <parse error>`                                  | —                                                                                                                    |
| Пустой MR (0 изменённых файлов)                      | 0         | `MR !NNNN: no changes (empty diff)` (info)                              | `{"mr": {...}, "categories": { "configs": { "files": 0, "added": 0, "removed": 0 }, ... }}` (все 10 ключей с нулями) |
| MR только с бинарными файлами (Real Code = 0)        | 0         | —                                                                       | Полный JSON, Real Code = 0 files                                                                                     |
| tree-sitter ошибка парсинга отдельного файла         | 0         | `entity-counter: parse error in <file> — skipping` (warning)            | Частичный результат, проблемный файл пропущен                                                                        |
| Превышение таймаута 30s (NF-04)                      | 0         | `mr-stats: timeout exceeded (<N>s), result may be incomplete` (warning) | Частичный результат — что успели посчитать                                                                           |

### 4.2 Non-Functional Constraints

| ID    | Constraint                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NF-01 | Node.js 22+, TypeScript 5+ (стек gennady).                                                                                                                                                                                                  |
| NF-02 | Zero новых зависимостей в `package.json`. `tree-sitter` + `tree-sitter-typescript` — уже в devDependencies, бандлятся Vite. Системные бинарники (`jscpd`, `cloc`, `glab`, `git`) — внешние рантайм-пререквизиты, устанавливаются глобально. |
| NF-03 | macOS — primary target. Linux — совместимость по возможности.                                                                                                                                                                               |
| NF-04 | Время обработки одного MR: < 30 секунд для MR размером до 500 изменённых файлов и 10k строк кода на машине Apple M1/M2, 16GB RAM (исключая clone). При превышении — warning в stderr, частичный результат выдаётся.                         |
| NF-05 | Не модифицирует целевой репозиторий (read-only worktree).                                                                                                                                                                                   |

### 4.3 Out-of-Scope

- Батчевая обработка нескольких MR (только один URL за вызов).
- Поддержка GitHub PR (только GitLab MR).
- Визуализация / дашборды (только JSON).
- Инкрементальный анализ (только полный diff source...target).
- Подсчёт сущностей для не-TypeScript файлов.
- Анализ бинарных файлов внутри категории Media/Static (только факт наличия).

### 4.4 Runtime Backing & Deferred Scope

| Capability                                | Posture        | Note                                                    |
| ----------------------------------------- | -------------- | ------------------------------------------------------- |
| `glab` CLI                                | `real-runtime` | Должен быть установлен и аутентифицирован               |
| `cloc`                                    | `real-runtime` | Установлен: `/opt/homebrew/Cellar/cloc/2.10`            |
| `jscpd`                                   | `real-runtime` | Установка: `npm i -g jscpd@5` (zero-deps Rust-бинарник) |
| `git worktree`                            | `real-runtime` | Стандартный git                                         |
| `tree-sitter` + `tree-sitter-typescript`  | `real-runtime` | Уже в devDependencies gennady                           |
| `parseVcsUrl`                             | `real-runtime` | Из `vcs` scope                                          |
| `VcsGitlabClient`                         | `real-runtime` | Из `vcs` scope                                          |
| `prepareMrWorktree` / `removeWorktreeAt`  | `real-runtime` | Из `cli/cmd/vcs-worktree/`                              |
| `DbcTsAstAdapter` (tree-sitter TS-парсер) | `real-runtime` | Из `services/dbc/`                                      |

### 4.5 Rules

| Rule             | Category | Source                                      |
| ---------------- | -------- | ------------------------------------------- |
| typescript-rules | coding   | `ai/directives/coding/typescript-rules.xml` |
| nodejs-npm-setup | infra    | `ai/directives/infra/nodejs-npm-setup.xml`  |
| git-setup        | infra    | `ai/directives/infra/git-setup.xml`         |

<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:ARCHITECTURE-->

## 5. High-Level Architecture

Выбран **Variant A — Worktree + cloc + tree-sitter + jscpd**.

```
gennady mr-stats <url>
  │
  ├── parseVcsUrl(url)                        → vcs scope
  │     → { provider, host, repository, iid }
  │
  ├── VcsGitlabClient.MergeRequests.getByIid  → vcs scope
  │     → { title, sourceBranch, targetBranch, mergedAt, author }
  │
  ├── prepareMrWorktree(sourceBranch, targetBranch)  → vcs-worktree
  │     → { mrDir (source), baseDir (target) }
  │
  ├── git diff --name-only target...source
  │     → file list
  │
  ├── classifier.classify(fileList)           → mr-stats (own)
  │     → categories: Record<Category, string[]>
  │
  ├── [per category]:
  │   ├── realCode:
  │   │   ├── cloc --diff <baseDir> <mrDir> --include <files>  → lines
  │   │   ├── entity-counter.diff(<baseDir>, <mrDir>, files)    → entities
  │   │   └── jscpd <mrDir> --pattern <files> --format json     → duplicates
  │   └── others:
  │       └── git diff --numstat target...source -- <files>     → lines
  │
  ├── removeWorktreeAt(mrDir)                → vcs-worktree (cleanup)
  │
  └── stdout: JSON report
```

**Ключевые решения:**

- `cloc --diff` принимает две директории и список файлов, выдаёт разбивку code/comment/blank.
- `tree-sitter` для entity-сравнения: парсим файл в base и mr, извлекаем top-level сущности, сравниваем множества на introduced / modified / removed.
- `jscpd` запускается на mr-директории с фильтром по изменённым файлам, выдаёт JSON с клонами.
- **Канонический порядок обработки категорий** (для детерминированности при таймауте): `configs → infraScripts → mockFixture → mediaStatic → uiSvelte → testingStorybook → realCode → specsTasksDocs → aiSkills → draftTodo`. Категория обрабатывается атомарно: либо полностью посчитана и присутствует в выводе, либо отсутствует. **При таймауте** инвариант «все 10 ключей» не применяется — отсутствующие категории означают, что они не были обработаны. Потребитель должен проверять наличие ключа перед чтением.
- **Extended statistics** (entity delta, code/comment/blank breakdown, duplicates) применяются только к категории `realCode`. Остальные 9 категорий получают только `files`, `added`, `removed`.

### 5.1 Rejected Alternatives

- **Variant B (glab diff):** `glab mr diff` даёт unified diff в памяти, но не позволяет использовать `cloc` (нужны файлы на диске), теряет бинарные файлы, и несовместим с `jscpd` для дубликатов.
<!--/SECTION:ARCHITECTURE-->

<!--SECTION:DECISION_LOG-->

## 6. Decision Log

### D-001 — Architecture: Worktree-based analysis

- **Status:** active
- **Recorded:** session Discovery, mr-stats
- **Why:** Полные файлы на диске позволяют использовать `cloc --diff` (строки code/comment/blank), `tree-sitter` (сущности), `jscpd` (дубликаты). Переиспользует существующий `vcs-worktree`. Точнее, чем парсинг unified diff из `glab mr diff`.
- **Risk accepted:** Медленнее из-за checkout'а веток. Компенсируется точностью.
- **Rejected alternatives:** `glab mr diff` + ручной парсинг (Variant B).

### D-002 — Duplicate detection: jscpd v5

- **Status:** active
- **Recorded:** session Discovery, mr-stats
- **Why:** Rust-бинарник, zero npm-зависимостей, семантическое сравнение на уровне токенов (не просто текстовый copy-paste). JSON-вывод с координатами клонов.
- **Risk accepted:** Новая мажорная версия (v5), требует `npm i -g jscpd@5`. Возможен откат к v4 при проблемах.
- **Rejected alternatives:** jsinspect (не поддерживается), sonarqube (тяжёлый), ручной diff (не семантический).

### D-003 — Entity counting: tree-sitter (DbcTsAstAdapter)

- **Status:** active
- **Recorded:** session Discovery, mr-stats
- **Why:** Уже используется в gennady (`services/dbc/`). Программный доступ к TypeScript AST. Позволяет сравнивать сущности между base и mr на уровне объявлений.
- **Risk accepted:** Не для всех языков (только TS). v1 — только TypeScript.
- **Rejected alternatives:** ts-morph (новая зависимость, дублирует tree-sitter).

### D-004 — Entity counting: semantics v1

- **Status:** active
- **Recorded:** session Discovery, mr-stats
- **Why:** Нужно однозначное определение «modified» для воспроизводимости результатов разными агентами.
- **Decision:** v1 — только top-level объявления. Modified = изменилось тело функции/класса или набор полей типа/интерфейса (игнорируя whitespace и комментарии). JSDoc-изменения игнорируются (не делают сущность modified). Декораторы считаются частью сущности (изменение декоратора → modified). Изменение только сигнатуры = modified. Переименование = removed + introduced. Импорты и ре-экспорты не считаются сущностями. Member reordering без изменения содержимого → не modified.
- **Risk accepted:** Сигнатуры не отслеживаются отдельно. Может давать завышенный removed+introduced при рефакторингах с переименованием.
- **Rejected alternatives:** Отслеживание сигнатур отдельно (deferred до v2).
<!--/SECTION:DECISION_LOG-->

<!--SECTION:SCOPE_DEPENDENCIES-->

## 7. Scope Dependencies

- **Depends on:**
  - `infra-base` — Node.js 22+, npm, tsc, prettier, git-hooks
  - `vcs` — `parseVcsUrl`, `VcsGitlabClient` (MergeRequests.getByIid)
  - `cli` (vcs-worktree) — `prepareMrWorktree`, `removeWorktreeAt`
  - `dbc` — `DbcTsAstAdapter` (tree-sitter TypeScript parser)
- **Provides to:** `cli` (новая команда `mr-stats`), AI-агенты через CLI
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->

## 8. Bootstrap Requirements

| Requirement                                      | Kind           | Owner                 | Resolution                                                                                   |
| ------------------------------------------------ | -------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `glab` CLI (аутентифицированный)                 | tool           | operator-action       | `brew install glab` + `glab auth login`                                                      |
| `cloc`                                           | tool           | operator-action       | `brew install cloc` (уже: `/opt/homebrew/Cellar/cloc/2.10`)                                  |
| `jscpd@5`                                        | tool           | operator-action       | `npm install -g jscpd@5` (Rust-бинарник, zero deps)                                          |
| `tree-sitter` npm package                        | package        | external-prereq-scope | Уже в devDependencies (`^0.22.4`)                                                            |
| `tree-sitter-typescript` npm package             | package        | external-prereq-scope | Уже в devDependencies (`^0.23.2`)                                                            |
| `vcs` scope                                      | workspace-link | external-prereq-scope | `specs/vcs/vcs.spec.md` ✅                                                                   |
| `cli/cmd/vcs-worktree`                           | workspace-link | external-prereq-scope | `cli/cmd/vcs-worktree/` ✅                                                                   |
| `services/dbc` (DbcTsAstAdapter)                 | workspace-link | external-prereq-scope | `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts` ✅                            |
| Классификационный конфиг `classifier-rules.yaml` | file           | this-scope-task       | Создать `services/mr-stats/classifier-rules.yaml` — 10 категорий с масками (см. пример ниже) |

**Пример `classifier-rules.yaml`:**

```yaml
# Категории в порядке приоритета (first-match wins)
categories:
  - name: configs
    include:
      - '*.json'
      - '*.yml'
      - '.*rc'
      - '*.config.*'
  - name: infraScripts
    include:
      - 'cli/**'
      - 'scripts/**'
      - 'types/**'
      - 'vendor/**'
  - name: mockFixture
    include:
      - '*fixture*'
      - '*fixtures*'
      - '*.mock*'
      - '*.snap'
      - 'msw/**'
      - '__fixtures__/**'
  - name: mediaStatic
    include:
      - '*.png'
      - '*.jpg'
      - '*.svg'
      - '*.woff2'
      - '*.html'
      - '*.map'
      - 'public/**'
  - name: uiSvelte
    include:
      - '*.svelte'
      - '*.module.css'
      - '*.tokens.css'
      - '*.appearance.css'
  - name: testingStorybook
    include:
      - '*.test.ts'
      - '*.spec.ts'
      - '*.stories.*'
      - 'e2e/**'
      - '*.integration.test.*'
      - '.storybook/**'
  - name: realCode
    include:
      - 'src/**/*.ts'
      - 'src/**/*.tsx'
      - 'packages/**/*.ts'
      - 'packages/**/*.tsx'
    exclude:
      - '*.test.ts'
      - '*.spec.ts'
      - '*.stories.*'
      - '*.svelte'
      - '*.snap'
  - name: specsTasksDocs
    include:
      - 'specs/**'
      - 'tasks/**'
      - 'docs/**'
      - '*.md'
  - name: aiSkills
    include:
      - 'ai/**'
      - '.superpowers/**'
      - '.claude/**'
  - name: draftTodo
    include:
      - 'draft/**'
      - 'tmp-*'
      - '*.todo*'
```

| CLI-команда `mr-stats` | structural | this-scope-task | Создать `cli/cmd/mr-stats/` + зарегистрировать в `gennady.ts` |

<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:MODULE_MAP-->

## 9. Module Map

Modules not yet decomposed — run `module-decomposition mr-stats`. Scaffolding should use the 6 areas from §10 (mr-resolver, classifier, line-counter, entity-counter, duplicate-detector, reporter) as provisional module boundaries until decomposition is complete.

<!--/SECTION:MODULE_MAP-->

<!--SECTION:HANDOFF-->

## 10. Handoff to module-decomposition

- **Primary input:** `specs/mr-stats/mr-stats.spec.md`
- **Areas requiring decomposition:**
  - `mr-resolver` — парсинг URL, получение метаданных MR через `vcs` scope
  - `classifier` — классификация файлов по YAML-конфигу
  - `line-counter` — обёртка над `cloc --diff`
  - `entity-counter` — tree-sitter сравнение сущностей между base и mr
  - `duplicate-detector` — обёртка над `jscpd`
  - `reporter` — агрегация и вывод JSON
- **Named abstractions** (Golden DX in §3 is the canonical output contract; types below are internal, serialized to match DX):
  - `EntityRef` — ссылка на сущность: `{ file: string, line?: number, symbol: string }`.
  - `EntityDelta` — внутренний результат сравнения: `{ introduced: EntityRef[], modified: EntityRef[], removed: EntityRef[] }`. **Инвариант:** introduced ∩ modified = ∅, introduced ∩ removed = ∅, modified ∩ removed = ∅. Переименование → removed + introduced. **Сериализуется** в `{ introduced: N, modified: N, removed: N }` (количества, не массивы).
  - `LineDiff` — пара added/removed для одного типа строк: `{ added: number, removed: number }`.
  - `MrStatsCategorySimple` — простая категория: `{ files: number, added: number, removed: number }`. Применяется к 9 из 10 категорий.
  - `MrStatsCategoryRealCode` — категория realCode: `{ files, added, removed }` + `commentLines: LineDiff`, `codeLines: LineDiff`, `blankLines: LineDiff`, `entities: { introduced: number, modified: number, removed: number }`, `duplicates: { clonesFound: number, clonedLines: number, percentage: number }`.
  - `MrStatsReport` — итоговый отчёт: `{ mr: MrMetadata, categories: { configs: MrStatsCategorySimple, ... } }`. **Инвариант (нормальный режим):** все 10 ключей присутствуют, даже если `files = 0`. **При таймауте:** ключи могут отсутствовать (категория не обработана — см. §5).
  - `DuplicateReport` — результат jscpd: `{ clonesFound: number, clonedLines: number, percentage: number }`. **Инвариант:** `0 ≤ percentage ≤ 100`. `percentage` — passthrough из jscpd (jscpd вычисляет сам: `clonedLines / totalScannedLines`).
  - `ClassifierRules` — схема YAML-конфига: список категорий, каждая с масками `include` / `exclude` (glob-паттерны). **Инвариант:** категории не пересекаются (каждый файл попадает ровно в одну категорию). Разрешение коллизий: first-match wins в порядке объявления категорий в конфиге.
  - `Classifier` — сервис классификации: `classify(files: string[], rules: ClassifierRules): Record<string, string[]>`. **Pre-условия:** `files` — непустой массив строк (пустые пути игнорируются). `rules` — валидный `ClassifierRules` с категориями в порядке приоритета (first-match wins). **Инвариант:** каждый файл ровно в одной категории, объединение всех значений = исходный `files`. Файлы, не попавшие ни в одну категорию — ошибка (невалидный конфиг).
  - `MrMetadata` — метаданные MR: `{ iid, title, project, sourceBranch, targetBranch, mergedAt, author }`. `iid..author` — из `VcsGitlabClient.MergeRequests.getByIid`, `project` — из `parseVcsUrl(url).repository`.
  - `MrStatsOutcome` — результат команды (exit code 0): `{ ok: true, report: MrStatsReport }`. **Инвариант:** при exit 0 поле `ok` всегда `true`.
- **Bootstrap tickets ready for cascade:** see §8
- **Open risks:**
  - `jscpd@5` — новая мажорная версия, может измениться CLI-интерфейс
  - Классификационный конфиг должен быть расширяемым для других репозиториев

<!--/SECTION:HANDOFF-->
