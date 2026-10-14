# Tasks: dbc

## Scope Spec

- [Scope spec](./dbc.spec.md)

## Cascade Table

<!-- ЗАПОЛНЯЕТ АГЕНТ: действующие правила scope из Scope Graph (транзитивное замыкание depends-on). -->

## Inter-Module DAG

```mermaid
graph TD
  %% кросс-модульных зависимостей нет
```

## Tracker

| Task-ID     | Title                                                                                        | Module     | Dependencies | Status   | Reopens |
| ----------- | -------------------------------------------------------------------------------------------- | ---------- | ------------ | -------- | ------- |
| DL-ts-deps  | Bootstrap: установить tree-sitter зависимости                                                | dbc-linter | —            | [ ] TODO | —       |
| DL-vite-ext | Bootstrap: tree-sitter external в Vite                                                       | dbc-linter | DL-ts-deps   | [ ] TODO | —       |
| DL-layout   | Bootstrap: создать структуру директорий dbc-linter                                           | dbc-linter | —            | [ ] TODO | —       |
| DL-types    | Типы: Ports, Value Objects, константы                                                        | dbc-linter | DL-layout    | [ ] TODO | —       |
| DL-ast      | DbcTsAstAdapter: tree-sitter парсинг TypeScript                                              | dbc-linter | DL-types     | [ ] TODO | —       |
| DL-match    | DbcTsLinter + DbcContractMatchValidator + autofix                                            | dbc-linter | DL-ast       | [ ] TODO | —       |
| DL-fixtures | Тесты: 88 fixture-кейсов полного покрытия                                                    | dbc-linter | DL-match     | [ ] TODO | —       |
| DL-content  | DbcLinter: опция `content` для предварительно прочитанного файла                             | dbc-linter | DL-fixtures  | [x] DONE | —       |
| DL-objprop  | Проверка контрактов для type alias (объектный литерал) и interface property (function-typed) | dbc-linter | DL-fixtures  | [x] DONE | —       |
| DL-tags     | Fix \_reorderTags: `*/` closing boundary + edge cases                                        | dbc-linter | DL-fixtures  | [x] DONE | —       |
| DL-jsdoc-fx | Autofix: normalize multi-line + expand inlining + always-run formatting                      | dbc-linter | DL-tags      | [x] DONE | —       |
| DL-redund   | Реализовать `removeRedundantInImplements` в autofix-цепочке                                  | dbc-linter | DL-jsdoc-fx  | [ ] TODO | —       |
| DP-fields   | Обновить типы: `DbcSchema.format` + `DbcEntrySchema.inline`                                  | dbc-parser | —            | [ ] TODO | —       |
| DP-jsdoc    | Обновить парсер: `@implements` + новый `CONTRACT_ORDER` + `format` + `inline`                | dbc-parser | DP-fields    | [ ] TODO | —       |
| DP-snaps    | Обновить тесты и snapshot-ы под новую схему                                                  | dbc-parser | DP-jsdoc     | [ ] TODO | —       |

## Decision Log (scope task level)

<!-- <ACR>-DL-N scope-уровневых решений декомпозиции/планирования. -->
