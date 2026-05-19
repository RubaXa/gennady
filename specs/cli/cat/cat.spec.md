# Module: cat

## 1. Module Vision

Команда `gennady cat` собирает и выводит содержимое файлов в XML или Markdown-формате для передачи AI-агентам. Поддерживает локальные файлы (через glob) и удалённые (через `--url` — GitLab MR / GitHub PR).

→ Parent scope: [../cli.spec.md](../cli.spec.md)

## 2. Entity Inventory (Closed-World)

| Name                 | Type         | Purpose                                                                        |
| -------------------- | ------------ | ------------------------------------------------------------------------------ |
| `CatGenResult`       | Value Object | Результат сбора файла: absPath, relativePath, contents                         |
| `CatGenOptions`      | Value Object | Опции сбора: extensions, exclude, ignoreDefaultExcludes                        |
| `catGen`             | Function     | Сбор файлов из локальной ФС по glob-паттернам                                  |
| `DEFAULT_EXTENSIONS` | Constant     | Расширения по умолчанию: .md, .mdc, .js, .ts, .tsx, .go, .sh, .puml, .         |
| `resolveCatUrl`      | Function     | Получение файлов из VCS по URL: парсинг → клиент → getChanges → getFileContent |
| `CatUrlResult`       | Value Object | Результат resolveCatUrl: ok + files или ok + error                             |
| `catGenFromVcs`      | Function     | Pure-функция: VcsMergeRequestChanges[] + VcsFileContent[] → CatGenResult[]     |

## 3. Entity Surfaces

### `catGen`

- **Type:** Function
- **Purpose:** Сбор содержимого файлов из локальной ФС.
- **Signature:** `(paths: string | string[], options?: CatGenOptions) => CatGenResult[]`
- **Side Effect:** Чтение файловой системы (fast-glob + fs.readFileSync)

### `CatGenResult`

- **Type:** Value Object
- **Purpose:** Один собранный файл.
- **Public Properties:** `absPath: string`, `relativePath: string`, `contents: string`

### `CatGenOptions`

- **Type:** Value Object
- **Purpose:** Опции фильтрации файлов.
- **Public Properties:** `extensions?: string[]`, `exclude?: string | string[]`, `ignoreDefaultExcludes?: boolean`

### `catGenFromVcs`

- **Type:** Function
- **Purpose:** Преобразование результатов VCS-запросов в формат CatGenResult.
- **Signature:** `(changes: VcsMergeRequestChanges[], files: VcsFileContent[]) => CatGenResult[]`
- **Contract:** Фильтрует удалённые файлы (status: 'deleted'), бинарные (encoding: 'base64'); маппит path → relativePath.

### `resolveCatUrl`

- **Type:** Function
- **Purpose:** Получение содержимого ВСЕХ изменённых файлов из GitLab MR или GitHub PR.
- **Signature:** `(url: string, options?: { exclude?, extensions? }) => Promise<CatUrlResult>`
- **Contract:** ОДИН VCS-клиент на запрос. Без дефолтного фильтра расширений. GitHub: `https://api.github.com` (cloud) или `https://<host>/api/v3` (enterprise). Логирует skip-причины.

### `CatUrlResult`

- **Type:** Value Object
- **Purpose:** Результат resolveCatUrl — успех со списком файлов или ошибка.
- **Public Properties:** `ok: boolean`, `files?: CatGenResult[]`, `error?: string`

## 4. CLI Interface

### Аргументы

| Флаг              | Кратко | Описание                                                                                       |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Позиционные       | —      | Пути/glob-паттерны для локального сбора (с фильтром по расширениям)                            |
| `--plain`         | —      | Отключить ANSI-цвета и подсказку pbcopy                                                        |
| `--exclude`, `-e` | —      | Паттерны исключения (глобы или простые строки). С `--url`: опциональный фильтр                 |
| `--ext`           | —      | Фильтр расширений (через запятую или повторно). С `--url`: опциональный фильтр                 |
| `--output`, `-o`  | `md`   | Формат вывода: `md` (Markdown), по умолчанию — XML                                             |
| **`--url`**       | —      | **NEW**: URL GitLab MR или GitHub PR. **Берёт ВСЕ изменённые файлы без фильтров по умолчанию** |

