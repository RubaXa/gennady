# Task: TSK-27 — vcs-client: Entities + URL parser

## 1. Meta

- **Task-ID:** TSK-27
- **Status:** [x] DONE
- **Purpose:** Создать типы `VcsUrl`, `VcsMergeRequestChanges`, `VcsFileContent`, query-типы и pure-функцию `parseVcsUrl`.
- **Scope:** vcs
- **Module:** vcs-client
- **Dependencies:** None
- **Spec References:**
  - [`VcsUrl`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsurl)
  - [`VcsMergeRequestChanges`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsmergerequestchanges)
  - [`VcsFileContent`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsfilecontent)
  - [`parseVcsUrl`](../../../specs/vcs/vcs-client/vcs-client.spec.md#parsevcsurl)
  - Constraints: [vcs spec §4](../../../specs/vcs/vcs.spec.md#4-requirements--constraints)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать entity-типы + query-типы + `parseVcsUrl` pure-функцию
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/entities/vcs-url.type.ts`
  - `services/vcs-client/entities/vcs-merge-request-changes.type.ts`
  - `services/vcs-client/entities/vcs-file-content.type.ts`
  - `services/vcs-client/parse-vcs-url.ts`
- **Inputs:** none
- **Exit:** typecheck pass; file headers `@file:` + `@consumers:`; JSDoc на все экспорты

### P2 — test

- **Objective:** Unit-тесты на `parseVcsUrl` и типы
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/__tests__/parse-vcs-url.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass; 0 ошибок линтера

## 4. Acceptance Criteria (BDD)

**Feature:** Разбор GitLab/GitHub URL в структуру `VcsUrl`

**Scenario:** GitLab MR URL — стандартный [`unit`]

- **Given** URL `https://gitlab.com/group/project/-/merge_requests/42`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'gitlab', host: 'gitlab.com', repository: 'group/project', iid: 42 }`

**Scenario:** GitLab MR URL — self-hosted [`unit`]

- **Given** URL `https://gitlab.company.com/team/repo/-/merge_requests/7`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'gitlab', host: 'gitlab.company.com', repository: 'team/repo', iid: 7 }`

**Scenario:** GitLab MR URL — nested subgroups [`unit`]

- **Given** URL `https://gitlab.com/a/b/c/d/-/merge_requests/99`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'gitlab', host: 'gitlab.com', repository: 'a/b/c/d', iid: 99 }`

**Scenario:** GitHub PR URL — стандартный [`unit`]

- **Given** URL `https://github.com/owner/repo/pull/123`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'github', host: 'github.com', repository: 'owner/repo', iid: 123 }`

**Scenario:** GitHub PR URL — self-hosted GHE [`unit`]

- **Given** URL `https://github.internal.com/org/repo/pull/5`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'github', host: 'github.internal.com', repository: 'org/repo', iid: 5 }`

**Scenario:** Невалидный URL — не MR/PR [`unit`]

- **Given** URL `https://gitlab.com/group/project/issues/42`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** Невалидный URL — вообще не VCS [`unit`]

- **Given** URL `https://example.com/page`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** Пустой URL [`unit`]

- **Given** пустая строка `""`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** GitLab URL без IID [`unit`]

- **Given** URL `https://gitlab.com/group/project/-/merge_requests/`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** GitHub URL без номера PR [`unit`]

- **Given** URL `https://github.com/owner/repo/pull/`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** URL с query-параметрами [`unit`]

- **Given** URL `https://gitlab.com/group/project/-/merge_requests/42?view=diff`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'gitlab', host: 'gitlab.com', repository: 'group/project', iid: 42 }`

**Scenario:** URL с trailing slash [`unit`]

- **Given** URL `https://github.com/owner/repo/pull/123/`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'github', host: 'github.com', repository: 'owner/repo', iid: 123 }`

**Scenario:** URL с портом [`unit`]

- **Given** URL `https://gitlab.example.com:8443/team/repo/-/merge_requests/7`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `{ provider: 'gitlab', host: 'gitlab.example.com:8443', repository: 'team/repo', iid: 7 }`

**Scenario:** null-вход [`unit`]

- **Given** `null`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** Нечисловой IID [`unit`]

