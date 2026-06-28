# vcs-github-cli: Scope Specification

## scope-type

product

## 1. Vision & Primary Goal

Расширение CLI-команд для работы с GitHub-репозиториями через авто-детект (без явного `--host`/`--project`). Сейчас все VCS-команды работают только с GitLab из-за ограничения `vcs-context-resolver` (FR-CTX-17). Цель: полная симметрия GitLab ↔ GitHub для всех CLI-команд.

→ Parent scope: [../../cli/cli.spec.md](../../cli/cli.spec.md), [../vcs.spec.md](../vcs.spec.md)

## 2. Entity Inventory (Closed-World)

| Name | Type | Purpose |
| --- | --- | --- |
| `resolveVcsContext` (extended) | Function | Убрать `/gitlab/i` check; добавить `provider: 'github'` авто-детект |
| `VcsGithubClient` (extended) | Adapter | Добавить конструктор для CLI (host + token → baseUrl) |
| `VcsCliContext.provider` | Value Object | Добавить `'github'` как валидное значение |

### Существующие сущности (reused)

| Name | Source | Как используется |
| --- | --- | --- |
| `VcsGithubMergeRequests` | `services/vcs-client/github/vcs-github-merge-requests.ts` | Уже реализован (create, update, getList, getByIid) — TSK-90 |
| `VcsGithubClient` | `services/vcs-client/github/vcs-github-client.ts` | Требует доработки: передача token → GitHub REST API |
| `VcsClientMergeDiscussions` | Deferred (stub) | GitHub Discussions не реализованы; vcs-discussions для GitHub — deferred |

## 3. Requirements & Constraints

### 3.1 Functional Requirements

| ID | Требование |
| --- | --- |
| **Resolver** | |
| FR-GH-01 | Убрать проверку `/gitlab/i` в `resolveVcsContext`. Хост определяется из origin remote или явного `--host`. Provider: `host.includes('github')` → `'github'`, иначе → `'gitlab'` |
| FR-GH-02 | `VcsCliContext.provider` — расширить тип с `'gitlab'` на `'gitlab' \| 'github'` |
| FR-GH-03 | GitHub-хосты принимаются без ошибки. Проверка токена: `GITHUB_PERSONAL_TOKEN` или `GITHUB_TOKEN` (помимо `GITLAB_PERSONAL_TOKEN`) |
| **GitHub Client** | |
| FR-GH-04 | `VcsGithubClient` конструктор принимает `{ baseUrl, token }`. `baseUrl` формируется как `https://api.github.com` (или enterprise: `https://<host>/api/v3`) |
| FR-GH-05 | CLI-команды создают `VcsGithubClient` когда `context.provider === 'github'` |
| **CLI команды** | |
| FR-GH-06 | `vcs-mr-create` — работает на GitHub-репо: создаёт PR через `VcsGithubMergeRequests.create` |
| FR-GH-07 | `vcs-mr-edit` — работает на GitHub-репо: редактирует PR через `VcsGithubMergeRequests.update` |
| FR-GH-08 | `vcs-diff` — работает на GitHub: использует `VcsGithubMergeRequests.getChanges` |
| FR-GH-09 | `vcs-pipeline` — GitHub: deferred (stub `getPipeline` возвращает "not implemented") |
| FR-GH-10 | `vcs-discussions` — GitHub: deferred (stub-заглушка с сообщением "GitHub discussions not implemented") |
| FR-GH-11 | `vcs-approve` — GitHub: deferred (stub) |
| FR-GH-12 | Авто-детект: все команды на GitHub-репо работают без явных `--host`/`--project` (используют origin remote) |

### 3.2 Out-of-Scope

- GitHub Discussions API (deferred)
- GitHub Pipeline/CI через CLI (deferred)
- GitHub Approve (deferred)
- GitHub self-hosted Enterprise (v2)

## 4. Architecture

```
cli/cmd/_shared/vcs-context-resolver.ts (MODIFY: remove /gitlab/i, add GitHub provider)
services/vcs-client/github/vcs-github-client.ts (MODIFY: ensure baseUrl from host)
cli/cmd/vcs-mr-create/vcs-mr-create.cmd.ts (MODIFY: GitHub client support)
cli/cmd/vcs-mr-edit/vcs-mr-edit.cmd.ts (MODIFY: GitHub client support)
cli/cmd/vcs-discussions/vcs-discussions.cmd.ts (MODIFY: GitHub stub)
cli/cmd/vcs-diff/ (REUSE — already uses VcsClient)
cli/cmd/vcs-pipeline/ (REUSE — already uses VcsClient)
```

## 5. Parent Spec Amendments

| Parent Spec | What Changes |
| --- | --- |
| `cli.spec.md` FR-CTX-17 | Убрать `/gitlab/i` restriction. Provider: `host.includes('github')` → github, иначе gitlab |
| `vcs.spec.md` FR-02 | Добавить `create`, `update` в список методов порта |
| `vcs.spec.md` FR-11 | Расширить GitHub adapter: + `getList`, `getByIid`, `create`, `update` |

## 6. Decision Log

### D-001 — GitHub Discussions: stub, не deferred

- **Status:** active
- **Why:** vcs-discussions должна показывать осмысленное сообщение "GitHub discussions not implemented" вместо падения. Stub-заглушка возвращает понятную ошибку.
- **Rejected alternatives:** Падать с TypeError — плохой UX.

### D-002 — Provider detection: host-based, не remote-based

- **Status:** active
- **Why:** Провайдер определяется по hostname (содержит 'github' → GitHub, иначе GitLab). Не по URL формату remote (SSH vs HTTPS могут отличаться). Просто и надёжно.
- **Rejected alternatives:** Парсить remote URL формат — сложнее, больше edge cases.
