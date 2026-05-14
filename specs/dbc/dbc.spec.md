# dbc: Library Specification

## scope-type

library

## 1. Vision & Primary Goal

Фреймворк для работы с DBC-контрактами: парсинг, валидация и линтинг. Два модуля:
- **dbc-parser** — восстановление структурированной DBC-схемы из текстового контракта. Принимает сырой текст (JSDoc-подобный или чистый), разбирает в универсальную схему `DbcSchema`, возвращает диагностические ошибки на уровне каждой записи (`entries[*].issues`), если контракт нарушает внутренние правила формата.
- **dbc-linter** — проверка покрытия кодовых сущностей DBC-контрактами: обнаружение сущностей без контракта, валидация существующих контрактов через `dbc-parser`, проверка соответствия контракта сигнатуре кода, ESLint-совместимый отчёт, autofix исправимых ошибок.

## 2. Approved Golden DX Example

```ts
import { DbcJsDocParser } from './implementations/jsdoc/dbc-jsdoc-parser.ts';

// --- init: выбор реализации парсера ---
const parser = new DbcJsDocParser();

// --- happy path: валидный многострочный контракт ---
const result = parser.parse(`
/**
 * Retrieve a user record by id from the primary store.
 * @implements {UserRepository#retrieveUser} in ./user-repository.ts
 * @invariant Storage failure is preserved as cause-chain (not transformed).
 * @param {string} userId User identifier.
 * @returns {User} The retrieved user record.
 * @sideEffect Storage: SELECT from users by id.
 */
