# inbox-queue — Tasks

## Tracker Index

| Task-ID     | Title                                                   | Dependencies                       | Status   | Reopens |
| ----------- | ------------------------------------------------------- | ---------------------------------- | -------- | ------- |
| IQ-executor | inbox-queue: реестр типов + executors + маршрут сессий  | IC-decision, IV-gitlab, IO-session | [ ] TODO | —       |
| IQ-actions  | Hybrid action packages and intent-preserving automation | IC-state, IV-vcs-port, IP-control  | [ ] TODO | —       |

## Slug Registry

<!-- один ID на строку; уникальность держится этим списком — одинаковый ID в двух ветках сталкивается здесь при merge. Только добавление. -->

- IQ-executor
- IQ-actions

## Intra-Module DAG

```mermaid
graph TD
  %% зависимостей внутри модуля нет
```

<!-- ребро A → B = «A зависит от B». Кросс-модульные рёбра живут уровнем выше. -->

## Decision Log (module-task level)

<!-- решения декомпозиции/планирования; локальные решения исполнения — в Decision Log самих тикетов. -->

## Conventions

Проектные конвенции объявлены в `specs/3-tasks.md` и наследуются — здесь не повторяются.
