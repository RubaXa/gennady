# vcs-cli: Module Specification

## 1. Module Vision

CLI-команды VCS-домена: тонкие обёртки над `vcs-client`. Авто-детект контекста (ветка, проект, хост, токен) через `vcs-context-resolver`. Единый DI-паттерн с `resolveVcsContext` + `VcsGitlabClient`. Поддержка `--dry-run` на всех мутирующих командах.

→ Parent scope: [../vcs.spec.md](../vcs.spec.md)

## 2. Approved Golden DX

```bash
# --- Авто-детект контекста (branch → project/host/token из git remote + env) ---
gennady vcs-approve                                      # approve MR для текущей ветки
gennady vcs-approve --ref group/repo!42                  # явный ref
gennady vcs-approve --project group/repo --iid 42        # проект + IID
gennady vcs-approve --revoke                             # отозвать approve
gennady vcs-approve --dry-run                            # preview

# --- Diff: изменённые файлы MR ---
gennady vcs-diff --ref group/repo!42                     # список файлов
gennady vcs-diff --ref group/repo!42 --path src/foo.ts   # + контент файла

# --- Draft notes: CRUD + publish ---
gennady vcs-draft-note --ref group/repo!42 --list
gennady vcs-draft-note --ref group/repo!42 --create "Текст"
gennady vcs-draft-note --ref group/repo!42 --update 123 --body "Новый текст"
gennady vcs-draft-note --ref group/repo!42 --delete 123
gennady vcs-draft-note --ref group/repo!42 --publish 123

# --- Job management ---
gennady vcs-job --ref group/repo!42 --job lint
gennady vcs-job --ref group/repo!42 --job 12345 --action play
gennady vcs-job --ref group/repo!42 --job lint --action retry

# --- Job logs ---
gennady vcs-job-log --ref group/repo!42 --job lint
gennady vcs-job-log --ref group/repo!42 --job 12345 --raw

# --- Pipeline status ---
gennady vcs-pipeline --ref group/repo!42                 # только упавшие джобы
gennady vcs-pipeline --ref group/repo!42 --all --logs    # все джобы + логи
gennady vcs-pipeline --ref group/repo!42 --status running
gennady vcs-pipeline --ref group/repo!42 --json

# --- Reply: постинг в дискуссии MR ---
echo '[{"discussionId":"abc","body":"reviewed"}]' | gennady vcs-reply --project=my/repo --iid=42

# --- Todo management ---
gennady vcs-todo --done group/repo!42                    # все todo для MR → done
gennady vcs-todo --id gid://gitlab/Todo/123              # конкретный todo

# --- Worktree: подготовка read-only окружения ---
gennady vcs-worktree --ref group/project!42
gennady vcs-worktree --cleanup <worktree-path>
gennady vcs-worktree --cleanup-all
```

## 3. Entity Inventory (Closed-World)

### VcsApproveCommand

- **Type:** Command
- **Purpose:** Approve или отозвать approve GitLab MR. Идемпотентен: уже approved → info + exit 0.
- **DI deps:** `resolveVcsContext: VcsContextResolver`, `stdout: NodeJS.WriteStream`, `stderr: NodeJS.WriteStream`, `exit: ExitFn`
- **Options:** `--ref`, `--project`, `--iid`, `--branch`, `--host`, `--dry-run/--dry`, `--revoke/--unapprove`

### VcsDiffCommand

- **Type:** Command
- **Purpose:** Показать список изменённых файлов MR через `getChanges`; опционально — содержимое файла через `getFileContent`.
- **DI deps:** `resolveVcsContext: VcsContextResolver`, `stdout`, `stderr`, `exit`
- **Options:** `--ref`, `--path`, `--host`, `--dry-run/--dry`

### VcsDraftNoteCommand

- **Type:** Command
- **Purpose:** CRUD + publish черновиков (draft notes) GitLab MR. Ровно один action-флаг обязателен.
- **DI deps:** `resolveVcsContext: VcsContextResolver`, `stdout`, `stderr`, `exit`
- **Options:** `--ref`, `--project`, `--iid`, `--host`, `--list`, `--create <body>`, `--update <id>`, `--body <text>`, `--delete <id>`, `--publish <id>`, `--dry-run/--dry`

