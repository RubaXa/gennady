# Task: TSK-28 — vcs-client: Abstract ports (RepositoryFiles + optional MergeDiscussions + getChanges)

## 1. Meta

- **Task-ID:** TSK-28
- **Status:** [x] DONE
- **Purpose:** Добавить `VcsClientRepositoryFiles` порт, сделать `MergeDiscussions` опциональным на `VcsClient`, добавить контракт `getChanges` в `VcsClientMergeRequests`.
- **Scope:** vcs
- **Module:** vcs-client
- **Dependencies:** TSK-27
- **Spec References:**
  - [`VcsClientRepositoryFiles`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsclientrepositoryfiles)
  - [`VcsClient` (optional MergeDiscussions)](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsclient)
  - [`VcsClientMergeRequests.getChanges`](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsclientmergerequests)
  - Constraints: [vcs spec §4](../../../specs/vcs/vcs.spec.md#4-requirements--constraints)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps   | Status |
| --- | ---- | ------ | ------ |
| P1  | impl | TSK-27 | [ ]    |
| P2  | test | P1     | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать `VcsClientRepositoryFiles` abstract, обновить `VcsClient` (optional `MergeDiscussions`), добавить `getChanges` контракт в `VcsClientMergeRequests`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/abstract/vcs-client-repository-files.ts` (NEW)
  - `services/vcs-client/abstract/vcs-client.ts` (MODIFY: MergeDiscussions → optional)
  - `services/vcs-client/abstract/vcs-client-merge-requests.ts` (MODIFY: +getChanges contract)
- **Inputs:** TSK-27 handoff (типы VcsMergeRequestChanges, VcsFileContent)
- **Exit:** typecheck pass; `MergeDiscussions` объявлен как `abstract readonly MergeDiscussions?: VcsClientMergeDiscussions`; `VcsGitlabClient` компилируется без изменений; `getChanges` абстрактный метод

### P2 — test

- **Objective:** Компиляционные тесты (type-check gate через `@ts-expect-error`) + runtime-тесты сигнатур портов
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` (NEW: compile-time gate + runtime tests)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; `tsc --noEmit` подтверждает compile-time сценарии; runtime tests pass
- **Примечание:** compile-time сценарии (abstract keyword enforcement) проверяются через `@ts-expect-error` в `.test.ts`, валидируются `tsc --noEmit` (не `node:test`). Runtime-сценарии (сигнатуры) проверяются через `node:test`.

## 4. Acceptance Criteria (BDD)

**Feature:** Контракты портов vcs-client

**Scenario:** `VcsClientRepositoryFiles.getFileContent` — абстрактный метод [`unit`]

- **Given** класс наследует `VcsClientRepositoryFiles`
- **When** не переопределён `getFileContent`
- **Then** TypeScript ошибка: необходимо реализовать абстрактный метод

**Scenario:** `VcsClientRepositoryFiles.getFileContent` — сигнатура [`unit`]

- **Given** вызов `getFileContent({ repository, path, ref })`
- **Then** возвращает `Promise<VcsFileContent | null>`

**Scenario:** `VcsClient` с опциональным `MergeDiscussions` [`unit`]

- **Given** класс наследует `VcsClient` без реализации `MergeDiscussions`
- **When** TypeScript компиляция
- **Then** компилируется без ошибок (порт опциональный)

**Scenario:** `VcsClient` с реализованным `MergeDiscussions` [`unit`]

- **Given** `VcsGitlabClient` реализует `MergeDiscussions`
- **When** TypeScript компиляция
- **Then** компилируется без ошибок (существующий код не сломан)

**Scenario:** `VcsClientMergeRequests.getChanges` — абстрактный метод [`unit`]

- **Given** класс наследует `VcsClientMergeRequests`
- **When** не переопределён `getChanges`
- **Then** TypeScript ошибка: необходимо реализовать абстрактный метод

**Scenario:** `VcsClientMergeRequests.getChanges` — сигнатура [`unit`]

- **Given** вызов `getChanges({ repository, iid, page?, perPage? })`
- **Then** возвращает `Promise<VcsMergeRequestChanges[]>`

**Scenario:** `VcsClient` подкласс без опционального `RepositoryFiles` компилируется [`contract`]

- **Given** класс наследует `VcsClient`, реализует `MergeRequests`, но НЕ реализует `RepositoryFiles`
- **When** компиляция TypeScript
- **Then** компилируется без ошибок (порт опциональный)

**Scenario:** `VcsClient` подкласс без обязательного `MergeRequests` НЕ компилируется [`contract`]

- **Given** класс наследует `VcsClient`, НЕ реализует `MergeRequests`
- **When** компиляция TypeScript
- **Then** ошибка компиляции (порт обязательный)

## 5. Verification

**Примечание:** compile-time сценарии (abstract, optional/required порты) — `contract`-уровень, верифицируются `tsc --noEmit`. Runtime-сценарии (сигнатуры) — `unit`-уровень, верифицируются `node:test`.
| Command | Required by |
|---------|-------------|
| `npx tsc --noEmit` | typescript-rules (contract: abstract enforcement) |
| `node --test services/vcs-client/__tests__/abstract/` | node-test (unit: runtime signatures) |
| `npx prettier --check services/vcs-client/abstract/` | prettier (infra) |

- **Completion additions:** file headers `// @tasks: TSK-28` на новые файлы

## 6. Test Scenario Coverage

- Scenario getFileContent — абстрактный метод → `services/vcs-client/__tests__/abstract/vcs-client-repository-files.test.ts` :: `getFileContent is abstract`
- Scenario getFileContent — сигнатура → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `getFileContent returns Promise<VcsFileContent | null>`
- Scenario VcsClient с опциональным MergeDiscussions → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `VcsClient compiles without MergeDiscussions (contract — tsc gate)`
- Scenario VcsClient с реализованным MergeDiscussions → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `VcsGitlabClient still compiles with MergeDiscussions (contract — tsc gate)`
- Scenario getChanges — абстрактный метод → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `getChanges is abstract (contract — tsc gate)`
- Scenario getChanges — сигнатура → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `getChanges returns Promise<VcsMergeRequestChanges[]>`
- Scenario RepositoryFiles опциональный → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `VcsClient compiles without RepositoryFiles (contract — tsc gate)`
- Scenario MergeRequests обязательный → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` :: `VcsClient requires MergeRequests (contract — tsc gate)`

## 7. Execution Log

_(Протокол в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules typescript-rules
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/abstract/vcs-client-repository-files.ts
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/abstract/vcs-client.ts
- [x] `2026-05-18T03:00:00ZZ` file services/vcs-client/abstract/vcs-client-merge-requests.ts
- [x] `2026-05-18T03:00:00ZZ` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/abstract/vcs-client-repository-files.ts`, `services/vcs-client/abstract/vcs-client.ts`, `services/vcs-client/abstract/vcs-client-merge-requests.ts`]; decisions: [`MergeDiscussions` → optional]; open: []

