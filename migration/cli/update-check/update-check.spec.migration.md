# План миграции: specs/cli/update-check/update-check.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** cli | **Module:** update-check

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/cli/update-check/update-check.spec.md` · строк: 240 · scope-type: — · mermaid-блоков: 1 · якорей: 0
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## 1. Module Vision`
  - `## 2. Entity Inventory (Closed-World)`
  - `## 3. Entity Surfaces`
  - `## 4. Module Contracts (DbC)`
  - `## 5. Public Options & Policies`
  - `## 6. File Structure`
  - `## 7. Module Decision Log`
  - `## 8. Inter-Module Dependencies`
  - `## 9. Handoff to Task Scaffolding`
- тикеты:
  - `tasks/cli/update-check/update-check.task-184.md` · `UC-semver` · [x] DONE · Fix version comparison in UpdateCheck to prevent downgrade notifications (semver `>` instead of `!==`), add `--version` / `-v` flag to CLI
  - `tasks/cli/update-check/update-check.task-33.md` · `UC-notify` · [x] DONE · Реализовать неблокирующий механизм детекта обновлений: вшить версию в бандл, создать UpdateCheck Service + UpdateCheckWorker, интегрировать вызов в gennady.ts
  - `tasks/cli/update-check/update-check.task-34.md` · `UC-tests` · [x] DONE · Написать unit-тесты для UpdateCheck Service (кеш, opt-out, TTY guard, beforeExit) и интеграционные тесты для UpdateCheckWorker (локальный HTTP-сервер, таймаут, ошибки)
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                | Действие | Цель (SECTION)            | Комментарий                             |
| --------------------------------------- | -------- | ------------------------- | --------------------------------------- |
| `## 1. Module Vision`                   | keep     | MODULE_VISION             | предзаполнено правилом                  |
| `## 2. Entity Inventory (Closed-World)` | keep     | ENTITY_INVENTORY          | предзаполнено правилом                  |
| `## 3. Entity Surfaces`                 | keep     | ENTITY_SURFACES           | предзаполнено правилом                  |
| `## 4. Module Contracts (DbC)`          | keep     | MODULE_CONTRACTS          | предзаполнено правилом                  |
| `## 5. Public Options & Policies`       | keep     | PUBLIC_OPTIONS            | предзаполнено правилом                  |
| `## 6. File Structure`                  | keep     | FILE_STRUCTURE            | предзаполнено правилом                  |
| `## 7. Module Decision Log`             | keep     | MODULE_DECISION_LOG       | предзаполнено правилом                  |
| `## 8. Inter-Module Dependencies`       | keep     | INTER_MODULE_DEPENDENCIES | предзаполнено правилом                  |
| `## 9. Handoff to Task Scaffolding`     | keep     | HANDOFF                   | предзаполнено правилом                  |
| —                                       | create   | OVERVIEW                  | если не покрыта строками выше — создать |
| —                                       | create   | MODULE_USAGE_EXAMPLE      | если не покрыта строками выше — создать |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/cli/update-check/update-check.task.<новый-ID>.md`. -->

| Файл                                              | Task-ID | Новый ID  | Назначение                                              |
| ------------------------------------------------- | ------- | --------- | ------------------------------------------------------- |
| `tasks/cli/update-check/update-check.task-184.md` | TSK-184 | UC-semver | `specs/cli/update-check/update-check.task.UC-semver.md` |
| `tasks/cli/update-check/update-check.task-33.md`  | TSK-33  | UC-notify | `specs/cli/update-check/update-check.task.UC-notify.md` |
| `tasks/cli/update-check/update-check.task-34.md`  | TSK-34  | UC-tests  | `specs/cli/update-check/update-check.task.UC-tests.md`  |

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
