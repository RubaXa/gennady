# vcs: Scope Specification

## scope-type

product

## 1. Vision & Primary Goal

VCS-клиент (GitLab + GitHub): работа с Merge Requests / Pull Requests, discussions, файлами репозиториев. Абстрактный слой (Ports) + адаптеры (Adapters). Используется CLI-командами gennady для review-пайплайна и `cat --url`.

## 2. Project Type

- **Type:** service-module-sdk
- **Why this type:** Библиотека-адаптер для внешних API (GitLab, GitHub). Предоставляет интерфейсы и реализации. Потребители — CLI-команды gennady.

## 3. Approved Golden DX Example

```ts
// --- GitLab: review-пайплайн ---
const gl = new VcsGitlabClient({ baseUrl: 'https://gitlab.com/api/v4', token: 'glpat-xxx' });
const mrs = await gl.MergeRequests.getList({ project: 'group/repo', sourceBranch: 'feature/x' });
const discussions = await gl.MergeDiscussions?.getAll({ project: 'group/repo', iid: mr.iid });

// --- GitLab: cat --url (новое) ---
const changes = await gl.MergeRequests.getChanges({ project: 'group/repo', iid: 42 });
// → [{ path: 'src/foo.ts', status: 'modified', ref: 'feature/x' }, ...]
const content = await gl.RepositoryFiles.getFileContent({
  repository: 'group/repo',
  path: 'src/foo.ts',
  ref: changes[0].ref,
});
// → { path: 'src/foo.ts', content: 'import ...', encoding: 'utf-8' }

// --- GitHub: cat --url (минимальный адаптер) ---
const gh = new VcsGithubClient({ baseUrl: 'https://api.github.com', token: 'ghp_xxx' });
const prChanges = await gh.MergeRequests.getChanges({ repository: 'owner/repo', number: 99 });
// → [{ path: 'lib/utils.ts', status: 'added', ref: 'feature-branch' }, ...]
const fileContent = await gh.RepositoryFiles.getFileContent({
  repository: 'owner/repo',
  path: 'lib/utils.ts',
  ref: prChanges[0].ref,
});

// --- URL-парсер ---
const parsed = parseVcsUrl('https://gitlab.com/group/project/-/merge_requests/42');
// → { provider: 'gitlab', host: 'gitlab.com', repository: 'group/project', iid: 42 }
```

## 4. Requirements & Constraints

### 4.1 Functional Requirements

