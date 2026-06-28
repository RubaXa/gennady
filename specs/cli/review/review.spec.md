# Module: review

## 1. Module Vision

Review-команда — ядро AI-review пайплайна. Читает staged git diff, разбивает на AI-батчи по токенам, параллельно прогоняет через AI-модели, выводит результаты. Дополнительно — сбор дискуссий GitLab MR в XML для AI-агента (`review-issues`) и верификация MR (DbC-контракты, security, архитектура) (`review-verify`).

→ Parent scope: [../cli.spec.md](../cli.spec.md)

## 2. Entity Inventory (Closed-World)

| Name                        | Type         | Purpose                                                                                                              |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `ReviewGen`                 | Class        | Ядро review: принимает diff, разбивает на AI-батчи (через `AiLegacyCore.createPromptsBatchesByDiff`), вызывает модели, агрегирует результаты |
| `ReviewIntent`              | Type         | Намерение запуска review: `url` \| `ref` \| `project-iid` \| `branch`                                                |
| `ReviewContextGit`          | Type         | Git-контекст: текущая ветка (`branch`), origin remote (`GitRemoteInfo`)                                              |
| `ReviewContextVcs`          | Type         | VCS-контекст: GitLab host, project, инициализированный `VcsGitlabClient`                                            |
| `ReviewContextMr`           | Type         | MR-контекст: iid, project_id, source_branch, title, web_url, author                                                  |
| `ReviewContextMrDiscussion` | Type         | GitLab discussion: id, notes[], resolvable, resolved, resolved_by                                                    |
| `ReviewContextMrNote`       | Type         | GitLab note: id, body, author, system, position, resolvable, resolved, resolved_by, updated_at                        |
| `ReviewCommandArgs`         | Type         | Нормализованные аргументы команды: branch, url, ref, project, iid, all, since, draft                                 |
| `ReviewCommandOptions`      | Type         | Опции запуска пайплайна: mode (`'verify'` \| `'issues'`), args, vcsContext?                                          |
| `ReviewCommandMode`         | Type         | Режим вывода: `'verify'` \| `'issues'`                                                                               |
| `ReviewCommandResult`       | Type         | Результат выполнения: ok, code, output?, artifact?                                                                  |
| `ReviewArtifact`            | Type         | XML-артефакт: mergeRequest + discussions + reviewArtifactXml                                                         |
| `parseReviewCommandArgs`    | Function     | Парсинг CLI-аргументов → `ReviewCommandArgs`                                                                         |
| `resolveReviewIntent`       | Function     | Определение намерения по аргументам: url > ref > project+iid > branch                                                |
| `buildReviewContextGit`     | Function     | Построение Git-контекста из локального репозитория                                                                    |
| `buildReviewContextVcs`     | Function     | Построение VCS-контекста: токен, host, GitLab API client                                                             |
| `loadReviewContextMr`       | Function     | Загрузка MR и discussions (или draft notes) через GitLab API                                                          |
| `runReviewCommand`          | Function     | Единый пайплайн: resolve intent → build contexts → load MR → build artifact → render XML                             |
| `buildReviewArtifactXml`    | Function     | Сборка XML-артефакта: MR + discussions + фильтрация (--since, --all)                                                 |
| `renderReviewIssuesXml`     | Function     | Рендеринг issues XML для AI-агента                                                                                    |
| `renderReviewVerifyXml`     | Function     | Рендеринг verify XML с DbC-контрактами и шаблонами верификации                                                        |

## 3. Entity Surfaces

### `ReviewGen`

- **Type:** Class
- **Purpose:** Генерация code review через LLM с учётом языковых спек.
- **Constructor:** `(init?: ReviewGenInit)`
- **Public Methods:**
  - `get ai(): AiLegacyCore` — доступ к AI-ядру (создание батчей, вызов модели)
  - `generate(code: string, langs?: string[]): Promise<string>` — генерация review по коду
- **Side Effect:** Сеть (AI-запросы), ФС (чтение языковых спек из `specs/{lang}/*.json`)

### `ReviewCommandResult`

- **Type:** Type
- **Purpose:** Результат выполнения review-команды.
- **Public Properties:** `ok: boolean`, `code: number`, `output?: string`, `artifact?: ReviewArtifact`

### `ReviewArtifact`

- **Type:** Type
- **Purpose:** Структурированный артефакт review-пайплайна.
- **Public Properties:** `mergeRequest: ReviewContextMr`, `discussions: ReviewContextMrDiscussion[]`, `reviewArtifactXml: string`

### `runReviewCommand`

