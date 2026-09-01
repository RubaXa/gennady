# Module: `sdd-check`

**Module:** sdd-check · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Механический аудит SDD-артефактов — детерминированная половина `audit`/`check`. `sdd-check --task <ticket>` проверяет один тикет; `sdd-check --task <created-ticket-path> --authoring` до индексации проверяет структуру нового тикета, а `--phase P<N>` сужает обратную связь до одной фазы. Тул не строит и не оценивает архитектурный план: согласованность фактического разбиения и порядок инфраструктуры проверяет независимое семантическое ревью самих тикетов. Механика сохраняет только проверяемые факты: обязательные секции, точные пути/зависимости, негативный BDD-сценарий и трассу `Requirement-ID → Scenario → Test Scenario Coverage → реальный it/test`. `--all [root]` обходит `specs/`. Семантическая достаточность требований, актуальность approval marker и доказательная сила теста остаются за моделью и реальным запуском тестов.

**Key properties:**

- Pure core — `shared/sdd/check.ts#checkTicket` без I/O; обход ФС и резолв ссылок — в команде
- ESLint-style — `file: severity: code  message` + сводка; exit 1 при наличии error
- Dogfooded — `--all .` проходит по реальным 41 спеке репозитория начисто

**Invariants:**

- exit `1` ⇔ есть хотя бы одна error-находка; warning-и одни → exit 0
- Verification rows are strict three-cell Markdown rows; malformed/raw-pipeline rows produce `SDD_VERIFICATION_TABLE_INVALID`, while a command wrapped by a longer-than-inner backtick delimiter round-trips to exact runtime bytes
- `--all` распознаёт Tracker Index по содержимому (таблица Task-ID/Status), не по имени файла — покрывает и `*.3-tasks.md`, и легаси `tasks/<scope>/README.md`; сверяет со статусом тикета (см. постусловия, tracker↔ticket); тикет (v2) = файл с META + EXECUTION_LOG маркерами; легаси-тикет (v1) = те же заголовки как голый markdown (`## N. Meta`/`## N. Execution Log`), Task-ID/Status читаются, но полная структурная проверка недоступна без якорей (см. D-CK012)
- exit `4`, если выбран не ровно один режим из `--task`/`--all`/`--changed`
- `--changed` получает git evidence через argv-safe process call: proven unborn HEAD означает empty-tree scan по cached/index (включая intent-to-add) + untracked, а corrupt/unavailable git возвращает exit `1` с operation/status/stderr — никогда `clean — 0 files`
- General `--task`/`--all`/`--changed` fail closed: выбранный тикет/source, referenced spec, reachable `<DependsOn>` rule или in-scope Markdown subtree, который нельзя прочитать, даёт единый `ERR_CLI_SDD_CHECK_READ_FAILED` с точным путём и причиной; непрочитанное правило никогда не считается dependency-free leaf; только действительно отсутствующие необязательные `specs/`/`tasks/` корни не являются ошибкой
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-check --all .
[sdd-check] ✅ clean — 41 file(s) checked
# exit 0

$ npx gennady sdd-check --task specs/cli/core/core.task-foo.md
specs/cli/core/core.task-foo.md: error: SDD_FABRICATED_DONE  Checked [x] line with an unreplaced placeholder: "- [x] `<ts>` ver `<cmd>` → pass"
specs/cli/core/core.task-foo.md: warn: SDD_DONE_WITH_PLACEHOLDERS  Status is DONE but unreplaced <…> scaffold placeholders remain.

[sdd-check] 1 error(s), 1 warning(s) across 1 file(s)
# exit 1

$ npx gennady sdd-check --task specs/infra-base/infra-base.task.INF-gate.md --authoring
[sdd-check] ✅ clean — 1 file(s) checked
# exit 0; exact path only, no sibling/global/runtime/coverage scan

$ npx gennady sdd-check --task specs/infra-base/infra-base.task.INF-gate.md --authoring --phase P2
specs/infra-base/infra-base.task.INF-gate.md:38: error: SDD_AUTHORING_TARGET_PATH  [PHASE_P2] Fix: replace "test/*.test.ts" with one exact repository-relative READ or CREATE path.
# exit 1; only P2 plus its PHASES_OVERVIEW dependency boundary