| ID                    | Требование                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Существующие**      |                                                                                                                                                                                                                                                          |
| FR-01                 | `VcsClient` — абстрактный порт с опциональными подобъектами: `MergeRequests`, `MergeDiscussions?`, `RepositoryFiles?`                                                                                                                                    |
| FR-02                 | `VcsClientMergeRequests` — порт: `getList`, `getByIid`, `getChanges`, `approve`                                                                                                                                                                          |
| FR-03                 | `VcsClientMergeDiscussions` — порт: `getList`, `getAll`, `addNote`, `createDiscussion`, `listDraftNotes`                                                                                                                                                 |
| FR-04                 | `VcsGitlabClient` — adapter: GitLab REST API через fetch                                                                                                                                                                                                 |
| FR-05                 | `VcsGitlabMergeRequests` — adapter: GitLab MR API (включая getChanges)                                                                                                                                                                                   |
| FR-06                 | `VcsGitlabMergeDiscussions` — adapter: GitLab Discussions API                                                                                                                                                                                            |
| **Новые**             |                                                                                                                                                                                                                                                          |
| FR-08                 | `VcsClientRepositoryFiles` — порт: `getFileContent(repository, path, ref)` → декодированный `string`                                                                                                                                                     |
| FR-09                 | `VcsGitlabRepositoryFiles` — adapter: `GET /projects/:id/repository/files/:path/raw?ref=`                                                                                                                                                                |
| FR-10                 | `VcsGitlabMergeRequests.getChanges` — `GET /projects/:id/merge_requests/:iid/changes`                                                                                                                                                                    |
| FR-11                 | `VcsGithubClient` — adapter: GitHub REST API (минимальный: `MergeRequests.getChanges` + `RepositoryFiles.getFileContent`)                                                                                                                                |
| FR-12                 | `VcsGithubMergeRequests.getChanges` — `GET /repos/:owner/:repo/pulls/:number/files` с пагинацией                                                                                                                                                         |
| FR-13                 | `VcsGithubRepositoryFiles.getFileContent` — `GET /repos/:owner/:repo/contents/:path?ref=` (декодирование base64 → utf-8)                                                                                                                                 |
| FR-14                 | `parseVcsUrl(url)` — pure-функция: разбор URL → `{ provider, host, repository, iid }`                                                                                                                                                                    |
| FR-15                 | Все возвращаемые типы для новых методов — типизированы (`VcsMergeRequestChanges`, `VcsFileContent`)                                                                                                                                                      |
| FR-16                 | Адаптер `getFileContent` возвращает **декодированный** контент (`string`); `encoding` — информационное поле                                                                                                                                              |
| FR-17                 | `VcsMergeRequestChanges` содержит `ref` (source branch / head SHA) для использования в `getFileContent`                                                                                                                                                  |
| **agent-inbox**       |                                                                                                                                                                                                                                                          |
| FR-18                 | `VcsClient.Inbox?` — опциональный порт `VcsClientInbox` (GitLab-only; GitHub не реализует)                                                                                                                                                               |
| FR-19                 | `VcsClientInbox.getActionable()` → `VcsActionableMr[]` (нормализованные MR, требующие реакции): `role` (reviewer/author/mentioned), `events[]`, `directlyAddressed`, дедуп по `webUrl`                                                                   |
| FR-20                 | `VcsGitlabInbox` — adapter: ОДИН GraphQL-запрос `currentUser { todos(type:[MERGEREQUEST]) + reviewRequestedMergeRequests + authoredMergeRequests }`; чистая нормализация (без отсева/политики)                                                           |
| FR-21                 | `VcsGitlabClient` — GraphQL-транспорт `POST /api/graphql` (origin из baseUrl), отдельно от REST `/api/v4`; ошибки `errors[]` → throw                                                                                                                     |
| FR-22                 | `VcsGitlabClient.getCurrentUser()` → `VcsUser {login, name}` (REST `GET /user`) — identity владельца токена                                                                                                                                              |
| FR-23                 | `VcsClientMergeDiscussions.createDiscussion({project, iid, body, position?})` — порт: новая дискуссия (общая или line-comment)                                                                                                                           |
| FR-24                 | `VcsGitlabMergeDiscussions.createDiscussion` — `POST /discussions`; для line-comment `position[*_sha]` берутся из `MR.diff_refs`, `position[new_line]`/`[old_line]` по правилу added→new / removed→old / context→оба; `position_type=text`               |
| FR-25                 | `VcsClientMergeDiscussions.listDraftNotes({project, iid})` — порт: неопубликованные draft notes текущего пользователя. `VcsGitlabMergeDiscussions.listDraftNotes` — `GET /projects/:id/merge_requests/:iid/draft_notes`, постранично (`per_page`/`page`) |
| **vcs-approve**       |                                                                                                                                                                                                                                                          |
| FR-26                 | `VcsClientMergeRequests.approve({repository, iid})` — порт: approve MR/PR. GitHub — deferred                                                                                                                                                             |
| FR-27                 | `VcsGitlabMergeRequests.approve` — `POST /projects/:id/merge_requests/:iid/approve`                                                                                                                                                                      |
| FR-28                 | `VcsMergeRequestApproveQuery` — value object: `{ repository: string, iid: string \| number }`                                                                                                                                                            |
| FR-29                 | При approve, если MR уже approved — GitLab возвращает 409; адаптер пробрасывает ошибку как `VcsApproveError` с кодом `ALREADY_APPROVED`                                                                                                                  |
| **vcs-reply resolve** |                                                                                                                                                                                                                                                          |
| FR-30                 | `VcsClientMergeDiscussions.resolveDiscussion({project, iid, discussionId, resolved})` — порт: резолв/реопен дискуссии                                                                                                                                    |
| FR-31                 | `VcsGitlabMergeDiscussions.resolveDiscussion` — `PUT /projects/:id/merge_requests/:iid/discussions/:discussion_id?resolved=true\|false`                                                                                                                  |
| FR-32                 | `VcsResolveDiscussionQuery` — value object: `{ project: string, iid: string \| number, discussionId: string, resolved: boolean }`                                                                                                                        |
| FR-33                 | Успех (200) → void. Ошибка (403/404) → VcsError                                                                                                                                                                                                          |
| FR-34                 | GitHub — deferred (stub выбрасывает «not implemented»)                                                                                                                                                                                                   |
| **unapprove**         |                                                                                                                                                                                                                                                          |
| FR-35                 | `VcsClientMergeRequests.unapprove(query: VcsMergeRequestApproveQuery)` — порт; переиспользует тип запроса от `approve`                                                                                                                                   |
| FR-36                 | `VcsGitlabMergeRequests.unapprove` — `POST /projects/:id/merge_requests/:iid/unapprove`                                                                                                                                                                  |
| FR-37                 | GitHub — deferred (stub)                                                                                                                                                                                                                                 |
| **todo done**         |                                                                                                                                                                                                                                                          |
| FR-38                 | `VcsClientInbox.markTodoDone(query: { todoId: string })` — порт                                                                                                                                                                                          |
| FR-39                 | `VcsGitlabInbox.markTodoDone` — GraphQL `todoMarkDone(input: { id })`                                                                                                                                                                                    |
| FR-40                 | `VcsActionableMr.todoIds: string[]` — новое поле (≥0 для todo-источников, `[]` для connection-источников reviewRequested/authored)                                                                                                                       |
| FR-41                 | `getActionable` GraphQL-запрос расширен: `currentUser.todos.nodes { id }`                                                                                                                                                                                |
| **edit/delete note**  |                                                                                                                                                                                                                                                          |
| FR-42                 | `VcsClientMergeDiscussions.updateNote(query: { project, iid, noteId, body })` — порт: редактировать свою заметку                                                                                                                                         |
| FR-43                 | `VcsClientMergeDiscussions.deleteNote(query: { project, iid, noteId, discussionId? })` — порт: удалить свою заметку                                                                                                                                      |
| FR-44                 | `VcsGitlabMergeDiscussions.updateNote` — `PUT /projects/:id/merge_requests/:iid/notes/:note_id`                                                                                                                                                          |
| FR-45                 | `VcsGitlabMergeDiscussions.deleteNote` — `DELETE /projects/:id/merge_requests/:iid/notes/:note_id`                                                                                                                                                       |
| FR-46                 | Обязательный guard: `author == getCurrentUser().login`; чужая заметка → отказ                                                                                                                                                                            |
| FR-47                 | `review-issues` артефакт расширен: `noteId` в каждой реплике (новое поле в `VcsDiscussionNote`)                                                                                                                                                          |
| **pipeline**          |                                                                                                                                                                                                                                                          |
| FR-48                 | `VcsClientMergeRequests.getPipeline(query: { project, iid }) → Promise<VcsPipelineStatus>` — порт                                                                                                                                                        |
| FR-49                 | `VcsGitlabMergeRequests.getPipeline` — GraphQL `mergeRequest.headPipeline { status jobs { nodes { id name status } } }`                                                                                                                                  |
| FR-50                 | `VcsPipelineStatus` — value object (переименован из `VcsPipeline`): `{ status: string, jobs: { id: string, name: string, status: string }[] }`                                                                                                           |
| **job management**    |                                                                                                                                                                                                                                                          |
| FR-51                 | `VcsClientPipeline` — опциональный порт на `VcsClient`: `getJob`, `playJob`, `cancelJob`, `getJobLog`                                                                                                                                                    |
| FR-52                 | `VcsGitlabJobAdapter` — REST-адаптер: `GET /projects/:id/jobs/:job_id`, `POST .../play`, `POST .../cancel`, `GET .../trace`                                                                                                                              |
| FR-53                 | `VcsJob` VO: `{ id: string, name: string, status: string, stage: string, ref: string, webUrl: string }`                                                                                                                                                  |
| FR-54                 | `VcsJobQuery` VO: `{ project: string, jobId: string }`                                                                                                                                                                                                   |
| **delete discussion** |                                                                                                                                                                                                                                                          |
| FR-55                 | `VcsClientMergeDiscussions.deleteDiscussion({project, iid, discussionId})` — порт: удалить тред целиком (DELETE /discussions/:id)                                                                                                                        |
| FR-56                 | `VcsGitlabMergeDiscussions.deleteDiscussion` — `DELETE /projects/:id/merge_requests/:iid/discussions/:discussion_id`                                                                                                                                     |
| **draft notes**       |                                                                                                                                                                                                                                                          |
| FR-57                 | `VcsClientMergeDiscussions.createDraftNote({project, iid, body, position?})` — порт: создать черновик (POST /draft_notes)                                                                                                                                |
| FR-58                 | `VcsClientMergeDiscussions.updateDraftNote({project, iid, draftNoteId, body, position?})` — порт: обновить черновик (PUT /draft_notes/:id)                                                                                                               |
| FR-59                 | `VcsClientMergeDiscussions.deleteDraftNote({project, iid, draftNoteId})` — порт: удалить черновик (DELETE /draft_notes/:id)                                                                                                                              |
| FR-60                 | `VcsClientMergeDiscussions.publishDraftNote({project, iid, draftNoteId})` — порт: опубликовать черновик (PUT /draft_notes/:id/publish)                                                                                                                   |