- **Type:** Function
- **Purpose:** Единый пайплайн: resolve intent → build contexts → load MR → build artifact → render XML.
- **Signature:** `(options: ReviewCommandOptions) => Promise<ReviewCommandResult>`
- **Contract:** Режим `verify` → `renderReviewVerifyXml` (async, загружает шаблоны); режим `issues` → `renderReviewIssuesXml` (sync).

## 4. CLI Interface

### Команды (umbrella)

| Команда               | Файл                                  | Назначение                                                            |
| --------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `gennady review`      | `review.cmd.ts`                       | Базовое ревью staged изменений (Git-контекст, локальный diff)         |
| `gennady review-issues` | `review-issues.cmd.ts`              | Сбор дискуссий GitLab MR в XML для AI-агента                          |
| `gennady review-verify` | `review-verify.cmd.ts`              | Верификация MR (DbC-контракты, security, архитектура)                 |

### Аргументы

| Флаг              | Кратко   | Команды                       | Описание                                                                                       |
| ----------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `--branch`, `-b`  | —        | review, review-issues, review-verify | Git diff target branch (default: origin/main). Для review: diff относительно ветки. Для issues/verify: поиск MR по source_branch |
| `--url`           | —        | review-issues, review-verify  | URL GitLab MR (`https://gitlab.com/group/project/-/merge_requests/42`)                        |
| `--ref`           | —        | review-issues, review-verify  | GitLab MR ref в формате `<PROJECT>!<IID>` (напр. `group/repo!42`)                             |
| `--project`       | —        | review-issues, review-verify  | GitLab project path (owner/repo). Требует `--iid`                                              |
| `--iid`           | —        | review-issues, review-verify  | MR internal ID. Требует `--project`                                                            |
| `--all`           | —        | review-verify                 | Обзор всех MR (для review-verify)                                                              |
| `--since`         | —        | review-issues                 | ISO-курсор: вернуть только discussion threads, обновлённые после этой даты (инкрементально)     |
| `--draft`         | —        | review-issues                 | Режим черновиков: вместо discussions загрузить unpublished draft notes текущего пользователя    |

### Golden DX

```bash
# --- базовое ревью staged изменений ---
$ gennady review
🤖 GENNADY (llm-proxy/deepseek-v4-pro) 📝
----------------------------------------
- Tokens: 12420 (max per file: 8000)
- Languages: TypeScript
- Queue: 5
----------------------------------------
<результаты ревью от AI-моделей>

# --- ревью относительно ветки ---
$ gennady review --branch=develop

# --- сбор дискуссий MR в XML ---
$ gennady review-issues --ref group/repo!42
<Codebase>
  <MergeRequest iid="42" ...>
  ...
  </MergeRequest>
</Codebase>

# --- инкрементально: только новые обсуждения ---
$ gennady review-issues --ref group/repo!42 --since 2026-06-01

# --- draft notes вместо discussions ---
$ gennady review-issues --ref group/repo!42 --draft

# --- верификация MR ---
$ gennady review-verify --ref group/repo!42
<XML с DbC-контрактами, security-чеками и архитектурными правилами>

# --- верификация MR по URL ---
$ gennady review-verify --url https://gitlab.com/group/project/-/merge_requests/42

# --- поиск MR по ветке (без явного ref/url) ---
$ gennady review-issues --branch=feature/foo
ℹ Merge Request не найден для ветки: feature/foo

# --- ошибка: невалидный ref ---
$ gennady review-issues --ref badformat
✖ Ошибка: Некорректный --ref. Ожидается формат <PROJECT>!<IID>.
```

## 5. Architecture

