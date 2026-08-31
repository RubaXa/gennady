# Module: `sdd-verify`

**Module:** sdd-verify · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Детерминированная верификация с двумя режимами. Фазовый вызов `--task ... --phase ...` структурно выводит профиль, Target Files, Deleted Files, owning spec и применимые строки Verification. Одна attempt ремонтирует только существующие targets, один раз запускает foundation, выполняет дополнительные команды под read-only boundary и затем атомарно пишет структурированный receipt. После исправления допустима новая attempt той же canonical командой. `setup` допускает отсутствие ещё создаваемой инфраструктуры. Профиль `full` отделён: глобальный `type-check → test:coverage → lint → format → yagni`, read-only по исходникам и принадлежит одному group-audit STEP_1.

**Key properties:**

- Repair-first phases — `fix → type-check → test/test:coverage`; `fix` упорядочивает formatter, project-linter и Gennady-contract adapters, фильтрует exact targets по capability и не дублирует Gennady leaf
- Runtime write-zone — before/after snapshot допускает только фактические мутации canonical Target Files; внешний путь краснит repair, перечисляется и не откатывается
- Single foundation pass — types/tests запускаются один раз после repair; fingerprint и повторный прогон удалены
- Read-only full — `type-check → test:coverage → lint → format → yagni`, без repair
- Profile-scoped — `setup`/`code`/`test`/`full` включают разные подмножества лестницы в её каноническом порядке (см. §5)
- Honest bootstrap skip — только `setup` может пропускать ещё отсутствующие scripts; все ступени `code`/`test`/`full` обязательны
- Coverage policy выбирает producer без перегрузки profile: каждая test-фаза остаётся `profile=test`, а отдельный plan-признак `producesCoverage` выбирается из explicit owner/N-A. Только owner запускает coverage producer и reader; остальные test-фазы запускают обычные tests. `not-applicable` запрещает owner/reader. В текущем Node runtime producer — project brick `test:coverage` с проверкой свежего отчёта (D-SV016); ticket-owned Role=`coverage` команда читает/проверяет результат и может принадлежать иной платформе
- Brief-on-success — `✅ <gate> (<dur>)`; на падении — exit code + захваченный (обрезанный) output упавшего + отдельный дайджест потерянных «not ok»-строк
- CLI-owned completion — ручной `[x]`/`ver` не заменяет receipt; `sdd-check` сверяет receipt с планом, verification-script environment, Target Files и Deleted Files

**Invariants:**

- Порядок нормативен и не зависит от профиля: подмножество `GATES` в каноническом порядке
- Все прошли/пропущены → exit 0; ≥1 упал → exit 1 (halt на основании — тоже фейл)
- CLI grammar fail (`unknown`, missing/repeated/empty scalar, conflict, extra positional) → exit 4 с canonical usage; успешно разобранный, но неразрешимый ticket/phase context → gate failure exit 1
- Раннер инъектируется (`run(runner, profile)`); tail в `index.ts`, поэтому импорт `run()` в тесте НЕ запускает реальные гейты

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
# профиль full (по умолчанию) — всё прошло
$ npx gennady sdd-verify
[sdd-verify] ✅ ALL PASS (5/5)
  ✅ type-check (1.4s)
  ✅ test:coverage (5.1s)
  ✅ lint (2.3s)
  ✅ format (0.6s)
  ✅ yagni (0.9s)
# exit 0

# impl-фаза — профиль и repair scope прочитаны из тикета
$ npx gennady sdd-verify --task specs/app/app.task.TSK-1.md --phase P2
[sdd-verify] ✅ ALL PASS (3/3)
  🔧 fix (1.6s) — мутирующий шаг
  ✅ type-check (1.4s)
  ✅ test (3.2s)
[sdd-verify] receipt recorded: specs/app/app.task.TSK-1.md#P2
# exit 0

# setup до появления инфраструктуры — честные пропуски
$ npx gennady sdd-verify --task specs/infra/infra.task.INF-1.md --phase P1
[sdd-verify] ✅ ALL PASS (0/3)
  ⏭ fix — скрипта нет в package.json, пропущено
  ⏭ type-check — скрипта нет в package.json, пропущено
  ⏭ test — скрипта нет в package.json, пропущено
# exit 0

# отсутствующая ОБЯЗАТЕЛЬНАЯ ступень профиля — красный вердикт, не пропуск
$ npx gennady sdd-verify --task specs/app/app.task.TSK-1.md --phase P2
[sdd-verify] 0/1 passed — 1 FAILED
  ⛔ fix — обязательная ступень профиля «code»: скрипта нет в package.json — verify нечем,
     лестница остановлена. Прогони infra flow (npx gennady sdd-state → GATE_QUEUE) и повтори.
# exit 1


# падение на основании — лестница останавливается, дальше ничего не выполняется.
# Порядок блоков нормативен: сначала заголовок со счётом, затем непадающие ступени,
# затем блоки упавших, и halt-строка последней (см. `verdict`).
$ npx gennady sdd-verify
[sdd-verify] 0/1 passed — 1 FAILED
  ❌ type-check — exit 2 (ran: npm run type-check)
  --- output ---
  src/foo.ts(12,3): error TS2345: ...
  --- end ---
[sdd-verify] ⛔ лестница остановлена на «type-check» — код не собирается — дальше нечего проверять и чинить, дальше не пошли
# exit 1

# repair не установил чистый post-state — foundation не запускается
$ npx gennady sdd-verify --task specs/app/app.task.TSK-1.md --phase P2
[sdd-verify] 0/1 passed — 1 FAILED
  🔧 fix — exit 1 (ran: npm run format:fix -- <targets> && npm run lint:fix -- <applicable-targets> && npx --no-install gennady lint --autofix --include-tests --spec=<spec> -- <ts-targets>) — repair не завершён
  --- output ---
  lint post-state is not clean
  --- end ---
