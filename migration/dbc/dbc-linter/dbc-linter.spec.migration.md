# План миграции: specs/dbc/dbc-linter/dbc-linter.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** dbc | **Module:** dbc-linter

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/dbc/dbc-linter/dbc-linter.spec.md` · строк: 602 · scope-type: — · mermaid-блоков: 1 · якорей: 0
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
  - `tasks/dbc/dbc-linter/dbc-linter.task-04.md` · `DL-ts-deps` · — · Установить `tree-sitter` и `tree-sitter-typescript` как dev-зависимости.
  - `tasks/dbc/dbc-linter/dbc-linter.task-05.md` · `DL-vite-ext` · — · Пометить `tree-sitter` как external dependency в Vite-конфиге, чтобы нативные биндинги не бандлились.
  - `tasks/dbc/dbc-linter/dbc-linter.task-06.md` · `DL-layout` · — · Создать структуру директорий для модуля dbc-linter: `services/dbc/linter/` с поддиректориями `implementations/ts/__tests__/fixtures/`.
  - `tasks/dbc/dbc-linter/dbc-linter.task-07.md` · `DL-types` · [x] DONE · Написать ядро типов модуля dbc-linter: Ports (`DbcLinter`, `DbcAstAdapter`), Value Objects, константы `ERR_DBC_LINT_*`.
  - `tasks/dbc/dbc-linter/dbc-linter.task-08.md` · `DL-ast` · [x] DONE · Реализовать `DbcTsAstAdapter` — адаптер парсинга TypeScript-файлов через tree-sitter: обход AST, сбор export-сущностей, их членов, сигнатур и JSDoc-контрактов.
  - `tasks/dbc/dbc-linter/dbc-linter.task-09.md` · `DL-match` · [x] DONE · Реализовать `DbcContractMatchValidator` (сверка контракта с сигнатурой) и `DbcTsLinter` (lint + lintAndFix с autofix-цепочкой).
  - `tasks/dbc/dbc-linter/dbc-linter.task-10.md` · `DL-fixtures` · — · Написать исчерпывающий набор fixture-тестов для dbc-linter, покрывающий все 88 тестовых случаев из матрицы покрытия: happy path, каждый код ошибки, autofix, edge cases, DbcContractMatchValidator unit-тесты.
  - `tasks/dbc/dbc-linter/dbc-linter.task-11.md` · `DL-content` · [x] DONE · Добавить опциональный параметр `content` в `DbcLinter.lint()` и `lintAndFix()`, чтобы потребитель мог передать предварительно прочитанный контент файла и избежать двойного чтения с диска.
  - `tasks/dbc/dbc-linter/dbc-linter.task-19.md` · `DL-objprop` · — · Расширить матрицу проверок FR-24: члены `type` с объектным литералом и `interface property` (function-typed) теперь проверяются на соответствие `@param`/`@returns` так же, как function/method.
  - `tasks/dbc/dbc-linter/dbc-linter.task-20.md` · `DL-tags` · [x] DONE · Исправить баг в `_reorderTags`: строка `*/` (закрытие JSDoc) обрабатывалась как continuation-строка последнего тега. После сортировки тегов `*/` уезжал в середину блока, а тег с order=99 выпадал за пределы `/** */`, ломая синтаксис TypeScript. Добавить тесты на все edge cases.
  - `tasks/dbc/dbc-linter/dbc-linter.task-21.md` · `DL-jsdoc-fx` · [x] DONE · Исправить autofix: (1) добавить `_normalizeMultiLine` — приведение любого multi-line JSDoc к каноническому виду (`/**` отдельно, `*` префикс, ` */` отдельно), (2) нормализация должна запускаться всегда, даже если lint-ошибок нет (сейчас ранний return при `initialCount === 0`), (3) `_inlineIfSafe` инлайнит только однотеговые контракты (ровно 1 `@tag`); многотеговые с `|` разделителем невалидны как JSDoc — ломают подсветку и навигацию в IDE.
  - `tasks/dbc/dbc-linter/dbc-linter.task-88.md` · `DL-redund` · [x] DONE · Реализовать шаг autofix `_removeRedundantInImplements`: удаление `@param`/`@returns` в методах класса с `implements Interface` + `@see {Interface#method}`. Включает: AST-адаптер → `implementsInterfaces: string[]`, валидатор → интеграция `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` через `DbcValidateContext` (константа уже объявлена в `dbc-linter.types.ts`), autofix-функция, приоритет над `ERR_DBC_LINT_RETURNS_UNEXPECTED`, 17 тестовых фикстур.
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
     Назначение вычисляется из ID: `specs/dbc/dbc-linter/dbc-linter.task.<новый-ID>.md`. -->

| Файл                                         | Task-ID | Новый ID    | Назначение                                            |
| -------------------------------------------- | ------- | ----------- | ----------------------------------------------------- |
| `tasks/dbc/dbc-linter/dbc-linter.task-04.md` | TSK-04  | DL-ts-deps  | `specs/dbc/dbc-linter/dbc-linter.task.DL-ts-deps.md`  |
| `tasks/dbc/dbc-linter/dbc-linter.task-05.md` | TSK-05  | DL-vite-ext | `specs/dbc/dbc-linter/dbc-linter.task.DL-vite-ext.md` |
| `tasks/dbc/dbc-linter/dbc-linter.task-06.md` | TSK-06  | DL-layout   | `specs/dbc/dbc-linter/dbc-linter.task.DL-layout.md`   |
| `tasks/dbc/dbc-linter/dbc-linter.task-07.md` | TSK-07  | DL-types    | `specs/dbc/dbc-linter/dbc-linter.task.DL-types.md`    |
| `tasks/dbc/dbc-linter/dbc-linter.task-08.md` | TSK-08  | DL-ast      | `specs/dbc/dbc-linter/dbc-linter.task.DL-ast.md`      |
| `tasks/dbc/dbc-linter/dbc-linter.task-09.md` | TSK-09  | DL-match    | `specs/dbc/dbc-linter/dbc-linter.task.DL-match.md`    |
| `tasks/dbc/dbc-linter/dbc-linter.task-10.md` | TSK-10  | DL-fixtures | `specs/dbc/dbc-linter/dbc-linter.task.DL-fixtures.md` |
| `tasks/dbc/dbc-linter/dbc-linter.task-11.md` | TSK-11  | DL-content  | `specs/dbc/dbc-linter/dbc-linter.task.DL-content.md`  |
| `tasks/dbc/dbc-linter/dbc-linter.task-19.md` | TSK-19  | DL-objprop  | `specs/dbc/dbc-linter/dbc-linter.task.DL-objprop.md`  |
| `tasks/dbc/dbc-linter/dbc-linter.task-20.md` | TSK-20  | DL-tags     | `specs/dbc/dbc-linter/dbc-linter.task.DL-tags.md`     |
| `tasks/dbc/dbc-linter/dbc-linter.task-21.md` | TSK-21  | DL-jsdoc-fx | `specs/dbc/dbc-linter/dbc-linter.task.DL-jsdoc-fx.md` |
| `tasks/dbc/dbc-linter/dbc-linter.task-88.md` | TSK-88  | DL-redund   | `specs/dbc/dbc-linter/dbc-linter.task.DL-redund.md`   |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/dbc` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