```
cli/cmd/review/
├── index.ts                                  # import './review.cmd.ts'
├── review.cmd.ts                             # Базовое ревью: git diff → ReviewGen → AI-батчи → вывод
├── review-issues.cmd.ts                      # Сбор дискуссий: parseArgs → resolveVcsContext → runReviewCommand(mode: 'issues')
├── review-verify.cmd.ts                      # Верификация: parseArgs → runReviewCommand(mode: 'verify')
├── help.ts                                   # `printHelp()` для review
├── _core/
│   ├── logic/
│   │   ├── build-ai-first-knowledge-block.logic.ts  # Построение AI-first knowledge блока
│   │   ├── build-ai-verify-placeholders.logic.ts    # Построение плейсхолдеров для verify
│   │   ├── build-review-context-git.logic.ts        # Git-контекст: ветка + origin remote
│   │   ├── build-review-context-vcs.logic.ts        # VCS-контекст: токен + GitLab API client
│   │   ├── load-review-context-mr.logic.ts          # Загрузка MR и discussions/draft-notes
│   │   ├── parse-review-command-args.logic.ts       # Нормализация CLI-аргументов
│   │   ├── resolve-review-intent.logic.ts           # Определение намерения (url/ref/project-iid/branch)
│   │   ├── run-review-command.logic.ts              # Единый пайплайн review команд
│   │   └── verify-commands/                         # Команды верификации
│   ├── types/
│   │   ├── review-command-args.type.ts
│   │   ├── review-command-options.type.ts
│   │   ├── review-command-mode.type.ts
│   │   ├── review-command-result.type.ts
│   │   ├── review-context-git.type.ts
│   │   ├── review-context-mr.type.ts
│   │   ├── review-context-vcs.type.ts
│   │   ├── review-intent.type.ts
│   │   └── review-artifact.type.ts
│   ├── xml/
│   │   ├── build-review-artifact.xml.ts     # Сборка XML-артефакта (MR + discussions + фильтры)
│   │   ├── render-review-issues.xml.ts      # Рендеринг issues XML
│   │   └── render-review-verify.xml.ts      # Рендеринг verify XML (async, шаблоны)
│   └── io/
│       └── load-review-verify-template.io.ts # Загрузка шаблонов верификации
├── _shared/
│   └── prompt/                              # Общие prompt-блоки для review команд
└── __tests__/
    ├── review-issues.cmd.test.ts
    └── review-issues.cmd.error.test.ts

cli/cmd/review-issues/                        # Тонкий реэкспорт из ../review/
├── help.ts
└── index.ts

cli/cmd/review-verify/                        # Тонкий реэкспорт из ../review/
├── help.ts
├── index.ts
├── review-verify.cmd.ts
└── review-verify.xml.ts
```

**Поток выполнения `review` (local diff):**
1. `parseArgs` → извлечь `--branch`
2. `getGitDiffInfo(branch)` → parsedCodeDiff, parsedCodeTokens, programmingLanguages
3. Если diff пуст → выход с подсказкой «git add»
4. `ReviewGen.ai.createPromptsBatchesByDiff(parsedCodeDiff)` → батчи по токенам
5. `Promise.all(batches.map(batch => reviewGen.generate(batch.diff, batch.languages)))` → параллельный прогон через AI
6. Вывод результатов в stdout

**Поток выполнения `review-issues` / `review-verify`:**
1. `parseReviewCommandArgs(argv)` → `ReviewCommandArgs`
2. `resolveVcsContext(vcsCliArgs)` → предзагруженный VCS-контекст (токен, host, project)
3. `runReviewCommand({ mode, args, vcsContext })`:
   - `resolveReviewIntent(args)` → `ReviewIntent`
   - `buildReviewContextVcs(host, project)` → `ReviewContextVcs` (GitLab client)
   - `loadReviewContextMr(intent, vcs, git, draft?)` → MR + discussions/draft-notes
   - `buildReviewArtifactXml(mr, discussions, all?, since?)` → XML-артефакт
   - Режим `verify` → `renderReviewVerifyXml(artifactXml)` (async)
   - Режим `issues` → `renderReviewIssuesXml(artifactXml)` (sync)
4. Вывод результата в stdout, exit code

## 6. Decision Log

### D-001 — Единый `_core/` для review-issues и review-verify
- **Status:** active
- **Recorded:** session Discovery, cli/review
- **Why:** `review-issues` и `review-verify` разделяют общий пайплайн (resolve intent → build contexts → load MR → build artifact). Общий `_core/` с типами, логикой и XML-рендерингом; каждая команда — тонкая обвязка, задающая `mode`.
- **Rejected alternatives:** Дублировать логику в каждой команде (DRY-нарушение); вынести в отдельный сервис (review — CLI-специфичен).

### D-002 — `review` (local diff) и `review-issues`/`review-verify` (VCS) — разные потоки
- **Status:** active
- **Recorded:** session Discovery, cli/review
- **Why:** `review` работает с локальным staged diff и AI-моделями через `ReviewGen`. `review-issues`/`review-verify` работают с GitLab API и генерируют XML-артефакты. Разные источники данных, разные потребители результата.
- **Rejected alternatives:** Объединить под одним флагом `--mode` (разный жизненный цикл, разные зависимости).

### D-003 — `--since` для инкрементальной загрузки discussions
- **Status:** active
- **Recorded:** session Discovery, cli/review
- **Why:** При повторных запусках `review-issues` не нужно перечитывать все discussions. `--since <ISO>` фильтрует только обновлённые threads, экономя токены и время.
- **Rejected alternatives:** Всегда перечитывать всё (waste для больших MR с долгой историей).

