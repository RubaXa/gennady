# Task: TSK-30 — vcs-client: GitHub adapters (Client + MergeRequests + RepositoryFiles)

## 1. Meta

- **Task-ID:** TSK-30
- **Status:** [x] DONE
- **Purpose:** Реализовать `VcsGithubClient`, `VcsGithubMergeRequests` (getChanges), `VcsGithubRepositoryFiles` (getFileContent). Минимальный адаптер без Discussions.
- **Scope:** vcs
- **Module:** vcs-client
- **Dependencies:** TSK-28
- **Spec References:**
  - [`VcsGithubClient`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsgithubclient)
  - [`VcsGithubMergeRequests`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsgithubmergerequests)
  - [`VcsGithubRepositoryFiles`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsgithubrepositoryfiles)
  - Constraints: [vcs spec §4](../../../specs/vcs/vcs.spec.md#4-requirements--constraints)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps   | Status |
| --- | ---- | ------ | ------ |
| P1  | impl | TSK-28 | [ ]    |
| P2  | test | P1     | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать `VcsGithubClient` (fetch с `Authorization: Bearer`), `VcsGithubMergeRequests` (getChanges), `VcsGithubRepositoryFiles` (getFileContent с base64 декодированием)
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/github/vcs-github-client.ts` (NEW)
  - `services/vcs-client/github/vcs-github-merge-requests.ts` (NEW)
  - `services/vcs-client/github/vcs-github-repository-files.ts` (NEW)
- **Inputs:** TSK-28 handoff (абстрактные порты)
- **Exit:** typecheck pass; `VcsGithubClient` extends `VcsClient` без `MergeDiscussions` (optional port); `getChanges` → `GET /repos/:owner/:repo/pulls/:number/files`; `getFileContent` → `GET /repos/:owner/:repo/contents/:path?ref=` с декодированием base64 → utf-8; `Authorization: Bearer` header

### P2 — test

- **Objective:** Unit-тесты GitHub-адаптеров с mock fetch
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts` (NEW)
  - `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts` (NEW)
  - `services/vcs-client/__tests__/github/vcs-github-client.test.ts` (NEW)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)

**Feature:** GitHub-адаптеры для PR files и Repository Contents

**Scenario:** `getChanges` возвращает список файлов PR [`unit`]

- **Given** mock GitHub API возвращает `[{ filename: 'src/foo.ts', status: 'modified', additions: 3, deletions: 1, sha: 'abc123' }]`, head ref = `feature/x`
- **When** `mergeRequests.getChanges({ repository: 'owner/repo', iid: 99 })`
- **Then** возвращает `[{ path: 'src/foo.ts', status: 'modified', ref: 'feature/x', additions: 3, deletions: 1 }]`

**Scenario:** `getChanges` для добавленного файла [`unit`]

- **Given** mock API: [`{ filename: 'src/new.ts', status: 'added' }`]
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/new.ts', status: 'added' }]`

**Scenario:** `getChanges` для удалённого файла [`unit`]

- **Given** mock API: [`{ filename: 'src/old.ts', status: 'removed' }`]
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/old.ts', status: 'deleted' }]`

**Scenario:** `getChanges` для переименованного файла [`unit`]

- **Given** mock API: [`{ filename: 'src/new.ts', previous_filename: 'src/old.ts', status: 'renamed' }`]
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/new.ts', previousPath: 'src/old.ts', status: 'renamed' }]`

**Scenario:** `getChanges` — пагинация (page/perPage) [`unit`]

- **Given** mock API с параметрами `?page=3&per_page=50`
- **When** `getChanges({ repository: 'o/r', iid: 1, page: 3, perPage: 50 })`
- **Then** URL содержит `page=3` и `per_page=50`

**Scenario:** `getFileContent` декодирует base64 в utf-8 [`unit`]

- **Given** mock GitHub API возвращает `{ content: 'aW1wb3J0IGZyb20=', encoding: 'base64', path: 'src/foo.ts' }`
- **When** `repositoryFiles.getFileContent({ repository: 'owner/repo', path: 'src/foo.ts', ref: 'main' })`
- **Then** возвращает `{ path: 'src/foo.ts', content: 'import from', encoding: 'utf-8' }`

**Scenario:** `getFileContent` для несуществующего файла → null [`unit`]

- **Given** mock API возвращает 404
- **When** `getFileContent(...)`
- **Then** возвращает `null`

**Scenario:** `getFileContent` — бинарный файл (encoding не base64) [`unit`]

- **Given** mock API: `{ content: '<binary>', encoding: 'none', path: 'img.png' }`
- **When** `getFileContent(...)`
- **Then** возвращает `{ path: 'img.png', content: '<binary>', encoding: 'base64' }`

**Scenario:** `getFileContent` — ошибка сети пробрасывается [`unit`]

