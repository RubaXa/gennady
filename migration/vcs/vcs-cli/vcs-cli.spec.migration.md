# План миграции: specs/vcs/vcs-cli/vcs-cli.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** vcs | **Module:** vcs-cli

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/vcs/vcs-cli/vcs-cli.spec.md` · строк: 243 · scope-type: — · mermaid-блоков: 0 · якорей: 0
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## 1. Module Vision`
  - `## 2. Approved Golden DX`
  - `## 3. Entity Inventory (Closed-World)`
  - `## 4. Functional Requirements`
  - `## 5. Non-Functional Constraints`
  - `## 6. File Structure`
  - `## 7. Decision Log`
  - `## 8. Handoff to Task Scaffolding`
- тикеты:
  - (нет)
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                | Действие | Цель (SECTION)               | Комментарий                                         |
| --------------------------------------- | -------- | ---------------------------- | --------------------------------------------------- |
| `## 1. Module Vision`                   | keep     | MODULE_VISION                | предзаполнено правилом                              |
| `## 2. Approved Golden DX`              | keep     | GOLDEN_DX                    | предзаполнено правилом                              |
| `## 3. Entity Inventory (Closed-World)` | keep     | ENTITY_INVENTORY             | предзаполнено правилом                              |
| `## 4. Functional Requirements`         | merge    | REQUIREMENTS_AND_CONSTRAINTS | functional requirements входят в единый V2-контракт |
| `## 5. Non-Functional Constraints`      | merge    | REQUIREMENTS_AND_CONSTRAINTS | constraints входят в единый V2-контракт             |
| `## 6. File Structure`                  | keep     | FILE_STRUCTURE               | предзаполнено правилом                              |
| `## 7. Decision Log`                    | keep     | DECISION_LOG                 | предзаполнено правилом                              |
| `## 8. Handoff to Task Scaffolding`     | keep     | HANDOFF                      | предзаполнено правилом                              |
| —                                       | create   | OVERVIEW                     | если не покрыта строками выше — создать             |
| —                                       | create   | MODULE_USAGE_EXAMPLE         | если не покрыта строками выше — создать             |
| —                                       | create   | MODULE_CONTRACTS             | если не покрыта строками выше — создать             |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/vcs/vcs-cli/vcs-cli.task.<новый-ID>.md`. -->

| Файл          | Task-ID | Новый ID | Назначение |
| ------------- | ------- | -------- | ---------- |
| (нет тикетов) | —       | —        | —          |

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
