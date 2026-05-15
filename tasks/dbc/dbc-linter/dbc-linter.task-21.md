# Task: TSK-21 — vcs-client: file headers + DBC contracts

## 1. Meta & Traceability

- **Task-ID:** TSK-21
- **Purpose:** Добавить file headers (`// @file:`, `// @consumers:`) и JSDoc-контракты во все 7 файлов `services/vcs-client/`. 51 ошибка линтера: 14 file header + 37 DBC (interface property без JSDoc, методы без `@param`/`@returns`).
- **Scope:** dbc
- **Module:** N/A (scope-level maintenance)
- **Dependencies:** None
- **Spec References:**
  - `AX_FILE_LEVEL_CONTEXT`: [typescript-rules.xml](../../ai/directives/coding/typescript-rules.xml)
  - `AX_BASE_CONTRACT_SHAPE`: [typescript-rules.xml](../../ai/directives/coding/typescript-rules.xml)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Target Files:**
  - `services/vcs-client/entities/vcs-user.type.ts` (Modify)
  - `services/vcs-client/abstract/vcs-client.ts` (Modify)
  - `services/vcs-client/abstract/vcs-client-merge-discussions.ts` (Modify)
  - `services/vcs-client/abstract/vcs-client-merge-requests.ts` (Modify)
  - `services/vcs-client/gitlab/vcs-gitlab-client.ts` (Modify)
  - `services/vcs-client/gitlab/vcs-gitlab-merge-discussions.ts` (Modify)
  - `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts` (Modify)

## 2. Acceptance Criteria (BDD)

**Feature:** vcs-client проходит `gennady lint` с 0 ошибок

**Scenario:** Все 7 файлов чистые [`unit`]

- **Given** запущен `gennady lint` на всех 7 файлах
- **When** добавлены file headers и JSDoc-контракты
- **Then** 0 ошибок

## 3. Phases

### Phase P1 — fix

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** все 7 файлов из списка выше
- **Acceptance:**
  - Каждый файл: `// @file:` + `// @consumers:` перед первым import/export
  - Каждый type/interface: `@purpose` на сущности
  - Каждый interface property: `@purpose` на проперти
  - Каждый метод: `@param` для всех параметров, `@returns` для не-void
  - Каждое protected поле: `@purpose`
  - Каждый constructor: `@purpose`
  - `npm run dev lint <files>` → 0 ошибок

## 4. Execution Log

### Round 1 — <YYYY-MM-DD>, initial

- [ ] `[<ts>]` Task initialized.
- [ ] `[<ts>]` Implementation files: 7 files modified.
- [ ] `[<ts>]` Verification: `npm run dev lint <files>` → `<pass|fail>` [`exit=<code>`].
- [ ] `[<ts>]` Scenario coverage: `все 7 файлов чистые` → lint pass.
- [ ] `[<ts>]` Self-audit: walked loaded rule axioms against generated code. Violations: `<list or "none">`.
- [ ] `[<ts>]` Introduced (if any): `<Entity>` because `<reason>`.
- [ ] `[<ts>]` Tracker synced: `tasks/dbc/README.md` + `tasks/README.md`.
- [ ] `[<ts>]` Status: [x] DONE.
