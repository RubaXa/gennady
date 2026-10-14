# Tasks: infra-npm-publish

## Scope Spec

- [Scope spec](./infra-npm-publish.spec.md)

## Cascade Table

<!-- ЗАПОЛНЯЕТ АГЕНТ: действующие правила scope из Scope Graph (транзитивное замыкание depends-on). -->

## Inter-Module DAG

```mermaid
graph TD
  %% кросс-модульных зависимостей нет
```

## Tracker

| Task-ID      | Title                                           | Module | Dependencies | Status   | Reopens |
| ------------ | ----------------------------------------------- | ------ | ------------ | -------- | ------- |
| INP-pack-ai  | Копировать `ai/` в `dist/ai/` перед публикацией | —      | INP-rel-cmd  | [ ] TODO | —       |
| INP-rel-dep  | Установить release-it как devDependency         | —      | —            | [ ] TODO | —       |
| INP-rel-conf | Создать `.release-it.json`                      | —      | INP-rel-dep  | [ ] TODO | —       |
| INP-rel-cmd  | Настроить `package.json` для публикации         | —      | INP-rel-dep  | [ ] TODO | —       |

## Decision Log (scope task level)

<!-- <ACR>-DL-N scope-уровневых решений декомпозиции/планирования. -->