[sdd-verify] ⛔ лестница остановлена на «fix» — после repair нет доказанно чистого post-state — foundation запускать рано, дальше не пошли
# exit 1
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                | Type         | Purpose                                                                                                                                |
| ----------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `run`                               | Command      | Прогон фиксированного repair-first phase либо read-only full профиля, тайминг и вердикт                                                |
| `runPhaseVerification`              | Command      | Одна фазовая транзакция: ladder + applicable Verification rows + atomic receipt                                                        |
| `createRepairMutationBoundary`      | Utility      | Before/after workspace proof: actual repair writes остаются внутри canonical Target Files                                              |
| `planTargetRepair`                  | Utility      | Extensible adapter registry: formatter → project linter → Gennady contract linter, exact capability-filtered targets и named skips     |
| `RepairAction`                      | Type         | Одна adapter invocation либо honest zero-applicable skip; stable evidence попадает в receipt                                           |
| `RepairMutationBoundary`            | Type         | Injectable capture/inspect boundary around the mutating repair rung                                                                    |
| `CoverageProbe`                     | Type         | Shared-adapter-backed, identity-safe clear/read proof for the selected producer artifact                                               |
| `captureTicketContainment`          | Utility      | Fail-closed identity proof для regular non-symlink receipt-owning ticket path                                                          |
| `PhaseReceipt`                      | Value Object | CLI-owned schema-v1 evidence: plan, target state и exact successful commands/roles                                                     |
| `PhaseReceiptCommand`               | Value Object | Одна реально выполненная команда receipt: gate/role/command/exitCode                                                                   |
| `PhaseReceiptPlan`                  | Value Object | Структурные ticket/phase/profile/targets/Verification inputs receipt                                                                   |
| `PhaseReceiptParseResult`           | Value Object | Fail-closed результат разбора paired receipt blocks                                                                                    |
| `VerbatimRunner`                    | Type         | Инъектируемый исполнитель одной ticket-owned Verification команды                                                                      |
| `phaseReceiptPlanState`             | Utility      | SHA-256 детерминированного структурного phase plan                                                                                     |
| `phaseReceiptTargetState`           | Utility      | SHA-256 exact target paths, canonical destinations и текущих bytes                                                                     |
| `parsePhaseReceipts`                | Utility      | Строгий разбор paired JSON receipt blocks; malformed/duplicate markers краснеют                                                        |
| `formatPhaseReceipt`                | Utility      | Human-readable paired HTML-like prompt block с JSON evidence                                                                           |
| `defaultRunner`                     | Utility      | Раннер по умолчанию через `spawnSync` (без shell), exit + output                                                                       |
| `verdict`                           | Utility      | Свёртка результатов: кратко на успехе, детали упавших, halt-строка при остановке лестницы, дайджест обрезанных «not ok»-строк          |
| `GATES`                             | Value Object | Реестр ступеней: fix · type-check · test · test:coverage · lint · format · yagni                                                       |
| `Gate`                              | Value Object | name + mutates + `haltsOnFailure` (fix/type-check/test/test:coverage) + `via?`                                                         |
| `GateRunResult`                     | Value Object | exitCode + output                                                                                                                      |
| `GateResult`                        | Value Object | name · exitCode · output · durationMs · `status: 'pass' \| 'fail' \| 'skipped' \| 'missing'` · mutates · ranCommand                    |
| `requiredGatesFor`                  | Utility      | Required ladder: setup none; code ordinary test; test selects test/test:coverage from `producesCoverage`; full unchanged               |
| `GateRunner`                        | Type         | `(command, args) => GateRunResult` — инъектируемый                                                                                     |
| `VerifyOutcome`                     | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                                               |
| `Profile`                           | Type         | Профиль гейтов: `setup` \| `code` \| `test` \| `full` (D-SV006)                                                                        |
| `gatesFor`                          | Utility      | Гейты профиля в каноническом порядке GATES (подмножество)                                                                              |
| `isProfile`                         | Utility      | Type-guard токена профиля из CLI-ввода                                                                                                 |
| `resolveNpmScriptName`              | Utility      | Резолв имени npm-скрипта для gate; не найден → gate `skipped` (для `type-check` — alias `typecheck`, D-SV009)                          |
| `tailCap`                           | Utility      | Обрезка output упавшего gate по лимиту строк (120) и байт (16KB); восстанавливает до 10 потерянных «not ok»-строк в отдельный дайджест |
| `GateStatus`                        | Type         | Исход ступени: `pass` \| `fail` \| `skipped` (необязательная, скрипта нет) \| `missing` (обязательная, скрипта нет или он фиктивный)   |
| `InvocationResult`                  | Type         | Разбор CLI-вызова: phase identity либо global full; ошибка содержит обучающую диагностику                                              |
| `parseInvocation`                   | Utility      | Строгий разбор argv: `--task+--phase` либо `--profile full`; иначе bad-invocation с exit 4                                             |
| `resolvePhaseContext`               | Utility      | Структурно выводит kind→profile, точные существующие in-project Target Files и owning spec                                             |
| `ERR_CLI_SDD_VERIFY_BAD_INVOCATION` | Value Object | Код ошибки неверного вызова: лишний путь или неизвестный флаг — sdd-verify никогда не сужает область молча                             |
| `isSelfHosting`                     | Utility      | Self-hosting-детект по `package.json#name === 'gennady'` — определяет, как запускать `via: 'gennady'` гейты (D-SV008)                  |
| `runWithMaxBuffer`                  | Utility      | Spawn с явным `maxBuffer`; переполнение репортится честной ошибкой (exit 127), а не молча обрезанным вердиктом                         |
| `GATE_MAX_BUFFER_BYTES`             | Value Object | Потолок захвата stdout+stderr одной ступени (64MB) — запас над реально измеренным TAP-выводом                                          |
| `printHelp`                         | Utility      | Справка команды (`--help` / `-h`)                                                                                                      |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Verification Gate

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `package.json` существует (это проверяет `sdd-state` readiness; отсутствующий отдельный npm-скрипт у gate — не precondition-нарушение, а честный `skipped`)
- Postconditions:
  - Каждый gate запускается не более одного раза: phase — repair-first; full — read-only
  - Отсутствующий npm-скрипт НЕобязательного gate → `skipped` (`⏭`), не запускается, не считается ни pass, ни fail
  - Отсутствующий или `echo`-заглушечный скрипт gate из `REQUIRED_PROFILE_GATES[profile]` → `missing` (`⛔`), лестница останавливается, вердикт красный; заглушка НЕ запускается (её exit 0 ничего не значит)
  - В schema-aware ticket только названная test owner-phase запускает project brick `test:coverage`; другие test-фазы запускают `test`. Reader выполняется только owner-фазой и обязан быть Required-by её rule. `sdd-verify` не изобретает producer/reader команду или платформу
  - Падение gate с `haltsOnFailure: true` (`fix`, `type-check`, `test`, `test:coverage`) останавливает лестницу
  - Phase repair сравнивает workspace до/после и разрешает изменения только lexical/canonical Target Files; любой иной финальный changed path перечисляется, остаётся на диске для оператора и останавливает ladder до foundation
  - Global `full` применяет тот же runtime zero-write proof: до coverage, вокруг coverage и после coverage. Только producer-сегмент может менять exact generated-artifact directory; `type-check`/`lint`/`format`/`yagni` остаются zero-write
  - Receipt-owning ticket обязан быть regular non-symlink path без symlink alias в parent path; device/inode identity повторно проверяется непосредственно перед atomic replacement, а exclusive random temporary path никогда не следует заранее созданной ссылке
  - Успех → exit 0 + `✅ <gate> (<dur>)` на gate; падение → exit 1 + обрезанный output упавшего (`tailCap`) + дайджест потерянных «not ok»-строк, если обрезка их скрыла
- Invariants:
  - Набор и порядок gate — фиксированные (`GATES`); phase-профиль механически выводится из kind, `full` выбирается отдельно (нет обнаружения по package.json)
  - `run(runner, profile, ..., phaseContext)` детерминистична при фиксированном раннере и структурном контексте
  <!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument               | Type   | Description                                                         |
| ---------------------- | ------ | ------------------------------------------------------------------- |
| `--task <ticket-path>` | string | Путь v2 ticket; используется только вместе с `--phase`.             |
| `--phase <PhaseID>`    | string | Структурная фаза, из которой выводятся kind/profile и Target Files. |
| `--profile full`       | string | Отдельный глобальный read-only режим для audit/CI/human.            |
| `--help` / `-h`        | —      | Справка.                                                            |

Профили — фикс-наборы в каноническом порядке лестницы; setup/code/test выбираются только структурным `--task … --phase …`, `full` — явным флагом:

