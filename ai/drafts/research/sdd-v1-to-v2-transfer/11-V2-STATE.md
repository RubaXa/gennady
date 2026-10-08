# 11 — Состояние SDD v2 (RC codex/sdd-v2-rc52-followup): что сделано, точки расширения

> Статус: ВЕРИФИЦИРОВАНО (A2 + V-A2, правки применены). RC на момент инвентаря 11291af5; учтены 95329c19 и 3d5f66a7.

**Как читать.** Документ описывает ТОЛЬКО ветку `codex/sdd-v2-rc52-followup` (RC), инвентарь A2 против HEAD `11291af5`. Каждый факт ниже прошёл независимую верификацию V-A2 (свежие глаза, повторный прогон команд, построчная сверка `file:line`); там, где A2 и верификатор разошлись, в силе версия верификатора — она отмечена явно. Необработанные исходники (полный английский инвентарь A2 + полный отчёт верификатора V-A2 на русском) лежат в `_raw/11-V2-STATE.raw.md` — этот файл не редактировался, здесь приведена сведённая версия со всеми правками. Раздел 9 — единственное место, где RC явно сравнивается с main (по `package.json` и составу репозитория); поведенческое сравнение с main — предмет `10-MAIN-DELTA.md`.

Проверка проводилась read-only на чекауте RC `<R>`, merge-base с `main` — `46c6d616`. Все пути ниже — относительно `<R>`, если не указано иное; все `file:line` — относительно HEAD `11291af5`.

---

## 1. CLI-поверхность

Диспетчер команд — `cli/gennady.ts`; каждая команда живёт в `cli/cmd/<name>/{index.ts,<name>.cmd.ts,<name>.types.ts,help.ts}`. Help-вывод снят вживую командой `node --import tsx cli/gennady.ts <cmd> --help` для 14 команд и подтверждён верификатором построчно.

### 1.1 Таблица команд

| Команда | Назначение (из help.ts) | Режимы / флаги | Что читает | Вывод / коды выхода | Жёсткие блокировки | Тесты (`cli/cmd/<cmd>/__tests__`) |
|---|---|---|---|---|---|---|
| `sdd-check` (`cli/cmd/sdd-check/sdd-check.cmd.ts`, 1951 LOC вкл. `phase-receipt-check.ts`) | «Mechanical audit of SDD artifacts (the deterministic half of audit)» | ровно один из `--task <ticket>`, `--spec <path> --authoring`, `--all [root]`, `--changed [root]`; `--authoring [--phase P<N>]`, `--format json` (`gennady.sdd-check.findings.v1`) | тикет/спека под `specs/`; `ai/directives/knowledge.xml` (замыкание правил); тестовые файлы из §Test Coverage; git (`--changed` использует HEAD; `TASKS_APPEND_ONLY`, `CONSUMERS_RESOLVABLE`); `package.json` (проверки receipt/coverage-gate) | строки находок в стиле ESLint + итог; `0` чисто (warning допустимы), `1` есть error, `4` неверный вызов; `ERR_CLI_SDD_CHECK_READ_FAILED` на нечитаемых/симлинк-файлах (fail closed) | `--authoring` отвергает сфабрикованный DONE (`[x]` со строкой-плейсхолдером `<…>`); `PHASE_RECEIPT` требует «complete current CLI evidence» для каждой schema-aware фазы | `sdd-check.cmd.test.ts`, `phase-receipt-check.test.ts`, `group-receipt.check.test.ts`, `fixtures/` |
| `sdd-extract` (386 LOC) | Вырезать один блок `<!--SECTION:NAME-->` (или `#heading-anchor`) из тикета/спеки | `<file> <NAME>` / `<file>#<slug>`; канонические имена `META PHASES_OVERVIEW PHASE_P<N> PHASE_P<N>_FIX BDD VERIFICATION TEST_COVERAGE EXECUTION_LOG` | один markdown-файл | тело секции в stdout; `1` не найдено, `2` пустой/отсутствующий якорь, `3` маркеры не сбалансированы/дублируются, `4` неверный вызов | — | `sdd-extract.cmd.test.ts` |
| `sdd-log` (1443 LOC) | Дописать события / атомарно завершить верифицированную фазу или черновик спеки | `round`, `line [--phase]`, `close`, `phase <P-ID>`, `handoff`, `blocker --axiom --unblock --phase`, `resolved --phase`, `complete --phase`, `<spec> authoring-complete`, `<group> audit-receipt <verdict>`, `<group> review-receipt <verdict>`; файловые `--content-file/--payload-file` под `.claude/tmp/` (≤32768 байт, обычный не-симлинк файл) | тикет; phase receipt (из `sdd-verify`) для `complete`; спека + результат `sdd-check --spec --authoring` для `authoring-complete`; членство в группе + git HEAD для `*-receipt` | пишет в тикет/спеку; `0` записано, `1` не удалось записать, `2` нет receipt/состояния фазы/секции, `4` неверный вызов | `complete` требует CLI-owned receipt от `sdd-verify` + скелет текущего Round + типизированный 4-полевой Handoff; `audit-receipt/review-receipt` отказывают, если не каждый член группы `[x] DONE`, привязывают к HEAD, пишут forge-resistant блок `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT`; плейсхолдер-контент → exit 2 | `sdd-log.cmd.test.ts`, `group-receipt.cmd.test.ts` |
| `sdd-migrate` (424 LOC + `shared/sdd/migration-*.ts`) | V1→V2 миграция, детерминированные шаги | `anchors <ticket>|--all [--write]`, `plan [root] [--write|--verify]`, `ids [root] --map <tsv>|--from-plan [--write]`, `move [root] --scope <s> [--write]` | v1 `tasks/**/*.task-*.md` (якоря; `move` находит тикеты по Task-ID в содержимом — коммит 933a13d8), `specs/`, `migration/**/*.migration.md` | по умолчанию dry-run отчёт; `0` отчёт, `1` findings при verify / невалидная карта / заблокированный move, `4` неверный вызов | `plan --verify` — детерминированный гейт: дрейф инвентаря, покрытие карты, словарь действий, грамматика слагов, репозиторные коллизии слагов; `ids --write` требует ноль старых ID | `sdd-migrate.cmd.test.ts` |
| `sdd-new` (1056 LOC + `shared/sdd/templates.ts` 2051 LOC) | Заскаффолдить один v2-артефакт из общего реестра шаблонов | `<kind> --scope [--owner infrastructure-flat\|scope-bootstrap\|module] [--module] [--id <ACR-slug>] [--slug] [--out]`, `--list`, `<kind> --manifest`; kinds `product library infrastructure interface module task portal research module-index scope-index project-index` | портал + владеющая спека (доказательство замыкания Module Map ↔ module-спека для тасков), `ai/directives/knowledge.xml` (печатает кортежи rule ID + href), типизированные contract-якоря владеющей спеки (≤40, дублирующиеся слаги — ошибка) | созданный путь + таблица-манифест секций; `0` ок, `1` уже существует/ошибка записи/невалидный реестр правил, `4` неверный вызов | отказывает перезаписывать; владелец таска доказывается против типа scope; каждая опция одноразовая | `sdd-new.cmd.test.ts`, `fixtures/` |
| `sdd-orient` («151 LOC + `core/`, `render/`») | Окрестность design-графа глубины 1 для одной спеки (навигирует по спекам, не по коду) | `<spec-path>` или `--scope <name>` | портал `specs/README.md`, `.spec.md` (v2 SECTION и легаси нумерованные заголовки) | списки портала / соседей / потребителей; `0` ок, `4` неверный вызов или цель не разрешилась | — | 8 тест-файлов (`build-neighbourhood`, `parse-module`, `parse-scope`, `render-neighbourhood`, `resolve-target`, `sdd-orient.cmd`, `spec-kind`, `spec-sections`) |
| `sdd-state` (609 LOC) | Детерминированный снимок состояния проекта для роутера | `[project-root]`; `--probe` принимается как no-op | портал `specs/README.md`, `specs/**` (счётчик module-спек, spec-schema), rollup `specs/3-tasks.md`, `tasks/` (детекция FLOW_VERSION v1 через `shared/sdd/flow.ts`), **`package.json` scripts** через `gatherReadinessInput` (`sdd-state.cmd.ts:10`), `node_modules/.bin/gennady`, проба репозитория (`shared/sdd/probe.ts`: каталоги CODE/INFRA, конфиги) | `FLOW_VERSION`, `PORTAL`, `[READINESS]` (AUTHORING_SCOPE/AUTHORING_READY/EXECUTION_READY/GATE_QUEUE), `[SCOPES]`, `[SPEC_SCHEMA]`, `NEXT`, `[PROBE]`, `[SUMMARY]`, плюс карточка-лестница из 5 рангов (`shared/sdd/ladder.ts`); `0` ок, `2` неверный root, `4` неверный вызов | печатает диагностику `FLOW_VERSION=v1; migrate before v2 scaffold` (`sdd-state.cmd.ts:180`) | `sdd-state.cmd.test.ts` |
| `sdd-sync` (410 LOC) | Пробросить Status тикета в `*.3-tasks.md`-трекеры | `<ticket> [index.3-tasks.md ...]`; только точные repo-relative обычные файлы | Meta тикета (Task-ID, Status); владеющие трекеры ищутся вверх module→scope→project | отчёт по каждому индексу `updated/in-sync/no-row/no-table/unreadable`; `0`, `1` тикет нечитаем/verify не прошёл, `2` Meta не парсится, `4` | переписывает только ячейку Status; проверяет, что запись сохранилась | `sdd-sync.cmd.test.ts` |
| `sdd-task` (1524 LOC) | Поверхность планирования тикетов для оркестратора execute | `[project-root]` (карта исполнения), `<ticket> [--phase P<N>]`, `--audit-group`, `--group-scope`, `--task-scope` | все тикеты (`collectTicketCorpus`), трекеры, портал (`parseScopes`), **`package.json` scripts** (`sdd-task.cmd.ts:19`, чтение на `:495-500`), git HEAD (attributable-изменения для group scope; unborn HEAD откатывается к заявленным файлам), phase receipts | карта исполнения с `EXECUTION_READY=yes\|no`, `GATE_QUEUE=…`, `pickable`/`blocked`; манифест READ/CREATE по фазе, `[HANDOFF]`, строка `coverage-gates:`; `0`, `1` нечитаемый/невалидный тикет, `2` не тикет / неизвестная фаза, `4` | **Гейт готовности** `sdd-task.cmd.ts:453-484`: любая фаза, чей kind ∉ allow-list `['bootstrap','config','doc']`, отклоняется, если `checkReadiness(...).executionReady` ложно — кроме случая, когда `phaseOwnsMissingReadinessGate(queue, taskId, phaseId)` (тикет в GATE_QUEUE и владеет недостающим гейтом). Карта исполнения: `pickable = readiness.executionReady ? graphPickable : queuePickable` (`:123`). Замыкание зависимостей должно быть `[x]` со свежими receipt; циклы — fail closed; некорректная 3-колоночная таблица Verification — отказ до любого вывода | `sdd-task.cmd.test.ts` |
| `sdd-verify` (2856 LOC: `phase-context.ts`, `phase-run.ts`, `repair-adapters.ts`, `workspace-mutation.ts`, `phase-receipt-validation.ts`) | Прогнать лестницу верификации (сначала дешёвое и главное) | `--task <ticket> --phase <P>` (профиль выводится из kind фазы) или `--profile full` | фаза тикета (kind, Target Files, Deleted Files, владеющая спека), **`package.json` scripts** (`resolveProjectScriptName`, `isDeclaredArgumentForwardingRepairBrick`), снимок рабочего дерева (кроме `.git` и `node_modules`), каталог coverage-артефактов | `[sdd-verify] ✅ ALL PASS (N/M)` + построчно по шагам; в phase-режиме пишет структурированный receipt в Execution Log (атомарно, temp+rename); `0`, `1` гейт/контекст фазы не прошли, `4` неверный вызов | Профили (`shared/sdd/phase-verification-plan.ts:43-64`): `setup`→`fix·type-check·test`, все опциональны; `code`→`fix·type-check·test`; `test` (владелец coverage)→`fix·type-check·test:coverage`; `full`→`type-check·test:coverage·lint·format·yagni`, read-only. Не-`setup` профили требуют заявленных argument-forwarding repair-bricks `format:fix`/`lint:fix` (`sdd-verify.cmd.ts:433-451`); любая устойчивая мутация рабочего дерева вне Target Files — отказ, без receipt; зелёный `test:coverage` без свежего отчёта адаптера перекрашивается в красный (`:185-208`) | `sdd-verify.cmd.test.ts`, `phase-context.test.ts`, `phase-run.test.ts`, `workspace-mutation.test.ts` |
| `yagni` (666 LOC + `shared/sdd/yagni.ts`) | Флагует добавленные/изменённые символы с <2 продакшн-использованиями | `[root]` | git-диф HEAD + untracked; счётчик использований по всему репо; Decision Log в `specs/` для `Usage Waiver` id | `0` чисто, `1` findings, `2` невалидный root/git-scope, `4` неверный argv | non-git/битый root — fail closed | `yagni.cmd.test.ts`, `yagni-index.test.ts` |
| `sync` (558 LOC) | Зеркалирует `ai/directives/` из установленного npm-пакета в проект | `[subdirs...] [--dry-run]` | `ai/directives/` пакета через `resolvePackageDir` (требует `node_modules/gennady`), целевой `<cwd>/ai/directives` | added/updated/unchanged/**deleted** записи + предупреждения; exit `0`/`1` | package-owned зеркало: удаляет в цели файлы, отсутствующие в источнике внутри package-owned подкаталогов (`sync-core.ts:220-243`); исключён только `architecture` (`EXCLUDED_ENTRIES`, `sync-core.ts:16`). **Никакой особой обработки `knowledge.xml` нет** (grep по `cli/cmd/sync/*.ts` и `shared/common/sync/*.ts` на `knowledge` → 0 совпадений) | `sync-core.test.ts`, `sync-formatter.test.ts`, `sync.cmd.test.ts` |
| `sync-skills` (895 LOC; **нет help.ts** → «No help available») | Зеркалирует `ai/skills/` → `<cwd>/.claude/skills`; сперва прогоняет синк директив (`sync-skills.cmd.ts:67-100 syncDirectivesFirst`) | позиционные имена скиллов, `--dry-run` | `ai/skills` пакета, цель `.claude/skills` | записи вкл. `deleted`/`deleteFailed` | **Нет манифеста**: подрезка идёт сравнением источник/цель — каждый каталог скилла в цели, которого нет в источнике, — сирота (`sync-skills-core.ts:395-403`), а файлы внутри сохранённого скилла, отсутствующие в источнике, удаляются (`:381-391`). Исключены только дотфайлы + `.DS_Store` (`EXCLUDED_NAMES`, `:22`); логики исключения тестов нет — `ai/skills/` не содержит `__tests__`/`*.test.*` (find ничего не нашёл), так что сегодня она и не нужна | `sync-skills-core.test.ts`, `sync-skills-formatter.test.ts`, `sync-skills.cmd.test.ts`, `sync-skills.types.test.ts` |
| `lint` (995 LOC, `checks/`, `utils/`, `lint-source-policy.ts`) | DbC/convention-линтер для TypeScript | `[paths...] --autofix --include-tests --staged --verbose --max-invariants --max-words --max-header-words --max-contract-words --max-region-comments --exclude --include-all --spec=<module-spec> --inventory-reverse <dir>` | `.ts/.tsx` исходники (tree-sitter), Entity Inventory module-спеки | находки; `4` на неверных значениях опций; `ERR_CLI_LINT_READ_FAILED` для симлинков | «When no paths or --staged are provided, lints nothing» | 8 тест-файлов (`anchor`, `anchor-thin`, `dbc-contract`, `disables`, `file-header`, `language`, `lint.cmd`, `resolve-targets`) |
| `testcov` (2101 LOC) | Coverage-дерево/гейт на адаптерах | `[path] --files --run --check --min=<pct> --json --flat --context/-c --color` | `package.json` (автодетект продюсера: vitest/jest/node:test+c8), `coverage/coverage-final.json` (istanbul) | дерево/flat/JSON; `--min` exit 0/1; `--check` 0/1; `4` неверный argv | fail-closed выбор адаптера: должен совпасть ровно один; **установлен только `istanbul-js`** — help прямо говорит: «iOS, Android, and Go adapters are not installed/supported yet» (`cli/cmd/testcov/help.ts`) | `coverage-adapter-registry.test.ts`, `coverage-threshold.test.ts`, `testcov.cmd.test.ts` |
| `agents-rules` (54 LOC; нет help.ts) | Печатает `cli/cmd/orient/README.md` из установленного пакета | нет | требует `node_modules/gennady` (`agents-rules.cmd.ts:19`) | README в stdout; exit 0/1 | — | `agents-rules.cmd.test.ts` |

Дополнительно (проверено): диспетчер `cli/gennady.ts` действительно содержит `case` для всех 16 перечисленных команд (плюс ~30 не-SDD команд, которые A2 корректно не заявляет как часть v2).

### 1.2 npm/Node-специфичная связанность (с чем столкнётся стек не на Node сегодня)

| Место | Связанность |
|---|---|
| `shared/sdd/readiness.ts:15-24` | `REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix']` — точные имена **npm-скриптов**; алиас `type-check` ↔ `typecheck` объявлен в `SCRIPT_ALIASES` на `:30-32` |
| `shared/sdd/readiness.ts:596-609` | `gatherReadinessInput(root)` читает **только** `<root>/package.json` → `scripts`; `detectGennady` (`:572-591`) требует `node_modules/.bin/gennady` или `package.json name === 'gennady'` |
| `shared/sdd/readiness.ts:260-291` | детекция read-only/mutating: `WRITE_SWITCH_PATTERN` на `:260-261` жёстко зашивает `eslint --fix`, `prettier --write`, `--autofix`; `MUTATING_SWITCH_PATTERN` на `:279` — `--write/--fix/--autofix` |
| `shared/sdd/readiness.ts` `lintReachesGennady` (`:199`, приватная обёртка над экспортируемой `scriptReachesGennady` на `:176`, её также использует `repair-adapters.ts:61`) | `lint` должен доходить до `gennady` (через `npm run`/pnpm/yarn) — `ready` требует этого |
| `shared/sdd/scripts.ts` | классифицирует скрипты `package.json` (паттерны tsc/eslint/jest/vitest/prettier/biome); потребитель — `sdd-state` |
| `shared/sdd/ladder.ts:36-39,68` | ранг «Инфраструктура» = `packageJsonPresent && typecheck && test && lint` |
| `shared/sdd/phase-verification-plan.ts:270` | команда гейта буквально `` `npm run ${script}` `` |
| `cli/cmd/sdd-verify/sdd-verify.cmd.ts:225-226` | запускает `{command:'npm', args:['run', scriptName]}` или гейт gennady |
| `cli/cmd/sdd-verify/repair-adapters.ts:99,120` | repair-адаптеры спавнят `npm` |
| `shared/sdd/phase-receipt.ts:95-320` | парсер receipt понимает вызовы `npm`/`pnpm`/`yarn`, builtins и root-only опции |
| `cli/cmd/sdd-task/sdd-task.cmd.ts:495-500` | читает скрипты `package.json` для плана верификации фазы (импорт на `:19`) |
| `cli/cmd/testcov/istanbul-coverage-adapter.ts` | единственный адаптер; продюсеры определяются из `package.json` |
| `cli/cmd/sync/sync-core.ts:65`, `agents-rules.cmd.ts:19` | требуют `node_modules/gennady` (локальная dev-зависимость) |
| `shared/sdd/yagni.ts` / help | tree-sitter точен только для `.ts/.tsx`; grep-приближение для js/py/go/rb/java |
| `gennady.yaml` | **не существует нигде в v2-коде**; упоминается в двух местах — `ai/flow-eval/docs/roundtrip-wall3-assessment.md` и `ai/flow-eval/scripts/roundtrip-readiness-shim.package.json`. Файла проектной конфигурации нет; все факты о стеке берутся из `package.json` |

---

## 2. Модули `shared/sdd/*` (43 модуля, 15 743 LOC; 61 тест-файл в `shared/sdd/__tests__/`)

*(A2 заявлял «48 модулей» и «62 test files» — верификатор пересчитал: в `shared/sdd/` вне `__tests__/` ровно **43** `.ts`-файла, подкаталогов с кодом нет; в `shared/sdd/__tests__/` на верхнем уровне ровно **61** `*.test.ts` (всего файлов в дереве `__tests__` вместе с `fixtures/**` — 71). Собственная таблица §2.1 A2 фактически перечисляла все 43 модуля правильно — ошибка была только в шапке.)*

### 2.1 Построчный индекс (назначение из `@file:`, потребители из `@consumers:`; тест = `shared/sdd/__tests__/<name>.test.ts`, если не указано иное)

| Модуль | LOC | Назначение | Ключевые экспорты | Потребители | Тест |
|---|---|---|---|---|---|
| `anchor-inject.ts` | 143 | Вставка якорей `<!--SECTION:NAME-->` в v1-тикет (pure, миграция) | `injectAnchors`, `legacyHeaderBody`, `scaffoldExecutionLog` | sdd-migrate | `anchor-inject.test.ts` |
| `audit-group.ts` | 568 | Резолв группы аудита тикета (каждый тикет владеет одна спека) + границы его git-изменений | `resolveAuditGroup`, `resolveOwningSpec`, `boundGroupChangedFiles`, `validateTicketReviewPaths`, `ticketTargetFiles`, `ticketHandoffArtifacts` | sdd-task | `audit-group.test.ts` |
| `bdd-coverage.ts` | 296 | Сравнение канонических имён кейсов §Test Scenario Coverage с реальными именами `it()/test()` (BDD_COVERAGE) | `checkBddCoverage`, `checkBddRequirementTraceability`, `parseTestCoverage`, `extractTestCaseNames`, `checkTestFileAmbiguity` | sdd-check | `bdd-coverage.test.ts` |
| `capability-adapter.ts` | 251 | «Платформо-нейтральный» реестр capability-адаптеров для feasibility скаффолда — **зашиты только Node/TS-адаптеры** (`node`, `typescript`, `typescript-quality`; `:75-190`) | `NODE_NPM_CAPABILITY_ADAPTER`, `TYPESCRIPT_CAPABILITY_ADAPTER`, `TYPESCRIPT_QUALITY_CAPABILITY_ADAPTER`, `DEFAULT_CAPABILITY_ADAPTER_REGISTRY`, `deriveCapabilityAdapterContract` | project-feasibility, тесты | (покрыт через `project-feasibility.test.ts`; отдельного теста нет) |
| `check.ts` | 2736 | Чистые механические проверки (баланс якорей, структура, статус, целостность exec-log, структура спек, графы, research) | см. §2.3 | sdd-check, sdd-task, audit-group, migration-plan | `check.test.ts` + 21 файл `check-*.test.ts` |
| `consumers-resolvable.ts` | 91 | Резолв заголовка `@consumers:` (CONSUMERS_RESOLVABLE, только warn) | `checkConsumersResolvable`, `parseConsumersHeader` | sdd-check | `consumers-resolvable.test.ts` |
| `finding.ts` | 17 | Общая форма `Finding` | `Finding` | check, requirement-budget | — |
| `flow.ts` | 48 | Детекция v1/v2: каталог `tasks/` ⇒ v1 (`:22-28`); по скоупу — `tasks/<scope>/` пропал И существует `specs/<scope>/<scope>.3-tasks.md` ⇒ v2 (`:38-48`) | `detectFlowVersion`, `detectScopeFlowVersion` | sdd-check, sdd-state | `flow.test.ts` |
| `gate-queue.ts` | 475 | Структурное владение недостающими readiness-гейтами (GATE_QUEUE), общее для state/task/verify | `checkAuthoringReadiness` (`:207`), `queuedInfraGateTicketIds` (`:359`), `phaseOwnsMissingReadinessGate` (`:469`) | sdd-state, sdd-task, sdd-verify phase-context | `gate-queue.test.ts` |
| `group-receipt.ts` | 324 | CLI-owned receipt о завершении группы («group audited/reviewed, verdict V, at git-ref R») | `deriveGroupState`, `buildGroupReceipt`, `upsertGroupReceipt`, `groupReceiptIssue`, `checkGroupReceipts`, `GROUP_RECEIPT_MARKER` | sdd-log (писатель), sdd-check (гейт) | `group-receipt.test.ts` |
| `id-replace.ts` | 245 | Детерминированная замена Task-ID для миграции (`ID_REPLACE_ZONES`) | `parseIdMap`, `idMapFromPlan`, `replaceIds`, `findRemainingOldIds` | sdd-migrate | `id-replace.test.ts` |
| `inventory.ts` | 41 | Парсинг таблицы Entity Inventory module-спеки | `parseEntityInventory` | lint InventorySyncCheck, sdd-orient | `inventory.test.ts` |
| `ladder.ts` | 128 | Карточка-лестница из 5 рангов готовности (Портал/Скоупы/Модули/Инфраструктура/Задачи) | `renderLadder` | sdd-state | `ladder.test.ts` |
| `legacy-headings.ts` | 54 | Нечёткая экстракция секций по нумерованным заголовкам для спек до-маркерной эпохи | `legacySpecSectionBody`, `hasAnySectionMarker` | sdd-orient | `legacy-headings.test.ts` |
| `markdown-fence.ts` / `markdown-table.ts` | 27/69 | Состояние fence / лексер строк таблицы | `nextMarkdownFence`, `lexMarkdownTableRow` | requirement-budget, ticket | — (косвенно) |
| `mermaid-check.ts` | 40 | Асинхронная валидация mermaid по реальной грамматике (`SDD_DIAGRAM_INVALID`) | асинхронная функция по умолчанию | sdd-check | `mermaid-check.test.ts` |
| `migration-move.ts` | 503 | v1→v2-перенос одного скоупа: git-mv тикетов, скаффолд `*.3-tasks.md`, удаление `tasks/<scope>/` | `planScopeMove`, `executeScopeMove`, `rewriteMovedLinks`, `renderModuleIndex`, `renderScopeIndex` | sdd-migrate | `migration-move.test.ts` |
| `migration-plan.ts` | 781 | Слой плана миграции: сканирует репо в юниты по спекам, скаффолдит `migration/**/*.migration.md`, верифицирует (дрейф/покрытие/коллизии слагов); `UNIT_STATUSES = PLANNED|MAPPED|APPROVED|DONE` (`:64`), `SECTION_ACTIONS = keep|rename|merge|split|create|drop` (`:70`), сентинел `UNMAPPED` (`:73`) | `scanMigrationUnits`, `scaffoldUnitFile`, `scaffoldPlanReadme`, `verifyUnitFile`, `verifyMigrationPlan`, `mapHeadingToSection` | sdd-migrate | `migration-plan.test.ts` |
| `module-specs.ts` | 565 | Тип скоупа, члены Module Map, замыкание module-спек; виды владения таском | `SCOPE_TYPES`, `TASK_OWNER_KINDS`, `resolveScopeDecomposition`, `resolveTaskOwnership`, `countModuleSpecs` | sdd-state, sdd-new, sdd-check | `module-specs.test.ts` |
| `phase-dependencies.ts` | 64 | Преflight-проверка зависимостей фаз (замыкание `[x]`, receipts, циклы) | `checkPhaseDependencies` | sdd-task, sdd-verify | `phase-dependencies.test.ts` |
| `phase-receipt.ts` | 1421 | Структурированные CLI-owned phase receipt `<!--SDD_PHASE_RECEIPT:P<N>-->` + JSON (`:84-86`); снимает отпечаток плана (`planState`), окружения (доступность тел скриптов, поддержка npm/pnpm/yarn `:95-320`), байтов таргетов (`targetState`, per-path `targetEvidence`) | `parsePhaseReceipts`, `formatPhaseReceipt`, `phaseReceiptPlanState`, `phaseVerificationEnvironmentState`, `phaseReceiptTargetState` | sdd-verify, sdd-check | `phase-receipt.test.ts` |
| `phase-verification-plan.ts` | 395 | Канонический профиль из kind фазы + имена гейтов лестницы; `resolvePhaseVerificationPlan` (состояния `DECLARED/PREREQUISITE_PENDING/PREREQUISITE_MISSING/COMMAND_MISSING/CONFIGURED/PROVEN`) | `phaseProfileForKind` (`:29`), `verificationGateNames` (`:43`), `requiredVerificationGateNames` (`:58`), `resolvePhaseVerificationPlan`, `markPhaseVerificationProven` | sdd-verify, sdd-task, scaffold critic | `phase-verification-plan.test.ts` |
| `portal.ts` | 302 | Парсинг таблицы Scopes портала + рёбер Scope-Graph | `parseScopes`, `parseScopeGraphEdges`, `renderScopeGraph` | sdd-state, sdd-check, sdd-orient | `portal.test.ts`, `portal-check.test.ts` |
| `probe.ts` | 97 | Грубые эвристики код/инфра — **только для Node**: `CODE_EXT = /\.(js\|jsx\|ts\|tsx)$/` (`:12`), `CONFIG_FILES` = только tsconfig/eslint/prettier/vitest/vite/jest (`:15-33`) | `probeRepo` | sdd-state | `probe.test.ts` |
| `project-feasibility.ts` | 735 | Доказательство bootstrap проекта из таблицы Bootstrap Requirements V2-спек; доказательство DAG черновика плана скаффолда (Gate 1) и проверка материализации | `checkProjectFeasibility` (`:277`), `deriveProjectFeasibilityContext` (`:326`), `checkScaffoldDraftPlan` (`:379`), `checkScaffoldPlanMaterialization` (`:681`), `projectSpecDigest` | sdd-check, sdd-state, директивы scaffold | `project-feasibility.test.ts` |
| `readiness.ts` | 609 | Точное совпадение готовности требуемых npm-скриптов (см. §2.2) | `REQUIRED_SCRIPTS`, `checkReadiness`, `gatherReadinessInput`, `resolveProjectScriptName`, `isDeclaredArgumentForwardingRepairBrick`, `isVacuousScript` | sdd-state, sdd-task (+ sdd-verify, phase-verification-plan, phase-receipt) | `readiness.test.ts` |
| `requirement-budget.ts` | 258 | Бюджеты lazy-списка/атомарной записи секции Requirements | `checkRequirementBudgetsAgainstBaseline`, `REQUIREMENT_ENTRY_MAX_LINES` | check, sdd-check | `check-requirement-budgets.test.ts` |
| `requirement-id.ts` | 123 | Грамматика `<ACR>-REQ-<N>` / `<ACR>-DL-<N>` + вывод акронима | `REQ_ID_GRAMMAR`, `DL_ID_GRAMMAR`, `LEGACY_DL_ID_GRAMMAR`, `deriveSpecAcronym`, `validateSpecEntryId` | check.ts | `requirement-id.test.ts` |
| `rules-cascade.ts` | 82 | Транзитивное замыкание `<DependsOn>` списка `Rules:` фазы | `normalizeRulePath`, `parseRuleDependsOn` (регэксп `<DependsOn>…</DependsOn>` с буллетами `- path`, `:41-45`), `checkRulesCascadeClosure` (`:56`) | sdd-check | `rules-cascade.test.ts` |
| `scripts.ts` | 120 | Классификация скриптов `package.json` по классам гейтов | `classifyScript`, `selectGates` | sdd-state | `scripts.test.ts` |
| `section.ts` | 219 | Извлечение блоков `<!--SECTION:NAME-->` и секций по заголовкам | `extractSection`, `extractHeadingSection`, `SECTION_NAME_REGEX` | sdd-extract, sdd-orient, всё остальное | `section.test.ts` |
| `session-boundary.ts` | 24 | Дописывает `[!!! SESSION BOUNDARY — MUST REMEMBER !!!] WORKING_DIR=… TMP_DIR=<root>/.tmp` + русское напоминание к агент-facing выводам | `appendSddSessionBoundary` | sdd-state, sdd-task, sdd-new | `session-boundary.test.ts` |
| `spec-schema.ts` | 192 | Read-only структурная диагностика схемы спек перед scaffold; `SPEC_SCHEMA_VERSION='sdd-v2'` (`:9`); `BOOTSTRAP_REQUIREMENTS_COLUMNS = Requirement|Kind|Owner|Resolution|Readiness Gates|Gate Artifacts` (`:12-19`) | `diagnoseProjectSpecSchemas` | sdd-state, sdd-scaffold | `spec-schema.test.ts` |
| `task-authoring-literals.ts` | 141 | Готовые к копированию литералы, печатаемые после `sdd-new task` (кортежи правил из knowledge.xml, строка отложенного владения тестами); `CONTRACT_ANCHOR_LIMIT` | `loadRuleRegistry`, `parseRuleRegistry`, `renderTaskAuthoringLiterals` | sdd-new | `task-authoring-literals.test.ts` |
| `task-id.ts` | 231 | Грамматика Task-ID `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$` (`:17`), `SLUG_MAX_LEN = 8` (`:20`, слаг = всё после первого `-`, включая дефисы); сбор по проекту из `*.task.<ID>.md` под `specs/` + `**Task-ID:**` в Meta; детекция коллизий префиксов | `validateTaskId`, `looksLikeTaskId`, `collectTaskIds`, `checkIdConflicts`, `findPrefixClashes`, `suggestTaskId` | sdd-new, check.ts | `task-id.test.ts`, `check-taskid-grammar.test.ts` |
| `tasks-append-only.ts` | 48 | Заголовок `@tasks:` никогда не теряет id, присутствовавший на HEAD (`N/A` игнорируется) | `parseTasksHeader`, `checkTasksAppendOnly` | sdd-check `--changed` | `tasks-append-only.test.ts` |
| `templates.ts` | 2051 | Единственный источник истины для v2-скелетов (product/library/infrastructure/interface/module/task/portal/research/indexes) — питает списки required/fold в `check.ts` и `sdd-new` | `TEMPLATES`, `ARTIFACT_KINDS`, `SCOPE_KINDS`, `loadBearingSections`, `foldSections`, `resolveNextSteps` | check.ts, sdd-new | `templates.test.ts`, `skeleton-*.test.ts` |
| `ticket-resolve.ts` | 212 | Резолв аргумента-тикета (путь или голый Task-ID), сбор корпуса тикетов | `collectTicketCorpus`, `resolveTicketArg` | sdd-task, sdd-log, sdd-check, sdd-sync | (через тесты команд) |
| `ticket.ts` | 478 | Чистые парсеры тикета (Meta, Phases Overview, тела фаз, таблица Verification, политика покрытия) | `parseMetaInfo`, `parsePhasesOverview`, `parsePhaseDetail`, `parseVerificationTable`, `parseTicketCoveragePolicy` | sdd-task и др. | `ticket.test.ts` |
| `tool-guidance.ts` | 73 | Envelope отказа schema-first `[tool] CODE: headline / object / reason / action / example` (`:57-72`) | `normalizeSddToolFailure`, `SddToolGuidance` (tool ∈ sdd-new/sdd-check/sdd-log/sdd-task) | sdd-new, sdd-check, sdd-log, sdd-task | (через тесты команд) |
| `tracker.ts` | 259 | Парсинг Meta тикета и хирургическое обновление ячейки Status трекера; rollup прогресса | `parseMeta`, `updateTrackerStatus`, `parseTrackerRows`, `sumRollupProgress` | sdd-sync, sdd-state | `tracker.test.ts` |
| `yagni.ts` | 207 | Чистая логика YAGNI (<2 использований; `Usage Waiver` с опциональным `<ACR>-DL-N` или `(external: …)`) | `checkYagniUsage`, `parseUsageWaiver`, `stripBarrelReexports`, `ERR_CLI_YAGNI_UNDERUSED`, `ERR_CLI_YAGNI_WAIVER_DECISION_MISSING` | yagni.cmd | `yagni.test.ts` |
| `rc-recovery-invariants.test.ts`, `skeleton-format-differential.test.ts`, `check-spec-authoring-corpus.test.ts`, `skeleton-heading-structure.test.ts` | — | кросс-модульные инвариантные тесты (последний из четырёх — материальный пропуск A2, добавлен верификатором) | | | |

Проверены все 43 значения LOC — совпадение 43/43 (`check.ts` 2736, `phase-receipt.ts` 1421, `templates.ts` 2051, `migration-plan.ts` 781, `project-feasibility.ts` 735, `audit-group.ts` 568, `module-specs.ts` 565, `migration-move.ts` 503, `ticket.ts` 478, `gate-queue.ts` 475, `phase-verification-plan.ts` 395, `group-receipt.ts` 324, `portal.ts` 302, `bdd-coverage.ts` 296, `requirement-budget.ts` 258, `tracker.ts` 259, `capability-adapter.ts` 251, `id-replace.ts` 245, `task-id.ts` 231, `section.ts` 219, `ticket-resolve.ts` 212, `yagni.ts` 207, `spec-schema.ts` 192, `anchor-inject.ts` 143, `task-authoring-literals.ts` 141, `ladder.ts` 128, `requirement-id.ts` 123, `scripts.ts` 120, `probe.ts` 97, `consumers-resolvable.ts` 91, `rules-cascade.ts` 82, `tool-guidance.ts` 73, `markdown-table.ts` 69, `phase-dependencies.ts` 64, `legacy-headings.ts` 54, `flow.ts` 48, `tasks-append-only.ts` 48, `inventory.ts` 41, `mermaid-check.ts` 40, `markdown-fence.ts` 27, `session-boundary.ts` 24, `finding.ts` 17, `readiness.ts` 609). Ровно 7 модулей без одноимённого теста: `capability-adapter`, `finding`, `markdown-fence`, `markdown-table`, `requirement-budget`, `ticket-resolve`, `tool-guidance`.

### 2.2 `readiness.ts` в деталях

- `REQUIRED_SCRIPTS` (`shared/sdd/readiness.ts:15-24`): `type-check`, `test`, `test:coverage`, `format`, `format:fix`, `lint`, `lint:fix`, `fix`. Алиас `type-check` ↔ `typecheck` объявлен в `SCRIPT_ALIASES` на `:30-32`.
- `ReadinessInput = { packageJsonPresent, scripts, gennadyAvailable }` (`:56-63`); `gatherReadinessInput(root)` (`:596-609`) парсит `<root>/package.json` → `scripts`; `detectGennady` (`:572-591`): существует `node_modules/.bin/gennady` ИЛИ `package.json name === 'gennady'`.
- `checkReadiness` (`:446-556`) → `ready` тогда и только тогда, когда: package.json присутствует ∧ все 8 скриптов реальны (не пустые) ∧ `lint` доходит до `gennady` (переходя через `npm run`/pnpm/yarn) ∧ `format`, `lint` (и `check`, если есть) не содержат переключателя записи (`WRITE_SWITCH_PATTERN`, `:260-261`: `eslint … --fix`, `prettier … --write`, `--autofix`) ∧ `format:fix`/`lint:fix` несут мутирующий переключатель (`MUTATING_SWITCH_PATTERN`, `:279`) ∧ каждый fixer — заглушка либо декларирует argument-forwarding префикс без широкого root/glob ∧ `fix` запускает `format:fix`, затем `lint:fix` ∧ gennady установлен.
- Уровни (`ReadinessLevel` на `:66`; присвоение `level` на `:519`): `not-ready` (¬ready) / `provisional` (ready, но ≥1 скрипт vacuous: echo-заглушка или `|| true`) / `ready`. `executionReady ⇔ level === 'ready'` (`:562`). `missingGates` (`:520-560`, поле типа на `:107`) — де-дублированный список, который `gate-queue.ts` использует для владения bootstrap-работой.

### 2.3 `check.ts` — каждый код находки `SDD_*` и его триггер

Проверки тикета (`checkTicket`, `check.ts:422-599`): `SDD_ANCHOR_UNBALANCED` (:431, несбалансированные маркеры SECTION) · `SDD_SECTION_OVERLAP` (:434) · `SDD_MISSING_META` (:443) · `SDD_MISSING_EXECUTION_LOG` (:448) · `SDD_MISSING_TASK_ID` (:459) · `SDD_STATUS_UNPARSEABLE` (:463) · `SDD_FABRICATED_DONE` (:485, строка `[x]` с плейсхолдером `<…>`) · `SDD_DONE_WITH_ACTIVE_BLOCKER` (:493) · `SDD_BLOCKER_OPEN` (:498) · `SDD_DONE_WITH_PLACEHOLDERS` (:509) · `SDD_PHASE_DEP_UNRESOLVED` (:524) · `SDD_PHASE_DAG_CYCLE` (:529) · `SDD_PHASE_SECTION_MISSING` (:538) · `SDD_PHASE_SECTION_ORPHAN` (:544) · `SDD_EXECUTION_LOG_ROUND_MISSING` (:551) · `SDD_EXECUTION_LOG_PHASE_MISSING` (:559) · `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (:564) · `SDD_EXECUTION_LOG_PHASE_ORPHAN` (:571) · `SDD_DONE_PHASE_UNCHECKED` (:581).

