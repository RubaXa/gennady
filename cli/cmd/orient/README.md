# Agent Rules: orient

`orient` — команда для навигации по репозиторию через file-header разметку
(`@file:`, V2 `@spec:`, legacy `@tasks:`, `@consumers:`) и публичные сущности с их DBC-контрактами
(экспортируемые функции, классы, типы, интерфейсы).

## Когда использовать

| Тебе нужно ...                                          | Вызови                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| Понять структуру проекта, какие файлы за что отвечают   | `npx gennady orient`                            |
| Найти файлы, связанные с конкретной задачей (TSK-XX)    | `npx gennady orient --task=DP-snaps`            |
| Узнать, кто потребляет модуль (зависимости снизу-вверх) | `npx gennady orient --consumer=DbcTsLinter`     |
| Найти файлы по ключевому слову в `@file:` описании      | `npx gennady orient "keyword"`                  |
| Посмотреть owner, работу и DBC-контракты файла          | `npx gennady orient --file=path/to/file.ts`     |
| Развернуть только исторические relations                | `npx gennady orient --file=path --history`      |
| Получить versioned machine result                       | `npx gennady orient --file=path --json`         |
| Найти экспортируемую сущность (fuzzy)                   | `npx gennady orient --entity=MyService --fuzzy` |
| Увидеть граф зависимостей (кто что потребляет)          | `npx gennady orient --graph`                    |
| Обзор всех спек и их задач                              | `npx gennady orient --specs`                    |

## Примеры

### Узнать, кто потребляет DbcJsDocParser

```bash
npx gennady orient --consumer=DbcJsDocParser
```

Вывод: список файлов, у которых `@consumers: DbcJsDocParser` в хедере.

### Найти файлы задачи DL-ts-deps

```bash
npx gennady orient --task=DL-ts-deps
```

Вывод: `DL-ts-deps → dbc-ts-linter.spec.md → список файлов с аннотациями`.

### Посмотреть конкретный файл в деталях

```bash
npx gennady orient --file=services/dbc/parser/dbc-parser.types.ts
```

Вывод: canonical `@spec`, bounded active/planned/blocked/history relations, findings, затем хедер и
экспортируемые сущности с DBC-контрактами. `--history` разворачивает history, не меняя
классификацию; `--json` возвращает schema `gennady.orient.file-relations`, version `1`.

## Как встроить в AGENTS.md

Запусти `npx gennady agents-rules`, прочитай вывод, переосмысли под свою задачу
и добавь в секцию «Tools / Commands» своего AGENTS.md.
