# `dbc/parser`

Framework для восстановления структурированной DBC-схемы из текстового контракта.

`dbc/parser` получает сырой текст контракта, разбирает его в универсальную схему и возвращает диагностические ошибки, если контракт нарушает внутренние правила формата. Это базовый слой между текстовым описанием контракта и всеми следующими этапами: анализом, генерацией, проверкой, автодокументацией и агентной обработкой.

## Purpose

Главная задача модуля: восстановить схему контракта из текстовых данных.

На входе:

- строка или многострочный блок с DBC-контрактом

На выходе:

- `DbcSchema` с нормализованными записями контракта
- диагностика в `entries[*].issues`, если в контракте есть нарушения стандарта

Модуль не привязан к одному синтаксису. Он задает общий контракт и позволяет подключать разные реализации парсеров.

## Features

- Единый интерфейс `DbcParser` для любых текстовых форматов контракта
- Универсальная схема результата `DbcSchema`
- Поддержка частично невалидных контрактов без потери уже извлеченных данных
- Отдельный слой валидации через стабильные issue-коды
- Расширяемая архитектура через `implementations/*`
- Первая реализация для JSDoc-подобного синтаксиса

## Architecture

Модуль состоит из двух частей.

1. Core
   Описывает типы, интерфейс парсера и коды ошибок.
2. Implementations
   Реализует конкретные синтаксисы, которые конвертируют текст в общий `DbcSchema`.

Из этого следует основной принцип: любая реализация может по-разному читать вход, но обязана одинаково возвращать результат.

## Package Layout

```text
services/dbc/parser/
├─ README.md
├─ dbc-parser.task.spec.md
├─ dbc-parser.types.ts
└─ implementations/
   └─ jsdoc/
      ├─ README.md
      └─ dbc-jsdoc-parser.ts
```

## API

Источник типов: [services/dbc/parser/dbc-parser.types.ts](services/dbc/parser/dbc-parser.types.ts)

```ts
export interface DbcParser {
  parse(inputContract: string): DbcSchema;
}
```

### `parse(inputContract: string): DbcSchema`

Принимает сырой текст контракта и возвращает нормализованный результат парсинга.

```ts
type DbcSchema = {
  entries: DbcEntrySchema[];
};
```

## Schema

### `DbcSchema`

Корневой результат парсинга.

- `entries`: распознанные записи контракта

### `DbcEntrySchema`

Одна нормализованная запись контракта.

```ts
type DbcEntrySchema = {
  type: string;
  specifier?: string;
  dataType?: string;
  optional?: boolean;
  value: string;
  issues: DbcDbcEntryIssue[];
};
```

Поля:

- `type`: тип записи, например `description`, `param`, `returns`
- `specifier`: идентификатор сущности, если он есть в записи
- `dataType`: тип данных, если он был указан в контракте
- `optional`: флаг опциональности идентификатора
- `value`: основное текстовое содержимое записи
- `issues`: диагностика, относящаяся именно к этой записи

### `DbcDbcEntryIssue`

Одна диагностическая проблема.

```ts
type DbcDbcEntryIssue = {
  code: DbcIssueCode;
  line?: number;
};
```

Поля:

- `code`: стабильный машинный код ошибки
- `line`: строка исходного текста, где обнаружена проблема

## Validation

Core определяет следующие коды ошибок:

- `ERR_DBC_PURPOSE_CONFLICT`
- `ERR_DBC_ORDER`
- `ERR_DBC_PARAM_NAME_MISSING`
- `ERR_DBC_SEE_FORMAT_INVALID`

Реализация может извлечь корректную часть схемы даже тогда, когда у некоторых `entries[*].issues` есть ошибки.

## Supported Implementations

### `jsdoc`

Источник: [services/dbc/parser/implementations/jsdoc/README.md](services/dbc/parser/implementations/jsdoc/README.md)

Первая реализация фреймворка. Разбирает JSDoc-подобные контракты и конвертирует их в универсальный `DbcSchema`.

## Example

```ts
import { DbcJsDocParser } from './implementations/jsdoc/dbc-jsdoc-parser.ts';

const parser = new DbcJsDocParser();

const result = parser.parse(`
/**
 * Loads a profile.
 * @consumer ProfilePage
 * @param {string} userId User identifier.
 * @returns {boolean} True if profile is available.
 */
`);
```

```ts
{
  entries: [
    { type: 'description', value: 'Loads a profile.', issues: [] },
    { type: 'consumer', value: 'ProfilePage', issues: [] },
    {
      type: 'param',
      dataType: 'string',
      specifier: 'userId',
      value: 'User identifier.',
      issues: [],
    },
    {
      type: 'returns',
      dataType: 'boolean',
      value: 'True if profile is available.',
      issues: [],
    },
  ],
}
```

## Usage Model

Если вы пишете новую реализацию:

- принимайте текстовый контракт
- восстанавливайте `DbcEntrySchema[]`
- добавляйте `issues` для нарушений правил на уровне конкретной записи
- возвращайте итоговый `DbcSchema`

Если вы потребляете результат:

- используйте `entries` как нормализованную схему
- используйте `entries[*].issues` как диагностику качества контракта

## Migration Note

- было: `schema.issues`
- стало: `schema.entries[*].issues`

## Scope

`dbc/parser` отвечает только за восстановление схемы и диагностику контракта.

Он не:

- исполняет контракт
- интерпретирует бизнес-смысл `value`
- восстанавливает объектную иерархию параметров
- чинит контракт автоматически
