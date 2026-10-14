# План миграции: specs/vcs/vcs-client/vcs-client.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** vcs | **Module:** vcs-client

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/vcs/vcs-client/vcs-client.spec.md` · строк: 256 · scope-type: — · mermaid-блоков: 0 · якорей: 0
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## 1. Module Vision`
  - `## 2. Entity Inventory (Closed-World)`
  - `## 3. Entity Surfaces`
  - `## 6. File Structure`
  - `## 7. Module Decision Log`
  - `## 9. Handoff to Task Scaffolding`
- тикеты:
  - `tasks/vcs/vcs-client/vcs-client.task-22.md` · `VC-headers` · — · Добавить `// @file:`/`// @consumers:` file headers и JSDoc-контракты на все экспортируемые сущности в `services/vcs-client/`. Сейчас 51 ошибка линтера: 14 file header + 37 DBC.
  - `tasks/vcs/vcs-client/vcs-client.task-27.md` · `VC-url` · [x] DONE · Создать типы `VcsUrl`, `VcsMergeRequestChanges`, `VcsFileContent`, query-типы и pure-функцию `parseVcsUrl`.
  - `tasks/vcs/vcs-client/vcs-client.task-28.md` · `VC-fileport` · [x] DONE · Добавить `VcsClientRepositoryFiles` порт, сделать `MergeDiscussions` опциональным на `VcsClient`, добавить контракт `getChanges` в `VcsClientMergeRequests`.
  - `tasks/vcs/vcs-client/vcs-client.task-29.md` · `VC-gitlab` · [x] DONE · Реализовать `VcsGitlabRepositoryFiles` (getFileContent) и добавить `getChanges` в `VcsGitlabMergeRequests`.
  - `tasks/vcs/vcs-client/vcs-client.task-30.md` · `VC-github` · [x] DONE · Реализовать `VcsGithubClient`, `VcsGithubMergeRequests` (getChanges), `VcsGithubRepositoryFiles` (getFileContent). Минимальный адаптер без Discussions.
  - `tasks/vcs/vcs-client/vcs-client.task-67.md` · `VC-approve` · [x] DONE · Добавить метод `approve(query)` на порт `VcsClientMergeRequests` + value object `VcsMergeRequestApproveQuery` + реализацию в `VcsGitlabMergeRequests` (`POST /projects/:id/merge_requests/:iid/approve`)
  - `tasks/vcs/vcs-client/vcs-client.task-71.md` · `VC-resolve` · [x] DONE · Добавить `resolveDiscussion(query)` на порт `VcsClientMergeDiscussions` + VO `VcsResolveDiscussionQuery` + реализацию в `VcsGitlabMergeDiscussions` (`PUT /discussions/:id?resolved=true|false`)
  - `tasks/vcs/vcs-client/vcs-client.task-73.md` · `VC-unappr` · [x] DONE · `VcsClientMergeRequests.unapprove(query)` + `VcsGitlabMergeRequests.unapprove` (POST /unapprove). GitHub stub.
  - `tasks/vcs/vcs-client/vcs-client.task-75.md` · `VC-todos` · [x] DONE · `VcsActionableMr.todoIds`, расширение `getActionable` GraphQL, `Inbox.markTodoDone()`
  - `tasks/vcs/vcs-client/vcs-client.task-77.md` · `VC-noteedit` · [x] DONE · `VcsClientMergeDiscussions.updateNote/deleteNote` + GitLab-адаптер + `VcsDiscussionNote.noteId`. Guard: только свои заметки.
  - `tasks/vcs/vcs-client/vcs-client.task-82.md` · `VC-pipeline` · [ ] TODO · `VcsClientMergeRequests.getPipeline` + `VcsPipeline` + GitLab GraphQL адаптер. GitHub stub.
  - `tasks/vcs/vcs-client/vcs-client.task-84.md` · `VC-jobs` · [x] DONE · VcsClientPipeline port (getJob/playJob/cancelJob/getJobLog) + VcsGitlabPipeline REST adapter + VcsJob/VcsJobQuery VOs + rename VcsPipeline→VcsPipelineStatus (+id in jobs)
  - `tasks/vcs/vcs-client/vcs-client.task-86.md` · `VC-drafts` · [ ] TODO · `deleteDiscussion` + `createDraftNote`/`updateDraftNote`/`deleteDraftNote`/`publishDraftNote` на `VcsClientMergeDiscussions` + GitLab-адаптер. `VcsDraftNote` VO.
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                | Действие | Цель (SECTION)       | Комментарий                             |
| --------------------------------------- | -------- | -------------------- | --------------------------------------- |
| `## 1. Module Vision`                   | keep     | MODULE_VISION        | предзаполнено правилом                  |
| `## 2. Entity Inventory (Closed-World)` | keep     | ENTITY_INVENTORY     | предзаполнено правилом                  |
| `## 3. Entity Surfaces`                 | keep     | ENTITY_SURFACES      | предзаполнено правилом                  |
| `## 6. File Structure`                  | keep     | FILE_STRUCTURE       | предзаполнено правилом                  |
| `## 7. Module Decision Log`             | keep     | MODULE_DECISION_LOG  | предзаполнено правилом                  |
| `## 9. Handoff to Task Scaffolding`     | keep     | HANDOFF              | предзаполнено правилом                  |
| —                                       | create   | OVERVIEW             | если не покрыта строками выше — создать |
| —                                       | create   | MODULE_USAGE_EXAMPLE | если не покрыта строками выше — создать |
| —                                       | create   | MODULE_CONTRACTS     | если не покрыта строками выше — создать |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/vcs/vcs-client/vcs-client.task.<новый-ID>.md`. -->

| Файл                                         | Task-ID | Новый ID    | Назначение                                            |
| -------------------------------------------- | ------- | ----------- | ----------------------------------------------------- |
| `tasks/vcs/vcs-client/vcs-client.task-22.md` | TSK-22  | VC-headers  | `specs/vcs/vcs-client/vcs-client.task.VC-headers.md`  |
| `tasks/vcs/vcs-client/vcs-client.task-27.md` | TSK-27  | VC-url      | `specs/vcs/vcs-client/vcs-client.task.VC-url.md`      |
| `tasks/vcs/vcs-client/vcs-client.task-28.md` | TSK-28  | VC-fileport | `specs/vcs/vcs-client/vcs-client.task.VC-fileport.md` |
| `tasks/vcs/vcs-client/vcs-client.task-29.md` | TSK-29  | VC-gitlab   | `specs/vcs/vcs-client/vcs-client.task.VC-gitlab.md`   |
| `tasks/vcs/vcs-client/vcs-client.task-30.md` | TSK-30  | VC-github   | `specs/vcs/vcs-client/vcs-client.task.VC-github.md`   |
| `tasks/vcs/vcs-client/vcs-client.task-67.md` | TSK-67  | VC-approve  | `specs/vcs/vcs-client/vcs-client.task.VC-approve.md`  |
| `tasks/vcs/vcs-client/vcs-client.task-71.md` | TSK-71  | VC-resolve  | `specs/vcs/vcs-client/vcs-client.task.VC-resolve.md`  |
| `tasks/vcs/vcs-client/vcs-client.task-73.md` | TSK-73  | VC-unappr   | `specs/vcs/vcs-client/vcs-client.task.VC-unappr.md`   |
| `tasks/vcs/vcs-client/vcs-client.task-75.md` | TSK-75  | VC-todos    | `specs/vcs/vcs-client/vcs-client.task.VC-todos.md`    |
| `tasks/vcs/vcs-client/vcs-client.task-77.md` | TSK-77  | VC-noteedit | `specs/vcs/vcs-client/vcs-client.task.VC-noteedit.md` |
| `tasks/vcs/vcs-client/vcs-client.task-82.md` | TSK-82  | VC-pipeline | `specs/vcs/vcs-client/vcs-client.task.VC-pipeline.md` |
| `tasks/vcs/vcs-client/vcs-client.task-84.md` | TSK-84  | VC-jobs     | `specs/vcs/vcs-client/vcs-client.task.VC-jobs.md`     |
| `tasks/vcs/vcs-client/vcs-client.task-86.md` | TSK-86  | VC-drafts   | `specs/vcs/vcs-client/vcs-client.task.VC-drafts.md`   |

<!--/SECTION:TICKET_MAP-->

<!--SECTION:DIAGRAM_PLAN-->

## Diagram Plan

<!-- Заполняет агент: какая диаграмма встанет в Overview (обязательная) и откуда её содержание
     (существующий mermaid-блок / новая — из какого текста строится). Дополнительные диаграммы
     (последовательности, потоки данных) — по решению агента, если они улучшают чтение. -->

- существующих mermaid-блоков: 0
- Overview-диаграмма: построить минимальную graph-диаграмму только из Entity Inventory / File Structure / Module Map этой спеки; новых сущностей не вводить
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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/vcs` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
