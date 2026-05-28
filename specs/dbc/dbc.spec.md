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

### 2.2 dbc-linter DX

```ts
import { DbcJsDocParser } from '../parser/implementations/jsdoc/dbc-jsdoc-parser';
import { DbcTsAstAdapter } from './implementations/ts/dbc-ts-ast-adapter';
import { DbcTsLinter } from './implementations/ts/dbc-ts-linter';

// --- init: явный injection ---
const dbcLinter = new DbcTsLinter(new DbcJsDocParser(), new DbcTsAstAdapter());

// --- happy path: все контракты на месте и валидны ---
const result = await dbcLinter.lint('./fixtures/happy/user.service.ts');
result.errors; // []

// --- ошибки: отсутствующие контракты + невалидные + несоответствие сигнатуре ---
const report = await dbcLinter.lint('./fixtures/errors/payment.service.ts');
report.errors.map((e) => e.code);
// ['ERR_DBC_LINT_MISSING_CONTRACT', 'ERR_DBC_LINT_PARAM_EXTRA', ...]

// ESLint-формат:
console.log(report.format());
// /fixtures/errors/payment.service.ts:5:1: error: ERR_DBC_LINT_MISSING_CONTRACT ...

// --- autofix: исправляем что можно, получаем остаток ---
const unfixed = await dbcLinter.lintAndFix('./fixtures/errors/payment.service.ts');
unfixed.autoFixed; // 5 — столько ошибок исправлено
unfixed.errors.map((e) => e.code);
// ['ERR_DBC_LINT_MISSING_CONTRACT', 'ERR_DBC_LINT_PARAM_MISSING', ...]

// --- передача контента (без чтения файла) ---
const content = readFileSync('./fixtures/happy/user.service.ts', 'utf-8');
const result = await dbcLinter.lint('./fixtures/happy/user.service.ts', { content });
result.errors; // [] — контент передан, файл не читается повторно

// --- крайние случаи ---
const empty = await dbcLinter.lint('./fixtures/empty.ts');
empty.errors; // [] — нет экспортов → нет ошибок
const broken = await dbcLinter.lint('./fixtures/errors/malformed.ts');
broken.errors[0].code; // 'ERR_DBC_LINT_PARSE_FAILED'
```

## 3. Requirements & Constraints

### 3.1 Functional Requirements

