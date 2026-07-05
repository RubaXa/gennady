# Task: TSK-91 — Structured config signal в `inbox` и `inbox-context`

## 1. Meta

- **Task-ID:** TSK-91 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** TSK-90 (предоставляет `validateConfig()`, `loadConfig()`, `configPath()` из `inbox-config.logic.ts` и `state-paths.logic.ts`)
- **Purpose:** `inbox.cmd.ts` и `inbox-context.cmd.ts` проверяют конфиг перед основной работой. Если неполный → structured JSON `{"configured": false, "missing": [...]}` вместо ошибки. Флаги `--vcs-host`/`--repos-base` переопределяют конфиг (backward compat).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-20 | **Runtime:** not-implemented | **Verification:** unit + integration

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/inbox.cmd.ts` — перед `getActionable()`: загрузить конфиг через `loadConfig(configPath(stateDir))`, проверить `validateConfig`. Если `--vcs-host` передан → `vcsHost` считается покрытым. Если `--repos-base` передан → `reposBase` считается покрытым. Если `!valid && missing.length > 0` → вывести `{"configured": false, "missing": [...]}` и `process.exit(0)`. Если всё ok → добавить `"configured": true` в JSON-вывод.
  - `cli/cmd/inbox-context/inbox-context.cmd.ts` — перед `resolveVcsContext()`: аналогичная проверка. Если `--vcs-host` передан вместе с `--ref` → хост покрыт явно (не через `--ref`, а отдельным флагом).
  - `cli/cmd/inbox/_core/logic/build-inbox-context.logic.ts` — существующая функция `buildInboxClient` принимает опциональный `vcsHost` из конфига (если `vcsSource` не передан явно).
- **Exit:** текстовый режим (без `--json`) печатает: «agent-inbox не настроен. Запустите gennady inbox config --init». JSON-режим возвращает structured signal. Backward compat: существующие вызовы с `--vcs-host` работают без конфига. Error responses следуют контракту AI-22.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/inbox/_core/logic/inbox-cmd-config.test.ts` — новый файл: интеграционные тесты config signal для `inbox`
  - `cli/cmd/inbox-context/inbox-context-cmd-config.test.ts` — новый файл: интеграционные тесты config signal для `inbox-context`
- **Exit:** тесты покрывают обе команды, включая corrupt config, partial config, flag override для обоих флагов, text mode.

## 4. BDD

**`gennady inbox`:**

- Машина без конфига → `gennady inbox --json` → `{"configured": false, "missing": ["reposBase", "vcsHost"]}`, exit 0
- Конфиг с `{"reposBase": "/p"}` (нет vcsHost) → `{"configured": false, "missing": ["vcsHost"]}`
- `gennady inbox --json --vcs-host=gitlab.example.com` (флаг покрывает vcsHost) → `{"configured": false, "missing": ["reposBase"]}`
- `gennady inbox --json --repos-base=/custom` (флаг покрывает reposBase, но нет vcsHost) → `{"configured": false, "missing": ["vcsHost"]}`
- Полный конфиг + флаги → флаги используются вместо конфига для соответствующих ключей
- Повреждённый `config.json` (битый JSON) → `{"configured": false, "missing": ["reposBase", "vcsHost"]}`
- `gennady inbox` (без `--json`) без конфига → человекочитаемое сообщение, exit 0

**`gennady inbox-context`:**

- `gennady inbox-context --ref group/proj!510 --json` без конфига → `{"configured": false, "missing": ["reposBase", "vcsHost"]}`, exit 0
- `gennady inbox-context --ref group/proj!510 --json --vcs-host=H` → `{"configured": false, "missing": ["reposBase"]}`
- `gennady inbox-context --ref group/proj!510 --json --vcs-host=H --repos-base=/p` → конфиг покрыт, продолжает работу
- `gennady inbox-context --ref group/proj!510` (без `--json`) без конфига → человекочитаемое сообщение, exit 0
- Конфиг содержит `reposBase: "/p"`, флаг `--repos-base` не передан → `reposBase` из конфига используется как значение для работы (не падает на дефолт `~/Developer`)
- `gennady inbox-context --url https://gitlab.example.com/group/proj/-/merge_requests/510 --json` без конфига → host извлечён из URL, `vcsHost` не требуется: `{"configured": false, "missing": ["reposBase"]}` (AI-20: `--url` покрывает `vcsHost`)
- `gennady inbox-context --url <URL> --json --repos-base=/p` без конфига → `vcsHost` из URL + `reposBase` из флага → `{"configured": true}`, продолжает работу

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/inbox/_core/logic/inbox-cmd-config.test.ts` — pass
- `npm run test -- cli/cmd/inbox-context/inbox-context-cmd-config.test.ts` — pass

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-07-05T09:16:04Z` ver sdd verify → pass (type-check, gennady lint, test, format:check)
- [x] `2026-07-05T09:17:03Z` ver npm run typecheck → fail exit=1 (скрипт в package.json называется `type-check`, не `typecheck` — ticket §5 discrepancy)
- [x] `2026-07-05T09:17:21Z` DONE
      **Handoff →** artifacts: [inbox.cmd.ts, inbox-context.cmd.ts, build-inbox-context.logic.ts]; decisions: [config-signal=structured-json, flag-override=coverage, sdd-verify=all-gates-pass]; open: []

#### P2

- [x] `2026-07-05T09:33:47Z` ver npm run typecheck → fail exit=1 (скрипт в package.json называется `type-check`, не `typecheck` — ticket §5 discrepancy; `sdd verify` покрывает type-check)
- [x] `2026-07-05T09:33:47Z` ver npm run test -- cli/cmd/inbox/\_core/logic/inbox-cmd-config.test.ts → pass exit=0
- [x] `2026-07-05T09:33:47Z` ver npm run test -- cli/cmd/inbox-context/inbox-context-cmd-config.test.ts → pass exit=0
- [x] `2026-07-05T09:33:47Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox/_core/logic/inbox-cmd-config.test.ts, cli/cmd/inbox-context/inbox-context-cmd-config.test.ts]; decisions: [all-bdd-scenarios-covered, flag-override-tested-both-flags, text-mode-tested]; open: []
