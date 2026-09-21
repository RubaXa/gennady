# План миграции: specs/cli/cat/cat.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** cli | **Module:** cat

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/cli/cat/cat.spec.md` · строк: 243 · scope-type: — · mermaid-блоков: 0 · якорей: 0
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## 1. Module Vision`
  - `## 2. Entity Inventory (Closed-World)`
  - `## 3. Entity Surfaces`
  - `## 4. CLI Interface`
  - `## 5. Architecture`
  - `## 6. Decision Log`
  - `## 7. File Structure`
  - `## 8. Bootstrap Requirements`
  - `## 9. Handoff to Task Scaffolding`
- тикеты:
  - `tasks/cli/cat/cli-cat.task-31.md` · `CAT-mr-url` · [x] DONE · Добавить флаг `--url=<MR/PR URL>` в команду `cat`: парсинг URL → ОДИН VCS-клиент → сбор ВСЕХ изменённых файлов → catGenFromVcs → рендеринг XML/MD.
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                | Действие | Цель (SECTION)         | Комментарий                             |
| --------------------------------------- | -------- | ---------------------- | --------------------------------------- |
| `## 1. Module Vision`                   | keep     | MODULE_VISION          | предзаполнено правилом                  |
| `## 2. Entity Inventory (Closed-World)` | keep     | ENTITY_INVENTORY       | предзаполнено правилом                  |
| `## 3. Entity Surfaces`                 | keep     | ENTITY_SURFACES        | предзаполнено правилом                  |
| `## 4. CLI Interface`                   | keep     | CLI_INTERFACE          | публичный CLI-контракт сохраняется      |
| `## 5. Architecture`                    | keep     | ARCHITECTURE           | предзаполнено правилом                  |
| `## 6. Decision Log`                    | keep     | DECISION_LOG           | предзаполнено правилом                  |
| `## 7. File Structure`                  | keep     | FILE_STRUCTURE         | предзаполнено правилом                  |
| `## 8. Bootstrap Requirements`          | keep     | BOOTSTRAP_REQUIREMENTS | предзаполнено правилом                  |
| `## 9. Handoff to Task Scaffolding`     | keep     | HANDOFF                | предзаполнено правилом                  |
| —                                       | create   | OVERVIEW               | если не покрыта строками выше — создать |
| —                                       | create   | MODULE_USAGE_EXAMPLE   | если не покрыта строками выше — создать |
| —                                       | create   | MODULE_CONTRACTS       | если не покрыта строками выше — создать |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/cli/cat/cat.task.<новый-ID>.md`. -->

| Файл                               | Task-ID | Новый ID   | Назначение                             |
| ---------------------------------- | ------- | ---------- | -------------------------------------- |
| `tasks/cli/cat/cli-cat.task-31.md` | TSK-31  | CAT-mr-url | `specs/cli/cat/cat.task.CAT-mr-url.md` |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/cli` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
