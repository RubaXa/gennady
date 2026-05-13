# SDD — Spec-Driven Development

Фреймворк для разработки через спецификации. Каждая директива запускается в **изолированной сессии** и производит самостоятельный артефакт.

## Поток

```
setup ──► discovery ──► module-decomposition? ──► task-scaffolding ──► task-execution ──► audit
           (per scope)    (library/product only)    (convergence)        (per ticket)      (per ticket)
```

## Директивы

| Директива | Что делает | Входные данные | Выходные данные |
|---|---|---|---|
| `setup.directive.xml` | Создаёт/обновляет портал проекта — Vision и Scope Graph | Намерение оператора | `specs/README.md` |
| `discovery.directive.xml` | Проектирует scope: vision, архитектура, инструменты | Название scope + scope-type | `specs/<scope>/<scope>.spec.md` |
| `module-decomposition.directive.xml` | Декомпозирует scope на модули (только library/product) | scope-spec | `specs/<scope>/<module>/<module>.spec.md` |
| `task-scaffolding.directive.xml` | Строит DAG task-тикетов с BDD, правилами, verification | Все scope-specs | `tasks/<scope>/*.task-NN.md` |
| `task-execution.directive.xml` | Выполняет один тикет: код + тесты + Execution Log | Один тикет | Изменения в коде, заполненный лог |
| `audit.directive.xml` | Проверяет выравнивание: spec ↔ тикет ↔ код | Закрытый тикет + код | Эфемерный отчёт с findings |

## Scope Model

**Scope** — архитектурно когерентная единица со своим runtime / deployment / стеком / UX-surface.

| scope-type | Пример scopes | Ключевые секции спека |
|---|---|---|
| `infrastructure` | `infra-base`, `infra-golang` | Tool Stack, Dev Workflow, §Verification Commands |
| `contracts` | `api-contracts` | Interfaces, Versioning Policy, Compatibility Matrix |
| `library` | `design-system-core` | Golden DX, Public API, DbC |
| `product` | `backend`, `web`, `mobile` | Vision, Requirements Gate, Architecture, Modules |

## Правила

Правила организованы в три категории. Каждый тикет содержит `§Effective Rules` — отфильтрованный subset, релевантный именно этой задаче.

| Категория | Директория | Назначение |
|---|---|---|
| Coding | `ai/directives/coding/` | Как писать код (язык + паттерны) |
| Testing | `ai/directives/testing/` | Как писать тесты (фреймворк) |
| Infra | `ai/directives/infra/` | Как конфигурировать инструменты |