Авторинг тикета (`checkTicketAuthoringStructure`, `:599-895`): `SDD_AUTHORING_SECTION_REQUIRED` (:636) · `SDD_AUTHORING_META_INCOMPLETE` (:677) · `SDD_AUTHORING_PHASES_INVALID` (:694) · `SDD_AUTHORING_PHASE_NOT_FOUND` (:701) · `SDD_AUTHORING_PHASE_DEPENDENCY` (:719, :770) · `SDD_AUTHORING_PHASE_REQUIRED` (:732) · `SDD_AUTHORING_PHASE_INCOMPLETE` (:752) · `SDD_AUTHORING_BDD_INCOMPLETE` (:789) · `SDD_AUTHORING_VERIFICATION_INCOMPLETE` (:800) · `SDD_AUTHORING_TEST_COVERAGE_INCOMPLETE` (:811) · `SDD_AUTHORING_BDD_MAPPING` (:828) · `SDD_AUTHORING_BDD_CONTRACT` (:841) · `SDD_AUTHORING_BDD_PHASE` (:865) · `SDD_AUTHORING_PLACEHOLDER` (:874) · `SDD_TASK_ID_GRAMMAR` (:888-901).

BDD: `SDD_BDD_MISSING_NEGATIVE` (`checkBddNegativeScenario`, :390 — нет явного негативного/failure-сценария).

Requirement / Decision-Log ID: `SDD_REQ_ID_GRAMMAR` (:962) · `SDD_REQ_ACRONYM_MISMATCH` (:970) · `SDD_REQ_ID_COLLISION` (:985) · `SDD_REQ_MISSING_UNHAPPY` (:1019, требование без unhappy-пути) · `SDD_DL_ID_PLACEHOLDER` (:1100) · `SDD_DL_LEGACY_ID` (:1110, `D-NNN`) · `SDD_DL_ID_GRAMMAR` (:1122) · `SDD_DL_ACRONYM_MISMATCH` (:1133) · `SDD_DL_ID_COLLISION` (:1148).

Портал (`checkPortal`, :1207): `SDD_PORTAL_SPEC_MISSING`, `SDD_PORTAL_ORPHAN_SPEC`, `SDD_PORTAL_DANGLING_DEP`, `SDD_PORTAL_GRAPH_CYCLE`. Легаси: `SDD_LEGACY_TICKET_UNANCHORED` (:1330). Граф тасков (`checkTaskGraph`, :1370): `SDD_TASK_ID_COLLISION` (:1385) · `SDD_TASK_ID_PREFIX_CLASH` (:1401) · `SDD_DEP_UNRESOLVED` (:1412) · `SDD_DAG_CYCLE` (:1426). Трекеры (`checkTrackers`, :1443): `SDD_TRACKER_MISSING_ROW` (:1466) · `SDD_TRACKER_STATUS_DRIFT` (:1477) · `SDD_TRACKER_ORPHAN_ROW` (:1490).

Язык/структура спек: `SDD_LANGUAGE_CALQUE` (:1702) · `SDD_ANCHOR_UNBALANCED` (:1762) · `SDD_SECTION_OVERLAP` (:1769) · `SDD_SCOPE_BLOATED` (:1787) · `SDD_MODULE_OVERSIZED` (:1802) · `SDD_MODULE_SPEC_VERBOSE` (:1809) · `SDD_SPEC_SECTION_MISSING` (:1829, :1851, :1957, :1975) · `SDD_NO_DIAGRAM_BLOCK` (:1866) · `SDD_DIAGRAM_BLOCK_EMPTY` (:1874) · `SDD_SECTION_NOT_FOLDED` (:1890) · `SDD_SECTION_TOO_LONG` (:1915) · `SDD_AUTHORING_PLACEHOLDER` (:1987) · `SDD_AUTHORING_HEADING_LEVEL` (:2035) · `SDD_REQUIREMENT_ID_MISSING` (:2051) · `SDD_AUTHORING_LIST_REQUIRED` (:2070). Таблицы (`checkTableCells`, :2144): `SDD_TABLE_TOO_MANY_COLUMNS`, `SDD_TABLE_CELL_HAS_BR`, `SDD_TABLE_CELL_TOO_LONG`, `SDD_TABLE_CELL_MULTI_SENTENCE`. Графы: `SDD_SCOPE_DEP_UNDECLARED` (:2241) · `SDD_MODULE_DAG_CYCLE` (:2263) · `SDD_MODULE_NOT_IN_INDEX` (:2351) · `SDD_PARENT_MODULE_NOT_INDEX` (:2366). Диаграммы: `SDD_DIAGRAM_CAPTION_MISSING` (:2497) · `SDD_DIAGRAM_CAPTION_REQ_UNKNOWN` (:2512) · `SDD_SCOPE_NO_DATA_FLOW` (:2559) · `SDD_MODULE_NO_CALL_CHAIN` (:2612). Research: `SDD_RESEARCH_DISPOSITION_MISSING` (:2663) · `SDD_RESEARCH_DISPOSITION_PENDING` (:2676) · `SDD_RESEARCH_DECISION_UNTRACED` (:2683) · `SDD_RESEARCH_ORPHAN` (:2722) · `SDD_RESEARCH_UNREGISTERED` (:2729).

Проверены все 93 строковых литерала `SDD_*` внутри `check.ts` и все номера строк — совпадение 93/93, включая функции `checkBddNegativeScenario :390`, `checkTicket :422`, `checkTicketAuthoringStructure :599`, `checkPortal :1207`, `checkTaskGraph :1370`, `checkTrackers :1443`, `checkTableCells :2144`.

**Коды, эмитируемые адаптерами вне `check.ts`** (правки верификатора применены): `cli/cmd/sdd-check/sdd-check.cmd.ts` — `ERR_CLI_SDD_CHECK_READ_FAILED` (`sdd-check.types.ts:19`; в §1.1 A2 называл его правильно, здесь была усечённая форма `SDD_CHECK_READ_FAILED` — исправлено), `SDD_BROKEN_SPEC_LINK` (:248), `SDD_RESEARCH_REF_BROKEN` (`:269`, не `:257`), `SDD_VERIFICATION_TABLE_INVALID` (:587), `SDD_COVERAGE_POLICY_INVALID` (:600), `SDD_COVERAGE_OWNER_INVALID` (:617), `SDD_COVERAGE_READER_RERUNS_PRODUCER` (:653), `SDD_COVERAGE_READER_OWNER_MISMATCH` (:665), `SDD_CONSUMERS_SCAN_FAILED` (:715), `SDD_BROKEN_SPEC_REF`/`SDD_BROKEN_SPEC_ANCHOR` (:762, :782), `SDD_TASK_OWNER_METADATA` (:823), `SDD_AUTHORING_TARGET_PATH` (:894), `SDD_AUTHORING_AUTO_FIXED` (:1117). Три кода, которые `sdd-check.cmd.ts` лишь **проводит** (реально живут в `shared/sdd/*`, атрибуция исправлена): `SDD_RULES_CASCADE_UNRESOLVED` → `shared/sdd/rules-cascade.ts:78`; `SDD_BDD_SCENARIO_UNTESTED`/`SDD_BDD_TESTFILE_AMBIGUOUS`/`SDD_BDD_DEFERRED_TO_SELF`/`SDD_BDD_COVERAGE_ROW_UNPARSED` → `shared/sdd/bdd-coverage.ts:270,223,257,291`; `SDD_CONSUMERS_UNRESOLVED` → `shared/sdd/consumers-resolvable.ts:84`.

`phase-receipt-check.ts` — `SDD_PHASE_RECEIPT_STALE_TARGETS`, `SDD_PHASE_RECEIPT_STALE_PLAN`, `SDD_PHASE_RECEIPT_INCOMPLETE`, `SDD_PHASE_RECEIPT_INVALID`, `SDD_PHASE_RECEIPT_MISSING`; `group-receipt.ts` — `SDD_GROUP_AUDIT_MISSING`, `SDD_GROUP_REVIEW_MISSING` (WARN); `tasks-append-only.ts` — `SDD_TASKS_APPEND_ONLY_REGRESSION`; `requirement-budget.ts` — `SDD_REQUIREMENT_ENTRY_TOO_LONG`, `SDD_REQUIREMENTS_BUDGET_EXCEEDED`, `SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID`; `shared/sdd/mermaid-check.ts:32` — `SDD_DIAGRAM_INVALID` (в A2 этот код упомянут в §2.1, но пропущен в перечислении «кодов вне `check.ts`» — здесь добавлен); `project-feasibility.ts` — `SDD_PROJECT_BOOTSTRAP_SECTION_MISSING`, `SDD_PROJECT_BOOTSTRAP_ROW_INCOMPLETE`, `SDD_PROJECT_BOOTSTRAP_FACTS_MISSING`, `SDD_PROJECT_PACKAGE_ARTIFACTS_MISSING`, `SDD_PROJECT_EXTERNAL_ARTIFACT_PROVIDER_MISSING`, `SDD_PROJECT_SHARED_WRITER_UNORDERED` (ровно 6, на `:149,161,255,267,300,316`), и **27** (не 29 — перечисленный в A2 список уже содержал ровно 27 элементов, ошибочной была только шапка) кодов `SDD_SCAFFOLD_PLAN_*` (ACTION_UNSUPPORTED, ADAPTER_MISSING/UNKNOWN, CAPABILITY_ADAPTER_MISMATCH, CAPABILITY_PREREQUISITE_ORDER, CAPABILITY_REQUIREMENT_UNDECLARED, CAPABILITY_UNKNOWN, CYCLE, DEPENDENCY_CAPABILITY_MISSING, DEPENDENCY_PREREQUISITE_UNDECLARED, DEPENDENCY_TARGET_MISSING, DEPENDENCY_UNKNOWN, GATE_ARTIFACT_MISSING, MATERIALIZATION_DRIFT, NODE_DUPLICATE, NODE_NOT_MATERIALIZED, NODE_UNAPPROVED, PACKAGE_ACTION_MISSING, REQUIREMENT_DUPLICATE/MISSING/NOT_TASK_OWNED/UNKNOWN, SCOPE_DRIFT, SHARED_WRITER_OVERLAP, SPEC_MISSING/STALE/UNKNOWN).

**Отдельная находка верификатора (REFUTED в A2, исправлено):** `cli/cmd/sdd-verify/phase-run.ts:255` эмитит `code: 'SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED'` — это реальная находка, а не `ERR_CLI_*`-диагностика выхода; она проверяется в `cli/__tests__/tool-behavior/bootstrap-path.test.ts:211,364`. Таким образом утверждение «все `SDD_VERIFY_*` — это `ERR_CLI_*`, не находки» неверно.

**Также опровергнуто:** `SDD_V2_SUBDIR` — не код находки `spec-schema.ts`, а путь-константа `'ai/directives/sdd-v2'`, объявленная в `cli/cmd/sdd-state/sdd-state.types.ts:25` и используемая в `sdd-state.cmd.ts:120,123`. В `spec-schema.ts` строковых кодов `SDD_*` вообще нет.

### 2.4 Другие важные модули

