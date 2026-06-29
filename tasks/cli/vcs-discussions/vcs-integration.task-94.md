# Task: TSK-94 — Интеграция: регистрация команд в gennady.ts + help + README

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-94
- **Status:** [x] DONE
- **Purpose:** Зарегистрировать три новые команды (`vcs-mr-create`, `vcs-mr-edit`, `vcs-discussions`) в `cli/gennady.ts` (switch + help), обновить `cli/cmd/README.md` (таблица команд + use cases), обновить `cli/AGENTS.md` (таблица команд).
- **Scope:** `vcs-mr-management`
- **Module:** `integration`
- **Dependencies:** TSK-91, TSK-92, TSK-93
- **Spec References:** FR-MR-22a, parent CLI NFC-23
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps                   | Status   |
| --- | ---- | ---------------------- | -------- |
| P1  | impl | TSK-91, TSK-92, TSK-93 | [x] DONE |

### P1 — impl

- **Objective:** 3 новых `case` в `gennady.ts` switch + 3 строки в help-таблице. 3 строки в `cli/AGENTS.md` таблице. 3 строки + use cases в `cli/cmd/README.md`.
- **Target Files:**
  - `cli/gennady.ts` (MODIFY)
  - `cli/AGENTS.md` (MODIFY)
  - `cli/cmd/README.md` (MODIFY)
- **Exit:** `gennady help` показывает три новые команды; `gennady vcs-mr-create --help` работает

## 5. Verification

| Command                              | Required by      |
| ------------------------------------ | ---------------- |
| `tsc --noEmit`                       | typescript-rules |
| `npx gennady help` (ручная проверка) | —                |

## 7. Execution Log

| Round | Date | Status | Notes |
|-------|------|--------|-------|
| R1 | 2025-06-29 | PASS | All 3 commands registered in gennady.ts switch, AGENTS.md table, cmd/README.md. |
