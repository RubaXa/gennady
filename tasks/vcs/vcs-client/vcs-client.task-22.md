# Task: TSK-22 — vcs-client: file headers + DBC contracts

## 1. Meta & Traceability

- **Task-ID:** TSK-22
- **Purpose:** Добавить `// @file:`/`// @consumers:` file headers и JSDoc-контракты на все экспортируемые сущности в `services/vcs-client/`. Сейчас 51 ошибка линтера: 14 file header + 37 DBC.
- **Scope:** vcs
- **Module:** vcs-client
- **Dependencies:** None
- **Spec References:**
  - `AX_FILE_LEVEL_CONTEXT`: [typescript-rules.xml](../../ai/directives/coding/typescript-rules.xml)
  - Entity Inventory: [vcs-client spec §2](../../specs/vcs/vcs-client/vcs-client.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Target Files:** 7 файлов в `services/vcs-client/` (Modify)

## 2. Acceptance Criteria (BDD)

**Feature:** `gennady lint services/vcs-client/...` → 0 ошибок

**Scenario:** Все 7 файлов проходят линтер [`unit`]

- **Given** добавлены file headers и JSDoc на все сущности
- **When** `gennady lint <7 files>`
- **Then** 0 ошибок, exit 0

## 3. Phases

### Phase P1 — fix all files [`x`]

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** все 7 файлов `services/vcs-client/**/*.ts`
- **Acceptance:**
  - File header: `// @file:`, `// @consumers:` (без `@tasks:`)
  - Каждый type/interface: `@purpose`
  - Каждая interface property: single-line `@purpose`
  - Каждый метод: `@param` для параметров, `@returns` для не-void
  - Каждое protected поле: `@purpose`
  - Конструкторы: `@purpose`
  - `gennady lint` → 0 ошибок

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1
- [x] `2026-05-15T19:49:29Z` recon targets=exists divergence=none
- [x] `2026-05-15T19:49:29Z` rules typescript-rules
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/entities/vcs-user.type.ts
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/abstract/vcs-client.ts
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/abstract/vcs-client-merge-discussions.ts
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/abstract/vcs-client-merge-requests.ts
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/gitlab/vcs-gitlab-client.ts
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts
- [x] `2026-05-15T19:49:29Z` file services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts
- [x] `2026-05-15T19:49:29Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T19:49:29Z` ver npx tsx cli/gennady.ts lint <7 files> → pass exit=0
- [x] `2026-05-15T19:49:29Z` DONE
**Handoff →** artifacts: [services/vcs-client/entities/vcs-user.type.ts, services/vcs-client/abstract/vcs-client.ts, services/vcs-client/abstract/vcs-client-merge-discussions.ts, services/vcs-client/abstract/vcs-client-merge-requests.ts, services/vcs-client/gitlab/vcs-gitlab-client.ts, services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts, services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts]; decisions: [file-header-format=@file+@consumers-no-@tasks, jsdoc-lang=mixed-ru-en-existing-preserved]; open: []