```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                     | Type         | Purpose                                                                                                                                                               |
| ---------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`                                    | Command      | Точка входа CLI: `--task`/`--all`, обход, агрегация, формат                                                                                                           |
| `walkMd`                                 | Utility      | Рекурсивный сбор `.md`; general-аудит сохраняет typed I/O-наблюдения, review использует собственные строгие diagnostics                                               |
| `checkRequirementBudgetsAgainstBaseline` | Utility      | (`shared/sdd/check`) бюджет 20 записей / 10 строк с lazy-сравнением против HEAD и operator marker                                                                     |
| `checkSpecLinks`                         | Utility      | Резолв `](…spec.md)` ссылок спеки на диске                                                                                                                            |
| `parseGraphEdges`                        | Utility      | (`shared/sdd/portal`) рёбра Mermaid-графа портала → `{from,to}[]`                                                                                                     |
| `checkPortal`                            | Utility      | (`shared/sdd/check`) чистые проверки портала (граф/таблица/сироты) → `Finding[]`                                                                                      |
| `checkTicket`                            | Utility      | (`shared/sdd/check`) чистые пер-тикет проверки → `Finding[]`                                                                                                          |
| `checkTicketAuthoringStructure`          | Utility      | Из task manifest проверяет полный authoring-контракт либо выбранную фазу + overview/dependency boundary; findings несут code, file line, section и copy-ready Fix     |
| `checkTicketOwnerMetadata`               | Utility      | Сверяет Meta Scope/Module pre-index тикета с owner, структурно выведенным из точного пути                                                                             |
| `checkTicketCoveragePolicy`              | Utility      | Проверяет schema-aware policy, единственную test owner-phase и Required-by связь reader; pre-schema оставляет legacy                                                  |
| `checkPhaseReceipts`                     | Utility      | Проверяет CLI-owned phase evidence: plan/command completeness и свежесть exact Target Files                                                                           |
| `isTicket`                               | Utility      | (`shared/sdd/check`) распознавание тикета (v2) по META + EXECUTION_LOG маркерам                                                                                       |
| `isLegacyTicket`                         | Utility      | (`shared/sdd/check`) распознавание легаси-тикета (v1) по голым заголовкам Meta/Execution Log (`legacyHeaderBody`)                                                     |
| `legacyTicketRef`                        | Utility      | (`shared/sdd/check`) Task-ID/Status/deps легаси-тикета → `TicketRef`                                                                                                  |
| `checkLegacyTicket`                      | Utility      | (`shared/sdd/check`) один warn `SDD_LEGACY_TICKET_UNANCHORED` вместо лавины формат-находок                                                                            |
| `checkSpecHierarchy`                     | Utility      | (`shared/sdd/check`) module↔parent-index сверка по всему дереву → `SDD_MODULE_NOT_IN_INDEX`/`SDD_PARENT_MODULE_NOT_INDEX`                                             |
| `checkDiagramCaptions`                   | Utility      | (`shared/sdd/check`) рунг «подпись»: диаграмма без подписи / подпись с неизвестным ID → `SDD_DIAGRAM_CAPTION_MISSING`/`SDD_DIAGRAM_CAPTION_REQ_UNKNOWN` (см. D-CK017) |
| `checkScopeDataFlowDiagram`              | Utility      | (`shared/sdd/check`) рунг «поток данных»: product/library-скоуп нового формата без него → `SDD_SCOPE_NO_DATA_FLOW` (см. D-CK017)                                      |
| `checkModuleCallChain`                   | Utility      | (`shared/sdd/check`) рунг «цепочка вызовов»: модуль с ≥2 сущностями без sequenceDiagram/шаг-таблицы → `SDD_MODULE_NO_CALL_CHAIN` (см. D-CK017)                        |
| `legacyHeaderBody`                       | Utility      | (`shared/sdd/anchor-inject`) тело канонического v1-заголовка (без якорей)                                                                                             |
| `formatFindings`                         | Utility      | ESLint-style рендер + вывод exit-кода                                                                                                                                 |
| `badInvocation` / `fileError`            | Utility      | Билдеры результатов-ошибок                                                                                                                                            |
| `Finding`                                | Value Object | `{severity, code, file, message}` (`shared/sdd/check`)                                                                                                                |
| `CheckResult`                            | Value Object | `{text, exitCode}`                                                                                                                                                    |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Mechanical Audit

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - Ровно один режим: `--task <ticket>`, `--all [root]` или `--changed [root]`
- Postconditions:
  - Пер-тикет проверки: баланс якорей · обязательные секции (META, EXECUTION_LOG) · наличие Task-ID · парсимость Status · фабрикованный DONE (`[x]` + `<…>`; `[x]` внутри инлайн-кода — `` `[x]` `` — НЕ считается чекбоксом, только литеральный markdown-чекбокс вне бэктиков, см. D-CK002) · DONE при активном BLOCKED (`SDD_DONE_WITH_ACTIVE_BLOCKER`, error) · открытый BLOCKED на любом другом статусе (`SDD_BLOCKER_OPEN`, warn — незакрытый блокер репортится всегда, не только на DONE, чтобы execute-оркестратор мог опираться на тул, а не на ручной скан лога) · DONE с остаточными плейсхолдерами · граф фаз (deps резолв + ацикличность) · фазы ↔ `PHASE_Pn`-секции · DONE ⇒ все фазы `[x]` · **rule-evidence фаз строго резолвится и читается** (прямые `](…\.xml)` и все транзитивные `<DependsOn>` проходят одну repo-local regular non-symlink identity boundary; unsafe/missing/unreadable → `ERR_CLI_SDD_CHECK_READ_FAILED`) · **spec-ссылки резолвятся** (`](…spec.md#entity)` в тикете → файл (`SDD_BROKEN_SPEC_REF`, error) + якорь-сущность как heading-slug/SECTION (`SDD_BROKEN_SPEC_ANCHOR`, warn) — чтобы `sdd-extract` воркера не упал) · **BDD_COVERAGE** (`TEST_COVERAGE` секция тикета, `shared/sdd/bdd-coverage.ts`): `SDD_BDD_SCENARIO_UNTESTED` — заявленный `it()`/`test()` не найден в тест-файле (severity по `flowVersion`, см. D-CK014); `SDD_BDD_DEFERRED_TO_SELF` — строка `Deferred Test Ownership:` указывает на Task-ID самого тикета (error, всегда — самоделегирование прячет отсутствующее покрытие, не откладывает его); `SDD_BDD_COVERAGE_ROW_UNPARSED` — строка секции похожа на coverage-ряд (начинается с `-`), но не матчит ни `→ \`file\` :: \`case\``ни валидный`Deferred Test Ownership:`(warn, всегда — сегодня такая строка тихо пропадает из проверки, см. D-CK014);`SDD_BDD_TESTFILE_AMBIGUOUS` — declared test-file матчит >1 файл на диске по суффиксу пути (warn, см. D-CK016)
  - `--authoring` поверх exact `--task` возвращает file-relative line-addressed findings: required Meta/sections/phases, exact READ/CREATE Target Files, structural owner/owning spec, phase deps↔Inputs, direct+transitive rule readability and Rules closure, scenario↔coverage row, contract-reference↔contract-level BDD и coverage file↔test-phase ownership. `--phase P<N>` требует `--authoring` и проверяет только выбранный `PHASE_P<N>` плюс его строку/зависимости в PHASES_OVERVIEW и rule evidence этой фазы; полный `--authoring` остаётся переходным гейтом всего тикета.
  - `--all` также: битые `](…spec.md)` ссылки + баланс якорей `.spec.md`; обязательные секции по scope-type; целостность портала (`specs/README.md`): ацикличность графа · граф↔таблица scope'ов · висячие связи · сироты · DONE-scope без файла спеки; **task-DAG** (коллизии Task-ID · deps резолвятся · ацикличность, покрывает и v2-, и легаси-тикеты — см. ниже); **легаси-тикет** (v1, голые заголовки `## N. Meta`/`## N. Execution Log`, без `<!--SECTION-->` — `isLegacyTicket`): полный `checkTicket` (маркер-зависимый) не гонится — вместо лавины `SDD_MISSING_META`/`SDD_MISSING_EXECUTION_LOG` один advisory `SDD_LEGACY_TICKET_UNANCHORED`; Task-ID/Status/Dependencies читаются из голового Meta-заголовка (`legacyHeaderBody`, `legacyTicketRef`) и участвуют в task-DAG и tracker↔ticket на равных с v2-тикетами (см. D-CK012); **tracker↔ticket** (Tracker Index распознаётся по содержимому — таблица Task-ID/Status, — не по имени файла, покрывает и `*.3-tasks.md`, и легаси `tasks/<scope>/README.md`; статус сравнивается без учёта backtick-обёртки ячейки; `SDD_TRACKER_STATUS_DRIFT` — дрифт статуса в любую сторону (тикет обгоняет трекер ИЛИ трекер обгоняет тикет) — всегда error; `SDD_TRACKER_MISSING_ROW`/`SDD_TRACKER_ORPHAN_ROW` — по образцу `SDD_BDD_SCENARIO_UNTESTED`: warn на v1 (легаси-scope терпит вычищенные из трекера superseded-тикеты), error на v2); **module-graph** (`SDD_MODULE_DAG_CYCLE` — цикл в графе зависимостей модулей scope, рёбра из `## 9` Inter-Module Dependencies, объединённые по scope); **module-bloat** (**warn**, advisory, exit 0, `AX_HIERARCHICAL_SPECS`): `SDD_MODULE_OVERSIZED` — инвентарь > порога сущностей (P90=20) → декомпозиция на под-модули; `SDD_MODULE_SPEC_VERBOSE` — спека длиннее порога строк при связном инвентаре → компрессия спеки; **scope-bloat** (**warn**, `AX_SCOPE_STAYS_THIN`): `SDD_SCOPE_BLOATED` — scope-спека несёт модульную деталь (`ENTITY_INVENTORY`/`MODULE_CONTRACTS`); **scope-deps↔портал** (**warn**, B5, `AX_SCOPE_GRAPH_DISCIPLINE`): `SDD_SCOPE_DEP_UNDECLARED` — ребро портала `X --> Y` не отражено в `## 7 Scope Dependencies` спеки X; **иерархия спек** (severity по `flowVersion` модуля/родителя — warn на v1, error на v2, `AX_HIERARCHICAL_SPECS`/`AX_SCOPE_STAYS_THIN`): `SDD_MODULE_NOT_IN_INDEX` — модульная спека на диске не сматчена markdown-ссылкой из ближайшего предка-спеки выше по дереву (namespace-директории без своей спеки — легально, поиск идёт выше); `SDD_PARENT_MODULE_NOT_INDEX` — модульная спека, под чьей директорией есть дочерние модульные спеки (любая глубина), всё ещё несёт `ENTITY_INVENTORY`/`MODULE_CONTRACTS` — родитель обязан стать тонким индексом (рекурсия `SDD_SCOPE_BLOATED` на уровень модуля); **рунги визуализации** (severity по формату Requirements спеки — warn на старом, error на новом `<ACR>-REQ-<N>`-формате, кроме дельты — см. D-CK017): `SDD_DIAGRAM_CAPTION_MISSING`/`SDD_DIAGRAM_CAPTION_REQ_UNKNOWN` — диаграмма в OVERVIEW/ARCHITECTURE/MODULE*MAP/INTER_MODULE_DEPENDENCIES без подписи `*<фраза> — <ID>.\_`сразу после `` ``` ``, либо подпись ссылается на несуществующий в спеке requirement-ID;`SDD_SCOPE_NO_DATA_FLOW`— product/library-скоуп нового формата без рунга «поток данных» (подраздел/подпись «Data Flow»/«Поток данных»), **error**, старый формат не гейтится;`SDD_MODULE_NO_CALL_CHAIN`— модуль с ≥2 сущностями без`sequenceDiagram`или шаг-таблицы (Шаг/Участник/Действие/Данные);`SDD_DELTA_DIAGRAM_MISSING` (**warn** всегда) — ревью-состояние с ✚ в CHANGE_MANIFEST, но ни одна диаграмма не помечает новый узел (`:::new`/«(добавлено)»/`NEW`)
  - exit 1 при ≥1 error; иначе 0
