# Task: TSK-29 — vcs-client: GitLab adapters (RepositoryFiles + getChanges)

## 1. Meta

- **Task-ID:** TSK-29
- **Status:** [x] DONE
- **Purpose:** Реализовать `VcsGitlabRepositoryFiles` (getFileContent) и добавить `getChanges` в `VcsGitlabMergeRequests`.
- **Scope:** vcs
- **Module:** vcs-client
- **Dependencies:** TSK-28
- **Spec References:**
  - [`VcsGitlabRepositoryFiles`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsgitlabrepositoryfiles)
  - [`VcsGitlabMergeRequests.getChanges`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsgitlabmergerequests)
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

- **Objective:** Создать `VcsGitlabRepositoryFiles`, добавить `getChanges` в `VcsGitlabMergeRequests`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/gitlab/vcs-gitlab-repository-files.ts` (NEW)
  - `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts` (MODIFY: +getChanges impl)
  - `services/vcs-client/gitlab/vcs-gitlab-client.ts` (MODIFY: +RepositoryFiles property)
- **Inputs:** TSK-28 handoff (абстрактные порты)
- **Exit:** typecheck pass; GitLab-адаптеры реализуют все абстрактные методы; `getChanges` вызывает `GET /projects/:id/merge_requests/:iid/changes`; `getFileContent` вызывает `GET /projects/:id/repository/files/:path/raw?ref=`; контракт кодировки: адаптер возвращает декодированный `string`

### P2 — test

- **Objective:** Unit-тесты GitLab-адаптеров с mock fetch
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts` (NEW)
  - `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` (NEW)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)

**Feature:** GitLab-адаптеры для RepositoryFiles и MR Changes

**Scenario:** `getChanges` возвращает список изменённых файлов [`unit`]

- **Given** mock GitLab API возвращает `{ changes: [{ old_path: 'src/foo.ts', new_path: 'src/foo.ts', new_file: false, renamed_file: false, deleted_file: false }], source_branch: 'feature/x' }`
- **When** `mergeRequests.getChanges({ repository: 'group/proj', iid: 1 })`
- **Then** возвращает `[{ path: 'src/foo.ts', status: 'modified', ref: 'feature/x' }]`

**Scenario:** `getChanges` — пустой список изменений [`unit`]

- **Given** mock API: `{ changes: [], source_branch: 'empty/mr' }`
- **When** `getChanges(...)`
- **Then** возвращает `[]`

**Scenario:** `getChanges` — маппинг additions/deletions [`unit`]

- **Given** mock API: `{ changes: [{ old_path: 'src/bar.ts', new_path: 'src/bar.ts', new_file: false, renamed_file: false, deleted_file: false, additions: 10, deletions: 3 }], source_branch: 'feat' }`
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/bar.ts', status: 'modified', ref: 'feat', additions: 10, deletions: 3 }]`

**Scenario:** `getChanges` — лишние поля API не ломают адаптер [`unit`]

- **Given** mock API возвращает поля `diff`, `a_mode`, `b_mode`
- **When** `getChanges(...)`
- **Then** адаптер игнорирует лишние поля, возвращает корректный `VcsMergeRequestChanges[]`

**Scenario:** `getChanges` для нового файла [`unit`]

- **Given** mock API: `{ changes: [{ new_path: 'src/new.ts', new_file: true, deleted_file: false, renamed_file: false }], source_branch: 'feat/y' }`
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/new.ts', status: 'added', ref: 'feat/y' }]`

**Scenario:** `getChanges` для удалённого файла [`unit`]

- **Given** mock API: `{ changes: [{ old_path: 'src/old.ts', new_file: false, deleted_file: true, renamed_file: false }], source_branch: 'feat/z' }`
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/old.ts', status: 'deleted', ref: 'feat/z' }]`

**Scenario:** `getChanges` для переименованного файла [`unit`]

- **Given** mock API: `{ changes: [{ old_path: 'src/old.ts', new_path: 'src/new.ts', new_file: false, deleted_file: false, renamed_file: true }], source_branch: 'fix/w' }`
- **When** `getChanges(...)`
- **Then** возвращает `[{ path: 'src/new.ts', previousPath: 'src/old.ts', status: 'renamed', ref: 'fix/w' }]`

**Scenario:** `getChanges` — пагинация [`unit`]

- **Given** mock API с параметрами `?page=2&per_page=50`
- **When** `getChanges({ repository: 'g/p', iid: 1, page: 2, perPage: 50 })`
- **Then** URL содержит `page=2` и `per_page=50`

**Scenario:** `getFileContent` возвращает содержимое файла [`unit`]

- **Given** mock GitLab API `/repository/files/src/foo.ts/raw?ref=main` возвращает `import ...`
- **When** `repositoryFiles.getFileContent({ repository: 'group/proj', path: 'src/foo.ts', ref: 'main' })`
- **Then** возвращает `{ path: 'src/foo.ts', content: 'import ...', encoding: 'utf-8' }`