### 4.2 Non-Functional Constraints

- **NFC-01**: Zero runtime dependencies (fetch — built-in Node.js 22+)
- **NFC-02**: Все экспортируемые сущности покрыты DBC-контрактами
- **NFC-03**: File headers: `// @file:`, `// @consumers:`
- **NFC-04**: GitHub-адаптер НЕ реализует `MergeDiscussions` (deferred); порт `MergeDiscussions` на `VcsClient` — опциональный
- **NFC-05**: `getChanges` поддерживает пагинацию (`page`, `perPage`) — для GitHub (limit 100/страница, max 3000)
- **NFC-06**: `getFileContent` обрабатывает удалённые файлы (404 → `null`), бинарные файлы (пропуск с `encoding: 'base64'`)
- **NFC-07**: URL-парсер `parseVcsUrl` — чистая функция, без сетевых вызовов

### 4.3 Out-of-Scope

- Полная реализация GitHub Discussions (v2)
- Переименование `Discussions` → `Threads` (отдельная задача)
- OAuth flow (используется PAT token)
- Batch-загрузка файлов (каждый `getFileContent` — отдельный запрос)
- Bitbucket адаптер
- `getChangesWithDiff` (получение diff-контента) — deferred
- GitHub Approve (v2 — GitHub использует pull request reviews, отдельный endpoint)

