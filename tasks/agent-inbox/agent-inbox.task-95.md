# Task: TSK-95 — Unified `--url` interface + удаление legacy команд из SKILL.md

## 1. Meta

- **Task-ID:** TSK-95 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** cli + skills | **Dependencies:** None
- **Purpose:** Все VCS-команды получают `--url=<webUrl>` через единую точку — `resolveVcsContext` в `vcs-context-resolver.ts`. SKILL.md переписан на `--url`, убраны `inbox --pick`/`vcs-diff`/`review-issues`.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-25 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/_shared/vcs-context-resolver.ts` — **Единая точка интеграции** для всех VCS-команд. Добавить `--url`: извлечь host, project path, iid из URL вида `https://<host>/<project>/-/merge_requests/<iid>`. `--url` имеет приоритет над `--ref`. Все VCS-команды (`inbox-context`, `vcs-discussions`, `vcs-reply`, `vcs-approve`, `vcs-worktree`, `vcs-pipeline`, `vcs-draft-note`) уже делегируют парсинг аргументов в `resolveVcsContext` — добавление `--url` сюда автоматически покрывает их все. Изменения в отдельных командах не требуются.
  - `cli/cmd/inbox-context/inbox-context.cmd.ts` — добавить `--url` в `parseValue` (не удаляя `--ref` — оба флага сосуществуют, `--url` имеет приоритет). Это единственная команда, требующая явного добавления `--url` в свой `parseValue` — остальные VCS-команды получают `--url` автоматически через `resolveVcsContext` (их `parseValue` уже пробрасывает неизвестные флаги в резолвер).
  - `ai/skills/agent-inbox/SKILL.md` — обновить секцию «VCS-инструменты»:
    - Все команды: `--ref X` → `--url <webUrl>`
    - Убрать `inbox --pick` (legacy)
    - Убрать `vcs-diff --ref --path`
    - Заменить `review-issues` на `vcs-discussions --url --all`
    - `vcs-draft-note --ref` → `vcs-draft-note --url`
    - Обновить шаг 3 процедуры: `inbox-context --url <webUrl>` (сейчас там `--ref` — заменить)
  - `ai/skills/agent-inbox-take/SKILL.md` — переписать шаг 1 на `inbox-context --url` (вместо трёх легаси-вызовов). `--vcs-source` → `--vcs-host` везде.
  - `ai/skills/agent-inbox-post/SKILL.md` — `vcs-reply --url`, `vcs-approve --url`
  - `ai/directives/agent-inbox/posting-rules.directive.xml` — `<VcsReplySyntax>`: `--vcs-source` → `--vcs-host` (строка ~158)
  - **Уже применено (не переделывать):** ссылки на take/post в шагах 4/8 SKILL.md, RE_READ маркер, СТОП-ЧЕК в take, REMIT-блок, `vcs-worktree --cleanup` убран из шага 9
- **Exit:** все команды в SKILL.md используют `--url`. Старые флаги остаются в коде. `resolveVcsContext` поддерживает парсинг URL. take переписан. VcsReplySyntax поправлен.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/_shared/vcs-context-resolver.test.ts` — тесты парсинга `--url`
- **Exit:** тесты: URL → host/project/iid; GitLab URL; URL с разными форматами (http/https, с/без trailing slash); `--vcs-host` переопределяет host из `--url`; ошибка на невалидном URL

## 4. BDD

- `gennady inbox-context --url https://gitlab.example.com/group/proj/-/merge_requests/510` → резолвит host=`gitlab.example.com`, project=`group/proj`, iid=`510`
- `gennady inbox-context --url https://gitlab.example.com/group/sub/proj/-/merge_requests/510` → project=`group/sub/proj` (вложенные группы)
- `gennady inbox-context --url http://gitlab.example.com/group/proj/-/merge_requests/510` → http тоже работает
- `gennady inbox-context --url https://gitlab.example.com/group/proj/-/merge_requests/510/` → trailing slash игнорируется
- `gennady inbox-context --url https://gitlab.example.com/group/proj` (без MR) → `INVALID_REF` error (AI-22)
- `gennady inbox-context --url not-a-url` → `INVALID_REF` error
- `gennady inbox-context --ref group/proj!510` → продолжает работать (backward compat)
- `gennady inbox-context --url <url> --vcs-host=H` → `--vcs-host` переопределяет host из URL
- `gennady inbox-context --url https://gitlab.example.com/group/proj/-/merge_requests/510 --ref other/proj!999` → resolves from `--url`, ignores `--ref`
- SKILL.md: ни одной команды с `--ref` или `--project --iid` в основном flow (кроме `vcs-todo`)
- SKILL.md: нет упоминаний `inbox --pick`, `vcs-diff`, `review-issues`

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/_shared/vcs-context-resolver.test.ts` — pass
- `npm run format:check` — pass

## 6. Dependencies / Open questions

- `resolveVcsContext` — единая точка парсинга аргументов для всех VCS-команд. Добавление `--url` сюда автоматически покрывает `inbox-context`, `vcs-discussions`, `vcs-reply`, `vcs-approve`, `vcs-worktree`, `vcs-pipeline`, `vcs-draft-note`. Изменения в отдельных командах не требуются.
- `vcs-discussions` — существующая команда, делегирует в `resolveVcsContext` → `--url` будет работать после изменения резолвера
- `vcs-draft-note` — существующая команда, делегирует в `resolveVcsContext` → аналогично
- `vcs-todo --done <ref>` — ref format = `group/proj!iid`, совпадает с полем `ref` из ответов `inbox-context` и `inbox --json`

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [vcs-context-resolver.ts, inbox-context.cmd.ts, SKILL.md, agent-inbox-take/SKILL.md, agent-inbox-post/SKILL.md]; decisions: [D48]; open: []

#### P2

- [ ] **Handoff →** artifacts: [vcs-context-resolver.test.ts]; decisions: []; open: []