**Scenario:** `getFileContent` для несуществующего файла → null [`unit`]

- **Given** mock API возвращает 404
- **When** `repositoryFiles.getFileContent({ repository: 'g/p', path: 'nonexistent.ts', ref: 'main' })`
- **Then** возвращает `null`

**Scenario:** `getFileContent` для бинарного файла — base64 [`unit`]

- **Given** mock API `/repository/files/icon.png/raw` возвращает бинарные данные
- **When** `repositoryFiles.getFileContent({ repository: 'g/p', path: 'icon.png', ref: 'main' })`
- **Then** возвращает `{ path: 'icon.png', content: '<base64>', encoding: 'base64' }`

**Scenario:** `getFileContent` — ошибка сети пробрасывается [`unit`]

- **Given** mock API возвращает 500
- **When** `getFileContent(...)`
- **Then** пробрасывает Error со статусом

**Scenario:** `getFileContent` — 401 ошибка аутентификации [`unit`]

- **Given** mock API возвращает 401
- **When** `getFileContent(...)`
- **Then** пробрасывает Error (не null)

**Scenario:** `getChanges` — 403 ошибка доступа [`unit`]

- **Given** mock API возвращает 403
- **When** `getChanges(...)`
- **Then** пробрасывает Error (не null)

**Scenario:** `getChanges` — ошибка сети пробрасывается [`unit`]

- **Given** mock API возвращает 500
- **When** `getChanges(...)`
- **Then** пробрасывает Error со статусом

## 5. Verification

| Command                                             | Required by      |
| --------------------------------------------------- | ---------------- |
| `npx tsc --noEmit`                                  | typescript-rules |
| `node --test services/vcs-client/__tests__/gitlab/` | node-test        |
| `npx prettier --check services/vcs-client/gitlab/`  | prettier (infra) |

- **Completion additions:** file headers `// @tasks: TSK-29` на новые файлы; обновить `@tasks` в изменяемых файлах

## 6. Test Scenario Coverage

- Scenario getChanges возвращает список изменённых файлов → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` :: `getChanges returns modified files list`
- Scenario getChanges для нового файла → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` :: `getChanges returns added file`
- Scenario getChanges для удалённого файла → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` :: `getChanges returns deleted file`
- Scenario getChanges для переименованного файла → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` :: `getChanges returns renamed file`
- Scenario getChanges пагинация → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` :: `getChanges passes pagination params`
- Scenario getFileContent возвращает содержимое файла → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts` :: `getFileContent returns file content`
- Scenario getFileContent для несуществующего файла → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts` :: `getFileContent returns null for 404`
- Scenario getFileContent для бинарного файла → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts` :: `getFileContent returns base64 for binary`
- Scenario getFileContent ошибка сети → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts` :: `getFileContent throws on 500`
- Scenario getChanges ошибка сети → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts` :: `getChanges throws on 500`

## 7. Execution Log

_(Протокол в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules typescript-rules
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/gitlab/vcs-gitlab-repository-files.ts
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/gitlab/vcs-gitlab-client.ts
- [x] `2026-05-18T03:00:00ZZ` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/gitlab/vcs-gitlab-repository-files.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`, `services/vcs-client/gitlab/vcs-gitlab-client.ts`]; decisions: [`getFileContent` raw endpoint, encoding contract: adapter decodes]; open: []

#### P2

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules node-test, typescript-rules
- [x] `2026-05-18T03:00:00ZZ` test services/vcs-client/**tests**/gitlab/vcs-gitlab-repository-files.test.ts
- [x] `2026-05-18T03:00:00ZZ` test services/vcs-client/**tests**/gitlab/vcs-gitlab-merge-requests.test.ts
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns modified files list` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts::getChanges returns modified files list`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns added file` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts::getChanges returns added file`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns deleted file` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts::getChanges returns deleted file`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns renamed file` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts::getChanges returns renamed file`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges passes pagination params` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts::getChanges passes pagination params`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent returns file content` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts::getFileContent returns file content`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent returns null for 404` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts::getFileContent returns null for 404`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent returns base64 for binary` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts::getFileContent returns base64 for binary`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent throws on 500` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts::getFileContent throws on 500`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges throws on 500` → `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts::getChanges throws on 500`
- [x] `2026-05-18T03:00:00ZZ` ver node --test services/vcs-client/**tests**/gitlab/ → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts`, `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts`]; decisions: []; open: []

#### Round close

- [x] `2026-05-18T03:00:00ZZ` sync vcs+root
- [x] `2026-05-18T03:00:00ZZ` DONE
