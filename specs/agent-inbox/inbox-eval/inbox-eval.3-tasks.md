# inbox-eval — Tasks

## Tracker Index

| Task-ID     | Title                                           | Dependencies                                                                   | Status   | Reopens |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------ | -------- | ------- |
| IE-harness  | inbox-eval: харнесс S1–S8 + метрики автономии   | IP-review, ID-spa, AI-seed                                                     | [ ] TODO | —       |
| IE-realeval | Adaptive real validation and product acceptance | IV-vcs-port, IP-control, IQ-actions, IA-proj, IM-cases, AI-cutover, ID-cockpit | [ ] TODO | —       |

## Slug Registry

<!-- один ID на строку; уникальность держится этим списком — одинаковый ID в двух ветках сталкивается здесь при merge. Только добавление. -->

- IE-harness
- IE-realeval

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