### 4.4 Runtime Backing

| Capability                           | Posture                      |
| ------------------------------------ | ---------------------------- |
| GitLab REST API (MR, Discussions)    | `real-runtime`               |
| GitLab Repository Files API          | `real-runtime`               |
| GitHub REST API (PR files, Contents) | `real-runtime`               |
| HTTP (fetch)                         | `real-runtime`               |
| URL-парсер                           | `real-runtime`               |
| GitHub Discussions                   | `not-implemented` (deferred) |
| Переименование Discussions → Threads | `not-implemented` (deferred) |
| GitLab GraphQL API (`currentUser`)   | `real-runtime`               |
| GitLab `/user`, create discussion    | `real-runtime`               |
| GitLab Approve API                   | `real-runtime`               |
| Inbox-порт для GitHub                | `not-implemented` (deferred) |

### 4.5 Rules

| Rule               | Category | Source                                      |
| ------------------ | -------- | ------------------------------------------- |
| `typescript-rules` | coding   | `ai/directives/coding/typescript-rules.xml` |

## 5. High-Level Architecture

Ports & Adapters с опциональными портами на `VcsClient`:

```
services/vcs-client/
├── entities/
│   ├── vcs-user.type.ts
│   ├── vcs-merge-request-changes.type.ts    (NEW)
│   ├── vcs-actionable-mr.type.ts            (NEW: agent-inbox)
│   └── vcs-file-content.type.ts             (NEW)
├── abstract/
│   ├── vcs-client.ts                        (MergeDiscussions/Inbox → optional)
│   ├── vcs-client-merge-requests.ts         (+ getChanges)
│   ├── vcs-client-merge-discussions.ts      (+ createDiscussion)
│   ├── vcs-client-inbox.ts                  (NEW: agent-inbox)
│   └── vcs-client-repository-files.ts       (NEW)
├── gitlab/
│   ├── vcs-gitlab-client.ts                 (+ GraphQL transport, getCurrentUser, Inbox)
│   ├── vcs-gitlab-merge-requests.ts         (+ getChanges)
│   ├── vcs-gitlab-merge-discussions.ts      (+ createDiscussion)
│   ├── vcs-gitlab-inbox.ts                  (NEW: GraphQL actionable inbox)
│   └── vcs-gitlab-repository-files.ts       (NEW)
└── github/                                   (NEW dir)
    ├── vcs-github-client.ts                  (NEW)
    ├── vcs-github-merge-requests.ts          (NEW: getChanges only)
    └── vcs-github-repository-files.ts        (NEW: getFileContent only)
```