- Invariants:
  - `checkTicket` чист (без I/O); кросс-файловое — в команде
  - Плейсхолдер `/<[A-Za-z…][^>\s]*>/` — НЕ матчит HTML-маркеры секций (`<!--…-->`)

**Deferred (audit-агент, семантика):** closed-world symbol-diff (код↔Inventory), BDD↔test substance, rules-cascade resolution, stale-after-pivot, runtime-backing real-vs-stub. Требуют AST / запуска тестов / суждения — не механика. (Task-DAG, tracker-sync, граф фаз, exec-log completeness, anchors `.spec.md` — теперь механически в туле; см. постусловия.)

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Flag / Arg        | Type    | Description                                                                                                                               |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--task <ticket>` | string  | Проверить один тикет                                                                                                                      |
| `--authoring`     | boolean | Exact-ticket authoring gate перед переходом: все authoring-инварианты, без runtime/sibling/global checks                                  |
| `--phase P<N>`    | string  | Только с `--authoring`: проверить выбранную фазу и её overview/dependency boundary                                                        |
| `--all`           | boolean | Проверить все тикеты + спеки под `specs/`                                                                                                 |
| `--changed`       | boolean | Проверить append-only `@tasks` и резолвимость `@consumers`; unborn HEAD = index + untracked against empty tree, git failure = fail-closed |
| `[project-root]`  | string  | Корень для `--all` (cwd по умолчанию); обходит `specs/` под ним ИЛИ саму папку — `--all specs/<scope>` скоупит проверку на один scope     |

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-check/
├── index.ts             # Entry point for dynamic import
├── sdd-check.cmd.ts     # Command: --task/--all, walkMd, checkSpecLinks, aggregate
├── phase-receipt-check.ts # plan/command/Target File evidence validation
├── sdd-check.types.ts   # error codes, CheckResult, formatFindings
├── help.ts              # Help text output
└── __tests__/sdd-check.cmd.test.ts

shared/sdd/check.ts      # checkTicket/isTicket (v2) + isLegacyTicket/legacyTicketRef/checkLegacyTicket (v1) + __tests__/check.test.ts, check-legacy-ticket.test.ts
shared/sdd/anchor-inject.ts  # injectAnchors + legacyHeaderBody (shared header/span logic) + __tests__/anchor-inject.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit (pure + run) + lint + typecheck + dogfood `--all .` (41 спека, clean).

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-CK018 — Requirements budget и fail-closed review readiness

- **Status:** active
- **Why:** 120 строк заставляли механически ужимать список требований и не отражали его когнитивный размер. Новый формат вместо этого имеет lazy budget 20 entries, max 10 non-empty body lines на entry и ровно одну точную operator-approved строку, которая может только повысить текущий лимит; нулевая строка нормальна ниже лимита, дубликат/имитация/невалидная дата не авторизуют. Старый превышенный master grandfathered лишь пока соответствующая запись/список и approval evidence не меняются; новое/изменённое проверяется с реальными строками файла. `--review-ready` валидирует одну primary последовательную датированную историю, общий target-set пачки и пятираундовый автоматический предел. Sensor verdict не переписывается: операторское принятие хранится отдельным решением. Поэтому старый `CLEAN`, дублированное evidence или пропавший участник не могут открыть publish/compress.
- **Risk accepted:** Verdict, target-set и operator-decision читаются только из канонических строк; нестандартная проза намеренно не считается доказательством.

### D-CK020 — Integrated critic state and operator-owned cap

- **Status:** active
- **Supersedes:** critic-readiness portion of D-CK018
- **Why:** Target-set alone let an old CLEAN cover bytes edited after the review, and file-mode treated a secondary as self-contained. A round now records the exact state produced by `--review-state`; `--review-ready` resolves secondary→primary and hashes the same manifest. Five is a hard automatic cap regardless of sensor verdict; only the operator may close, raise the cap explicitly, or restart after a correction.
- **Risk accepted:** SHA-256 proves byte identity of the declared set, not that the orchestrator chose the semantically correct set; the directive owns scope→all-modules construction.

### D-CK021 — Product/library review set comes from structural decomposition

- **Status:** active
- **Why:** Prompt-only sequencing still allowed a scope-only `--review-state`, a module carrying its own history, or fabricated CLEAN before modules. Pre-dispatch/readiness call the same decomposition/ownership SSOT: product/library Module Map is a non-empty exact manifest, every module resolves exactly one declared owning scope, that scope owns Critic Rounds, and the Group 3 target-set equals scope + every member. Infrastructure/interface keep standalone review semantics; only infrastructure may directly scaffold flat tasks.
- **Risk accepted:** Module membership is explicit markdown links inside MODULE_MAP; prose names are intentionally not evidence.

### D-CK022 — Critic review-set/write-set and post-edit cap disposition

- **Status:** active
- **Supersedes:** cap/readiness details of D-CK020
- **Why:** Target-set alone let an integrated critic silently edit an unchanged context module, while operator CLEAN after a cap-round edit could accept bytes no sensor had reviewed. `--review-state` now derives a stable write-set only from valid manifests and the round records both sets plus `Changes`. A read-only finding requires routed ownership or manifest promotion followed by RESTART. At every active cap CLEAN exists only when `Changes: none`; edited state can only CONTINUE or RESTART.
- **Risk accepted:** CHANGE_MANIFEST is explicit non-adversarial write ownership. The tool proves membership and state identity, not that the author selected the semantically ideal member for promotion.

### D-CK024 — Critic transitions prove post-edit redispatch

- **Status:** active · **Extends:** D-CK022
- **Why:** `Changes` previously affected final readiness but did not constrain the next transition: repeated `NEEDS_WORK + none` rounds and an unchanged hash after alleged edits were accepted. Now a no-edit non-clean result is terminal not-ready before the cap; every edited result requires another round whose pre-dispatch `Changed-state` differs. Operator CONTINUE at a cap remains the sole no-edit transition to a later round.

### D-CK025 — `--changed` distinguishes no HEAD from broken git evidence

- **Status:** active
- **Why:** the former shell helper caught every git failure as `''`, so corrupt HEAD plus dirty tracked files produced `clean — 0 files`. Git and the changed-file consumer search are now invoked with argv arrays (a root containing `$()`/backticks is data, never shell); the typed git result preserves operation, exit status and stderr. Only a symbolic unborn branch is `no-head`: its empty-tree scope is the deterministic union of cached/index entries (including intent-to-add) and untracked paths. With no parent tree there is no deletion baseline; after HEAD exists, `git diff HEAD` retains staged/unstaged deletions. Repository/corrupt-ref/diff failures return exit 1.
- **Risk accepted:** none; this changes only false-green failure paths.

### D-CK026 — Critic ownership and VCS publication ownership are separate frozen sets

- **Status:** active
- **Why:** spec-only `target-set`/manifest `write-set` correctly bound critic edits, but review lifecycle reused them as the staging allowlist. Greenfield authoring also durably writes linked research, a portal row/edge, canonical task indexes, and the session-file ignore line; those outputs were therefore either omitted from the reviewed commit or required an unsafe broad dirty-tree exception. `--review-publication` preserves critic ownership unchanged and derives a second exact role-bearing set from bounded spec links plus typed git evidence. Critic returns that output after `--review-ready` and before scratch removal; lifecycle reruns it with manifests still present, requires literal identity, then hashes/stages exactly its paths. Unrelated dirty state remains a hard halt.
- **Risk accepted:** edits to an existing mixed-content project/scope/module index are deliberately rejected as ambiguously attributable; only new canonical indexes are accepted. Existing portal edits use a narrow line grammar: only reviewed-scope table rows and Mermaid node/edge lines may differ. A future structured index/portal patch format can relax this without weakening the closed-world dirty-set gate.

### D-CK001 — Граница: механика в тул, семантика в аудит-агент

- **Status:** active
- **Why:** Полный контракт аудита включает symbol-diff/BDD↔test/cascade — это AST + исполнение + суждение. Тул берёт детерминированную часть (структура, статусы, фабрикованный DONE, битые ссылки); семантику оставляет агенту, который и так читает код/тесты. Так тул прост, быстр, тестируем без сети.
- **Risk accepted:** `--all` clean ≠ «семантически верно» — это явно задокументировано (help + spec); агент остаётся обязательным.

### D-CK002 — Плейсхолдер-регэксп исключает HTML-маркеры

- **Status:** active
- **Why:** Наивный `/<[^>\s]+>/` матчит `<!--SECTION:…-->`, давая ложный DONE_WITH_PLACEHOLDERS на КАЖДОМ тикете (поймано юнит-тестом). Скаффолд-плейсхолдеры начинаются с буквы/`…`, маркеры — с `!`/`/`: `/<[A-Za-z…][^>\s]*>/`.
- **Risk accepted:** Нет.

### D-CK014 — `SDD_FABRICATED_DONE` игнорирует `[x]` внутри инлайн-кода; два новых кода BDD_COVERAGE

- **Status:** active
- **Why:** Свежий тикет из `TASK_SKELETON` (`shared/sdd/templates.ts`) даёт ложный `SDD_FABRICATED_DONE` на строке-подсказке Execution Log — она содержит и `` `[x]` ``, и `` `<…>` `` внутри бэктиков как иллюстрацию правила, не как реальный чекбокс. Проверка теперь матчит `[x]` только на строке БЕЗ инлайн-код-спанов (`` `…` `` вырезаются перед тестом), а плейсхолдер — на исходной строке (реальный `[x] \`<ts>\``— плейсхолдер конвенционально в бэктиках рядом с чекбоксом — продолжает ловиться). Отдельно —`bdd-coverage.ts`тихо пропускал два класса реальных проблем: (1)`Deferred Test Ownership:`строка, чей Task-ID == Task-ID самого тикета — самоделегирование, прячущее отсутствующее покрытие вместо честной пометки`TODO`/реальной передачи другому тикету → `SDD_BDD_DEFERRED_TO_SELF`(error, не градуируется по`flowVersion`— единичная настоящая находка, не легаси-шум); (2) строка`## Test Scenario Coverage`, похожая на ряд (`-`-префикс), но не матчащая ни arrow-форму, ни валидный `Deferred Test Ownership:`— раньше исчезала без следа из`parseTestCoverage`, теперь `findUnparsedCoverageRows`/`checkUnparsedCoverageRows`дают`SDD_BDD_COVERAGE_ROW_UNPARSED` (warn, тоже не градуируется — единичная находка).
- **Risk accepted:** Нет — оба нового кода репортят реальные, а не легаси-переходные, проблемы; severity фиксирована умышленно, без v1/v2-градации (в отличие от `SDD_BDD_SCENARIO_UNTESTED`). Диагностика unparsed-row печатает две полные copy-ready формы замены, включая каноническую `- Deferred Test Ownership: <other-Task-ID> <scenario name> → \`<future-test-file>\` :: \`<canonical case name>\``, а не фрагмент грамматики.