Каждый scalar-флаг обязан присутствовать не более одного раза и иметь ровно одно непустое значение. Повтор, отсутствие значения, конфликт режимов или extra positional — bad invocation (exit 4), а не fallback в default `full`. После успешного разбора semantic phase-context ошибки (`ticket`/`phase`/targets/owner/readiness) относятся к механическому gate и возвращают exit 1.

- `setup` — `fix · type-check · test`, всё optional для bootstrap
- `code` — `fix · type-check · test`, всё required
- `test` — `fix · type-check · (test:coverage у owner | test у non-owner/N-A)`, всё selected required; `fix` включает contract lint test-файлов
- `full` — `type-check · test:coverage · lint · format · yagni` (финал/group-close, все фазы закрыты; **default**; единственный профиль без мутирующих ступеней — исходники не переписываются, финальный вердикт не трогает то, что судит. Отчёт покрытия в `coverage/` при этом пишется — «без мутаций» здесь про исходный код, не про артефакты)

Обязательные ступени (`requiredGatesFor`): `setup` — ни одной; `code` — exact repair + `type-check` + `test`; `test` — exact repair + `type-check` + owner-derived `test:coverage` либо `test`; `full` — весь read-only состав. Отсутствующий или очевидно заглушечный required script/repair leaf → `⛔`; `setup` дополнительно сообщает bootstrap-вес вердикта.

Порядок внутри профиля — подмножество канонического `GATES` в неизменном порядке. Плоский `test` гоняется в `setup`/`code` и schema-aware test non-owner/N-A; `test:coverage` — в owner и `full`. Readiness требует оба project bricks независимо от конкретной фазы.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-verify/
├── index.ts             # entry: global full or complete phase transaction
├── phase-context.ts     # structural ticket/phase/profile/target/Verification resolver
├── phase-run.ts         # complete phase transaction and atomic receipt write
├── sdd-verify.cmd.ts    # defaultRunner + run(runner)  (без tail)
├── sdd-verify.types.ts  # GATES, verdict, Gate/GateResult/VerifyOutcome
├── help.ts
└── __tests__/sdd-verify.cmd.test.ts

shared/sdd/phase-receipt.ts # paired receipt schema, parser, renderer and state hashes
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**Вызывается из:** `phase-execution-protocol` (STEP_5, профиль по kind); dispatched audit STEP_1 (единственный владелец group `full`); `reconcile` (`code`); `npm run check` для человека/CI/pre-commit (`full`). Execute-orchestrator сам `full` не запускает.
**E2E:** отложен (прокси) + живьём мутирует/требует test:coverage → покрытие unit через fake-runner.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-SV001 — Инъектируемый раннер + tail в index.ts

- **Status:** active · **Why:** оркестрация (порядок, RUN-ALL, вердикт) unit-тестируема без подпроцессов; argless-команда не должна запускать реальные гейты при импорте `run()` в тесте — поэтому self-exec в `index.ts`, а `cmd.ts` только экспортирует. **Risk:** нет.

### D-SV002 — Фикс-гейты по точным именам (без обнаружения)

- **Status:** active · **Why:** оператор: «строго, без угадываний». Набор и порядок зашиты; `sdd-state` гарантирует наличие скриптов. **Risk:** проект обязан иметь точные имена — это и есть стандарт v2.

### D-SV003 — Мутирующие первыми, последовательно

- **Status:** superseded by D-SV010
- **Why:** `format`/`lint` делали autofix (переписывали файлы); параллель с читающими (`type-check`/`test:coverage`) — гонка. Последовательность безопасна.
- **Risk accepted:** медленнее; read-only пару можно распараллелить позже (async-spawn).
- **Update:** реформа верификации (см. D-SV010) развела «мутирующий autofix» (`format:fix`/`lint:fix`) и «read-only проверка» (`format`/`lint`) на разные gate — мутирующие идут ПОСЛЕ halting-основания (`type-check`/`test`), не первыми; read-only проверки — после починки, не параллельно. Идея «мутирующее до читающего» осталась (сохраняет отсутствие гонки за файлы), но сама пара `format`/`lint` больше не мутирует.

### D-SV004 — Классификатор `scripts.ts` ретайрнут

- **Status:** active · **Why:** после перехода на точные имена fuzzy-классификатор стал мёртв (ни один потребитель) — удалён вместе с тестами. **Risk:** нет.

### D-SV005 — Плоский `test` не гоняется

- **Status:** superseded by D-SV011
- **Why:** `test:coverage` запускает те же тесты с покрытием; гонять оба в одном профиле — избыточно.
- **Risk accepted:** если нужна быстрая прогонка без coverage — добавить `test` в GATES.
- **Update:** `test` добавлен в `GATES` (D-SV011) и гоняется в профилях `setup`/`code` вместо `test:coverage` — фазе кода не нужно измерять покрытие, только убедиться, что тесты не сломаны; `test:coverage` остаётся в профилях `test`/`full`. Оба остаются required-скриптами readiness независимо от того, какой профиль их реально гоняет.

### D-SV006 — Профили гейтов по виду фазы

- **Status:** active for fixed profile composition; manual orchestrator invocation superseded by D-SV018
- **Why:** гейт привязан к `kind` фазы. Фаза кода не должна гонять покрытие (только убедиться, что тесты не сломаны); фаза тестов — покрытие; финал — всё. Изначально оркестратор передавал ЯВНЫЙ `--profile`; D-SV018 сохранил фиксированные наборы, но заменил ручной выбор структурным `--task … --phase …`, который сам выводит профиль из kind. Default `full` остаётся безопасным глобальным read-only режимом.
- **Risk accepted:** риск неверного ручного phase-профиля снят D-SV018; глобальный `full` по-прежнему выбирается явно.

### D-SV007 — `yagni` добавлен как read-only гейт, в конце последовательности

- **Status:** active (положение в лестнице и профильный охват подтверждены реформой D-SV010 — `yagni` теперь только в `full`, не в `code`)
- **Why:** YAGNI-проверка (`gennady yagni`, `specs/cli/yagni/yagni.spec.md`) читает готовый диф фазы — запускать её до финальных правок кода бессмысленно, поэтому она встаёт последней в `GATES`. Она не мутирует файлы (не autofix), поэтому не конкурирует за порядок с мутирующими гейтами.
- **Risk accepted:** Нет — вызов напрямую, не через npm-скрипт (см. D-SV008, суперсидит первоначальный npm-скрипт подход этой записи).
- **Update:** реформа верификации (D-SV010) вывела `yagni` из профиля `code` — она больше не гоняется на каждой кодовой фазе, только на group-close (`full`), где диф всей группы уже стабилен; профиль `setup` тоже её не включает.

### D-SV008 — `yagni`-гейт вызывается напрямую (`npx --no-install gennady yagni`), не через npm-скрипт проекта

- **Status:** active
- **Why:** D-SV007 изначально требовал npm-скрипт `yagni` в `package.json` проекта — но `shared/sdd/readiness.ts` (REQUIRED_SCRIPTS) сознательно НЕ включает `yagni` в обязательные скрипты. Решение системное: `yagni` — гейт САМОГО gennady, поэтому `Gate.via: 'gennady'` запускает локально установленный CLI напрямую с `--no-install`; readiness ПРАВ, не требуя npm-обёртку, а verify не может уйти в download fallback.
- **Risk accepted:** локальный gennady должен быть установлен для проекта (`gennadyAvailable` в readiness уже это проверяет отдельно от списка скриптов).

