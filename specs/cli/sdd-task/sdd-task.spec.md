# Module: `sdd-task`

**Module:** sdd-task · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Планировочная поверхность тикета для оркестратора `execute`. `sdd-task <ticket-path|Task-ID>` извлекает ТОЛЬКО планировочные секции (Meta + Phases Overview + тело каждой фазы + Verification) и собирает per-phase read-manifest (`AX_READ_PER_MANIFEST`): что фаза читает (rules / specs / ticket-секции / target-файлы / gates) и **что НЕ читает**. Аргумент — путь ИЛИ голый Task-ID (резолвится сканом по Meta, `AX_TASK_RESOLUTION`, D-TK006). Оркестратор читает этот вывод вместо всего тикета и не лезет в тела фаз, BDD, спеки, код. **Без Task-ID** `sdd-task` отдаёт **карту исполнения** — детерминированный pickable-набор (готовые сейчас, каждый со своим путём) + заблокированные (чем, тоже с путём) + строка `root:`, посчитанный из трекеров (`pickableTasks`, D-TK004); это карта для LOGIC_SWITCH в `execute` (next / specific / batch). Карта также печатает `GATE_QUEUE_DIAG` — диагностические строки о несостыковках между одобренными infrastructure-областями портала и нарезанными под них тикетами (D-TK007): область одобрена, но тикетов ещё нет, или имя области в тикете не совпало с порталом (совпадение регистро- и дефис-независимое). Парсеры тикета вынесены в `shared/sdd/ticket.ts` (переиспользует `sdd-check`).

`--group-scope <Task-ID>` выдаёт готовый review-context всей sibling-группы (ровно тикеты одного
owning spec, а не все тикеты его каталога), а
`--task-scope <Task-ID>` — те же поля для одного тикета: `spec`, tickets, bounded `files`,
`contract-anchors`, source-only `lint-files`, `code-roots`, git provenance, Handoff artifacts и
`coverage-gates`. Блок `coverage-gates:` переносит по одной структурной политике на тикет прямо из
§Verification: `required — <verbatim command>`, `not-applicable — <reason>`, `legacy-unset` либо
`INVALID`. Инструмент не выводит применимость из kind/path/extension, не придумывает платформу,
`testcov`, файлы или default threshold и не смешивает тикеты. Audit исполняет только required-команды
verbatim; N/A и grandfathered legacy пропускает, INVALID блокирует до scaffold/reconcile.
Перед выдачей контекста команда атомарно читает весь v2 ticket corpus, валидирует exact
repo-relative Target/Deleted/Handoff paths и получает git evidence без shell. Unborn HEAD — явный
fallback к declared files; любой другой git/corpus/path failure блокирует контекст, а не становится
пустым списком. Отсутствующий файл допустим только как `Deleted Files` tombstone с HEAD-базисом.

**Key properties:**

- Planning-only — Meta, Phases Overview, gates, и per-phase manifest; никогда не тела фаз/код
- Manifest-per-phase — rules фазы + Spec References из Meta + секции (PHASE_P<n>, BDD, VERIFICATION) + target-файлы + DO-NOT-READ
- Gate-matching — каждой фазе сопоставляются gate, чей `Required by` пересекается с rule-id фазы (basename без `.xml`)
- Fail-closed Verification — a missing section/table or malformed/non-three-column table rejects task, `--phase`, `--group-scope`, and `--task-scope` before emitting any worker/reviewer context; a command code span is unwrapped to its exact runtime bytes
- Fail-closed review evidence — `../`, absolute paths, globs, missing Target/Handoff files and canonical symlink escapes are rejected; corrupt git and unreadable/malformed v2 ticket members never become an empty clean scope

**Invariants:**