| ID    | Требование                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR-01 | `parse(inputContract: string): DbcSchema` — принять сырой текст контракта, вернуть нормализованную схему                                                                                                                                                                                                                                                                                              |
| FR-02 | Извлекать description-блок (текст до первого `@`) как запись `type: 'description'`                                                                                                                                                                                                                                                                                                                    |
| FR-03 | Основные теги контракта (value-формат): `@purpose`, `@invariant`, `@pre`, `@post`, `@sideEffect`, `@throws`, `@returns` — первое слово `type`, остаток строки `value`                                                                                                                                                                                                                                 |
| FR-04 | `@param`: извлечь `{dataType}`, `[specifier]` (optional-флаг), `value`                                                                                                                                                                                                                                                                                                                                |
| FR-05 | `@see`: извлечь `{specifier}`, `value`. Вне порядка. Участвует в `ERR_DBC_PURPOSE_CONFLICT`                                                                                                                                                                                                                                                                                                           |
| FR-06 | `@implements {ContractName} in path`: `specifier` = `ContractName` из `{...}`, `value` = остаток. Порядок: первый                                                                                                                                                                                                                                                                                     |
| FR-07 | Прочие теги (включая `@consumer`, `@consumers`, `@author`, `@deprecated`…): общее правило `type + value`. Валидация контракта к ним не применяется                                                                                                                                                                                                                                                    |
| FR-08 | Многострочные значения: строки без нового тега джойнятся через `\n` к `value` предыдущей записи                                                                                                                                                                                                                                                                                                       |
| FR-09 | `ERR_DBC_ORDER`: порядок `implements → invariant → pre → param → throws → returns → post → sideEffect`                                                                                                                                                                                                                                                                                                |
| FR-10 | `ERR_DBC_PURPOSE_CONFLICT`: `@purpose` + `@see` в одном контракте                                                                                                                                                                                                                                                                                                                                     |
| FR-11 | `ERR_DBC_PARAM_NAME_MISSING`: `@param` без specifier                                                                                                                                                                                                                                                                                                                                                  |
| FR-12 | `ERR_DBC_SEE_FORMAT_INVALID`: `@see` без корректного `{specifier}`                                                                                                                                                                                                                                                                                                                                    |
| FR-13 | Каждая запись содержит `issues: DbcDbcEntryIssue[]` (пустой если нет нарушений)                                                                                                                                                                                                                                                                                                                       |
| FR-14 | `DbcSchema.format: 'single-line'                                                                                                                                                                                                                                                                                                                                                                      | 'multi-line'` — признак формы контракта |
| FR-15 | `DbcEntrySchema.inline?: DbcEntrySchema[]` — вложенные теги из `                                                                                                                                                                                                                                                                                                                                      | @<name>` в single-line режиме           |
| FR-16 | Парсер принимает любой строковой вход без падений (no throw)                                                                                                                                                                                                                                                                                                                                          |
| FR-17 | `lint(filePath: string, options?: LintOptions): Promise<DbcLintReport>` и `lintAndFix(filePath: string, options?: LintOptions): Promise<DbcLintFixReport>` — принять путь к файлу (обязательный, используется в сообщениях об ошибках) и опционально контент через `options.content`. Если `content` передан — использовать его; иначе читать из файла                                                |
| FR-18 | tree-sitter с TS-грамматикой парсит файл. Невалидный синтаксис → одна ошибка `ERR_DBC_LINT_PARSE_FAILED`                                                                                                                                                                                                                                                                                              |
| FR-19 | Извлечь все экспортируемые сущности: `const`, `function`, `class`, `interface`, `type`, `enum`, `export default`. Re-export (`export { x } from`) — пропустить                                                                                                                                                                                                                                        |
| FR-20 | Члены класса (все, включая `private`): поля, методы, геттеры, сеттеры, constructor. Члены interface: сигнатуры, свойства. Члены enum: варианты                                                                                                                                                                                                                                                        |
| FR-21 | Комментарий-контракт: `/** ... */` непосредственно перед узлом (включая случай «комментарий → export → узел»). `/*` без `**` — не контракт                                                                                                                                                                                                                                                            |
| FR-22 | Нет комментария → `ERR_DBC_LINT_MISSING_CONTRACT`                                                                                                                                                                                                                                                                                                                                                     |
| FR-23 | Комментарий есть → `DbcParser.parse()` → `issues` транслируются в ошибки линтера с исходными кодами (`ERR_DBC_ORDER`, `ERR_DBC_PURPOSE_CONFLICT`, `ERR_DBC_PARAM_NAME_MISSING`, `ERR_DBC_SEE_FORMAT_INVALID`)                                                                                                                                                                                         |
| FR-24 | Соответствие контракта сигнатуре кода — см. матрицу проверок ниже                                                                                                                                                                                                                                                                                                                                     |
| FR-25 | Отчёт в ESLint-формате: `file:line:col: severity: code: message`. Все ошибки — `severity: error`                                                                                                                                                                                                                                                                                                      |
| FR-26 | Autofix: мутирует файл, исправляя ошибки из таблицы. Цепочка шагов: `expandToMultiline` → `removeRedundantInImplements` → `removeRedundantTypes` → `normalizeParamBrackets` → `removeExtraParams` → `removeUnexpectedReturns` → `reorderParams` → `reorderTags` → `normalizeMultiLine`. Каждый шаг — чистая функция `(text, context) → text`. Идемпотентность: повторный autofix не меняет результат. |
| FR-27 | Пустой или без экспортов файл → пустой отчёт                                                                                                                                                                                                                                                                                                                                                          |
| FR-28 | Для типизированного языка `{dataType}` в тегах `@param` и `@returns` — ошибка `ERR_DBC_LINT_TYPE_REDUNDANT`                                                                                                                                                                                                                                                                                           |
| FR-29 | Fixture-покрытие: каждый случай линтинга покрыт отдельным fixture-файлом                                                                                                                                                                                                                                                                                                                              |

