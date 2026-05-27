# Task: TSK-08 — DbcTsAstAdapter: tree-sitter парсинг TypeScript

## 1. Meta & Traceability

- **Task-ID:** TSK-08
- **Purpose:** Реализовать `DbcTsAstAdapter` — адаптер парсинга TypeScript-файлов через tree-sitter: обход AST, сбор export-сущностей, их членов, сигнатур и JSDoc-контрактов.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-07
- **Spec References:**
  - Adapter `DbcTsAstAdapter`: [dbc-linter spec §3](../../specs/dbc/dbc-linter/dbc-linter.spec.md#dbctsastadapter)
  - Contract: [dbc-linter spec §4.2 Adapter DbcTsAstAdapter](../../specs/dbc/dbc-linter/dbc-linter.spec.md#adapter-dbctsastadapter)
  - Entity Inventory: [dbc-linter spec §2](../../specs/dbc/dbc-linter/dbc-linter.spec.md#2-entity-inventory-closed-world)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |
  | node-test        | ai/directives/testing/node-test.xml       | Before writing or modifying test files       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts` (Create)
- **Target Test Files:** `services/dbc/linter/implementations/ts/__tests__/dbc-ts-ast-adapter.test.ts` (Create)

## 2. Acceptance Criteria (BDD)

Contract: [dbc-linter spec §4.2 Adapter DbcTsAstAdapter](../../specs/dbc/dbc-linter/dbc-linter.spec.md#adapter-dbctsastadapter).

**Feature:** Парсинг TypeScript-файла через tree-sitter в `DbcParseResult`

**Scenario:** Успешный парсинг валидного TS-файла с экспортами [`unit`]

- **Given** валидный `.ts` файл с `export const`, `export function`, `export class`, `export interface`, `export type`, `export enum`, `export default`
- **When** вызван `parseFile(filePath)`
- **Then** возвращает `{ ok: true, exported: [...] }`
- **And** каждая сущность имеет `name`, `kind`, `members`, `signature`
- **And** class содержит все члены: field, method, getter, setter, constructor
- **And** interface содержит property и method сигнатуры
- **And** enum содержит варианты

**Scenario:** Обнаружение JSDoc-контракта перед сущностью [`unit`]

- **Given** TS-файл где перед `export function` идёт `/** @purpose ... */`
- **When** вызван `parseFile(filePath)`
- **Then** `contract` сущности содержит текст между `/**` и `*/`
- **And** `contract.startLine` указывает на начало комментария

**Scenario:** Комментарий перед `export` (не перед сущностью) [`unit`]

- **Given** TS-файл с `/** contract */ export function foo()`
- **When** вызван `parseFile(filePath)`
- **Then** `contract` сущности `foo` найден (эвристика: комментарий перед export-узлом)

**Scenario:** Файл без контрактов [`unit`]

- **Given** TS-файл с экспортами, но без JSDoc-комментариев
- **When** вызван `parseFile(filePath)`
- **Then** `contract` у всех сущностей отсутствует (undefined)

**Scenario:** Синтаксически битый файл [`unit`]

- **Given** `.ts` файл с синтаксической ошибкой
- **When** вызван `parseFile(filePath)`
- **Then** возвращает `{ ok: false, error: string }`

**Scenario:** Файл не найден [`unit`]

- **Given** путь к несуществующему файлу
- **When** вызван `parseFile(filePath)`
- **Then** возвращает `{ ok: false, error: string }`

**Scenario:** Re-export пропускается [`unit`]

- **Given** TS-файл с `export { x } from './other'` и `export * from './other'`
- **When** вызван `parseFile(filePath)`
- **Then** re-export сущности отсутствуют в `exported`

**Scenario:** Извлечение сигнатуры функции [`unit`]

- **Given** функция `export function bar(x: string, y?: number, ...args: boolean[]): User`
- **When** вызван `parseFile(filePath)`
- **Then** `signature.params` = `[{name:'x', type:'string', optional:false, isRest:false}, {name:'y', type:'number', optional:true, isRest:false}, {name:'args', type:'boolean[]', optional:false, isRest:true}]`
- **And** `signature.returnType` = `'User'`

**Scenario:** Не выбрасывает исключений [`unit`]

- **Given** любой вход (пустой файл, бинарный, мусор)
- **When** вызван `parseFile(filePath)`
- **Then** не выбрасывает исключений; возвращает `DbcParseResult`

## 3. Verification

| Command                                                                                          | Required by      |
| ------------------------------------------------------------------------------------------------ | ---------------- |
| `tsc --noEmit` exit=0                                                                            | typescript-rules |
| `node --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-ast-adapter.test.ts` exit=0 | node-test        |

- **Completion additions:** none beyond project baseline

## 4. Test Scenario Coverage

- Scenario Успешный парсинг валидного TS-файла → `dbc-ts-ast-adapter.test.ts` :: should parse valid TS file with all export kinds
- Scenario Обнаружение JSDoc-контракта → `dbc-ts-ast-adapter.test.ts` :: should extract JSDoc contract text
- Scenario Комментарий перед export → `dbc-ts-ast-adapter.test.ts` :: should find contract before export keyword
- Scenario Файл без контрактов → `dbc-ts-ast-adapter.test.ts` :: should return undefined contract when no JSDoc
- Scenario Синтаксически битый файл → `dbc-ts-ast-adapter.test.ts` :: should return ok:false on syntax error
- Scenario Файл не найден → `dbc-ts-ast-adapter.test.ts` :: should return ok:false on missing file
- Scenario Re-export пропускается → `dbc-ts-ast-adapter.test.ts` :: should skip re-exports
- Scenario Извлечение сигнатуры → `dbc-ts-ast-adapter.test.ts` :: should extract function signature correctly
- Scenario Не выбрасывает исключений → `dbc-ts-ast-adapter.test.ts` :: should never throw

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

- [x] `2026-05-15 01:05` deps TSK-07=DONE
- [x] `2026-05-15 01:05` act typescript-rules, node-test
- [x] `2026-05-15 01:10` file `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts`
- [x] `2026-05-15 01:15` test `services/dbc/linter/implementations/ts/__tests__/dbc-ts-ast-adapter.test.ts`
- [x] `2026-05-15 01:18` ver `tsc --noEmit` → pass exit=0
- [x] `2026-05-15 01:18` ver `node --import tsx --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-ast-adapter.test.ts` → pass exit=0
- [x] `2026-05-15 01:18` cov Успешный парсинг → `dbc-ts-ast-adapter.test.ts::should parse valid TS file with all export kinds`
- [x] `2026-05-15 01:18` cov Обнаружение JSDoc → `dbc-ts-ast-adapter.test.ts::should extract JSDoc contract text`
- [x] `2026-05-15 01:18` cov Комментарий перед export → `dbc-ts-ast-adapter.test.ts::should find contract before export keyword`
- [x] `2026-05-15 01:18` cov Файл без контрактов → `dbc-ts-ast-adapter.test.ts::should return undefined contract when no JSDoc`
- [x] `2026-05-15 01:18` cov Битый файл → `dbc-ts-ast-adapter.test.ts::should return ok:false on syntax error`
- [x] `2026-05-15 01:18` cov Файл не найден → `dbc-ts-ast-adapter.test.ts::should return ok:false on missing file`
- [x] `2026-05-15 01:18` cov Re-export → `dbc-ts-ast-adapter.test.ts::should skip re-exports`
- [x] `2026-05-15 01:18` cov Сигнатура → `dbc-ts-ast-adapter.test.ts::should extract function signature correctly`
- [x] `2026-05-15 01:18` cov No throw → `dbc-ts-ast-adapter.test.ts::should never throw`
- [x] `2026-05-15 01:18` aud rules=2 ax=44 viol=0
- [x] `2026-05-15 01:20` sync dbc+root
- [x] `2026-05-15 01:20` DONE

### Round 3 — 2026-05-26, fix: detect implements clause on class declarations

| Phase | Kind | Status | Target Files                                    | Deps |
| ----- | ---- | ------ | ----------------------------------------------- | ---- |
| P1    | fix  | [x]    | dbc-ast-adapter.types.ts, dbc-ts-ast-adapter.ts | —    |
| P2    | test | [x]    | dbc-ts-linter.test.ts (K11)                     | —    |

- [x] 2026-05-26T13:00:00Z file dbc-ast-adapter.types.ts — DbcExportedEntity.implementsInterfaces
- [x] 2026-05-26T13:00:00Z file dbc-ts-ast-adapter.ts — \_hasImplements via class_heritage
- [x] 2026-05-26T13:00:00Z ver tsc --noEmit → pass
- [x] 2026-05-26T13:00:00Z ver node --import tsx --test → pass (116/116)
- [x] 2026-05-26T13:00:00Z DONE