- Тело каждой фазы извлекается отдельной секцией `PHASE_P<n>` — не общим чтением
- exit `0` поверхность · `1` файл · `2` не тикет (нет Meta) · `4` нет пути
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-task specs/cli/core/core.task-foo.md
[sdd-task] cli-foo — [ ] TODO
Purpose: Build foo
Scope/Module: cli / core
Dependencies: none
Spec References:
  - Contract: FooPort (specs/cli/core/core.spec.md#fooport)

Phases Overview:
  P1 impl  deps=—  status=[ ]

Per-phase read-manifest (AX_READ_PER_MANIFEST):

▸ P1 — impl  [ ]
  objective:   implement foo
  READ rules:  ai/directives/coding/typescript-rules.xml
  READ specs:  specs/cli/core/core.spec.md#fooport
  READ ticket: PHASE_P1, BDD, VERIFICATION
  READ files:  src/foo.ts
  gates:       npm run type-check
  inputs:      none
  DO NOT READ: other phase bodies · code outside READ files · specs beyond the anchors above

Gates (all):
  npm run type-check  ← typescript-rules
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                                                                                            | Type         | Purpose                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `run`                                                                                                           | Command      | Точка входа CLI: извлечение планировочных секций, сборка, формат (или `--phase`)                                                    |
| `formatPlan`                                                                                                    | Utility      | Рендер планировочной поверхности + per-phase manifest + DO-NOT-READ                                                                 |
| `formatPhase`                                                                                                   | Utility      | Рендер компактного контекста одной фазы (`--phase`): gates+hint, exit, filtered read-manifest, `[HANDOFF]`                          |
| `gateHint`                                                                                                      | Utility      | Однострочник «как удовлетворить» для gate-команды, по ключевому слову                                                               |
| `phaseNotFound`                                                                                                 | Utility      | Билдер диагностики: неизвестный `--phase`, exit 2                                                                                   |
| `ruleId`                                                                                                        | Utility      | rule-link → rule-id (basename без `.xml`) для матчинга gate                                                                         |
| `parseMetaInfo`                                                                                                 | Utility      | (`shared/sdd/ticket`) Meta → taskId/status/purpose/scope/module/deps/specRefs                                                       |
| `parsePhasesOverview`                                                                                           | Utility      | (`shared/sdd/ticket`) таблица фаз → `PhaseOverview[]`                                                                               |
| `parsePhaseDetail`                                                                                              | Utility      | (`shared/sdd/ticket`) тело фазы → objective/rules/specRefs/targetFiles/deletedFiles/inputs/exit                                     |
| `parseVerificationTable`                                                                                        | Utility      | (`shared/sdd/ticket`) strict 3-cell таблица gate → gates или teaching issues                                                        |
| `parseTicketCoveragePolicy`                                                                                     | Utility      | (`shared/sdd/ticket`) структурная coverage policy → required command / N/A reason / legacy / invalid                                |
| `parsePhaseHandoffs`                                                                                            | Utility      | (`shared/sdd/check`) EXECUTION_LOG → phase id → дословная `**Handoff →**`-строка                                                    |
| `collectTicketCorpus`                                                                                           | Utility      | Полный typed snapshot тикетов + exact bytes; любой unreadable/symlinked member возвращает failure вместо частичного graph/map       |
| `resolveTicketArg`                                                                                              | Utility      | Аргумент → содержимое: безопасный путь либо (похож на ID) полный fail-closed скан по Meta Task-ID (D-TK006/D-TK016)                 |
| `collectGroupRefs` / `boundGroupChangedFiles`                                                                   | Utility      | Exact-owning-spec группа + git-изменения, атрибутируемые только этой группе (D-TK013)                                               |
| `validateTicketReviewPaths` / `validateTicketTargetClaims`                                                      | Utility      | Exact repo-contained Target/Deleted/Handoff evidence + безопасные foreign target claims (D-TK014)                                   |
| `withResolutionLine`                                                                                            | Utility      | Добавляет строку резолва `[sdd-task] <id> → <path>` к успешному outcome, когда аргумент был ID                                      |
| `looksLikeTaskId`                                                                                               | Utility      | (`shared/sdd/task-id`) грамматика `<ACR>-<slug>` без проверки длины — есть ли смысл резолвить как ID                                |
| `queuedInfraGateTicketIds`                                                                                      | Utility      | (`shared/sdd/gate-queue`) missing gate → exact Bootstrap Requirement/ticket/phase owner; zero/ambiguous mapping fails closed        |
| `GateQueueDiagnostic`                                                                                           | Value Object | (`shared/sdd/gate-queue`) `kind: 'infra-spec-no-tickets' \| 'scope-name-mismatch'` + готовое `message` для строки `GATE_QUEUE_DIAG` |
| `badInvocation` / `fileError` / `notATicket` / `unknownIdError` / `ambiguousIdError` / `verificationTableError` | Utility      | Билдеры диагностик, включая fail-before-context malformed Verification                                                              |
| `MetaInfo` / `SpecRef` / `PhaseOverview` / `PhaseDetail` / `Gate`                                               | Value Object | Структуры тикета (`shared/sdd/ticket`)                                                                                              |
| `TicketCoveragePolicy` / `CoverageGate`                                                                         | Value Object | Пер-тикет политика покрытия и её task-scoped транспорт без реконструкции                                                            |
| `TaskOutcome`                                                                                                   | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                                            |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Planning Surface

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<ticket-path>` задан и читается; есть секция `META`
- Postconditions:
  - Вывод содержит Meta-сводку, Phases Overview, per-phase manifest, и все gate
  - Каждой фазе сопоставлены только gate с пересечением `Required by` ∩ rule-id фазы
  - Нет тел фаз / BDD / кода в выводе
- Invariants:
  - Каждая фаза извлекается своей секцией `PHASE_P<n>`
  - Отсутствие секции фазы помечается, не падает
  - Verification принимает ровно `Command | Required by | Role`; raw shell pipe must be inside a code span whose outer backtick run is longer than every inner run

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument                              | Type   | Description                                                                           |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `<ticket-path\|Task-ID>`              | string | Путь к тикету ИЛИ голый Task-ID → планировочная поверхность одного тикета             |
| `<ticket-path\|Task-ID> --phase P<n>` | string | Компактный контекст ОДНОЙ фазы вместо полной поверхности — см. 5.1                    |
| _(без аргумента)_                     | —      | **Карта исполнения**: pickable-набор + заблокированные (детерминированно из трекеров) |

`<ticket-path|Task-ID>` → поверхность одного тикета. Путь читается как раньше; голый Task-ID (грамматика `shared/sdd/task-id.ts`) резолвится сканом дерева по Meta Task-ID (`AX_TASK_RESOLUTION`, D-TK006) — ровно один матч печатает строку резолва `[sdd-task] <id> → <относительный путь>` и продолжает как обычно; несколько матчей → exit 2 со списком кандидатов+путей; ноль → exit 2 со списком известных Task-ID (или «очередь пуста»). Без аргумента → карта исполнения (что готово сейчас + что чем заблокировано), `pickableTasks` (D-TK004) — каждая строка (pickable и blocked) несёт относительный путь тикета и общую строку `root:`, так что карта самодостаточна без второго поиска. Карта также печатает `GATE_QUEUE_DIAG` (D-TK007) — по строке на каждую диагностику `queuedInfraGateTicketIds`: одобренная infra-область без нарезанных тикетов, или имя области в тикете, не совпавшее с порталом (регистро- и дефис-независимое сравнение); диагностики считаются только когда readiness ещё не `ready`.

### 5.1 `--phase P<n>` — компактный контекст одной фазы

Печатает только то, что фаза читает: `objective`, `gates` (каждый — с однострочником «как удовлетворить»), `exit`, read-манифест (rules · specs · ticket-секции · target-файлы), и, если это не первая фаза, `[HANDOFF]` — дословные `**Handoff →**`-строки из `EXECUTION_LOG` предыдущих завершённых (`[x]`) фаз, с префиксом `Handoff ←P<k>:`. `READ specs` берёт фазовое поле `Spec Refs` (см. `PHASE_P<n>` в task-ticket-structure), если оно объявлено; иначе — весь список Meta Spec References (обратная совместимость со старыми тикетами без этого поля). Завершается строкой `next:` — прочитать перечисленное, исполнить фазу по протоколу, залогировать `sdd-log` + Handoff-строку. Неизвестный `--phase` → exit 2 с перечнем известных фаз.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-task/
├── index.ts             # Entry point for dynamic import
├── sdd-task.cmd.ts      # Command: extract planning sections, parse, assemble, format
├── sdd-task.types.ts    # error codes, TaskOutcome, ruleId, formatPlan
├── help.ts              # Help text output
└── __tests__/sdd-task.cmd.test.ts

shared/sdd/ticket.ts     # parseMetaInfo / parsePhasesOverview / parsePhaseDetail / parseVerification + __tests__/ticket.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit (parsers + run) + lint + typecheck + ручной smoke.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-TK001 — Парсеры тикета в `shared/sdd/ticket.ts`

- **Status:** active
- **Why:** `sdd-check` (аудит) парсит те же секции (Meta, Phases, Verification, Spec References). Общее ядро избегает двух расходящихся парсеров одного формата.
- **Risk accepted:** Низкий.

### D-TK002 — Приём пути тикета, не task-id

- **Status:** superseded by D-TK006
- **Why:** Резолв id → путь — отдельная забота оркестратора (`AX_TASK_RESOLUTION`). К моменту вызова путь известен. Тул остаётся узким и детерминированным.
- **Risk accepted:** Прямой вызов «по id» из CLI не сработает; для флоу это не нужно (оркестратор даёт путь).
- **Update:** часть «выбор pickable-таска — забота оркестратора» СУПЕССИРОВАНА D-TK004 — pickable теперь даёт сам тул (режим-карта), оркестратор не читает трекеры глазами. «Прямой вызов по id не сработает» СУПЕССИРОВАНО D-TK006 — живой инцидент показал, что карта сама учит агента звать `sdd-task <id>`, а `run()` это не понимал; тул теперь резолвит id сам.

### D-TK004 — Режим-карта (без аргумента): детерминированный pickable

- **Status:** active
- **Why:** оркестратор не должен «глазами» читать трекеры, чтобы понять, что готово (детерминизм > догадки — общий принцип флоу). `sdd-task` без Task-ID обходит тикеты → `ticketRef` (status+deps) → `pickableTasks` (`shared/sdd/check`: TODO + все deps DONE; placeholder «None…» = нет deps) → карта (pickable + заблокированные, чем). `execute` LOGIC_SWITCH (next / specific / batch) берёт карту тулом. Снимает нагрузку догадок с агента.
- **Risk accepted:** Meta с прозой в Dependencies (запятые) даёт мусор-deps → тикет ложно blocked; чинится на стороне данных (находка: TSK-55 несёт прозу в deps).

### D-TK003 — Поэтапное извлечение секций фаз

- **Status:** active
- **Why:** Цель тула — не дать оркестратору прочитать весь тикет. Сам тул тоже извлекает каждую фазу отдельной секцией `PHASE_P<n>`, а не общим чтением — выходные manifest'ы по конструкции узкие.
- **Risk accepted:** Нет.

### D-TK005 — `--phase P<n>`: компактный контекст фазы, READ specs фазой, Handoff из EXECUTION_LOG

- **Status:** active
- **Why:** живые воркеры реверсили минифицированный `node_modules/gennady`, потому что полная поверхность (`sdd-task <ticket>`) печатала ОДИН список spec-якорей на все фазы и не передавала решения предыдущей фазы (Handoff-строки тонули в `EXECUTION_LOG`). `--phase` даёт узкий, per-phase контекст: gates с однострочным «как удовлетворить», `READ specs` из фазового `Spec Refs` (fallback на весь Meta-список для тикетов без этого поля — обратная совместимость), и `[HANDOFF]` — дословные `**Handoff →**` завершённых фаз, склеенные `parsePhaseHandoffs` (`shared/sdd/check.ts`).
- **Risk accepted:** `Spec Refs` — новое опциональное поле в `PHASE_P<n>`; старые тикеты без него получают фоллбек на полный список, не пустоту.

### D-TK006 — Голый Task-ID резолвится сам (`AX_TASK_RESOLUTION`)

- **Status:** active
- **Why:** живой инцидент — карта (режим без аргумента) отдаёт Task-ID и учит агента «вызови `sdd-task <id>`», но `run()` трактовал любой аргумент как путь: `readFileSync(resolve(ticket))` на голом ID падал file-not-found, агент в панике grep'ал репозиторий. Тул сам заводил в тупик. Фикс: аргумент, не прочитавшийся как путь и совпадающий с грамматикой Task-ID (`shared/sdd/task-id.ts#looksLikeTaskId`), резолвится сканом того же дерева тикетов, что и карта, по Meta Task-ID. Ровно один матч → работает, первой строкой печатает резолв `[sdd-task] <id> → <путь>`; несколько → exit 2 со списком кандидатов+путей; ноль → exit 2 со списком известных ID. Карта дополнительно печатает `root:` и путь на каждой pickable/blocked строке — самодостаточна и без резолва.
- **Risk accepted:** Резолв сканирует всё дерево на каждый вызов с голым ID (как и режим-карта) — цена уже принята D-TK004; коллизия Task-ID (два тикета с одним ID) уже ловится `SDD_TASK_ID_COLLISION` в `sdd-check`, здесь просто не падает необработанно.

### D-TK007 — Карта исполнения печатает `GATE_QUEUE_DIAG` для несостыковок портал↔тикеты

- **Status:** active
- **Why:** `queuedInfraGateTicketIds` (`shared/sdd/gate-queue.ts`) уже вычисляла `ticketIds` для карты, но расхождения, из-за которых infra-тикет НЕ попадал в очередь, были не видны оператору/агенту — приходилось лезть в портал и тикеты руками. Функция вернула `{ticketIds, diagnostics}`: `diagnostics` — по одной записи на найденную несостыковку: `'infra-spec-no-tickets'` (область одобрена, тикетов нет — нарезай scaffold'ом) и `'scope-name-mismatch'` (имя области в тикете не совпало с порталом; сравнение регистро- и дефис-независимое, похожие имена подсказываются в сообщении). Карта (`sdd-task` без Task-ID) печатает по строке `GATE_QUEUE_DIAG: <message>` на каждую диагностику. `sdd-state` использует ту же функцию, но берёт только `ticketIds` — диагностики в его снимке пока не печатаются (см. `specs/cli/sdd-state/sdd-state.spec.md`).
- **Risk accepted:** Диагностики считаются только пока readiness не `ready` (на `ready` функция возвращает `{ticketIds: [], diagnostics: []}` сразу) — на готовом проекте несостыковка портал↔тикеты этим механизмом не обнаруживается; не новый риск, тот же охват, что был у `ticketIds` раньше.

### D-TK010 — Infra setup exemption требует exact phase ownership

- **Status:** active · **Extends:** D-TK007
- **Why:** execution map, `sdd-task --phase` и `sdd-verify` используют один `GateQueueResult.owners`. Phase получает setup только если она сама объявляет конкретный missing gate и её Target Files покрывают Gate Artifacts из infra Bootstrap Requirements; unrelated phase того же ticket и второй claimant блокируются.
- **Risk accepted:** На `ready` mapping не нужен и не вычисляется.

### D-TK008 — Coverage applicability is ticket-owned structured data

- **Status:** active
- **Why:** path extensions, phase kind and default `80` invented a Node `testcov` gate for config/infra work. `COVERAGE_POLICY:v1` now carries exactly `required` + one owner Phase-ID + one Role=`coverage` command or `not-applicable` + reason. Group/task scope transports owner and command verbatim; pre-schema tickets are explicitly `legacy-unset` and never inferred.
- **Risk accepted:** a manually authored new ticket that removes both marker and fields is indistinguishable from legacy; canonical scaffold always emits the marker, and review/check of new output owns that boundary.

### D-TK011 — Phase dispatch requires current dependency receipts

- **Status:** superseded by D-TK012
- **Why:** verifier-side dependency validation stopped mutation, but `sdd-task --phase` could already hand a worker stale inputs. The shared dependency preflight now runs before phase context is emitted: every dependency exists and is `[x]`; receipt-aware tickets additionally require current CLI evidence. `sdd-verify` repeats the same check as defense in depth.
- **Risk accepted:** legacy tickets without `PHASE_RECEIPTS:v1` retain checked-status compatibility until scaffold rewrites them.

### D-TK012 — Dependency preflight closes the transitive graph

- **Status:** active · **Supersedes:** D-TK011
- **Why:** direct-only validation let P3 dispatch through a current P2 while P1 was stale. The shared preflight now walks the complete dependency closure deterministically, rejects missing phases/cycles, and validates ancestors leaf-first in both `sdd-task --phase` and `sdd-verify`.
- **Compatibility:** without `PHASE_RECEIPTS:v1`, an ancestor with no receipt remains grandfathered; any receipt that does exist is validated and cannot be disabled by deleting the schema marker. With the marker, every ancestor requires current CLI evidence.

### D-TK013 — Group audit consumes only changes attributable to its exact owning spec

- **Status:** active
- **Why:** repository-wide `git diff` made `--group-scope B` include dirty files and tickets from an unrelated concurrently implemented spec A. A sibling group is now identified by exact `<name>.spec.md` ownership, not directory co-location. Its bounded git slice always includes the selected spec/tickets and exact declared Target Files (including deleted paths and targets shared by multiple groups). An undeclared new neighbour is included only below a target directory private to this group; if another ticket claims an equal/ancestor/descendant target directory, the neighbour is ambiguous and omitted until a ticket declares it. `--task-scope` retains its existing one-ticket same-directory filter for compatibility.
- **Risk accepted:** an undeclared file created in a directory shared by multiple groups cannot be attributed mechanically. Omitting it is safer than silently auditing it under the wrong spec; scaffold/execute must add it to Target Files, after which exact-target inclusion makes it visible.

### D-TK014 — Group context is an evidence transaction, not a best-effort list

- **Status:** active · **Extends:** D-TK013
- **Why:** shell-interpolated git and catch-to-empty ticket/path reads could emit a clean-looking partial scope after corrupt HEAD, an unreadable sibling, or an escaping path. Git now runs by argv and returns `ok` / proven `no-head` / `error` with status+stderr. The command snapshots every v2-named ticket before attribution, rejects malformed/unreadable members, and validates declared paths lexically and canonically. Target/Handoff paths are exact existing files; a missing path is valid only under `Deleted Files` with a HEAD baseline.
- **Compatibility:** a genuinely unborn symbolic branch remains usable and reports an explicit empty-tree baseline: cached/index entries (including intent-to-add) plus untracked paths are attributable to the group instead of being silently dropped. With no parent tree there is no deletion baseline; once HEAD exists, staged/unstaged deletions remain in `git diff HEAD`. Globs were never valid phase Target Files; group audit now enforces the same rule instead of widening them heuristically.

### D-TK015 — Phase dispatch uses the same fail-closed path evidence

- **Status:** active · **Extends:** D-TK011/D-TK014
- **Why:** `--group-scope` rejected an escaping or symlinked Target/Handoff, but `--phase` could print that same unsafe path as `READ files` and tell a worker to execute it. Before rendering any phase context, `sdd-task --phase` now structurally validates every anchored Target File as an existing regular repo file, every Deleted File as an absent tracked HEAD tombstone, and every parsed prior Handoff artifact against the same exact no-glob/no-traversal/no-symlink policy. A failure emits a teaching nonzero diagnostic without `READ` or `next` execution instructions.

### D-TK016 — Execution map and GATE_QUEUE share one complete ticket snapshot

- **Status:** active · **Extends:** D-TK006/D-TK010
- **Why:** the old array scan silently skipped unreadable directories and Markdown. That could remove a competing infra owner, print a plausible `0/0` map, and grant a uniquely-looking setup exemption from partial evidence. `collectTicketCorpus` now returns either every non-skipped ticket with its exact observed bytes or one teaching failure. Map, state and verifier consumers pass those bytes to `queuedInfraGateTicketIds`; the queue never re-reads or silently skips a ticket. The legacy `collectTicketRefs` export remains only as a throwing compatibility facade, so it cannot restore best-effort behavior.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/section.ts`, `shared/sdd/ticket.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (STEP_1)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
