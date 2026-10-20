# vcs-mr-view: Scope Specification

<!--SECTION:SPEC_ID-->

CLI-VCS-MR-VIEW

<!--/SECTION:SPEC_ID-->

<!--SECTION:OVERVIEW-->

## Обзор

```mermaid
flowchart LR
  Url[--url MR/PR] --> Resolve[Resolve context]
  Resolve --> Fetch[Fetch metadata]
  Fetch --> Render[JSON render]
```

_Read-only вывод метаданных MR/PR по URL: title, description, reviewers, approvers, labels — без мутаций._

<!--/SECTION:OVERVIEW-->

<!--SECTION:SCOPE_TYPE-->

## scope-type

product

<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->

## 1. Vision & Primary Goal

Команда `gennady vcs-mr-view --url <mr-url>` даёт машиночитаемые метаданные MR/PR без каких-либо
мутаций (read-only). Точечная CLI-проекция над существующим `services/vcs-client` provider-портом.

<!--/SECTION:VISION-->

<!--SECTION:PROJECT_TYPE-->

## 2. Project Type

- **Type:** cli-utility
- **Why this type:** Одна CLI-команда с одним аргументом (URL MR), read-only.

<!--/SECTION:PROJECT_TYPE-->

<!--SECTION:GOLDEN_DX-->

## 3. Approved Usage Example

```sh
npx gennady vcs-mr-view --url https://gitlab.com/group/project/-/merge_requests/123 --json
```

<!--/SECTION:GOLDEN_DX-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

## 4. Requirements & Constraints

### VMV-REQ-1 [должен]

Разобрать URL MR/PR в VCS-контекст.

### VMV-REQ-2 [должен]

Получить метаданные (title, description, reviewers, approvers, labels).

### VMV-REQ-3 [должен · нештатная]

Read-only: никаких мутаций MR/PR. Deterministic JSON output.

<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:USE_CASES-->

## 5. Use Cases

- Агент перед ревью смотрит метаданные MR.
- Оператор быстро проверяет approvers MR.

<!--/SECTION:USE_CASES-->

<!--SECTION:DATA_FLOW-->

## 6. Data Flow

```mermaid
flowchart LR
  URL[url] --> Resolve[resolve context]
  Resolve --> Client[vcs-client]
  Client --> JSON[json]
```

<!--/SECTION:DATA_FLOW-->

<!--SECTION:ARCHITECTURE-->

## 7. High-Level Architecture

- `cli/cmd/vcs-mr-view/vcs-mr-view.cmd.ts` — разбор `--url`, resolve VCS-контекста, fetch метаданных.
- `cli/cmd/vcs-mr-view/index.ts` — entry point (dynamic import из `gennady.ts`).
- Переиспользует `services/vcs-client/**` (GitLab/GitHub clients).

<!--/SECTION:ARCHITECTURE-->

<!--SECTION:DECISION_LOG-->

## 8. Decision Log

<details><summary>Подробности</summary>

<details><summary>Подробности</summary>

<details><summary>Подробности</summary>

### D-001 — Read-only JSON projection

- **Status:** active
- **Why:** Метаданные MR нужны машиночитаемо; мутации сознательно исключены.

<!--/SECTION:DECISION_LOG-->

<!--SECTION:SCOPE_DEPENDENCIES-->

## 9. Scope Dependencies

- **Depends on:** `vcs-client` (GitLab/GitHub clients), `shared/common`.
- **Provides to:** `cli` (команда `vcs-mr-view`).

<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->

## 10. Bootstrap Requirements

<details><summary>Подробности</summary>

<details><summary>Подробности</summary>

| Requirement | Kind | Owner | Resolution |
| --- | --- | --- | --- |
| VCS credentials (GitLab/GitHub) | credential | operator-action | token в env |

</details>

<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:MODULE_MAP-->

## 11. Module Map

| Модуль | Путь | Назначение |
| --- | --- | --- |
| vcs-mr-view cmd | `cli/cmd/vcs-mr-view/vcs-mr-view.cmd.ts` | логика команды |
| vcs-mr-view index | `cli/cmd/vcs-mr-view/index.ts` | entry point |

<!--/SECTION:MODULE_MAP-->

<!--SECTION:HANDOFF-->

## 12. Handoff to module-decomposition

- **Primary input:** `specs/cli/vcs-mr-view/vcs-mr-view.spec.md`
- **Areas requiring decomposition:** `vcs-mr-view` (single module).

<!--/SECTION:HANDOFF-->
