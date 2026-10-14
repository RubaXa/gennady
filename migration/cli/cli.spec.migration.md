# План миграции: specs/cli/cli.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** cli

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/cli/cli.spec.md` · строк: 2605 · scope-type: — · mermaid-блоков: 1 · якорей: 0
- обязательные целевые секции: `OVERVIEW`
- заголовки (level 2):
  - `## scope-type`
  - `## 1. Vision & Primary Goal`
  - `## 2. Project Type`
  - `## 3. Approved Golden DX Example`
  - `## Как встроить в AGENTS.md`
  - `## 7. Scope Dependencies`
  - `## 8. Bootstrap Requirements`
  - `## 9. Module Map`
  - `## Critic Rounds`
  - `## 10. Execution Insights`
  - `## 11. Handoff to module-decomposition`
- тикеты:
  - `tasks/cli/alt-opinion/cli-alt-opinion.task-23.md` · `CLI-alt-core` · — · Реализовать доменные типы `AltOpinionModel`, `AltOpinionResult`, `AltOpinionReport`, DI-порт `AltOpinionModelPort`, кастомный парсер `alt-opinion-parser.ts` с поддержкой `::`-синтаксиса, и ядро `alt-opinion-runner.ts` с параллельным опросом моделей (Promise.allSettled) и опциональным синтезом.
  - `tasks/cli/alt-opinion/cli-alt-opinion.task-24.md` · `CLI-alt-cli` · — · Реализовать CLI-обвязку `alt-opinion.cmd.ts`, дефолтные промпт-файлы, регистрацию в `gennady.ts`, `help.cmd.ts`, `cli/AGENTS.md`.
  - `tasks/cli/alt-opinion/cli-alt-opinion.task-25.md` · `CLI-alt-test` · — · Unit-тесты парсера (13 кейсов), runner (11 кейсов с DI-моками), CLI-интеграция (12 кейсов).
  - `tasks/cli/alt-opinion/cli-alt-opinion.task-26.md` · `CLI-alt-tele` · — · Добавить телеметрию в каждый opinion-блок: wall time, token usage, finish reason. Изменить `AltOpinionModelPort.generate()` сигнатуру с `Promise<string>` на `Promise<{ content, usage?, finishReason? }>`, расширить `AltOpinionResult` полем `telemetry`, обновить формат вывода runner, поправить cmd-адаптер провайдера, обновить тесты.
  - `tasks/cli/vcs-approve/vcs-approve.task-69.md` · `CLI-approve` · [x] DONE · Реализовать команду `gennady vcs-approve` — approve GitLab MR через API, с авто-детектом через `vcs-context-resolver` и `--dry-run`
  - `tasks/cli/vcs-approve/vcs-approve.task-74.md` · `CLI-revoke` · [ ] TODO · `--revoke` / `--unapprove` на vcs-approve. Idempotent (not approved → info). Dry-run.
  - `tasks/cli/vcs-context-resolver/vcs-context-resolver.task-68.md` · `CLI-vcs-ctx` · [x] DONE · Реализовать `resolveVcsContext(args, deps) → VcsCliContext` в `cli/cmd/_shared/` — унифицированный механизм авто-детекта ветки, проекта, хоста и токена для всех VCS-команд
  - `tasks/cli/vcs-diff/vcs-diff.task-81.md` · `CLI-diff` · [x] DONE · `gennady vcs-diff --ref <ref>` — список изменённых файлов MR через getChanges. `--path <file>` → содержимое через getFileContent.
  - `tasks/cli/vcs-discussions/vcs-discussions.task-93.md` · `CLI-discuss` · [x] DONE · CLI-команда `gennady vcs-discussions` — человекочитаемый вывод дискуссий GitLab MR. Тонкая обёртка над существующим `VcsClientMergeDiscussions.getAll()`.
  - `tasks/cli/vcs-discussions/vcs-integration.task-94.md` · `CLI-reg-vcs` · [x] DONE · Зарегистрировать три новые команды (`vcs-mr-create`, `vcs-mr-edit`, `vcs-discussions`) в `cli/gennady.ts` (switch + help), обновить `cli/cmd/README.md` (таблица команд + use cases), обновить `cli/AGENTS.md` (таблица команд).
  - `tasks/cli/vcs-draft-note/vcs-draft-note.task-87.md` · `CLI-draft` · [ ] TODO · A) vcs-reply: `{discussionId, delete:true}` без noteId → deleteDiscussion. B) vcs-draft-note: --list|--create|--update|--delete|--publish. vcs-context-resolver.
  - `tasks/cli/vcs-job/vcs-job.task-85.md` · `CLI-jobs` · [ ] TODO · vcs-job (--job name|id --action status|play|cancel|retry) + vcs-job-log (--job name|id). name→id через VcsPipelineStatus.jobs.
  - `tasks/cli/vcs-mr-create/vcs-mr-create.task-91.md` · `CLI-mrcreate` · [ ] TODO · Реализовать CLI-команду `gennady vcs-mr-create` — создание GitLab MR из текущей ветки, с авто-детектом через `vcs-context-resolver`.
  - `tasks/cli/vcs-mr-edit/vcs-mr-edit.task-92.md` · `CLI-mr-edit` · [ ] TODO · CLI-команда `gennady vcs-mr-edit` — редактирование GitLab MR: title, description, draft↔ready, labels, assignee, reviewer, target branch.
  - `tasks/cli/vcs-pipeline/vcs-pipeline.task-83.md` · `CLI-pipeline` · [ ] TODO · `gennady vcs-pipeline --ref <ref>` — статус пайплайна + упавшие джобы
  - `tasks/cli/vcs-refactor/vcs-refactor.task-70.md` · `CLI-vcs-use` · [x] DONE · Перевести `review-issues`, `vcs-reply`, `vcs-worktree` на унифицированный `vcs-context-resolver` — заменить inline-логику авто-детекта ветки/проекта/хоста/токена на вызов `resolveVcsContext`
  - `tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md` · `CLI-noteedit` · [ ] TODO · `vcs-reply` stdin JSON: `{noteId, body}` правка, `{noteId, delete:true}` удаление. `review-issues` XML: `noteId` атрибут на репликах.
  - `tasks/cli/vcs-reply-resolve/vcs-reply-resolve.task-72.md` · `CLI-reopen` · [x] DONE · Расширить `vcs-reply`: поле `resolve: true|false` в stdin JSON — резолв/реопен discussion (с ответом или без)
  - `tasks/cli/vcs-reply-suggestion/vcs-reply-suggestion.task-79.md` · `CLI-suggest` · [x] DONE · line-item vcs-reply: `suggestion` + `suggestionRange` поля → сборка ```suggestion:-A+B блока
  - `tasks/cli/vcs-todo/vcs-todo.task-76.md` · `CLI-todo` · [ ] TODO · `gennady vcs-todo --done <ref>` — закрыть todo(s) по MR через Inbox.markTodoDone
  - `tasks/cli/vcs-worktree/vcs-worktree.task-168.md` · `CLI-deplinks` · [x] DONE · После создания/переиспользования worktree (`prepareMrWorktree`) детерминированно симлинковать known-dependency-директории из клона-источника (node_modules, monorepo-workspaces, vendor, .venv) по best-effort принципу — worktree становится пригодным для запуска тестов, а не только для чтения диффа. Секреты (`.env*`) намеренно исключены (D-019 доп. решение) — worktree чекаутит код потенциально недоверенного MR-автора
  - `tasks/cli/vcs-worktree/vcs-worktree.task-171.md` · `CLI-submods` · [ ] TODO · После подготовки worktree (`prepareMrWorktree`) реально инициализировать git submodules внутри самого worktree (`git submodule update --init --recursive`), best-effort и opt-in — НЕ симлинк на submodule-директорию клона (submodule жёстко привязан к конкретному SHA родителя; MR мог сменить эту версию, и симлинк на клон показал бы неверный коммит)
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                 | Действие | Цель (SECTION)         | Комментарий                                                  |
| ---------------------------------------- | -------- | ---------------------- | ------------------------------------------------------------ |
| `## scope-type`                          | keep     | SCOPE_TYPE             | предзаполнено правилом                                       |
| `## 1. Vision & Primary Goal`            | keep     | VISION                 | предзаполнено правилом                                       |
| `## 2. Project Type`                     | keep     | PROJECT_TYPE           | предзаполнено правилом                                       |
| `## 3. Approved Golden DX Example`       | keep     | GOLDEN_DX              | предзаполнено правилом                                       |
| `## Как встроить в AGENTS.md`            | merge    | GOLDEN_DX              | операторский пример объединяется с Golden DX                 |
| `## 7. Scope Dependencies`               | keep     | SCOPE_DEPENDENCIES     | предзаполнено правилом                                       |
| `## 8. Bootstrap Requirements`           | keep     | BOOTSTRAP_REQUIREMENTS | предзаполнено правилом                                       |
| `## 9. Module Map`                       | keep     | MODULE_MAP             | предзаполнено правилом                                       |
| `## Critic Rounds`                       | drop     | —                      | исторический critic-журнал не входит в каноническую V2-спеку |
| `## 10. Execution Insights`              | merge    | DECISION_LOG           | устойчивые выводы переносятся в Decision Log                 |
| `## 11. Handoff to module-decomposition` | keep     | HANDOFF                | предзаполнено правилом                                       |
| —                                        | create   | OVERVIEW               | если не покрыта строками выше — создать                      |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/cli/cli.task.<новый-ID>.md`. -->

| Файл                                                             | Task-ID | Новый ID     | Назначение                           |
| ---------------------------------------------------------------- | ------- | ------------ | ------------------------------------ |
| `tasks/cli/alt-opinion/cli-alt-opinion.task-23.md`               | TSK-23  | CLI-alt-core | `specs/cli/cli.task.CLI-alt-core.md` |
| `tasks/cli/alt-opinion/cli-alt-opinion.task-24.md`               | TSK-24  | CLI-alt-cli  | `specs/cli/cli.task.CLI-alt-cli.md`  |
| `tasks/cli/alt-opinion/cli-alt-opinion.task-25.md`               | TSK-25  | CLI-alt-test | `specs/cli/cli.task.CLI-alt-test.md` |
| `tasks/cli/alt-opinion/cli-alt-opinion.task-26.md`               | TSK-26  | CLI-alt-tele | `specs/cli/cli.task.CLI-alt-tele.md` |
| `tasks/cli/vcs-approve/vcs-approve.task-69.md`                   | TSK-69  | CLI-approve  | `specs/cli/cli.task.CLI-approve.md`  |
| `tasks/cli/vcs-approve/vcs-approve.task-74.md`                   | TSK-74  | CLI-revoke   | `specs/cli/cli.task.CLI-revoke.md`   |
| `tasks/cli/vcs-context-resolver/vcs-context-resolver.task-68.md` | TSK-68  | CLI-vcs-ctx  | `specs/cli/cli.task.CLI-vcs-ctx.md`  |
| `tasks/cli/vcs-diff/vcs-diff.task-81.md`                         | TSK-81  | CLI-diff     | `specs/cli/cli.task.CLI-diff.md`     |
| `tasks/cli/vcs-discussions/vcs-discussions.task-93.md`           | TSK-93  | CLI-discuss  | `specs/cli/cli.task.CLI-discuss.md`  |
| `tasks/cli/vcs-discussions/vcs-integration.task-94.md`           | TSK-94  | CLI-reg-vcs  | `specs/cli/cli.task.CLI-reg-vcs.md`  |
| `tasks/cli/vcs-draft-note/vcs-draft-note.task-87.md`             | TSK-87  | CLI-draft    | `specs/cli/cli.task.CLI-draft.md`    |
| `tasks/cli/vcs-job/vcs-job.task-85.md`                           | TSK-85  | CLI-jobs     | `specs/cli/cli.task.CLI-jobs.md`     |
| `tasks/cli/vcs-mr-create/vcs-mr-create.task-91.md`               | TSK-91  | CLI-mrcreate | `specs/cli/cli.task.CLI-mrcreate.md` |
| `tasks/cli/vcs-mr-edit/vcs-mr-edit.task-92.md`                   | TSK-92  | CLI-mr-edit  | `specs/cli/cli.task.CLI-mr-edit.md`  |
| `tasks/cli/vcs-pipeline/vcs-pipeline.task-83.md`                 | TSK-83  | CLI-pipeline | `specs/cli/cli.task.CLI-pipeline.md` |
| `tasks/cli/vcs-refactor/vcs-refactor.task-70.md`                 | TSK-70  | CLI-vcs-use  | `specs/cli/cli.task.CLI-vcs-use.md`  |
| `tasks/cli/vcs-reply-edit/vcs-reply-edit.task-78.md`             | TSK-78  | CLI-noteedit | `specs/cli/cli.task.CLI-noteedit.md` |
| `tasks/cli/vcs-reply-resolve/vcs-reply-resolve.task-72.md`       | TSK-72  | CLI-reopen   | `specs/cli/cli.task.CLI-reopen.md`   |
| `tasks/cli/vcs-reply-suggestion/vcs-reply-suggestion.task-79.md` | TSK-79  | CLI-suggest  | `specs/cli/cli.task.CLI-suggest.md`  |
| `tasks/cli/vcs-todo/vcs-todo.task-76.md`                         | TSK-76  | CLI-todo     | `specs/cli/cli.task.CLI-todo.md`     |
| `tasks/cli/vcs-worktree/vcs-worktree.task-168.md`                | TSK-168 | CLI-deplinks | `specs/cli/cli.task.CLI-deplinks.md` |
| `tasks/cli/vcs-worktree/vcs-worktree.task-171.md`                | TSK-171 | CLI-submods  | `specs/cli/cli.task.CLI-submods.md`  |

<!--/SECTION:TICKET_MAP-->

<!--SECTION:DIAGRAM_PLAN-->

## Diagram Plan

<!-- Заполняет агент: какая диаграмма встанет в Overview (обязательная) и откуда её содержание
     (существующий mermaid-блок / новая — из какого текста строится). Дополнительные диаграммы
     (последовательности, потоки данных) — по решению агента, если они улучшают чтение. -->

- существующих mermaid-блоков: 1
- Overview-диаграмма: переиспользовать существующий mermaid-блок; в Overview оставить только уже описанные сущности и связи
<!--/SECTION:DIAGRAM_PLAN-->

<!--SECTION:STEPS-->

## Steps

<!-- Работа этого юнита. Механические шаги всего репо (anchors / ids / move) живут в migration/README.md
     и выполняются централизованно — здесь только то, что делается в рамках этой спеки. -->

- [ ] S1 ✍️ Изучить исходник, заполнить Section Map / Ticket Map / Diagram Plan → **Status:** MAPPED
- [ ] S2 ✅ `npx tsx cli/gennady.ts sdd-migrate plan --verify` — карты полны, расхождений с реальностью нет
- [ ] S3 🛑 Подтверждение оператора → **Status:** APPROVED
- [ ] S4 ✍️ Реструктуризация спеки по Section Map: целевой порядок секций из format-файла, заголовки без номеров, тяжёлые секции — в `<details>`, Overview с диаграммой по Diagram Plan
- [ ] S5 ✍️ Текст — плоский технический русский (без калек и метафор; код/ID/токены — English)
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/cli` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