### D-CK016 — Declared test-file матчится по суффиксу пути, не по basename-равенству

- **Status:** active
- **Why:** `getTestFileIndex` ключевал найденные тест-файлы по basename и искал declared test-file равенством по этому ключу. Тикет, декларирующий полный путь (`src/app/x.test.ts`, а не голый `x.test.ts`), никогда не находил свою запись — ложный `SDD_BDD_SCENARIO_UNTESTED` на реально покрытом сценарии (flow-sim S7). Индекс теперь плоский список путей (forward-slash normalized); `resolveTestFileMatches` (`shared/sdd/bdd-coverage.ts`, чистая функция) матчит одним правилом: `file === declared || file.endsWith('/' + declared)` — покрывает и «declared = полный путь», и «declared = голый basename» без двух отдельных веток. Неоднозначность (declared матчит >1 файл — типично для голого basename при дублирующихся именах в разных директориях) репортится через `SDD_BDD_TESTFILE_AMBIGUOUS` (warn) вместо молчаливого flatMap по всем совпадениям.
- **Risk accepted:** Warn, не error — неоднозначность не блокирует гейт; оператор уточняет declared-путь длиннее суффиксом.

### D-CK017 — Рунги визуализации: подпись, поток данных, цепочка вызовов, дельта (четыре кода)

