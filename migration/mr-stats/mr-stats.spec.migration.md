# План миграции: specs/mr-stats/mr-stats.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** mr-stats

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/mr-stats/mr-stats.spec.md` · строк: 413 · scope-type: `product` · mermaid-блоков: 0 · якорей: 11
- обязательные целевые секции: `OVERVIEW`, `VISION`, `GOLDEN_DX`, `REQUIREMENTS_AND_CONSTRAINTS`, `USE_CASES`, `ARCHITECTURE`, `MODULE_MAP`, `DECISION_LOG`
- заголовки (level 2):
  - `## scope-type`
  - `## 1. Vision & Primary Goal`
  - `## 2. Project Type`
  - `## 3. Approved Usage Example`
  - `## 4. Requirements & Constraints`
  - `## 5. High-Level Architecture`
  - `## 6. Decision Log`
  - `## 7. Scope Dependencies`
  - `## 8. Bootstrap Requirements`
  - `## 9. Module Map`
  - `## 10. Handoff to module-decomposition`
- тикеты:
  - `tasks/mr-stats/mr-stats.task-138.md` · `MS-config` · [x] DONE · Создать классификационный YAML-конфиг с 10 категориями и зарегистрировать CLI-команду `mr-stats` в gennady.
  - `tasks/mr-stats/mr-stats.task-139.md` · `MS-pipeline` · [x] DONE · Реализовать полный пайплайн `mr-stats`: разбор URL → метаданные MR → worktree → классификация → cloc → tree-sitter → jscpd → JSON-отчёт.
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                 | Действие | Цель (SECTION)               | Комментарий                                                    |
| ---------------------------------------- | -------- | ---------------------------- | -------------------------------------------------------------- |
| `## scope-type`                          | keep     | SCOPE_TYPE                   | предзаполнено правилом                                         |
| `## 1. Vision & Primary Goal`            | keep     | VISION                       | предзаполнено правилом                                         |
| `## 2. Project Type`                     | keep     | PROJECT_TYPE                 | предзаполнено правилом                                         |
| `## 3. Approved Usage Example`           | rename   | GOLDEN_DX                    | утверждённый usage-пример переносится в канонический Golden DX |
| `## 4. Requirements & Constraints`       | keep     | REQUIREMENTS_AND_CONSTRAINTS | предзаполнено правилом                                         |
| `## 5. High-Level Architecture`          | keep     | ARCHITECTURE                 | предзаполнено правилом                                         |
| `## 6. Decision Log`                     | keep     | DECISION_LOG                 | предзаполнено правилом                                         |
| `## 7. Scope Dependencies`               | keep     | SCOPE_DEPENDENCIES           | предзаполнено правилом                                         |
| `## 8. Bootstrap Requirements`           | keep     | BOOTSTRAP_REQUIREMENTS       | предзаполнено правилом                                         |
| `## 9. Module Map`                       | keep     | MODULE_MAP                   | предзаполнено правилом                                         |
| `## 10. Handoff to module-decomposition` | keep     | HANDOFF                      | предзаполнено правилом                                         |
| —                                        | create   | OVERVIEW                     | если не покрыта строками выше — создать                        |
| —                                        | create   | GOLDEN_DX                    | если не покрыта строками выше — создать                        |
| —                                        | create   | USE_CASES                    | если не покрыта строками выше — создать                        |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/mr-stats/mr-stats.task.<новый-ID>.md`. -->

| Файл                                  | Task-ID | Новый ID    | Назначение                                    |
| ------------------------------------- | ------- | ----------- | --------------------------------------------- |
| `tasks/mr-stats/mr-stats.task-138.md` | TSK-138 | MS-config   | `specs/mr-stats/mr-stats.task.MS-config.md`   |
| `tasks/mr-stats/mr-stats.task-139.md` | TSK-139 | MS-pipeline | `specs/mr-stats/mr-stats.task.MS-pipeline.md` |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/mr-stats` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
