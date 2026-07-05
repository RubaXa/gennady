# Task: TSK-90 — Config-инфраструктура: файл + загрузка/сохранение/валидация

## 1. Meta

- **Task-ID:** TSK-90 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** None
- **Purpose:** `~/.gennady/agent-inbox/config.json` — per-machine конфиг с `reposBase` и `vcsHost`. Логика загрузки, атомарного сохранения, валидации.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-21, NFC-05 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/_core/logic/inbox-config.logic.ts` — новый файл: типы `InboxConfig`, функции `loadConfig(path)`, `saveConfig(path, config)`, `validateConfig(config) → { valid, missing }`
  - `cli/cmd/inbox/_core/logic/state-paths.logic.ts` — добавить `configPath(stateDir): string → join(stateDir, 'agent-inbox', 'config.json')`
- **Exit:** `InboxConfig = { version: 1, reposBase?: string, vcsHost?: string }`. `validateConfig` — внутренний результат валидации. `loadConfig`: отсутствие файла → `null`; файл существует, но битый JSON / несовместимый `version` → бросает типизированную ошибку (команда мапит в `CONFIG` по AI-22). `saveConfig`: атомарно (tmp+rename), бросает при невозможности записи.

### P2 — test

- **Rules:** none (тесты вольные)
- **Target Files:** `cli/cmd/inbox/_core/logic/inbox-config.test.ts`
- **Exit:** тесты на: load пустого файла → null; load битого JSON → ошибка (мапится в `CONFIG`); load несовместимой версии → ошибка; load валидного → config; save+load roundtrip; validateConfig полный/пустой/частичный; configPath включает stateDir

## 4. BDD

- `loadConfig("/nonexistent")` → `null` (файла нет)
- `loadConfig("/corrupt.json")` с битым JSON → бросает ошибку (`CONFIG` по AI-22)
- `loadConfig` с `{"version": 2, ...}` → бросает ошибку (`CONFIG` по AI-22)
- `validateConfig({version:1, reposBase:"/p", vcsHost:"h"})` → `{valid: true, missing: []}`
- `validateConfig({version:1})` → `{valid: false, missing: ["reposBase", "vcsHost"]}`
- `validateConfig({version:1, reposBase:"/p"})` → `{valid: false, missing: ["vcsHost"]}`
- `saveConfig(path, config)` + `loadConfig(path)` → roundtrip, данные совпадают
- `saveConfig` в несуществующую директорию → создаёт родительские директории рекурсивно
- `configPath("/custom/state")` → `"/custom/state/agent-inbox/config.json"`
- `configPath` без аргументов → `<homedir>/.gennady/agent-inbox/config.json`

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/inbox/_core/logic/inbox-config.test.ts` — pass

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [inbox-config.logic.ts, state-paths.logic.ts]; decisions: []; open: []

#### P2

- [ ] **Handoff →** artifacts: [inbox-config.test.ts]; decisions: []; open: []