- **Status:** active
- **Why:** инвентарь (`specs/ai-skills/research/2026-08-20-visualization-chain.research.md`) нашёл, что из пяти рунгов диаграммной лесенки механически проверялся только один (Overview-диаграмма присутствует). Четыре кода закрывают остальное: `checkDiagramCaptions` — диаграмма в OVERVIEW/ARCHITECTURE/MODULE*MAP/INTER_MODULE_DEPENDENCIES без строки-подписи `*<фраза> — <ACR>-REQ-<N>.\_` сразу после закрывающей `` ``` `` (`SDD_DIAGRAM_CAPTION_MISSING`), либо подпись цитирует ID, не объявленный в этой спеке (`SDD_DIAGRAM_CAPTION_REQ_UNKNOWN`) — сознательно НЕ гейтит отсутствие самого списка ID (иллюстрирует ли диаграмма конкретное требование — судейское решение, не механическое); `checkScopeDataFlowDiagram` — product/library-скоуп нового формата без подраздела/подписи «Data Flow»/«Поток данных» (`SDD_SCOPE_NO_DATA_FLOW`, error, без warn-варианта для старого формата — оператор ограничил рунг новым форматом явно); `checkModuleCallChain` — модуль с ≥2 сущностями без `` ```mermaid sequenceDiagram `` или шаг-таблицы (колонки Шаг/Участник/Действие/Данные, RU/EN, подстрочный матч) (`SDD_MODULE_NO_CALL_CHAIN`); `checkDeltaDiagram` — CHANGE_MANIFEST с ✚-пунктами, но ни одна диаграмма не помечает новый узел (`:::new`/«(добавлено)»/`\bNEW\b`) (`SDD_DELTA_DIAGRAM_MISSING`, всегда warn). Severity-градация (warn на старом Requirements-формате без `<ACR>-REQ-<N>`, error на новом) — по образцу `SDD_REQ_MISSING_UNHAPPY`: гейтим только новый формат, 34 существующих файла не красим. На дереве репозитория (0 спек уже в новом формате) прогон даёт 0 новых error и 42 новых warn (16 `SDD_DIAGRAM_CAPTION_MISSING`+ 26`SDD_MODULE_NO_CALL_CHAIN`) — весь прирост объясняется найденным в ресёрче пробелом, не шумом.
- **Risk accepted:** Диаграмма-признак ограничен четырьмя секциями (OVERVIEW/ARCHITECTURE/MODULE_MAP/INTER_MODULE_DEPENDENCIES), а не «любой ` ` `в файле» — специально: под specs/** живёт 280 голых` ` `-блоков вне этих секций (примеры CLI-вывода, ASCII-деревья, JSON), подпись на них была бы шумом. Рунг «поток данных» и рунг «цепочка вызовов» признаются по тексту заголовка/наличию `sequenceDiagram`/таблицы — не по конкретному имени SECTION, поэтому переживут появление новой подсекции без правки check.ts.

### D-CK004 — Проверка целостности портала в `--all`

- **Status:** active
- **Why:** граф scope'ов раньше нигде механически не проверялся (`root` лишь заявлял «verified by sdd-check»). `--all` теперь проверяет `specs/README.md`: ацикличность, граф↔таблица↔спеки, сироты, висячие связи. Чистое ядро `checkPortal` (вход — таблица scope'ов + рёбра графа + имена spec-папок на диске); fs-сбор папок — в команде. Закрывает дыру UC-6 (сирота при удалении/переименовании scope).
- **Risk accepted:** «нет файла спеки» — ошибка только для DONE-scope; 🚧/планируемые без файла — норма (ещё не авторизованы).

### D-CK003 — `*.3-tasks.md` пропускаются

- **Status:** superseded by D-CK012
- **Why:** Целостность трекеров (статус строки = статус тикета) — забота `sdd-sync` (он пишет + verify). Дублировать проверку в check — расхождение источников истины.
- **Superseded because:** На практике `sdd-sync` пишет статус, но не verify'ит существующий рассинхрон — трекер может обогнать тикет (строка `DONE`, Meta тикета всё ещё `TODO`) незамеченно. Реальный кейс: `tasks/cli/README.md` заявлял TSK-58 `DONE`, сам тикет стоял `TODO` — `sdd-check --all` это не поймал (см. D-CK012). Дублирование источников истины — не аргумент против механической сверки; `checkTrackers` уже существовал (сверка добавлена позже без обновления этой записи) и был просто не подключён.

### D-CK005 — Мягкие сигналы раздувания модуля (два кода, warn)

- **Status:** active
- **Why:** раздувание реально на уровне модуля, и предел держит ТУЛ, не проза (аксиома лишь называет правило, просто). Два детерминированных сигнала → два средства: `SDD_MODULE_OVERSIZED` (инвентарь > порога сущностей → мир большой → **декомпозиция** на под-модули); `SDD_MODULE_SPEC_VERBOSE` (спека > порога строк при связном инвентаре → не велик, просто многословно → **компрессия**). Оба — **warn** (exit 0), не error: тул подсвечивает и говорит ЧТО подходит, оператор решает. Срабатывают на границах `module`-сессии (вход `add-module`/`refine-module` + закрытие STEP_6) и в `--all`. Пороги — именованные константы на ХВОСТЕ (~P90) реального распределения: ловят выброс, а не верхнюю четверть (совет, срабатывающий на четверти спек — шум). **750 строк** (хвост LOC спеков). **20 сущностей** — откалибровано по 63 инвентарям: медиана 9, Q3 14, P90 20, max 50; старое 12 стояло между медианой и Q3 → флагало ~треть модулей (здоровое ядро); 20 = P90 ловит только реальные выбросы (верх корзины 16-30 + три монстра: activity-monitor 50, types 44, utils 32). VERBOSE→компрессия не дробит (уплотняет прозу), ложное срабатывание безвредно; риск «мельчения» несёт только OVERSIZED→декомпозиция. На уровне scope счётчика НЕТ: граница **категориальная** (см. D-CK010 — scope несёт модульную деталь), а не размерная.
- **Risk accepted:** пороги приблизительны (счёт строк таблицы / строк файла); длинный decision-log может ложно поднять LOC — допустимо, это совет, решает оператор + директива.

### D-CK007 — Rule-ссылки тикетов резолвятся (`SDD_BROKEN_RULE_LINK`)

- **Status:** superseded by D-CK029
- **Why:** scaffold пишет в фазы тикета markdown-ссылки на rule-файлы (`[ai/directives/<cat>/<rule>.xml](path)`); резолв проверялся только агентом во время scaffold (`H_MISSING_RULE_FILE`) и воркером в рантайме (`H_MISSING_RULE_FILE` в phase-execution). Удалённый/переименованный/опечатанный rule-файл всплывал лишь при исполнении. Теперь `sdd-check` на тикетах резолвит `](…\.xml)`-ссылки (зеркало `SDD_BROKEN_SPEC_LINK`) — shift-left на close scaffold (`sdd-check --all .`). Плейсхолдеры формата (`](<relative-path>)`) не матчатся: цель ссылки не оканчивается на `.xml`.
- **Risk accepted:** ловит любую битую `.xml`-ссылку в тикете, не только rule (приемлемо — все `.xml`-ссылки тикета должны резолвиться).

### D-CK008 — Spec-ссылки тикета резолвятся (spec→task→execute консистентность)

- **Status:** active
- **Why:** тикет несёт Spec References `](…spec.md#entity)` на сущности спеки; sdd-task кладёт их в read-manifest, воркер делает `sdd-extract`. Если сущность переименована / спека перенесена — ссылка висит, извлечение падает в рантайме. `sdd-check` на тикетах резолвит: **файл** (`SDD_BROKEN_SPEC_REF`, error — однозначно) + **якорь** как heading-slug (lowercase, не-словарные→убрать, пробелы→`-`) ИЛИ `<!--SECTION:X-->` (`SDD_BROKEN_SPEC_ANCHOR`, **warn** — slug-эвристика хрупка на сигнатурах, не валим гейт). Замыкает цепочку spec→task→execute механически на close.
- **Risk accepted:** slug-эвристика может не сматчить заголовок со сложной пунктуацией/сигнатурой → ложный warn (не error); калибруется.

