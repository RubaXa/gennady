# SDD — Spec-Driven Development

Фреймворк для разработки через спецификации. Каждая директива запускается в **изолированной сессии** и производит самостоятельный артефакт.

## Поток

```
setup ──► discovery ──► module-decomposition? ──► task-scaffolding ──► sdd-execute (orchestrator) ──► audit
           (per scope)    (library/product only)    (convergence)        │
                                                                         ├─► phase-subagent (P1, P2, ...)
                                                                         │   under phase-execution-protocol
                                                                         │
                                                                         └─► audit-subagent
                                                                             (auto-dispatched after Round close)
```

## Директивы

| Директива                            | Что делает                                                                  | Входные данные              | Выходные данные                           |
| ------------------------------------ | --------------------------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| `setup.directive.xml`                | Создаёт/обновляет портал проекта — Vision и Scope Graph                     | Намерение оператора         | `specs/README.md`                         |
| `discovery.directive.xml`            | Проектирует scope: vision, архитектура, инструменты, Bootstrap Requirements | Название scope + scope-type | `specs/<scope>/<scope>.spec.md`           |
| `module-decomposition.directive.xml` | Декомпозирует scope на модули (только library/product)                      | scope-spec                  | `specs/<scope>/<module>/<module>.spec.md` |
| `task-scaffolding.directive.xml`     | Строит DAG task-тикетов с Phases Overview, BDD, правилами per phase         | Все scope-specs             | `tasks/<scope>/*.task-NN.md`              |
| `phase-execution-protocol.xml`       | Выполняет ОДНУ фазу одного тикета (диспетчится `sdd-execute` оркестратором) | Phase ID + ticket + Handoff | Изменения в Target Files фазы + лог-блок  |
| `audit.directive.xml`                | Проверяет выравнивание: spec ↔ тикет ↔ код; маппит finding-ы на фазы        | Закрытый Round + код        | Эфемерный отчёт + `phases_to_fix`         |

Оркестрация — через SKILL-ы (`sdd-execute`, `sdd-execute-batch`). Они читают только заголовок тикета + Phases Overview и диспетчат phase-subagent-ов; никогда не выполняют сами.

## Scope Model

**Scope** — архитектурно когерентная единица со своим runtime / deployment / стеком / UX-surface.

| scope-type       | Пример scopes                | Ключевые секции спека                               |
| ---------------- | ---------------------------- | --------------------------------------------------- |
| `infrastructure` | `infra-base`, `infra-golang` | Tool Stack, Dev Workflow, Verification Commands     |
| `contracts`      | `api-contracts`              | Interfaces, Versioning Policy, Compatibility Matrix |
| `library`        | `design-system-core`         | Golden DX, Public API, DbC                          |
| `product`        | `backend`, `web`, `mobile`   | Vision, Requirements Gate, Architecture, Modules    |

## Правила

Правила организованы в три категории. Каждый тикет декларирует фазы (`## 2. Phases Overview`), а каждая фаза содержит свой `Rules:` bullet-список — отфильтрованный subset, релевантный именно этой фазе.

| Категория | Директория               | Назначение                       |
| --------- | ------------------------ | -------------------------------- |
| Coding    | `ai/directives/coding/`  | Как писать код (язык + паттерны) |
| Testing   | `ai/directives/testing/` | Как писать тесты (фреймворк)     |
| Infra     | `ai/directives/infra/`   | Как конфигурировать инструменты  |