**Матрица проверок FR-24 (соответствие контракта сигнатуре):**

| Сущность                                                             | @param                                                                                       | @returns                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| function / method (не constructor)                                   | Каждый параметр сигнатуры ↔ `@param`. Порядок `@param`-ов должен совпадать с сигнатурой      | `void` → `@returns` отсутствует. Не `void` → `@returns` присутствует |
| method (внутри `class implements Interface` + `@see` в контракте)    | отсутствуют (redundant — описаны в интерфейсе). `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` | отсутствует                                                          |
| method с `override` (TS 4.3+)                                        | как обычный method                                                                           | как обычный method                                                   |
| constructor                                                          | Как method, но для деструктурированных параметров — сравнение по позиции (`arg0`, `arg1`…)   | не проверяется                                                       |
| getter                                                               | отсутствуют                                                                                  | присутствует                                                         |
| setter                                                               | ровно один                                                                                   | отсутствует                                                          |
| field / property                                                     | отсутствуют                                                                                  | отсутствует                                                          |
| const / enum / enum member / interface (сам)                         | отсутствуют                                                                                  | отсутствует                                                          |
| type alias (объектный литерал) / interface property (function-typed) | как function                                                                                 | как function                                                         |
| interface method sig                                                 | как function                                                                                 | как function                                                         |

**Параметры:**

- Именованный: `@param {type} name` ↔ `name: type`
- Optional: `x?: string` → `@param [x]`
- Rest: `...args: string[]` → `@param ...args`
- Деструктуризация: не поддерживается, параметр именуется по позиции: `@param arg0`, `arg1`…
- Overloads: не поддерживаются (v2)
- **Implements-методы:** метод в классе с `implements Interface` + контракт `@see {Interface#method}` → `@param`/`@returns` избыточны (redundant). Автофикс удаляет их. Без `@see` — обрабатывается как обычный метод.
- **Форматы контрактов:**
  - Multi-line (`/** … */` с `\n`) — основной формат для функций, методов, конструкторов
  - Pipe (`/** @purpose X | @param y … */`) — разрешён только для невызываемых сущностей (field, const, type, enum, getter, setter, interface-property), ≤3 тегов. При >3 тегах autofix разворачивает в multi-line.
  - Autofix **никогда** не сворачивает multi-line в pipe.

**Коды ошибок линтера:**

| Код                                          | Условие                                                   | Autofix                     |
| -------------------------------------------- | --------------------------------------------------------- | --------------------------- |
| `ERR_DBC_LINT_MISSING_CONTRACT`              | сущность без JSDoc                                        | —                           |
| `ERR_DBC_LINT_PARSE_FAILED`                  | файл сломан синтаксически                                 | —                           |
| `ERR_DBC_LINT_PARAM_MISSING`                 | параметр в сигнатуре, нет в контракте                     | —                           |
| `ERR_DBC_LINT_PARAM_EXTRA`                   | `@param` в контракте, нет в сигнатуре                     | удалить                     |
| `ERR_DBC_LINT_PARAM_ORDER`                   | порядок `@param` ≠ сигнатура                              | пересортировать             |
| `ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH`       | опциональность `@param` ≠ сигнатуре (скобки)              | добавить/убрать `[]`        |
| `ERR_DBC_LINT_RETURNS_MISSING`               | не-void без `@returns`                                    | —                           |
| `ERR_DBC_LINT_RETURNS_UNEXPECTED`            | `@returns` где не нужен                                   | удалить                     |
| `ERR_DBC_LINT_TYPE_REDUNDANT`                | `{type}` в `@param`/`@returns`                            | удалить `{type}`            |
| `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` | `@param`/`@returns` в методе `implements`-класса с `@see` | удалить `@param`/`@returns` |

### 3.2 Non-Functional Constraints