### D-CK006 — Граф модулей: только цикл, без dangling

- **Status:** active
- **Why:** `## 9 Inter-Module Dependencies` несёт структурированный Mermaid-граф (`<module> --> <sibling>`), парсится тем же `parseGraphEdges`, что портал (пунктирные cross-scope `.->` он игнорирует). Рёбра модульных спек объединяются по scope → `hasCycle`. Цикл (`SDD_MODULE_DAG_CYCLE`, error) — реальная архитектурная проблема, ловится надёжно, ложных срабатываний нет (цикл есть цикл). **Dangling-проверку (конец ребра = сосед-модуль) НЕ делаем:** граф легально содержит не-модульные узлы — точки входа (`index.ts`, `gennady.ts`) и шаренные либы (`shared/common/…`); требовать резолва в сосед-модуль → ложные срабатывания. Резолв связей — за аудит-агентом.
- **Risk accepted:** опечатка в имени соседа (не цикл) здесь не всплывёт — это семантика, ловит агент/оператор. Группировка по первому сегменту после `specs/`; вложенные под-модули объединяются в граф своего scope.

### D-CK009 — Перекрытие секций: стек поверх баланса (`SDD_SECTION_OVERLAP`)

- **Status:** active
- **Why:** `SDD_ANCHOR_UNBALANCED` считает только количество open/close на имя — interleaving проходит мимо: `A открыта · B открыта · A закрыта · B закрыта` балансируется по счёту (A 1/1, B 1/1), но `sdd-extract` тянет ровно одну **плоскую** секцию и на пересечении ломается. `sectionOverlaps` ведёт стек: open-при-открытой (вложенность) и close не-вершины (interleave) → `SDD_SECTION_OVERLAP` (error). SDD-секции плоские (правило формата A8: под-секции не оборачиваются), поэтому глубина стека > 1 — всегда дефект. Проверка в обоих входах — тикеты (`checkTicket`) и спеки (`checkSpecStructure`).
- **Risk accepted:** при незакрытой секции возможен двойной сигнал (и UNBALANCED по счёту, и OVERLAP) — оба верны, не шум.

### D-CK010 — Scope-bloat: scope несёт модульную деталь (`SDD_SCOPE_BLOATED`)

- **Status:** active
- **Why:** `AX_SCOPE_STAYS_THIN` — scope остаётся тонким индексом, а `ENTITY_INVENTORY`/`MODULE_CONTRACTS` (инвентарь сущностей, DbC) живут ТОЛЬКО в модулях. Проверка **категориальная**, не размытый порог: scope-спека, несущая эти секции, → `SDD_SCOPE_BLOATED` (warn). Классификатор уточнён: модуль = по маркеру `MODULE_VISION` (а не по `ENTITY_INVENTORY`, иначе раздутый scope маскировался под модуль); scope = есть `SCOPE_TYPE`, нет `MODULE_VISION`. Формат v2 (`product/library/...-spec-structure`) фиксирует: scope несёт `SCOPE_TYPE…MODULE_MAP…HANDOFF`, но НЕ инвентарь/контракты — отсюда правило. Спроектировано от формата kit, не от легаси-спек репо.
- **Risk accepted:** модульная спека с унаследованным `SCOPE_TYPE` родителя + `ENTITY_INVENTORY` не ловится как bloat (правильно — у неё есть `MODULE_VISION`). Легаси-спеки без SECTION-маркеров проверка не трогает (не мигрируем).

### D-CK012 — Tracker Index: распознавание по содержимому + severity-градация по `flowVersion`

- **Status:** active
- **Supersedes:** D-CK003
- **Why:** `--all` классифицировал Tracker Index по имени файла (`*.3-tasks.md`/`*.2-tasks.md`) — ни один файл в репозитории так не называется, весь трекер-трафик живёт в `tasks/<scope>/README.md`; `checkTrackers` существовал, но получал пустой массив строк, поэтому не срабатывал ни в одну сторону. Реальный пропуск: `tasks/cli/README.md` строка TSK-58 `DONE`, тикет `orient.task-55.md` (`TSK-55`) — `TODO`; трекер обогнал тикет незамеченно. Классификация переведена на содержимое (`isTrackerIndex` — таблица Task-ID/Status), покрывает и легаси README, и будущий `*.3-tasks.md`. Отдельно найден и починен формат-баг: `parseTrackerRows` оставляет Status-ячейку сырой (с backtick — `sdd-sync` пишет обратно байт-в-байт), а Meta тикета — без backtick; `checkTrackers`' `norm()` их не срезал → лавина ложного `SDD_TRACKER_STATUS_DRIFT` (34 находки на реальном дереве, из них 32 — чисто формат). После обеих правок реальный дрифт — 2 находки (TSK-55 — подтверждённый живой баг; TSK-88 — побочный эффект существующей коллизии Task-ID между scope, уже отдельно `SDD_TASK_ID_COLLISION`).
- **Risk accepted:** Включение классификации вскрыло другой существующий разрыв: v1-тикеты без `<!--SECTION:-->`-разметки (`isTicket` их не узнаёт) дают `SDD_TRACKER_ORPHAN_ROW`/`SDD_TRACKER_MISSING_ROW` шумом на легаси-дереве (55 + 15 находок) — включая намеренно вычищенные из трекера superseded-тикеты (`agent-inbox` TSK-156…170). Смягчено по образцу `SDD_BDD_SCENARIO_UNTESTED`: `SDD_TRACKER_STATUS_DRIFT` — всегда error (редкий, всегда genuine после того как обе стороны разрешились); `SDD_TRACKER_MISSING_ROW`/`SDD_TRACKER_ORPHAN_ROW` — `warn` на v1 (default), `error` на v2 (`TicketRef.flowVersion`/`TrackerRowRef.flowVersion`, из `ticketFlowVersion`). Сам разрыв `isTicket` на legacy-разметке — не тронут, отдельная задача.
- **Update (isLegacyTicket закрыл разрыв):** легаси-тикеты (v1, голые заголовки `## N. Meta`/`## N. Execution Log`) теперь распознаются отдельно (`isLegacyTicket`) и участвуют в task-DAG/tracker↔ticket через `legacyTicketRef` (Task-ID/Status/Dependencies из `legacyHeaderBody`, без полного `checkTicket` — см. Module Contracts). Было (обход слепой к легаси, 125 файлов) → стало (76 легаси-тикетов видимы, 201 файл): `SDD_TRACKER_ORPHAN_ROW` 55 → 2 (обе находки — реальный дрифт: трекер-строка без тикета на диске); `SDD_TRACKER_MISSING_ROW` 15 → 37 (рост, не шум — легаси-тикеты, которых раньше не было в `ticketRefs`, теперь честно сверяются с трекером; большая часть — намеренно вычищенные из трекера superseded-тикеты, `agent-inbox` TSK-156…170, задокументированные в `tasks/agent-inbox/README.md`). Т.к. `MISSING_ROW` остаётся массовым и содержит легитимные (задокументированные) исключения, а не только настоящий дрифт, безусловный `error` для него НЕ введён — flowVersion-градация (D-CK012) остаётся. `ORPHAN_ROW` теперь единичный и настоящий на всём дереве, но severity-функция общая для обоих кодов (`severityOf`) — раздельная градация — YAGNI, пока `ORPHAN_ROW` не даёт собственного мотивированного кейса.

