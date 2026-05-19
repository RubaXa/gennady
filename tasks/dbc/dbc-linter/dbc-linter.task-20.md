# Task: TSK-20 — Fix \_reorderTags: `*/` closing boundary + edge cases

## 1. Meta & Traceability

- **Task-ID:** TSK-20
- **Purpose:** Исправить баг в `_reorderTags`: строка `*/` (закрытие JSDoc) обрабатывалась как continuation-строка последнего тега. После сортировки тегов `*/` уезжал в середину блока, а тег с order=99 выпадал за пределы `/** */`, ломая синтаксис TypeScript. Добавить тесты на все edge cases.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-10
- **Spec References:**
  - `_reorderTags`: [dbc-linter spec §4.2 autofix chain](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
  - FR-26 autofix: [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |
  | node-test        | ai/directives/testing/node-test.xml       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Target Files:**
  - `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify — fix `*/` handling)
- **Target Test Files:**
  - `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify — добавить тесты `_reorderTags`)

## 2. Acceptance Criteria (BDD)

**Feature:** `_reorderTags` правильно обрабатывает все варианты JSDoc

**Scenario:** `*/` остаётся последней строкой [`unit`]

- **Given** JSDoc `/**\n * @consumer X\n * @invariant Y\n */`
- **When** `_reorderTags(jsdoc)`
- **Then** `@invariant` перед `@consumer`, `*/` — последняя строка

**Scenario:** Нет тегов — только описание [`unit`]

- **Given** JSDoc `/**\n * Description\n */`
- **When** `_reorderTags(jsdoc)`
- **Then** без изменений

**Scenario:** Один тег [`unit`]

- **Given** JSDoc `/**\n * @purpose X\n */`
- **When** `_reorderTags(jsdoc)`
- **Then** без изменений

**Scenario:** Теги уже в правильном порядке [`unit`]

- **Given** JSDoc `/**\n * @purpose X\n * @invariant Y\n * @sideEffect Z\n */`
- **When** `_reorderTags(jsdoc)`
- **Then** без изменений

**Scenario:** Теги в обратном порядке [`unit`]

- **Given** JSDoc `/**\n * @sideEffect Z\n * @invariant Y\n * @purpose X\n */`
- **When** `_reorderTags(jsdoc)`
- **Then** порядок: `@purpose`, `@invariant`, `@sideEffect`, `*/` последняя

**Scenario:** Неизвестные теги сохраняют относительный порядок [`unit`]

- **Given** JSDoc с `@custom1`, `@custom2` (order 99)
- **When** `_reorderTags(jsdoc)`
- **Then** `@custom1` перед `@custom2` (относительный порядок неизменен)

**Scenario:** Duplicate теги сохраняют порядок [`unit`]

- **Given** JSDoc `/**\n * @param a\n * @param b\n * @param c\n */`
- **When** `_reorderTags(jsdoc)`
- **Then** порядок `@param a`, `@param b`, `@param c` сохранён

**Scenario:** Multi-line значения тегов [`unit`]

- **Given** JSDoc где `@invariant` имеет 2 строки текста
- **When** `_reorderTags(jsdoc)`
- **Then** обе строки остаются с тегом

## 3. Phases

### Phase P1 — fix

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify)
- **Acceptance:**
  - `*/` детектится до обработки тегов, сохраняется как `closingLine`
  - `closingLine` добавляется последней строкой при сборке
  - tsc --noEmit проходит

### Phase P2 — tests

- **Kind:** test
- **Rules:** typescript-rules, node-test
- **Target Test Files:** `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify)
- **Acceptance:**
  - 7+ тестов `_reorderTags` напрямую (через вызов protected метода через `as any` или через рефлексию)
  - npm test проходит

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15T19:20:00Z` recon targets=dbc-ts-linter.ts|exists divergence=none
- [x] `2026-05-15T19:20:00Z` rules typescript-rules
- [x] `2026-05-15T19:21:00Z` file services/dbc/linter/implementations/ts/dbc-ts-linter.ts
- [x] `2026-05-15T19:21:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T19:21:00Z` DONE
      intro closingLine ← preserve \*/ boundary separate from tag blocks
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/dbc-ts-linter.ts]; decisions: [_reorderTags-closing-boundary=preserved]; open: []

#### P2

- [x] `2026-05-15T19:22:00Z` recon targets=dbc-ts-linter.test.ts|exists divergence=none
- [x] `2026-05-15T19:22:00Z` rules typescript-rules, node-test
- [x] `2026-05-15T19:22:00Z` test services/dbc/linter/implementations/ts/**tests**/dbc-ts-linter.test.ts
- [x] `2026-05-15T19:23:00Z` ver node --test --test-name-pattern=\_reorderTags → pass exit=0
- [x] `2026-05-15T19:23:00Z` DONE
      intro duplicate-tags-test ← audit F-03: missing duplicate tags BDD scenario
      cov closing _/ stays last → dbc-ts-linter.test.ts::\_reorderTags/closing _/ stays last
      cov no tags — unchanged → dbc-ts-linter.test.ts::\_reorderTags/no tags
      cov single tag — unchanged → dbc-ts-linter.test.ts::\_reorderTags/single tag
      cov already ordered — unchanged → dbc-ts-linter.test.ts::\_reorderTags/already ordered
      cov reversed order → dbc-ts-linter.test.ts::\_reorderTags/reversed order
      cov unknown tags preserve relative order → dbc-ts-linter.test.ts::\_reorderTags/unknown tags
      cov multi-line tag values → dbc-ts-linter.test.ts::\_reorderTags/multi-line values
      cov duplicate tags preserve relative order → dbc-ts-linter.test.ts::\_reorderTags/duplicate tags
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts]; decisions: [test-count=8, reorderTags-edge-cases=covered]; open: []

#### Round close

- [x] `2026-05-15T19:23:00Z` sync dbc+root
- [x] `2026-05-15T19:23:00Z` DONE
