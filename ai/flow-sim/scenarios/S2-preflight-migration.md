# S2 — preflight: v1 репозиторий, запрос бьёт по `tasks/`, гейт мигрирует до всего остального

Проверяет: router `STEP_0_STATE` ветку 1 (`FLOW_VERSION=v1` + blast radius достаёт до `tasks/`
layout → `migration-v1-v2.directive.xml`), и что `migration-v1-v2` STEP_0_SCAN — чистый dry-run, без
`--write`.

## Fixture

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

| Scope                         | Type    | Spec | Description |
| ----------------------------- | ------- | ---- | ----------- |
| [`demo`](./demo/demo.spec.md) | product | ✅   | Демо-скоуп  |
```

`specs/demo/demo.spec.md` (v1-спека — заголовки нумерованы, без `<!--SECTION:-->` якорей):

```markdown
# Demo Scope

## 1. Vision

Демо-скоуп для проверки миграции v1 → v2.

## 2. Architecture

Один модуль `core` — вся логика внутри него.

## 3. Decision Log

### D-001 — Один модуль на старте

- **Status:** active
- **Why:** пока нет причин делить.
```

`tasks/demo/README.md` (v1-трекер):

```markdown
# Demo — Tasks

| ID     | Module | Title            | Status |
| ------ | ------ | ---------------- | ------ |
| TSK-01 | core   | Реализовать ядро | done   |
```

`tasks/demo/core/core.task-01.md` (v1-тикет старого формата):

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

> Переведи таски на новую раскладку.

## Operator Script

(Пусто — прогон останавливается до первого вопроса оператору; STEP_0_SCAN ничего не спрашивает,
только отчитывается.)

## Stop

Сразу после того, как `migration-v1-v2.directive` STEP*0_SCAN отчитался оператору о форме репозитория
(юниты / тикеты / orphan'ы) — ДО STEP_1_LAYER (`sdd-migrate plan --write`). Никакой `--write` вызов
не должен попасть в трейс. Трейс заканчивается строкой `stop: per-map — <это условие дословно>` (не
`halt:` — это остановка по карте, не директивный `H*\*`-гейт).

## Checkpoints

1. `sdd-state` вызван первым, репортит `FLOW_VERSION=v1` (наличие `tasks/`).
2. Сработавшая ветка router `STEP_0_STATE` — дословно: «WHEN `FLOW_VERSION=v1` AND the request's
   blast radius reaches `tasks/` layout or task-ID rewriting -> READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/migration-v1-v2.directive.xml")».
   Запрос «переведи таски на новую раскладку» бьёт по `tasks/` layout целиком — не carve-out.
3. `H_NOT_V1` НЕ сработал (в трейсе нет строки `halt: H_NOT_V1`) — `sdd-state` подтвердил v1 до входа
   в `STEP_0_SCAN`: «Confirm `FLOW_VERSION=v1` via `sdd-state` (else `H_NOT_V1`)».
4. В трейсе ровно два вызова `sdd-migrate` в STEP_0_SCAN, оба БЕЗ флага `--write`:
   `sdd-migrate plan --all .` и `sdd-migrate anchors --all .` — дословно из директивы:
   «`sdd-migrate plan --all .` (DRY-RUN...) and `sdd-migrate anchors --all .` (DRY-RUN...)».
5. Ни одной строки `write:` в трейсе — `migration/` каталог не создан, `tasks/` не тронут,
   `specs/demo/demo.spec.md` не изменён.
6. Отчёт оператору по форме STEP_0_SCAN зафиксирован строкой `show:` в трейсе, и её содержимое
   включает как минимум: количество юнитов (одна спека = один юнит → `demo`), количество тикетов
   (1 — `TSK-01`), наличие/отсутствие orphan-тикетов (нет — тикет привязан к существующему модулю
   `core`) — без `show:`-строки этот чекпоинт непроверяем (Verifier не видит фактического текста
   отчёта, только заявление Executor'а).
