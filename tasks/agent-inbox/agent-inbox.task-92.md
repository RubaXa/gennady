# Task: TSK-92 — Подкоманда `gennady inbox config`

## 1. Meta

- **Task-ID:** TSK-92 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-cli | **Dependencies:** TSK-90 (предоставляет `validateConfig()`, `loadConfig()`, `saveConfig()`, `configPath()` из `inbox-config.logic.ts` и `state-paths.logic.ts`)
- **Purpose:** CLI-подкоманда `gennady inbox config` для управления `~/.gennady/agent-inbox/config.json`. Агент использует `--set` для записи ответов юзера. Юзер использует `--init` для ручного wizard.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-21, AI-22 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/config.cmd.ts` — новый файл: точка входа для `gennady inbox config`. Использует `configPath(stateDir)` из TSK-90 для разрешения пути с учётом `--state-dir`.
  - `cli/cmd/inbox/config-index.ts` — новый файл: ре-экспорт для динамического импорта
  - `cli/cmd/inbox/config-help.ts` — новый файл: help-текст
  - `cli/gennady.ts` — добавить диспетчеризацию: `case 'inbox':` → если `process.argv[3] === 'config'` → `import('./cmd/inbox/config-index.ts')`; иначе текущий `import('./cmd/inbox/index.ts')`. Добавить help-секцию для `inbox config`.
- **Exit:** все 6 операций + error contract:

```
gennady inbox config                    → JSON текущего конфига (или {"configured": false})
gennady inbox config --set reposBase=/p → сохраняет ключ атомарно (tmp+rename), печатает обновлённый конфиг
gennady inbox config --set vcsHost=h    → сохраняет ключ
gennady inbox config --set k1=v1 --set k2=v2  → атомарно оба ключа
gennady inbox config --unset reposBase  → удаляет ключ
gennady inbox config --path             → печатает абсолютный путь к config.json
gennady inbox config --init             → интерактивный wizard (stdin/stdout):
                                          1. запрашивает reposBase, валидирует (абсолютный путь, существует, isDirectory)
                                          2. при невалидном вводе → ошибка + перезапрос
                                          3. запрашивает vcsHost, валидирует (непустой)
                                          4. пишет конфиг, выводит результат
gennady inbox config --help             → help-текст
```

**Error contract (AI-22):** `{"ok": false, "error": "CONFIG", "detail": "..."}` при: невалидном JSON в конфиге, нечитаемом файле, несовместимой версии. Ошибки записи (permission denied, диск полон) → `CONFIG`. Отсутствие файла → не ошибка (`configured: false`).

**`--state-dir`:** разрешается через `resolveStateDir(argv)` из `state-paths.logic.ts`; `config.cmd.ts` получает готовый путь через `configPath(stateDir)`, не переразрешает.

### P2 — test

- **Rules:** none
- **Target Files:** `cli/cmd/inbox/config.test.ts`
- **Exit:** тесты на:
  - `--set` одиночный/множественный
  - `--unset` существующего и несуществующего ключа
  - `--set reposBase=` с пустым значением → ошибка валидации
  - `--set reposBase=/nonexistent` → ошибка (путь не существует)
  - `--set reposBase=/dev/null` → ошибка (не директория)
  - `--path` возвращает корректный путь
  - `--init`: валидный ввод → конфиг сохранён; невалидный путь → перезапрос
  - Конкурентные `--set`: файл всегда остаётся валидным JSON (tmp+rename защищает от torn write)
  - `--help` выводит usage summary со списком опций
  - Повреждённый конфиг (битый JSON) → `{"ok": false, "error": "CONFIG", ...}`

## 4. BDD

- `gennady inbox config --set reposBase=/Users/k/Dev --set vcsHost=gitlab.example.com` → конфиг сохранён, вывод: `{"configured": true, "reposBase": "/Users/k/Dev", "vcsHost": "gitlab.example.com"}`
- `gennady inbox config` на машине с конфигом → `{"configured": true, "reposBase": "...", "vcsHost": "..."}`
- `gennady inbox config` на машине без конфига → `{"configured": false}`
- `gennady inbox config --unset vcsHost` → vcsHost удалён; следующий `inbox --json` показывает `missing: ["vcsHost"]`
- `gennady inbox config --unset vcsHost` (ключа нет в конфиге) → no-op, вывод без изменений
- `gennady inbox config --set reposBase=` (пустое значение) → ошибка валидации: `{"ok": false, "error": "CONFIG", "detail": "reposBase не может быть пустым"}`
- `gennady inbox config --set reposBase=/nonexistent/path` → ошибка: путь не существует
- `gennady inbox config --init`:
  - GIVEN no config.json | WHEN `--init`, ввод `/nonexistent` → "путь не существует", перезапрос
  - WHEN ввод `/valid/path`, затем `gitlab.example.com` → конфиг сохранён
- `gennady inbox config --path` → `/Users/.../.gennady/agent-inbox/config.json`
- `gennady inbox config --path --state-dir=/tmp/gn` → `/tmp/gn/agent-inbox/config.json`
- `gennady inbox config --help` → usage summary с `--set`, `--unset`, `--path`, `--init`, `--help`

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/inbox/config.test.ts` — pass

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [config.cmd.ts, config-index.ts, config-help.ts, gennady.ts]; decisions: [D44]; open: []

#### P2

- [ ] **Handoff →** artifacts: [config.test.ts]; decisions: []; open: []
