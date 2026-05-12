# `dbc/parser/implementations/jsdoc`

JSDoc-based parser implementation for `dbc/parser`.

`DbcJsDocParser` принимает контракт в JSDoc-подобном текстовом формате и восстанавливает из него универсальную `DbcSchema`. Это reference implementation для первого поддерживаемого синтаксиса в `dbc/parser`.

## Purpose

Назначение этой реализации: читать JSDoc-подобный контракт как входной транспорт и преобразовывать его в структурированный DBC-результат.

Парсер решает две задачи одновременно:

- восстанавливает схему контракта из текста
- сообщает о нарушениях DBC-правил через `entries[*].issues`

## Features

- Поддержка сырого JSDoc-блока `/** ... */`
- Поддержка уже очищенного текста без `*`
- Поддержка многострочных значений
- Нормализация в универсальный `DbcSchema`
- Валидация ключевых DBC-правил
- Сохранение полезных данных даже при невалидном контракте

## API

Источник реализации: [services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts](services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts)

```ts
export class DbcJsDocParser implements DbcParser {
  parse(inputContract: string): DbcSchema;
}
```

### Input

`parse()` ожидает строку с контрактом, например:

```text
/**
 * Creates cache entry.
 * @consumer CacheLayer
 * @param {string} key Cache key.
 * @returns {boolean} True if entry was created.
 */
```

или:

```text
@consumer CacheLayer
@param {string} key Cache key.
@returns {boolean} True if entry was created.
```

### Output

Результат всегда имеет форму:

```ts
{
  entries: DbcEntrySchema[],
}
```

## Supported Tags

Реализация поддерживает специальные DBC-теги:

- `@purpose`
- `@consumer`
- `@invariant`
- `@pre`
- `@param`
- `@throws`
- `@returns`
- `@post`
- `@sideEffect`
- `@see`
- `@description`

Также любые прочие теги сохраняются как обычные записи с `type` и `value`.

## Tag Mapping

### Plain tags

Теги вида:

```text
@consumer SomeConsumer
@pre Cache must be initialized.
@post Result must be persisted.
```

превращаются в:

```ts
{ type: 'consumer', value: 'SomeConsumer' }
{ type: 'pre', value: 'Cache must be initialized.' }
{ type: 'post', value: 'Result must be persisted.' }
```

У каждой записи дополнительно есть поле `issues: DbcDbcEntryIssue[]`.

### `@param`

Формат:

```text
@param {dataType} specifier value
@param {dataType} [specifier] value
```

Результат:

```ts
{
  type: 'param',
  dataType?: string,
  specifier?: string,
  optional?: boolean,
  value: string,
  issues: DbcDbcEntryIssue[],
}
```

### `@returns` and `@throws`

Формат:

```text
@returns {dataType} value
@throws {dataType} value
```

Результат:

- `type` содержит `returns` или `throws`
- `dataType` заполняется, если указан тип
- `value` содержит текстовое описание

### `@see`

Формат:

```text
@see {specifier} value
```

Результат:

```ts
{
  type: 'see',
  specifier?: string,
  value: string,
  issues: DbcDbcEntryIssue[],
}
```

### `description`

Текст до первого тега автоматически становится записью:

```ts
{ type: 'description', value: string, issues: DbcDbcEntryIssue[] }
```

Явный `@description` также маппится в `description`.

## Validation Rules

`DbcJsDocParser` валидирует следующие правила:

- `ERR_DBC_PURPOSE_CONFLICT`
  Нельзя использовать `@purpose` и `@see` одновременно.
- `ERR_DBC_ORDER`
  Контрактные теги должны идти в порядке `consumer -> invariant -> pre -> param -> throws -> returns -> post -> sideEffect`.
- `ERR_DBC_PARAM_NAME_MISSING`
  У `@param` должен быть `specifier`.
- `ERR_DBC_SEE_FORMAT_INVALID`
  У `@see` должен быть корректный `{specifier}`.

## Examples

### Valid Contract

```ts
const parser = new DbcJsDocParser();

const result = parser.parse(`
/**
 * Synchronizes local cache.
 * @consumer SyncWorker
 * @param {string} cacheKey Unique cache identifier.
 * @param {object} [options] Optional execution flags.
 * @returns {boolean} True on success.
 */
`);
```

```ts
{
  entries: [
    { type: 'description', value: 'Synchronizes local cache.', issues: [] },
    { type: 'consumer', value: 'SyncWorker', issues: [] },
    {
      type: 'param',
      dataType: 'string',
      specifier: 'cacheKey',
      value: 'Unique cache identifier.',
      issues: [],
    },
    {
      type: 'param',
      dataType: 'object',
      specifier: 'options',
      optional: true,
      value: 'Optional execution flags.',
      issues: [],
    },
    {
      type: 'returns',
      dataType: 'boolean',
      value: 'True on success.',
      issues: [],
    },
  ],
}
```

### Invalid Contract

```ts
const result = parser.parse(`
@purpose Sync cache.
@returns {void}
@see {CacheSync}
@param {string}
`);
```

```ts
{
  entries: [
    { type: 'purpose', value: 'Sync cache.', issues: [] },
    {
      type: 'returns',
      dataType: 'void',
      value: '',
      issues: [],
    },
    {
      type: 'see',
      specifier: 'CacheSync',
      value: '',
      issues: [{ code: 'ERR_DBC_PURPOSE_CONFLICT', line: 3 }],
    },
    {
      type: 'param',
      dataType: 'string',
      value: '',
      issues: [
        { code: 'ERR_DBC_ORDER', line: 4 },
        { code: 'ERR_DBC_PARAM_NAME_MISSING', line: 4 },
      ],
    },
  ],
}
```

## When To Use

Используйте `DbcJsDocParser`, если:

- контракт хранится в коде как JSDoc-комментарий
- контракт уже extracted как plain text, но следует JSDoc-подобному синтаксису
- нужен единый `DbcSchema` для дальнейшей машинной обработки

## Migration Note

- было: `schema.issues`
- стало: `schema.entries[*].issues`

## Notes

Эта реализация валидирует DBC-правила, а не весь стандарт JSDoc.

Если контракт частично невалиден, парсер все равно возвращает максимально полную восстановленную схему.
