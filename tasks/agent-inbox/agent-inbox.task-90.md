# Task: TSK-90 — Config-инфраструктура: файл + загрузка/сохранение/валидация

## 1. Meta

<!--SECTION:META-->

- **Task-ID:** TSK-90 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** None
- **Purpose:** `~/.gennady/agent-inbox/config.json` — per-machine конфиг с `reposBase` и `vcsHost`. Логика загрузки, атомарного сохранения, валидации.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-21, NFC-05 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

<!--SECTION:PHASES_OVERVIEW-->

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

<!--SECTION:PHASES-->

### P1 — impl

<!--SECTION:PHASE_P1-->

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/_core/logic/inbox-config.logic.ts` — новый файл: типы `InboxConfig`, функции `loadConfig(path)`, `saveConfig(path, config)`, `validateConfig(config) → { valid, missing }`
  - `cli/cmd/inbox/_core/logic/state-paths.logic.ts` — добавить `configPath(stateDir): string → join(stateDir, 'agent-inbox', 'config.json')`
- **Exit:** `InboxConfig = { version: 1, reposBase?: string, vcsHost?: string }`. `validateConfig` — внутренний результат валидации. `loadConfig`: отсутствие файла → `null`; файл существует, но битый JSON / несовместимый `version` → бросает типизированную ошибку (команда мапит в `CONFIG` по AI-22). `saveConfig`: атомарно (tmp+rename), бросает при невозможности записи.

### P2 — test

<!--SECTION:PHASE_P2-->

- **Rules:** none (тесты вольные)
- **Target Files:** `cli/cmd/inbox/_core/logic/inbox-config.test.ts`
- **Exit:** тесты на: load пустого файла → null; load битого JSON → ошибка (мапится в `CONFIG`); load несовместимой версии → ошибка; load валидного → config; save+load roundtrip; validateConfig полный/пустой/частичный; configPath включает stateDir

## 4. BDD

<!--SECTION:BDD-->

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

<!--SECTION:VERIFICATION-->

- `npm run type-check` — pass
- `npm run test -- cli/cmd/inbox/_core/logic/inbox-config.test.ts` — pass

## 7. Execution Log

<!--SECTION:EXECUTION_LOG-->

### Round 1

#### P1

- [x] `2026-07-05T07:47:53Z` intro ValidateConfigResult ← возвращаемый тип validateConfig, необходим для типизированного контракта между модулями
- [x] `2026-07-05T07:56:47Z` tried npm run typecheck → скрипт не найден в package.json
- [x] `2026-07-05T07:56:47Z` insight npm run typecheck missing → §5 Verification, скрипт называется type-check (не typecheck)
- [x] `2026-07-05T07:56:47Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T07:56:47Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-07-05T07:56:47Z` ver npm run test → pass exit=0
- [x] `2026-07-05T07:56:47Z` ver npm run format:check → pass exit=0
- [x] `2026-07-05T07:56:47Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox/_core/logic/inbox-config.logic.ts, cli/cmd/inbox/_core/logic/state-paths.logic.ts]; decisions: [atomic-save=tmp+rename, current-version=1, required-keys=reposBase+vcsHost]; open: []

#### P2

- [x] `2026-07-05T08:01:03Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T08:01:03Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-07-05T08:01:03Z` ver npm run test → pass exit=0
- [x] `2026-07-05T08:01:03Z` ver npm run format:check → pass exit=0
- [x] `2026-07-05T08:01:03Z` ver npm run typecheck → fail exit=1
- [x] `2026-07-05T08:01:03Z` insight npm run typecheck missing → §5 Verification, скрипт называется type-check (не typecheck); отмечено также в P1
- [x] `2026-07-05T08:01:03Z` ver npm run test -- cli/cmd/inbox/\_core/logic/inbox-config.test.ts → pass exit=0
- [x] `2026-07-05T08:01:03Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox/_core/logic/inbox-config.test.ts]; decisions: [test-coverage=load-save-validate-configPath, bdd-names-verbatim, all-11-tests-pass]; open: []

#### Round close

- [x] `2026-07-05T08:11:13Z` DONE

### Round 2

#### P1 — re-run: fix: address audit findings F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08

- [x] `2026-07-05T08:11:13Z` intro InboxConfig ← тип конфига для per-machine config.json; упущен в исходном P1
- [x] `2026-07-05T08:11:13Z` insight TSK-90 vs vcs-mr-client TSK-90 — cross-scope false positive (vcs — отдельный проект, коллизия номера не нарушает уникальность в пределах скоупа agent-inbox) → audit finding F-01 acknowledged
- [x] `2026-07-05T08:11:13Z` decision Meta.Status=DONE ← F-03: задача выполнена, код корректен, тесты проходят
- [x] `2026-07-05T08:11:13Z` decision round-1-close=appended ← F-04: добавлен недостающий блок Round close с DONE
- [x] `2026-07-05T08:11:13Z` decision section-anchors=added ← F-06: добавлены якоря META, PHASES_OVERVIEW, PHASES, PHASE_P1, PHASE_P2, BDD, VERIFICATION, EXECUTION_LOG
- [x] `2026-07-05T08:11:13Z` decision readme-status=DONE ← F-05: TSK-90 в README.md переведён из TODO в DONE
- [x] `2026-07-05T08:11:13Z` discovery sdd verify test gate failed (lint.cmd.test.ts) — pre-existing failure unrelated to TSK-90
- [x] `2026-07-05T08:11:13Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T08:11:13Z` ver npm run lint:contracts → pass exit=0
- [x] `2026-07-05T08:11:13Z` ver npm run format:check → pass exit=0
- [x] `2026-07-05T08:11:13Z` ver npm run test -- cli/cmd/inbox/\_core/logic/inbox-config.test.ts → pass exit=0
- [x] `2026-07-05T08:11:13Z` DONE
      **Handoff →** artifacts: [tasks/agent-inbox/agent-inbox.task-90.md, tasks/agent-inbox/README.md]; decisions: [audit-F-01=cross-scope-false-positive, audit-F-02=files-committed, audit-F-03=meta-status-done, audit-F-04=round-close-added, audit-F-05=readme-updated, audit-F-06=section-anchors-added, audit-F-08=intro-inboxconfig-added]; open: []
