# Agent Rules: orient

`orient` — команда для навигации по репозиторию через file-header разметку
(`@file:`, `@tasks:`, `@consumers:`) и DBC-контракты.

## Когда использовать

| Тебе нужно ...                                          | Вызови                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| Понять структуру проекта, какие файлы за что отвечают   | `npx gennady orient`                            |
| Найти файлы, связанные с конкретной задачей (TSK-XX)    | `npx gennady orient --task=TSK-03`              |
| Узнать, кто потребляет модуль (зависимости снизу-вверх) | `npx gennady orient --consumer=DbcTsLinter`     |
| Найти файлы по ключевому слову в `@file:` описании      | `npx gennady orient "keyword"`                  |
| Посмотреть хедер и DBC-контракты конкретного файла      | `npx gennady orient --file=path/to/file.ts`     |
| Найти экспортируемую сущность (fuzzy)                   | `npx gennady orient --entity=MyService --fuzzy` |
| Увидеть граф зависимостей (кто что потребляет)          | `npx gennady orient --graph`                    |
| Обзор всех спек и их задач                              | `npx gennady orient --specs`                    |

## Примеры

### Узнать, кто потребляет DbcJsDocParser

```bash
npx gennady orient --consumer=DbcJsDocParser
```

Вывод: список файлов, у которых `@consumers: DbcJsDocParser` в хедере.

### Найти файлы задачи TSK-04

```bash
npx gennady orient --task=TSK-04
```

Вывод: `TSK-04 → dbc-ts-linter.spec.md → список файлов с аннотациями`.

### Посмотреть конкретный файл в деталях

```bash
npx gennady orient --file=services/dbc/parser/dbc-parser.types.ts
```

Вывод: хедер (`@file:`, `@tasks:`, `@consumers:`) + все экспортируемые сущности с DBC-контрактами.

## Как встроить в AGENTS.md

Запусти `npx gennady agents-rules`, прочитай вывод, переосмысли под свою задачу
и добавь в секцию «Tools / Commands» своего AGENTS.md.
