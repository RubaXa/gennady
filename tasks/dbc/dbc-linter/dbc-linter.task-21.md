# Task: TSK-21 — Autofix: normalize multi-line + expand inlining + always-run formatting

## 1. Meta & Traceability

- **Task-ID:** TSK-21
- **Purpose:** Исправить autofix: (1) `_inlineIfSafe` не должен блокировать многотеговые контракты (сейчас `tagCount > 1 → skip`), (2) добавить `_normalizeMultiLine` — приведение любого multi-line JSDoc к каноническому виду (`/**` отдельно, ` * ` префикс, ` */` отдельно), (3) нормализация должна запускаться всегда, даже если lint-ошибок нет (сейчас ранний return при `initialCount === 0`).
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-20
- **Spec References:**
  - Autofix chain: [dbc-linter spec §4.2 autofix chain](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
  - FR-26 autofix: [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |
  | node-test        | ai/directives/testing/node-test.xml       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Target Files:**
  - `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify — fix `_inlineIfSafe` + add `_normalizeMultiLine` + fix `lintAndFix` early return)
- **Target Test Files:**
  - `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify — добавить тесты K5, K6)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/malformed-multi-line.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/malformed-opening.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Autofix нормализует любой JSDoc формат

**Scenario:** Multi-line с `*/` на одной строке с последним тегом → нормализован [`unit`]

- **Given** файл с контрактом `/** @purpose X.\n * @returns Y. */`
- **When** `lintAndFix(filePath)`
- **Then** контракт приведён к `/**\n * @purpose X.\n * @returns Y.\n */` (если не встраивается в inline) или в inline

**Scenario:** Multi-line с `/** @tag content` на первой строке → нормализован [`unit`]

- **Given** файл с контрактом `/** @purpose X.\n * @invariant Y.\n */`
- **When** `lintAndFix(filePath)`
- **Then** `/**` на отдельной строке, контент с ` * ` префиксом

**Scenario:** Multi-line без ошибок линтера всё равно нормализуется [`unit`]

- **Given** файл с malformed контрактом но без lint-ошибок (все теги корректны)
- **When** `lintAndFix(filePath)`
- **Then** контракт нормализован (ранний return убран)

**Scenario:** Многотеговый контракт инлайнится если safe [`unit`]

- **Given** файл с контрактом `/**\n * @purpose X.\n * @param {string} a X.\n * @returns {string} Y.\n */`
- **When** `lintAndFix(filePath)`
- **Then** контракт сжат в `/** @purpose X. | @param a X. | @returns Y. */` (после удаления {type})

**Scenario:** Многотеговый контракт с конфликтами НЕ инлайнится, но нормализуется [`unit`]

- **Given** файл с контрактом где есть `@purpose` + `@see` конфликт
- **When** `lintAndFix(filePath)`
- **Then** контракт нормализован (multi-line формат), но НЕ инлайн (dry-run показал ERR_DBC_PURPOSE_CONFLICT)

## 3. Phases

### Phase P1 — fix

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify)
- **Acceptance:**
  - `_inlineIfSafe` убран `tagCount > 1` guard
  - Добавлен `_normalizeMultiLine(jsdocText: string): string`
  - `_normalizeMultiLine` добавлен в autofix chain как шаг 6 (перед `_inlineIfSafe`)
  - `lintAndFix` всегда парсит и нормализует (убран ранний return при `initialCount === 0`)
  - `tsc --noEmit` проходит

### Phase P2 — tests

- **Kind:** test
- **Rules:** typescript-rules, node-test
- **Target Test Files:** fixtures + test
- **Acceptance:**
  - K5: fixture `malformed-multi-line.ts` + тест
  - K6: fixture `malformed-opening.ts` + тест
  - K2 (multi-line→inline) — должен проходить (сейчас FAIL)
  - Все существующие тесты проходят
  - `npm test` — все тесты dbc-linter проходят

## 4. Execution Log

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T12:00:00Z` recon targets=dbc-ts-linter.ts|exists divergence=none
- [x] `2026-05-18T12:00:00Z` rules typescript-rules
- [x] `2026-05-18T12:00:00Z` file services/dbc/linter/implementations/ts/dbc-ts-linter.ts
- [x] `2026-05-18T12:00:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T12:00:00Z` DONE
      intro _normalizeMultiLine ← malformed JSDoc (content on /** line, */ on same line as tag) → canonical
      intro _inlineIfSafe:tagCount removed ← multi-tag contracts now inline via | separator
      intro lintAndFix:always-parse ← removed early return at initialCount===0, normalization runs always
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/dbc-ts-linter.ts]; decisions: [normalizeMultiLine=canonical, inlineIfSafe=multi-tag-safe, lintAndFix=always-normalize]; open: []

#### P2

- [x] `2026-05-18T12:10:00Z` recon targets=dbc-ts-linter.test.ts|exists divergence=none
- [x] `2026-05-18T12:10:00Z` rules typescript-rules, node-test
- [x] `2026-05-18T12:10:00Z` file services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/malformed-multi-line.ts
- [x] `2026-05-18T12:10:00Z` file services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/malformed-opening.ts
- [x] `2026-05-18T12:10:00Z` test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts
- [x] `2026-05-18T12:11:00Z` ver node --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts → pass exit=0 (102/102)
- [x] `2026-05-18T12:11:00Z` DONE
      cov K5 malformed */ on same line → dbc-ts-linter.test.ts::Group K/K5
      cov K6 malformed /** content → dbc-ts-linter.test.ts::Group K/K6
      cov K2 multi-line→inline → dbc-ts-linter.test.ts::Group K/K2 (was FAIL, now PASS)
      **Handoff →** artifacts: [dbc-ts-linter.test.ts, fixtures/malformed-multi-line.ts, fixtures/malformed-opening.ts]; decisions: [test-count=102, K2=fixed]; open: []

#### Round close

- [x] `2026-05-18T12:12:00Z` sync dbc+root
- [x] `2026-05-18T12:12:00Z` DONE
