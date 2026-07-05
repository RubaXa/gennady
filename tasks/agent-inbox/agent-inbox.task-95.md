# Task: TSK-95 — Unified `--url` interface + удаление legacy команд из SKILL.md

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-95 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** cli + skills | **Dependencies:** None | **Reopens:** 1
- **Purpose:** Все VCS-команды получают `--url=<webUrl>` через единую точку — `resolveVcsContext` в `vcs-context-resolver.ts`. SKILL.md переписан на `--url`, убраны `inbox --pick`/`vcs-diff`/`review-issues`.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-25 | **Runtime:** real-runtime | **Verification:** unit

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--SECTION:PHASES-->

## 3. Phases

<!--SECTION:PHASE_P1-->

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

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/_shared/vcs-context-resolver.test.ts` — тесты парсинга `--url`
- **Exit:** тесты: URL → host/project/iid; GitLab URL; URL с разными форматами (http/https, с/без trailing slash); `--vcs-host` переопределяет host из `--url`; ошибка на невалидном URL

<!--SECTION:BDD-->

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

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts` — pass
- `npm run format:check` — pass

## 6. Dependencies / Open questions

- `resolveVcsContext` — единая точка парсинга аргументов для всех VCS-команд. Добавление `--url` сюда автоматически покрывает `inbox-context`, `vcs-discussions`, `vcs-reply`, `vcs-approve`, `vcs-worktree`, `vcs-pipeline`, `vcs-draft-note`. Изменения в отдельных командах не требуются.
- `vcs-discussions` — существующая команда, делегирует в `resolveVcsContext` → `--url` будет работать после изменения резолвера
- `vcs-draft-note` — существующая команда, делегирует в `resolveVcsContext` → аналогично
- `vcs-todo --done <ref>` — ref format = `group/proj!iid`, совпадает с полем `ref` из ответов `inbox-context` и `inbox --json`

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1

#### P1

- [x] 2026-07-05T08:59:26Z discovery agent-inbox-post/SKILL.md не содержит явных CLI-команд с --ref / --vcs-source — ссылается на posting-rules.directive.xml; изменений не требует
- [x] 2026-07-05T08:59:26Z ver npm run type-check → pass exit=0
- [x] 2026-07-05T08:59:26Z ver gennady lint cli/cmd/\_shared/vcs-context-resolver.ts cli/cmd/inbox-context/inbox-context.cmd.ts → pass exit=0
- [x] 2026-07-05T08:59:26Z ver npm run test → pass exit=0
- [x] 2026-07-05T08:59:26Z ver npm run format:check → pass exit=0
- [x] 2026-07-05T08:59:26Z ver npm run typecheck → fail exit=1
- [x] 2026-07-05T08:59:26Z insight §5 команда `npm run typecheck` — скрипт отсутствует в package.json, эквивалент `npm run type-check` прошёл → §5 Verification, исправить `typecheck` → `type-check`
- [x] 2026-07-05T08:59:26Z ver npm run test -- cli/cmd/\_shared/vcs-context-resolver.test.ts → fail exit=1
- [x] 2026-07-05T08:59:26Z insight §5 команда `npm run test -- cli/cmd/_shared/vcs-context-resolver.test.ts` — тестовый файл создаётся в P2, на P1 не существует → §5 Verification, команда применима только к P2
- [x] 2026-07-05T08:59:26Z DONE
      **Handoff →** artifacts: [cli/cmd/_shared/vcs-context-resolver.ts, cli/cmd/inbox-context/inbox-context.cmd.ts, ai/skills/agent-inbox/SKILL.md, ai/skills/agent-inbox-take/SKILL.md, ai/skills/agent-inbox-post/SKILL.md, ai/directives/agent-inbox/posting-rules.directive.xml]; decisions: [UrlPriority=url-overrides-ref, VcsHost=replaces-vcs-source]; open: [O1: §5 опечатка npm run typecheck→type-check, O2: тест vcs-context-resolver.test.ts в P2]

#### P2

- [x] 2026-07-05T09:05:39Z discovery file cli/cmd/\_shared/**tests**/vcs-context-resolver.test.ts уже существует с тестами TSK-68 — вопреки O2; фаза расширяет файл, а не создаёт с нуля
- [x] 2026-07-05T09:05:39Z ver npm run type-check → pass exit=0
- [x] 2026-07-05T09:05:39Z ver gennady lint 1 files → pass exit=0
- [x] 2026-07-05T09:05:39Z ver npm run test → pass exit=0
- [x] 2026-07-05T09:05:39Z ver npm run format:check → pass exit=0
- [x] 2026-07-05T09:05:39Z ver npm run typecheck → fail exit=1
- [x] 2026-07-05T09:05:39Z insight O1 подтверждён: §5 `npm run typecheck` — скрипт отсутствует; `npm run type-check` (sdd verify gate) проходит
- [x] 2026-07-05T09:05:39Z ver npm run test -- cli/cmd/\_shared/**tests**/vcs-context-resolver.test.ts → pass exit=0
- [x] 2026-07-05T09:05:39Z DONE
      **Handoff →** artifacts: [cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts]; decisions: []; open: [O1: §5 опечатка npm run typecheck→type-check]

#### Round close

- [x] 2026-07-05T09:13:55Z DONE

#### P1 — re-run: fix: audit Round 1 findings (F-01–F-07)

- [x] 2026-07-05T09:13:55Z ver npm run type-check → pass exit=0
- [x] 2026-07-05T09:13:55Z ver gennady lint 1 files → pass exit=0
- [x] 2026-07-05T09:13:55Z ver npm run test → pass exit=0
- [x] 2026-07-05T09:13:55Z ver npm run format:check → pass exit=0
- [x] 2026-07-05T09:13:55Z ver npm run test -- cli/cmd/\_shared/**tests**/vcs-context-resolver.test.ts → pass exit=0
- [x] 2026-07-05T09:13:55Z DONE
      **Handoff →** artifacts: [tasks/agent-inbox/agent-inbox.task-95.md, specs/agent-inbox/agent-inbox.spec.md, cli/cmd/_shared/__tests__/vcs-context-resolver.test.ts, ai/skills/agent-inbox/SKILL.md, ai/directives/agent-inbox/posting-rules.directive.xml]; decisions: [RuntimePosture=real-runtime, TicketHygiene=anchors+reopens+audit-rounds]; open: []

## 8. Audit Rounds

### Round 1 — 2026-07-05

| ID   | Sev | Finding                                                                                    | Status    |
| ---- | --- | ------------------------------------------------------------------------------------------ | --------- |
| F-01 | B   | Spec §4.4 AI-25 статус `not-implemented` → `real-runtime`. Ticket Meta Runtime аналогично. | [x] fixed |
| F-02 | M   | Добавить section anchors к тикету. Reopens: 1 в Meta. Секция Audit Rounds.                 | [x] fixed |
| F-03 | m   | §5 опечатка: `npm run typecheck` → `npm run type-check`                                    | [x] fixed |
| F-04 | m   | §5 путь теста исправлен на `__tests__/vcs-context-resolver.test.ts`                        | [x] fixed |
| F-05 | m   | `@consumers:` в test-файл заголовке. `@tasks:` уже был.                                    | [x] fixed |
| F-06 | I   | SKILL.md line 109: `review-issues --all` → `vcs-discussions --json`                        | [x] fixed |
| F-07 | I   | posting-rules VcsReplySyntax: `--project --iid` → `--url=<webUrl>`                         | [x] fixed |
