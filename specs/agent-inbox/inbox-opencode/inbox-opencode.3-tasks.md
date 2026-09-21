# inbox-opencode — Tasks

## Tracker Index

| Task-ID    | Title                                                        | Dependencies | Status   | Reopens |
| ---------- | ------------------------------------------------------------ | ------------ | -------- | ------- |
| IO-session | inbox-opencode: TTL-паркинг + единый пул + промпт-компиляция | IC-journal   | [ ] TODO | —       |
| IO-runtime | Agent runtime contracts, sessions and coverage traces        | IC-state     | [ ] TODO | —       |

## Slug Registry

<!-- один ID на строку; уникальность держится этим списком — одинаковый ID в двух ветках сталкивается здесь при merge. Только добавление. -->

- IO-session
- IO-runtime

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