#### P2

- [x] `2026-05-18T03:00:00ZZ` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T03:00:00ZZ` rules node-test, typescript-rules
- [x] `2026-05-18T03:00:00ZZ` test services/vcs-client/**tests**/abstract/vcs-client-abstract.test.ts
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent is abstract (contract — tsc gate)` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::getFileContent is abstract (contract)`
- [x] `2026-05-18T03:00:00ZZ` cov `getFileContent returns Promise<VcsFileContent | null>` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::getFileContent returns Promise<VcsFileContent | null>`
- [x] `2026-05-18T03:00:00ZZ` cov `VcsClient compiles without MergeDiscussions` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::VcsClient compiles without MergeDiscussions (contract)`
- [x] `2026-05-18T03:00:00ZZ` cov `VcsGitlabClient still compiles with MergeDiscussions` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::VcsGitlabClient still compiles with MergeDiscussions (contract)`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges is abstract (contract)` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::getChanges is abstract (contract)`
- [x] `2026-05-18T03:00:00ZZ` cov `getChanges returns Promise<VcsMergeRequestChanges[]>` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::getChanges returns Promise<VcsMergeRequestChanges[]>`
- [x] `2026-05-18T03:00:00ZZ` cov `VcsClient compiles without RepositoryFiles` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::VcsClient compiles without RepositoryFiles (contract)`
- [x] `2026-05-18T03:00:00ZZ` cov `VcsClient requires MergeRequests` → `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts::VcsClient requires MergeRequests (contract)`
- [x] `2026-05-18T03:00:00ZZ` ver node --test services/vcs-client/**tests**/abstract/ → pass exit=0
- [x] `2026-05-18T03:00:00ZZ` DONE
      **Handoff →** artifacts: [`services/vcs-client/__tests__/abstract/vcs-client-repository-files.test.ts`, `services/vcs-client/__tests__/abstract/vcs-client-merge-requests.test.ts`, `services/vcs-client/__tests__/abstract/vcs-client.test.ts`]; decisions: []; open: []

#### Round close

- [x] `2026-05-18T03:00:00ZZ` sync vcs+root
- [x] `2026-05-18T03:00:00ZZ` DONE
