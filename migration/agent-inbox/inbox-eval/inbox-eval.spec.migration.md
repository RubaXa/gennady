# План миграции: specs/agent-inbox/inbox-eval/inbox-eval.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** agent-inbox | **Module:** inbox-eval

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/agent-inbox/inbox-eval/inbox-eval.spec.md` · строк: 136 · scope-type: — · mermaid-блоков: 0 · якорей: 10
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## 1. Module Vision`
  - `## 2. Module Usage Example`
  - `## 3. Entity Inventory (Closed-World)`
  - `## 4. Entity Surfaces`
  - `## 5. Module Contracts (DbC)`
  - `## 6. Public Options & Policies`
  - `## 7. File Structure`
  - `## 8. Module Decision Log`
  - `## 9. Inter-Module Dependencies`
  - `## 10. Handoff to task-scaffolding`
- тикеты:
  - `tasks/agent-inbox/agent-inbox.task-165.md` · `IE-harness` · [x] DONE · Харнесс приёмки: `gennady inbox eval --mr <url>`, 10 прогонов с измеримыми PASS-критериями (вкл. parallel-контроль инцидента, crash_recovery, coverage_gate), eval-report.json + trend.jsonl, метрики датасета (accept-rate/edit-rate/time-to-decision/coverage-факт).
  - `tasks/agent-inbox/inbox-eval/inbox-eval.task-183.md` · `IE-realeval` · [ ] TODO · Deliver deterministic, real-readonly and allowlisted real-effects validation with evidence-backed statuses.
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
| `## 2. Module Usage Example`            | keep     | MODULE_USAGE_EXAMPLE      | предзаполнено правилом                  |
| `## 3. Entity Inventory (Closed-World)` | keep     | ENTITY_INVENTORY          | предзаполнено правилом                  |
| `## 4. Entity Surfaces`                 | keep     | ENTITY_SURFACES           | предзаполнено правилом                  |
| `## 5. Module Contracts (DbC)`          | keep     | MODULE_CONTRACTS          | предзаполнено правилом                  |
| `## 6. Public Options & Policies`       | keep     | PUBLIC_OPTIONS            | предзаполнено правилом                  |
| `## 7. File Structure`                  | keep     | FILE_STRUCTURE            | предзаполнено правилом                  |
| `## 8. Module Decision Log`             | keep     | MODULE_DECISION_LOG       | предзаполнено правилом                  |
| `## 9. Inter-Module Dependencies`       | keep     | INTER_MODULE_DEPENDENCIES | предзаполнено правилом                  |
| `## 10. Handoff to task-scaffolding`    | keep     | HANDOFF                   | предзаполнено правилом                  |
| —                                       | create   | OVERVIEW                  | если не покрыта строками выше — создать |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/agent-inbox/inbox-eval/inbox-eval.task.<новый-ID>.md`. -->

| Файл                                                  | Task-ID | Новый ID    | Назначение                                                    |
| ----------------------------------------------------- | ------- | ----------- | ------------------------------------------------------------- |
| `tasks/agent-inbox/agent-inbox.task-165.md`           | TSK-165 | IE-harness  | `specs/agent-inbox/inbox-eval/inbox-eval.task.IE-harness.md`  |
| `tasks/agent-inbox/inbox-eval/inbox-eval.task-183.md` | TSK-183 | IE-realeval | `specs/agent-inbox/inbox-eval/inbox-eval.task.IE-realeval.md` |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/agent-inbox` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