### VcsJobCommand

- **Type:** Command
- **Purpose:** Просмотр статуса или управление CI-джобой (play, cancel, retry). `retry` — алиас `play`.
- **DI deps:** `resolveVcsContext: VcsContextResolver`, `stdout`, `stderr`, `exit`
- **Options:** `--ref` (обязателен с iid), `--job` (обязателен), `--action` (status/play/cancel/retry), `--host`, `--dry-run/--dry`

### VcsJobLogCommand

- **Type:** Command
- **Purpose:** Получение сырого лога (trace) CI-джобы. Smart-режим: фильтрация ошибок через `filterLog`. `--raw` — без фильтрации.
- **DI deps:** `resolveVcsContext: VcsContextResolver`, `stdout`, `stderr`, `exit`
- **Options:** `--ref` (обязателен с iid), `--job` (обязателен), `--host`, `--raw`

### VcsPipelineCommand

- **Type:** Command
- **Purpose:** Статус CI-пайплайна MR. По умолчанию — только упавшие джобы. `--all`, `--status`, `--logs`, `--json`.
- **DI deps:** `resolveVcsContext: VcsContextResolver`, `stdout`, `stderr`, `exit`
- **Options:** `--ref`, `--host`, `--all`, `--status`, `--logs`, `--json`, `--dry-run/--dry`

### VcsReplyCommand

- **Type:** Command
- **Purpose:** Постинг в GitLab MR: reply в тред, новая дискуссия, line-comment, resolve/reopen, code suggestion, edit/delete заметок. Читает JSON-массив из stdin.
- **DI:** Принимает `MainOpts` напрямую: vcs, token, project, iid, dryRun, stdinJsonArray, host.
- **Options:** `--project` (обязателен), `--iid` (обязателен), `--dry-run/--dry`, `--vcs-host`
- **Item types:** `reply`, `discussion`, `line`, `delete-note`, `delete-discussion`, `resolve`, `reopen`, `edit-note`, `suggestion`

### VcsTodoCommand

- **Type:** Command
- **Purpose:** Отметка GitLab Todo как done: все todo для MR (`--done <ref>`) или конкретный todo по id (`--id`).
- **DI:** Принимает `MainOpts` напрямую: doneRef, todoId, dryRun, host, vcsContext.
- **Options:** `--done <ref>`, `--id <todoId>`, `--dry-run/--dry`, `--vcs-host/--host`

### VcsWorktreeCommand

- **Type:** Command
- **Purpose:** Подготовка read-only detached git worktree для MR-ревью. GC старых worktree (TTL=3h) на каждом prepare. Clone-кеширование.
- **DI:** Использует `resolveVcsContext` напрямую, `VcsGitlabClient`, и локальные модули логики.
- **Options:** `--ref` (обязателен для prepare), `--vcs-host`, `--repos-base`, `--state-dir`, `--cleanup <path>`, `--cleanup-all`

### VcsContextResolver

- **Type:** Function (shared)
- **Purpose:** Авто-детект project/host/iid/token из CLI-аргументов, git remote, env-переменных.
- **Signature:** `(args: Record<string, unknown>, gitDir?: string) => Promise<VcsResolvedContext>`
- **Located:** `cli/cmd/_shared/vcs-context-resolver.ts`

## 4. Functional Requirements

| ID    | Требование                                                                                |
| ----- | ----------------------------------------------------------------------------------------- |
| FR-01 | Все VCS CLI-команды используют `resolveVcsContext` для авто-детекта контекста             |
| FR-02 | `VcsClient` создаётся инлайн: `new VcsGitlabClient({ baseUrl, token })`                   |
| FR-03 | Парсинг аргументов через `parseArgs` из `shared/common/parse-args.ts`                     |
| FR-04 | Все мутирующие команды поддерживают `--dry-run`/`--dry`                                   |
| FR-05 | Все команды зарегистрированы в `cli/gennady.ts` через `switch(command)`                   |
| FR-06 | Каждая команда имеет `help.ts` с `printHelp()` и `index.ts` с entry point                 |
| FR-07 | Exit code: `0` — успех (включая идемпотентные кейсы), `1` — ошибка                        |
| FR-08 | Токен: `GITLAB_PERSONAL_TOKEN` из env; fallback — ошибка с Usage                          |
| FR-09 | `--vcs-host`/`--host` позволяет указать self-hosted GitLab (переопределяет авто-детект) |
| FR-10 | Логирование через `#logger` (алиас на `service/logger/logger.ts`)                         |

