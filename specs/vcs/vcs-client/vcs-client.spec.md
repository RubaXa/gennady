# Module: vcs-client

## 1. Module Vision

VCS-клиент для GitLab и GitHub: абстрактные порты + адаптеры. Merge Requests / Pull Requests, Discussions, Repository Files, URL-парсер. Используется CLI-командами gennady для review-пайплайна и `cat --url`.

→ Parent scope: [../vcs.spec.md](../vcs.spec.md)

## 2. Entity Inventory (Closed-World)

| Name                          | Type            | Purpose                                                                                                                                               |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VcsUser`                     | Value Object    | Пользователь VCS: name, login                                                                                                                         |
| `VcsUrl`                      | Value Object    | Результат парсинга VCS URL: provider, host, repository, iid                                                                                           |
| `VcsMergeRequestChanges`      | Value Object    | Изменённые файлы MR/PR: path, status, ref, additions, deletions                                                                                       |
| `VcsFileContent`              | Value Object    | Содержимое файла из репозитория: path, content, encoding                                                                                              |
| `VcsActionableMr`             | Value Object    | MR требующий реакции: role, events, webUrl, todoIds                                                                                                   |
| `VcsDiscussionNote`           | Value Object    | Заметка в дискуссии: noteId, author, body **(@deferred — возвращается как `unknown` из `addNote`/`createDiscussion`, отдельный type-файл не создан)** |
| `VcsClient`                   | Port            | Абстрактный VCS-клиент с опциональными портами                                                                                                        |
| `VcsClientMergeRequests`      | Port            | Абстракция работы с Merge Requests / Pull Requests                                                                                                    |
| `VcsClientMergeDiscussions`   | Port (optional) | Абстракция работы с Discussions                                                                                                                       |
| `VcsClientRepositoryFiles`    | Port            | Абстракция работы с файлами репозитория                                                                                                               |
| `VcsClientInbox`              | Port (optional) | Абстракция работы с actionable-инбоксом GitLab                                                                                                        |
| `VcsGitlabClient`             | Adapter         | GitLab-реализация VcsClient                                                                                                                           |
| `VcsGitlabClientOptions`      | Value Object    | Опции подключения: baseUrl, token                                                                                                                     |
| `VcsGitlabMergeRequests`      | Adapter         | GitLab-реализация MR API (включая getChanges)                                                                                                         |
| `VcsGitlabMergeDiscussions`   | Adapter         | GitLab-реализация Discussions API                                                                                                                     |
| `VcsGitlabRepositoryFiles`    | Adapter         | GitLab-реализация Repository Files API                                                                                                                |
| `VcsGithubClient`             | Adapter         | GitHub-реализация VcsClient (минимальная)                                                                                                             |
| `VcsGithubMergeRequests`      | Adapter         | GitHub-реализация PR API (getChanges)                                                                                                                 |
| `VcsGithubRepositoryFiles`    | Adapter         | GitHub-реализация Contents API                                                                                                                        |
| `VcsAddNoteQuery`             | Value Object    | Параметры создания заметки                                                                                                                            |
| `VcsDiscussionsListQuery`     | Value Object    | Параметры запроса списка дискуссий                                                                                                                    |
| `VcsMergeRequestsQuery`       | Value Object    | Параметры поиска MR                                                                                                                                   |
| `VcsMergeRequestByIidQuery`   | Value Object    | Параметры получения MR по IID                                                                                                                         |
| `VcsMergeRequestChangesQuery` | Value Object    | Параметры получения изменений MR: repository, iid/number, page?, perPage?                                                                             |
| `VcsMergeRequestApproveQuery` | Value Object    | Параметры approve MR: repository, iid                                                                                                                 |
| `VcsResolveDiscussionQuery`   | Value Object    | Параметры resolve discussion: project, iid, discussionId, resolved                                                                                    |
| `VcsUpdateNoteQuery`          | Value Object    | Параметры редактирования заметки: project, iid, noteId, body                                                                                          |
| `VcsDeleteNoteQuery`          | Value Object    | Параметры удаления заметки: project, iid, noteId, discussionId?                                                                                       |
| `VcsPipelineQuery`            | Value Object    | Параметры запроса пайплайна: project, iid                                                                                                             |
| `VcsPipelineStatus`           | Value Object    | Статус CI-пайплайна: status, jobs[{name, status}] (переименован из `VcsPipeline`)                                                                     |
| `VcsClientPipeline`           | Port (optional) | Абстракция управления джобами пайплайна                                                                                                               |
| `VcsGitlabPipeline`           | Adapter         | GitLab-реализация VcsClientPipeline (REST)                                                                                                            |
| `VcsJob`                      | Value Object    | Джоба пайплайна: id, name, status, stage, ref, webUrl                                                                                                 |
| `VcsApproveError`             | Value Object    | Доменная ошибка approve: code, status, message                                                                                                        |
| `VcsApproveErrorCode`         | Value Object    | Коды ошибок: ALREADY_APPROVED \| SELF_APPROVE_FORBIDDEN \| CANNOT_APPROVE                                                                             |
| `VcsFileContentQuery`         | Value Object    | Параметры получения файла: repository, path, ref                                                                                                      |
| `parseVcsUrl`                 | Function        | Pure-функция разбора VCS URL → `VcsUrl \| null`                                                                                                       |

## 3. Entity Surfaces

### `VcsUser`

- **Type:** Value Object
- **Purpose:** Идентификация пользователя VCS.
- **Public Properties:** `name: string`, `login: string`

### `VcsUrl`

- **Type:** Value Object
- **Purpose:** Результат парсинга URL merge request / pull request.
- **Public Properties:** `provider: 'gitlab' | 'github'`, `host: string`, `repository: string`, `iid: number`

### `VcsMergeRequestChanges`

- **Type:** Value Object
- **Purpose:** Список изменённых файлов в MR/PR с метаданными.
- **Public Properties:** `path: string`, `status: 'added' | 'modified' | 'deleted' | 'renamed'`, `previousPath?: string`, `ref: string`, `additions?: number`, `deletions?: number`
- **Invariant:** `ref` — Git SHA (head commit) для GitLab, branch name для GitHub. Используется как параметр `ref` в `getFileContent`. Для GitLab `source_branch` может быть недоступен в `/raw` endpoint, поэтому используется `sha` (head commit из MR).

### `VcsFileContent`

- **Type:** Value Object
- **Purpose:** Содержимое файла из репозитория.
- **Public Properties:** `path: string`, `content: string`, `encoding: 'utf-8' | 'base64'`

### `VcsClient`

- **Type:** Port
- **Purpose:** Абстрактный VCS-клиент — точка входа для merge requests, discussions, repository files.
- **Public Properties:** `MergeRequests: VcsClientMergeRequests`, `MergeDiscussions?: VcsClientMergeDiscussions`, `RepositoryFiles?: VcsClientRepositoryFiles`, `Inbox?: VcsClientInbox`, `Pipeline?: VcsClientPipeline`

### `VcsClientMergeRequests`

- **Type:** Port
- **Purpose:** Абстракция работы с Merge Requests / Pull Requests.
- **Public Operations:**
  - `getList(query) → Promise<VcsMergeRequest[]>` — список MR
  - `getByIid(query) → Promise<VcsMergeRequest | null>` — MR по IID
  - `getChanges(query) → Promise<VcsMergeRequestChanges[]>` — изменённые файлы MR/PR
  - `approve(query) → Promise<void>` — approve MR (GitLab; GitHub — deferred)
  - `unapprove(query) → Promise<void>` — отозвать approve (GitLab; GitHub — deferred; переиспользует `VcsMergeRequestApproveQuery`)
  - `getPipeline(query) → Promise<VcsPipelineStatus>` — статус CI-пайплайна

### `VcsClientMergeDiscussions`

- **Type:** Port (optional)
- **Purpose:** Абстракция работы с Discussions.
- **Public Operations:**
  - `getList(query) → Promise<VcsDiscussion[]>` — список дискуссий
  - `getAll(query) → Promise<VcsDiscussion[]>` — все дискуссии
  - `addNote(query) → Promise<void>` — добавить заметку в существующую дискуссию
  - `createDiscussion(query) → Promise<unknown>` — создать новую дискуссию (общую или line-comment)
  - `resolveDiscussion(query) → Promise<void>` — резолв/реопен дискуссии (GitLab: `PUT /discussions/:id?resolved=true\|false`)
  - `updateNote(query) → Promise<void>` — редактировать свою заметку (PUT /notes/:note_id)
  - `deleteNote(query) → Promise<void>` — удалить свою заметку (DELETE /notes/:note_id)
  - `deleteDiscussion(query) → Promise<void>` — удалить тред целиком (DELETE /discussions/:discussion_id)
  - `listDraftNotes(query) → Promise<VcsDraftNote[]>` — список черновиков
  - `createDraftNote(query) → Promise<VcsDraftNote>` — создать черновик (POST /draft_notes)
  - `updateDraftNote(query) → Promise<VcsDraftNote>` — обновить черновик (PUT /draft_notes/:id)
  - `deleteDraftNote(query) → Promise<void>` — удалить черновик (DELETE /draft_notes/:id)
  - `publishDraftNote(query) → Promise<void>` — опубликовать черновик (PUT /draft_notes/:id/publish)

### `VcsClientRepositoryFiles`

- **Type:** Port
- **Purpose:** Абстракция работы с содержимым файлов репозитория.
- **Public Operations:**
  - `getFileContent(query) → Promise<VcsFileContent | null>` — содержимое файла (null если файл не найден)

### `VcsClientInbox`

- **Type:** Port (optional)
- **Purpose:** Абстракция работы с actionable-инбоксом GitLab.
- **Public Operations:**
  - `getActionable() → Promise<VcsActionableMr[]>` — нормализованные MR, требующие реакции
  - `markTodoDone(query: { todoId: string }) → Promise<void>` — закрыть один todo (GraphQL `todoMarkDone`)

### `VcsPipelineStatus`

- **Type:** Value Object
- **Purpose:** Результат запроса статуса CI-пайплайна MR.
- **Public Properties:** `status: string`, `jobs: { id: string, name: string, status: string }[]`

### `VcsClientPipeline`

- **Type:** Port (optional)
- **Purpose:** Управление джобами CI-пайплайна GitLab.
- **Public Operations:**
  - `getJob(query) → Promise<VcsJob>` — статус джобы
  - `playJob(query) → Promise<VcsJob>` — запуск/retry джобы
  - `cancelJob(query) → Promise<VcsJob>` — отмена джобы
  - `getJobLog(query) → Promise<string>` — сырой лог (trace)

### `VcsJob`

- **Type:** Value Object
- **Purpose:** Состояние джобы CI-пайплайна.
- **Public Properties:** `id: string`, `name: string`, `status: string`, `stage: string`, `ref: string`, `webUrl: string`

### `parseVcsUrl`

- **Type:** Function
- **Purpose:** Разбор URL GitLab MR или GitHub PR в структуру `VcsUrl`.
- **Signature:** `(url: string) => VcsUrl | null`

### Value Objects

| Name                          | Key Properties                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `VcsGitlabClientOptions`      | `baseUrl: string`, `token: string`                                                                |
| `VcsAddNoteQuery`             | `project: string`, `iid: string\|number`, `discussionId: string`, `body: string`                  |
| `VcsDiscussionsListQuery`     | `project: string`, `iid: string\|number`, `perPage?: number`, `page?: number`                     |
| `VcsMergeRequestsQuery`       | `project: string`, `sourceBranch?: string`, `state?: string`, `perPage?: number`, `page?: number` |
| `VcsMergeRequestByIidQuery`   | `project: string`, `iid: string\|number`                                                          |
| `VcsMergeRequestChangesQuery` | `repository: string`, `iid: string\|number`, `page?: number`, `perPage?: number`                  |
| `VcsMergeRequestApproveQuery` | `repository: string`, `iid: string\|number`                                                       |
| `VcsResolveDiscussionQuery`   | `project: string`, `iid: string\|number`, `discussionId: string`, `resolved: boolean`             |
| `VcsUpdateNoteQuery`          | `project: string`, `iid: string\|number`, `noteId: string`, `body: string`                        |
| `VcsDeleteNoteQuery`          | `project: string`, `iid: string\|number`, `noteId: string`, `discussionId?: string`               |
| `VcsPipelineQuery`            | `project: string`, `iid: string\|number`                                                          |
| `VcsJobQuery`                 | `project: string`, `jobId: string`                                                                |
| `VcsFileContentQuery`         | `repository: string`, `path: string`, `ref: string`                                               |

## 6. File Structure

```
services/vcs-client/
├── entities/
│   ├── vcs-user.type.ts
│   ├── vcs-url.type.ts
│   ├── vcs-merge-request-changes.type.ts
│   ├── vcs-actionable-mr.type.ts
│   ├── vcs-file-content.type.ts
│   ├── vcs-merge-request-approve-query.type.ts
│   ├── vcs-resolve-discussion-query.type.ts
│   ├── vcs-update-note-query.type.ts
│   ├── vcs-delete-note-query.type.ts
│   ├── vcs-delete-discussion-query.type.ts
│   ├── vcs-draft-note.type.ts
│   ├── vcs-pipeline-status.type.ts
│   ├── vcs-job.type.ts
│   └── vcs-job-query.type.ts
├── abstract/
│   ├── vcs-client.ts                    (MergeDiscussions/Inbox/Pipeline → optional)
│   ├── vcs-client-merge-requests.ts     (+ getOne, getChanges, approve, unapprove, getPipeline)
│   ├── vcs-client-merge-discussions.ts  (+ createDiscussion, resolve, updateNote, deleteNote, deleteDiscussion, draft CRUD)
│   ├── vcs-client-inbox.ts              (GitLab-only: actionable inbox)
│   ├── vcs-client-pipeline.ts           (GitLab-only: job management)
│   └── vcs-client-repository-files.ts
├── gitlab/
│   ├── vcs-gitlab-client.ts             (+ GraphQL transport, getCurrentUser, Inbox)
│   ├── vcs-gitlab-merge-requests.ts     (+ getChanges, approve, unapprove, getPipeline)
│   ├── vcs-gitlab-merge-discussions.ts  (+ createDiscussion, resolve, draft CRUD, edit/delete notes)
│   ├── vcs-gitlab-inbox.ts              (GraphQL actionable inbox)
│   ├── vcs-gitlab-pipeline.ts           (job: status, play, cancel, trace)
│   └── vcs-gitlab-repository-files.ts
├── github/
│   ├── vcs-github-client.ts
│   ├── vcs-github-merge-requests.ts     (getChanges only; getList/getOne/getByIid — stubs)
│   └── vcs-github-repository-files.ts   (getFileContent only)
└── parse-vcs-url.ts
```

## 7. Module Decision Log

### D-001 — Authorized Escape Hatch: `@ts-expect-error` in abstract-class contract test

- **Status:** active
- **Recorded:** session refine (lint disable-discipline, cli D-007)
- **Where:** `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` — три `@ts-expect-error` (строки ~12, ~14, ~16)
- **Marker:** `@ts-expect-error`
- **Why:** Эти три отключения — **compile-time gates**, верифицирующие что abstract class нельзя инстанциировать без определения обязательных ports. Они НЕ скрывают баг; они проверяют, что `tsc --noEmit` действительно ловит попытку инстанциирования. Это type-level тест: если TypeScript перестанет генерировать ошибку (из-за изменения контракта `VcsClient` / `VcsClientMergeRequests` / `VcsClientRepositoryFiles`), `@ts-expect-error` сам станет ошибкой — тест упадёт. Без `@ts-expect-error` тест невозможен принципиально: код намеренно не компилируется, иначе он бы не проверял compile-time invariant.
- **Risk accepted:** При рефакторинге abstract-классов может потребоваться обновить этот тест. Зависит от типов из `vcs-client.ts`, `vcs-client-merge-requests.ts`, `vcs-client-repository-files.ts`.
- **Revisit:** при удалении или фундаментальном изменении контракта abstract-классов VcsClient.
- **Rejected alternatives:**
  - Перенести compile-time gate в `tsd` / `expectTypeOf` — добавляет dependency без выигрыша; node:test + `@ts-expect-error` достаточно
  - Удалить тест — потеря compile-time гарантии: ничто не помешает кому-то добавить дефолтную реализацию абстрактного порта и сломать контракт
  - Использовать `// eslint-disable @typescript-eslint/no-unused-vars` для `_VcsClientWithoutMergeRequests` — `_` префикс уже решает unused-vars; проблема не в этом

## 9. Handoff to Task Scaffolding

- **Implementation files:** 6 существуют, 9 новых, 2 изменяемых
- **Stack dependencies:** TypeScript, node:test
- **Module Rules Additions:** None
- **Open risks:**
  - GitHub Discussions — deferred (существующий `vcs-github.task.spec.md`)
  - Переименование `Discussions` → `Threads` — отдельная задача
  - `project` vs `repository` naming — требуется унификация (сейчас микс)