- **gate-queue.ts**: `checkAuthoringReadiness` (`:197-207`) — «Runtime gate existence is irrelevant here; every missing alias must instead have one complete infrastructure Bootstrap Requirements row. Interface scopes never own tickets.» `queuedInfraGateTicketIds` (`:352-359`) резолвит каждый недостающий гейт ровно к одной активной фазе infra-тикета, чья заявка + Target Files совпадают с Bootstrap Requirements; неоднозначность или отсутствие владельца ⇒ диагностика (`:444`). `phaseOwnsMissingReadinessGate` (`:469`) — тест исключения, который используют `sdd-task`/`sdd-verify`.
- **phase-verification-plan.ts**: `phaseProfileForKind` — `bootstrap|config|doc→setup`, `test→test`, `impl|refactor|fix→code`, иначе null (`:29-35`); команда гейта — `npm run <script>` (`:270`); `phaseVerificationArtifactPaths()` перечисляет выведенные артефакты (устаревший вход).
- **project-feasibility.ts**: привязывает планирование скаффолда к точным байтам спеки (`projectSpecDigest`), проверяет таблицу Bootstrap Requirements (колонки из `spec-schema.ts`), доказывает предложенный DAG (`checkScaffoldDraftPlan`) через реестр capability-адаптеров (`DEFAULT_CAPABILITY_ADAPTER_REGISTRY` = node/typescript/typescript-quality) и перепроверяет материализованные тикеты (`checkScaffoldPlanMaterialization`).
- **capability-adapter.ts**: форма адаптера = `{id, dependencyBoundary, artifacts, layers (runtime→package-manager→language-compiler→quality-test-tooling→app-platform), requiredRules (rulePath + actions/capabilities), gateRequirements}`; адаптер `node` привязан к `ai/directives/infra/nodejs-npm-setup.xml`, артефакты `.nvmrc`, `package.json#engines.node`, `package.json#type`, `.npmrc`, `package-lock.json`; `typescript-quality` привязан к `ai/directives/infra/eslint-setup.xml` и гейтам `test/lint/format`. Комментарий на `:201` (не `:70` — правка верификатора), непосредственно перед `DEFAULT_CAPABILITY_ADAPTER_REGISTRY` (`:202`): «Production defaults; new platforms extend this value or inject another registry» — **заявленная точка подключения для не-Node стеков; больше ничего не зарегистрировано**. На `:68` — ещё одна уместная цитата: «Injectable adapter lookup; tests add a fake platform without changing production code».
- **phase-receipt.ts** / **group-receipt.ts**: см. таблицу; `PHASE_RECEIPTS_SCHEMA_MARKER = '<!--PHASE_RECEIPTS:v1-->'` защищает grandfathering (group-receipt.ts:22).
- **ladder.ts**: ранг 4 «Инфраструктура» = `packageJsonPresent && typecheck && test && lint` (`:68`); подсказка следующего шага ведёт к `/sdd`, `/sdd-scaffold`, `/sdd-execute` (`:101-112`).
- **migration-plan.ts / migration-move.ts / id-replace.ts / anchor-inject.ts**: четыре детерминированных шага за `sdd-migrate` (anchors → plan → ids → move); `flow.ts` переводит скоуп в v2, когда `tasks/<scope>/` пропал и `<scope>.3-tasks.md` существует.
- **tool-guidance.ts**: envelope для actionable-отказов, который используют sdd-new/check/log/task (коммит e95dd106 «standardize actionable tool failures»).
- **yagni.ts**: грамматика waiver — `- **Usage Waiver:** <reason>` | `<ACR>-DL-N — <reason>` | `(external: <consumer>)`; процитированный DL-id должен иметь заголовок Decision Log в `specs/`.
- **session-boundary.ts**: дописывает жёсткую границу рабочего пространства (`WORKING_DIR`, `TMP_DIR=<root>/.tmp`) на русском к выводу sdd-state/sdd-task/sdd-new.

---

## 3. Директивы `ai/directives/sdd-v2/**` + конвейер `ai/kit`

70 XML-файлов, 10 075 строк (`find ai/directives/sdd-v2 -name '*.xml' | xargs wc -l`). Соседние не-v2 деревья: `ai/directives/{agent-inbox,architecture,coding,infra,testing}` + `ai/directives/knowledge.xml` (см. §5).

### 3.1 Инвентарь директив и их роль в потоке

`Роль` = позиция в цепочке router → authoring → scaffold → execute → audit → code-review → reconcile → migration. `TC` = число блоков `<ToolCall` (grep); для `scaffold` и `audit` все `<ToolCall>` живут в step-пакетах (скелеты дают TC=0) — `scaffold/steps` даёт 9 (`STEP_2_MATERIALIZE` 6 + `STEP_3_MECHANICAL_CHECK` 2 + `STEP_6_HANDOFF` 1), `audit/steps` даёт 8 (весь в `STEP_1_MECHANICAL`).

| Директива | LOC | Роль | Загружается из | TC | Обязательные вызовы CLI |
|---|---|---|---|---|---|
| `router.directive.xml` | 405 | **роутер** (ядро) | скилл `/sdd` | 0 | сам не вызывает ничего — потребляет алиас `routerState` из entry-скилла (`STEP_0_STATE`: «Consume exact result alias `routerState` from the entry skill. Do not repeat `sdd-state`», `:334`) |
| `root.directive.xml` | 526 | authoring — владелец портала проекта (`specs/README.md`) | router `intent=project-setup` | 3 | `sdd-new infrastructure --scope infra-base`, `sdd-new portal`, `sdd-check --all .` |
| `scope.directive.xml` | 124 | authoring — одна спека product/library-скоупа | router `scope-type ∈ {product,library}` | 5 | `sdd-new product --scope`, `sdd-new library --scope`, `sdd-orient --scope`, `sdd-check --spec`, `sdd-log <spec> authoring-complete` |
| `infra.directive.xml` | 621 | authoring — скоуп `infrastructure` (тулстек, Bootstrap Requirements) | router `scope-type=infrastructure` | 5 | `sdd-orient --scope`, `sdd-new research --scope` ×2, `sdd-new infrastructure --scope`, `sdd-check --all specs/` |
| `interface.directive.xml` | 398 | authoring — скоуп `interface` (OpenAPI/proto/JSON-Schema) | router `scope-type=interface` | 3 | `sdd-orient --scope`, `sdd-new interface --scope`, `sdd-check --all specs/` |
| `module.directive.xml` | 130 | authoring — иерархия модулей внутри декомпозированного скоупа | router `intent=module-decomposition` | 4 | `sdd-new module --scope`, `sdd-orient --scope`, `sdd-check --spec`, `sdd-log <module-spec> authoring-complete` |
| `interview-protocol.directive.xml` | 447 | authoring-подпротокол — ОДНО интервью с оператором | scope STEP_2/3, infra STEP_2, interface STEP_2, module STEP_2 | 0 | — |
| `amplify-security` / `amplify-storage` / `amplify-nfr` / `amplify-observability` | 117/98/106/110 | authoring-усилители, лениво триажатся интервью | триаж `interview-protocol` | 0 | — |
| `preflight-protocol.directive.xml` | 25 | authoring — закрыть последствия дизайна перед независимым ревью | ветки authoring | 0 | — |
| `review-lifecycle.directive.xml` | 70 | authoring — граница **approval #1** (независимый ревьюер + оператор) | ветки authoring | 0 | — |
| `critic.directive.xml` / `critic-protocol.directive.xml` | 66/20 | authoring — свежий read-only семантический критик | router `forced intent=critic`, `/sdd-critic` | 0 | (`critic-protocol` цитирует `npx gennady sdd-extract <dep> VISION` внутри `AX_ISOLATION`) |
| `authoring-interactive.directive.xml` | 22 | опциональный профиль live-оператора при авторинге | только по явному запросу оператора | 0 | — |
| `discover-from-code.directive.xml` | 205 | authoring (brownfield, масштаб проекта) — портал отсутствует + `CODE=present` | `root` | 2 | `sdd-new portal`, `sdd-check --all .` |
| `recover-from-code.directive.xml` | 261 | authoring (brownfield, один именованный путь) | роутер, портал LIVE + явный путь | 2 | `lint --spec=`, `sdd-check --all .` |
| `scaffold.directive.xml` (+ `scaffold/steps/STEP_0…STEP_6`) | 356 + 253 | **scaffold** — спеки → DAG тикетов + индексы, approval #2 | router `forced intent=scaffold` (требует approval #1, иначе `H_SPEC_NOT_APPROVED`) | 9 | STEP_2: `sdd-new task --owner {infrastructure-flat,scope-bootstrap,module}`, `sdd-new {module-index,scope-index,project-index}`; STEP_3: `sdd-check --task <ticket> --authoring`, `sdd-check --all .`; STEP_6: `sdd-check --all .` |
| `execute.directive.xml` | 345 | **оркестратор execute** | router `intent=execute` | 13 | `sdd-task` (карта), `sdd-task <ticket>`, `sdd-task <ticket> --phase <P>`, `sdd-check --task` ×2, `sdd-log … complete --phase`, `sdd-log … close`, `sdd-sync <ticket>`, `sdd-check --all .` ×2, `sdd-log <group> audit-receipt <verdict>`, `sdd-log <group> review-receipt <verdict>`, `sdd-task` (обновление) |
| `phase-execution-protocol.directive.xml` (+ `steps/STEP_1_ORIENT…STEP_4_HANDOFF`) | 46 + 94 | execute — одноразовый воркер на фазу | `execute` (один диспатч на каждую pending-фазу) | 0 | шаги не несут `<ToolCall>`; владение `sdd-verify` заявлено в Mission («`sdd-verify` owns only the receipt») |
| `readiness.directive.xml` | 251 | предусловие execute — довести `not-ready`-репо до 8 npm-кирпичей | `READINESS_PREFLIGHT_GATE` из роутера/веток | 3 | `sdd-new research --scope`, `sdd-state` ×2 |
| `audit.directive.xml` (+ `audit/steps/STEP_1_MECHANICAL…STEP_3_ROUTE`) | 229 + 419 | **audit** — свежими глазами семантический аудит группы тикетов одной спеки | `execute`, когда `sdd-task --audit-group` сообщает `due`; либо оператор «audit TSK-NN» | 8 | STEP_1: `sdd-task --group-scope`, `sdd-task --task-scope`, `sdd-check --task`, `sdd-check --all .`, `sdd-check --changed .`, `sdd-verify --profile full`, `lint --include-tests --spec=`, `lint --spec=` |
| `code-review.directive.xml` | 260 | **code-review** — поиск багов по той же группе, после успешного audit | `execute` | 2 | `sdd-task --group-scope`, `sdd-task --task-scope` |
| `deviation-review.directive.xml` | 37 | пост-батчевый обзор спорных автономных решений | закрытие батча `execute` | 0 | — |
| `reconcile.directive.xml` | 408 | **reconcile** — восстановление треугольника spec⟷code⟷task; режимы `fix` / `from-code` | router `forced intent=reconcile`, `/sdd-reconcile` | 1 | `sdd-check --all` |
| `compression.directive.xml` | 105 | эволюция — схлопывание избыточных решений без потерь | сегодня `migration-v1-v2`, переиспользуема | 1 | `sdd-check --all .` |
| `migration-v1-v2.directive.xml` | 411 | **миграция** — v1→v2, plan-first, под git | router `FLOW_VERSION=v1` + подтверждение оператора | 15 | `sdd-migrate plan --all .` (+`--write`), `sdd-migrate anchors --all .` (+`--write`), `sdd-migrate plan --verify`, `sdd-migrate ids --from-plan` (+`--write`), `sdd-migrate move --scope`, `sdd-state`, `sdd-check --all .` ×3, `sdd-check --all specs/`, `lint --spec=` |
| `agent-inbox/{code-lens,security-lens,enrich,synthesize,track-review}.directive.xml` | 108/161/222/113/440 | **не часть потока SDD** — лупы MR-ревью для сервиса `agent-inbox` (`selectDirective('session','code',mrShape)`, TSK-136) | `services/agent-inbox` | 0 | — |
| `formats/*.xml` (24 файла, 2 066 LOC; 23 имеют `.hbs`-источник, `change-manifest.xml` — рукописный) | | фрагменты формат-контрактов (структуры спек, DbC, словарь диаграмм, entity inventory/surface, структура task-ticket, индексы тасков, requirement entry, NFR-бюджеты, секция безопасности, форматы pivot, audit round, change manifest) | подключаются как partial | 0 | — |
| `guides/{project-setup.md,v1-to-v2-migration.md}` | | прозаические гайды для оператора (не директивы) | — | — | — |

Деталь `LOGIC_SWITCH` роутера — в §4.2. **Разрыв в потоке**: `readiness.directive.xml` и `discover-from-code`/`recover-from-code` достижимы только через `READINESS_PREFLIGHT_GATE` / `root`, а не через собственный переключатель `STEP_2_ROUTE` роутера (`router.directive.xml:373-397` не содержит case `readiness`; `recover-from-code` достигается только через intent `recover-from-code` → `discover-from-code.directive.xml`, так что у `recover-from-code.directive.xml` тоже нет собственного case маршрута).

### 3.2 Сборочный конвейер `ai/kit`

```
ai/kit/templates/sdd-v2/*.hbs  (55 шаблонов: 28 top-level + 22 formats/ + 5 agent-inbox/)
        │  Handlebars, partials резолвятся из ai/kit/{axiom,contract,definition,hook,pattern,anti-pattern}/**
        ▼  ai/kit/render.ts  (createRenderer, walk, normalizeBrick; TEMPLATES=ai/kit/templates, OUT_ROOT=ai/directives)
ai/kit/build-directives.ts  (npm run build:directives)
        │  проход 1: рендер каждого .hbs как есть → засевает граф READ_AND_USE_DIRECTIVE (build-directives.ts:83-99)
        │  проход 2: delta-assembly (ai/kit/delta-assembly.ts) — вычитает partial'ы, уже гарантированные
        │          в контексте загружающей директивы ctx(n); заменяются одной строкой «Inherited from…» (:101-116)
        │  затем:  режим assembly (ai/kit/lazy-assembly.ts) ПОСЛЕ delta, никогда не параллельно (DA-REQ-10, :117-136)
        ▼
ai/directives/sdd-v2/**.xml  +  ai/directives/.gennady-directive-assembly.json
```

- **Шаблоны**: 55 `.hbs` под `ai/kit/templates/sdd-v2/` (вкл. `agent-inbox/` ×5 и `formats/` ×22 — не ×20, как заявлял A2; 28 top-level шаблонов дают вместе с ними верную сумму 55). 15 сгенерированных XML не имеют `.hbs`-источника: 3 `audit/steps/*`, 4 `phase-execution-protocol/steps/*`, 7 `scaffold/steps/*` (все — продукт ленивой сборки) плюс `formats/change-manifest.xml` (рукописный, вне сборки).
- **Манифест сборки** `ai/kit/assembly-manifest.json`: `defaultMode: "monolith"`, переопределения → `lazy` ровно для трёх пилотов: `sdd-v2/audit.directive.xml`, `sdd-v2/scaffold.directive.xml`, `sdd-v2/phase-execution-protocol.directive.xml`. Приоритет: переопределение в манифесте > флаг `--assembly=` > `defaultMode` > встроенный `monolith` (DA-REQ-1, `build-directives.ts:9-21`). Директива без Step тихо остаётся monolith под *широким* lazy, но *явное* поштучное lazy-переопределение директивы без Step валит сборку с ошибкой (`:120-131`, DA-REQ-3).
- **Ленивое разбиение**: один тонкий скелет по обычному пути директивы + один пакет на каждый `<Step>` по адресу `ai/directives/sdd-v2/<name>/steps/<id>.xml`. `loadTopology` = `chain` для `scaffold`, `index` для остальных (`:189`). Пакеты пишутся и подтверждаются `existsSync` **до** скелета, который их обещает (DA-REQ-12, `:228-243`), устаревшие `.xml`-соседи отвязываются (`:246-255`), человекочитаемый отпечаток — это собственная строка `version` пакета, никогда не хэш (DA-REQ-7, `:75-79`).
- **Маркер** `.gennady-directive-assembly.json` = `{schema:'gennady-directive-assembly/v1', selection:'manifest'|'monolith'|'lazy'}` (`ai/kit/directive-assembly-marker.ts:8-21`); парсер отвергает всё, кроме ровно этих двух ключей (`:37-41`) — тихого fallback нет.
- **Dangling-axiom lint** (`ai/kit/lint-axioms.ts`) прогоняется по финальному выводу после delta и только **предупреждает** (`build-directives.ts:45-46,153-154`): каждый `<Axiom>` в `<BeliefState>` должен быть процитирован ≥1 раза вне BeliefState; исключение — `cross-cutting="true"` или наследование через `deps=`.

### 3.3 Аудиты kit — что проверяет каждый

| Скрипт / npm-скрипт | Что проверяет | Форма отказа |
|---|---|---|
| `audit:axioms` → `ai/kit/audit-axiom-activation.mjs` (137 LOC) | Для каждого partial `axiom/*`, подключённого в `BeliefState` шаблона, резолвнутый `<Axiom id>` должен встретиться ≥1 раз внутри собственного `ExecutionPlan`/`PhaseProcedure` этого же шаблона («аксиома, лежащая только в BeliefState, — фон, который агент забывает»). Область: только top-level `templates/sdd-v2/*.directive.hbs` — `agent-inbox/` (Steps живут внутри BeliefState, без обёртки ExecutionPlan) и `formats/` намеренно не обходятся. Cross-cutting аксиомы поведения исключены явным `ALLOWLIST_BASENAMES` | exit 1, печатает каждое нарушение |
| `audit:contracts` → `audit-contract-activation.mjs` (534 LOC) | Два противоположных дрейфа. **ЧАСТЬ 1 «included → activated»** по `.hbs`: `contract/*` partial, подключённый в `ChatOutput`/`ChatProtocol`, но никогда не заякоренный на шаге, — мёртвый скопированный вес. Самоактивирующиеся контейнеры (`OutputContracts`, `ArtifactOutput`, `SessionState`) якорь не требуют. **ЧАСТЬ 2 «mentioned → available»** по собранному `ai/directives/sdd-v2/**`: голое упоминание contract-ID без достижимого определения — «ссылка в пустоту» (реальный баг `UNDERSTANDING_BLOCK_FORMAT`/`FLOW_DIAGRAM_WHEN`: назван в `contract/process/message-layout.xml`, определён только в `root.directive.xml`, отсутствует в 6 из 13 потребителей) | exit 1 |
| `audit:halts` → `audit-halt-activation.mjs` (345 LOC) + `audit-halt-fragments.mjs` (55 LOC) | (a) **mentioned → declared**: каждый токен `H_*` вне таблицы `<HaltConditions>` своей же директивы должен быть строкой именно *этой* таблицы (целевой дефект: `H_SCAFFOLD_NOT_EXECUTABLE` вылетал из scaffold STEP_3B, но никогда не был объявлен, коммит 9c81be20). Один аллоулист-класс исключения: `ALLOWLIST_CROSS_DIRECTIVE_REFS` для цитирования halt другой директивы (`H_ASK_WITHOUT_CARD`). (b) **declared → used**: каждая строка таблицы должна встретиться ≥1 раз вне таблицы — в этой директиве, через `AX_*`, который цитирует её Trigger, или в любой другой просканированной директиве. `audit-halt-fragments.mjs` обходит ограниченную, локальную для пакета цепочку фрагментов ленивой директивы и падает на ссылке, которая выходит за пределы пакета, отсутствует, циклична или превышает 128 фрагментов | exit 1 |
| `check:directives-fresh` → `check-directives-fresh.ts` (201 LOC) | `ai/directives/**` — это build output ровно с одним писателем. Пересобирает во временный `mkdtemp`-каталог (реальное дерево не трогается) и делает `git diff --no-index` против закоммиченного дерева. Сравнение идёт по **списку файлов самой пересобранной песочницы** и зеркалит только эти относительные пути, поэтому рукописные файлы внутри build-managed корней (`ai/directives/coding/README.md`, `svelte5-runes.xml`, `knowledge.xml`, целые деревья `agent-inbox/ architecture/ infra/ testing/`) не флагуются как ложно отсутствующие. Ловит и ручную правку сгенерированного файла, и изменение шаблона без пересборки | ненулевой exit на любой diff |
| `check:directive-budgets` → `step-budget-gate.ts` (199 LOC) | `SKELETON_TOKEN_TARGET = 6000` (**мягкий** — предупреждение, сборка продолжается), `SKELETON_TOKEN_LIMIT = 8000` (**жёсткий** — ошибка, exit 1), `PACKAGE_CHAR_LIMIT = 20_000`, `PACKAGE_LINE_CHAR_LIMIT = 2000` (`:37-45`). Заявленный риск усечения — длина строки, а не размер файла (DA-DL-5/14). Директива считается лениво собранной только когда у неё есть соседний каталог `<name>/steps/`, поэтому сканируются только три пилота. Разрыв target/ceiling существует потому, что сборка `e08460c3` выпустила `phase-execution-protocol` на 6009 токенах при всех зелёных гейтах |
| `audit:sdd-templates` (агрегат) | `check:directives-fresh && audit:axioms && audit:contracts && audit:halts && check:directive-budgets` (`package.json`) | первый отказ побеждает |

`ai/kit/__tests__/` — **14** тест-файлов (не 15, как в шапке A2 — перечисленный список уже содержал верные 14): `amplifier-requirement-format`, `audit-halt-activation`, `build-directives` (область флага сборки F-02, пакеты-до-скелета F-03), `check-directives-fresh`, `delta-assembly` (форма графа, class-1/class-3 всегда FULL, class-2 вычитает на примере `migration-v1-v2` как лакмуса, детерминизм), `deps` («directive deps удовлетворяются ядром роутера»), `lazy-assembly` (`resolveAssemblyMode`, `stampFingerprint`, `AxiomActivationClassifier#classify`, `LazyDirectiveAssembler#assemble`), `lint-axioms`, `render` (матрица отступов, корпус реальных brick, монстр-шаблон), `skeleton-package-binding.guard`, `skeleton-package-binding.e2e`, `skeleton-parity` («сгенерированная директива дословно встраивает скелет реестра `templates.ts`» — связывает §2 `shared/sdd/templates.ts` с текстом директивы), `stateless-sdd-flow-contract` (безгосударственный контракт входа · две границы утверждения артефакта · безгосударственные исполнение и формат спецификации), `step-budget-gate`.

**Запуск гейтов kit на HEAD `11291af5`** (сведения, отсутствовавшие в A2, добавлены верификатором):

```
$ sh -c 'cd <R> && node --experimental-strip-types ai/kit/check-directives-fresh.ts'
✓ ai/directives/** matches a fresh rebuild.
exit=0

$ sh -c 'cd <R> && node --experimental-strip-types ai/kit/step-budget-gate.ts'
✓ every lazy directive under ai/directives/sdd-v2/** is within budget.
exit=0
```

Оба скрипта запускаются только из корня RC (используют выведенный из собственного пути `PROJECT_ROOT`), поэтому запуск сделан через `sh -c 'cd <R> && …'`. Оба зелёные — сгенерированное дерево `ai/directives/**` действительно свежее и в бюджете на HEAD `11291af5`.

### 3.4 Библиотека аксиом `ai/kit/axiom/**`

427 файлов аксиом в 20 каталогах. Идентификаторы дословно, по каталогам:

| Каталог | n | Id аксиом |
|---|---|---|
| `agent-inbox` | 4 | `ax-complexity-budget ax-minimal-change-suspicion ax-review-purpose ax-simpler-alternative` |
| `audit` | 25 | `ax-audit-modes ax-audit-reads-code ax-bdd-coverage-verification ax-closed-world-primary-check ax-completeness-check ax-drift-taxonomy ax-ephemeral-output ax-execution-log-verification ax-finding-routing ax-findings-as-proposals ax-git-diff-scan ax-insight-backflow-capture ax-learning-context ax-mechanical-via-sdd-check ax-neutral-findings ax-no-auto-fix ax-provenance-is-a-product ax-reopen-rounds-in-ticket ax-rules-cascade-verification ax-rules-compliance-against-activated-rules ax-runtime-backing-verification ax-severity-tagging ax-severity ax-stale-after-pivot-verification ax-task-id-integrity` |
| `boundary` | 16 | `ax-bootstrap-narrow-read ax-closed-world-inventory ax-cross-scope-dependencies ax-entity-surface-completeness ax-guarded-result-boundary ax-isolation-signal ax-isolation-through-public-boundary ax-portal-read-only-with-placeholder-exception ax-reference-over-copy ax-result-public-boundary ax-scope-type-gate ax-semantic-location-over-lines ax-semantic-safety ax-spec-never-edited ax-ssot-traceability ax-ticket-write-scope` |
| `coding` | 29 | `ax-ai-readability ax-anchor-format ax-comment-density ax-comment-placement ax-comment-vocabulary ax-comments-add-nonsyntactic-intent ax-configurable-names ax-consumer-driven ax-contractual-naming ax-domain-prefix-for-external ax-early-exit ax-explicit-class-fields ax-file-header-append-only ax-file-header-task-traceability ax-file-level-context ax-import-canonical-form ax-introduced-discipline ax-modern-ts-density ax-modularity-limits ax-namespace-naming ax-no-code-generation ax-no-premature-abstractions ax-no-silent-escape-hatch ax-node-builtins-prefix ax-principled-decomposition ax-teleological-naming ax-tools-as-hands ax-verb-precision ax-yagni-overengineering-guard` |
| `critic` | 13 | `ax-comprehension-first ax-confusion-bug ax-critic-model-tier ax-default-accept ax-finding-addressee ax-goal-owner-gate ax-isolation ax-language-lens ax-polish-mode ax-product-architect-lens ax-read-only ax-uncertainty-is-signal ax-uncomfortable-questions` |
| `e2e` | 24 | `ax-cli-ax-tree-as-primary-vision ax-cli-codegen-is-recorder-not-author ax-cli-dev-server-precondition ax-cli-explore-before-author ax-cli-explore-loop-has-four-steps ax-cli-headless-for-agent ax-cli-role-locators-from-ax-tree ax-cli-snapshot-update-gate ax-cli-trace-for-failure-diagnosis ax-cli-transition-to-authoring ax-e2e-auth-via-storage-state ax-e2e-ax-tree-as-contract ax-e2e-browser-coverage-pragmatic ax-e2e-file-layout ax-e2e-file-size-budget ax-e2e-fixture-based-pom ax-e2e-headless-always ax-e2e-network-mock-at-route ax-e2e-proof-screenshot-always ax-e2e-role-locators-only ax-e2e-self-verification-loop ax-e2e-snapshot-partial-by-default ax-e2e-structure-ax-first ax-e2e-visual-regression-gated` |
| `error` | 16 | `ax-catch-log-recover ax-error-chaining-cause ax-error-via-class ax-fail-fast-validation ax-focused-error-assertions ax-mandatory-try-catch-in-business-logic ax-markup-safety ax-minimal-error-surface ax-must-extractor ax-no-bare-throw-unknown ax-no-result-iserr-short-circuit ax-no-result-object-literal ax-no-result-ok-short-circuit ax-no-result-second-generic ax-result-unwrap-on-success-paths ax-trace-prefixed-errors` |
| `infra` | 31 | `ax-ai-first-scripts-one-shot ax-autofix-preferred ax-binary-severity ax-branch-strategy ax-commit-convention ax-config-auditable-by-agent ax-custom-plugins-obey-meta-policy ax-dependency-addition-checklist ax-exact-pinning-for-tooling ax-flat-config ax-gitignore-baseline ax-history-policy ax-hooks-integration ax-infra-base-bootstrap ax-infrastructure-flow ax-lfs-submodules ax-lint-run-is-mechanical ax-lock-file-discipline ax-module-system-explicit ax-no-disable-comments-by-agent ax-non-autofix-prefer-delegation ax-npm-agent-sandbox-registry ax-presets-passed-through-the-gate ax-prettier-owns-formatting ax-project-layout ax-rule-change-requires-operator-confirm ax-secrets-discipline ax-single-package-manager ax-tag-release ax-third-party-tool-current-api ax-type-aware-prefer-ts` |
| `interview` | 3 | `ax-amplification-opt-in ax-coverage-map-closure ax-defaults-first` |
| `logging` | 7 | `ax-alerts-on-symptoms ax-log-density ax-log-message-format ax-log-message-purity ax-log-performance-metrics ax-stdout-first-transport ax-structured-logging` |
| `perf` | 12 | `ax-allocation-is-enemy ax-backpressure-is-law ax-big-o-matters ax-budgets-are-numbers ax-concurrency-limits ax-engine-optimizations ax-gc-pressure ax-hoisting-safety ax-latency-stacking ax-one-time-cost ax-retained-memory ax-target-hardware` |
| `process` | 56 | `ax-amplify-defaults-first ax-artifact-style-self-check ax-audit-hook ax-blocker-escalation ax-blocker-resolution-trail ax-cap-5 ax-close-with-integrity-check ax-coverage-report-blocker-explicit ax-cross-scope-change ax-deviation-self-resolve ax-dialogue-discipline ax-dispatch-via-batch ax-diverge-before-recommend ax-env-fix-channel ax-execution-log-plan-vs-fact ax-execution-order ax-fix-classification ax-group-audit-leaves-a-receipt ax-group-review-leaves-a-receipt ax-grouping-reduces-noise ax-halt-vs-fail-distinction ax-handoff-typed ax-live-log ax-narrow-recon ax-no-focused-or-skipped-tests-on-merge ax-no-process-narration ax-operator-agreement ax-operator-dialogue-style ax-operator-language ax-operator-output-live-text ax-operator-safeguard ax-owner ax-permitted-bash-commands ax-phase-scope-lock ax-preflight-blast-radius-scoped ax-problem-probes-spec ax-progressive-disclosure ax-re-dispatch ax-read-per-manifest ax-rejection-reason ax-release-ready-default ax-reopen-format ax-review-vcs-commands ax-scale-proportional-depth ax-stateless-flow ax-step-by-step-approval ax-stop-no-edits ax-surgical ax-task-id-uniqueness ax-task-parallel ax-task-resolution ax-ticket-section-names-normative ax-tool-invocation ax-verification-before-handoff ax-verify-and-finalize ax-verify-at-end` |
| `scaffold` | 20 | `ax-append-only-module-add ax-bootstrap-ticket-derivation ax-cross-scope-task-placement ax-dag-and-ticket-boundaries ax-directive-mode ax-extend-dag-preserves-existing-ids ax-handoff-to-task-scaffolding ax-idempotent-modes ax-mode-auto-detect-or-halt ax-phases-declared-in-header ax-rule-activation-plan ax-rule-activation ax-rules-cascade-resolution ax-rules-load-from-phase-block ax-rules-resolution-hard-fail ax-scope-rules-declaration ax-stack-based-flow ax-task-dimensions ax-ticket-deduplication ax-ticket-has-bdd-and-tests` |
| `spec` | 36 | `ax-access-patterns-drive-schema ax-context-to-contract ax-contracts-textual-agnostic ax-data-lifecycle-explicit ax-decision-log-required ax-draft-ready-for-review ax-dx-first ax-exact-scope ax-external-input-untrusted ax-handoff-to-module-decomposition ax-hierarchical-specs ax-interface-flow ax-living-spec ax-module-boundary-by-operator ax-no-data-loss ax-no-silent-option-drop ax-parallel-mechanism-requires-justification ax-pivot-requires-supersession ax-portal-primary-owner ax-ports-and-abstractions-discipline ax-product-library-flow ax-refine-module-preserves-contracts ax-runtime-backing-explicit ax-runtime-backing-in-contracts ax-scope-graph-detection ax-scope-graph-discipline ax-scope-spec-module-map-ownership ax-scope-stays-thin ax-scope-table-format ax-scope-type-branch ax-separation-of-concerns ax-spec-dimensions ax-spec-lifecycle ax-spec-structure ax-stateless-artifact ax-vision-only-for-application` |
| `storybook` | 22 | (`ax-ai-generated-tag` … `ax-storybook-title-from-spec`) |
| `svelte` | 34 | (`ax-bindable-for-two-way` … `ax-sk-*`, `ax-svelte-test-*`) |
| `testing` | 40 | `ax-anchor-coverage-nontrivial ax-anchor-intentful-names ax-anchor-trivial-exception ax-assert-api-choice ax-bdd-generation ax-bdd-name-discipline ax-case-flow ax-contract-over-implementation ax-coverage-by-contract-not-by-line ax-default-direct-assertion-protocol ax-e2e-first ax-explicit-vitest-imports ax-file-name-and-default-shape ax-fixture-io-policy ax-hooks-only-for-lifecycle ax-http-boundary-injection ax-http-mock-agent-pattern ax-it-opening-brief ax-mock-as-last-resort ax-mock-hygiene ax-mock-requires-operator-confirm ax-no-describe-let-pileup ax-no-falsification-via-mocks ax-one-test-one-scenario ax-one-unified-context-per-file ax-partial-string-via-match ax-phase-anchors ax-prefer-factory-over-hooks ax-prefer-native-mock-fn ax-prefer-vi-fn-for-interaction ax-snapshot-file-location ax-snapshot-usage-gate ax-test-anchor-naming ax-test-file-size-budget ax-test-mandate ax-tests-no-human-narration ax-time-env-global-lifecycle ax-vitest-assert-api-choice ax-vitest-isolation-default ax-vitest-run-not-watch` |
| `truth` | 11 | `ax-autonomous-research ax-evidence-hygiene ax-freshness-guard ax-live-source-only ax-no-unverified-findings ax-production-realism ax-real-run-over-ping ax-research-persisted ax-reuse-first ax-spec-is-sole-source ax-stale-must-be-rejected` |
| `typescript` | 11 | `ax-base-contract-shape ax-consumers-tag-semantics ax-direct-implementation-protocol ax-english-only-names-and-comments ax-entity-specific-minimums ax-flat-jsdoc-for-properties ax-implementation-hiding-in-public ax-no-transpile-only-constructs ax-tag-usage-matrix ax-truthful-encapsulation ax-type-vs-interface-choice` |
| `uikit` | 17 | `ax-a11y-audit-parameters ax-a11y-defaults ax-a11y-requirements ax-component-props-contract ax-css-module-selector-conventions ax-css-tokens-via-root ax-data-attrs-not-host ax-data-state-for-testability ax-element-structure-from-extraction ax-existing-components-check ax-extraction-input ax-file-structure-kebab-case ax-icon-svg-tight-viewbox ax-token-discipline ax-token-override-comment ax-token-section-generation ax-variant-grouping` |

Все 20 счётчиков по каталогам подтверждены построчно верификатором.

**Наблюдение о стеке**: только `scaffold/ax-stack-based-flow.xml` и группа `infra/**` несут стековую семантику; аксиомы `infra` специфичны для npm/eslint/prettier/nvmrc (`ax-single-package-manager`, `ax-npm-agent-sandbox-registry`, `ax-prettier-owns-formatting`, хуки `ax-nvmrc-*`). `svelte` (34) + `storybook` (22) + `uikit` (17) + `e2e` (24) = 97 аксиом привязаны к одному веб-стеку. Каталога аксиом для `python`, `golang` или `swift` нет.

Соседние библиотеки brick (тот же корень рендера `ai/kit`): `anti-pattern/**` (**11** каталогов, не 12 — `coding critic e2e infra logging process spec storybook svelte testing uikit`; многие несут одновременно копию `AP_UPPER_SNAKE.xml` и `ap-kebab.xml` того же id), `contract/{audit(3),critic(1),interview(1),process(25),scaffold(4),spec(23),uikit(1)}`, `definition/{e2e,infra,process,storybook,svelte,testing,typescript,uikit}`, `hook/{coding,e2e,infra,storybook,svelte,testing,typescript,uikit}`, `pattern/{e2e,infra,spec,storybook,svelte,testing,typescript,uikit}`, плюс `ai/kit/demo/{sdd-mini.hbs,render-demo.ts,indent-check.ts}` и `ai/kit/AUTHORING.md` (25 775 байт — контракт авторинга, на секции которого ссылаются аудиты).

### 3.5 `cli/__tests__/directive-tool-contract/**` — что проверяет

3 файла, 1 340 LOC: `directive-tool-contract.test.ts` (675), `fixture.ts` (263), `parse-tool-calls.ts` (402). Контракт заголовка (`directive-tool-contract.test.ts:1-10`): каждый документированный вызов `npx gennady <cmd> …` в директивах sdd-v2 `execute` / `phase-execution-protocol` / `audit` / `reconcile` должен **(a)** называть команду, которую распознаёт собственный диспетчер gennady, **(b)** возвращать документированный *класс* результата на реальном фикстурном репо (exit 0 для обычного вызова, документированный код ошибки инструмента — для пути ошибки), **(c)** для форм с фиксированной формой — выдавать вывод, соответствующий этой форме — «класс бага, который стоит исполняющему агенту реальной паники: таблица со ссылкой на инструмент, обещающая флаг, баннер Task-ID или сайд-эффект статуса, которого у CLI на самом деле нет».

Читает **и** исходные шаблоны (`ai/kit/templates/sdd-v2`), **и** собранное дерево (`ai/directives/sdd-v2`), резолвит ленивый скелет + step-пакеты через `resolveAssemblyMode` из `ai/kit/lazy-assembly.ts`, извлекает по фрагменту, а не по объединённому тексту (несбалансированная обратная кавычка одного fenced-блока, переспарившаяся между файлами, тихо роняла 13 из 42 документированных вызовов). Наборы / кейсы:

| Набор | Кейсы |
|---|---|
| `callable SDD-v2 action-call inventory` | обнаруживает каждую вызываемую исходную директиву и классифицирует каждую команду Action · использует реальную команду диспетчера, валидную форму CLI, локальную провенансность, явное переиспользование результата · классифицирует не-исполняемые формулировки как типизированные `ToolLiterals` с валидным синтаксисом CLI · держит исходную и собранную/lazy-сборки согласованными · отвергает некорректные или неозначенные структурные маркеры · регистрирует scaffold feasibility и отвергает неотмеченный Action-вызов или невалидные флаги · держит резолв состояния таска с безгосударственным оркестратором до диспатча воркера · даёт каждому безгосударственному публичному скиллу одного структурного владельца снимка репозитория/результата |
| `command existence` | по одному кейсу на документированный вызов — каждый документированный вызов действительно есть в диспетчере gennady |
| `documented call still present verbatim in its directive` | страж дрейфа, по кейсу на документированный вызов |
| `sdd-orient documented invocation contract` | каждое использование — форма `--scope` до материализации без позиционного пути · критик изучает ограниченный набор артефактов напрямую, без устаревшего обхода через orient |
| `historical SDD agent-confusion regressions` | у reconcile нет голого действия sync, прямые правки получают ровно один receipt-командой · audit и code-review определяют оба режима один раз и передают именованный контекст дальше · audit сохраняет точные файлы lint и запрещает реконструкцию shell · scaffold исчерпывающе отображает каждого легального владельца DAG ровно на один вызов тикета · скиллы рекламируют только реализованные режимы audit/review |
| `documented result class against a real fixture repo` | по кейсу на документированный вызов, исполненный против одноразового репо `fixture.ts` через `node --import <repo>/node_modules/tsx/dist/loader.mjs cli/gennady.ts` (абсолютный путь загрузчика намеренно — голый спецификатор `tsx` резолвился бы из cwd фикстуры) |

---

## 4. Скиллы `ai/skills/*` и модель роутера

12 скиллов (`ai/skills/README.md:3-4`: «12 навыков: 8 SDD-навыков, agent-inbox, opencode-get-session, prd-interview и workspace-permission-setup»). Зеркалируются в `<cwd>/.claude/skills` командой `gennady sync-skills` (§1.1).

### 4.1 Таблица скиллов

| Скилл | LOC | Форма | Шаг `GATHER` — что загружает / вызывает | `EMBODY` |
|---|---|---|---|---|
| `sdd` | 20 | тонкий загрузчик директивы | ОДИН параллельный батч: `<ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall>` + полное чтение `ai/directives/sdd-v2/router.directive.xml` | стать роутером; intent из сообщения оператора, свидетельства из `routerState`; `ROUTE` = следовать первому совпавшему `LOGIC_SWITCH` |
| `sdd-scaffold` | 18 | тонкий загрузчик | тот же батч (`sdd-state` + router.directive.xml) | роутер с **буквально форсированным intent `scaffold`** |
| `sdd-execute` | 18 | тонкий загрузчик | тот же батч | роутер с форсированным intent `execute`; пустой payload = показать карту исполнения и ждать, «он никогда не алиасит `next`» |
| `sdd-critic` | 18 | тонкий загрузчик | тот же батч | роутер с форсированным intent `critic` + ограниченной целью |
| `sdd-reconcile` | 18 | тонкий загрузчик | тот же батч | роутер с форсированным intent `reconcile` |
| `sdd-audit` | 22 | **загрузчик директивы, без роутера** | читает `ai/directives/sdd-v2/audit.directive.xml` целиком и следует ей напрямую | «**Здесь намеренно нет гейта `sdd-state`/PREFLIGHT** … Этот скилл — сознательное, а не случайное исключение в семье» (`:12-15`). Режим явный: диспатч из execute → `per-group`, оператор называет один таск → `per-task`. Механические гейты сознательно НЕ повторяются («они дрейфуют от источника истины в момент дублирования») |
| `sdd-code-review` | 32 | загрузчик директивы, без роутера | читает `ai/directives/sdd-v2/code-review.directive.xml` | первое действие резолвит `ReviewContext`: группа → `npx gennady sdd-task --group-scope <id>`; один таск → `npx gennady sdd-task --task-scope <Task-ID>`. «Никакого вставленного манифеста и ручного обнаружения git/repo» |
| `sdd-check` | 26 | **тонкий репортёр инструмента, без директивы** | «В отличие от других скиллов, `check` не загружает директиву — логика целиком живёт в инструменте `sdd-check` (`shared/sdd/check.ts`)» (`:10-12`) | `npx gennady sdd-check --task <path>` или `--all`; ретранслирует находки дословно + exit code; направляет фиксы в `/sdd-reconcile` или `/sdd-critic` |
| `agent-inbox` | 47 | не-SDD | один параллельный батч: читает `ai/directives/agent-inbox/inbox-flow.directive.xml` + `npx gennady inbox --json` | со-пилот ревью MR для GitLab/GitHub; intents `list`/`tick`/`loop`/`reset` |
| `opencode-get-session` | 149 | не-SDD | `sqlite3 ~/.local/share/opencode/opencode.db`, только чтение | извлечение транскрипта (DISCOVERY / TARGETED) |
| `prd-interview` | 133 | не-SDD (скилл на русской прозе) | `Task(subagent_type: Explore)` по репозиторию + 1–2 `WebSearch`; читает собственный `PRD_TEMPLATE.md` | идея → интервью PRD/EARS; «Если проект на SDD (есть `specs/README.md`) — предложи передать PRD в `sdd` (роутер, intent=new-scope)» |
| `workspace-permission-setup` | 194 | не-SDD | читает `.claude/settings.json`, вызывает скилл `fewer-permission-prompts` | пишет блок разрешений; **единственное место в репо с таблицей детекции нескольких стеков** — `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`/`Gemfile`/`Makefile`/`Dockerfile`/`mise.toml` → списки разрешённых Bash-команд по стеку (`:31-41`). Эта детекция — для *разрешений*, а не для потока SDD |

5 скиллов, входящих в роутер, идентичны по форме: тот же `<Priming>` («тонкие загрузчики директив … Embody the loaded prompt directive; do not parse its XML-ish markers»), тот же батч `GATHER`, различаются только форсированным intent. `STEP_0_STATE` роутера (`router.directive.xml:334`) навязывает контракт: «Consume exact result alias `routerState` from the entry skill. Do not repeat `sdd-state`.»

### 4.2 Модель роутера — `router.directive.xml` (405 LOC)

Cross-cutting аксиомы в `BeliefState` (14 `<Axiom id=…>`, **10** из них `cross-cutting="true"` — не 13, как заявлял A2; без атрибута — `AX_DIVERGE_BEFORE_RECOMMEND` (:141), `AX_SCALE_PROPORTIONAL_DEPTH` (:158), `AX_STATELESS_FLOW` (`invariant="true"`, :165), `AX_V2_HAS_NO_INTERNAL_MIGRATION` (:202)): `AX_OPERATOR_LANGUAGE` (:8), `AX_TOOL_INVOCATION` (:46), `AX_OPERATOR_DIALOGUE_STYLE` (:68), `AX_DIALOGUE_DISCIPLINE` (:109), `AX_OPERATOR_SAFEGUARD` (:120), `AX_NO_PROCESS_NARRATION` (:129), `AX_OPERATOR_OUTPUT_LIVE_TEXT` (:135), `AX_DIVERGE_BEFORE_RECOMMEND` (:141), `AX_SCALE_PROPORTIONAL_DEPTH` (:158), `AX_STATELESS_FLOW` (:165), `AX_STATELESS_ARTIFACT` (:171), `AX_READER_WITHOUT_SESSION_CONTEXT` (:176), `AX_DECISION_LOG_NON_OBVIOUS` (:184), `AX_V2_HAS_NO_INTERNAL_MIGRATION` (:202).

`KernelGrammar` (`<KernelGrammar>` на `:208`, `DEF_LOGIC_SWITCH` `:209`, `DEF_READ_AND_USE_DIRECTIVE` `:220`, закрытие `:231`) определяет две конструкции: `LOGIC_SWITCH` — первый совпавший `WHEN` побеждает, условия резолвятся только из уже присутствующих в контексте данных (вывод `sdd-state` + классифицированный intent), кейсы взаимоисключающие, `DEFAULT` обязателен, одно действие на кейс; и `READ_AND_USE_DIRECTIVE(src)` — runtime ленивая загрузка файла с сохранением полного приоритета инструкций («в отличие от stdout команды»), загруженная ветка наследует ядро и не должна его повторять.

**Gate LogicSwitch** (`:294-305`, `on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"`) — 9 кейсов по порядку:

| # | WHEN | → |
|---|---|---|
| 1 | `FLOW_VERSION=v1` И blast radius достигает легаси-раскладки `tasks/` или переписывания task-ID | `READ_AND_USE_DIRECTIVE("…/migration-v1-v2.directive.xml")` |
| 2 | у любой запрошенной цели scaffold `AUTHORING_SCOPE=<t> READY=no|not-applicable` | STOP с точным `AUTHORING_SCOPE_DIAG` + `AUTHORING_SCOPE_NEXT` этой цели; scaffold никогда не правит владеющую спеку |
| 3 | у каждой запрошенной цели `READY=yes` | продолжить authoring scaffold; агрегат `AUTHORING_READY=no` и несвязанные красные строки не блокируют более узкий набор целей; недостающие runtime-гейты объявляются bootstrap-работой |
| 4 | `EXECUTION_READY=no` И тикет/фаза — точный владелец в `GATE_QUEUE` | продолжить только эту фазу; `sdd-task --phase` / `sdd-verify --task … --phase` выводят исключение независимо; истекает, когда тикет покидает TODO/IN_PROGRESS |
| 5 | `EXECUTION_READY=no` И любая другая фаза product/library | STOP: сперва отработать точный `GATE_QUEUE` |
| 6 | `GATE_QUEUE_DIAG` вида `infra-spec-no-tickets` | сказать оператору запустить `/sdd-scaffold` — «отдельный процесс, никогда не `READ_AND_USE_DIRECTIVE`'нный отсюда (scaffold сам передаёт управление обратно в этот поток, поэтому загрузка его здесь зациклила бы)» |
| 7 | `GATE_QUEUE_DIAG` вида `scope-name-mismatch` | поправить поле `Scope:` тикета или имя скоупа в портале напрямую, никогда оба одновременно наугад |
| 8 | `FLOW_VERSION=v1` И blast radius остаётся внутри своего легаси-скоупа | однострочная запись состояния, продолжить легаси-совместимый владеющий поток |
| 9 | `EXECUTION_READY=yes` И запрос — execute | продолжить исполнение |
| DEFAULT | — | продолжить не-scaffold, не-execution владеющий поток, не переинтерпретируя ни один из двух фактов готовности |

**Route LogicSwitch** — `STEP_2_ROUTE`, «Load exactly one owner» (`:373-397`), 12 кейсов (11 `WHEN` + `OTHERWISE`):

| WHEN | → директива |
|---|---|
| flow version v1 И оператор явно запрашивает миграцию | `migration-v1-v2.directive.xml` |
| форсированный intent = `scaffold` | потребовать корректных, семантически актуальных маркеров approval #1 в реальных спеках, иначе `H_SPEC_NOT_APPROVED`; затем `scaffold.directive.xml` |
| форсированный intent = `execute` ИЛИ intent = `execute` | `execute.directive.xml` |
| форсированный intent = `critic` | `critic.directive.xml` |
| форсированный intent = `reconcile` | `reconcile.directive.xml` |
| intent = `project-setup` | `root.directive.xml` |
| intent = `recover-from-code` | `discover-from-code.directive.xml` |
| intent = `module-decomposition` | `module.directive.xml` |
| intent ∈ {new-scope, evolve-scope, multi-scope} И scope-type = `infrastructure` | `infra.directive.xml` |
| … И scope-type = `interface` | `interface.directive.xml` |
| … И scope-type ∈ {product, library} | `scope.directive.xml` |
| ИНАЧЕ | `H_AMBIGUOUS_INTENT` |

Словарь intent из `STEP_1_CLASSIFY` (`:342-368`): форсированный (`scaffold`, `execute`, `critic`, `reconcile`) авторитетен; иначе классификация в `project-setup · new-scope · evolve-scope · module-decomposition · multi-scope · recover-from-code · execute`. SCALE подтверждается только для authoring проекта/скоупа/модуля; execute/scaffold/critic/reconcile/recovery в нём не нуждаются никогда. `READINESS_PREFLIGHT_GATE` применяется один раз к read-only снимку — «Missing repository gate scripts return to their owning infrastructure/spec authoring path; they never create a session or migration branch.»

Halt-условия (`:322-329`): `H_AMBIGUOUS_INTENT` · `H_SPEC_NOT_APPROVED` · `H_V2_INVALID` · `H_WRONG_REPO`. **Уточнение верификатора**: `H_ASK_WITHOUT_CARD` **не объявлен ни в одной директиве** — он встречается только в `root.directive.xml:190` (и в источнике `root.directive.hbs:66`) как ссылка «the same gate the router enforces», а таблица `<HaltConditions>` роутера его не содержит вовсе — ни в самой таблице, ни в тексте. Аллоулист `ALLOWLIST_CROSS_DIRECTIVE_REFS` в `ai/kit/audit-halt-activation.mjs:120-125` разрешает `root.directive::H_ASK_WITHOUT_CARD` и `scope.directive::H_ASK_WITHOUT_CARD` со ссылкой (`:25-26`) на объявление в `router.directive.hbs`, которого там нет — комментарий самого аудит-скрипта устарел. Это самостоятельная находка: гейт «mentioned → declared» обходится аллоулистом для несуществующего halt.

Два обязательных approval-барьера — контракты самого роутера, не scaffold: `ARTIFACT_APPROVAL_FLOW` (`:233-255`) и `ARTIFACT_APPROVAL_MARKER` (`:256-293`) — approval #1 как запись Decision Log в каждой спеке рассматриваемого набора, approval #2 как секция в самом узком владеющем индексе тасков; оба — обычный человекочитаемый markdown, и «The agent never computes or copies a content hash for approval» (цитата найдена дословно, `:292`). Контракт закреплён тестом `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` (`two artifact approval boundaries`).

### 4.3 Детекция FLOW_VERSION v1