- **NFC-01**: Формат выхода стабилен — `DbcSchema` неизменен между реализациями
- **NFC-02**: Расширяемость — новая реализация добавляется без изменения ядра (`dbc-parser.types.ts`)
- **NFC-03**: Issue-коды — стабильные строковые константы
- **NFC-04**: Node.js 22+, TypeScript strict mode, zero runtime dependencies кроме `tree-sitter` (native prebuilt)
- **NFC-05**: `LintOptions.strategy: 'full'` (v1); `'diff'` зарезервирован. `LintOptions.content` — опциональный, позволяет передать предварительно прочитанный контент
- **NFC-06**: Точка расширения под языки: интерфейс `DbcAstAdapter` (tree-sitter grammar + query + маппинг комментарий→узел). v1: `DbcTsAstAdapter`
- **NFC-07**: Типы и константы линтера зависят от `dbc-parser.types.ts`, не дублируют
- **NFC-08**: `//` и `#` комментарии-контракты не поддерживаются (v2)

### 3.3 Out-of-Scope

- Исполнение контракта (runtime enforcement)
- Интерпретация бизнес-смысла `value`
- Восстановление объектной иерархии параметров
- Автоматическая починка контракта
- Парсинг XML-подобных форматов документации
- Обнаружение/регистрация новых реализаций парсеров (deferred)
- Diff-стратегия линтинга (`strategy: 'diff'`) — deferred до v2
- Language-адаптеры кроме TypeScript — deferred
- Авто-регистрация `DbcAstAdapter` — deferred
- Генерация отсутствующего контракта
- Проверка соответствия значения контракта сигнатуре (например, `@param {string} x` vs `x: number` в коде)
- Overloads
- Не-TS форматы комментариев (`//`, `#`)

### 3.4 Runtime Backing & Deferred Scope

| Capability                                   | Posture                      |
| -------------------------------------------- | ---------------------------- |
| `DbcParser.parse()` — парсинг текста в схему | `real-runtime`               |
| Валидация контракта (4 issue-кода)           | `real-runtime`               |
| Обнаружение/регистрация новых реализаций     | `not-implemented` (deferred) |
| AST-обход (tree-sitter + TS)                 | `real-runtime`               |
| Маппинг JSDoc → сущности                     | `real-runtime`               |
| Валидация контрактов (`DbcParser`)           | `real-runtime`               |
| Соответствие контракта сигнатуре             | `real-runtime`               |
| ESLint-отчёт                                 | `real-runtime`               |
| Autofix (мутация файла)                      | `real-runtime`               |
| Diff-стратегия                               | `not-implemented` (deferred) |
| Language-адаптеры кроме TypeScript           | `not-implemented` (deferred) |
| Авто-регистрация `DbcAstAdapter`             | `not-implemented` (deferred) |

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

// --- dbc-linter types ---

export interface DbcAstAdapter {
  parseFile(filePath: string, content?: string): Promise<ParseResult>;
}

export type ParseResult = { ok: true; exported: ExportedEntity[] } | { ok: false; error: string };

export interface ExportedEntity {
  name: string;
  kind: 'const' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'export-default';
  members: Member[];
  contract?: { text: string; startLine: number; startCol: number };
  signature: SignatureInfo;
}

export interface Member {
  name: string;
  kind:
    | 'field'
    | 'method'
    | 'getter'
    | 'setter'
    | 'constructor'
    | 'interface-method'
    | 'interface-property'
    | 'enum-member';
  contract?: { text: string; startLine: number; startCol: number };
  signature: SignatureInfo;
}

export interface SignatureInfo {
  params: ParamInfo[];
  returnType: string;
}

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
  isRest: boolean;
}

export interface DbcLinter {
  lint(filePath: string, options?: LintOptions): Promise<DbcLintReport>;
  lintAndFix(filePath: string, options?: LintOptions): Promise<DbcLintFixReport>;
}

export type LintOptions = {
  /** @purpose Linting strategy — only 'full' is supported in v1 */
  strategy?: 'full';
  /** @purpose Pre-read file content. When passed, use this instead of reading from disk. filePath still required — used in error messages. */
  content?: string;
};

