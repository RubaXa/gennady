# План миграции: specs/dbc/dbc.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** dbc

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/dbc/dbc.spec.md` · строк: 617 · scope-type: — · mermaid-блоков: 0 · якорей: 0
- обязательные целевые секции: `OVERVIEW`
- заголовки (level 2):
  - `## scope-type`
  - `## 1. Vision & Primary Goal`
  - `## 2. Approved Golden DX Example`
  - `## 3. Requirements & Constraints`
  - `## 4. Public API Surface`
  - `## 5. Architecture`
  - `## 6. Decision Log`
  - `## 7. Scope Dependencies`
  - `## 8. Bootstrap Requirements`
  - `## 9. Module Map (post-ModuleDecomposition)`
- тикеты:
  - (нет)
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                      | Действие | Цель (SECTION)               | Комментарий                             |
| --------------------------------------------- | -------- | ---------------------------- | --------------------------------------- |
| `## scope-type`                               | keep     | SCOPE_TYPE                   | предзаполнено правилом                  |
| `## 1. Vision & Primary Goal`                 | keep     | VISION                       | предзаполнено правилом                  |
| `## 2. Approved Golden DX Example`            | keep     | GOLDEN_DX                    | предзаполнено правилом                  |
| `## 3. Requirements & Constraints`            | keep     | REQUIREMENTS_AND_CONSTRAINTS | предзаполнено правилом                  |
| `## 4. Public API Surface`                    | keep     | PUBLIC_API_SURFACE           | предзаполнено правилом                  |
| `## 5. Architecture`                          | keep     | ARCHITECTURE                 | предзаполнено правилом                  |
| `## 6. Decision Log`                          | keep     | DECISION_LOG                 | предзаполнено правилом                  |
| `## 7. Scope Dependencies`                    | keep     | SCOPE_DEPENDENCIES           | предзаполнено правилом                  |
| `## 8. Bootstrap Requirements`                | keep     | BOOTSTRAP_REQUIREMENTS       | предзаполнено правилом                  |
| `## 9. Module Map (post-ModuleDecomposition)` | keep     | MODULE_MAP                   | предзаполнено правилом                  |
| —                                             | create   | OVERVIEW                     | если не покрыта строками выше — создать |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/dbc/dbc.task.<новый-ID>.md`. -->

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/dbc` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
