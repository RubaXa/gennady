# План миграции: specs/agent-inbox/agent-inbox.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** agent-inbox

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/agent-inbox/agent-inbox.spec.md` · строк: 820 · scope-type: `product` · mermaid-блоков: 2 · якорей: 11
- обязательные целевые секции: `OVERVIEW`, `VISION`, `GOLDEN_DX`, `REQUIREMENTS_AND_CONSTRAINTS`, `USE_CASES`, `ARCHITECTURE`, `MODULE_MAP`, `DECISION_LOG`
- заголовки (level 2):
  - `## scope-type`
  - `## 1. Vision & Primary Goal`
  - `## 2. Project Type`
  - `## 3. Approved UX Flow Example`
  - `## 4. Requirements & Constraints`
  - `## 5. High-Level Architecture`
  - `## 6. Decision Log`
  - `## 7. Scope Dependencies`
  - `## 8. Bootstrap Requirements`
  - `## 9. Module Map`
  - `## 10. Handoff to module-decomposition`
- тикеты:
  - `tasks/agent-inbox/agent-inbox.task-166.md` · `AI-seed` · [x] DONE · Тестовая инфраструктура v2: seed-DSL (любой MR в любое состояние через журнал+sync-снимок, без GitLab), кассеты записанных реальных ответов GitLab/opencode, контракт-сьют портов ×2 (фейк vs реальный адаптер на перехваченной сети), DTO-фабрики виджетов. Причина: уроки v1 — e2e «всё сразу» невозможен, ручные моки врут (D-116).
  - `tasks/agent-inbox/agent-inbox.task-167.md` · `AI-fasttest` · [x] DONE · Полная сьюита `npm test` не завершается (>10 мин) после волны IA-rest-sse/163/166 — тяжёлые integration-тесты (реальные серверы/SSE/git) деградируют полное расписание. Вынести их за отдельный скрипт и вернуть основной гейт ≤ 2 мин.
  - `tasks/agent-inbox/agent-inbox.task-168.md` · `AI-skip-fix` · [x] DONE · Ретро-тикет на исправление, выполненное архитектором 2026-08-08 после аудита AI-fasttest: агент skip'нул 17 describe-блоков вместо 5 доказанных red. Baseline-прогоном (worktree на HEAD) доказано: eval-driver 3/3, http-server 2/3, bootstrap 2/4, run-mode 2/5 были ЗЕЛЁНЫЕ на момент skip'а. Правило оператора: skip оправдан только при временной недоступности инфраструктуры.
  - `tasks/agent-inbox/agent-inbox.task-172.md` · `AI-roots` · [x] DONE · Ввести физически разделённые production/test/mock roots, controlled profile binding и безопасный boot barrier.
  - `tasks/agent-inbox/agent-inbox.task-181.md` · `AI-cutover` · [ ] TODO · Switch the real composition root to the new state/sync/pipeline/queue/API chain and remove duplicate role/VCS runtime.
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                 | Действие | Цель (SECTION)               | Комментарий                                                 |
| ---------------------------------------- | -------- | ---------------------------- | ----------------------------------------------------------- |
| `## scope-type`                          | keep     | SCOPE_TYPE                   | предзаполнено правилом                                      |
| `## 1. Vision & Primary Goal`            | keep     | VISION                       | предзаполнено правилом                                      |
| `## 2. Project Type`                     | keep     | PROJECT_TYPE                 | предзаполнено правилом                                      |
| `## 3. Approved UX Flow Example`         | rename   | GOLDEN_DX                    | утверждённый UX-пример переносится в канонический Golden DX |
| `## 4. Requirements & Constraints`       | keep     | REQUIREMENTS_AND_CONSTRAINTS | предзаполнено правилом                                      |
| `## 5. High-Level Architecture`          | keep     | ARCHITECTURE                 | предзаполнено правилом                                      |
| `## 6. Decision Log`                     | keep     | DECISION_LOG                 | предзаполнено правилом                                      |
| `## 7. Scope Dependencies`               | keep     | SCOPE_DEPENDENCIES           | предзаполнено правилом                                      |
| `## 8. Bootstrap Requirements`           | keep     | BOOTSTRAP_REQUIREMENTS       | предзаполнено правилом                                      |
| `## 9. Module Map`                       | keep     | MODULE_MAP                   | предзаполнено правилом                                      |
| `## 10. Handoff to module-decomposition` | keep     | HANDOFF                      | предзаполнено правилом                                      |
| —                                        | create   | OVERVIEW                     | если не покрыта строками выше — создать                     |
| —                                        | create   | GOLDEN_DX                    | если не покрыта строками выше — создать                     |
| —                                        | create   | USE_CASES                    | если не покрыта строками выше — создать                     |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/agent-inbox/agent-inbox.task.<новый-ID>.md`. -->

| Файл                                        | Task-ID  | Новый ID    | Назначение                                          |
| ------------------------------------------- | -------- | ----------- | --------------------------------------------------- |
| `tasks/agent-inbox/agent-inbox.task-166.md` | TSK-166  | AI-seed     | `specs/agent-inbox/agent-inbox.task.AI-seed.md`     |
| `tasks/agent-inbox/agent-inbox.task-167.md` | TSK-167  | AI-fasttest | `specs/agent-inbox/agent-inbox.task.AI-fasttest.md` |
| `tasks/agent-inbox/agent-inbox.task-168.md` | TSK-168A | AI-skip-fix | `specs/agent-inbox/agent-inbox.task.AI-skip-fix.md` |
| `tasks/agent-inbox/agent-inbox.task-172.md` | TSK-172  | AI-roots    | `specs/agent-inbox/agent-inbox.task.AI-roots.md`    |
| `tasks/agent-inbox/agent-inbox.task-181.md` | TSK-181  | AI-cutover  | `specs/agent-inbox/agent-inbox.task.AI-cutover.md`  |

<!--/SECTION:TICKET_MAP-->

<!--SECTION:DIAGRAM_PLAN-->

## Diagram Plan

<!-- Заполняет агент: какая диаграмма встанет в Overview (обязательная) и откуда её содержание
     (существующий mermaid-блок / новая — из какого текста строится). Дополнительные диаграммы
     (последовательности, потоки данных) — по решению агента, если они улучшают чтение. -->

- существующих mermaid-блоков: 2
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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/agent-inbox` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