## 5. Non-Functional Constraints

- **NFC-01**: Zero runtime dependencies
- **NFC-02**: Все экспортируемые функции покрыты DBC-контрактами
- **NFC-03**: File headers: `// @file:`, `// @consumers:`
- **NFC-04**: DI для тестирования: deps-объекты с `resolveVcsContext`, `stdout`, `stderr`, `exit`

## 6. File Structure

```
cli/cmd/vcs-approve/          # gennady vcs-approve
├── vcs-approve.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-approve.test.ts

cli/cmd/vcs-diff/             # gennady vcs-diff
├── vcs-diff.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-diff.test.ts

cli/cmd/vcs-draft-note/       # gennady vcs-draft-note
├── vcs-draft-note.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-draft-note.test.ts

cli/cmd/vcs-job/              # gennady vcs-job
├── vcs-job.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-job.test.ts

cli/cmd/vcs-job-log/          # gennady vcs-job-log
├── vcs-job-log.cmd.ts
├── help.ts
├── index.ts

cli/cmd/vcs-pipeline/         # gennady vcs-pipeline
├── vcs-pipeline.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-pipeline.test.ts

cli/cmd/vcs-reply/            # gennady vcs-reply
├── vcs-reply.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-reply.*.test.ts

cli/cmd/vcs-todo/             # gennady vcs-todo
├── vcs-todo.cmd.ts
├── help.ts
├── index.ts
└── __tests__/vcs-todo.test.ts

cli/cmd/vcs-worktree/         # gennady vcs-worktree
├── vcs-worktree.cmd.ts
├── help.ts
├── index.ts
├── _core/logic/worktree-ops.logic.ts
├── _core/logic/locate-clone.logic.ts
└── __tests__/vcs-worktree.*.test.ts

cli/cmd/_shared/              # Общие утилиты VCS CLI
├── vcs-context-resolver.ts
├── log-filter.ts             # фильтрация логов (vcs-job-log)
└── __tests__/
```

## 7. Decision Log

### D-001 — Umbrella-спек для VCS CLI

- **Status:** active
- **Recorded:** session audit-refine, vcs-cli, 2026-06-28
- **Why:** 9 VCS CLI-команд — тонкие обёртки над `vcs-client` с единым паттерном (resolveVcsContext + VcsGitlabClient + dry-run). Отдельная спека на каждую создала бы 9 почти идентичных документов. Umbrella-спек описывает общий паттерн и перечисляет индивидуальные опции.
- **Risk accepted:** При добавлении новой VCS-команды нужно обновить только одну спеку.
- **Rejected alternatives:** 9 отдельных спек (фрагментация, дублирование boilerplate).

### D-002 — vcs-worktree в VCS-скоупе

- **Status:** active
- **Recorded:** session audit-refine, vcs-cli, 2026-06-28
- **Why:** vcs-worktree — операция подготовки git-окружения для ревью. Зависит от `VcsGitlabClient` для получения данных MR. Логически принадлежит VCS-скоупу, хотя и работает с git напрямую.
- **Rejected alternatives:** Отдельный скоуп `git-worktree` — избыточно для одной команды.

## 8. Handoff to Task Scaffolding

- **Implementation files:** 9 команд существуют, `vcs-context-resolver.ts` + `log-filter.ts` в `_shared/`
- **Stack dependencies:** TypeScript, node:test
- **Module Rules Additions:** `typescript-rules`, `vcs/git.xml`
- **Open risks:**
  - `vcs-job-log` — нет тестов (`__tests__/` отсутствует)
  - GitHub-адаптер для большинства команд — deferred (stub)
  - `vcs-reply` и `vcs-todo` используют собственный DI-паттерн (MainOpts), не унифицированы с остальными