**URL-парсер:**

```
services/vcs-client/
└── parse-vcs-url.ts                          (NEW: pure function)
```

### 5.1 Rejected Alternatives

| Вариант                                        | Почему отвергнут                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `getChanges` на `RepositoryFiles`              | MR changes — свойство MR, не репозитория (Octokit, gitbeaker так же)          |
| Отдельный `GithubCatSource` вместо `VcsClient` | Фрагментация абстракций; лучше один контракт адаптера с опциональными портами |
| `GITHUB_TOKEN` (без `PERSONAL`)                | Для консистентности с `GITLAB_PERSONAL_TOKEN`                                 |
| Обязательный `MergeDiscussions` для GitHub     | Избыточно для `cat --url`; stub загрязняет код                                |

## 6. Decision Log

### D-001 — scope-type = product (service-module-sdk)

- **Status:** active
- **Recorded:** session Discovery, vcs
- **Why:** VCS-клиент — библиотека с абстракциями и реализациями. Потребитель — CLI gennady. Не infrastructure, не contracts.
- **Risk accepted:** —
- **Rejected alternatives:** library (нет публичного API для внешних потребителей), contracts (не только интерфейсы)

### D-002 — Новый порт: VcsClientRepositoryFiles

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (cat --url)
- **Why:** `getFileContent` — репозиторная операция, а не MR. Отдельный порт сохраняет cohesion и следует индустриальному паттерну (Octokit `repos.getContent`, gitbeaker `RepositoryFiles.show`).
- **Risk accepted:** Порт начинается с одного метода — premature abstraction risk. Принято осознанно: будущие операции (tree, blame, raw) лягут сюда же.
- **Rejected alternatives:** Добавить `getFileContent` в `MergeRequests` (нарушает cohesion), положить прямо на `VcsClient` (grab-bag interface).

### D-003 — Опциональные порты на VcsClient

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (cat --url)
- **Why:** Позволяет GitHub-адаптеру реализовать только `MergeRequests.getChanges` + `RepositoryFiles.getFileContent` без `MergeDiscussions`. Избегает stub-методов и нарушения LSP.
- **Risk accepted:** Потребители должны проверять наличие порта перед вызовом (`client.MergeDiscussions?.getAll()`). Существующие потребители всегда работают с GitLab → порт всегда есть.
- **Rejected alternatives:** Stub с `throw new Error('Not implemented')` (некрасиво), отдельный класс `GithubCatSource` (фрагментация).

### D-004 — URL-парсер в vcs-client

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (cat --url)
- **Why:** Разбор GitLab/GitHub URL — доменное знание VCS. Pure-функция без сетевых вызовов. Используется `cat --url` и потенциально другими командами.
- **Risk accepted:** Поддерживаются только форматы `gitlab.com/.../-/merge_requests/:iid` и `github.com/.../pull/:number`. Self-hosted варианты — по тому же шаблону.
- **Rejected alternatives:** Парсер в `cli/cmd/cat/` (доменная логика не в том слое).

### D-005 — GitHub adapter: минимальный (без Discussions)

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (cat --url)
- **Why:** `cat --url` требует только `getChanges` + `getFileContent`. Discussions — отдельная задача (существующий `vcs-github.task.spec.md`).
- **Risk accepted:** При добавлении GitHub Discussions потребуется дореализовать `VcsGithubMergeDiscussions`. Время на это — неделя.
- **Rejected alternatives:** Полная реализация Discussions сейчас (задержит `cat --url` на недели).

