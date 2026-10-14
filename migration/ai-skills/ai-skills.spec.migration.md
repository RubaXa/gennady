# План миграции: specs/ai-skills/ai-skills.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** ai-skills

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/ai-skills/ai-skills.spec.md` · строк: 422 · scope-type: `library` · mermaid-блоков: 1 · якорей: 11
- обязательные целевые секции: `OVERVIEW`, `VISION`, `GOLDEN_DX`, `REQUIREMENTS_AND_CONSTRAINTS`, `PUBLIC_API_SURFACE`, `MODULE_MAP`, `DECISION_LOG`
- заголовки (level 2):
  - `## scope-type`
  - `## 1. Vision & Primary Goal`
  - `## 2. Approved Usage Example (Composition View)`
- тикеты:
  - (нет)
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                          | Действие | Цель (SECTION)               | Комментарий                                             |
| ------------------------------------------------- | -------- | ---------------------------- | ------------------------------------------------------- |
| `## scope-type`                                   | keep     | SCOPE_TYPE                   | предзаполнено правилом                                  |
| `## 1. Vision & Primary Goal`                     | keep     | VISION                       | предзаполнено правилом                                  |
| `## 2. Approved Usage Example (Composition View)` | rename   | GOLDEN_DX                    | composition-пример переносится в канонический Golden DX |
| —                                                 | create   | OVERVIEW                     | если не покрыта строками выше — создать                 |
| —                                                 | create   | GOLDEN_DX                    | если не покрыта строками выше — создать                 |
| —                                                 | create   | REQUIREMENTS_AND_CONSTRAINTS | если не покрыта строками выше — создать                 |
| —                                                 | create   | PUBLIC_API_SURFACE           | если не покрыта строками выше — создать                 |
| —                                                 | create   | MODULE_MAP                   | если не покрыта строками выше — создать                 |
| —                                                 | create   | DECISION_LOG                 | если не покрыта строками выше — создать                 |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/ai-skills/ai-skills.task.<новый-ID>.md`. -->

| Файл          | Task-ID | Новый ID | Назначение |
| ------------- | ------- | -------- | ---------- |
| (нет тикетов) | —       | —        | —          |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/ai-skills` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