- **Given** mock API возвращает 500
- **When** `getFileContent(...)`
- **Then** пробрасывает Error

**Scenario:** `VcsGithubClient` не реализует `MergeDiscussions` [`unit`]

- **Given** `VcsGithubClient` без `MergeDiscussions`
- **When** доступ к `client.MergeDiscussions`
- **Then** `undefined` (порт опциональный)

**Scenario:** `VcsGithubClient` использует `Authorization: Bearer` [`unit`]

- **Given** `VcsGithubClient` создан с `token: 'ghp_xxx'`
- **When** любой API-запрос
- **Then** заголовок содержит `Authorization: Bearer ghp_xxx` (НЕ `PRIVATE-TOKEN`)

## 5. Verification

| Command                                             | Required by      |
| --------------------------------------------------- | ---------------- |
| `npx tsc --noEmit`                                  | typescript-rules |
| `node --test services/vcs-client/__tests__/github/` | node-test        |
| `npx prettier --check services/vcs-client/github/`  | prettier (infra) |

- **Completion additions:** file headers `// @tasks: TSK-30` на новые файлы

## 6. Test Scenario Coverage

- Scenario getChanges возвращает список файлов PR → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts` :: `getChanges returns modified PR files`
- Scenario getChanges для добавленного файла → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts` :: `getChanges returns added file`
- Scenario getChanges для удалённого файла → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts` :: `getChanges returns deleted file`
- Scenario getChanges для переименованного файла → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts` :: `getChanges returns renamed file`
- Scenario getChanges пагинация → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts` :: `getChanges passes pagination params`
- Scenario getFileContent декодирует base64 → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts` :: `getFileContent decodes base64 to utf-8`
- Scenario getFileContent для несуществующего файла → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts` :: `getFileContent returns null for 404`
- Scenario getFileContent бинарный файл → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts` :: `getFileContent handles binary file`
- Scenario getFileContent ошибка сети → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts` :: `getFileContent throws on 500`
- Scenario VcsGithubClient без MergeDiscussions → `services/vcs-client/__tests__/github/vcs-github-client.test.ts` :: `VcsGithubClient has undefined MergeDiscussions`
- Scenario VcsGithubClient Authorization header → `services/vcs-client/__tests__/github/vcs-github-client.test.ts` :: `VcsGithubClient uses Bearer auth`

## 7. Execution Log

_(Протокол в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules typescript-rules
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/github/vcs-github-client.ts
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/github/vcs-github-merge-requests.ts
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/github/vcs-github-repository-files.ts
- [x] `2026-05-18T03:00:00ZZ` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/github/vcs-github-client.ts`, `services/vcs-client/github/vcs-github-merge-requests.ts`, `services/vcs-client/github/vcs-github-repository-files.ts`]; decisions: [github auth: Bearer, encoding: adapter decodes base64]; open: [MergeDiscussions not implemented]

#### P2

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules node-test, typescript-rules
- [x] `2026-05-18T03:00:00ZZ` test services/vcs-client/**tests**/github/vcs-github-merge-requests.test.ts
- [x] `2026-05-18T03:00:00ZZ` test services/vcs-client/**tests**/github/vcs-github-repository-files.test.ts
- [x] `2026-05-18T03:00:00ZZ` test services/vcs-client/**tests**/github/vcs-github-client.test.ts
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns modified PR files` → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts::getChanges returns modified PR files`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns added file` → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts::getChanges returns added file`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns deleted file` → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts::getChanges returns deleted file`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns renamed file` → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts::getChanges returns renamed file`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges passes pagination params` → `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts::getChanges passes pagination params`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent decodes base64 to utf-8` → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts::getFileContent decodes base64 to utf-8`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent returns null for 404` → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts::getFileContent returns null for 404`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent handles binary file` → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts::getFileContent handles binary file`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent throws on 500` → `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts::getFileContent throws on 500`
- [x] `2026-05-18T03:00:00ZZ` cov `VcsGithubClient has undefined MergeDiscussions` → `services/vcs-client/__tests__/github/vcs-github-client.test.ts::VcsGithubClient has undefined MergeDiscussions`
- [x] `2026-05-18T03:00:00ZZ` cov `VcsGithubClient uses Bearer auth` → `services/vcs-client/__tests__/github/vcs-github-client.test.ts::VcsGithubClient uses Bearer auth`
- [x] `2026-05-18T03:00:00ZZ` ver node --test services/vcs-client/**tests**/github/ → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts`, `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts`, `services/vcs-client/__tests__/github/vcs-github-client.test.ts`]; decisions: []; open: []

#### Round close

- [x] `2026-05-18T03:00:00ZZ` sync vcs+root
- [x] `2026-05-18T03:00:00ZZ` DONE
