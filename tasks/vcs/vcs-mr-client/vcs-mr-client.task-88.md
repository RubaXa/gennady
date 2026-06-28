# Task: TSK-88 — API core: query types + abstract port for MR create/update

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-88
- **Status:** [ ] TODO
- **Purpose:** Добавить два новых метода `create`/`update` на абстрактный порт `VcsClientMergeRequests` и два value object'а `VcsMergeRequestCreateQuery` / `VcsMergeRequestUpdateQuery`. Общее ядро для обоих провайдеров (GitLab + GitHub) — без реализации адаптеров.
- **Scope:** `vcs-mr-management`
- **Module:** `vcs-mr-client`
- **Dependencies:** None (чистый API-контракт)
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [vcs-mr-management.spec.md](../../specs/vcs/vcs-mr-management/vcs-mr-management.spec.md)
  - Parent VCS spec: [vcs.spec.md FR-02](../../specs/vcs/vcs.spec.md)
- **Runtime Backing:** `not-implemented` (abstract; адаптеры — в TSK-89, TSK-90)
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [ ] TODO |
| P2  | test | P1   | [ ] TODO |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Создать query-типы и добавить методы `create`/`update` на `VcsClientMergeRequests`. `create` — абстрактный. `update` — **concrete template method** (валидация + вызов `protected abstract _doUpdate`), гарантирующий что адаптеры получают непустой запрос.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/entities/vcs-merge-request-create-query.type.ts` (NEW)
  - `services/vcs-client/entities/vcs-merge-request-update-query.type.ts` (NEW)
  - `services/vcs-client/abstract/vcs-client-merge-requests.ts` (MODIFY: +create abstract, +update template, +\_doUpdate protected abstract)
- **Inputs:** Spec §3 Entity Surfaces, FR-MR-01, FR-MR-05
- **Exit:** `VcsMergeRequestCreateQuery` тип с 10 полями; `VcsMergeRequestUpdateQuery` тип с project + iid + 9 опциональных; `create(query)` — abstract; `update(query)` — concrete: проверяет наличие опциональных полей → бросает Error если пусто → вызывает `await this._doUpdate(query)`; `_doUpdate(query)` — protected abstract для адаптеров; JSDoc-контракты; file-headers; typecheck pass
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit-тесты contract tests: проверка что абстрактный класс не может быть инстанциирован без create, runtime-валидация update, компиляция query-типов.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/vcs-client/__tests__/abstract/vcs-client-merge-requests.test.ts` (MODIFY: добавить тесты create/update)
- **Inputs:** P1 handoff
- **Exit:** compile-time gate для create (абстрактный метод не реализован → tsc error); runtime invariant для update (пустой query → Error); типобезопасность query-типов подтверждена
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** API-контракт для создания и редактирования MR

**Scenario:** `VcsMergeRequestCreateQuery` компилируется с минимальными полями [`unit`]

- **Given** тип определён в `vcs-merge-request-create-query.type.ts`
- **When** переданы `project`, `title`, `sourceBranch`
- **Then** TypeScript принимает (без ошибок типа)

**Scenario:** `VcsMergeRequestUpdateQuery` компилируется с валидными полями [`unit`]

- **Given** тип определён в `vcs-merge-request-update-query.type.ts`
- **When** переданы `project`, `iid`, `title`, `draft`
- **Then** TypeScript принимает (без ошибок типа)

**Scenario:** `update()` отвергает пустой запрос [`unit`]

- **Given** `VcsMergeRequestUpdateQuery` передан **только** с `project` и `iid`, без опциональных полей
- **When** вызывается `update(query)` на классе-наследнике (реализован только `_doUpdate` и `create`)
- **Then** выбрасывается `Error('At least one field to update is required')`
- **And** `_doUpdate` **не вызывается**

**Scenario:** `update()` с валидными полями проходит валидацию [`unit`]

- **Given** `VcsMergeRequestUpdateQuery` передан с `project`, `iid`, и `title`
- **When** вызывается `update(query)` на тестовом наследнике (реализован `_doUpdate`
- **Then** ошибка не выбрасывается
- **And** `_doUpdate` вызывается с переданным query

**Scenario:** Abstract port требует `create` и `_doUpdate` [`unit`]

- **Given** класс-наследник не реализует `create`
- **When** `tsc --noEmit`
- **Then** compile error (абстрактный метод не реализован)
- **Given** класс-наследник не реализует `_doUpdate`
- **When** `tsc --noEmit`
- **Then** compile error (абстрактный метод не реализован)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                             | Required by      |
| --------------------------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                                      | typescript-rules |
| `node --import tsx --test services/vcs-client/__tests__/abstract/vcs-client-merge-requests.test.ts` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:EXECUTION_LOG-->

## 6. Execution Log

_(Round = один execute-then-audit цикл.)_

<!--/SECTION:EXECUTION_LOG-->