export interface DbcLintReport {
  errors: DbcLintError[];
  format(): string;
}

export interface DbcLintFixReport {
  errors: DbcLintError[];
  autoFixed: number;
  format(): string;
}

export interface DbcLintError {
  file: string;
  line: number;
  col: number;
  severity: 'error';
  code: DbcLintIssueCode | DbcIssueCode;
  message: string;
}

export type DbcLintIssueCode =
  | typeof ERR_DBC_LINT_MISSING_CONTRACT
  | typeof ERR_DBC_LINT_PARSE_FAILED
  | typeof ERR_DBC_LINT_PARAM_MISSING
  | typeof ERR_DBC_LINT_PARAM_EXTRA
  | typeof ERR_DBC_LINT_PARAM_ORDER
  | typeof ERR_DBC_LINT_RETURNS_MISSING
  | typeof ERR_DBC_LINT_RETURNS_UNEXPECTED
  | typeof ERR_DBC_LINT_TYPE_REDUNDANT;

export const ERR_DBC_LINT_MISSING_CONTRACT = 'ERR_DBC_LINT_MISSING_CONTRACT';
export const ERR_DBC_LINT_PARSE_FAILED = 'ERR_DBC_LINT_PARSE_FAILED';
export const ERR_DBC_LINT_PARAM_MISSING = 'ERR_DBC_LINT_PARAM_MISSING';
export const ERR_DBC_LINT_PARAM_EXTRA = 'ERR_DBC_LINT_PARAM_EXTRA';
export const ERR_DBC_LINT_PARAM_ORDER = 'ERR_DBC_LINT_PARAM_ORDER';
export const ERR_DBC_LINT_RETURNS_MISSING = 'ERR_DBC_LINT_RETURNS_MISSING';
export const ERR_DBC_LINT_RETURNS_UNEXPECTED = 'ERR_DBC_LINT_RETURNS_UNEXPECTED';
export const ERR_DBC_LINT_TYPE_REDUNDANT = 'ERR_DBC_LINT_TYPE_REDUNDANT';
```

## 5. Architecture

**Структура:**

```
services/dbc/
├── parser/                              # dbc-parser (существующий)
│   ├── dbc-parser.types.ts              # Ядро: DbcParser, DbcSchema, DbcEntrySchema, DbcDbcEntryIssue, issue-коды
│   └── implementations/
│       └── jsdoc/
│           ├── dbc-jsdoc-parser.ts      # class DbcJsDocParser implements DbcParser
│           └── __tests__/               # snapshot-тесты по 5 группам
│
└── linter/                              # dbc-linter (новый модуль)
    ├── dbc-linter.types.ts              # Port DbcLinter + VO: DbcLintReport, DbcLintError, константы
    ├── dbc-ast-adapter.types.ts         # Port DbcAstAdapter (точка расширения под язык)
    └── implementations/
        └── ts/
            ├── dbc-ts-linter.ts         # Adapter: class DbcTsLinter implements DbcLinter
            ├── dbc-ts-ast-adapter.ts    # Adapter: class DbcTsAstAdapter implements DbcAstAdapter
            └── __tests__/
                ├── dbc-ts-linter.test.ts
                └── fixtures/            # по fixture на каждый случай