### D-CK011 — B5: scope-deps ↔ портал-граф (`SDD_SCOPE_DEP_UNDECLARED`)

- **Status:** active
- **Why:** портал `## Scope Graph` (mermaid `X --> Y`) — структурная истина зависимостей; спека scope в `## 7 Scope Dependencies` («Depends on: [...]») — свободная форма (имена + wildcard `prefix-*` + проза). `checkScopeDeps` сверяет **направление граф→спека**: каждое ребро портала `<scope> --> <dep>` должно быть отражено в «Depends on» (точное имя ИЛИ wildcard-префикс); непокрытое → warn. Только это направление: спека-сторона слишком шумна для обратной сверки (wildcard/проза дали бы ложные). Проза в строке безвредна — проверяется лишь покрытие рёбер графа, лишние токены не флагают. Рёбра портала предчитываются один раз в `--all`; scope-имя = stem basename файла. Решает прежнюю отложенность B5 (свободная форма) — wildcard-толерантность + односторонность убирают хрупкость.
- **Risk accepted:** warn, не error (свободная форма). Обратное направление (спека заявила dep, которого нет в графе) НЕ ловим. Спека без секции `SCOPE_DEPENDENCIES` (модули, легаси) → пропуск.

### D-CK013 — Иерархия спек: module↔parent-index сверка (`SDD_MODULE_NOT_IN_INDEX`/`SDD_PARENT_MODULE_NOT_INDEX`)

- **Status:** active
- **Why:** `AX_HIERARCHICAL_SPECS`/`AX_SCOPE_STAYS_THIN` описывали правило прозой без механической проверки: ни одна проверка не ловила орфан-модуль (спека на диске, не упомянутая в Module Map/ссылках родителя) и не проверяла, что родительский модуль с дочерними модулями стал тонким индексом (рекурсия `SDD_SCOPE_BLOATED` на уровень модуля). `checkSpecHierarchy` (пер `checkBddCoverage` — вход весь набор spec-файлов дерева, а не один файл) находит ближайшего предка-спеку выше по каталогам (namespace-директории без своей спеки — легально, пропускаются транспарентно) и проверяет: (1) родитель ссылается на модуль markdown-ссылкой `](…spec.md)`; (2) если у модуля есть дочерние модули на любой глубине, сам он не несёт `ENTITY_INVENTORY`/`MODULE_CONTRACTS`.
- **Risk accepted:** ссылка ловится текстовым матчем `]\(…spec.md\)` резолвнутым относительно директории родителя — форматирование ссылки (относительный путь любой формы) не важно, но ссылка ДОЛЖНА резолвиться в тот же файл; ссылка на модуль текстом без markdown-синтаксиса не засчитывается (осознанно — механика, не NLP).

### `getRuleDeps`

- **Usage Waiver:** Читает и парсит `<DependsOn>` одного rule-файла, memoized — изолирует I/O-границу от обхода графа (`buildRuleDepsMap`); rule-файлы общие для многих тикетов в `--all`, читаются не более раза.

### `buildRuleDepsMap`

- **Usage Waiver:** Разворачивает набор seed-правил в полный транзитивный `<DependsOn>`-граф — изолирует обход графа от чтения отдельного файла (`getRuleDeps`).

### `getTestFileIndex`

- **Usage Waiver:** Строит один раз плоский список (forward-slash normalized) всех `*.test.*`/`*.spec.*` файлов репо — изолирует обход директорий от поиска тестового файла по declared-ссылке (используется в BDD_COVERAGE для всех тикетов `--all`). Матчинг по этому списку — `resolveTestFileMatches` (`shared/sdd/bdd-coverage.ts`), см. D-CK016: declared test-file = **basename ИЛИ путь**, обе формы матчатся по суффиксу пути, не по точному равенству basename.

### `getTestCaseNames`

- **Usage Waiver:** Читает и извлекает имена `it()`/`test()` одного тестового файла, memoized — изолирует I/O от индекса файлов (`getTestFileIndex`).

### `checkFileConsumersResolvable`

- **Usage Waiver:** Запускает grep-проверку `@consumers:` для одного файла — изолирует I/O-обёртку (запуск grep, чтение файла) от чистой классификации записей (`checkConsumersResolvable`).

### `findRepoRoot`

- **Usage Waiver:** Поднимается до ближайшего `package.json` — нужна, потому что сканируемый корень `--all` может быть вложенным поддеревом, а не настоящим корнем репозитория.

### `ticketFlowVersion`

- **Usage Waiver:** Определяет flowVersion тикета по сегменту `tasks/<scope>/` — в отличие от `specFlowVersion` (сегмент `specs/<scope>/`), у тикета нет `specs`-сегмента для привязки, поэтому нужна отдельная функция с явно переданным `repoRoot`.

### `splitConsumerEntries`

- **Usage Waiver:** Экспортирована отдельно для изолированного юнит-теста алгоритма depth-tracking comma-split (разбор `@consumers:` с учётом вложенных скобок) без остального парсинга заголовка.

### `checkTableCells`

- **Usage Waiver:** Экспортирована для прямых юнит-тестов политики таблиц (16 кейсов в `check-spec-structure.test.ts`); в продакшен-коде вызывается один раз из `checkSpecStructure`.

### `SENTENCE_BREAK`

- **Usage Waiver:** Регексп границы предложения (конец фразы + заглавная буква) для эвристики «многословная ячейка таблицы» в `checkTableCells`; вынесен как модульная константа, чтобы граница была видна отдельно от логики проверки.

### `isTrackerIndex`

- **Usage Waiver:** Классификация Tracker Index по содержимому (Task-ID/Status таблица), а не по имени файла — вынесена отдельной функцией с собственным JSDoc, чтобы ветка `--all` не несла многострочный комментарий (лимит `RegionCommentCheck`); единственный вызов внутри цикла обхода.

### D-CK019 — Schema-aware ticket coverage policy is fail-closed

- **Status:** active
- **Why:** canonical scaffold adds `COVERAGE_POLICY:v1`; `sdd-check` rejects missing/duplicate/conflicting policy, required without exactly one Role=`coverage` reader + one exact test owner or without reader Required-by linkage to the owner rule, and N/A without reason or with owner/reader. Tickets without marker/coverage fields/role are grandfathered pre-schema and receive no inferred gate.

### D-CK023 — Checked phases require current CLI-owned receipts

- **Status:** active
- **Why:** `PHASE_RECEIPTS:v1` tickets cannot close a phase by checking a box or writing a prose log line. `--task` and `--all` parse the paired receipt, recompute the structural phase plan and exact Target File hash, and reject missing, malformed, incomplete, or stale evidence. Legacy tickets without the marker and without receipts remain grandfathered; any present receipt is always validated.

### D-CK027 — General audit filesystem evidence is fail-closed

