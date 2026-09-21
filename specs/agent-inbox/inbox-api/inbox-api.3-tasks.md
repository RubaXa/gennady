# inbox-api — Tasks

## Tracker Index

| Task-ID     | Title                                                                 | Dependencies                                              | Status   | Reopens |
| ----------- | --------------------------------------------------------------------- | --------------------------------------------------------- | -------- | ------- |
| IA-rest-sse | inbox-api: REST/SSE + DTO-проекции                                    | IV-gitlab, IQ-executor                                    | [ ] TODO | —       |
| IA-health   | serve/test-infra: утечка хэндлов, orphan-restart, вынос v1-легаси red | AI-fasttest                                               | [x] DONE | —       |
| IA-proj     | Journal projections and typed local API                               | IC-state, IV-vcs-port, IP-control, IQ-actions, IC-handoff | [ ] TODO | —       |

## Slug Registry

<!-- один ID на строку; уникальность держится этим списком — одинаковый ID в двух ветках сталкивается здесь при merge. Только добавление. -->

- IA-rest-sse
- IA-health
- IA-proj

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