### D-SV009 — Гейт `type-check` принимает alias `typecheck` при реальном вызове

- **Status:** active
- **Why:** канонический gate-id — `type-check` (совпадает с собственным `package.json` gennady), но живые проекты в дикой природе объявляют скрипт как `typecheck` — точный `npm run type-check` на таком проекте падает `missing script`, хотя проверка типов реально настроена. Перед вызовом `resolveScriptName` читает `package.json` проекта и предпочитает `type-check`, при его отсутствии — `typecheck`; при отсутствии обоих или нечитаемом `package.json` — не угадывает дальше, оставляет каноническое имя (даёт npm сказать `missing script`, диагностика достаточна).
- **Reporting:** gate-id остаётся каноническим `type-check`, но `ran:` и receipt фиксируют фактически выбранный `npm run type-check` либо `npm run typecheck`. Тот же resolver выбирает script body для environment fingerprint.

### D-SV010 — Реформа: лестница с halting-основанием, мутирующей починкой и профилем `setup`

- **Status:** superseded by D-SV017 · **Supersedes:** D-SV003 (мутирующие первыми)
- **Why:** Плоский RUN-ALL по всем gate одинаково не различал «код не собирается — чинить нечего» от «форматирование не совпало — можно чинить и продолжать». Реформа ввела `haltsOnFailure` на основании лестницы (`type-check`, `test`, `test:coverage`) — падение останавливает всё дальнейшее, экономит время и не плодит бессмысленные находки на несобирающемся коде. Сверху добавлена мутирующая починка (`format:fix`, `lint:fix`, маркер 🔧) — отдельные gate от read-only `format`/`lint`, что снимает путаницу из D-SV003 (там `format`/`lint` сами считались мутирующими). Профиль `setup` введён с тем же составом, что `code`, для первичной настройки нового проекта.
- **Risk accepted:** Halting-основание означает, что находки лестницы после основания никогда не увидены, пока не зафиксить type-check/тесты — это осознанный трейд-офф (нет смысла чинить формат в несобирающемся коде), а не побочный эффект.

### D-SV011 — `test` возвращён в `GATES`, заменяет `test:coverage` в `setup`/`code`

- **Status:** active · **Supersedes:** D-SV005 (плоский `test` не гоняется)
- **Why:** Профили `setup`/`code` не должны платить цену измерения покрытия на каждой кодовой фазе — плоский `test` достаточен, чтобы убедиться, что фаза не сломала тесты. `test:coverage` остаётся в профилях `test`/`full`, где покрытие релевантно. Оба скрипта остаются required в readiness (`shared/sdd/readiness.ts`) независимо от того, какой профиль их фактически использует.
- **Risk accepted:** Нет — оба required-скрипта уже обязаны существовать; выбор какой из двух реально запускается — забота профиля, не readiness.

### D-SV012 — Обязательные ступени профиля: пропуск основания больше не даёт зелёный вердикт

- **Status:** active
- **Why:** Честный пропуск (D-SV010) в пределе давал `ALL PASS (0/6)` — фаза завершалась зелёной, не выполнив ни type-check, ни тестов, ни lint, ни format, и лог оставался формально правдивым. В связке с заглушками readiness это позволяло дойти до DONE с нулевой верификацией. Теперь основание профилей, которые верифицируют код (`code`/`test`/`full`), объявлено обязательным (`REQUIRED_PROFILE_GATES`): отсутствующий или `echo`-заглушечный скрипт даёт `⛔`/`missing` и красный вердикт. `setup` намеренно требований не имеет — он идёт ДО инфраструктуры, и его пропуски законны.
- **Rejected:** «пусть агенту запрещает директива» — промптовая защита, а не механическая; ровно тот класс гарантии, который этот флоу должен снимать с агента.
- **Risk accepted:** Проект без инфраструктуры больше не может исполнять кодовые фазы — это и есть цель; выход один и явный: infra-очередь (`sdd-task` → `GATE_QUEUE`).

### D-SV013 — sdd-verify НЕ проверяет coverage-артефакт; порог покрытия — забота testcov в тест-фазе

- **Status:** superseded by D-SV016 (порог по-прежнему не считается здесь; но ПОЯВЛЕНИЕ свежего отчёта sdd-verify теперь проверяет — см. D-SV016) · **Supersedes:** прежнюю «семантическую проверку свежего артефакта» (введена и откачена в рамках той же реформы)
- **Why:** Была добавлена проверка «после `test:coverage` в `coverage/` появился свежий отчёт, иначе красный» — как анти-фикция «exit 0, но покрытие не мерялось». По решению оператора откачена: (1) она подделываема (пустой `touch coverage/x` проходил, 2s-допуск); (2) главное — она отвечала не на тот вопрос. Реальный контроль покрытия — это `gennady testcov --min=<pct> <файлы задачи>` в ТЕСТ-ФАЗЕ, scoped на Target Files задачи: гейт фазы (`sdd-verify --profile test`) — ЕДИНСТВЕННЫЙ владелец прогона покрытия, он пишет свежий `coverage/`, а строка `testcov --min` только ЧИТАЕТ этот отчёт и проверяет порог по файлам задачи (без `--run`, без второго прогона сюиты), плюс независимая перепроверка на аудите. `testcov` читает `coverage-final.json` сам и отдаёт текстовый вердикт; sdd-verify в это не лезет.
- **Now:** ступень `test:coverage` в sdd-verify только ПРОИЗВОДИТ отчёт (её вердикт — exit code скрипта). Порог не считается здесь ни в каком виде.
- **Rejected:** дублировать логику testcov (парсинг istanbul-JSON, порог) внутри sdd-verify — единственный владелец coverage-логики остаётся `testcov`.

### D-SV014 — Один ограниченный repair-pass: после реальных мутаций основание перепроверяется

- **Status:** superseded by D-SV017
- **Why:** Мутирующие ступени идут ПОСЛЕ основания (D-SV010, чтобы не полировать несобирающийся код), но их правки после этого никто не проверял: `lint:fix`/`format:fix` могли изменить код, а вердикт продолжал описывать до-мутационное состояние. Теперь дерево снимается fingerprint'ом (path → mtime:size, без `node_modules`/`.git`/`coverage`/`dist`/`build`/`.claude`) до первой мутирующей ступени и после лестницы; при реальном отличии уже прошедшие halting-ступени профиля прогоняются ровно один раз с суффиксом ` (re-run после мутаций)`.
- **Rejected:** переставить починку в начало лестницы — autofix гонялся бы по несобирающемуся коду и маскировал причину падения type-check; цикл «чини-проверяй до сходимости» — недетерминированное время фазы.
- **Risk accepted:** Один повторный прогон основания в худшем случае удваивает время тестов на фазе, где autofix реально что-то переписал; за это покупается вердикт о том коде, который уходит в handoff.

### D-SV015 — Обязателен весь немутирующий состав профиля, не только основание

