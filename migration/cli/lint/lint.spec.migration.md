# План миграции: specs/cli/lint/lint.spec.md

- **Status:** APPROVED <!-- PLANNED → MAPPED → APPROVED → DONE -->
- **Scope:** cli | **Module:** lint

<!--SECTION:INVENTORY-->

## Inventory

<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->

- spec: `specs/cli/lint/lint.spec.md` · строк: 1040 · scope-type: — · mermaid-блоков: 1 · якорей: 0
- обязательные целевые секции: `MODULE_VISION`, `OVERVIEW`, `MODULE_USAGE_EXAMPLE`, `ENTITY_INVENTORY`, `MODULE_CONTRACTS`
- секции, чья детализация сворачивается в `<details>`: `DECISION_LOG`, `BOOTSTRAP_REQUIREMENTS`, `EFFECTIVE_RULES`, `COMPATIBILITY_MATRIX`, `ENTITY_SURFACES`, `MODULE_CONTRACTS`, `MODULE_DECISION_LOG`
- заголовки (level 2):
  - `## 1. Module Vision`
  - `## 2. Entity Inventory (Closed-World)`
  - `## 3. Entity Surfaces`
  - `## 4. Module Contracts (DbC)`
  - `## 5. Public Options & Policies`
  - `## 6. File Structure`
  - `## 6.1 Test Scenarios`
  - `## 7. Module Decision Log`
  - `## 8. Inter-Module Dependencies`
  - `## 9. Handoff to Task Scaffolding`
- тикеты:
  - `tasks/cli/lint/cli-lint.task-12.md` · `LIN-types` · — · Создать единый файл типов `lint.types.ts` с `LintError`, `LintOptions`, `LintReport` и константами кодов ошибок `ERR_CLI_LINT_*`.
  - `tasks/cli/lint/cli-lint.task-13.md` · `LIN-headers` · — · Реализовать `FileHeaderCheck.check(content, filePath) → LintError[]` — проверка наличия `// @file:` и `// @consumers:` в начале TypeScript-файла.
  - `tasks/cli/lint/cli-lint.task-14.md` · `LIN-anchors` · — · Реализовать `AnchorCheck.check(content, filePath) → LintError[]` — проверка парности и вложенности `// #region START_<NAME>` / `// #endregion END_<NAME>`.
  - `tasks/cli/lint/cli-lint.task-15.md` · `LIN-dbc` · — · Реализовать `DbcContractCheck.check(content, filePath, autofix) → Promise<LintError[]>` — адаптер к `DbcTsLinter` из scope `dbc`.
  - `tasks/cli/lint/cli-lint.task-16.md` · `LIN-command` · [x] DONE · Реализовать `LintCommand.run()` — CLI-обвязку: парсинг аргументов, git scan, цикл по файлам, вывод. Зарегистрировать команду в `gennady.ts` и `cli/AGENTS.md`.
  - `tasks/cli/lint/cli-lint.task-17.md` · `LIN-unit` · — · Написать unit-тесты для всех трёх проверок и интеграционные тесты для `LintCommand`.
  - `tasks/cli/lint/cli-lint.task-18.md` · `LIN-e2e` · — · Написать интеграционные тесты для команды `gennady lint`, проверяющие полный pipeline: parseArgs → сбор файлов → 3 проверки → вывод → exit code. Эти тесты должны ловить регрессии, которые unit-тесты отдельных checks не видят.
  - `tasks/cli/lint/cli-lint.task-32.md` · `LIN-language` · — · Добавить четвёртую проверку в `gennady lint` — LanguageCheck. JSDoc-контракты (DbC: `@purpose`, `@implements`, `@invariant`, `@param`, `@returns`, `@consumer`, `@sideEffect`) и file headers (`// @file:`, `// @consumers:`) должны быть на английском. Кириллические символы → `ERR_CLI_LINT_NON_ENGLISH`.
  - `tasks/cli/lint/cli-lint.task-49.md` · `LIN-targets` · [x] DONE · Реализовать `resolveTargets()` — рекурсивный обход директорий с фильтрацией `.ts`/`.tsx`, дедупликацией и graceful degradation. Интегрировать в `LintCommand.run()`.
  - `tasks/cli/lint/cli-lint.task-50.md` · `LIN-dir-test` · [x] DONE · Написать 24 unit-теста для `resolveTargets()` и 19 интеграционных тестов CLI для поддержки директорий.
  - `tasks/cli/lint/cli-lint.task-51.md` · `LIN-disable` · [x] DONE · Реализовать `DisablesCheck` — enforcement политики D-007 из `cli.spec.md`. Каждое отключение TypeScript (`@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`) или линтера (`eslint-disable*`) обязано в той же строке нести ссылку `D-\d+` на запись Decision Log.
  - `tasks/cli/lint/cli-lint.task-52.md` · `LIN-purpose` · [x] DONE · Усилить `DisablesCheck` контракт: помимо `D-\d+` ссылки требовать наличие purpose-обоснования (≥ 8 непробельных символов после удаления маркера и токена `D-NNN`). Цель — не позволить агенту формально соблюсти политику D-007 пустой ссылкой типа `/* @ts-ignore: D-099 */` без объяснения зачем.
  <!--/SECTION:INVENTORY-->

