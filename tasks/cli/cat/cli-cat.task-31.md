# Task: TSK-31 — cat --url: поддержка GitLab MR / GitHub PR

## 1. Meta

- **Task-ID:** TSK-31
- **Status:** [x] DONE
- **Purpose:** Добавить флаг `--url=<MR/PR URL>` в команду `cat`: парсинг URL → ОДИН VCS-клиент → сбор ВСЕХ изменённых файлов → catGenFromVcs → рендеринг XML/MD.
- **Scope:** cli
- **Module:** cat
- **Dependencies:** TSK-30 (GitHub getChanges возвращает head.ref — исправлено)
- **Spec References:**
  - [cat.spec.md](../../../specs/cli/cat/cat.spec.md) §5 (архитектура), §6 (Decision Log D-001..D-005)
  - [VcsGithubMergeRequests](../../../specs/vcs/vcs-client/vcs-client.spec.md#vcsgithubmergerequests)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps   | Status |
| --- | ---- | ------ | ------ |
| P1  | impl | TSK-30 | [x]    |
| P2  | test | P1     | [x]    |

## 3. Phases

### P1 — impl

- **Objective:**
  1. Создать `catGenFromVcs` в `cat-gen.ts` — pure-функция (D-001)
  2. Создать `cat-url.fn.ts` — `resolveCatUrl`: парсинг URL → ОДИН клиент → getChanges → getFileContent
  3. Обновить `cat.cmd.ts`: `--url` флаг, `--ext` split по запятой, фильтр `args._`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/utils/cat-gen/cat-gen.ts` (MODIFY: +catGenFromVcs)
  - `cli/cmd/cat/cat-url.fn.ts` (NEW)
  - `cli/cmd/cat/cat.cmd.ts` (MODIFY: +--url, --ext split, args.\_ filter)
- **Inputs:** TSK-30 (GitHub getChanges возвращает head.ref)
- **Exit:** typecheck pass; GitHub baseUrl cloud/enterprise; один клиент; catGenFromVcs pure; логирование skip-причин

### P2 — test

- **Objective:** Unit-тесты resolveCatUrl (валидация URL, токены, baseUrl) + catGenFromVcs (pure-функция)
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/cat/__tests__/cat-url.test.ts` (NEW)
  - `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts` (NEW)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)

**Feature:** `gennady cat --url=<MR/PR URL>` — сбор всех изменённых файлов из VCS

**Scenario:** Невалидный URL → ошибка [`unit`]

- **When** `gennady cat --url="not-a-url"`
- **Then** stderr содержит «Не удалось распознать URL»; exit 1

**Scenario:** Нет GITLAB_PERSONAL_TOKEN → ошибка [`unit`]

- **Given** токен не установлен
- **When** resolveCatUrl для GitLab URL
- **Then** ошибка «GITLAB_PERSONAL_TOKEN не установлен»

**Scenario:** Нет GITHUB_PERSONAL_TOKEN → ошибка [`unit`]

- **Given** токен не установлен
- **When** resolveCatUrl для GitHub URL
- **Then** ошибка «GITHUB_PERSONAL_TOKEN не установлен»

**Scenario:** GitHub cloud → api.github.com [`unit`]

- **Given** URL `https://github.com/owner/repo/pull/1`
- **When** resolveCatUrl
- **Then** baseUrl = `https://api.github.com` (не токен/парсинг ошибка)

**Scenario:** GitHub Enterprise → /api/v3 [`unit`]

- **Given** URL `https://github.internal.com/org/repo/pull/5`
- **When** resolveCatUrl
- **Then** baseUrl = `https://github.internal.com/api/v3` (не токен/парсинг ошибка)

**Scenario:** catGenFromVcs — все не-удалённые файлы [`unit`]

- **Given** файлы без deleted и без base64
- **When** catGenFromVcs
- **Then** возвращает все файлы с relativePath и contents

**Scenario:** catGenFromVcs — пропуск удалённых [`unit`]

- **Given** один файл deleted, один modified
- **When** catGenFromVcs
- **Then** возвращает только modified

**Scenario:** catGenFromVcs — пропуск бинарных [`unit`]

- **Given** один файл encoding: base64
- **When** catGenFromVcs
- **Then** бинарный исключён

## 5. Verification

| Command                                                                                                  | Required by      |
| -------------------------------------------------------------------------------------------------------- | ---------------- |
| `npx tsc --noEmit`                                                                                       | typescript-rules |
| `node --test cli/cmd/cat/__tests__/cat-url.test.ts cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts` | node-test        |
| `npx prettier --check cli/cmd/cat/ cli/utils/cat-gen/`                                                   | prettier (infra) |