- **Status:** superseded by D-SV017 · **Расширяет:** D-SV012
- **Why:** D-SV012 сделал обязательным только основание (`type-check` + `test`/`test:coverage`), но lint/format/yagni могли молча отсутствовать/сломаться после preflight — и `full` всё равно печатал `ALL PASS`, потеряв quality-гейт. Теперь `REQUIRED_PROFILE_GATES` включает весь НЕмутирующий состав кодовых профилей: `code` — +lint +format; `full` — +lint +format +yagni. `test` остаётся минимальным (type-check + test:coverage — тест-фаза не трогает прод-код, lint там и не гоняется).
- **Rejected:** делать обязательными и мутирующие `format:fix`/`lint:fix` — у проекта может не быть автофиксера; их отсутствие — легальный пропуск. `yagni` (via gennady) обязателен номинально — он всегда доступен и не бывает `missing`.
- **Risk accepted:** проект без lint/format-скриптов больше не пройдёт code/full — но readiness их и так требует в наборе семи кирпичей, так что для ready-проекта они всегда есть.

### D-SV016 — Single-producer freshness: sdd-verify проверяет ПОЯВЛЕНИЕ свежего coverage-отчёта (fail-closed)

- **Status:** active; artifact selection/cleanup strengthened by D-SV034 · **Supersedes:** D-SV013 (в части «sdd-verify вообще не смотрит на артефакт»)
- **Why:** D-SV013 оставил дыру, найденную ревью: `test:coverage`, вышедший с 0, но НЕ записавший `coverage-final.json` (мисконфиг репортёра, или отчёт остался от прошлого прогона), давал зелёный, а `testcov --min` затем читал устаревший/чужой отчёт как свежий — контракт единственного producer не был замкнут. Порог по-прежнему НЕ считается в sdd-verify (это остаётся за testcov, D-SV013). Замкнут именно PRODUCER: sdd-verify — владелец прогона — инъектирует `CoverageProbe` (тип в `sdd-verify.cmd.ts`; реальная реализация в `index.ts`, тесты её опускают). Перед ступенью `test:coverage` probe УДАЛЯЕТ старый `coverage-final.json`; после — требует, чтобы свежий ПОЯВИЛСЯ.
- **Fail-closed:** актуальная реализация D-SV034 требует identity-safe удаления старого regular report. Если удалить его нельзя либо artifact path содержит symlink/special/unreadable component, producer вообще не запускается; mtime surviving-файла больше не используется как ослабленный fallback.
- **Разделение ответственности (важно, чтобы не переоценивать probe):** probe отвечает ТОЛЬКО за «отчёт принадлежит ТЕКУЩЕМУ прогону» (появился/новее). Он НЕ проверяет содержимое: `touch coverage/coverage-final.json` или пустой `{}` дадут свежий mtime и probe ПРОЙДЁТ. Валидность (istanbul-JSON) и порог — забота `testcov` в тест-фазе/аудите: пустой/битый отчёт даёт `total=0`/parse-error → `testcov --min` краснеет. Полная гарантия = sdd-verify (отчёт свежий) + testcov (отчёт валиден и порог достигнут); ни одна ступень в одиночку её не даёт.
- **Отличие от откаченной проверки (D-SV013):** та проверяла «файл появился» с 2s-допуском и подделывалась `touch` НЕЗАВИСИМО от producer. Эта — delete-before + require-strictly-fresh, fail-closed, привязана к прогону; и намеренно НЕ дублирует istanbul/порог (владелец — testcov).
- **Rejected:** дублировать порог/парсинг покрытия в sdd-verify — единственным владельцем coverage-логики остаётся `testcov`; sdd-verify отвечает только за то, что отчёт ТЕКУЩИЙ.

### D-SV017 — Repair-first phases, strong fix postcondition, single-owner full

- **Status:** superseded by D-SV018 · **Supersedes:** D-SV010, D-SV014, D-SV015 (в части составов/порядка)
- **Why:** прежняя схема сначала запускала foundation, затем два fix-gate, два read-only дубля и при мутации повторяла foundation. Это платило за одинаковые проверки до двух раз и компенсировало слабый postcondition autofix внешним lint. Теперь единый project `fix` сначала форматирует, применяет DbC autofix, перечитывает изменённые файлы и запускает полный read-only lint над post-state. Затем types/tests запускаются ровно один раз. Test-файлы входят в repair pass, поэтому test-фаза не откладывает contract lint до group audit.
- **Profiles:** `setup = fix · type-check · test` (optional); `code = fix · type-check · test` (required); `test = fix · type-check · test:coverage` (required); `full = type-check · test:coverage · lint · format · yagni` (read-only по исходникам).
- **Ownership:** group `full` запускает только dispatched audit STEP_1; execute-close не дублирует его. CI/pre-commit могут самостоятельно вызывать `full` как boundary assurance.
- **Rejected:** немедленный `fix → lint/format` — это повтор того же postcondition; foundation до repair + fingerprint rerun — дорогая компенсация неверного порядка.
- **Risk accepted:** неисправный project `fix`, который возвращает 0 без чистого post-state, нарушает declared script contract; readiness ловит только очевидные заглушки, не произвольный злонамеренный shell.

### D-SV018 — Phase context owns profile, exact repair set, and owning spec

- **Status:** active · **Supersedes:** D-SV017 (в части public phase invocation и project-wide fix)
- **Why:** ручные `--profile` и повторяемые `--target` заставляли агента реконструировать уже записанные данные, допускали неверный профиль и раздували команды. Теперь канонический phase-вызов — `sdd-verify --task <ticket> --phase <ID>`: parser читает kind и Target Files из секций тикета, проверяет каждый путь (существующий обычный файл внутри проекта, без glob) и выводит owning spec из конвенции имени тикета.
- **Repair:** проектные `format:fix` и `lint:fix` получают один и тот же точный, option-safe target-set. Поэтому новый test-файл проверяется, а чужие production/test/negative fixtures не мутируются и не блокируют фазу. Успех lint означает reread post-state и полный набор применимых read-only проверок. Для code/test owning spec обязателен; setup может временно обходиться без него в bootstrap.
- **Profiles:** bootstrap/config/doc→setup; impl/refactor/fix→code; test→test. Единственное механическое исключение: active ticket из той же infra `GATE_QUEUE`, которая строит отсутствующие gates, временно получает setup без ручного выбора профиля. Foundation выполняется один раз после repair. `--profile full` остаётся отдельным глобальным read-only режимом.
- **Rejected:** глобальный `--include-tests` — intentional negative fixtures делают его заведомо красным; ручные repeated targets/profile — дублирование ticket context и источник drift.

### D-SV019 — Exact repair executes project-declared argument-forwarding bricks

- **Status:** active · **Supersedes:** D-SV018 в части hardcoded Prettier/direct gennady dispatch
- **Why:** readiness не может принимать один formatter/linter, пока phase verifier исполняет другой. `format:fix`/`lint:fix` объявляются command prefixes, заканчиваются write-switch, а static shape rejects shell hops и obvious broad root/glob; phase verifier вызывает именно `npm run <brick> -- …` с exact Target Files. Required whole-project `fix` передаёт широкие roots сам. Static check подтверждает форму вызова, а не фактический write-set — его доказательство добавлено D-SV022.
- **Lint inventory applicability:** одна exact lint-команда получает production и test targets. Обычные DbC/word/header правила применяются к обоим; test targets структурно исключены только из production Entity Inventory forward/reverse accounting.
- **Rejected:** hardcoded tool detection; чтение/переписывание script body; shell/glob reconstruction; baked-in `.` в repair brick.
- **Update:** D-SV037 добавляет явную capability-классификацию project leaf: она не переписывает script body, а выбирает adapter ABI и exact applicable subset перед запуском.
- **Static boundary:** tool-agnostic analysis не может отличить произвольный exact operand (`src/a.ts`) от subcommand/config operand. Поэтому она остаётся ранней диагностикой; runtime invariant D-SV022 закрывает фактическую мутацию.