`shared/sdd/flow.ts` (48 LOC) — единственный детектор, потребляется `sdd-state.cmd` и `sdd-check.cmd` (заголовок `@consumers:`):
- `detectFlowVersion(root)` — `<root>/tasks/` — каталог ⇒ `v1`, иначе `v2`; любой брошенный `statSync` ⇒ `v2` (`:21-27`). «The `tasks/` directory is the single v1 marker.»
- `detectScopeFlowVersion(repoRoot, scope)` — в v2-репо каждый скоуп v2; в v1-репо скоуп v2 только когда `tasks/<scope>/` пропал **И** существует `specs/<scope>/<scope>.3-tasks.md`; нетронутые скоупы остаются «v1-lenient» (`:36-48`).

Поверхность: `sdd-state.types.ts:108` печатает `FLOW_VERSION=<v1|v2>`; `sdd-state.cmd.ts:180` добавляет диагностику `FLOW_VERSION=v1; migrate before v2 scaffold`; `sdd-state/help.ts:15` это документирует. Роутер потребляет это в кейсах 1 и 8 Gate-переключателя и кейсе 1 Route-переключателя; `AX_V2_HAS_NO_INTERNAL_MIGRATION` (`router:202`) запрещает изобретать любую миграцию сверх v1→v2.

### 4.4 Где происходит (и не происходит) выбор инфраструктуры/стека

Grep по `infra`, `stack`, `package.json`, `node`, `npm` в `router.directive.xml`, `infra.directive.xml`, `readiness.directive.xml`, `shared/sdd/portal.ts`, `cli/cmd/sdd-state/*.ts`:

| Место | Находка |
|---|---|
| `router.directive.xml` | **Ноль** упоминаний стека/технологии (подтверждено grep: 0 попаданий `package\.json\|npm\|node`). Единственные попадания `stack` — ровно 4 строки: русская глоссарная строка «тулстек» → «Tool Stack» (`:25-26`), запрет «frame-stack talk» (`:131`), и `AX_DECISION_LOG_NON_OBVIOUS`, называющий «Tool Stack» как секцию (`:191`). Ни одного упоминания `package.json`, `npm` или `node`. Роутер маршрутизирует по intent + **типу** скоупа (`product`/`library`/`infrastructure`/`interface`), никогда по языку или рантайму |
| `root.directive.xml` | `STEP_3_INFRA_BOOTSTRAP` (`:316-326`) материализует минимальную `specs/infra-base/infra-base.spec.md` с **таблицей Tool Stack (только имена инструментов, Decision Log ещё нет)**; полный Decision Log приходит позже из потока `infra` (`:59`). `CODE=absent` значит «пусто / только package.json» (`:185`) — в прозе детекции greenfield подразумевается Node. «Technical/stack preference» в интейке паркуется до фиксации тулстека в STEP_3 (`:230-232`) |
| `infra.directive.xml` | **Единственное реальное место принятия решения о стеке.** `STEP_2` несёт `<LogicSwitch on="stack typicality">` (`:315-318`, оба `WHEN` дословно): ветка EXPRESS — когда каждая ещё не зафиксированная категория резолвится в существующую запись `<Rules>` `ai/directives/knowledge.xml`; иначе полный `interview-protocol`, при неопределённой типичности по умолчанию — интервью, «never a silent EXPRESS guess». Обязательные категории `vcs / package-management / git-hooks` нельзя пропустить (`H_MANDATORY_CATEGORY_DROPPED`); `test-e2e` — opt-out с записанной строкой риска. Правила сопоставляются по имени инструмента / артефактам конфига против `<Triggers>` `knowledge.xml` (`:83`). **Но конкретные артефакты гейта жёстко зашиты как Node**: «The infrastructure scope that first installs dependencies must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`) before that install» (`:430-432`); разрешённые узкие чтения — «`package.json` and equivalents, `tsconfig.json` and equivalents» (`:191`) |
| `readiness.directive.xml` | Полностью про npm. `keywords="… package-json, npm-scripts, gennady, stub, not-ready …"` (`:1`); миссия — восемь точных скриптов `package.json` (`:3-22`); STEP_3 создаёт `package.json`, если его нет, и запускает `npm i -D …` (`:106-112`); разобранный минимальный пример `package.json` со `"fix": "npm run format:fix -- . && npm run lint:fix -- src/"` (`:209`, дословно). Вне области: «choosing the real tool stack with a Decision Log (the infra branch)» (`:26`). Ни одного упоминания python/go/cargo/gradle |
| `shared/sdd/portal.ts` | **Никакой концепции стека вообще.** Таблица Scopes несёт только `scope-type` «infrastructure \| contracts \| product \| library» (единственная типовая строка, `:15`); всякое другое попадание `stack`/`node` — локальное состояние Tarjan-SCC (`onStack`, `stack`, граф-*node*, `:143-221`). Портал не может записать язык или рантайм |
| `cli/cmd/sdd-state/**` | `sdd-state.cmd.ts:152` «exact-match required scripts; missing/broken package.json reads as not-ready»; `sdd-state.types.ts:112` печатает буквальную строку `package.json ✔/✘`; `[PROBE]` печатает только булевы `CODE=`/`INFRA=` из `shared/sdd/probe.ts` (`:196,215`), чей `CODE_EXT` — `/\.(js|jsx|ts|tsx)$/`, а `CONFIG_FILES` — только tsconfig/eslint/prettier/vitest/vite/jest (§2.1). Поле языка никогда не эмитируется |
| `ai/skills/workspace-permission-setup/SKILL.md:31-41` | **Единственная** в репо таблица детекции нескольких стеков (`pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `Makefile`, `mise.toml`, …) — но она питает разрешения `.claude/settings.json`, а не поток SDD |

**Вывод.** В потоке v2 нет ни одного селектора стека/пресета. Единственная точка принятия решения — переключатель «stack typicality» в `infra.directive.xml`, и он выбирает только *глубину интервью* — конкретные артефакты, которые он затем мандирует (`package.json`, `.nvmrc`, `.npmrc`, `tsconfig.json`), и восемь readiness-кирпичей — Node/npm-литералы. `gennady.yaml` не существует (§1.2), так что проекту негде объявить свой стек; каждый факт о стеке выводится из `package.json`. Точные точки подключения для per-stack пресета — в §9.

---

## 5. Слой правил — `knowledge.xml` + `coding/**` · `testing/**` · `infra/**`

### 5.1 `ai/directives/knowledge.xml` — реестр правил (151 LOC, `<AiKnowledge ver="2.0">`)

Один `<CheckPhaseOrder>typecheck test lint format</CheckPhaseOrder>` (`:3`, дословно), затем 3 категории (`<Coding>`, `<Testing>`, `<Infra>` внутри `<Rules>`, `:2`), **14** записей `<Rule>` (не 15, как в шапке A2 дважды — собственная таблица §5.1 A2 уже перечисляла верные 14). Каждая запись несёт одну и ту же 8-полевую форму: `<File>` · `<Purpose>` · `<Triggers>` · `<SkipWhen>` · `<ActivationHint>` · `<CheckPhase>` · `<RequiresVerification>` · ноль-или-более `<CrossRef id>`.

| Категория | Id правила | Файл | CheckPhase | RequiresVerification | CrossRef |
|---|---|---|---|---|---|
| `Coding` | `typescript-rules` | `coding/typescript-rules.xml` (589) | `typecheck` | `check-command` | — |
| | `svelte5-runes` | `coding/svelte5-runes.xml` (248) | `typecheck` | `check-command` | `typescript-rules`, `sveltekit-rules` |
| | `sveltekit-rules` | `coding/sveltekit-rules.xml` (247) | `typecheck` | `check-command` | `svelte5-runes`, `typescript-rules` |
| `Testing` | `testing-common` | `testing/common.xml` (269) | `test` | `check-command` | — |
| | `vitest-rules` | `testing/vitest-rules.xml` (326) | `test` | `check-command` | `testing-common` |
| | `node-test` | `testing/node-test.xml` (298) | `test` | `check-command` | `testing-common` |
| | `playwright-cli` | `testing/playwright-cli.xml` (199) | `test` | `check-command` | `playwright-e2e` |
| | `playwright-e2e` | `testing/playwright-e2e.xml` (361) | `test` | `check-command` | `playwright-cli` |
| | `storybook-usage` | `testing/storybook-usage.xml` (173) | `test` | `check-command` | `storybook-setup` |
| | `svelte-testing` | `testing/svelte-testing.xml` (237) | `test` | `check-command` | `node-test`, `vitest-rules`, `svelte5-runes` |
| `Infra` | `eslint-setup` | `infra/eslint-setup.xml` (475) | `lint` | `check-command` | — |
| | `git-setup` | `infra/git-setup.xml` (267) | *(пусто)* | *(пусто)* | — |
| | `nodejs-npm-setup` | `infra/nodejs-npm-setup.xml` (394) | *(пусто)* | *(пусто)* | — |
| | `storybook-setup` | `infra/storybook-setup.xml` (153) | `test` | `check-command` | `storybook-usage` |

**Не зарегистрированы в `knowledge.xml`, но присутствуют на диске**: `coding/uikit-component-storybook.xml` (342), `coding/uikit-component-svelte.xml` (339), `coding/uikit-spec-drafting.xml` (238) — 919 LOC текста правил, на которые не ссылается ни одна запись `<Rules>`, так что ни один `<Triggers>` никогда их не активирует; достижимы только через `<DependsOn>` другого правила. `ai/directives/architecture/` содержит только `README.md` (21 LOC) — Stage B в `AX_RULE_ACTIVATION` обходит «the axioms of `architecture/*` and `infra/*` rules», но дерево `architecture/*` пусто от правил.

**Стековое покрытие поставляемого набора правил**: TypeScript (1) · Svelte/SvelteKit (2) · uikit-Svelte/Storybook (3, незарегистрированы) · node:test + Vitest + Playwright + Storybook (7) · eslint + git + node/npm + Storybook setup (4). Правил для Python, Go, Swift, Rust, Java или «anystack» — **нет вообще**.

### 5.2 Граф `<DependsOn>` (рёбра каскада)

Объявлен в самих файлах правил, не в `knowledge.xml`. Проверено верификатором построчно — совпадение 1:1 по всем 17 файлам:

| Файл правила | `<DependsOn>` |
|---|---|
| `coding/svelte5-runes.xml` | `coding/typescript-rules.xml` |
| `coding/sveltekit-rules.xml` | `coding/typescript-rules.xml`, `coding/svelte5-runes.xml` |
| `coding/uikit-component-svelte.xml` | `coding/svelte5-runes.xml`, `coding/uikit-spec-drafting.xml` |
| `coding/uikit-component-storybook.xml` | `testing/storybook-usage.xml`, `coding/uikit-component-svelte.xml` |
| `testing/playwright-cli.xml` | `coding/typescript-rules.xml` |
| `testing/playwright-e2e.xml` | `coding/typescript-rules.xml`, `testing/playwright-cli.xml` |
| `testing/svelte-testing.xml` | `testing/vitest-rules.xml`, `coding/svelte5-runes.xml` |
| `coding/typescript-rules.xml`, `coding/uikit-spec-drafting.xml`, `testing/common.xml`, `testing/node-test.xml`, `testing/storybook-usage.xml`, `testing/vitest-rules.xml`, все 4 `infra/*` | *(нет — листья)* |

Дрейф подтверждён: `knowledge.xml` говорит, что `vitest-rules` / `node-test` / `svelte-testing` наследуют `testing-common` через `<CrossRef>`, но **ни один из трёх не объявляет `testing/common.xml` в `<DependsOn>`** — так что `checkRulesCascadeClosure` никогда не требует его в списке `Rules:` фазы. `<CrossRef>` — проза для агента; `<DependsOn>` — механическое ребро.

### 5.3 `shared/sdd/rules-cascade.ts` (82 LOC) и как его использует `sdd-check`

Три чистых экспорта, `@consumers: sdd-check.cmd`:
- `normalizeRulePath(ticketFile, repoRoot, linkTarget)` (`:22-33`) — резолвит цель ссылки буллета `Rules:` фазы в repo-root-relative POSIX-путь. **Абсолютные формы (`/…` или `C:\…`) возвращаются дословно намеренно**: «Relativizing them first would disguise an absolute injection as traversal» (`:27-29`), отказ оставлен строгой границе принадлежности репозитория.
- `parseRuleDependsOn(ruleFileContent)` (`:41-45`) — `/<DependsOn>([\s\S]*?)<\/DependsOn>/`, затем буллеты `^\s*-\s+(\S+)`, дословно; `[]`, если отсутствует.
- `checkRulesCascadeClosure(file, phaseId, rules, depsMap)` (`:56-82`) — DFS по `depsMap`; каждая прямая + транзитивная зависимость, ещё не в заявленном списке фазы, даёт одну **ошибку** `SDD_RULES_CASCADE_UNRESOLVED` (`Phase <P>: rule dependency "<dep>" is required transitively but is not in the phase's Rules: list — the closure over <DependsOn> is incomplete.`). Пустой список `Rules:` коротко замыкается в `[]` — **фаза без заявленных правил никогда не флагуется**. Код находки — `shared/sdd/rules-cascade.ts:78`.

Проводка в `cli/cmd/sdd-check/sdd-check.cmd.ts`: `checkTicketRulesCascade` (`:417-…`) итерирует `selectedRulePhases(content, selection?.phaseIds)`, фильтрует буллеты до `*.xml`, нормализует каждый (`:426-428`), затем `buildRuleDepsMap(repoRoot, seeds)` (`:395-415`) обходит достижимый граф `<DependsOn>` с мемоизированным `getRuleDeps`/`ruleDepsCache` (`:384-392`). Критично: «failed nodes are never treated as proven leaves» — нечитаемый файл правила становится `ReadIssue`, а не тихим листом.

**Как scaffold использует правила** (`ai/kit/axiom/scaffold/*`, активируется внутри `scaffold.directive.xml` / его шагов):
- `AX_RULE_ACTIVATION_PLAN` — «`ai/directives/knowledge.xml` (`<Rules>` section) is the canonical rule registry»; правило активно для фазы тогда и только тогда, когда его `<Triggers>` совпадают с Target Files + kind *именно этой* фазы, а `<SkipWhen>` не применяется; «Signal-based only — the directive carries zero hardcoded language/tool knowledge»; список `Rules:` фазы должен быть *явным, полностью резолвнутым транзитивным замыканием* над `<DependsOn>`, «the phase-subagent reads the list as-is and never walks `<DependsOn>` at runtime»; каждый алиас `<RequiresVerification>` должен резолвиться через Verification Commands infra-спеки в таблицу Verification тикета.
- `AX_RULES_CASCADE_RESOLUTION` — эффективный набор правил = объединение 4 уровней, поздние переопределяют ранние: (1) обойдённые скоупы (транзитивное замыкание `depends-on`), (2) Effective Rules / Rules целевого скоупа, (3) Module Rules Additions из Handoff `module:<name>`, (4) таск (заданное оператором). **Cascade Table** (Scope × Categories) живёт в `specs/<scope>/<scope>.3-tasks.md`, никогда в `specs/3-tasks.md`; «a ticket-level rule list is a structure violation».
- `AX_RULES_RESOLUTION_HARD_FAIL` — каждая ссылка должна существовать как `ai/directives/<category>/<rule>.xml`; промах или любой плейсхолдер (`TBD`, `<rule>`, «to be authored») прерывает scaffold, а не пишет тикет.
- `AX_RULE_ACTIVATION` — двухстадийное решение оператора: Stage A фиксирует шорт-лист по категориям, Stage B обходит аксиомы `architecture/*` + `infra/*` для Accept (по умолчанию) / Adapt / Override с каждым отклонением в Decision Log; `coding/*` / `testing/*` откладываются до входа в фазу по `phase-execution-protocol`.
- `infra.directive.xml:83` — после фиксации тулстека каждый выбранный инструмент ищется в `<Rules>` `knowledge.xml`, `<Triggers>` сопоставляются с именем инструмента / артефактами конфига, найденные пути `<File>` записываются в Effective Rules спеки. Недостающее правило решается в сессии выбором оператора — **skip / research-and-author / defer** (`AX_SCOPE_RULES_DECLARATION`), причём `research-and-author` делает WebFetch авторитетной документации и пишет новый `ai/directives/<category>/<name>.xml` после одобрения оператора (`:131`).
- `sdd-new` и `shared/sdd/task-authoring-literals.ts` печатают кортежи rule ID + href прямо из `knowledge.xml` (§1.1, §2.1) — `loadRuleRegistry` / `parseRuleRegistry`; невалидный реестр — exit `1` (`ERR` на `sdd-new`).
- `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml` — аудит проверяет соответствие только тем правилам, которые фаза действительно активировала.

### 5.4 Что делает с правилами `cli/cmd/sync` — и `knowledge.xml` **не** защищён

`gennady sync [subdirs...] [--dry-run]` зеркалирует `ai/directives/` установленного пакета в `<cwd>/ai/directives` (`cli/cmd/sync/sync-core.ts`).

- Это **package-owned зеркало, не аддитивная копия**: «A removed directive must disappear from the target too, otherwise an update can keep executing stale flow logic indefinitely» (комментарий дословно на `:219-225`). Каждый путь в цели, отсутствующий в источнике, — `status: 'deleted'` и `unlink`ится (`:233-243`).
- Область владения (`scanTargetMirrorSpace`, `:160-162`): владеемые подкаталоги = собственные top-level каталоги источника (или фильтр `--subdirs`). Подкаталог в цели, который пакет никогда не поставлял, — **проектная кастомизация, не трогается и репортится через `warnings`** (текст дословно: «unknown subdirectory in target (not owned by package, left untouched): ${name}»; тест «leaves a target subdirectory the package does not own untouched, with a warning»). Дотфайлы и `EXCLUDED_ENTRIES = new Set(['architecture'])` (`:16`) пропускаются везде.
- **Файлы верхнего уровня, включая `knowledge.xml`, — обычные кандидаты на зеркалирование** при синке всего пакета без фильтра subdir (`:165-170`). `scanDirectives` возвращает `knowledge.xml` наравне с файлами подкаталогов: тест `sync-core.test.ts` (≈`:98-107`) подтверждает `assert.deepStrictEqual(files, ['coding/typescript.xml', 'knowledge.xml', 'sdd/discovery.xml'])`, а тест «excludes entries from EXCLUDED_ENTRIES set» (≈`:141-150`) — `assert.deepStrictEqual(files, ['knowledge.xml'])`. Grep `knowledge` по `cli/cmd/sync/*.ts` и `shared/common/sync/*.ts` — **0 попаданий**: особого случая нет.
- **Вывод для этого RC: `ai/directives/knowledge.xml` НЕ защищён от перезаписи.** Проект, который дописал свои правила в `knowledge.xml` (путь `research-and-author` в `infra.directive.xml:131` производит именно это), получает его тихо заменённым пакетной копией на следующем `gennady sync`, а любой проектный файл правила под package-owned подкаталогом (`coding/`, `testing/`, `infra/`) *удаляется* как устаревшая запись зеркала. Выживает, с предупреждением, только целиком новый подкаталог (например, `ai/directives/python/`). Это именно то, что в main фиксит коммит `f74c8c1d` («feat(sync): knowledge.xml is project-owned — never clobber a project's rule registry»); в истории этой RC-ветки (`11291af5`) этого коммита нет. См. §9.

### 5.5 `cli/cmd/sync-skills` — подрезка и исключение `__tests__`

`gennady sync-skills [names...] [--dry-run]` зеркалирует `ai/skills` пакета в `<cwd>/.claude/skills`, сначала прогоняя синк директив (`sync-skills.cmd.ts:67-100 syncDirectivesFirst`).

- **Нет манифеста.** Подрезка — чистый диф источник-цель (`sync-skills-core.ts`):
  - Файлы внутри сохранённого скилла, отсутствующие в источнике → `status: 'deleted'` + `unlink` (`:381-391`), обоснование: «Existing skill directories are mirrors too. Removing only whole orphan skills leaves stale files inside a still-supported skill, which is just as dangerous as a stale directive.»
  - Каждый каталог скилла в цели, которого нет в источнике, — сирота → `deleteOrphan` (`:395-403`). С позиционным фильтром сиротами могут стать только отфильтрованные имена (`:396-398`).
- **Исключения**: `EXCLUDED_NAMES = new Set(['.DS_Store'])` `:22` плюс любое `name.startsWith('.')`, применяется в 4 точках сканирования (`:22,36,84,168,337`). Grep `manifest`, `__tests__`, `.test.` по `cli/cmd/sync-skills/*.ts` даёт **0 попаданий** — исключения тестовых файлов или `__tests__` **нет**. Сегодня это безвредно, потому что `ai/skills/` поставляет только `SKILL.md`, `README.md` и `prd-interview/PRD_TEMPLATE.md` (тестовых файлов вообще нет, по `find`), но скилл, который когда-нибудь обзаведётся `__tests__/`, будет скопирован дословно в `.claude/skills` каждого потребителя.

---

## 6. `ai/flow-eval/**` — харнесс LLM-евалов (**7 887** LOC в **50** файлах; A2 заявлял «7 058 LOC across 42 files» — порядок величины верен, число уточнено верификатором пересчётом `wc -l` по `*.ts/*.md/*.json/*.sh/*.py`)

Назначение (`README.md:3-8`): «Checks whether a real model can walk one **phase** of the SDD flow like an ordinary developer … inside an isolated, disposable git sandbox. It is **not** a unit test of the directives and **not** a search for a pre-planted bug.» Подключается через `@opencode-ai/sdk` к **уже запущенному** HTTP-серверу OpenCode; никогда не спавнит `codex`/`opencode`; никогда не использует исходный чекаут как песочницу.

### 6.1 Модули

| Файл | LOC | Ответственность |
|---|---|---|
| `cli.ts` | 309 | флаги, провижининг изолированных песочниц, прогон батча, сохранение rationale каждого судьи; выбирает объективный гейт по фазе (`:259` → `{rule:'MIGRATION', …}`) |
| `provision.ts` | 1 341 | один временный git-репо на сценарий из `FIXTURE_FILES`; копирует собранный SDD (`dist/**`, `ai/**`) + CLI-шим в неизменяемый снимок |
| `runner.ts` | 168 | одна worker-сессия OpenCode на сценарий; ограничивает конкурентность + бюджет наблюдения. Дефолты кода: worker `openai/gpt-5.6-luna` / судья `openai/gpt-5.6-sol`, конкурентность 3, интервал 300 000 мс, бюджет 6, хвост 20 |
| `observer.ts` | 199 | ограниченный хвост по интервалу + статус + события + дифф → `progress`, `artifactProgress`, `repeated`, `waiting`, `stuck` |
| `judge.ts` | 74 | изолированная сессия судьи над узкой границей свидетельств; `parseVerdict` |
| `evidence.ts` | 308 | читает ограниченные свидетельства (отслеживаемые + **неотслеживаемые** файлы) |
| `quality-gate.ts` | 59 | объективный гейт R1 |
| `migration-grade.ts` | 145 | замороженная детерминированная оценка для `phase: 'migration'` |
| `types.ts` | 270 | источник истины для типов scenario / phase / mode / fixture / judge |
| `prompts.ts` · `opencode-runtime.ts` · `opencode-client.ts` · `sandbox-lifecycle.ts` · `session-directory.ts` | 91/144/17/110/19 | выбор фазового промпта, адаптер SDK, жизненный цикл песочницы, реестр session↔cwd |
| `scripts/` | — | `sandbox.ts` (107), `migration-eval.sh`, `roundtrip-eval.sh`, `roundtrip-grade.sh`, `reset-ticket.py`, `session-metrics.py`, `session-telemetry.py`, `upgrade-verification-tables.py`, `roundtrip-readiness-shim.package.json` (15) |
| `operator-approve.sh` | — | симулирует полное согласование оператором между фазами (портал + Decision Log) |

### 6.2 `scenarios.json` — только **7** сценариев (58 LOC)

| id | phase | mode | fixture | scale | acceptance |
|---|---|---|---|---|---|
| `fibonacci-library` | `spec-authoring` | `full-spec-to-approval-1` | `fibonacci-library` | `function` | «Specifications only. Public API `nth(n: number): number` is pure. Integer n from 0 through 77 … Scope and one cohesive module spec exist, include Requirement IDs and negative scenarios, pass the mechanical check, receive one fresh semantic review, and leave Approval #1 pending.» |
| `tic-tac-toe` | `scaffold` | `actual-tickets-to-approval-2` | `tic-tac-toe` | — | «…every runtime, package-manager, and configuration prerequisite to exactly one Bootstrap Requirements owner. Actual tickets and indexes … pass `sdd-check --task --authoring` plus `sdd-check --all` before review and Approval #2. A red ticket check returns to decomposition instead of being patched locally.» |
| `slugify-toolchain` | `execute` | `canonical-execute` | `slugify-toolchain` | — | **нет** (поля `acceptance` нет) |
| `broken-specs-repair` | `repair` | `fix-to-clean` | `broken-specs` | — | «`npx gennady sdd-check --all .` reports 0 errors; the invalid mermaid diagram is corrected to valid syntax, following the checker error message.» |
| `infra-log-summary` | `task` | `brief-to-artifact` | `infra-log-summary` | — | «`golden/verify.sh` exits 0.» |
| `infra-rotate-logs` | `task` | `brief-to-artifact` | `infra-rotate-logs` | — | «`golden/verify.sh` exits 0.» |
| `infra-makefile` | `task` | `brief-to-artifact` | `infra-makefile` | — | «`golden/verify.sh` exits 0.» |

Проверено дословно построчной сверкой с JSON (58 строк, 7 объектов), включая факт, что у `slugify-toolchain` действительно **нет** поля `acceptance`.

**Пространство типов заметно шире файла сценариев.** `types.ts` объявляет 7 фаз, 11 режимов, 14 фикстур (проверено: `SddEvalPhase` — 7: `spec-authoring scaffold execute repair task brownfield migration`; `SddEvalMode` — 11; `SddEvalFixtureId` — 14); `provision.ts` поставляет все 14 `FIXTURE_FILES` — но `scenarios.json` использует только 5 фаз, 5 режимов, 7 фикстур.

| Объявлено, но **отсутствует в `scenarios.json`** | |
|---|---|
| фазы | `brownfield`, `migration` |
| режимы | `modify-code-delta`, `fix-code-delta`, `recover-spec`, `delta-to-spec`, `modify-via-spec`, `v1-to-v2` |
| фикстуры | `brownfield-extend-cli`, `brownfield-fix-bug`, `brownfield-recover-spec`, `brownfield-delta-to-spec`, `brownfield-via-spec`, `brownfield-recover-in-scope`, `brownfield-recover-partial` |

Значит, 7 brownfield-фикстур + фикстура миграции v1→v2 существуют и детерминированно golden-протестированы (§6.5), но **ни один LLM-сценарий их не запускает** из справочного файла — их приходится гонять вручную либо через `scripts/migration-eval.sh` / `roundtrip-eval.sh`.

### 6.3 Контракт судьи (`judge.ts`)

`composeJudgePrompt` отправляет ровно: `INTENT` · `ACCEPTANCE` (если есть) · `STATE` (`{status, stuck, waiting, errors}`) · `DIFF` · `EVENTS` · `BOUNDED_TAIL`. Никогда — промпт воркера, полный транскрипт или внутренности раннера (`SddEvalJudgeInput`, `types.ts`). Рубрика встроена в промпт: «A stuck or unfinished worker, cancelled required worker/tool, red required gate, or missing required approval-boundary artifact is a failure. A worker-authored risk acceptance never overrides a red gate. An explicit pending operator approval is valid only when that is the scenario target and the actual reviewed artifacts exist.»

`parseVerdict` (`judge.ts:44-52`, регэксп на `:40-42`, дефолт `'inconclusive'` на `:45`) принимает только явную первую строку `VERDICT: pass|fail|inconclusive` (регэксп толерантен к bold/backtick-разметке и русскому «вердикт»); **отсутствие строки-вердикта ⇒ `inconclusive`, никогда не догадка по прозе**. Rationale документирует баг, который это заменило: старый substring-fallback `/ошиб|fail/` «false-failed every error-handling scenario whose judge skipped the verdict line».

### 6.4 Правила quality-gate

`QUALITY-RULES.ru.md` (65 LOC) — это **бэклог**, не реализация. Два руководящих принципа: (1) судья оценивает объективно через независимые golden-тесты, никогда через собственноручно написанные тесты воркера; (2) **воспроизводимость в ОБОИХ направлениях** — правило считается реализованным только когда конформный артефакт доказуемо проходит И неконформный доказуемо падает, оба воспроизводимо.

| # | Правило | Артефакт | Объективная проверка | Итерация | Реализовано в RC? |
|---|---|---|---|---|---|
| R1 | Структурная целостность | spec/ticket | `sdd-check --all` чисто | **1** | **да** — `quality-gate.ts` `parseSddCheckResult` + `checkR1Structure`; двусторонний тест `quality-gate.test.ts` (3 кейса, `parseSddCheckResult (R1, both outcomes)`) |
| R3 | Механические код-гейты | code | type-check + lint чисто, `testcov --min` | **1** | **нет отдельной функции-гейта** — ни одного `rule: 'R3'` во всём `ai/flow-eval/*.ts`; только косвенно через собственный `sdd-verify` фикстуры |
| R6 | Устойчивость: типизированные ошибки, называющие аргумент | code | golden негативные тесты + небольшой lint | 2 | нет |
| R2 | Независимые golden-тесты корректности | code | эталонный тест-сет фикстуры поверх реализации воркера | 3 | частично — наборы `golden/` существуют по фикстуре и утверждаются детерминированными тестами, но не проведены как именованное правило eval |
| R4 | Трассируемость бриф→спека→тест | spec | проверка отображения | 4 | нет |
| R5 | Воспроизводимость исхода ≥ порога на N | flow | доля успеха батча + фиксация формы отказа | 5 (сквозное) | нет |

Отложено самим документом: структурированное логирование/observability, интеграционные тесты нескольких модулей, security/secrets, perf/сложность, качество семантической декомпозиции, глубина исследования.

**На HEAD `11291af5` (то, что написал A2):** единственные два объективных id гейта, реально эмитируемых кодом, — `R1` (`quality-gate.ts:31,33,34,57`) и `MIGRATION` (`cli.ts:259`). Правила `R-COMPLETE` не было — grep по `R-COMPLETE` / `R_COMPLETE` по всему чекауту `11291af5` возвращал 0 попаданий; ближайшее по смыслу — работа над *завершённостью*, зафиксированная в `docs/flow-verification-redesign.md` + `docs/flow-verification-ledger.md`, приземлившаяся как механизм receipt group-audit/review (`AX_GROUP_AUDIT_LEAVES_A_RECEIPT` / `AX_GROUP_REVIEW_LEAVES_A_RECEIPT`, `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING`, §2) плюс RED-FIRST гейт `session-metrics.py gate`, но не как именованное правило `R*`. **Это устарело двумя коммитами позже HEAD инвентаря — см. врезку в конце раздела.**

`migration-grade.ts` — замороженная объективная оценка для `phase: 'migration'`, намеренно **не** «sdd-check clean», потому что «The v1→v2 migration document varies in CONTENT run to run». `pass = flowVersion === 'v2' AND no migration-introduced ERROR-severity finding among MIGRATION_CRITICAL_CODES = {SDD_BROKEN_SPEC_REF, SDD_BROKEN_SPEC_ANCHOR, ERR_CLI_SDD_CHECK_READ_FAILED}` (`:31-36,:98-101`). Всё остальное, что вырастает относительно baseline до миграции, репортится как `backlog`, никогда как отказ: «Pre-existing findings never fail a migration; new ones always do.» Baseline снимается на свежей v1-фикстуре функцией `captureBaseline` до запуска воркера.

### 6.5 Детерминированные тесты — `ai/flow-eval/__tests__/` (10 файлов, **2 031** LOC — не 2002, как в A2; **84** тест-кейса — не 75: реальный прогон `node --import tsx --test ai/flow-eval/__tests__/*.test.ts` даёт `# tests 84 / # suites 14 / # pass 83 / # fail 1`), запускаются `npm run test:sdd-flow-eval`

| Файл | LOC | Кейсы (факт) | Наборы |
|---|---|---|---|
| `harness.test.ts` | 1 128 | **22** (в A2 заявлено 29 — реальный вывод раннера 22) | фингерпринтинг наблюдателя вкл. вызовы инструментов · нет sleep после финального наблюдения · abort раннера после первого неизменного среза · abort раннера при исчерпанном бюджете · CLI отвергает невалидные observation-контролы до провижининга · контракт slugify + варианты с тегом `[COR-REQ-*]` · маркировка stuck/errors/waiting · **abort, когда воркер читает установленные бандлы Gennady** · abort на пробе SDD CLI, обёрнутой в stderr-редирект · один checker-output фильтр ≠ терминально stuck · калибровочные метрики P9 (девять повторных полных записей спеки; P9-непонимание → сигнификатор инструмента; единственный прогон P9.6) · граница bounded-evidence судьи · выбор phase-промпта устанавливает установленный SDD-поток + approval-барьер · ограниченные параллельные батчи · типизированный результат адаптера судьи · парсер судьи FAIL-содержащий-«pass» · парсер судьи bold PASS после раннего FAIL · каждый вызов сессии SDK сохраняет свой cwd песочницы и отвергает cross-sandbox промпт · SDK evidence включает неотслеживаемые артефакты, пропущенные `session.diff` · SDK evidence включает ограниченный прогресс дочернего воркера |
| `brownfield-spec-golden.test.ts` | 265 | 19 | `recover-spec` · `delta-to-spec` · `modify-via-spec` · матрица recover **S1** (скоуп есть, модуля нет) · матрица recover **S2** (частичная module-спека, расширить её) — все «(both outcomes reproducible)» |
| `brownfield-golden.test.ts` | 137 | 6 | `brownfield code-delta golden gate` · `brownfield bug-fix golden gate` (оба исхода) |
| `infra-golden.test.ts` | 128 | **9** (A2: 3 — реальный вывод раннера 9: 3 top-level `test()` с сабтестами) | `infra task golden gates (both outcomes reproducible)` |
| `sandbox.test.ts` | 94 | 7 | `eval sandbox script (deterministic prepare/clean)` |
| `migration-grade.test.ts` | 87 | 7 | `migration-grade (histogram + deterministic baseline-diff grade)` |
| `sandbox-lifecycle.test.ts` | 80 | 4 | `sandbox lifecycle (extract artifacts, then tear down)` |
| `fixture-coverage.test.ts` | 51 | **4** (A2: 1 — реальный вывод раннера 4) | каждая node-фикстура декларирует `c8` **и** поставляет `scripts/test-coverage.mjs`, и её скрипт `test:coverage` не несёт **ни одного glob-токена** — потому что «the phase receipt fingerprints every path token in verification scripts and rejects globs (`shared/common/repo-path.ts`'s `GLOB_META`)» (chain9); обёртка `.mjs` держит это одним точным файловым токеном |
| `judge.test.ts` | 34 | 3 | `parseVerdict` |
| `quality-gate.test.ts` | 27 | 3 | `parseSddCheckResult (R1, both outcomes)` |
| `fixtures/p9-misunderstood-cases.json` | 75 | — | ограниченные калибровочные данные P9 |

**Единственный красный кейс на HEAD `11291af5`** (наблюдение верификатора, отсутствовавшее в A2):

```
not ok 14 - provisioner gives fixture scenarios unique isolated directories
  location: ai/flow-eval/__tests__/harness.test.ts
  error: 'gennady dist is missing at <R>/dist; run npm run build first'
  stack: findGennadyRoot (ai/flow-eval/provision.ts:1127:11)
```

На чистом чекауте без `npm run build` один из 84 кейсов красный по причине окружения (нет `dist/`) — фактическое состояние 83 pass / 1 environment-fail, а не «75 зелёных кейсов». Этот класс дефекта устранён коммитом `3d5f66a7` (см. врезку ниже).

### 6.6 Документация

| Документ | LOC | Содержание |
|---|---|---|
| `README.md` | 71 | что это, карта документации, таблица связей, единственная каноническая команда `npm run sdd-flow-eval`, дефолты кода vs то, что реально запускаем, набор регрессии на подделках |
| `RUNBOOK.ru.md` | 211 | как запускать — настройка сервера, env, процедура live-прогона, чтение наблюдений, правила вердикта, грабли (вкл. заметку о последовательном батче: параллельные сессии авторинга перегружают один тестовый сервер) |
| `WRITING-EVALS.ru.md` | 158 | как добавить eval — форма сценария, анатомия фикстуры, правила passability покрытия, контракт судьи, шаг за шагом |
| `QUALITY-RULES.ru.md` | 65 | бэклог R1–R6 + дисциплина both-outcomes + план набора brownfield-евалов (E-bf-recover · E-bf-delta · E-bf-delta-to-spec · E-bf-via-spec) |
| `ROADMAP.ru.md` | 77 | план вперёд |
| `PROGRESS-REPORT.ru.md` | 125 | отчёт до→после для коллег |
| `EXPERIMENTS-LOG.ru.md` | 262 | журнал экспериментов прогон-за-прогоном (на него ссылается `migration-grade.ts`, объясняя, почему планка — baseline-diff) |
| `INFRA-TASKS-RESEARCH.ru.md` | 58 | исследование за фикстурами infra `task` |
| `P9-UNDERSTANDING-SIGNIFIERS.md` / `P9-VERIFICATION.md` | 43/50 | калибровка сигнификаторов непонимания P9 |
| `docs/flow-verification-redesign.md` | 167 | план: «the whole SDD stack guards against a **fraudulent DONE** … but nothing catches an **abandoned artifact**»; слепые пятна H1–H4 по слоям; предложение `AX_PHASE_VERIFIED_BEFORE_CLOSE`; упорядоченный план фикса |
| `docs/flow-verification-ledger.md` | 91 | append-only журнал: **A1–A6 подтверждены**, **B1–B10 опровергнуты/отклонены** (вкл. B1 — одна универсальная аксиома над всеми фазами, B2 — audit receipt при `sdd-log close` = дедлок, B4 — sidecar-файл, B5 — git-note), **C1–C5 приняты**, **D-метрики** (`tool_calls_total`, `steps`, `impl_receipt`, `audit_receipt`, `review_receipt`, `bench_soft`, `stuck`, правило non-regression, `.results/metrics-ledger.jsonl`), **E1–E3 приземлены + продолжение** (E3: миграция должна эмитить `PHASE_RECEIPTS:v1`, иначе групповое принуждение остаётся grandfathered off — открыто) |
| `docs/roundtrip-wall3-assessment.md` | 79 | находки round-trip (**одно из двух мест, где вообще упоминается `gennady.yaml`**, §1.2) |
| `docs/swiftlint-toolchain-setup.md` | 61 | headless-тулчейн Swift 6.2 для round-trip бенча — **единственный выделенный Swift-документ в репозитории** (Swift также упоминается в `roundtrip-wall3-assessment.md`, `scripts/roundtrip-eval.sh`, `scripts/roundtrip-grade.sh`, `scripts/session-metrics.py`, `scripts/roundtrip-readiness-shim.package.json`) |

### 6.7 Честная матрица покрытия — фаза потока / проблемная группа × {LLM-сценарий · детерминированный тест · ничего}

| Фаза потока / проблемная группа | LLM-сценарий (`scenarios.json`) | Детерминированный тест | Вердикт |
|---|---|---|---|
| Классификация intent роутера / маршрутизация `LOGIC_SWITCH` | **нет** | `cli/__tests__/directive-tool-contract` (только форма вызова, не маршрутизация) + `ai/flow-sim` (вручную, человеком) | **ничего автоматического** |
| Авторинг спеки → approval #1 | ✅ `fibonacci-library` (масштаб `function`) | `ai/kit/stateless-sdd-flow-contract.test.ts` (только текст контракта) | только LLM, 1 сценарий, наименьший масштаб |
| Декомпозиция модулей | **нет** | `shared/sdd/module-specs.test.ts`, `check-*` | нет сквозного |
| Авторинг infra-скоупа / решение о тулстеке | **нет** | — | **ничего** |
| Авторинг interface-скоупа | **нет** | — | **ничего** |
| Scaffold → approval #2 | ✅ `tic-tac-toe` | `project-feasibility.test.ts`, `phase-verification-plan.test.ts`, `templates.test.ts`, `skeleton-*.test.ts` | и то, и другое |
| Execute (один тикет, канонический) | ✅ `slugify-toolchain` (**без поля `acceptance`** — судья работает только по intent) | тесты команд `sdd-task`/`sdd-verify`/`sdd-log`, `phase-receipt.test.ts`, `group-receipt.test.ts` | и то, и другое, но LLM-сценарий без якоря |
| Execute-батч / очередь нескольких тикетов | **нет** | `sdd-task.cmd.test.ts` (карта исполнения) | нет сквозного |
| Audit (группа / по тикету) | **нет** | `audit-group.test.ts`, `group-receipt.test.ts`, `phase-receipt-check.test.ts` | только детерминированное — нет LLM-оценки суждения аудита |
| Code-review | **нет** | **нет вообще** (`find` по `*code-review*` даёт только скилл, директиву и её `.hbs`) | **ничего** |
| Reconcile (`fix` / `from-code`) | **нет** | — | **ничего** (только карты `ai/flow-sim/S8`, `S9` вручную) |
| Repair (`sdd-check` красный → чистый) | ✅ `broken-specs-repair` | `check*.test.ts` (**22** файла в `shared/sdd/__tests__`, не 28) | и то, и другое |
| Банальный infra-таск (bash/Makefile) | ✅ ×3 (`infra-log-summary`, `infra-rotate-logs`, `infra-makefile`) | `infra-golden.test.ts` (3 top-level, оба исхода) | и то, и другое |
| Brownfield code delta / bug fix | **нет** | `brownfield-golden.test.ts` (6, оба исхода) | только golden — фикстуры поставлены, сценария нет |
| Brownfield восстановление спеки (`recover-spec`, `delta-to-spec`, `modify-via-spec`, матрица S1/S2) | **нет** | `brownfield-spec-golden.test.ts` (19, оба исхода) | только golden |
| Миграция v1→v2 | **нет в `scenarios.json`** (фаза + режим объявлены; гоняется `scripts/migration-eval.sh`) | `migration-grade.test.ts` (7), `sdd-migrate.cmd.test.ts`, тесты migration-plan/move/id-replace/anchor-inject | логика оценки протестирована; эталонного LLM-сценария нет |
| Bootstrap готовности (`not-ready` → 8 npm-кирпичей) | **нет** | `readiness.test.ts`, `gate-queue.test.ts` | только детерминированное |
| Discover-from-code (brownfield масштаба проекта) | **нет** | — | **ничего** |
| Качество critic / семантического ревью | **нет** | — | **ничего** (по природе) |
| Собственная корректность харнесса (observer, runner, judge, sandbox, evidence) | — | **39** кейсов (`harness` 22 + `sandbox` 7 + `sandbox-lifecycle` 4 + `judge` 3 + `quality-gate` 3; A2 заявлял 46) | хорошо покрыто |
| Не-Node стеки (python / golang / swift / anystack) | **нет** | **нет** (только `docs/swiftlint-toolchain-setup.md`, заметка о ручном бенче) | **ничего** |

Агрегат: 7 LLM-сценариев покрывают 5 из 7 объявленных фаз; **84** (не 75) детерминированных кейса; 8 поверхностей потока (авторинг infra, авторинг interface, code-review, reconcile, discover-from-code, батч-execute, декомпозиция модулей сквозным образом, маршрутизация роутера) **не имеют вообще никакого автоматического покрытия**.

### 6.8 `ai/flow-sim/**` и `ai/inspector/**` (кратко)

**`ai/flow-sim`** — 13 markdown-файлов, 4 123 LOC, **ни кода, ни npm-скрипта**. Обоснование (`README.md:3-6`): юнит-тесты покрывают `cli/cmd/*` и `shared/sdd/*`, но «директивы … не код: они читаются и «исполняются» агентом-интерпретатором», так что единственный способ проверить, что `LOGIC_SWITCH` маршрутизирует верно, `STOP` держится, и не загружается директива, которая не должна быть загружена, — живой прогон на замороженном сценарии. `PROTOCOL.md` определяет три роли — **Executor** (дешёвая модель, слепой прогон, получает карту сценария с вырезанным `## Checkpoints`), **Verifier** (полная карта + TRACE + `git diff`, вердикт `CONFIRMED`/`VIOLATED` со свидетельствами плюс секция «Импровизации»), **Arbiter** (вручную: дефект директивы vs слабость исполнителя). 11 карт сценариев волны 1: `S1-route-new-scope`, `S2-preflight-migration`, `S3-preflight-carveout`, `S4-discover`, `S5-recover`, `S6-scaffold-ticket`, `S7-execute-lifecycle`, `S8-reconcile-trivial`, `S9-reconcile-from-code` (670 LOC, самая крупная), `S10-multi-scope-route` (213), `S11-migration-full`. Полностью человеко-оркестрован — ничто в `npm test` его не запускает.

**`ai/inspector`** — обычный инструмент на TS + статичном HTML («**Не через SDD.** Это обычный инструмент»): `core/` (чистый, без DOM) парсит реальные `ai/skills/*/SKILL.md` и `ai/directives/sdd-v2/*.directive.xml` в дерево `TraceNode` (`model.ts`, `parse-directive.ts`, `parse-skill.ts`, `resolve.ts` — рекурсивное раскрытие `READ_AND_USE` с остановкой цикла, `scan.ts`), `generate.ts` пишет `web/trace.json`, `web/` (index.html + app.js + markdown.js + debug.js + styles.css) рендерит раскрывающееся дерево, `e2e/inspector.spec.ts` — Playwright-проверка. Тесты: `core/__tests__/{parse-directive,parse-directive-lazy,parse-skill}.test.ts` + `web/__tests__/{debug,markdown}.test.ts` (запускаются `npm run inspector:test`, **не** `npm test`). Заявленная аудиторская ценность: «Парсер — общий (любой скил/директива); где спотыкается — это и есть находка аудита.»

### Врезка: изменения после `11291af5`

В основном репозитории `<G>` поверх RC-tip есть два коммита, оба в `ai/flow-eval/**`. Директив, `shared/sdd`, `cli/cmd`, `ai/kit` они не касаются — то есть §§1-5, 7, 8, 9 этого документа они не меняют.

**`95329c19 feat(flow-eval): R-COMPLETE quality rule — reads DONE+round+group receipts from disk (H1 fix), opt-in via scenario.completion`** (5 файлов, +170/−3: `ai/flow-eval/quality-gate.ts` +84, `__tests__/quality-gate.test.ts` +66, `cli.ts` +11, `types.ts` +5, `scripts/roundtrip-eval.sh` +7). Добавлены `parseCompletion()` и `checkCompletion()`, эмитирующие `rule: 'R-COMPLETE'` — утверждение «There is no `R-COMPLETE` rule» верно только на `11291af5` и опровергнуто на `95329c19`. «Единственные два объективных id гейта» стало **три**: `R1`, `MIGRATION`, `R-COMPLETE`. `CompletionSignals` = `{artifactExists, ticketDone, roundClosed, auditReceipt, reviewReceipt}`; правило красное, если артефакт создан, но не хватает любого сигнала; `checkCompletion` в `cli.ts:266-273` — **решающий над R1** («a failing R-COMPLETE is decisive over R1 (structure clean ≠ work finished)»). В `SddEvalScenario` (`types.ts`) добавлено опциональное поле `completion?: { artifact: string; ticket: string; spec: string }` — opt-in, `scenarios.json` не менялся, так что таблица §6.2 остаётся верной для HEAD `11291af5` и после этого коммита.

**`3d5f66a7 fix(flow-eval): sandbox always gets the fresh local dist — materializeLocalCli refreshes dist/ai/shim (not blanket-skip), runner rebuilds first; deterministic test`** (3 файла, +89/−8: новый `ai/flow-eval/__tests__/provision-gennady.test.ts` +67, `provision.ts` +25/−8, `scripts/roundtrip-eval.sh` +5). Число файлов в §6.5 «10 files, 2 031 LOC» после этого коммита становится 11 файлов, LOC и число кейсов ещё выросли. Единственный красный кейс на `11291af5` (`gennady dist is missing … run npm run build first`, `provision.ts:1127`) — именно тот класс, который здесь устранён: `materializeLocalCli` теперь обновляет `dist`/`ai`/шим вместо blanket-skip, а раннер сначала пересобирает.

---

## 7. Self-hosting — собственное состояние SDD у gennady

**Репозиторий, поставляющий SDD v2, сам всё ещё на v1.** `sdd-state` сообщает `FLOW_VERSION=v1` и `NEXT=migrate the v1 task layout before entering the v2 scaffold flow`.

### 7.1 Раскладка

| Дерево | Счётчик | Заметки |
|---|---|---|
| `specs/` | 86 файлов, 12 каталогов-скоупов + `README.md` (портал) + `3-tasks.md` (индекс проекта) | У каждого скоупа есть `.spec.md`; `agent-inbox` (19 файлов), `cli` (25), `ai-skills` (13), `agent-mon` (7), `vcs` (6), `agent-mon-cli` (4), `dbc` (3), `agent-run` (3), `infra-base`/`infra-npm-publish`/`mr-stats`/`shared` (по 1) |
| `tasks/` (v1-раскладка) | 138 файлов, **127** тикетов `*.task-*.md` | `cli` 48 · `agent-inbox` 27 · `vcs` 16 · `dbc` 15 · `agent-mon` 7 · `agent-mon-cli` 4 · `infra-npm-publish` 4 · `agent-run` 3 · `mr-stats` 2 · `ai-skills` 1 |
| v2-тикеты под `specs/` (`*.task.<ID>.md`) | **1** | `specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md` |
| Индексы `*.3-tasks.md` | 3 | `specs/3-tasks.md` (проект), `specs/ai-skills/ai-skills.3-tasks.md` (скоуп), `specs/ai-skills/directive-assembly/directive-assembly.3-tasks.md` (модуль) |

Все счётчики в этой таблице (86/12, 138/127, разбивка по скоупам 10/10, единственный v2-тикет, 3 индекса) проверены верификатором построчно и совпали ровно.

`specs/3-tasks.md` (индекс проекта) прямо это заявляет:
- Scope Tracker: у 11 из 12 скоупов Index `—`, Tasks `0`, Done `0/0`; только у `ai-skills` есть индекс с `1` таском, `0/1` done.
- Комментарий: «Scopes without a v2 `Index` here still carry legacy v1 tickets under `tasks/<scope>/` — untouched by this scaffolding run, out of its blast radius (`ai-skills/directive-assembly` only).»
- Комментарий: «no cross-scope integration tickets exist yet — this scaffolding run only decomposed `ai-skills/directive-assembly`.»
- `PROJECT-TASKS-D-1`: «первая v2-задача проекта (`specs/3-tasks.md` не существовал до этого прогона); скаффолдинг ограничен модулем `directive-assembly` скоупа `ai-skills` — остальные 11 скоупов остаются на legacy v1-раскладке (`tasks/<scope>/`), не мигрируются этим прогоном».

Также несёт проектные конвенции, наследуемые каждым тикетом: **Baseline Completion Rule** (Round не может стать `[x] DONE`, пока не `[x]` каждая фаза, каждый BDD-сценарий не отображён на тест или `Deferred Test Ownership`, команды верификации не прогнаны с записанным exit-кодом, каждая сущность сверх Inventory не залогирована `intro …`, и строка Handoff не закрывает каждую фазу), **словарь токенов Execution-Log** (`intro` · `decision` · `tried` · `discovery` · `insight` · `verified` · `ver` · `BLOCKED` · `DONE`, причём «A `[x]` line with an unreplaced `<…>` placeholder is fabricated (BLOCKER)»), и **пост-тасковый хук** («until PASS the round is closed-but-unverified and dependents are blocked»).

### 7.2 Снимок `sdd-state .` (перезапущено read-only)

```
FLOW_VERSION=v1
PORTAL=present  specs/README.md
[READINESS] package.json ✔ · all 8 required scripts ✔ · lint→gennady ✔ · check→read-only ✔ · gennady-installed ✔
READINESS=ready · AUTHORING_READY=no · EXECUTION_READY=yes · GATE_QUEUE=none
NEXT=migrate the v1 task layout before entering the v2 scaffold flow
[SPEC_SCHEMA] VERSION=sdd-v2 · STATUS=current · all observed scope/module specs are current
[SCOPES] 12 — 10 done, agent-inbox wip, mr-stats wip
[GRAPH] L0 infra-base · L1 agent-mon, agent-run, dbc, infra-npm-publish, shared, vcs · L2 agent-mon-cli, cli · L3 ai-skills, mr-stats · L4 agent-inbox
[PROBE] CODE=present 1382 file(s) · code-dirs ., ai, cli, e2e, scripts, services, shared, test, utils · INFRA=present · configs tsconfig.json, .prettierrc.json, vite.config.ts
```

Внутреннее напряжение подтверждено воспроизведением: `READINESS=ready` и `EXECUTION_READY=yes`, но при этом `AUTHORING_READY=no`, и диагностика по версии потока блокирует путь v2-scaffold.

### 7.3 `sdd-check --all .` — перезапущено read-only, exit **1**

Команда: `sh -c 'cd <R> && node --import tsx cli/gennady.ts sdd-check --all .'`. Итоговая строка воспроизвелась байт-в-байт:

```
[sdd-check] 198 error(s), 431 warning(s) across 212 file(s)
next: исправь перечисленные файлы в текущем владеющем шаге и повтори ту же команду; `/sdd-reconcile` нужен только для drift уже утверждённых артефактов.
next: язык — калька за калькой, по месту (`file:line`) правь всё предложение целиком.
```

Строки находок по деревьям: **507 под `tasks/`** (немигрированная v1-половина) vs **122 под `specs/`** — обе цифры воспроизведены точно.

| Ошибки (198 всего) | n | Дерево |
|---|---|---|
| `SDD_VERIFICATION_TABLE_INVALID` | 47 | 46 `tasks/`, 1 `specs/` |
| `SDD_FABRICATED_DONE` | 44 | весь `tasks/` |
| `SDD_BDD_REQUIREMENT_UNTRACED` | 37 | весь `specs/` |
| `SDD_DEP_UNRESOLVED` | 18 | `tasks/` |
| `SDD_SECTION_OVERLAP` | 9 | 7 `tasks/`, 2 `specs/` |
| `SDD_RESEARCH_DISPOSITION_MISSING` | 6 | `specs/` |
| `SDD_BROKEN_SPEC_REF` | 6 | `tasks/` |
| `SDD_TRACKER_STATUS_DRIFT` | 5 | `tasks/` |
| `SDD_PHASE_SECTION_ORPHAN` | 4 | `tasks/` |
| `ERR_CLI_SDD_CHECK_READ_FAILED` | 4 | `tasks/` |
| `SDD_TASK_ID_COLLISION` | 3 | `tasks/` |
| `SDD_ANCHOR_UNBALANCED` | 3 | 2 `tasks/`, 1 `specs/` |
| `SDD_SPEC_SECTION_MISSING` | 2 | `specs/` |
| `SDD_PHASE_DEP_UNRESOLVED` | 2 | `tasks/` |
| `SDD_DIAGRAM_INVALID` | 2 | `tasks/README.md:122`, `tasks/cli/README.md:101` — метки mermaid с неэкранированными `(`/`:` |
| `SDD_RULES_CASCADE_UNRESOLVED` · `SDD_PHASE_SECTION_MISSING` · `SDD_MODULE_DAG_CYCLE` · `SDD_DONE_WITH_ACTIVE_BLOCKER` · `SDD_DIAGRAM_CAPTION_MISSING` · `SDD_BDD_MISSING_NEGATIVE` | по 1 | `SDD_MODULE_DAG_CYCLE` — это `specs/agent-inbox/agent-inbox.spec.md` («module dependency graph (## 9) has a cycle») |

Обе гистограммы (21/21 позиция для ошибок, сумма 198; 18/18 для предупреждений, сумма 431) совпали построчно.

| Предупреждения (431 всего) — топ | n |
|---|---|
| `SDD_BDD_COVERAGE_ROW_UNPARSED` | 140 |
| `SDD_LEGACY_TICKET_UNANCHORED` | 76 (v1-тикеты без якорей `<!--SECTION:…-->` — именно то, что чинит `sdd-migrate anchors`) |
| `SDD_BDD_SCENARIO_UNTESTED` | 70 |
| `SDD_TRACKER_MISSING_ROW` | 37 |
| `SDD_MODULE_NO_CALL_CHAIN` | 26 |
| `SDD_DIAGRAM_CAPTION_MISSING` | 15 |
| `SDD_MODULE_NOT_IN_INDEX` | 11 (весь — `specs/cli/cli.spec.md`, 11 module-спек CLI отсутствуют в родительской Module Map: `sdd-check`, `sdd-extract`, `sdd-log`, `sdd-migrate`, `sdd-new`, `sdd-state`, `sdd-sync`, `sdd-task`, `sdd-verify`, `testcov`, `yagni`) |
| `SDD_DONE_WITH_PLACEHOLDERS` | 11 |
| `SDD_BROKEN_SPEC_ANCHOR` | 11 |
| `SDD_MODULE_OVERSIZED` · `SDD_LANGUAGE_CALQUE` | по 9 |
| `SDD_DL_LEGACY_ID` | 4 |
| `SDD_SCOPE_DEP_UNDECLARED` · `SDD_BDD_TESTFILE_AMBIGUOUS` | по 3 |
| `SDD_TRACKER_ORPHAN_ROW` · `SDD_RESEARCH_UNREGISTERED` | по 2 |
| `SDD_STATUS_UNPARSEABLE` · `SDD_MISSING_TASK_ID` | по 1 |

**Честное прочтение.** 44 `SDD_FABRICATED_DONE` + 46 `SDD_VERIFICATION_TABLE_INVALID` + 76 `SDD_LEGACY_TICKET_UNANCHORED` — структурные следствия v1-раскладки, которую `sdd-migrate` и существует чинить; это унаследованный долг, и по собственной планке `migration-grade.ts` они не завалили бы миграцию. По-настоящему v2-сторонние находки — 37 `SDD_BDD_REQUIREMENT_UNTRACED`, 6 `SDD_RESEARCH_DISPOSITION_MISSING`, 11 `SDD_MODULE_NOT_IN_INDEX` и 1 `SDD_MODULE_DAG_CYCLE` в `specs/` — то есть поставленные спеки не проходят собственный чекер CLI, который навязывается потребителям. Значит, RC **не self-hosts поток v2**: 1 из 128 тикетов — v2, 1 из 12 скоупов имеет v2-индекс, а `sdd-check --all` красный на собственных `specs/` проекта.

---

## 8. Топология тестов

### 8.1 `scripts/test-topology.ts` (360 LOC) — исполняемый раннер за `npm test`

Четыре **непересекающихся и исчерпывающих** слоя (`TEST_LAYERS = ['unit','contract','local','external']`, `:10`, дословно). `assertTopology` (реально `:197`, не `:196-213`) бросает `[test-topology] invalid classification:`, если любой обнаруженный тест неклассифицирован **или** попадает сразу в два слоя — так что классификация является жёстким инвариантом, а не конвенцией.

`discoverTests` (`:156-167`) обходит `TEST_ROOTS = ['ai','cli','services','shared']` (`:19`) в поисках `*.test.ts` и отбрасывает: всё под `/agent-inbox/`, `/serve/__tests__/`, `.integration.test.`, `.real-integration.test.`, плюс `V2_GATE_EXCLUDED_NAMES = {http-server.test.ts, eval-driver.test.ts, reviewer.e2e.test.ts, full-flow.blackbox.test.ts, run-mode.test.ts, harness.test.ts}` (`:25-34`). Исключение `harness.test.ts` документировано дословно: он провижинит три фикстурные песочницы и спавнит CLI eval + type-check в каждой, так что «under c8 coverage instrumentation this deterministically exceeds the offline commit gate's per-test budget and cancels — not a real failure. It keeps its home in `npm run test:sdd-flow-eval`.»

`classifyTest` (`:175-194`), побеждает первое совпадение:

| Слой | Правило |
|---|---|
| `external` | путь содержит `/e2e/` или `.e2e.test.` |
| `contract` | `ai/kit/__tests__/*` (не e2e) · `/directive-tool-contract/` · имя файла содержит `contract` · `shared/common/__tests__/test-topology.test.ts` |
| `local` | `/tool-behavior/` · `services/remote-console/` · `services/agent-mon/providers/claude/__tests__/ps.test.ts` · `.integration|.blackbox|.observation.test.` · **либо** любое попадание `LOCAL_BOUNDARY_SIGNALS` в исходнике (`:131-139`): реальный импорт `child_process` · импорт сетевого модуля (`http\|https\|net\|tls\|dgram\|undici`) · loopback-сервер `createServer(`/`.listen(` · `setupMockAgent` · loopback-клиент `http(s)://127.0.0.1\|localhost` · `createGitFixture` · заголовок `@file: Integration test` |
| `unit` | начинается с одного из `UNIT_ROOTS = ['ai/flow-eval/','ai/inspector/','cli/','services/','shared/','utils/']` (`:38-45`) |

Партиционирование покрытия (`coveragePartitions`, реально `:222`, не `:221-237`): **`observed`** = `unit + contract` под c8 («c8 observes production code»); **`black-box`** = `local + external` без c8 («no c8: subprocess boundary»). Каждый файл прогоняется ровно один раз.

Герметичные гарантии:
- режим `unit` инжектит **сетевой guard** как модуль `data:text/javascript` `--import`, заменяющий `fetch`, `WebSocket`, `http/https.request/get`, `net.connect/createConnection`, `net.Socket.prototype.connect`, `tls.connect`, `dgram.createSocket` бросателями с `ERR_TEST_UNEXPECTED_NETWORK` (`:83-116`);
- режим coverage инжектит guard дочернего окружения, который очищает `NODE_V8_COVERAGE` для спавненных детей, «preventing its later CLI/git/npm children from emitting irrelevant raw profiles»;
- `createTestEnvironment` скрабирует 40 именованных `SENSITIVE_TEST_ENV_KEYS` (GitLab/GitHub/OpenAI/Anthropic/Google/AWS/Azure/npm-токены, `GIT_ASKPASS`, `SSH_ASKPASS`, …) плюс всё, совпадающее с `CREDENTIAL_ENV_KEY` или `NPM_AUTH_ENV_KEY`; external-слой — opt-in через `EXTERNAL_TEST_OPT_IN_ENV_KEYS = ['GENNADY_E2E','GENNADY_OPENCODE_INTEGRATION']` (`:46`);
- `OUTER_TEST_CONCURRENCY = 6` (реально `:24`, не `:23`), потому что «several local suites launch real CLI/npm/git subprocesses, and sdd-verify already overlaps four fixture CLIs internally».

**Живой вывод `check`** (перезапущено read-only, совпало байт-в-байт):
```
unit=211 contract=16 local=51 external=8
coverage observed=227[unit+contract] black-box=59[local+external]
```
→ **286 тест-файлов** в гейте.

Режимы (`help`, `:302-...`): `unit` (только быстрый герметичный слой) · `deterministic` (все четыре слоя, без c8) · `coverage` (весь корпус один раз: unit+contract под c8, local+external без) · `check` (проверить дизъюнктность + исчерпаемость классификации, напечатать счётчики) · плюс поштучный режим листинга `layer	file`.

### 8.2 Композиция `npm test` и окружающих скриптов

| Скрипт | Команда | Что покрывает |
|---|---|---|
| `test` | `node --import tsx scripts/test-topology.ts deterministic` | все 286 файлов, четыре слоя, без покрытия |
| `test:coverage` | `… test-topology.ts coverage` | две партиции, c8 только на `observed` |
| `test:topology` | `… test-topology.ts check` | инвариант классификации |
| `test:unit` | *(не определён в `package.json` — режим `unit` достижим только прямым вызовом скрипта)* | — |
| `test:e2e` | `GENNADY_E2E=1 node --import tsx --test --experimental-test-module-mocks cli/__tests__/e2e/*.test.ts` | **7** (не 6, как в A2 — сам перечисленный список из 7 имён был верен) e2e-сьютов: `e2e.test.ts`, `lint.e2e.test.ts`, `orient.e2e.test.ts`, `real-toolchain.e2e.test.ts`, `sdd-extract.e2e.test.ts`, `sync-skills.e2e.test.ts`, `sync.e2e.test.ts` (+ `fixtures/`, `setup.ts`) |
| `test:integration` | явный список файлов под `services/agent-inbox/**` + `services/mr-stats/**`, `--test-concurrency=2` | интеграция agent-inbox / mr-stats — **исключена из `npm test` через `discoverTests`** |
| `test:sdd-flow-eval` | `node --import tsx --test ai/flow-eval/__tests__/*.test.ts` | 84 кейса flow-eval вкл. `harness.test.ts` (исключён из основного гейта) |
| `inspector:test` | `node --import tsx --test ai/inspector/core/__tests__/*.test.ts ai/inspector/web/__tests__/*.test.ts` | inspector — **не в `npm test`** |
| `inspector:e2e` / `test:e2e:review-flow` | `playwright test --config=ai/inspector/playwright.config.ts` / `--config=e2e/inbox-serve/playwright.review-flow.config.ts` | Playwright; `e2e/inbox-serve/**` держит 34 spec/helper-файла + 4 playwright-конфига + `CHECKLIST.md` — ничего из этого не в `npm test` |
| `test:watch` | `tsx --test-loader 'cli/**/*.test.ts' 'shared/**/*.test.ts' 'services/**/*.test.ts'` | цикл разработки |
| `check` | `tsx cli/gennady.ts sdd-verify --profile full` | read-only лестница: `type-check · test:coverage · lint · format · yagni` (§2) |
| `prepublishOnly` | `npm run lint && npm run test:e2e && npm run build:publish` | **заметка: НЕ запускает `npm test`** — только lint + e2e + build |
| `audit:sdd-templates` | `check:directives-fresh && audit:axioms && audit:contracts && audit:halts && check:directive-budgets` | 5 гейтов kit (§3.3) |
| `prepare` | `[ -d .git ] && git config core.hooksPath scripts/git-hooks \|\| true` | устанавливает путь хука |