**Ключевое различие:** `cat <paths>` применяет дефолтный фильтр расширений (`.md,.ts,.js,...`) и `node_modules`. `cat --url=<...>` берёт **все** изменённые файлы — фильтры только если явно указаны `--ext` / `--exclude`.

### Golden DX

````bash
# --- локальные файлы (текущее поведение) ---
$ gennady cat src/**/*.ts
<Codebase>
  <Source type="file" path="src/foo.ts">
  ...
  </Source>
</Codebase>

# --- Markdown-вывод ---
$ gennady cat -o md src/foo.ts
## CODEBASE:
### SOURCE: src/foo.ts
```typescript
...
````

# --- исключения и расширения ---

$ gennady cat --exclude="\*_/_.test.ts" --ext=".ts,.tsx" src/

# --- без цветов (для пайпа) ---

$ gennady cat --plain src/\*_/_.ts | pbcopy

# --- NEW: GitLab MR по URL ---

$ gennady cat --url="https://gitlab.com/group/project/-/merge_requests/42"
<Codebase>

  <Source type="file" path="src/foo.ts">
  ...
  </Source>
  <Source type="file" path="lib/utils.ts">
  ...
  </Source>
</Codebase>

# --- NEW: GitHub PR по URL ---

$ gennady cat --url="https://github.com/owner/repo/pull/99" -o md

## CODEBASE:

### SOURCE: src/bar.ts

...

# --- NEW: --url с фильтрацией ---

$ gennady cat --url="https://gitlab.com/g/p/-/merge_requests/1" --ext=".ts" --exclude="\*_/_.test.ts"

# --- ошибка: нет URL и нет позиционных аргументов ---

$ gennady cat
Usage: npx gennady cat <path/to/glob> [--url=<MR/PR URL>]

```

## 5. Architecture

```

cli/cmd/cat/
├── index.ts # import './cat.cmd.ts'
├── cat.cmd.ts # CLI-обвязка: parseArgs, выбор источника, рендеринг
└── cat-url.fn.ts # NEW: resolveCatUrl(url) — получает файлы из VCS

cli/utils/cat-gen/
├── cat-gen.ts # catGen (локальная ФС) + catGenFromVcs (NEW)

```

**Поток выполнения `cat --url`:**
1. `parseArgs` → извлечь `--url`, опциональные `--ext`, `--exclude`, `--plain`, `-o`
2. Если переданы И `--url` И позиционные аргументы → ошибка (взаимоисключающие)
3. `parseVcsUrl(url)` → VcsUrl (provider, host, repository, iid)
4. **Создать ОДИН VCS-клиент** (не N на каждую операцию):
   - GitLab: `new VcsGitlabClient({ baseUrl: 'https://<host>/api/v4', token: GITLAB_PERSONAL_TOKEN })`
   - GitHub (github.com): `new VcsGithubClient({ baseUrl: 'https://api.github.com', token: GITHUB_PERSONAL_TOKEN })`
   - GitHub (enterprise): `new VcsGithubClient({ baseUrl: 'https://<host>/api/v3', token: GITHUB_PERSONAL_TOKEN })`
5. `client.MergeRequests.getChanges({ repository, iid })` → VcsMergeRequestChanges[]
   - **GitHub:** getChanges должен получить `head.ref` из PR metadata и вернуть его в поле `ref` (не blob SHA файла)
6. Фильтрация: убрать deleted. `--ext` / `--exclude` — строго опциональны
7. Для каждого файла: `client.RepositoryFiles.getFileContent({ repository, path, ref: changes[i].ref })` → VcsFileContent
   - **Один и тот же клиент** используется для всех файлов
   - Бинарные файлы (encoding: 'base64') пропускаются
   - Ошибки fetch логируются, файл пропускается
8. `catGenFromVcs(changes, files)` → CatGenResult[] (pure-функция в cat-gen.ts)
9. Рендеринг: XML или Markdown

