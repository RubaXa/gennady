# План миграции: specs/infra-npm-publish/infra-npm-publish.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** infra-npm-publish

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/infra-npm-publish/infra-npm-publish.spec.md` · строк: 153 · scope-type: — · mermaid-блоков: 0 · якорей: 0
- обязательные целевые секции: `OVERVIEW`
- заголовки (level 2):
  - `## scope-type`
  - `## 1. Vision`
  - `## 2. Tool Stack`
  - `## 3. Developer Workflow Example`
  - `## 4. File Structure`
  - `## 5. Effective Rules (for cascade)`
  - `## 6. Verification Commands`
  - `## 7. Decision Log`
  - `## 8. Scope Dependencies`
  - `## 9. Bootstrap Requirements`
  - `## 10. Handoff`
- тикеты:
  - `tasks/infra-npm-publish/infra-npm-publish.task-185.md` · `INP-pack-ai` · [x] DONE · Добавить копирование `ai/ → dist/ai/` в `scripts/prepare-publish-artifacts.ts`, чтобы вся директория `ai/` попадала в `dist/` и включалась в npm-пакет (уже покрывается `"files": ["dist/**/*"]`).
  - `tasks/infra-npm-publish/infra-npm-publish.task-42.md` · `INP-rel-dep` · [x] DONE · Установить `release-it` как dev-зависимость для автоматизации npm-публикации.
  - `tasks/infra-npm-publish/infra-npm-publish.task-43.md` · `INP-rel-conf` · [x] DONE · Создать конфигурацию `release-it` с pre-publish хуками (lint + test), git tag/push и npm publish.
  - `tasks/infra-npm-publish/infra-npm-publish.task-44.md` · `INP-rel-cmd` · [x] DONE · (1) Добавить `"release": "release-it"` в scripts `package.json`. (2) Добавить `"ai/**/*"` в `files` чтобы `ai/` попадала в npm-пакет.
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                              | Действие | Цель (SECTION)         | Комментарий                             |
| ------------------------------------- | -------- | ---------------------- | --------------------------------------- |
| `## scope-type`                       | keep     | SCOPE_TYPE             | предзаполнено правилом                  |
| `## 1. Vision`                        | keep     | VISION                 | предзаполнено правилом                  |
| `## 2. Tool Stack`                    | keep     | TOOL_STACK             | предзаполнено правилом                  |
| `## 3. Developer Workflow Example`    | keep     | WORKFLOW_EXAMPLE       | предзаполнено правилом                  |
| `## 4. File Structure`                | keep     | FILE_STRUCTURE         | предзаполнено правилом                  |
| `## 5. Effective Rules (for cascade)` | keep     | EFFECTIVE_RULES        | предзаполнено правилом                  |
| `## 6. Verification Commands`         | keep     | VERIFICATION_COMMANDS  | предзаполнено правилом                  |
| `## 7. Decision Log`                  | keep     | DECISION_LOG           | предзаполнено правилом                  |
| `## 8. Scope Dependencies`            | keep     | SCOPE_DEPENDENCIES     | предзаполнено правилом                  |
| `## 9. Bootstrap Requirements`        | keep     | BOOTSTRAP_REQUIREMENTS | предзаполнено правилом                  |
| `## 10. Handoff`                      | keep     | HANDOFF                | предзаполнено правилом                  |
| —                                     | create   | OVERVIEW               | если не покрыта строками выше — создать |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/infra-npm-publish/infra-npm-publish.task.<новый-ID>.md`. -->

| Файл                                                    | Task-ID | Новый ID     | Назначение                                                       |
| ------------------------------------------------------- | ------- | ------------ | ---------------------------------------------------------------- |
| `tasks/infra-npm-publish/infra-npm-publish.task-185.md` | TSK-185 | INP-pack-ai  | `specs/infra-npm-publish/infra-npm-publish.task.INP-pack-ai.md`  |
| `tasks/infra-npm-publish/infra-npm-publish.task-42.md`  | TSK-42  | INP-rel-dep  | `specs/infra-npm-publish/infra-npm-publish.task.INP-rel-dep.md`  |
| `tasks/infra-npm-publish/infra-npm-publish.task-43.md`  | TSK-43  | INP-rel-conf | `specs/infra-npm-publish/infra-npm-publish.task.INP-rel-conf.md` |
| `tasks/infra-npm-publish/infra-npm-publish.task-44.md`  | TSK-44  | INP-rel-cmd  | `specs/infra-npm-publish/infra-npm-publish.task.INP-rel-cmd.md`  |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/infra-npm-publish` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
