# Module: vcs-client

## 1. Module Vision

VCS-клиент для GitLab: абстрактные порты + GitLab-адаптеры. Используется CLI-командами gennady для review-пайплайна.

→ Parent scope: [../../vcs.spec.md](../../vcs.spec.md)

## 2. Entity Inventory (Closed-World)

| Name | Type | Purpose |
|---|---|---|
| `VcsUser` | Value Object | Пользователь VCS: name, login |
| `VcsClient` | Port | Абстрактный VCS-клиент |
| `VcsClientMergeRequests` | Port | Абстракция работы с Merge Requests |
| `VcsClientMergeDiscussions` | Port | Абстракция работы с Discussions |
| `VcsGitlabClient` | Adapter | GitLab-реализация VcsClient |
| `VcsGitlabClientOptions` | Value Object | Опции подключения: baseUrl, token |
| `VcsGitlabMergeRequests` | Adapter | GitLab-реализация MR API |
| `VcsGitlabMergeDiscussions` | Adapter | GitLab-реализация Discussions API |
| `VcsAddNoteQuery` | Value Object | Параметры создания заметки |
| `VcsDiscussionsListQuery` | Value Object | Параметры запроса списка дискуссий |
| `VcsMergeRequestsQuery` | Value Object | Параметры поиска MR |
| `VcsMergeRequestByIidQuery` | Value Object | Параметры получения MR по IID |

## 3. Entity Surfaces

### `VcsUser`
- **Type:** Value Object
- **Purpose:** Идентификация пользователя VCS.
- **Public Properties:** `name: string`, `login: string`

### `VcsClient`
- **Type:** Port
- **Purpose:** Абстрактный VCS-клиент — точка входа для merge requests и discussions.
- **Public Properties:** `mergeRequests: VcsClientMergeRequests`, `mergeDiscussions: VcsClientMergeDiscussions`

### `VcsClientMergeRequests`
- **Type:** Port
- **Purpose:** Абстракция работы с Merge Requests.
- **Public Operations:**
  - `list(query) → Promise<VcsMergeRequest[]>` — список MR
  - `getByIid(query) → Promise<VcsMergeRequest | null>` — MR по IID

### `VcsClientMergeDiscussions`
- **Type:** Port
- **Purpose:** Абстракция работы с Discussions.
- **Public Operations:**
  - `list(query) → Promise<VcsDiscussion[]>` — список дискуссий
  - `addNote(query) → Promise<void>` — добавить заметку

### Value Objects

| Name | Key Properties |
|---|---|
| `VcsGitlabClientOptions` | `baseUrl: string`, `token: string` |
| `VcsAddNoteQuery` | `project: string`, `iid: string\|number`, `discussionId: string`, `body: string` |
| `VcsDiscussionsListQuery` | `project: string`, `iid: string\|number`, `perPage?: number`, `page?: number` |
| `VcsMergeRequestsQuery` | `project: string`, `sourceBranch: string`, `state: string`, `perPage?: number`, `page?: number` |
| `VcsMergeRequestByIidQuery` | `project: string`, `iid: string\|number` |

## 6. File Structure

```
services/vcs-client/
├── entities/
│   └── vcs-user.type.ts
├── abstract/
│   ├── vcs-client.ts
│   ├── vcs-client-merge-discussions.ts
│   └── vcs-client-merge-requests.ts
└── gitlab/
    ├── vcs-gitlab-client.ts
    ├── vcs-gitlab-merge-discussions.ts
    └── vcs-gitlab-merge-requests.ts
```

## 9. Handoff to Task Scaffolding

- **Implementation files:** все существуют, требуется JSDoc-покрытие
- **Stack dependencies:** TypeScript, node:test
- **Module Rules Additions:** None
- **Open risks:** Код без DBC-контрактов — 51 ошибка линтера
