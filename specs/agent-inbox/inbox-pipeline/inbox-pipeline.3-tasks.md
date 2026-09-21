# inbox-pipeline — Tasks

## Tracker Index

| Task-ID    | Title                                                                     | Dependencies                      | Status   | Reopens |
| ---------- | ------------------------------------------------------------------------- | --------------------------------- | -------- | ------- |
| IP-review  | inbox-pipeline: план-шаблон + 3 слоя + линзы + coverage + синтез + хвосты | IQ-executor                       | [ ] TODO | —       |
| IP-control | Deterministic full, delta and cross-review control plane                  | IC-state, IV-vcs-port, IO-runtime | [ ] TODO | —       |

## Slug Registry

<!-- один ID на строку; уникальность держится этим списком — одинаковый ID в двух ветках сталкивается здесь при merge. Только добавление. -->

- IP-review
- IP-control

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