### D-SV020 — Explicit coverage policy selects the test producer profile

- **Status:** superseded by D-SV023 for schema-aware required tickets; legacy/N-A compatibility remains active
- **Why:** первоначальная реализация использовала profile как proxy coverage-applicability (`required`→test, N/A→code). D-SV023 убрал эту перегрузку: kind всегда даёт test-profile, а producer выбирает отдельный plan-признак. Pre-schema test tickets сохраняют producer=true как compatibility rule.

### D-SV021 — CLI owns complete phase evidence

- **Status:** active
- **Why:** a manually checked phase and hand-written `ver` lines are self-attestation. The canonical phase invocation now owns the whole mechanical transaction: exact-target repair, one foundation run, every applicable structured Verification row verbatim, then one atomic structured receipt in Execution Log. The receipt binds ticket, phase, profile/basis, ordered targets, required command plan, actual successful commands/roles, and a hash of current Target File paths+bytes.
- **Failure semantics:** dependency and complete plan/environment/local-input preflight run before a retry begins. A preflight rejection preserves the current receipt and executes zero commands. Once preflight succeeds, the old receipt is removed before the first command; any ladder/extra/write failure leaves no reusable proof. `sdd-check` rejects checked/DONE schema-aware phases when evidence is missing, incomplete, malformed, plan-stale, or target-stale. Pre-schema tickets without the marker are grandfathered until rewritten; once a receipt exists it is validated.
- **Trust boundary:** this is deterministic repository evidence, not a cryptographic claim against a malicious writer with checkout access. Semantic Handoff remains a separate agent-authored statement and is not represented as mechanically proven.

### D-SV022 — Runtime workspace diff enforces the exact phase write-zone

- **Status:** active · **Extends:** D-SV019
- **Why:** статическая проверка command prefix не умеет доказать write-set: честно выглядящий brick может содержать baked exact operand или сам менять соседний файл. Перед repair CLI хеширует file/symlink state workspace (кроме `.git` metadata и установленных `node_modules`), после repair вычисляет final changed paths и сравнивает lexical/canonical destinations с Target Files. Это одинаково ловит clean tracked→modified/deleted, повторную мутацию уже dirty файла и untracked create/change/delete; in-repo symlink alias разрешает запись в его canonical target, escape/broken target краснеет.
- **Failure:** outside-target mutation перечисляется как `fix` failure, foundation и receipt не запускаются; CLI никогда не откатывает ни пользовательское, ни tool изменение. Старый receipt уже удалён владельцем transaction до snapshot и не восстанавливается.
- **Static/runtime split:** readiness по-прежнему рано отклоняет очевидные broad roots/globs/shell hops, но не называет это гарантией. Runtime before/after boundary — единственный owner write-zone proof. Исключены только `.git` и `node_modules`; generated/ignored/untracked project paths остаются наблюдаемыми, поэтому исключение не прячет production source.

### D-SV023 — Coverage producer belongs to one explicit test phase

- **Status:** active · **Supersedes:** D-SV020 для schema-aware required tickets
- **Why:** `required` без Phase-ID заставлял каждую test-фазу запускать один и тот же producer/reader. Теперь policy хранит canonical `Coverage Owner Phase`; он обязан быть ровно одной test-фазой, а Role=`coverage` reader обязан ссылаться через Required-by на её rule. Все test-фазы сохраняют `profile=test`; отдельный `producesCoverage` выбирает `test:coverage` у owner и обычный `test` у остальных. Receipt plan хранит owner и этот признак, поэтому смена policy/owner инвалидирует прежнее evidence.
- **Compatibility:** pre-schema tickets остаются legacy и сохраняют прежний kind→`test` профиль без ложного обещания single-owner.

### D-SV024 — Non-ready phase context fails closed on bootstrap ownership

- **Status:** active · **Extends:** D-SV018
- **Why:** silent failure while reading the portal or structural `GATE_QUEUE` let an ordinary code/test phase keep its kind-derived profile in a provisional project. Now any non-ready project must prove the exact phase exemption from a readable portal and queue; missing Task-ID, unreadable portal, zero/ambiguous/wrong owner all stop with `ERR_CLI_SDD_VERIFY_PHASE_CONTEXT`. Setup-kind phases remain the explicit bootstrap path.

### D-SV025 — One fail-closed phase transaction

- **Status:** active · **Extends:** D-SV021–D-SV024
- **Why:** a receipt could survive mutable §5 checks, could not represent intentional deletion, ignored script-body drift and did not prove phase dependencies. Each attempt now validates checked/current dependencies and freezes the complete environment/local-input plan before invalidating its old receipt; binds existing targets plus tracked absent tombstones and the reachable project-script definitions; runs extras behind a zero-write snapshot; and writes one successful receipt only after all boundaries pass. A preflight rejection starts no attempt and preserves prior evidence; a failure after invalidation leaves no receipt and a later repair starts a new attempt.
- **Trust boundary:** environment state fingerprints exact reachable `package.json` script bodies and ticket command text. It does not claim provenance for arbitrary external tool configuration, binaries, environment variables or remote services.

### D-SV026 — Unified executable provenance and declarative deletion boundary

- **Status:** active · **Extends:** D-SV022/D-SV025
- **Why:** runner and receipt previously resolved `typecheck` differently, direct §5 scripts were bound only by command text, dangling symlinks looked absent, and empty-directory writes escaped file-only snapshots. One resolver now selects the executed project script and its transitive declared run graph; obvious repo-local executable inputs bind their bytes; tombstones use directory-entry presence; snapshots include persistent directories without volatile mtime.
- **Deletion ownership:** worker may unlink only exact `Deleted Files` entries and rmdir only an exact declared emptied directory. Verifier never sends tombstones through repair; it proves tracked baseline plus final absence and makes reappearance stale.
- **Excluded tool state:** `.git` and `node_modules` stay outside workspace snapshots so VCS/package tools remain usable. The guarantee is zero persistent project-content mutation outside the declared write-set, not zero writes to tool metadata/install state.

### D-SV027 — Transitive dependency evidence and option-aware local inputs

- **Status:** active · **Extends:** D-SV025/D-SV026
- **Why:** direct-only dependency validation missed a stale ancestor, removing the receipt marker disabled validation of already-present legacy evidence, and a value-taking runner option (`python -W ignore`) hid the following local script. Dependency preflight now walks the whole acyclic closure and applies marker-aware evidence rules per ancestor. Known runner argv scanning conservatively skips ordinary option values while fingerprinting the resolved repo-local program input.
- **Boundary:** this remains argv recognition for declared common runners, not a shell parser; dynamic evaluation/module indirection stays outside the provenance claim.

### D-SV028 — Runtime read-only full, safe receipt path and npm lifecycle provenance