```

**Ключевые паттерны:**

**dbc-parser:**

1. **Interface + Implementation** — `DbcParser` задаёт контракт, реализации в `implementations/*` его исполняют. Потребитель зависит от интерфейса, не от конкретного парсера.
2. **Two-pass design** — парсинг и валидация разделены. Pass 1: построчный разбор → `entries[]`. Pass 2: валидаторы по полному массиву. Мотивация: правила порядка и конфликтов требуют полного набора записей.
3. **Protected methods for extensibility** — `normalizeLine`, `parseTagLine`, `parseParamTag`, … — все `protected`. Подкласс может переопределить конкретный шаг.
4. **Types-only core** — `dbc-parser.types.ts` — zero runtime, только типы и константы.

**dbc-linter:** 5. **Port + Adapter** — `DbcLinter` / `DbcTsLinter`, `DbcAstAdapter` / `DbcTsAstAdapter`. Потребитель зависит от порта. 6. **Explicit injection** — `DbcTsLinter` получает `DbcParser` и `DbcAstAdapter` через конструктор, не инстанцирует сам. 7. **Autofix как цепочка текстовых трансформаций** — каждая `(source: string) → string`. Не мутирует AST. 8. **Dry-run для multi-line → inline** — конвертируем, прогоняем `DbcParser.parse()`, проверяем отсутствие новых ошибок.

### 5.1 Rejected Alternatives

| Вариант                                                      | Почему отвергнут                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single-pass валидация (во время парсинга)                    | `ERR_DBC_ORDER` и `ERR_DBC_PURPOSE_CONFLICT` требуют полного набора записей для проверки                                                                                        |
| Класс на каждый тип тега (`ParamTagParser`, `SeeTagParser`…) | YAGNI: один потребитель, одна реализация — абстракция без payoff                                                                                                                |
| Plugin/repository-архитектура (автообнаружение реализаций)   | Deferred до появления второго consumer'а; сейчас достаточно явного импорта                                                                                                      |
| TypeScript Compiler API вместо tree-sitter                   | tree-sitter даёт инкрементальный парсинг (задел под v2 diff) + единый API для всех языков. TS Compiler API — только TS, тянет компилятор целиком, нет инкрементального парсинга |
| AST-мутация вместо текстовых трансформаций для autofix       | Избыточно: autofix меняет порядок строк и удаляет куски текста, не структуру кода. Текстовые замены проще и не ломают форматирование                                            |
| Фабрика `createDbcLinter()` вместо явного injection          | Явный injection удобнее для тестирования (подмена адаптеров) и не прячет зависимости                                                                                            |

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

### D-007 — Новый модуль dbc-linter

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** Добавление второго модуля в скоуп — линтер, проверяющий покрытие кодовых сущностей DBC-контрактами. Скоуп перестаёт быть single-module (D-006); требуется refine-module для регистрации нового модуля.
- **Risk accepted:** D-006 предсказывал refine-module при появлении второй реализации парсера, а не нового модуля. Парсер остаётся flat-модулем; второй flat-модуль (linter) добавляется параллельно.
- **Rejected alternatives:** Выделить ядро в отдельный модуль — пока не нужно (парсер — один файл с типами, linter — свои типы).

### D-008 — tree-sitter как AST-адаптер

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** tree-sitter даёт инкрементальный парсинг (задел под diff-стратегию v2), единый API для 200+ языков, prebuilt нативные биндинги без WASM. Комментарии связываются с узлами через эвристику позиций (комментарий непосредственно перед сущностью — стандарт для JSDoc).
- **Risk accepted:** Связь комментарий–узел через позицию — эвристика, не прямая как в TS Compiler API. Mitigation: JSDoc всегда непосредственно перед документированной сущностью — это стандарт языка.
- **Rejected alternatives:** TypeScript Compiler API (только TS, тянет весь компилятор, нет инкрементального парсинга).

### D-009 — Валидация соответствия контракта сигнатуре (новый слой)

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** Линтер не только проверяет наличие и синтаксис контракта, но и сверяет `@param` / `@returns` с реальной сигнатурой кода. Это ключевая ценность: контракт, не соответствующий коду, — ложь.
- **Risk accepted:** Деструктуризация и overloads не поддерживаются в v1 — часть контрактов может пройти без проверки сигнатуры.
- **Rejected alternatives:** Только синтаксическая валидация без сверки с кодом — линтер не отличает актуальный контракт от устаревшего.

### D-010 — Autofix через текстовые трансформации

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** Autofix-ошибки исправляются текстовыми заменами в исходном файле. Цепочка: `expandToMultiline` → `removeRedundantInImplements` → `removeRedundantTypes` → `normalizeParamBrackets` → `removeExtraParams` → `removeUnexpectedReturns` → `reorderParams` → `reorderTags` → `normalizeMultiLine`. Каждый шаг — чистая функция `(text, context) → text`. AST-мутации избыточны.
- **Pipe-формат:** разрешён для невызываемых сущностей (field, const, type, enum, getter, setter) с ≤3 тегами. Вызываемые (function, method, constructor) и >3 тега — autofix разворачивает в multi-line. Autofix никогда не сворачивает multi-line в pipe.
- **Верификация:** 20 снапшот-тестов (fixture → autofix → expected, побайтовое сравнение + идемпотентность).
- **Risk accepted:** Текстовые замены могут быть хрупкими при нестандартном форматировании JSDoc.
- **Rejected alternatives:** AST-мутации (сложнее, риск сломать код); перезапись через `typescript` printer (тянет компилятор).

### D-011 — Явный injection зависимостей в DbcLinter

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** `DbcTsLinter` получает `DbcParser` и `DbcAstAdapter` через конструктор. Упрощает тестирование (подмена адаптеров) и не прячет зависимости за фабрикой.
- **Risk accepted:** Потребитель должен знать о конкретных адаптерах. Для CLI это приемлемо — точка входа одна.
- **Rejected alternatives:** Фабрика `createDbcLinter()` — прячет зависимости, усложняет тестирование.

### D-012 — Без `{dataType}` в контрактах для типизированных языков

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** В TypeScript тип уже объявлен в сигнатуре. `{type}` в `@param` и `@returns` избыточен и ведёт к расхождению. Линтер детектит как ошибку, autofix удаляет.
- **Risk accepted:** В нетипизированных языках (JS без аннотаций) `{type}` может быть нужен — поведение будет зависеть от `DbcAstAdapter` в v2.
- **Rejected alternatives:** Оставить `{type}` опциональным — дублирование типов ведёт к дрейфу контракта от кода.

### D-013 — Refine-module: добавление dbc-linter

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** Скоуп расширяется вторым flat-модулем. Module decomposition зарегистрирует `dbc-linter` как самостоятельный модуль с собственным Port, Adapter, Value Objects.
- **Risk accepted:** Оба модуля flat. При появлении третьего может потребоваться выделение общих типов в core-модуль.
- **Rejected alternatives:** Сделать linter частью parser-модуля — разные зоны ответственности (парсинг контракта vs анализ покрытия).

### D-015 — Multi-line → inline: только однотеговые контракты

- **Status:** active
- **Recorded:** session Discovery, dbc, refine (post-execution fix)
- **Why:** `_inlineIfSafe` сжимал любые multi-line контракты, включая многотеговые с `@implements` + `@invariant`. Результат — нечитаемая строка. Исправлено: сжатие только если в контракте один тег (например только `@purpose`). 2+ тега → остаётся multi-line.
- **Risk accepted:** Однотеговые multi-line (например `@purpose` с длинным описанием на несколько строк) по-прежнему сжимаются.
- **Rejected alternatives:** Полное удаление `inlineIfSafe` — теряем полезное сжатие простых контрактов.

### D-014 — Опция `content` в `DbcLinter`

- **Status:** active
- **Recorded:** session Discovery, dbc, refine
- **Why:** Потребитель (`cli lint-command`) читает файл один раз и передаёт контент в несколько проверок. Без опции `content` линтер читает файл повторно — двойное чтение. `filePath` остаётся обязательным (используется в сообщениях об ошибках).
- **Risk accepted:** Обратная совместимость: вызов без `content` — поведение как сейчас (чтение из файла).
- **Rejected alternatives:** Убрать `filePath` и оставить только `content` — ломает всех существующих потребителей. Сделать `filePath` опциональным — усложняет сигнатуру без выигрыша.

## 7. Scope Dependencies

- **Depends on:** [`infra-base`](../infra-base/infra-base.spec.md) — TypeScript, node:test, prettier
- **Provides to:** потребители схемы `DbcSchema` (анализ, генерация, проверка, автодокументация, агентная обработка), CLI-команда `gennady lint` (через `cli` scope), CLI-команда `dbc lint` (линтер как CLI-инструмент)

## 8. Bootstrap Requirements

| Requirement                                              | Kind       | Owner           | Resolution                                                                                                                                                                                          |
| -------------------------------------------------------- | ---------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Создать `specs/dbc-parser/` директорию                   | structural | this-scope-task | `mkdir -p specs/dbc-parser` ✅                                                                                                                                                                      |
| Написать `specs/dbc/dbc.spec.md`                         | file       | this-scope-task | STEP_8 (этот файл)                                                                                                                                                                                  |
| Удалить старые спеки из `services/dbc/parser/`           | file       | this-scope-task | удалить `README.md`, `dbc-parser.task.spec.md`, `implementations/jsdoc/README.md`, `implementations/jsdoc/dbc-jsdoc-parser.tests.spec.md`                                                           |
| `tree-sitter` npm-пакет                                  | package    | this-scope-task | `npm install --save-dev tree-sitter@^0.22`                                                                                                                                                          |
| `tree-sitter-typescript` npm-пакет                       | package    | this-scope-task | `npm install --save-dev tree-sitter-typescript@^0.23`                                                                                                                                               |
| Пометить `tree-sitter` как external в Vite               | file       | this-scope-task | обновить `vite.config.ts` — добавить `tree-sitter` в `ssr.external` / `build.rollupOptions.external`                                                                                                |
| Создать `services/dbc/linter/`                           | structural | this-scope-task | `mkdir -p services/dbc/linter/implementations/ts/__tests__/fixtures`                                                                                                                                |
| Добавить `content` в `DbcLinter.lint()` и `lintAndFix()` | feature    | this-scope-task | обновить `DbcTsLinter`: если `options.content` передан — использовать его; иначе `fs.readFileSync(filePath)`. Обновить типы в `dbc-linter.types.ts`: добавить `content?: string` в `DbcLintOptions` |

Все runtime-зависимости существуют: Node.js 22.19.0, `node:test`, `#logger`, файлы ядра и реализации парсера.

## 9. Module Map (post-ModuleDecomposition)

Spec hierarchy is materialized at `specs/dbc/`. Module specs are at `specs/dbc/<module>/<module>.spec.md`.

### 9.1 Modules

- [dbc-parser](./dbc-parser/dbc-parser.spec.md) — Единый flat-модуль: Port `DbcParser`, Value Objects, Constants, Adapter `DbcJsDocParser`
- [dbc-linter](./dbc-linter/dbc-linter.spec.md) — Проверка покрытия кода DBC-контрактами: Port `DbcLinter`, Port `DbcAstAdapter`, Adapter `DbcTsLinter`, Adapter `DbcTsAstAdapter`, Service `DbcContractMatchValidator`, Value Objects, Constants

### 9.2 Inter-Module Dependency Map

```
dbc-parser ◄── dbc-linter (потребляет DbcParser + типы)
```

### 9.3 Stack Dependencies

- Languages: TypeScript
- Test frameworks: node:test
- Runtime: tree-sitter (native prebuilt)

### 9.4 Handoff to Task Scaffolding

- **Primary input:** `specs/dbc/dbc.spec.md` (this file).
- **Required directives:** `ai/directives/coding/typescript-rules.xml`, `ai/directives/testing/node-test.xml`
- **Areas requiring decomposition via module-decomposition:** None (оба модуля имеют спеки)
- **Named abstractions:** `DbcLinter`, `DbcAstAdapter`, `DbcTsLinter`, `DbcTsAstAdapter`, `DbcLintReport`, `DbcLintFixReport`, `DbcLintError`, 8 lint issue-кодов
- **Open risks & validation needs:**
  - Реализация парсера должна быть выровнена с обновлённой схемой (`format`, `inline`, `@implements`, новый `CONTRACT_ORDER`)
  - Snapshot-тесты парсера должны быть обновлены под новую схему
  - Malformed `{datatype` (незакрытая скобка) — поведение не зафиксировано
  - `tree-sitter` + Vite: нативные биндинги должны быть помечены как external
  - Связь комментарий→узел через позицию в tree-sitter — эвристика, требует fixture-покрытия
  - Каждый случай линтинга требует fixture-файла (FR-29)
