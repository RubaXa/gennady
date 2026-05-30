# Task: TSK-56 — Extract shared sync core + refactor sync

## 1. Meta

- **Task-ID:** TSK-56
- **Status:** [ ] TODO
- **Purpose:** Извлечь общий код `resolvePackageDir`, `compareBytes`, `SyncFormatter`, `SyncCmdDeps` из модуля `sync` в `shared/common/sync/`. Отрефакторить `sync` на использование shared-кода. Расширить `SyncCmdDeps` полями `unlink`, `rmdir` для будущей команды `sync-skills`.
- **Scope:** cli
- **Module:** sync (refactoring), shared/common/sync (new)
- **Dependencies:** TSK-53, TSK-54
- **Spec References:**
  - Module spec: [`sync.spec.md`](../../../specs/cli/sync/sync.spec.md)
  - Module spec: [`sync-skills.spec.md`](../../../specs/cli/sync-skills/sync-skills.spec.md) §6 (shared core File Structure)
  - Decision: [D-010](../../../specs/cli/cli.spec.md) — Shared sync core
  - Decision: [D-M004](../../../specs/cli/sync/sync.spec.md) — Shared sync core (sync module)
  - Decision: [D-M004](../../../specs/cli/sync-skills/sync-skills.spec.md) — Shared sync core (sync-skills module)
  - Contract: [`SyncCmdDeps`](../../../specs/cli/sync-skills/sync-skills.spec.md) — расширенный порт
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `type-check`, `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID | Kind  | Deps | Status |
|----|-------|------|--------|
| P1 | impl  | —    | [ ]    |
| P2 | test  | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать `shared/common/sync/` с shared-кодом. Отрефакторить `sync` на импорт из shared.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `shared/common/sync/sync-core.shared.ts` (create — `resolvePackageDir(subdir)`, `compareBytes`)
  - `shared/common/sync/sync-formatter.shared.ts` (create — `formatSyncOutput`, базовые маркеры `+`/`~`/`-`/`=`, dry-run, итоговая строка)
  - `shared/common/sync/sync-deps.type.ts` (create — `SyncCmdDeps` с `unlink`, `rmdir`)
  - `cli/cmd/sync/sync-core.ts` (modify — удалить локальный `resolvePackageDir`, импортировать из shared)
  - `cli/cmd/sync/sync-formatter.ts` (modify — удалить локальный форматтер, заменить на реэкспорт из shared)
  - `cli/cmd/sync/sync.cmd.ts` (modify — обновить импорты на shared)
- **Inputs:** none
- **Exit:** `npm run type-check` pass; sync импортирует из shared, существующие тесты TSK-54 проходят

### P2 — test

- **Objective:** Написать unit-тесты для shared core. Обновить моки sync-тестов (добавить `unlink`, `rmdir`).
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `shared/common/sync/__tests__/sync-core.shared.test.ts` (create)
  - `shared/common/sync/__tests__/sync-formatter.shared.test.ts` (create)
  - `cli/cmd/sync/__tests__/sync.cmd.test.ts` (modify — добавить `unlink`, `rmdir` в моки)
- **Inputs:** P1 handoff
- **Exit:** `npm test` pass; shared core тесты покрывают `resolvePackageDir`, `compareBytes`, `formatSyncOutput`

## 4. Acceptance Criteria (BDD)

**Feature:** Shared sync core извлечён из модуля sync

**Scenario:** resolvePackageDir возвращает путь с поддиректорией [`unit`]

- **Given** пакет gennady установлен локально
- **When** вызван `resolvePackageDir(cwd, 'ai/skills')`
- **Then** возвращён путь, заканчивающийся на `ai/skills`
- **And** при отсутствии локальной установки — fallback через `import.meta.resolve`

**Scenario:** compareBytes детектит изменения [`unit`]

- **Given** два одинаковых Buffer
- **When** вызван `compareBytes(buf1, buf2)`
- **Then** возвращает `false` (нет изменений)
- **And** при разных буферах возвращает `true`

**Scenario:** SyncCmdDeps включает unlink/rmdir [`contract`]

- **Given** тип `SyncCmdDeps` определён
- **When** проверяем его поля
- **Then** содержит `unlink: (path: string) => void`
- **And** содержит `rmdir: (path: string, options?: { recursive: boolean }) => void`
- **And** существующие поля (`readFile`, `writeFile`, `mkdir`, `stat`, `readdir`, `resolvePackageDir`, `stdout`, `stderr`) сохранены

**Scenario:** sync импортирует resolvePackageDir из shared [`contract`]

- **Given** P1 завершён
- **When** `npm run type-check`
- **Then** exit 0 — sync-core.ts не содержит локального `resolvePackageDir`

**Scenario:** sync импортирует форматтер из shared [`contract`]

- **Given** P1 завершён
- **When** `npm run type-check`
- **Then** exit 0 — sync-formatter.ts реэкспортит из shared

**Scenario:** Существующие sync-тесты проходят после рефакторинга [`integration`]

- **Given** P2 завершён, моки обновлены
- **When** `npm test`
- **Then** все тесты из TSK-54 проходят

## 5. Verification

| Command                          | Required by  |
| -------------------------------- | ------------ |
| `npm run type-check`             | typescript-rules |
| `npm test`                       | node-test    |

## 6. Test Scenario Coverage

| Scenario | Test File | Status |
|---|---|---|
| resolvePackageDir возвращает путь | `shared/common/sync/__tests__/sync-core.shared.test.ts` | [ ] |
| compareBytes детектит изменения | `shared/common/sync/__tests__/sync-core.shared.test.ts` | [ ] |
| SyncCmdDeps включает unlink/rmdir | `shared/common/sync/__tests__/sync-core.shared.test.ts` | [ ] |
| formatSyncOutput — все маркеры | `shared/common/sync/__tests__/sync-formatter.shared.test.ts` | [ ] |
| formatSyncOutput — dry-run | `shared/common/sync/__tests__/sync-formatter.shared.test.ts` | [ ] |
| sync импортирует из shared | `npm run type-check` | [ ] |
| Существующие тесты проходят | `cli/cmd/sync/__tests__/sync.cmd.test.ts` | [ ] |

## 7. Execution Log

### Round 1 — <date>, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → <pass|fail> exit=<code>
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [sync-core.shared.ts, sync-formatter.shared.ts, sync-deps.type.ts, sync-core.ts, sync-formatter.ts, sync.cmd.ts]; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `npm test` → <pass|fail> exit=<code>
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [sync-core.shared.test.ts, sync-formatter.shared.test.ts, sync.cmd.test.ts]; decisions: []; open: []

#### Round close

- [ ] DONE