- **Status:** active · **Extends:** D-SV025–D-SV027
- **Full boundary:** глобальный verdict больше не доверяет имени read-only script. Workspace hash закрывает три сегмента: strict gates до `test:coverage`, узкий coverage producer с разрешением только его artifact directory, strict gates после него. Одна boundary observation одновременно завершает предыдущий и начинает следующий сегмент, поэтому proof не делает дублирующий full-tree hash на каждой границе. Любая persistent project mutation оставляется для inspection, краснит `full` и тем самым pre-commit.
- **Receipt path:** atomic rename не должен превращать принятый ticket symlink в новый regular file. Phase context принимает только regular ticket path без in-project symlink aliases; transaction повторно проверяет тот же lexical/canonical destination перед каждым atomic receipt write. Retarget/replacement во время gates не получает green receipt и не перезаписывается финальным rename. Конкретная exclusive-temp/identity защита расширена D-SV033.
- **Environment:** каждый реально вызываемый `npm run <name>`/`npm run-script <name>` и shortcut `npm start|test|stop|restart` включает автоматические `pre<name>`/`post<name>` bodies. Reachable script hops обходятся с bounded cycle set; `npm restart` без собственного body включает stop/start lifecycles, а implicit `npm start` связывает repo-local `server.js`. Не связанные с executed graph scripts по-прежнему не инвалидируют receipt. Option-aware package-manager grammar расширена D-SV033.

### D-SV029 — Invocation errors отделены от phase-context gate failures

- **Status:** active · **Extends:** D-SV018/D-SV024
- **Why:** missing/repeated scalar flags раньше превращались в absent values и могли молча выбрать default `full`; semantic ошибка уже корректно разобранной phase-команды возвращала usage exit 4. Теперь `--profile`/`--task`/`--phase` принимают ровно одно непустое значение, а grammar/conflict/extra positional дают exit 4 с canonical usage. После успешного parse любой неразрешимый ticket/phase context остаётся механическим gate failure с exit 1 и teaching diagnostic.

### D-SV030 — Versioned argv policy binds every recognized repo-local verification operand

- **Status:** superseded by D-SV032 · **Extends:** D-SV026/D-SV027
- **Why:** прежний поиск «очевидного local input» останавливался после первого positional operand. Поэтому `node --test a.test.js b.test.js` связывал bytes `a`, но receipt переживал изменение `b`. Environment fingerprint теперь включает versioned declarative classifier, deterministic evidence и каждый распознанный operand: program для обычных node/tsx/python-like runners, repo-local path-valued runner flags, все operands `node --test`, а также source/package operands `go run` до `--`.
- **Evidence state:** каждый bound operand хешируется как исходный operand + lexical path + canonical repo destination + entry type + content digest; каталоги обходятся детерминированно. Inline/module form и неизвестный runner без path-like argv разрешены как явно записанные `inline-no-local-inputs`/external boundary: exact command literal и classifier version входят в fingerprint, но bytes внутри opaque program не объявляются связанными. Та же форма с local-looking operand/path-valued flag, dynamic shell expansion, неоднозначный runner flag или неподдерживаемый shell operator даёт явный unsupported plan error вместо partial receipt.
- **Boundary:** это small argv policy, не shell parser и не proof полной герметичности процесса. Inline program text, package resolution, external absolute inputs, binaries, implicit tool configs, environment и remote services остаются явно внешней boundary; изменение exact command всё равно инвалидирует plan.

### D-SV031 — Verification plan is frozen before execution starts

- **Status:** active · **Extends:** D-SV021/D-SV025/D-SV030
- **Why:** §5 validation previously happened indirectly while building the receipt after repair, foundation and extras had already run. An unsupported dynamic/local input could therefore execute before being rejected. The transaction now clones caller-owned phase inputs, computes the complete receipt plan and environment/local-input binding before deleting old evidence or invoking any runner, then drives the ladder, §5 commands and receipt from that same frozen plan. Unsupported input means zero commands and the old receipt remains unchanged because no attempt began.

### D-SV032 — Runner adapters replace opaque inline/external provenance claims

- **Status:** active · **Supersedes:** D-SV030 inline/unknown-runner boundary
- **Why:** отсутствие path-like argv не доказывает отсутствие локальных reads: `node -e "require('./config.js')"` и `tsc --project tsconfig.json` сохраняли прежний environment state после изменения config. Policy v3 теперь fail-closed отклоняет inline/module execution (`node -e/-p/--eval`, shell/python-like `-c/-m`) и любой runner без именованного adapter. Versioned adapters связывают точные inputs: `tsc -p/--project` разрешает file или directory до одного config, implicit `tsc` связывает root `tsconfig.json`/его отсутствие; `prettier`/`eslint`/`vitest`/`c8` консервативно связывают repo config candidates; `gennady` связывает path-valued flags/operands; `npx` допускает только child с тем же именованным adapter; package-manager script hops связываются через уже развёрнутый script graph. Обычный node/tsx/python-like script и `node --test` продолжают связывать явные operands.
- **Evidence:** adapter policy/version и решение config discovery входят в classifier fingerprint; каждый существующий input по-прежнему хранит operand + lexical + canonical + type + content digest. Directory-valued `tsc --project` связывает конкретный `<dir>/tsconfig.json`, не произвольное дерево.
- **Boundary:** это не proof transitive module/import graph и не shell parser. Внешний executable/binary, package resolution, environment и remote state не входят в receipt; unsupported runner обязан быть обёрнут поддерживаемым file-backed script либо получить будущий явный adapter, а не молча считаться external.

### D-SV033 — Exclusive atomic receipt and option-aware package-script hops

- **Status:** active · **Extends:** D-SV028/D-SV031/D-SV032
- **Atomic receipt:** deterministic PID temp names allowed a preplanted symlink to receive the receipt bytes and then replace the ticket. The transaction now creates an unpredictable same-directory temp with `O_CREAT|O_EXCL|O_NOFOLLOW`, proves it is a regular file, writes and fsyncs through its descriptor, revalidates the original ticket device/inode immediately before rename, and advances expected identity to the owned temp only after rename. Failure cleanup unlinks only the exact temp device/inode created by this transaction.
- **Package-script grammar:** the same strict parser both discovers transitive script hops and classifies their provenance. It supports root-scoped `npm`/`pnpm`/`yarn` run forms, their documented run aliases/shortcuts, and bounded `--silent` plus root selector placement (`npm --prefix .`, `pnpm --dir .`, `yarn --cwd .`). Every selected script conservatively binds its `pre`/body/`post` graph (even where a manager/version can disable hooks), preferring harmless stale evidence over an omitted executable hook. Options that can change workspace/package selection, unknown option forms, missing scripts and non-root selectors fail during plan preflight, before receipt invalidation or command execution. Arguments after an identified script name remain script argv and do not alter hop ownership.
- **Why:** regex recognized `npm run custom` but missed `npm --silent run custom`, while the runner adapter still accepted the command as bound. A successful command could therefore produce a receipt whose environment omitted the executed custom script and its local inputs.

### D-SV034 — Coverage freshness consumes the shared platform registry

- **Status:** active · **Расширяет:** D-SV016
- **Why:** D-SV016 hardcode'ил Istanbul path `coverage/coverage-final.json`, поэтому новый Go/iOS/Android coverage adapter требовал отдельной правки sdd-verify и расходился с testcov. Теперь CLI выбирает ровно один shared `CoverageAdapter`; его repo-relative report identity и writable directories создают `CoverageProbe`.
- **Fail-closed:** unsafe/ambiguous/unsupported adapter artifact остаётся dormant для setup/code, но останавливает test:coverage до producer. Старый report удаляется identity-safe; symlink component или race не следует наружу и не допускает запуск producer.

