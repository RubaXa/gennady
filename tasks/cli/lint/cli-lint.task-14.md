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

### Round 2 — 2026-05-21, fix: bare #endregion/#region without END*/START*

| Phase | Kind | Status | Target Files                                                        | Deps |
| ----- | ---- | ------ | ------------------------------------------------------------------- | ---- |
| P1    | fix  | [ ]    | `cli/cmd/lint/checks/anchor.check.ts`, `cli/cmd/lint/lint.types.ts` | —    |
| P2    | test | [ ]    | `cli/cmd/lint/__tests__/anchor.check.test.ts`                       | P1   |

#### P1

- [x] `2026-05-21T12:00:00Z` recon targets=anchor.check.ts,lint.types.ts|exists
- [x] `2026-05-21T12:00:00Z` rules typescript-rules
- [x] `2026-05-21T12:00:00Z` file cli/cmd/lint/checks/anchor.check.ts
- [x] `2026-05-21T12:00:00Z` file cli/cmd/lint/lint.types.ts
- [x] `2026-05-21T12:00:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-21T12:00:00Z` DONE
      intro BARE*ANCHOR_RE ← detects bare #region/#endregion without START*/END\_
      intro ERR_CLI_LINT_ANCHOR_MALFORMED ← new error code
      intro auto-close ← bare #endregion with non-empty stack pops top
      **Handoff →** artifacts: [anchor.check.ts, lint.types.ts]; decisions: [bare-anchor=malformed, auto-close=stack-top-pop]; open: []

#### P2

- [x] `2026-05-21T12:10:00Z` recon targets=anchor.check.test.ts|exists
- [x] `2026-05-21T12:10:00Z` rules typescript-rules, node-test
- [x] `2026-05-21T12:10:00Z` test cli/cmd/lint/**tests**/anchor.check.test.ts
- [x] `2026-05-21T12:10:00Z` ver node --test → pass exit=0 (10/10)
- [x] `2026-05-21T12:10:00Z` DONE
      cov bare #endregion → anchor.check.test.ts::bare #endregion
      cov auto-close no unpaired → anchor.check.test.ts::auto-close
      cov bare #endregion empty stack → anchor.check.test.ts::bare #endregion empty
      cov bare #region → anchor.check.test.ts::bare #region
      **Handoff →** artifacts: [anchor.check.test.ts]; decisions: [test-count=10, bare-anchor-fully-covered]; open: []

#### Round close

- [x] `2026-05-21T12:12:00Z` sync cli
- [x] `2026-05-21T12:12:00Z` DONE

### Round 3 — 2026-05-21, fix: comprehensive edge case coverage per alt-opinion

| Phase | Kind | Status | Target Files                                  | Deps |
| ----- | ---- | ------ | --------------------------------------------- | ---- |
| P1    | test | [ ]    | `cli/cmd/lint/__tests__/anchor.check.test.ts` | —    |

#### P1

- [x] `2026-05-21T13:00:00Z` recon targets=anchor.check.test.ts|exists
- [x] `2026-05-21T13:00:00Z` rules typescript-rules, node-test
- [x] `2026-05-21T13:00:00Z` test cli/cmd/lint/**tests**/anchor.check.test.ts
- [x] `2026-05-21T13:00:00Z` ver node --test → pass exit=0 (23/23)
- [x] `2026-05-21T13:00:00Z` DONE
      intro 13 new edge case tests covering all alt-opinion findings
      cov nested bare #endregion → uses stack top
      cov double bare #endregion → cascade auto-close + empty stack
      cov bare #region + END_FOO → END is UNPAIRED_END
      cov mix valid+bare → END after auto-close is UNPAIRED
      cov 3x unpaired START at EOF → 3 errors
      cov END with wrong name → UNPAIRED_END + UNPAIRED_START
      cov deep nesting 3 levels happy path → no errors
      cov double END same START → second is UNPAIRED_END
      cov duplicate START names → both close correctly
      cov trailing whitespace bare #endregion → MALFORMED
      cov valid anchor with trailing text → matched correctly
      cov lowercase start → silently ignored
      cov anchor in string literal → not matched
      **Handoff →** artifacts: [anchor.check.test.ts]; decisions: [test-count=23, all-edge-cases-covered, alt-opinion-synthesized]; open: []

#### Round close

- [x] `2026-05-21T13:12:00Z` sync cli
- [x] `2026-05-21T13:12:00Z` DONE