- **Given** URL `https://github.com/owner/repo/pull/abc`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`

**Scenario:** SSH URL — не поддерживается [`unit`]

- **Given** URL `git@gitlab.com:group/project.git`
- **When** `parseVcsUrl(url)`
- **Then** возвращает `null`
  | Command | Required by |
  |---------|-------------|
  | `npx tsc --noEmit` | typescript-rules |
  | `node --test services/vcs-client/__tests__/parse-vcs-url.test.ts` | node-test |
  | `npx prettier --check services/vcs-client/entities/vcs-url.type.ts services/vcs-client/entities/vcs-merge-request-changes.type.ts services/vcs-client/entities/vcs-file-content.type.ts services/vcs-client/parse-vcs-url.ts` | prettier (infra) |

- **Completion additions:** file headers `// @tasks: TSK-27` на новые файлы

## 6. Test Scenario Coverage

- Scenario GitLab MR URL — стандартный → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses standard GitLab MR URL`
- Scenario GitLab MR URL — self-hosted → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses self-hosted GitLab MR URL`
- Scenario GitLab MR URL — nested subgroups → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses nested subgroup GitLab MR URL`
- Scenario GitHub PR URL — стандартный → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses standard GitHub PR URL`
- Scenario GitHub PR URL — self-hosted GHE → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses self-hosted GitHub PR URL`
- Scenario Невалидный URL — не MR/PR → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for non-MR GitLab URL`
- Scenario Невалидный URL — вообще не VCS → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for non-VCS URL`
- Scenario Пустой URL → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for empty string`
- Scenario GitLab URL без IID → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for GitLab URL without IID`
- Scenario GitHub URL без номера PR → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for GitHub URL without PR number`
- Scenario URL с query-параметрами → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses URL with query params`
- Scenario URL с trailing slash → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses URL with trailing slash`
- Scenario URL с портом → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `parses URL with port`
- Scenario null-вход → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for null input`
- Scenario Нечисловой IID → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for non-numeric IID`
- Scenario SSH URL — не поддерживается → `services/vcs-client/__tests__/parse-vcs-url.test.ts` :: `returns null for SSH URL`

## 7. Execution Log

_(Протокол в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules 
- [x] `2026-05-18T03:00:00ZZ` file 
- [x] `2026-05-18T03:00:00ZZ` file 
- [x] `2026-05-18T03:00:00ZZ` file 
- [x] `2026-05-18T03:00:00ZZ` file 
- [x] `2026-05-18T03:00:00ZZ` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/entities/vcs-url.type.ts`, `services/vcs-client/entities/vcs-merge-request-changes.type.ts`, `services/vcs-client/entities/vcs-file-content.type.ts`, `services/vcs-client/parse-vcs-url.ts`]; decisions: []; open: []

#### P2

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules 
- [x] `2026-05-18T03:00:00ZZ` test 
- [x] `2026-05-18T03:00:00ZZ` cov `parses standard GitLab MR URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::parses standard GitLab MR URL`
- [x] `2026-05-18T03:00:00ZZ` cov `parses self-hosted GitLab MR URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::parses self-hosted GitLab MR URL`
- [x] `2026-05-18T03:00:00ZZ` cov `parses nested subgroup GitLab MR URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::parses nested subgroup GitLab MR URL`
- [x] `2026-05-18T03:00:00ZZ` cov `parses standard GitHub PR URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::parses standard GitHub PR URL`
- [x] `2026-05-18T03:00:00ZZ` cov `parses self-hosted GitHub PR URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::parses self-hosted GitHub PR URL`
- [x] `2026-05-18T03:00:00ZZ` cov `returns null for non-MR GitLab URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::returns null for non-MR GitLab URL`
- [x] `2026-05-18T03:00:00ZZ` cov `returns null for non-VCS URL` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::returns null for non-VCS URL`
- [x] `2026-05-18T03:00:00ZZ` cov `returns null for empty string` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::returns null for empty string`
- [x] `2026-05-18T03:00:00ZZ` cov `returns null for GitLab URL without IID` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::returns null for GitLab URL without IID`
- [x] `2026-05-18T03:00:00ZZ` cov `returns null for GitHub URL without PR number` → `services/vcs-client/__tests__/parse-vcs-url.test.ts::returns null for GitHub URL without PR number`
- [x] `2026-05-18T03:00:00ZZ` ver node --test services/vcs-client/**tests**/parse-vcs-url.test.ts → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/__tests__/parse-vcs-url.test.ts`]; decisions: []; open: []

#### Round close

- [x] `2026-05-18T03:00:00ZZ` sync vcs+root
- [x] `2026-05-18T03:00:00ZZ` DONE