<!--SECTION:SECTION_MAP-->

## Section Map

<!-- Предзаполнено `sdd-migrate plan` по курируемым правилам (mapHeadingToSection). Агент правит
     только строки с целью UNMAPPED — остальные пересматривает лишь если правило ошиблось.
     Действия: keep | rename | merge | split | create | drop. Каждая обязательная целевая секция должна появиться в колонке «Цель».
     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->

| Источник                                | Действие | Цель (SECTION)            | Комментарий                                    |
| --------------------------------------- | -------- | ------------------------- | ---------------------------------------------- |
| `## 1. Module Vision`                   | keep     | MODULE_VISION             | предзаполнено правилом                         |
| `## 2. Entity Inventory (Closed-World)` | keep     | ENTITY_INVENTORY          | предзаполнено правилом                         |
| `## 3. Entity Surfaces`                 | keep     | ENTITY_SURFACES           | предзаполнено правилом                         |
| `## 4. Module Contracts (DbC)`          | keep     | MODULE_CONTRACTS          | предзаполнено правилом                         |
| `## 5. Public Options & Policies`       | keep     | PUBLIC_OPTIONS            | предзаполнено правилом                         |
| `## 6. File Structure`                  | keep     | FILE_STRUCTURE            | предзаполнено правилом                         |
| `## 6.1 Test Scenarios`                 | keep     | BDD                       | тестовые сценарии сохраняются как BDD evidence |
| `## 7. Module Decision Log`             | keep     | MODULE_DECISION_LOG       | предзаполнено правилом                         |
| `## 8. Inter-Module Dependencies`       | keep     | INTER_MODULE_DEPENDENCIES | предзаполнено правилом                         |
| `## 9. Handoff to Task Scaffolding`     | keep     | HANDOFF                   | предзаполнено правилом                         |
| —                                       | create   | OVERVIEW                  | если не покрыта строками выше — создать        |
| —                                       | create   | MODULE_USAGE_EXAMPLE      | если не покрыта строками выше — создать        |

<!--/SECTION:SECTION_MAP-->

<!--SECTION:TICKET_MAP-->

## Ticket Map

<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, слаг ≤8 символов (дефисы включительно), уникален в рамках всего репо.
     Назначение вычисляется из ID: `specs/cli/lint/lint.task.<новый-ID>.md`. -->

| Файл                                 | Task-ID | Новый ID     | Назначение                                 |
| ------------------------------------ | ------- | ------------ | ------------------------------------------ |
| `tasks/cli/lint/cli-lint.task-12.md` | TSK-12  | LIN-types    | `specs/cli/lint/lint.task.LIN-types.md`    |
| `tasks/cli/lint/cli-lint.task-13.md` | TSK-13  | LIN-headers  | `specs/cli/lint/lint.task.LIN-headers.md`  |
| `tasks/cli/lint/cli-lint.task-14.md` | TSK-14  | LIN-anchors  | `specs/cli/lint/lint.task.LIN-anchors.md`  |
| `tasks/cli/lint/cli-lint.task-15.md` | TSK-15  | LIN-dbc      | `specs/cli/lint/lint.task.LIN-dbc.md`      |
| `tasks/cli/lint/cli-lint.task-16.md` | TSK-16  | LIN-command  | `specs/cli/lint/lint.task.LIN-command.md`  |
| `tasks/cli/lint/cli-lint.task-17.md` | TSK-17  | LIN-unit     | `specs/cli/lint/lint.task.LIN-unit.md`     |
| `tasks/cli/lint/cli-lint.task-18.md` | TSK-18  | LIN-e2e      | `specs/cli/lint/lint.task.LIN-e2e.md`      |
| `tasks/cli/lint/cli-lint.task-32.md` | TSK-32  | LIN-language | `specs/cli/lint/lint.task.LIN-language.md` |
| `tasks/cli/lint/cli-lint.task-49.md` | TSK-49  | LIN-targets  | `specs/cli/lint/lint.task.LIN-targets.md`  |
| `tasks/cli/lint/cli-lint.task-50.md` | TSK-50  | LIN-dir-test | `specs/cli/lint/lint.task.LIN-dir-test.md` |
| `tasks/cli/lint/cli-lint.task-51.md` | TSK-51  | LIN-disable  | `specs/cli/lint/lint.task.LIN-disable.md`  |
| `tasks/cli/lint/cli-lint.task-52.md` | TSK-52  | LIN-purpose  | `specs/cli/lint/lint.task.LIN-purpose.md`  |

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
- [ ] S6 ✅ `npx tsx cli/gennady.ts sdd-check --all specs/cli` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE

<!--/SECTION:STEPS-->