### D-006 — Контракт кодировки: адаптер декодирует

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (cat --url)
- **Why:** GitHub API возвращает base64, GitLab `/raw` — plain text. Адаптер приводит к единому формату: `VcsFileContent.content: string` (декодированный).
- **Risk accepted:** Бинарные файлы — `encoding: 'base64'`, контент не декодируется (возвращается как есть в base64). Потребитель фильтрует по `encoding`.
- **Rejected alternatives:** Возвращать сырой base64 и требовать от потребителя декодировать (перекладывание ответственности наружу).

### D-007 — Метод approve на MergeRequests порте

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (vcs-approve)
- **Why:** CLI-команда `vcs-approve` требует вызова GitLab approve API. Метод `approve({repository, iid})` на порте `VcsClientMergeRequests` — естественное расширение: approve — операция над MR, а не над репозиторием или дискуссиями.
- **Risk accepted:** GitHub approve отложен (pull request reviews — другой API-паттерн). При добавлении GitHub — метод на порте уже есть, нужна только реализация в `VcsGithubMergeRequests`.
- **Rejected alternatives:** Отдельный порт `VcsClientApprove` — избыточно для одного метода, атомарная операция approve — часть жизненного цикла MR.

### D-008 — Метод resolveDiscussion на MergeDiscussions порте

- **Status:** active
- **Recorded:** session Discovery, vcs, refine (vcs-reply resolve)
- **Why:** vcs-reply должен уметь резолвить дискуссии при ответе или без него. GitLab API: `PUT /discussions/:id?resolved=true`. Метод `resolveDiscussion` на существующем порте `VcsClientMergeDiscussions` — операция над discussion, не требует нового порта.
- **Risk accepted:** GitHub — deferred (stub). `resolve: false` (reopen) реализован тем же методом с параметром.
- **Rejected alternatives:** Отдельная команда `vcs-resolve` — избыточно, дублирует всю инфраструктуру stdin/DI/vcs-context-resolver. Флаг `--resolve` у команды — не позволяет зарезолвить без ответа.

## 7. Scope Dependencies

- **Depends on:** [`infra-base`](../infra-base/infra-base.spec.md) — TypeScript, node:test
- **Provides to:** CLI-команды gennady (review-verify, review-issues, vcs-reply, vcs-approve, **cat**)

## 8. Bootstrap Requirements

| Requirement                               | Kind       | Owner           | Resolution                        |
| ----------------------------------------- | ---------- | --------------- | --------------------------------- |
| Существующий код в `services/vcs-client/` | structural | this-scope-task | ✅ уже существует                 |
| `GITHUB_PERSONAL_TOKEN` env var           | env        | operator-action | Оператор устанавливает переменную |
| `vcs-merge-request-approve-query.type.ts` | file       | this-scope-task | Создать value object для approve  |

## 9. Module Map

### 9.1 Modules

- [vcs-client](./vcs-client/vcs-client.spec.md) — VCS-клиент: Ports, Adapters, Value Objects для GitLab + GitHub API

### 9.4 Handoff to Task Scaffolding

- **Primary input:** `specs/vcs/vcs.spec.md`
- **Areas requiring decomposition:** `vcs-client` (новые порты + GitHub-адаптер)
- **Named abstractions:** `VcsClient`, `VcsClientMergeRequests`, `VcsClientMergeDiscussions`, `VcsClientRepositoryFiles`, `VcsGitlabClient`, `VcsGitlabMergeRequests`, `VcsGitlabMergeDiscussions`, `VcsGitlabRepositoryFiles`, `VcsGithubClient`, `VcsGithubMergeRequests`, `VcsGithubRepositoryFiles`, `parseVcsUrl`, `VcsUrl`, `VcsMergeRequestChanges`, `VcsFileContent`
- **Open risks:**
  - GitHub Discussions — deferred, нужен отдельный refine
  - Переименование `Discussions` → `Threads` — отдельная задача
  - `project` vs `repository` naming — унифицировать при переименовании Discussions
