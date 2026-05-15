# vcs: Scope Specification

## scope-type

product

## 1. Vision & Primary Goal

VCS-клиент для GitLab: работа с Merge Requests, discussions, пользователями. Абстрактный слой (Ports) + GitLab-реализация (Adapters). Используется CLI-командами gennady для review-пайплайна.

## 2. Project Type

- **Type:** service-module-sdk
- **Why this type:** Библиотека-адаптер для внешнего API (GitLab). Предоставляет интерфейсы и реализации. Потребитель — CLI-команды gennady.

## 3. Approved Golden DX Example

```ts
const client = new VcsGitlabClient({ baseUrl: 'https://gitlab.com', token: 'glpat-xxx' });
const mrs = await client.mergeRequests.list({ project: 'group/repo', sourceBranch: 'feature/x' });
const discussions = await client.mergeDiscussions.list({ project: 'group/repo', iid: mr.iid });
await client.mergeDiscussions.addNote({ project: 'group/repo', iid: mr.iid, discussionId: disc.id, body: 'LGTM' });
```

## 4. Requirements & Constraints

### 4.1 Functional Requirements

| ID | Требование |
|---|---|
| FR-01 | `VcsClient` — абстрактный порт: методы для MR и discussions |
| FR-02 | `VcsClientMergeRequests` — порт: list, getByIid |
| FR-03 | `VcsClientMergeDiscussions` — порт: list, addNote |
| FR-04 | `VcsGitlabClient` — adapter: GitLab REST API через fetch |
| FR-05 | `VcsGitlabMergeRequests` — adapter: GitLab MR API |
| FR-06 | `VcsGitlabMergeDiscussions` — adapter: GitLab Discussions API |
| FR-07 | Все типы запросов (VcsAddNoteQuery, VcsDiscussionsListQuery, etc.) покрыты JSDoc-контрактами |

### 4.2 Non-Functional Constraints

- **NFC-01**: Zero runtime dependencies (fetch — built-in Node.js 22+)
- **NFC-02**: Все экспортируемые сущности покрыты DBC-контрактами
- **NFC-03**: File headers: `// @file:`, `// @consumers:`

### 4.3 Out-of-Scope

- GitHub/Bitbucket адаптеры (v2)
- OAuth flow (используется PAT token)
- Pagination helpers

### 4.4 Runtime Backing

| Capability | Posture |
|---|---|
| GitLab REST API | `real-runtime` |
| HTTP (fetch) | `real-runtime` |

### 4.5 Rules

| Rule | Category | Source |
|---|---|---|
| `typescript-rules` | coding | `ai/directives/coding/typescript-rules.xml` |

## 5. High-Level Architecture

Ports & Adapters: `abstract/` — интерфейсы, `gitlab/` — реализация, `entities/` — общие типы.

### 5.1 Rejected Alternatives

N/A — существующая архитектура, не рефакторим.

## 6. Decision Log

### D-001 — scope-type = product (service-module-sdk)

- **Status:** active
- **Recorded:** session Discovery, vcs
- **Why:** VCS-клиент — библиотека с абстракциями и реализациями. Потребитель — CLI gennady. Не infrastructure, не contracts.
- **Risk accepted:** —
- **Rejected alternatives:** library (нет публичного API для внешних потребителей), contracts (не только интерфейсы)

## 7. Scope Dependencies

- **Depends on:** [`infra-base`](../infra-base/infra-base.spec.md) — TypeScript, node:test
- **Provides to:** CLI-команды gennady (review-verify, review-issues, vcs-reply)

## 8. Bootstrap Requirements

| Requirement | Kind | Owner | Resolution |
|---|---|---|---|
| Существующий код в `services/vcs-client/` | structural | this-scope-task | ✅ уже существует |

## 9. Module Map

### 9.1 Modules

- [vcs-client](./vcs-client/vcs-client.spec.md) — VCS-клиент: Ports, Adapters, Value Objects для GitLab API

### 9.4 Handoff to Task Scaffolding

- **Primary input:** `specs/vcs/vcs.spec.md`
- **Areas requiring decomposition:** None (один модуль)
- **Named abstractions:** `VcsClient`, `VcsClientMergeRequests`, `VcsClientMergeDiscussions`, `VcsGitlabClient`, `VcsGitlabMergeRequests`, `VcsGitlabMergeDiscussions`
- **Open risks:** Код существует, но без JSDoc-контрактов — требуется отдельная задача на покрытие
