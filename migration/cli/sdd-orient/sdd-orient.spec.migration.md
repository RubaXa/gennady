# План миграции: specs/cli/sdd-orient/sdd-orient.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** cli | **Module:** sdd-orient

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/cli/sdd-orient/sdd-orient.spec.md` · строк: 629 · scope-type: — · mermaid-блоков: 4 · якорей: 13
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## Module Vision`
  - `## Overview`
  - `## Module Usage Example`
  - `## Requirements`
  - `## Inter-Module Dependencies`
  - `## Entity Inventory`
  - `## Entity Surfaces`
  - `## Module Contracts`
  - `## File Structure`
  - `## Module Decision Log`
  - `## Handoff to Tasks`
- тикеты:
  - (нет)
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                       | Действие | Цель (SECTION)               | Комментарий            |
| ------------------------------ | -------- | ---------------------------- | ---------------------- |
| `## Module Vision`             | keep     | MODULE_VISION                | предзаполнено правилом |
| `## Overview`                  | keep     | OVERVIEW                     | предзаполнено правилом |
| `## Module Usage Example`      | keep     | MODULE_USAGE_EXAMPLE         | предзаполнено правилом |
| `## Requirements`              | keep     | REQUIREMENTS_AND_CONSTRAINTS | предзаполнено правилом |
| `## Inter-Module Dependencies` | keep     | INTER_MODULE_DEPENDENCIES    | предзаполнено правилом |
| `## Entity Inventory`          | keep     | ENTITY_INVENTORY             | предзаполнено правилом |
| `## Entity Surfaces`           | keep     | ENTITY_SURFACES              | предзаполнено правилом |
| `## Module Contracts`          | keep     | MODULE_CONTRACTS             | предзаполнено правилом |
| `## File Structure`            | keep     | FILE_STRUCTURE               | предзаполнено правилом |
| `## Module Decision Log`       | keep     | MODULE_DECISION_LOG          | предзаполнено правилом |
| `## Handoff to Tasks`          | keep     | HANDOFF                      | предзаполнено правилом |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/cli/sdd-orient/sdd-orient.task.<новый-ID>.md`. -->

| Файл          | Task-ID | Новый ID | Назначение |
| ------------- | ------- | -------- | ---------- |
| (нет тикетов) | —       | —        | —          |

<!--/SECTION:TICKET_MAP-->

<!--SECTION:DIAGRAM_PLAN-->

## Diagram Plan

<!-- Заполняет агент: какая диаграмма встанет в Overview (обязательная) и откуда её содержание
     (существующий mermaid-блок / новая — из какого текста строится). Дополнительные диаграммы
     (последовательности, потоки данных) — по решению агента, если они улучшают чтение. -->

- существующих mermaid-блоков: 4
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