## 6. Test Scenario Coverage

- Scenario Невалидный URL → `cli/cmd/cat/__tests__/cat-url.test.ts` :: `errors on invalid URL`
- Scenario Нет GITLAB_PERSONAL_TOKEN → `cli/cmd/cat/__tests__/cat-url.test.ts` :: `errors when GITLAB_PERSONAL_TOKEN missing`
- Scenario Нет GITHUB_PERSONAL_TOKEN → `cli/cmd/cat/__tests__/cat-url.test.ts` :: `errors when GITHUB_PERSONAL_TOKEN missing`
- Scenario GitHub cloud → `cli/cmd/cat/__tests__/cat-url.test.ts` :: `uses api.github.com for github.com`
- Scenario GitHub Enterprise → `cli/cmd/cat/__tests__/cat-url.test.ts` :: `uses /api/v3 for GitHub Enterprise`
- Scenario catGenFromVcs все файлы → `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts` :: `returns all non-deleted files`
- Scenario catGenFromVcs удалённые → `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts` :: `skips deleted files`
- Scenario catGenFromVcs бинарные → `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts` :: `skips base64 (binary) files`

## 7. Execution Log

_(Протокол в [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T04:00:00Z` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T04:00:00Z` rules typescript-rules
- [x] `2026-05-18T04:00:00Z` file `cli/utils/cat-gen/cat-gen.ts`
- [x] `2026-05-18T04:00:00Z` file `cli/cmd/cat/cat-url.fn.ts`
- [x] `2026-05-18T04:00:00Z` file `cli/cmd/cat/cat.cmd.ts`
- [x] `2026-05-18T04:00:00Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-05-18T04:00:00Z` DONE
      **Handoff →** artifacts: [`cli/utils/cat-gen/cat-gen.ts`, `cli/cmd/cat/cat-url.fn.ts`, `cli/cmd/cat/cat.cmd.ts`]; decisions: [github baseUrl cloud/enterprise, one client reused, catGenFromVcs pure, sha ref for GitLab raw endpoint]; open: []

#### P2

- [x] `2026-05-18T04:00:00Z` recon git=main/clean targets=exists divergence=none
- [x] `2026-05-18T04:00:00Z` rules node-test, typescript-rules
- [x] `2026-05-18T04:00:00Z` test `cli/cmd/cat/__tests__/cat-url.test.ts`
- [x] `2026-05-18T04:00:00Z` test `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts`
- [x] `2026-05-18T04:00:00Z` cov `errors on invalid URL` → `cli/cmd/cat/__tests__/cat-url.test.ts::errors on invalid URL`
- [x] `2026-05-18T04:00:00Z` cov `errors when GITLAB_PERSONAL_TOKEN missing` → `cli/cmd/cat/__tests__/cat-url.test.ts::errors when GITLAB_PERSONAL_TOKEN missing`
- [x] `2026-05-18T04:00:00Z` cov `errors when GITHUB_PERSONAL_TOKEN missing` → `cli/cmd/cat/__tests__/cat-url.test.ts::errors when GITHUB_PERSONAL_TOKEN missing`
- [x] `2026-05-18T04:00:00Z` cov `uses api.github.com for github.com` → `cli/cmd/cat/__tests__/cat-url.test.ts::uses api.github.com for github.com`
- [x] `2026-05-18T04:00:00Z` cov `uses /api/v3 for GitHub Enterprise` → `cli/cmd/cat/__tests__/cat-url.test.ts::uses /api/v3 for GitHub Enterprise`
- [x] `2026-05-18T04:00:00Z` cov `returns all non-deleted files` → `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts::returns all non-deleted files`
- [x] `2026-05-18T04:00:00Z` cov `skips deleted files` → `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts::skips deleted files`
- [x] `2026-05-18T04:00:00Z` cov `skips base64 (binary) files` → `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts::skips base64 (binary) files`
- [x] `2026-05-18T04:00:00Z` ver `node --test cli/cmd/cat/__tests__/cat-url.test.ts cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts` → pass exit=0
- [x] `2026-05-18T04:00:00Z` DONE
      **Handoff →** artifacts: [`cli/cmd/cat/__tests__/cat-url.test.ts`, `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts`]; decisions: []; open: []

#### Round close

- [x] `2026-05-18T04:00:00Z` sync cli+root
- [x] `2026-05-18T04:00:00Z` DONE