Строка `format` в `package.json` — полная команда `prettier --check . --cache --cache-strategy content` (read-only характер сохранён; в A2 приведена без флагов кэша).

**Разрыв покрытия**: `npm test` исключает `harness.test.ts` (крупнейший сьют flow-eval), весь `services/agent-inbox/**`, `serve/__tests__`, каждый `*.integration.test.*`, и все Playwright-спеки. `prepublishOnly` не запускает ни `npm test`, ни `audit:sdd-templates`, так что публикация может выпустить дерево директив, которое не проходит `check:directives-fresh`.

### 8.3 `scripts/git-hooks/pre-commit` (7 077 байт, единственный хук)

Устанавливается через `prepare` → `git config core.hooksPath scripts/git-hooks`. Позиция дизайна: **«VERIFY-ONLY, never mutate.»** Обоснование — реальный инцидент: «A pre-commit hook that rewrites files (prettier --write, autofix) but does not re-stage them lets the commit capture the pre-fix bytes while `prettier --check` passes over the already-fixed working tree — a green hook over a dirty commit (this repo hit exactly that).»

Три механизма:
1. **Скраб env** — `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR` (дословно на `:8`) до чего-либо ещё, потому что унаследованные git-переменные окружения перенаправляли вызовы `git init` фикстур в реальный репозиторий («observed live: `git init` in a fixture re-initialized the shared .git as bare, and fixture commits landed on the real branch»).
2. **Index-aware guard** — `git status --porcelain=v1 --untracked-files=all` (`:61-68`), отфильтрованный `awk` так, чтобы принимать только чисто застейдженные записи (колонка 2 пуста), и отвергать любое изменение рабочего дерева или неотслеживаемый файл: «Гейт проверяет рабочее дерево, а commit запишет ИНДЕКС» (дословно).
3. **Шесть последовательных гейтов** (`:72-77`), каждый со своим сообщением `fail <gate>`: `npm run check` → `npm run check:directives-fresh` → `npm run audit:axioms` → `npm run audit:contracts` → `npm run audit:halts` → `npm run check:directive-budgets`.

Баннер отказа — длинная русскоязычная инструкция, адресованная коммитящему *агенту*: `--no-verify` / `-n` / любой обход через wrapper, env или alias — «ЗАПРЕЩЕНО», как и «починю следующим коммитом»; разрешены только два пути — починить причину (`npm run fix && git add -u`) или остановиться и сообщить оператору дословно. Закрывающая строка: «Красный гейт — не преграда на пути к цели. Красный гейт И ЕСТЬ работа, которую надо сделать.»

Заметка о композиции: `npm run check` = `sdd-verify --profile full`, который сам запускает `test:coverage` → `test-topology.ts coverage`. Так что commit-гейт транзитивно прогоняет все 286 файлов гейта плюс пять аудитов kit, но **не** `test:e2e`, `test:integration`, `test:sdd-flow-eval` и ни один Playwright-сьют.

### Материальный пропуск A2: `TEST_ROOTS` не покрывает `utils/` и `test/`

`UNIT_ROOTS` (`test-topology.ts:38-45`) содержит `'utils/'`, но `TEST_ROOTS` (`:19`) — только `['ai','cli','services','shared']`, а `discoverTests()` обходит исключительно `TEST_ROOTS`. Следствие:

- `utils/test/__tests__/mock-http.test.ts` и `utils/test/__tests__/git-fixture.test.ts` (2 файла) **никогда не обнаруживаются** — ветка классификации `'utils/'` в `classifyTest` (`:193`) недостижима (мёртвый код);
- вся верхнеуровневая директория `test/` — **23** файла `*.test.ts` под `test/agent-inbox/**` (включая `.contract.test.ts` и `.integration.test.ts`) — не попадает в гейт вообще, ни через `TEST_ROOTS`, ни через какой-либо из четырёх фильтров `discoverTests`, ни через `V2_GATE_EXCLUDED_NAMES`.

Итого **25** тестовых файлов вне `npm test` по причине, которую A2 не назвал: §8.1 A2 цитирует и `TEST_ROOTS`, и `UNIT_ROOTS` корректно, но их несогласованность не отмечена, а дерево `test/` в §8 не упомянуто ни разу (появляется только неявно в §10.2, где A2 в списке изменённых областей пропустил строку `test/agent-inbox 23` — см. §10 ниже).

---

## 9. ТОЧКИ РАСШИРЕНИЯ И ПЕРЕСЕЧЕНИЯ

### 9.1 Куда должен подключаться per-stack пресет (node / golang / anystack / python / swift)

В RC **нет никакой абстракции стека**. Ниже — каждое место, которое пришлось бы менять, с точным зашитым Node-допущением. `Точка подключения сегодня` = уже ли есть реестр/инъекционный шов (✅) или это литерал (❌).