### D-004 — `--draft` для черновиков вместо discussions
- **Status:** active
- **Recorded:** session Discovery, cli/review
- **Why:** Рецензент может готовить ответ в draft notes до публикации. `--draft` загружает `draft_notes` endpoint и маппит их в форму discussions для единого XML-артефакта.
- **Rejected alternatives:** Отдельная команда `review-drafts` (дублирование пайплайна).

### D-005 — branch fallback для поиска MR
- **Status:** active
- **Recorded:** session Discovery, cli/review
- **Why:** Если не указан явный `--url`/`--ref`/`--project`+`--iid`, команда ищет MR по текущей ветке через `getOne({ sourceBranch, state: 'opened' })`. Удобно при работе в feature-ветке.
- **Rejected alternatives:** Требовать всегда явный ref (менее lazy).

## 7. File Structure

```
cli/cmd/review/
├── index.ts
├── review.cmd.ts
├── review-issues.cmd.ts
├── review-verify.cmd.ts
├── help.ts
├── _core/
│   ├── logic/
│   │   ├── build-ai-first-knowledge-block.logic.ts
│   │   ├── build-ai-verify-placeholders.logic.ts
│   │   ├── build-review-context-git.logic.ts
│   │   ├── build-review-context-vcs.logic.ts
│   │   ├── load-review-context-mr.logic.ts
│   │   ├── parse-review-command-args.logic.ts
│   │   ├── resolve-review-intent.logic.ts
│   │   ├── run-review-command.logic.ts
│   │   └── verify-commands/
│   ├── types/
│   │   ├── review-command-args.type.ts
│   │   ├── review-command-options.type.ts
│   │   ├── review-command-mode.type.ts
│   │   ├── review-command-result.type.ts
│   │   ├── review-context-git.type.ts
│   │   ├── review-context-mr.type.ts
│   │   ├── review-context-vcs.type.ts
│   │   ├── review-intent.type.ts
│   │   └── review-artifact.type.ts
│   ├── xml/
│   │   ├── build-review-artifact.xml.ts
│   │   ├── render-review-issues.xml.ts
│   │   └── render-review-verify.xml.ts
│   └── io/
│       └── load-review-verify-template.io.ts
├── _shared/prompt/
└── __tests__/
    ├── review-issues.cmd.test.ts
    └── review-issues.cmd.error.test.ts

cli/cmd/review-issues/
├── help.ts
└── index.ts

cli/cmd/review-verify/
├── help.ts
├── index.ts
├── review-verify.cmd.ts
└── review-verify.xml.ts
```

## 8. Bootstrap Requirements

| Requirement              | Kind          | Owner                   | Resolution                                              |
| ------------------------ | ------------- | ----------------------- | ------------------------------------------------------- |
| `VcsGitlabClient`        | external-type | external-scope          | ✅ vcs-client                                            |
| `GITLAB_PERSONAL_TOKEN`  | env           | operator-action         | Оператор устанавливает                                   |
| `GITLAB_API_PATH`        | env           | operator-action         | Опционально (`/api/v4` по умолчанию)                     |
| `getGitDiffInfo`         | external-fn   | shared/backend/git      | ✅ git-core.ts                                           |
| `getGitCurrentBranch`    | external-fn   | shared/backend/git      | ✅ git-core.ts                                           |
| `getGitRemote`           | external-fn   | shared/backend/git      | ✅ git-core.ts                                           |
| `AiLegacyCore`           | external-type | cli/utils/ai-legacy     | ✅ ai-legacy-core.ts                                     |
| `ReviewGen`              | external-type | cli/utils/review-gen    | ✅ review-gen.ts                                         |

## 9. Handoff to Task Scaffolding

- **Implementation files:** 3 команды (review, review-issues, review-verify), 2 реэкспорта, ~16 файлов в `_core/`
- **Stack dependencies:** TypeScript, node:test, GitLab API, VcsGitlabClient, AiLegacyCore
- **Named abstractions:** `ReviewGen`, `ReviewIntent`, `ReviewContextGit`, `ReviewContextVcs`, `ReviewContextMr`, `ReviewArtifact`, `runReviewCommand`
- **Open risks:**
  - `review` (local diff) использует `AiLegacyCore` (legacy) — потенциальная миграция на новый AI-клиент
  - `review-issues` / `review-verify` требуют GitLab Personal Token — без него команды не работают
  - `--since` фильтрация происходит на уровне XML-сборки, не на уровне API — все discussions всё равно загружаются