**Поток выполнения `cat <paths>` (без изменений):**
1. `parseArgs` → извлечь позиционные аргументы
2. `catGen(paths, options)` → CatGenResult[]
3. Рендеринг: XML или Markdown

## 6. Decision Log

### D-001 — catGenFromVcs как отдельная pure-функция в cat-gen.ts
- **Status:** active
- **Recorded:** session Discovery, cli/cat
- **Why:** Преобразование VcsMergeRequestChanges + VcsFileContent → CatGenResult — pure-функция без сайд-эффектов. Логически принадлежит cat-gen (сбор файлов), а не CLI-обвязке. Фильтрует deleted, бинарные, маппит path → relativePath.
- **Rejected alternatives:** Встроить в cat.cmd.ts или cat-url.fn.ts (смешивает сбор и рендеринг, тестировать сложнее).

### D-002 — --url и позиционные аргументы — взаимоисключающие
- **Status:** active
- **Recorded:** session Discovery, cli/cat
- **Why:** `--url` задаёт удалённый источник; позиционные аргументы — локальный. При одновременной передаче — ошибка.
- **Rejected alternatives:** Разрешить оба (неясно, что приоритетнее).

### D-003 — GitHub API base URL: различать cloud и enterprise
- **Status:** active
- **Recorded:** session Discovery, cli/cat, post-audit
- **Why:** `github.com` → `https://api.github.com`; self-hosted → `https://<host>/api/v3`. Неправильный baseUrl ведёт к 404.
- **Risk accepted:** Для enterprise нужен правильный `/api/v3` путь. Пользователь должен знать URL своего инстанса.
- **Rejected alternatives:** Единый `https://<host>/api` (не соответствует GitHub API).

### D-004 — ОДИН VCS-клиент на весь запрос --url
- **Status:** active
- **Recorded:** session Discovery, cli/cat, post-audit
- **Why:** Создание нового клиента на каждый файл — архитектурная ошибка. Один клиент → один request-factory → переиспользование.
- **Rejected alternatives:** Клиент на каждый вызов (N объектов на N файлов — waste).

### D-005 — `token!` non-null assertion — осознанный
- **Status:** active
- **Recorded:** session Discovery, cli/cat, post-audit
- **Why:** `resolveCatUrl` валидирует токен до создания VCS-клиента (return early если missing). После валидации используется `token!` — осознанный non-null, токен гарантированно определён.
- **Risk accepted:** При будущем рефакторинге early-return может быть убран, и `!` маскирует null. Принято ради чистоты кода.
- **Rejected alternatives:** `if (!token) throw` перед каждым использованием (избыточно).

## 7. File Structure

```

cli/cmd/cat/
├── index.ts
├── cat.cmd.ts (MODIFY: +--url поддержка)
└── cat-url.fn.ts (NEW: resolveCatUrl + VCS-клиент)

cli/utils/cat-gen/
└── cat-gen.ts (MODIFY: +catGenFromVcs)

```

## 8. Bootstrap Requirements

| Requirement | Kind | Owner | Resolution |
|---|---|---|---|
| `parseVcsUrl` | external-type | external-prereq-scope | ✅ vcs-client TSK-27 |
| `VcsGitlabClient` | external-type | external-prereq-scope | ✅ vcs-client TSK-29 |
| `VcsGithubClient` | external-type | external-prereq-scope | ✅ vcs-client TSK-30 |
| `GITLAB_PERSONAL_TOKEN` | env | operator-action | Оператор устанавливает |
| `GITHUB_PERSONAL_TOKEN` | env | operator-action | Оператор устанавливает |

## 9. Handoff to Task Scaffolding

- **Implementation files:** 2 modify, 1 new, 1 new test
- **Stack dependencies:** TypeScript, node:test
- **Named abstractions:** `catGenFromVcs`, `resolveCatUrl`
- **Open risks:**
  - `cat --url` делает N+1 запросов (1 getChanges + N getFileContent) — latency для больших MR
  - GitHub rate limit (60 req/hr без токена, 5000 с токеном)
  - ~~Deleted files фильтруются, но renamed — используется new_path~~
```
