# Task: TSK-14 — AnchorCheck

## 1. Meta & Traceability

- **Task-ID:** TSK-14
- **Purpose:** Реализовать `AnchorCheck.check(content, filePath) → LintError[]` — проверка парности и вложенности `// #region START_<NAME>` / `// #endregion END_<NAME>`.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** TSK-12
- **Spec References:**
  - AnchorCheck surface: [lint spec §3](../../specs/cli/lint/lint.spec.md)
  - AnchorCheck DbC: [lint spec §4.3](../../specs/cli/lint/lint.spec.md)
  - `AX_ANCHOR_FORMAT`: [typescript-rules.xml](../../ai/directives/coding/typescript-rules.xml)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Target Files:** `cli/cmd/lint/checks/anchor.check.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Проверка anchor-разметки

**Scenario:** Все пары на месте, вложенность правильная [`unit`]

- **Given** контент с `START_A → START_B → END_B → END_A`
- **When** `check(content, 'test.ts')`
- **Then** пустой массив ошибок

**Scenario:** Непарный START [`unit`]

- **Given** контент с `START_A` без `END_A`
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_ANCHOR_UNPAIRED_START` на строке `START_A`

**Scenario:** Непарный END [`unit`]

- **Given** контент с `END_A` без `START_A`
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_ANCHOR_UNPAIRED_END` на строке `END_A`

**Scenario:** Нарушение вложенности — родитель закрыт раньше ребёнка [`unit`]

- **Given** `START_A → START_B → END_A → END_B`
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_ANCHOR_NESTING`: `END_A` закрывает родителя, но `START_B` ещё открыт

**Scenario:** Множественные ошибки [`unit`]

- **Given** `START_A → START_B → END_A` (непарный B + nesting на END_A)
- **When** `check(content, 'test.ts')`
- **Then** две ошибки в порядке строк

**Scenario:** Нет anchors — чисто [`unit`]

- **Given** контент без `#region` вообще
- **When** `check(content, 'test.ts')`
- **Then** пустой массив ошибок

## 3. Phases

### Phase P1 — implementation

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/lint/checks/anchor.check.ts` (Create)
- **Acceptance:**
  - Pure function: `check(content: string, filePath: string): LintError[]`
  - Стековый алгоритм: `START_X` → push, `END_X` → pop + сверка
  - Ошибки возвращаются в порядке строк
  - Regex: `// #(region|endregion)\s+(START|END)_[A-Z0-9_]+`

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1
- [x] `2026-05-15T15:54:15Z` recon git=main/clean targets=absent divergence=none
- [x] `2026-05-15T15:54:15Z` rules typescript-rules
- [x] `2026-05-15T15:54:15Z` file cli/cmd/lint/checks/anchor.check.ts
- [x] `2026-05-15T15:54:15Z` ver npm run type-check → pass exit=0
- [x] `2026-05-15T15:54:15Z` DONE
**Handoff →** artifacts: [cli/cmd/lint/checks/anchor.check.ts]; decisions: [stack-algorithm=search-from-top-for-matching-START, nesting=report-unclosed-above-match, error-order=ascending-line-then-col]; open: []