`);

result.format; // 'multi-line'
result.entries.map((e) => e.type);
// ['description', 'implements', 'invariant', 'param', 'returns', 'sideEffect']

// --- happy path: single-line inline-контракт ---
const inline = parser.parse('/** @purpose Loads user profile | @param {string} id User id */');

inline.format; // 'single-line'
inline.entries[0].type; // 'purpose'
inline.entries[0].inline[0].type; // 'param'

// --- error path: частично невалидный контракт — парсер не падает ---
const degraded = parser.parse(`
 @purpose Short.
 @see {OtherClass#method} in ./other.ts
 @param {string}
`);

degraded.entries[1].issues; // [{ code: 'ERR_DBC_PURPOSE_CONFLICT', line: 3 }]
degraded.entries[2].issues; // [{ code: 'ERR_DBC_ORDER', line: 4 }, { code: 'ERR_DBC_PARAM_NAME_MISSING', line: 4 }]
```

## 3. Requirements & Constraints

### 3.1 Functional Requirements

| ID    | Требование                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR-01 | `parse(inputContract: string): DbcSchema` — принять сырой текст контракта, вернуть нормализованную схему                                                              |
| FR-02 | Извлекать description-блок (текст до первого `@`) как запись `type: 'description'`                                                                                    |
| FR-03 | Основные теги контракта (value-формат): `@purpose`, `@invariant`, `@pre`, `@post`, `@sideEffect`, `@throws`, `@returns` — первое слово `type`, остаток строки `value` |
| FR-04 | `@param`: извлечь `{dataType}`, `[specifier]` (optional-флаг), `value`                                                                                                |
| FR-05 | `@see`: извлечь `{specifier}`, `value`. Вне порядка. Участвует в `ERR_DBC_PURPOSE_CONFLICT`                                                                           |
| FR-06 | `@implements {ContractName} in path`: `specifier` = `ContractName` из `{...}`, `value` = остаток. Порядок: первый                                                     |
| FR-07 | Прочие теги (включая `@consumer`, `@consumers`, `@author`, `@deprecated`…): общее правило `type + value`. Валидация контракта к ним не применяется                    |
| FR-08 | Многострочные значения: строки без нового тега джойнятся через `\n` к `value` предыдущей записи                                                                       |
| FR-09 | `ERR_DBC_ORDER`: порядок `implements → invariant → pre → param → throws → returns → post → sideEffect`                                                                |
| FR-10 | `ERR_DBC_PURPOSE_CONFLICT`: `@purpose` + `@see` в одном контракте                                                                                                     |
| FR-11 | `ERR_DBC_PARAM_NAME_MISSING`: `@param` без specifier                                                                                                                  |
| FR-12 | `ERR_DBC_SEE_FORMAT_INVALID`: `@see` без корректного `{specifier}`                                                                                                    |
| FR-13 | Каждая запись содержит `issues: DbcDbcEntryIssue[]` (пустой если нет нарушений)                                                                                       |
| FR-14 | `DbcSchema.format: 'single-line'                                                                                                                                      | 'multi-line'` — признак формы контракта |
| FR-15 | `DbcEntrySchema.inline?: DbcEntrySchema[]` — вложенные теги из `                                                                                                      | @<name>` в single-line режиме           |
| FR-16 | Парсер принимает любой строковой вход без падений (no throw)                                                                                                          |

### 3.2 Non-Functional Constraints

- **NFC-01**: Формат выхода стабилен — `DbcSchema` неизменен между реализациями
- **NFC-02**: Расширяемость — новая реализация добавляется без изменения ядра (`dbc-parser.types.ts`)
- **NFC-03**: Issue-коды — стабильные строковые константы
- **NFC-04**: Node.js 22+, TypeScript strict mode, zero runtime dependencies

### 3.3 Out-of-Scope

- Исполнение контракта (runtime enforcement)
- Интерпретация бизнес-смысла `value`
- Восстановление объектной иерархии параметров
- Автоматическая починка контракта
- Парсинг XML-подобных форматов документации
- Обнаружение/регистрация новых реализаций парсеров (deferred)

### 3.4 Runtime Backing & Deferred Scope

| Capability                                   | Posture                      |
| -------------------------------------------- | ---------------------------- |
| `DbcParser.parse()` — парсинг текста в схему | `real-runtime`               |
| Валидация контракта (4 issue-кода)           | `real-runtime`               |
| Обнаружение/регистрация новых реализаций     | `not-implemented` (deferred) |

### 3.5 Rules

| Rule               | Category | Source                                      |
| ------------------ | -------- | ------------------------------------------- |
| `typescript-rules` | coding   | `ai/directives/coding/typescript-rules.xml` |
| `node-test`        | testing  | `ai/directives/testing/node-test.xml`       |

## 4. Public API Surface

```ts
export type DbcSchemaFormat = 'single-line' | 'multi-line';

export type DbcSchema = {
  entries: DbcEntrySchema[];
  format: DbcSchemaFormat;
};

export type DbcEntrySchema = {
  type: string;
  specifier?: string;
  dataType?: string;
  optional?: boolean;
  value: string;
  issues: DbcDbcEntryIssue[];
  inline?: DbcEntrySchema[];
};

export type DbcDbcEntryIssue = {
  code: DbcIssueCode;
  line?: number;
};

export type DbcIssueCode =
  | typeof ERR_DBC_PURPOSE_CONFLICT
  | typeof ERR_DBC_ORDER
  | typeof ERR_DBC_PARAM_NAME_MISSING
  | typeof ERR_DBC_SEE_FORMAT_INVALID;

export const ERR_DBC_PURPOSE_CONFLICT = 'ERR_DBC_PURPOSE_CONFLICT';
export const ERR_DBC_ORDER = 'ERR_DBC_ORDER';
export const ERR_DBC_PARAM_NAME_MISSING = 'ERR_DBC_PARAM_NAME_MISSING';
export const ERR_DBC_SEE_FORMAT_INVALID = 'ERR_DBC_SEE_FORMAT_INVALID';

export interface DbcParser {
  parse(inputContract: string): DbcSchema;
}
```

## 5. Architecture

**Структура:**

```
services/dbc/parser/
├─ dbc-parser.types.ts          # Ядро: DbcParser, DbcSchema, DbcEntrySchema, DbcDbcEntryIssue, issue-коды
└─ implementations/
   └─ jsdoc/
      ├─ dbc-jsdoc-parser.ts    # class DbcJsDocParser implements DbcParser
      └─ __tests__/             # snapshot-тесты по 5 группам
```

**Ключевые паттерны:**

1. **Interface + Implementation** — `DbcParser` задаёт контракт, реализации в `implementations/*` его исполняют. Потребитель зависит от интерфейса, не от конкретного парсера.
2. **Two-pass design** — парсинг и валидация разделены. Pass 1: построчный разбор → `entries[]`. Pass 2: валидаторы по полному массиву. Мотивация: правила порядка и конфликтов требуют полного набора записей.
3. **Protected methods for extensibility** — `normalizeLine`, `parseTagLine`, `parseParamTag`, … — все `protected`. Подкласс может переопределить конкретный шаг (например, новый синтаксис `{type}`), не переписывая весь пайплайн.
4. **Types-only core** — `dbc-parser.types.ts` — zero runtime, только типы и константы. Реализации импортируют типы из ядра.

### 5.1 Rejected Alternatives

| Вариант                                                      | Почему отвергнут                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Single-pass валидация (во время парсинга)                    | `ERR_DBC_ORDER` и `ERR_DBC_PURPOSE_CONFLICT` требуют полного набора записей для проверки |
| Класс на каждый тип тега (`ParamTagParser`, `SeeTagParser`…) | YAGNI: один потребитель, одна реализация — абстракция без payoff                         |
| Plugin/repository-архитектура (автообнаружение реализаций)   | Deferred до появления второго consumer'а; сейчас достаточно явного импорта               |

## 6. Decision Log

### D-001 — scope-type = library

- **Status:** active
- **Recorded:** session Discovery, dbc
- **Why:** Модуль предоставляет интерфейс и реализации для парсинга; потребитель зависит от интерфейса. Это library, не product, не infrastructure, не contracts.
- **Risk accepted:** —
- **Rejected alternatives:** product (нет UX/CLI), infrastructure (не настраивает toolchain)

### D-002 — Обновлён CONTRACT_ORDER: `@implements` первый, `@consumer` исключён

- **Status:** active
- **Recorded:** session Discovery, dbc
- **Why:** `@consumers` вынесен на уровень файла в `typescript-rules.xml` (`AX_FILE_LEVEL_CONTEXT`); в entity-JSDoc опционален. `@implements` — новый обязательный тег для корня реализации (`AX_BASE_CONTRACT_SHAPE`).
- **Risk accepted:** Старые контракты с `@consumer` в середине порядка не получат `ERR_DBC_ORDER` — это ожидаемо, тег стал generic.
- **Rejected alternatives:** Сохранить `@consumer` в порядке — расходится с `typescript-rules.xml`.

### D-003 — `DbcSchema.format` — различать single-line и multi-line

- **Status:** active
- **Recorded:** session Discovery, dbc
- **Why:** Потребителю схемы нужно знать, был ли контракт в сжатой inline-форме. Это влияет на возможность однострочного представления в tooling.
- **Risk accepted:** —
- **Rejected alternatives:** Вычислять формат на стороне потребителя — дублирование логики.

### D-004 — `DbcEntrySchema.inline` — вложенные теги из ` | @<name>`

- **Status:** active
- **Recorded:** session Discovery, dbc
- **Why:** Single-line контракты с несколькими тегами (`/** @purpose X | @invariant Y */`) должны разбираться в отдельные записи. `inline` прикрепляет вложенные теги к первому.
- **Risk accepted:** —
- **Rejected alternatives:** Плоский массив без `inline` — теряется структурная связь «вложено в первый тег».

### D-006 — Декомпозиция: единый flat-модуль

- **Status:** active
- **Recorded:** session ModuleDecomposition, dbc
- **Why:** Скоуп маленький (2 source-файла), одна реализация. Flat-модуль минимизирует overhead спецификаций. При появлении второй реализации — refine-module.
- **Risk accepted:** При добавлении второй реализации потребуется pivot → refine-module для выделения core в отдельный модуль.
- **Rejected alternatives:** Два модуля (core + jsdoc-parser) — избыточно для v1; три модуля (core + validation + parser) — overengineered.

### D-005 — Two-pass design (parse then validate)

- **Status:** active
- **Recorded:** session Discovery, dbc
- **Why:** `ERR_DBC_ORDER` и `ERR_DBC_PURPOSE_CONFLICT` — cross-entry правила; требуют полного набора записей для проверки.
- **Risk accepted:** —
- **Rejected alternatives:** Single-pass — невозможно проверить порядок до прочтения всех записей.

## 7. Scope Dependencies

- **Depends on:** [`infra-base`](../infra-base/infra-base.spec.md) — TypeScript, node:test, prettier
- **Provides to:** потребители схемы `DbcSchema` (анализ, генерация, проверка, автодокументация, агентная обработка)

## 8. Bootstrap Requirements

| Requirement                                    | Kind       | Owner           | Resolution                                                                                                                                |
| ---------------------------------------------- | ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Создать `specs/dbc-parser/` директорию         | structural | this-scope-task | `mkdir -p specs/dbc-parser` ✅                                                                                                            |
| Написать `specs/dbc/dbc.spec.md`               | file       | this-scope-task | STEP_8 (этот файл)                                                                                                                        |
| Удалить старые спеки из `services/dbc/parser/` | file       | this-scope-task | удалить `README.md`, `dbc-parser.task.spec.md`, `implementations/jsdoc/README.md`, `implementations/jsdoc/dbc-jsdoc-parser.tests.spec.md` |

Все runtime-зависимости существуют: Node.js 22.19.0, `node:test`, `#logger`, файлы ядра и реализации.

## 9. Module Map (post-ModuleDecomposition)

Spec hierarchy is materialized at `specs/dbc/`. Module specs are at `specs/dbc/<module>/<module>.spec.md`.

### 9.1 Modules

- [dbc-parser](./dbc-parser/dbc-parser.spec.md) — Единый flat-модуль: Port `DbcParser`, Value Objects, Constants, Adapter `DbcJsDocParser`

### 9.2 Inter-Module Dependency Map

Единственный модуль в скоупе — межмодульных зависимостей нет.

### 9.3 Stack Dependencies

- Languages: TypeScript
- Test frameworks: node:test

### 9.4 Handoff to Task Scaffolding

- **Primary input:** `specs/dbc/dbc.spec.md` (this file).
- **Required directives:** `ai/directives/coding/typescript-rules.xml`, `ai/directives/testing/node-test.xml`
- **Open risks & validation needs:**
  - Реализация должна быть выровнена с обновлённой схемой (`format`, `inline`, `@implements`, новый `CONTRACT_ORDER`)
  - Snapshot-тесты должны быть обновлены под новую схему
  - Malformed `{datatype` (незакрытая скобка) — поведение не зафиксировано