| Поверхность | File:line | Node-допущение сегодня | Шов? |
|---|---|---|---|
| **Словарь readiness-гейтов** | `shared/sdd/readiness.ts:15-24` | `REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix']` — буквальные имена npm-скриптов; единственный алиас `type-check`↔`typecheck` (`SCRIPT_ALIASES`, `:30-32`) | ❌ модульный `const` |
| **Источник входа readiness** | `shared/sdd/readiness.ts:596-609` | `gatherReadinessInput(root)` читает **только** `<root>/package.json` `.scripts` | ❌ |
| **Проба «gennady установлен»** | `shared/sdd/readiness.ts:572-591` | `node_modules/.bin/gennady` ИЛИ `package.json name === 'gennady'` | ❌ |
| **Детекция read-only/mutating переключателя** | `shared/sdd/readiness.ts:260-291` | зашивает `eslint --fix`, `prettier --write`, `--autofix`, `--write`, `--fix` | ❌ |
| **`lint` должен доходить до `gennady`** | `shared/sdd/readiness.ts:176` (`scriptReachesGennady`) / `:199` (`lintReachesGennady`) | переходит только через `npm run` / `pnpm` / `yarn` | ❌ |
| **Классификация скриптов** | `shared/sdd/scripts.ts` | `classifyScript` сопоставляет паттерны `tsc`/`eslint`/`jest`/`vitest`/`prettier`/`biome` над скриптами `package.json` | ❌ |
| **Ранг 4 лестницы готовности** | `shared/sdd/ladder.ts:36-39,68` | ранг «Инфраструктура» = `packageJsonPresent && typecheck && test && lint` | ❌ |
| **Команда verify-гейта** | `shared/sdd/phase-verification-plan.ts:270` | команда буквально `` `npm run ${script}` `` | ❌ |
| **Раннер verify** | `cli/cmd/sdd-verify/sdd-verify.cmd.ts:225-226` | спавнит `{command:'npm', args:['run', scriptName]}` | ❌ |
| **Repair-адаптеры (`format:fix`/`lint:fix`)** | `cli/cmd/sdd-verify/repair-adapters.ts:99,120` | спавнят `npm` | ❌ |
| **Требование argument-forwarding repair-brick** | `cli/cmd/sdd-verify/sdd-verify.cmd.ts:433-451` | каждый не-`setup` профиль требует заявленных `format:fix` / `lint:fix` bricks | ❌ |
| **Отпечаток окружения phase-receipt** | `shared/sdd/phase-receipt.ts:95-320` | понимает вызовы `npm`/`pnpm`/`yarn` + builtins; `SCRIPT_RUNNERS` (`:467-481`) **уже** перечисляет `python`, `python3`, `ruby`, `perl`, `php`, `deno`, `bun`, `bash/sh/zsh`, а на `:948` есть выделенный парсер операнда `go run` — **слой receipt — единственное место, уже многоязычное** | ✅ частично |
| **Вход плана верификации фазы** | `cli/cmd/sdd-task/sdd-task.cmd.ts:495-500` | читает `.scripts` `package.json` | ❌ |
| **Реестр coverage-адаптеров** | `cli/cmd/testcov/coverage-adapter-registry.ts:7` — `COVERAGE_ADAPTERS`, комментарий дословно на `:7`: «Sole registration point; add future platform adapters without changing orchestration»; отбор fail-closed (ровно один должен совпасть; 0 ⇒ `unsupported`, ≥2 ⇒ `ambiguous`, `:20-30`) | зарегистрирован только `istanbulCoverageAdapter`; продюсеры определяются из `package.json`; help говорит «iOS, Android, and Go adapters are not installed/supported yet» | ✅ **самый чистый существующий шов** |
| **Проба репозитория (CODE/INFRA)** | `shared/sdd/probe.ts:12,15-33` | `CODE_EXT = /\.(js\|jsx\|ts\|tsx)$/`; `CONFIG_FILES` = только tsconfig/eslint/prettier/vitest/vite/jest | ❌ |
| **Реестр capability-адаптеров (feasibility scaffold)** | `shared/sdd/capability-adapter.ts:75-190`, комментарий на `:201` (не `:70` — правка верификатора, `:70` содержит другой, тоже релевантный комментарий про injectable adapter lookup): «**new platforms extend this value or inject another registry**» | `DEFAULT_CAPABILITY_ADAPTER_REGISTRY` = `node` (привязан к `ai/directives/infra/nodejs-npm-setup.xml`, артефакты `.nvmrc`, `package.json#engines.node`, `package.json#type`, `.npmrc`, `package-lock.json`), `typescript`, `typescript-quality` (привязан к `ai/directives/infra/eslint-setup.xml`, гейты `test/lint/format`) | ✅ **заявленная точка подключения — больше ничего не зарегистрировано** |
| **Схема Bootstrap Requirements** | `shared/sdd/spec-schema.ts:12-19` | колонки `Requirement\|Kind\|Owner\|Resolution\|Readiness Gates\|Gate Artifacts` — форма стеко-нейтральна, но *значения*, которые мандирует директива infra, — Node-артефакты | ✅ форма / ❌ значения |
| **Анализ символов YAGNI** | `shared/sdd/yagni.ts` + `cli/cmd/yagni/help.ts` | tree-sitter точен только для `.ts/.tsx`; grep-приближение для js/py/go/rb/java | ✅ частично |
| **DbC-линтер** | `cli/cmd/lint/**` (`lint-source-policy.ts`, `checks/`) | только tree-sitter TypeScript; исходники `.ts/.tsx` | ❌ |
| **Артефакты гейта директивы infra** | `ai/directives/sdd-v2/infra.directive.xml:430-432` | «must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`) before that install»; разрешённые чтения `:191` — «`package.json` and equivalents, `tsconfig.json` and equivalents» | ❌ прозаические литералы |
| **Директива readiness** | `ai/directives/sdd-v2/readiness.directive.xml:1,3-22,106-112,209` | целиком `package.json` + `npm i -D` + разобранный npm-скрипт `fix` | ❌ |
| **Реестр правил** | `ai/directives/knowledge.xml` (14 правил) + `ai/directives/{coding,testing,infra}/**` | только TypeScript / Svelte / SvelteKit / node:test / Vitest / Playwright / Storybook / eslint / git / node-npm; ни одного файла правил для python/go/swift/rust (§5.1). Добавление стека означает новые записи `<Rule>` + рёбра `<DependsOn>` + XML-файлы правил, а проект, добавивший их локально, затем перезатирается `gennady sync` (§5.4) | ✅ форма реестра / ❌ пусто для других стеков |
| **Замыкание каскада правил** | `shared/sdd/rules-cascade.ts` | стеко-нейтрален (чистая работа с путями и `<DependsOn>`) — **менять не нужно** | ✅ |
| **Активация правил scaffold** | `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml` — «Signal-based only — the directive carries zero hardcoded language/tool knowledge» | уже корректен по дизайну; просто нечего сопоставлять для не-Node | ✅ |
| **Библиотека аксиом** | `ai/kit/axiom/infra/**` (31) + `svelte` (34) + `storybook` (22) + `uikit` (17) + `e2e` (24) | 97 из 427 аксиом привязаны к одному веб-стеку; `infra/*` явно называет npm/prettier/nvmrc (`ax-single-package-manager`, `ax-npm-agent-sandbox-registry`, `ax-prettier-owns-formatting`) | ❌ |
| **Файл конфигурации проекта** | *(отсутствует)* | `gennady.yaml` **не существует в RC** — упоминается лишь в `ai/flow-eval/docs/roundtrip-wall3-assessment.md` и `ai/flow-eval/scripts/roundtrip-readiness-shim.package.json`. Проекту негде объявить свой стек — каждый факт о стеке выводится из `package.json` | ❌ **недостающий краеугольный камень** |
| **Фикстуры/сценарии flow-eval** | `ai/flow-eval/provision.ts` `FIXTURE_FILES`, `types.ts` `SddEvalFixtureId` | 14 фикстур: 11 Node, 3 bash/Makefile; `fixture-coverage.test.ts` гейтует только фикстуры с `package.json`. Ни python-, ни go-, ни swift-фикстуры; единственный Swift-артефакт — рукописная заметка `docs/swiftlint-toolchain-setup.md` | ❌ |

**Минимальный жизнеспособный набор для одного нового пресета стека** (выведен из таблицы выше): (1) файл конфигурации, чтобы его объявить — не существует; (2) абстракция `ReadinessProfile`, заменяющая `REQUIRED_SCRIPTS` + `gatherReadinessInput` + `scripts.ts` + ранг 4 `ladder.ts`; (3) абстракция gate-runner, заменяющая буквальный `npm run <script>` в `phase-verification-plan.ts:270` / `sdd-verify.cmd.ts:225` / `repair-adapters.ts`; (4) capability-адаптер, зарегистрированный в `DEFAULT_CAPABILITY_ADAPTER_REGISTRY`; (5) coverage-адаптер, зарегистрированный в `COVERAGE_ADAPTERS`; (6) паттерны расширения `probe.ts`; (7) записи `<Rule>` в `knowledge.xml` + XML-файлы правил, плюс защита sync, чтобы проект мог ими владеть; (8) поддерево аксиом; (9) фикстура flow-eval. Пункты (4) и (5) — единственные два с уже существующим заявленным швом.

### 9.2 Пересечения с треками

| Трек | Где v2 его касается | Состояние в RC |
|---|---|---|
| **VERIFY** | `cli/cmd/sdd-verify` (2 856 LOC, 5 модулей) + `shared/sdd/phase-verification-plan.ts` + `phase-receipt.ts` + `phase-receipt-validation.ts` + 4 профиля `setup\|code\|test\|full`. Receipt forge-resistant: атомарный temp+rename с `O_EXCL\|O_NOFOLLOW`, план+env+байты таргета выводятся заново при чтении; `sdd-log complete` без него отказывает | Зрелый и, по мнению журнала, модель для копирования (`docs/flow-verification-ledger.md`, A2). **Прямо сталкивается с `cli/cmd/verify` + `services/stack/gate-runner.ts` в main** — две независимые реализации verify |
| **CHECK-LOG** | `cli/cmd/sdd-check` (1 951 LOC, 100+ кодов `SDD_*`) ничего не пишет; `cli/cmd/sdd-log` (1 443 LOC) — единственный писатель Execution Log / receipts. `--format json` эмитит `gennady.sdd-check.findings.v1`. Жёсткое разделение: check читает, log пишет, verify чеканит receipt | Полное; известное слепое пятно — **брошенный артефакт** (`docs/flow-verification-redesign.md`: каждая находка `SDD_DONE_*` гейтуется на `isDone`, так что «no `SDD_AUDIT_MISSING` / `SDD_PHASE_NOT_CLOSED` / `SDD_EXECUTION_LOG_INCOMPLETE` code exists»). Частично закрыто group-receipt (E1); правило `R-COMPLETE` из коммита `95329c19` (после HEAD инвентаря) закрывает его дальше на уровне eval-гейта — см. §6 |
| **SYNC-OWNERSHIP** | `cli/cmd/sync` (package-owned зеркало `ai/directives/`, удаляет устаревшее, `EXCLUDED_ENTRIES={'architecture'}`) + `cli/cmd/sync-skills` (зеркало `ai/skills/` → `.claude/skills`, без манифеста, подрезает файлы внутри сохранённых скиллов) | **`knowledge.xml` НЕ защищён** (§5.4) — фикс main `f74c8c1d` «knowledge.xml is project-owned — never clobber a project's rule registry» в этой RC отсутствует. У `sync-skills` нет исключения `__tests__` (§5.5). `sync` требует `node_modules/gennady` (`sync-core.ts:65`), как и `agents-rules` (`:19`) |
| **RULES** | `ai/directives/knowledge.xml` (реестр) → `<Triggers>`/`<SkipWhen>`/`<CheckPhase>`/`<RequiresVerification>` → 4-уровневый каскад scaffold (`AX_RULES_CASCADE_RESOLUTION`) → список `Rules:` фазы → замыкание `shared/sdd/rules-cascade.ts` → `SDD_RULES_CASCADE_UNRESOLVED`; `shared/sdd/task-authoring-literals.ts` печатает кортежи в `sdd-new` | Механически завершено и стеко-нейтрально в самой *проводке*; *содержание* — один веб-стек. Найден дрейф: `<CrossRef>` заявляет наследование `testing-common`, но ни один `<DependsOn>` его не декларирует, так что проверка замыкания никогда его не требует. 3 uikit-файла правил (919 LOC) не зарегистрированы в `knowledge.xml`; `ai/directives/architecture/` вообще не содержит правил, хотя Stage B `AX_RULE_ACTIVATION` его обходит |
| **DIRECTIVES-SDD** | 70 XML / 10 075 LOC, сгенерированы из 55 `.hbs` через `ai/kit/build-directives.ts`; delta-assembly + 3 lazy-пилота; 5 kit-аудитов в `audit:sdd-templates`; маркер `.gennady-directive-assembly.json`; `cli/__tests__/directive-tool-contract` привязывает каждый документированный вызов `gennady …` к реальному кейсу диспетчера + верифицированный на фикстуре класс результата | Зрелое. У роутера **нет case маршрута для `readiness` или `recover-from-code`** (§3.1). `formats/change-manifest.xml` рукописный внутри build-managed дерева (выживает только потому, что `check-directives-fresh` обходит список файлов собственной песочницы пересборки) |
| **SKILLS** | 12 `SKILL.md`; 5 идентичных роутинг-загрузчиков (форсированный intent), `sdd-audit`/`sdd-code-review` грузят директиву напрямую без `sdd-state`, `sdd-check` не грузит директиву вообще | **Расходится с набором скиллов main**: в main **16** каталогов `ai/skills` (не 15, как в A2 — сам перечисленный список из 16 был верен): `agent-inbox alt-opinion prd-interview sdd-audit sdd-check sdd-continue sdd-critic sdd-discover sdd-execute sdd-execute-batch sdd-fix sdd-infra sdd-module-decomposition sdd-scaffold sdd-setup workspace-permission-setup` — ни одного из `sdd-continue`/`sdd-discover`/`sdd-execute-batch`/`sdd-fix`/`sdd-infra`/`sdd-module-decomposition`/`sdd-setup`/`alt-opinion` в RC нет. RC-only скиллов **4** (не 3, как в A2 — пропущен `sdd-code-review`): `sdd`, `sdd-reconcile`, `opencode-get-session`, `sdd-code-review` |
| **RELEASE-PACKAGE** | `package.json` `files`, `exports`, `prepublishOnly`, `publish-next`, `.npmignore` | См. таблицу ниже — **большое расхождение** |

### 9.3 RC vs `main` — `package.json` и форма репозитория

Merge-base **`46c6d616`** (2026-06-29, `feat(vcs): unify --vcs-host flag …`). RC (`11291af5`, 2026-09-06) на **535** коммитов впереди merge-base; `main` (`8bb38477`, 2026-09-03) — на **115**. Два независимых трека ~10 недель (оба числа подтверждены `git rev-list --count`).

| Аспект | RC `codex/sdd-v2-rc52-followup` @ `11291af5` | `main` @ `8bb38477` |
|---|---|---|
| `version` | `0.8.4` | `0.9.0-next.3` |
| `imports` | `#snapshot-path-setup`, `#logger`, **`#utils/*`** | `#snapshot-path-setup`, `#logger` |
| `exports` | `"."` → `./services/agent-mon/index.ts` (**исходный** путь, не `dist`), `./providers/claude`, `./providers/opencode` | `"."` → типизированный `dist/index.{d.ts,js}`; **`./stack`** → `dist/services/stack/plugin-api.d.ts` / `dist/stack.js` |
| `files` | `dist/**/*`, `README.md`, `ai/**/*`, `cli/cmd/orient/README.md` | + `docs/**/*`, `services/agent-run/engines/opencode/readonly.config.json`, `plugins/*/plugin.json`, `plugins/*/*.ts`, `plugins/*/directives/**/*`, `plugins/*/skills/**/*` |
| `.npmignore` | **отсутствует** | есть — «Defense-in-depth on top of the `package.json` files allowlist»: субтрактивно запрещает `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `__snapshots__/`, `*.snap`, `fixtures/`, `e2e/`, `coverage/`, `.nyc_output/`, `*.tsbuildinfo`, `*.map`, `scratch/`, `*.local.*` |
| `test` | `node --import tsx scripts/test-topology.ts deterministic` (4-слойная топология, 286 файлов) | `node --import tsx --test --experimental-test-module-mocks --test-concurrency=1` (голый раннер, без скрипта топологии) |
| `test:coverage` | `test-topology.ts coverage` (c8 только на unit+contract) | **отсутствует** |
| `test:topology` | `test-topology.ts check` | **отсутствует** |
| `test:smoke` | **отсутствует** | `GENNADY_SMOKE=1 … cli/__tests__/e2e/bundle-smoke.e2e.test.ts cli/__tests__/e2e/publish-contents.e2e.test.ts` |
| `test:e2e` | `GENNADY_E2E=1 … cli/__tests__/e2e/*.test.ts` | переименован в `test:cli-e2e`; плюс **`test:stack-e2e`** (`scripts/stack-e2e.ts`) и **`test:config-e2e`** (`--suite=config`) |
| `lint` | `npm run lint:contracts` → `tsx cli/gennady.ts lint cli/ shared/ services/` (read-only) | `npm run format && npm run type-check && npm run lint:contracts` → `lint --autofix cli/ shared/ services/ plugins/` (**мутирующий**) |
| `format` | `prettier --check .` (read-only) + `format:fix` = `prettier --write` | `format` = `prettier --write .` (**мутирующий**); `format:check` = `prettier --check .` |
| `fix` / `check` | `fix` = `format:fix -- . && lint:fix -- cli/ shared/ services/`; `check` = `sdd-verify --profile full` | **оба отсутствуют** |
| `prepublishOnly` | `lint && test:e2e && build:publish` | `lint && test:smoke && test:cli-e2e && CONFIG_E2E_STRICT=1 test:config-e2e && STACK_E2E_STRICT=1 test:stack-e2e && build:publish` |
| `publish-next` | есть (+ `publish-draft`, `pack-draft`) | есть (без draft-вариантов) |
| SDD build-скрипты | `build:directives`, `check:directives-fresh`, `check:directive-budgets`, `audit:axioms`, `audit:contracts`, `audit:halts`, `audit:sdd-templates`, `sdd-flow-eval`, `test:sdd-flow-eval`, `inspector*`, `yagni` | **все отсутствуют** |
| `cli/cmd/sdd-*` | 11 команд: `sdd-check sdd-extract sdd-log sdd-migrate sdd-new sdd-orient sdd-state sdd-sync sdd-task sdd-verify` + `yagni` | **ни одной** — в main вместо этого `verify`, `fix`, `commit`, `resolve-conflicts`, `alt-opinion`, `review-*` |
| `shared/sdd/` | 43 модуля, 15 743 LOC, 61 тест | **не существует** (`shared/` = `AGENTS.md`, `backend`, `common`) |
| `ai/` | `directives` (вкл. `sdd-v2/`), `kit`, `skills`, `flow-eval`, `flow-sim`, `inspector` | `agents`, `directives` (вкл. **`sdd/`** — v1-дерево директив; также содержит не упомянутые A2 `dbc-audit.directive.xml`, `dev-review.directive.xml`, `perf-auditor/`, `semantic-change-extractor.directive.xml`), `docs`, `skills` — **нет `kit`, `flow-eval`, `flow-sim`, `inspector`, и нет `drafts`** (в A2 ошибочно упомянут `ai/drafts` в составе main — `git ls-tree -r 8bb38477 \| grep -i drafts` даёт 0 попаданий по всему дереву; опровергнуто) |
| Механизм стека | **нет** (ни `gennady.yaml`, ни плагинов) | `gennady.yaml` в корне + `plugins/{node,golang,anystack}` (у каждого `plugin.json`, `<id>-plugin.ts`, `specs/`, `e2e/`, у golang также `directives/`, `skills/`, `__tests__/`) + `services/stack/{plugin-api,stack-registry,stack-config,gate-runner,tree-guard,env-fail,stack.types}.ts` + `services/config/config-loader.ts`. `StackPlugin` = `{id, marker, description, detect(root), gateIds, verify:{resolveScope, planGates,…}}`; `StackPluginConfig` = `{skipGates, overrideGates, extraGates}` с `GateSpec`, несущим `argv/cwd/env/timeout/outputMeansFailure/driftMeansFailure/envFail/requires/fixer` |
| Раскладка SDD | v1 `tasks/` (127 тикетов) + 1 v2-тикет под `specs/` | v1 `tasks/` (100 тикетов); спеки добавляют скоупы `config`, `plugins`, `stack`, `infra-e2e` |
| Скиллы | `sdd`, `sdd-check`, `sdd-audit`, `sdd-code-review`, `sdd-critic`, `sdd-execute`, `sdd-reconcile`, `sdd-scaffold`, `agent-inbox`, `opencode-get-session`, `prd-interview`, `workspace-permission-setup` | `sdd-setup`, `sdd-discover`, `sdd-infra`, `sdd-module-decomposition`, `sdd-scaffold`, `sdd-execute`, `sdd-execute-batch`, `sdd-audit`, `sdd-check`, `sdd-critic`, `sdd-continue`, `sdd-fix`, `alt-opinion`, `agent-inbox`, `prd-interview`, `workspace-permission-setup` (16) |

**Главная находка среди пересечений.** `main` уже построил, на v1-базе SDD, именно тот механизм per-stack пресета, которого §9.1 недостаёт в RC: корневой `gennady.yaml`, объявляющий `stack:<plugin>:{skipGates,overrideGates,extraGates}`, типизированный контракт `StackPlugin`, опубликованный как `gennady/stack`, `stack-registry` с детекцией по маркер-файлам, `gate-runner`, заменяющий `npm run <script>`, и три поставляемых плагина (`node`, `golang`, `anystack`) с собственными `directives/` и `skills/`. RC построил поток v2 (**43** модуля `shared/sdd`, 11 команд CLI, конвейер директив `ai/kit`, `flow-eval`) **вообще без абстракции стека**. Значит, любое слияние — не rebase, а design-примирение: лестница профилей `sdd-verify` RC + буквальный `npm run` в `phase-verification-plan.ts:270` должны быть переизложены поверх `services/stack/gate-runner.ts` + `GateSpec` из main, а `REQUIRED_SCRIPTS`/`gatherReadinessInput`/`scripts.ts`/`ladder.ts` RC должны стать гранью плагина. И наоборот: стековые плагины main не несут никакой концепции `sdd-check`/`sdd-task`/`sdd-log`, так что его `verify` не умеет чеканить forge-resistant phase receipt RC.

---

## 10. Версия и недавняя история

`package.json` `version` = **`0.8.4`** (main — `0.9.0-next.3`). Ветка `codex/sdd-v2-rc52-followup`, HEAD **`11291af5`** (2026-09-06 22:33:26 +0300), чекаут detached. Рабочее дерево чистое, кроме одного неотслеживаемого маркера `.npm-ci-done` (от `npm ci`, который запустил провижининг этого аудита).

### 10.1 `git log --oneline -30` (первые три строки сверены напрямую, расхождений в проверенной части нет)

```
11291af5 chore(flow-eval): completion gate wiring + spec-receipt metrics + ledger E1-E3
94164668 chore(flow-eval): snapshot pre-existing untracked eval scaffolding
4bb00f4b feat(sdd-v2): mechanical group-audit/review completion receipts
23ea4032 chore(flow-eval): controlled migration-eval runner with telemetry (run/status/grade)
8ab9b363 fix(sdd-v2/migration): STEP_7 makes reference-integrity the hard invariant
75ce4db8 refine(flow-eval): migration grade fails only on introduced structural findings
c1c7625f fix(sdd-migrate): recompute ALL ticket links on move, not just moved-ticket links (supersedes F9)
c8c0c7c7 fix(flow-eval): migration prompt states the real baseline-diff bar, not 'sdd-check clean'
815015fa feat(flow-eval): freeze deterministic migration grade (v2 + baseline-diff)
a9eab0e3 fix(sdd-migrate): normalize `..`-relative evidence paths during move (F9)
8189a153 feat(flow-eval): migration phase + fix(sdd-migrate) slug-cap at plan --verify
933a13d8 fix(sdd-migrate): discover tickets by content (Task-ID), not filename glob
b7dc3749 feat(flow-eval): auto-teardown sandboxes + persist artifacts outside them
43c28c7f docs(flow-eval): close D1 — recover code->spec process complete, all goals green
d61ed1d8 docs(flow-eval): B4 — 10-variation isolation of recover degradation
4d72fb3d feat(flow-eval): recover matrix (scope/module/partial) + matrix-aware prompt
f374f41b feat(flow-eval): recover code->spec process + spec-branch scaffold + sandbox script
ce541cab fix(dbc-linter): make lint --autofix JSDoc output Prettier-compatible
87b7b063 docs(flow-eval): record H3 — task-prompt A/B shows the flow is not prompt-compressible
fcdee206 feat(flow-eval): add brownfield eval class (E-bf-delta, E-bf-bugfix)
d8afa21e feat(flow-eval): complete infra `task` eval suite (E-infra-1/2/3), all golden-passing
f5f6ad45 feat(flow-eval): quality-rules framework + infra `task` evals + experiment log
77943062 feat(flow-eval): capture per-run token + cost usage (A/B currency)
a28e3d2a feat(flow-eval): add broken-specs fixture + repair phase; land colleague report
383e3f73 feat(sdd): unclamp flow over-constraints, fix eval harness, add eval docs
04ee52fd test(sdd): record P9 authoring pass
f58a37da feat(sdd): teach authoring concepts at action time
e95dd106 feat(sdd): standardize actionable tool failures
6bb90784 feat(sdd): expose structured checker findings
40bbd551 fix(sdd): explain invalid module structure
```

### 10.2 Форма недавней работы

Гистограмма типов коммитов за последние 60: `feat` 25 · `fix` 14 · `docs` 8 · `test` 4 · `refactor` 3 · `chore` 3 · `wip` 1 · `refine` 1 · 1 revert (`Revert "fix(sdd): prove project plan before scaffold gate"`) — все 9 значений подтверждены. Гистограмма скоупов: `(sdd)` **29** (не 30, как в A2) · `(flow-eval)` 18 · `(sdd-migrate)` **3** (не 4) · `(sdd-v2)` 3 · по 1 для `sdd-v2/migration`, `sdd-state`, `sdd-log`, `sdd-check`, `lint`, `dbc-linter`.

Так что последние ~30 коммитов доминируются двумя темами: **харнесс eval** (фаза миграции + детерминированная оценка, матрица brownfield/recover, набор infra task, framework quality-rules, учёт токенов/стоимости, teardown песочниц) и **корректность миграции** (пересчёт ссылок `sdd-migrate`, нормализация `..`-relative evidence-путей, обнаружение тикетов по содержимому, cap слага при `plan --verify`).

Изменённые файлы с merge-base `46c6d616`, по областям: `ai/kit` 979 · `services/agent-inbox` 360 · `cli/cmd` 219 · `shared/sdd` 114 · `ai/directives` 112 · `ai/flow-eval` 50 · `e2e/inbox-serve` 41 · `ai/skills` 34 · `tasks/agent-inbox` 30 · `cli/__tests__` 23 · `ai/inspector` 22 · `ai/flow-sim` 13 — все 12 значений подтверждены. **Пропущены в A2** позиции того же порядка: `test/agent-inbox` 23, `specs/cli` 20, `specs/agent-inbox` 19, `services/dbc` 19.

### 10.3 Последний коммит

```
commit 11291af5cca35e5fafe45eccd31681b15c9efd26
Author: k.lebedev <k.lebedev@corp.my.com>
Date:   Sun Sep 6 22:33:26 2026 +0300

    chore(flow-eval): completion gate wiring + spec-receipt metrics + ledger E1-E3

 ai/flow-eval/docs/flow-verification-ledger.md | 19 +++++++++++++++++++
 ai/flow-eval/scripts/session-metrics.py       |  6 ++++--
 2 files changed, 23 insertions(+), 2 deletions(-)
```

Документационно-телеметрический коммит: зафиксировал записи журнала **E1** (механизм receipt group-audit/review приземлён и зелен, коммиты `4bb00f4b` + `94164668`), **E2** (RED-FIRST гейт `session-metrics.py gate` доказанно падает на состоянии брошенного артефакта и вшит в `roundtrip-eval.sh`), и **E3** — открытое продолжение: «migration must emit `PHASE_RECEIPTS:v1` (and full v2 ticket schema)», потому что мигрированные тикеты `infra-base` не несут маркера `PHASE_RECEIPTS:v1`, и новое групповое принуждение для них поэтому grandfathered OFF. Это последний именованный открытый пункт на этой ветке (на момент HEAD `11291af5`; E3 закрывается частично коммитом `95329c19` — см. §6).

Функциональная работа на верхушке RC — коммит перед этим, **`4bb00f4b` feat(sdd-v2): mechanical group-audit/review completion receipts** — `shared/sdd/group-receipt.ts`, `sdd-log <group> audit-receipt|review-receipt <verdict>`, `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING` (WARN, grandfathered на `PHASE_RECEIPTS:v1`), и аксиомы `AX_GROUP_AUDIT_LEAVES_A_RECEIPT` / `AX_GROUP_REVIEW_LEAVES_A_RECEIPT`, с STEP_6 `execute.directive.xml`, получившим реальные `<ToolCall>` для обоих receipt вместо прозы.

---

## 11. Итог верификации

| Вердикт | Количество проверенных утверждений |
|---|---|
| **CONFIRMED** | 117 |
| **INACCURATE** | 26 |
| **REFUTED** | 4 |
| **MISSED** | 5 |

**Общая оценка достоверности инвентаря A2: высокая.** Все «дорогие», воспроизводимые факты повторились байт-в-байт при независимом перезапуске: `sdd-check --all .` → **198 error(s), 431 warning(s) across 212 file(s)** с полностью совпавшими гистограммами кодов (включая разбивку 507 `tasks/` vs 122 `specs/`); `test-topology.ts check` → `unit=211 contract=16 local=51 external=8`, `observed=227 black-box=59`; 127 v1-тикетов и 1 v2-тикет; все LOC модулей `shared/sdd/*` (43 значения из 43); все `file:line` кодов в `check.ts` (93 литерала); все 20 счётчиков по каталогам `ai/kit/axiom`; вся таблица `<DependsOn>`; все различия RC↔`main` в `package.json`.

Дефекты сконцентрированы в двух классах:

1. **Счётчики «сколько файлов/правил/кейсов»** — систематически завышены на 1–9. Самые значимые: `knowledge.xml` содержит **14** `<Rule>`, не 15 (при этом собственная таблица A2 §5.1 перечисляла ровно 14 — ошибка сидела только в шапке); `shared/sdd` — **43** модуля, не 48; детерминированных кейсов в `ai/flow-eval/__tests__` — **84**, не 75.
2. **`file:line` в `readiness.ts`** — почти весь блок ссылок §1.2/§2.2 сдвинут (реальные `WRITE_SWITCH_PATTERN` `:260`, `MUTATING_SWITCH_PATTERN` `:279` против заявленных `:101`/`:120`).

Четыре утверждения A2 были опровергнуты и исправлены в этом документе: `SDD_V2_SUBDIR` — не код находки, а путь-константа (§2.3); «все `SDD_VERIFY_*` — это `ERR_CLI_*`» — неверно, `SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED` реальная находка (§2.3); «`H_ASK_WITHOUT_CARD` объявлен в роутере» — не объявлен нигде, только процитирован в `root.directive.xml` (§4.2); «`main` имеет `ai/drafts`» — такого пути в `main` нет (§9.3).

Единственный пропуск A2, признанный **материальным**: `TEST_ROOTS` в `scripts/test-topology.ts` не содержит `utils/` и `test/`, хотя `UNIT_ROOTS` содержит `utils/` — следствие: **25** тестовых файлов (2 в `utils/test/__tests__/` + 23 в `test/agent-inbox/**`) никогда не запускаются `npm test`, и ветка классификации `'utils/'` в `classifyTest` мертва (§8, врезка «Материальный пропуск A2»). Это единственная находка данного цикла верификации, которая меняет практический вывод о полноте commit-гейта, а не только уточняет число или строку — она обязательна к переносу в любой план консолидации CI между RC и main.

Два коммита позже HEAD инвентаря (`95329c19`, `3d5f66a7`, оба в `ai/flow-eval/**`, не затрагивают директивы/`shared/sdd`/`cli/cmd`/`ai/kit`) устарели два конкретных утверждения §6: «нет правила `R-COMPLETE`» и «единственные два объективных id гейта — `R1` и `MIGRATION`» — оба интегрированы во врезку в конце §6 этого документа.

---

