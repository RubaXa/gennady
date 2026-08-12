# S3 — preflight carve-out: v1 репозиторий, но узкий запрос не тянет миграцию

Проверяет: router `STEP_0_STATE` ветку 3 (`AX_PREFLIGHT_BLAST_RADIUS_SCOPED` — blast radius не
достаёт до `tasks/` layout → миграция НЕ грузится, состояние фиксируется одной строкой, роутинг идёт
в `evolve-scope` как обычно).

## Fixture

Та же v1-фикстура, что в S2 (переиспользуется буквально, без изменений):

`package.json`:
```json
{
  "name": "demo-project",
  "version": "0.1.0",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "gennady lint --all .",
    "format": "prettier --check ."
  }
}
```

`node_modules/.bin/gennady` (пустой файл):
```
```

`specs/README.md`:
```markdown
# demo-project

## Vision
Демо-проект для проверки миграции v1 → v2.

## Scopes

| Scope | Type | Spec | Description |
|---|---|---|---|
| [`demo`](./demo/demo.spec.md) | product | ✅ | Демо-скоуп |
```

`specs/demo/demo.spec.md` (v1-спека):
```markdown
# Demo Scope

## 1. Vision
Демо-скоуп для отслеживания X.

## 2. Architecture
Один модуль `core` — вся логика внутри него.

## 3. Decision Log

### D-001 — Один модуль на старте
- **Status:** active
- **Why:** пока нет причин делить.
```

`tasks/demo/README.md`:
```markdown
# Demo — Tasks

| ID | Module | Title | Status |
|---|---|---|---|
| TSK-01 | core | Реализовать ядро | done |
```

`tasks/demo/core/core.task-01.md`:
```markdown
# TSK-01 — Реализовать ядро

## Meta
- Purpose: базовая логика core-модуля demo
- Module: core
- Status: done

## Description
Инициализация core-модуля: структуры данных и точка входа.
```

## Entry

Скилл: `/sdd`. Первая реплика оператора:

> Поправь формулировку Vision в `specs/demo/demo.spec.md` — замени «отслеживания X» на «учёта Y».

## Operator Script

1. На вопрос роутера про `scale` (единственная развилка — intent тут однозначен, узкая правка одного
   абзаца) — ответ: «согласен, function».

## Stop

Сразу после того, как агент в первой decision-card после `STEP_1_CLASSIFY`/`STEP_2_ROUTE` НАЗВАЛ
маршрут (одна строка про состояние v1 + «идём через `evolve-scope`» → `scope.directive`, mode=`refine`)
И предложил миграцию как отдельный следующий шаг — ДО того, как оператор ответил на что-либо внутри
`scope.directive` (до его STEP_1_CONFIRM approval-обмена).

## Checkpoints

1. `sdd-state` вызван первым, репортит `FLOW_VERSION=v1`.
2. Сработавшая ветка router `STEP_0_STATE` — дословно (третий случай, НЕ первый): «WHEN
   (`FLOW_VERSION=v1` OR `READINESS=not-ready`) AND the request's blast radius stays inside its own
   scope (`AX_PREFLIGHT_BLAST_RADIUS_SCOPED`) -> record state in one line, proceed to STEP_1_CLASSIFY;
   propose migration / readiness setup to the operator as a separate next step».
3. `AX_PREFLIGHT_BLAST_RADIUS_SCOPED` процитирован/применён по смыслу: правка одного абзаца Vision в
   уже существующей спеке — «a spec paragraph» — прямой пример из самой аксиомы («when the requested
   change stays inside the door's own scope (a spec paragraph, a single ticket)... record the state
   in one line and proceed straight to the door's own work»).
4. В трейсе НЕТ строки `directive: ai/directives/sdd-v2/migration-v1-v2.directive.xml loaded` и НЕТ
   ни одного `tool: sdd-migrate ...` вызова — миграция не грузится и не запускается.
5. `H_NOT_V1` не фигурирует (не тот путь — миграция не входила).
6. Классифицированный intent — `evolve-scope` (правка существующей `demo.spec.md`, не создание новой
   спеки); router `LOGIC_SWITCH` даёт ветку 3: «WHEN intent ∈ {new-scope, evolve-scope} AND
   scope-type ∈ {product, library} -> READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/scope.directive.xml")» —
   в трейсе ровно один `directive: ... loaded` после router, `scope.directive.xml`.
7. Финальное сообщение перед стопом явно называет миграцию как отдельный будущий шаг, а не выполняет
   её — трейс содержит `note:`, фиксирующую именно это (предложение миграции отдельно от текущей
   правки), без единого `write:` в `specs/demo/demo.spec.md` (правка Vision ещё не начата — стоп до
   входа в содержательные шаги `scope.directive`).