- **Status:** active
- **Why:** `walkMd`, bare Task-ID corpus resolution, per-file reads and `checkSpecRefs` used to collapse `EACCES`/I/O or symlink aliases into an empty subtree or skipped reference, so `--all`, `--task` or `--changed` could report clean without observing selected evidence. General modes now retain a typed `{path, reason}` read failure and emit one `ERR_CLI_SDD_CHECK_READ_FAILED`; an explicitly selected root leaf and every relative component below cwd must be real non-symlink directories, and any non-skipped symlink inside the SDD Markdown walk is failed evidence rather than an omitted file. Absolute paths may cross an OS-owned alias before the selected leaf (for example macOS `/var` → `/private/var`), while the selected leaf and all walked descendants remain strict. Only `ENOENT` for the optional implicit `specs/`/`tasks/` roots remains ordinary absence. Review modes keep their narrower review-specific error contracts.

### D-CK028 — Rule cascade never substitutes absence for unreadable dependency evidence

- **Status:** active · **Extends:** D-CK027
- **Why:** `getRuleDeps` formerly returned `[]` on read failure, making an unreadable rule indistinguishable from a proven leaf and allowing `RULES_CASCADE_CLOSURE` to report clean. The memoized observation is now `ok | {path,reason}`; every failed reachable rule becomes `ERR_CLI_SDD_CHECK_READ_FAILED`, while a readable rule with no `<DependsOn>` remains the only valid empty dependency list.

### D-CK029 — Direct and transitive rule bytes share one repository identity boundary

- **Status:** active · **Extends:** D-CK028
- **Supersedes:** D-CK007
- **Why:** direct `Rules:` links used `existsSync`, while transitive `<DependsOn>` entries were read through raw `resolve` + `readFileSync`; a symlink or escaping path could therefore inject external bytes into mechanical evidence. Both entry kinds now pass through the same exact repo-local regular non-symlink proof and identity-bound read. Absolute paths, traversal, any symlink component, missing/special files, and unreadable files fail as `ERR_CLI_SDD_CHECK_READ_FAILED` before their content is parsed; ordinary local rules and cycle/closure semantics are unchanged.

### D-CK030 — Review readiness requires typed VCS evidence

- **Status:** superseded by D-CK036 · **Extends:** D-CK025
- **Why:** `--review-ready` used changed files to expose a changed spec without `CHANGE_MANIFEST`, but collapsed any `getChangedFiles` error to `changedSpecs = null`; the same unmarked spec could then disappear and readiness pass. A genuine repository/HEAD/diff failure now returns `ERR_CLI_SDD_CHECK_GIT_EVIDENCE` immediately. The one accepted exception remains a proven symbolic unborn branch: its cached + untracked set is checked normally, so an unmarked greenfield spec is red while a complete reviewed bundle remains supported.

### D-CK031 — Pre-index authoring gate is exact-ticket and bounded

- **Status:** active
- **Why:** scaffold previously filled many tickets before the first full audit, so one repeated authoring mistake became dozens of late findings. `--task <created-ticket-path> --authoring` validates one ticket immediately after filling it and before planning, indexing or creating the next. Required sections derive from `TEMPLATES.task.sections`; the gate also requires complete Meta fields, at least one parseable overview phase with its complete `PHASE_P<N>`, filled BDD/Verification/Test Coverage and no unresolved authoring placeholders. It additionally checks anchors, owner metadata, Task-ID/status, resolvable spec/rule references and cascade, plus BDD/deferred grammar. It deliberately excludes receipts, runtime-file existence, coverage execution/results, language and sibling/global checks. A Task-ID is rejected because resolving it requires a corpus scan; the exact path returned by `sdd-new` is mandatory. At most 12 findings are printed with one exact repair action: fix only this ticket and rerun the same command.

### D-CK032 — Authoring feedback is phase-addressable and copy-ready

- **Status:** active · **Extends:** D-CK031
- **Why:** exact-ticket boundedness did not prevent an author from searching for examples when the finding named only a broad section. Full `--authoring` now proves the transition-ready ticket, while `--phase P<N>` gives a lazy inner loop over only that phase and the PHASES_OVERVIEW dependency boundary. New authoring findings carry stable code, repository-relative file, absolute file line, section, and a short `Fix:`/`Example:`. READ and future CREATE Target Files share the existing exact-path validator; BDD coverage is structurally tied to scenario type/count and a declared test phase, without runtime-file existence checks.

### D-CK033 — Rule evidence is mechanical in the same authoring slice

- **Status:** active · **Extends:** D-CK028, D-CK032
- **Why:** asking the scaffold agent to prove rule-file existence duplicated deterministic work and encouraged filesystem exploration. The scaffold prompt now keeps only semantic direct-candidate selection from the approved cascade (`Triggers`/`SkipWhen`) and delegates repository evidence to this gate; its former manual `H_MISSING_RULE_FILE`/recursive `<DependsOn>` proof is removed. `--authoring --phase P<N>` sends only that phase's parsed Rules through the existing repo-identity reader, transitive `buildRuleDepsMap`, and closure checker. Missing/unsafe/unreadable direct or transitive evidence and an omitted readable dependency address the ticket's absolute Rules line as `PHASE_P<N>` with the exact rule/dependency and copy-ready repair; an error in another phase is silent until that phase or full authoring is checked. Full authoring retains the whole-ticket cascade gate.

### D-CK034 — Command evidence must belong to an executable test phase

- **Status:** active · **Extends:** D-CK032
- **Why:** an exact `Role=probe` row could make scaffold feasibility green even when its mapped file was owned by a bootstrap/config phase, while authoring later rejected the same ticket or execute tried the command before its config existed. Authoring and scaffold feasibility now require exactly one `test` phase whose Target Files owns the mapped Test Scenario Coverage file. The diagnostic teaches the complete repair—future CREATE smoke test plus its test phase—and explicitly rejects `package.json` as test evidence.

### D-CK035 — Capability state machine removed from ticket authoring

- **Status:** active · **Supersedes:** прежнее active-решение этого же ID
- **Why:** capability adapters, package providers и пред-Gate JSON превращали агентское планирование в ручное заполнение машинного автомата. Это не доказывало семантическую согласованность и в draft.64 породило дробление инфраструктуры, скрипты обработки JSON и противоречивых критиков. Теперь authoring проверяет только устойчивые структурные факты; порядок `nvm/npm/dependencies` и отсутствие конфликтов в фактических тикетах обязан явно доказать независимый семантический reviewer до операторского Gate 2. Исполнение подтверждается реальными командами `sdd-verify`.

### D-CK036 — Semantic approval is not a public `sdd-check` state machine

- **Status:** active · **Supersedes:** D-CK018, D-CK020, D-CK021, D-CK022, D-CK024, D-CK025, D-CK026, D-CK030
- **Why:** `--review-state`, `--review-publication` и `--review-ready` заставляли агента вести manifest, хэши, раунды critic и отдельный publication set. Это скрытый orchestration state, а не структурная проверка. Публичный CLI снова ограничен `--task`, `--all`, `--changed` и authoring-срезом. Независимый reviewer проверяет фактические артефакты, оператор подтверждает их, а человекочитаемый marker хранится в canonical artifact; модель по Git evidence решает, не устарел ли он.
- **Risk accepted:** CLI пока не доказывает семантическую свежесть marker. Это намеренная граница ответственности; при сомнении модель сбрасывает marker в `pending` и повторяет review/approval.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/common/changed-files.ts`, `shared/sdd/check.ts` (→ `section.ts`, `ticket.ts`), `shared/sdd/portal.ts` (parseScopes + parseGraphEdges), `#logger`
- **Provides to:** `gennady.ts`; вызывается из скилов `audit` / `reconcile` / `check`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