### D-SV035 — Forwarded package-script argv is executable provenance

- **Status:** active · **Extends:** D-SV033
- **Why:** D-SV033 correctly kept arguments after the selected npm/pnpm/yarn script name out of hop ownership, but the package-runner adapter then discarded them entirely. A local `--config` changed the executed tool while its bytes did not change `environmentState`. The strict shell-word lexer now preserves quoted and backslash-escaped whitespace (malformed quotes/escapes fail preflight); exact forwarded argv enters classifier evidence and every explicit/existing repo-local operand enters content evidence. Changing a forwarded config invalidates the receipt for all three supported managers.

### D-SV036 — Coverage observes in-process layers; black-box layers still run exactly once

- **Status:** active · **Extends:** D-SV010/D-SV011
- **Why:** this repository's `test:coverage` used to place the complete deterministic corpus under c8, although local/external suites mostly observe production through child CLI/Git/network boundaries and deliberately clear child `NODE_V8_COVERAGE`. Instrumenting their parent harness added cost without observing the child production code. The topology runner now gives every discovered test exactly one layer and one coverage-command owner: c8 runs `unit+contract`, where production executes in-process; then `local+external` run once without c8. Either partition failing fails the producer. `npm test` remains one complete deterministic run; `npm run test:coverage` remains the full profile's single producer and also executes the complete corpus exactly once.
- **Visibility:** `npm run test:topology`, runner `check`, `list`, and `--help` expose layer counts and the coverage partition. The topology contract compares their union with the legacy corpus and rejects omissions, overlaps, or duplication. Network opt-ins and credentials are removed independently for every child process. The already-instrumented observed runner clears inherited `NODE_V8_COVERAGE` before tests, so its later subprocesses cannot emit irrelevant child profiles while the current in-process production remains observable. Concurrency remains bounded at the existing value and is not the optimization mechanism.
- **Boundary:** this is the package's concrete implementation of the project brick, not a cross-platform requirement on consumer repositories. A future layer that executes production in-process must be classified into an observed layer (or the partition model extended explicitly), never silently excluded.

### D-SV037 — Repair ABI belongs to explicit capabilities, not generic `lint:fix`

- **Status:** active · **Extends:** D-SV019/D-SV022
- **Why:** phase repair unconditionally appended Gennady-only `--include-tests` and `--spec` to the project's generic `lint:fix`. A valid ESLint leaf therefore failed before linting the original IB-gates target set (`package.json` + `scripts/gates-smoke.mjs`), while a Gennady leaf received unsupported non-TS operands. Repair now plans ordered adapters: formatter receives the declared exact set; the selected project-linter adapter receives only its applicable exact subset and its own ABI; the Gennady contract adapter receives `--include-tests`, owning `--spec`, and only `.ts/.tsx` targets.
- **No duplicate:** when `lint:fix` already reaches Gennady, that one project invocation satisfies both project and contract roles. Otherwise Gennady contract lint runs once after the project linter. Zero applicable targets produce stable named skip evidence rather than an unsupported-target error.
- **Extensibility/safety:** platform support is an ordered registry entry (`matches` + `accepts` + capability), not an extension ladder inside `runTargetRepair`. All invocations remain inside one formatter→lint runtime mutation boundary; broad roots are never synthesized, and any actual outside mutation remains listed and fail-closed.

<!--SECTION:OPEN_RISKS-->

## 8. Open Risks

- **Детектор фиктивных скриптов — эвристика без реального парсера shell.** `isVacuousScript` ловит: no-op-класс (`echo …`, `true`, `:`, `exit 0`, пустой `node -e ""`, чистый `npm run`-переход); маскировку кода возврата no-op-фолбэком через `||`/`;` (после которого реальных команд не осталось, с учётом `set -e`); реальную команду в нефинальной ступени пайпа (`tsc | cat`, если нет `set -o pipefail`); сабшелл/brace-group фолбэк (`|| (echo x && true)`). Разбор учитывает кавычки и вложенность скобок, стрипает `#`-комментарии (закрыто `# --write`/`# gennady`), различает точный флаг (`--fix` мутирует, `--fix-dry-run` нет), требует `gennady` в позиции команды (не в `echo`/комментарии) и идёт по `npm`/`pnpm`/`yarn run`. Остаточные пропуски (осознанно, направление «пропустить экзотику» безопаснее «заблокировать честный проект»): написанная вручную всегда-успешная программа (`node -e "process.exit(0)"`), подстановки `$(...)`, `eval`, маскировка через индирекцию (`cmd || npm run fallback`). Ложное срабатывание опаснее (честный проект → `provisional` навсегда без override), поэтому правила консервативны. **Предложенное усиление:** waiver-механизм на уровне readiness (явная строка «скрипт настоящий, вот почему») для обхода ложного срабатывания без правки детектора.
- **Infra bootstrap ownership теперь fail-closed.** Исключение получает только exact active ticket phase, связанная с конкретными missing gates через Bootstrap Requirements (`Readiness Gates` + `Gate Artifacts`) и совпадающие phase `Readiness Gates` + `Target Files`. Ноль/несколько owners оставляют очередь пустой и печатают teaching diagnostics; unrelated impl/test phase того же ticket не получает setup.
- **Setup-пропуск не различает «скрипта ещё не было» от «его удалили».** Это допустимо только у bootstrap/config/doc-фазы; профиль теперь выводится механически из kind, поэтому impl/test не может выдать себя за setup.
- **Deletion оформляется отдельно от repair.** `Target Files` остаются существующими файлами; `Deleted Files` обязаны отсутствовать и иметь tracked VCS baseline до staging/commit. Receipt связывает их отсутствие, поэтому повторное появление stale'ит evidence; pre-staged removal без index baseline намеренно требует восстановить проверяемый порядок.
- **Environment provenance ограничен adapter-visible вводом.** Runner и receipt используют одно resolved script name (`type-check`, иначе `typecheck`), затем fingerprint'ят его reachable npm lifecycle (`pre`/body/`post`, включая start/test/stop/restart shortcuts) и root-scoped option-aware `npm`/`pnpm`/`yarn` script graph. Exact forwarded argv после script name входят в classifier evidence, а каждый распознанный repo-local operand/config (включая quoted и backslash-escaped whitespace) связывается по lexical/canonical/type/content evidence. Malformed shell word, inline code, неизвестный runner, отсутствующий/escaping input, non-root package selector и неоднозначная local/dynamic форма краснят plan вместо partial receipt. Transitive module graph, package resolution, external absolute inputs, binaries/env/remote services остаются за явно записанной trust boundary — система не называет процесс полностью герметичным.
- **Workspace zero-write означает project content, не tool state.** Snapshot наблюдает persistent files, symlinks и directory entries, но исключает `.git` metadata и установленный `node_modules`: реальные VCS/package tools обязаны менять это служебное состояние. Эти исключения не разрешают менять production/source вне них.

<!--/SECTION:OPEN_RISKS-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** `node:child_process` (spawnSync), `node:fs`/`node:path`/`node:crypto` (package scripts, coverage freshness, workspace write-zone), `#logger`, `shared/sdd/readiness.ts` (`isVacuousScript`, static repair-prefix diagnostics)
- **Provides to:** `gennady.ts`; вызывается из `phase-execution-protocol` (STEP_5), `reconcile` (STEP_7)

<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
