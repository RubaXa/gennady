# Часть I — B1 (аналитик, Opus)

# B1 — VERIFY track: аудит переноса SDD v1 → v2 (MAIN `gennady verify` ↔ RC `sdd-verify`)

Дата: 2026-09-07. Read-only аудит. Источники:

- **MAIN** (v1, `origin/main` == `8bb38477`): `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`
- **RC** (v2, `codex/sdd-v2-rc52-followup` @ `11291af5`): `…/scratchpad/rc-v6`
- Прошлый план (сессия «SDD: v2 + v1», 2026-08-26/27): `…/scratchpad/merge-plan-v2plus1/{README.md,01-verify-and-stack.md,entry/step-5-verify.md}`
- Реальный потребитель: `git -C /Users/k.lebedev/.gennady/eval/cloud-ios/fixture-detmig show HEAD:gennady.yaml` (HEAD `9c04a878b0`, Swift/iOS, `stack.use: [anystack]` + 3 `extraGates`)
- Issues `rubaxa/gennady` #9, #17, #20.

Все `file:line` даны относительно корня соответствующего чекаута. Ссылки на строки проверены по `cat -n`/`grep -n` в этой сессии.

---

## 0. Резюме в шести пунктах

1. **Две половины одной задачи, и обе живы.** MAIN даёт стек-абстракцию (`services/stack/**`: `Gate`-как-данные, детект по маркеру, `gennady.yaml` deep-merge с провенансом, `ENV_FAIL`/`TIMEOUT`/`VIOLATION`, clean-tree guard + `--wip`, плагины node/golang/anystack, 198/198 юнит-тестов зелёные). RC даёт семантику фазы (профили по kind, halting-лестница, repair-first с exact Target Files, детекторы честности, `SDD_PHASE_RECEIPT` + групповые `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT`, runtime write-zone; 240/240 тестов зелёные). Ни одна сторона не покрывает другую.
2. **RC по-прежнему node-only на каждом слое**: `shared/sdd/readiness.ts:15-24` (8 точных npm-скриптов), `gatherReadinessInput` `:596-609` читает только `package.json`, `cli/cmd/sdd-verify/sdd-verify.cmd.ts:223-226` буквально `npm run <script>`, `shared/sdd/phase-verification-plan.ts:271` `npm run ${script}`, `shared/sdd/probe.ts:12` `CODE_EXT = /\.(js|jsx|ts|tsx)$/` («Node-only support today»), `shared/sdd/ladder.ts:65` `infraDone = packageJsonPresent && …`. В `.ts` RC нет ни `stack.use`, ни `anystack`, ни `extraGates` (grep по `cli/ shared/ services/` — только несвязанные хиты: inbox, `resolve-verify-commands`, тесты).
3. **Строка команды `npm run <x>` — персистентный контракт RC**, а не деталь реализации: она попадает в `SDD_PHASE_RECEIPT.commands[].command` и `gateEvidence[].command`, сверяется байт-в-байт при валидации (`cli/cmd/sdd-verify/phase-receipt-validation.ts:95-106`) и участвует в fingerprint окружения (`shared/sdd/phase-receipt.ts:1250` `/^npm run (\S+)$/`). Любая смена представления команды инвалидирует все существующие receipts. Это главное ограничение «byte-for-byte parity» для node.
4. **Прошлый план (DL-20/22 «checkpoint через `git write-tree`») вытеснен**: RC уже реализовал детекцию мутаций на грязном дереве без git — `cli/cmd/sdd-verify/workspace-mutation.ts` (sha256-снимок всего дерева кроме `.git`/`node_modules`, fail-closed, никогда не откатывает). Фаза 5.6 плана в прежней формулировке неверна.
5. **Рекомендация — вариант A′ (Engine-в-v2 с presets как данные), но с verbatim-переносом примитивов MAIN** (`env-fail.ts`, `stack-config.ts`+`config-loader.ts`, `tree-guard.ts`, типы `Gate`/`Cmd`/`GateSpec`) и **новым node-пресетом, воспроизводящим текущие строки RC** (не `plugins/node/classify-npm-scripts.ts` — у него другая семантика выбора и другие id гейтов: `typecheck`, нет `test:coverage`/`yagni`/`fix`). Вариант B (MAIN `services/stack` как движок) проигрывает на трёх фактах: sync `spawnSync` ломает параллельный quality-tail `full` (`sdd-verify.cmd.ts:605-648`), RUN-ALL runner не экспортирует per-gate исполнение (`runGate`/`executeGate` не экспортированы, `services/stack/gate-runner.ts:133,225`), классификатор node не даёт parity. Вариант C (сосуществование двух глаголов) оправдан только как переходный этап для CI/оператора и как дом для `gennady fix`.
6. **Стек должен детектироваться из репозитория и протягиваться `sdd-state → readiness → sdd-task → sdd-verify → infra directive → rules`**; сегодня в RC такого узла нет вовсе — единственный «детектор» это `package.json`. Дизайн: один `StackDetection` (из MAIN `stack-registry.ts:44-64` + `resolve-verify-commands.logic.ts` как референс маркеров) → `ReadinessInput.stack` → профили резолвятся пресетом → `sdd-state` печатает `STACK=`, роутер/infra-директива выбирают baseline-правила (`ai/directives/coding/{go,python}-rules.xml` уже есть в MAIN, `knowledge.xml` ids `go-rules`, `python-rules`; в RC их нет).

---

## 1. Сравнительная таблица возможностей

Легенда: **есть** / **нет** / **частично**; в скобках — где именно.

| Capability | MAIN `gennady verify` (v1, PR#5) | RC `sdd-verify` (v2) |
|---|---|---|
| **Stack detection** | Есть. `services/stack/stack-registry.ts:44-64` `detectStacks(root, config, registry)` перебирает `BUILTIN_STACK_PLUGINS` (`plugins/index.ts:15` — `anystack`, `golang`, `node`, сортировка по id `stack-registry.ts:12-14`), `config.use` только сужает кандидатов. Маркеры: node `plugins/node/node-plugin.ts:45,51` (`package.json`), golang `plugins/golang/golang-plugin.ts:57` (`go.mod`), anystack `plugins/anystack/anystack-plugin.ts:24-34` (матчит всегда, 0 гейтов). Мультистек — нормальный режим (`verify.cmd.ts:160-179`). | Нет. Единственный сигнал — `package.json`: `shared/sdd/readiness.ts:596-609`; `shared/sdd/probe.ts:12` `CODE_EXT` только js/jsx/ts/tsx, `:15-…` `CONFIG_FILES` = tsconfig/eslint…; `cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts:34-72` знает `go.mod`/`Cargo.toml`, но питает только текст подсказок (consumer `build-ai-verify-placeholders.logic`). |
| **Config (`gennady.yaml`/`.gennadyrc`, deep-merge, provenance)** | Есть. `services/config/config-loader.ts:281` `loadConfigSection(root,'stack')` (section-agnostic; `PROJECT_CONFIG_FILENAME` `:11`); приоритет `<repo>/.gennadyrc` > `<repo>/gennady.yaml` > `$HOME/.gennadyrc`, объекты мержатся, листья заменяются (`services/stack/stack-config.ts:345`); per-key provenance `Map` (`:62`, `provenanceOf` config-loader `:257`); строгая валидация — любая ошибка фатальна, exit 4 (`cli/cmd/verify/verify.cmd.ts:107-117`, `stack-config.ts:247-340`); `GATE_SPEC_KEYS` `:34-45`; `applyStackConfig` override→skip→extra `:428-549`; `unmatchedGateOverrides` `:398-414`; `--stack` = one-shot `use` (`verify.cmd.ts:128-132`). Догфуд `gennady.yaml:1-11` (node `skipGates:[lint]`, override `gennady.argv`). | Нет ни файла, ни загрузчика. Настройка = `package.json#scripts` + тикет §5 (`phase-context.ts:134-226` `parseVerificationTable`). |
| **Gate-as-data (поля)** | `services/stack/stack.types.ts:134-170` `Gate{id, stack, label, argv, cwd, env?, timeoutMs (обязателен), outputMeansFailure, driftMeansFailure?, envFail?: EnvFailPredicate[], requires?: Cmd[], fixer?: Cmd, skipped: string|null}`; `Cmd` `:117-128`; `EnvFailPredicate` `:96-110` (`hint`, `kind: exit|output`, `describe`, `source`); config-shape `GateSpec` `:236-257`. Исполнение без shell (`gate-runner.ts:234`). | `cli/cmd/sdd-verify/sdd-verify.types.ts:21-30` `Gate{name, mutates, haltsOnFailure, via?: 'npm'|'gennady'|'target-repair'}`; реестр `GATES` `:36-44` (`fix, type-check, test, test:coverage, lint, format, yagni`). Команда собирается в рантайме: `sdd-verify.cmd.ts:223-226` (`npm run <script>` / `gennadyGateCommand` `:159-164`). План фазы `shared/sdd/phase-verification-plan.ts:77-92` `PhaseVerificationGatePlan{name, state, required, command: string|null, prerequisites, provider, next}`; `commandForGate` `:253-272` → `'target-repair'` или `` `npm run ${script}` ``. Нет `timeout`, `cwd`, `env`, `envFail`, `requires`, `fixer`. |
| **Execution model** | **RUN-ALL + SUPPRESS-ON-SUCCESS**: `gate-runner.ts:351-383` `runVerify` → `runs.flatMap(gates.map(runGate))`, никогда не останавливается; `executeGate` `:224-340` sync `spawnSync`, `killSignal: SIGKILL`, `maxBuffer 64MB`, per-gate `timeout`; `requires` — первое упавшее предусловие = `env-fail`, гейт не запускается (`:178-215`). | **Halting ladder**: `sdd-verify.cmd.ts:431-598` последовательно; `haltsOnFailure` → `haltedAt` + `break` (`:594-597`); required-missing/vacuous → `status:'missing'` + `break` (`:511-525`); repair-first (`fix` первым в `GATES`), `runTargetRepair` `:252-317` с адаптерами `repair-adapters.ts:94-156` (formatter → project-linter/eslint → gennady-contract) над exact Target Files; в `full` quality-tail (`lint`,`format`,`yagni`) — параллельно `Promise.all` после зелёного foundation (`:600-648`); async `execFile` без timeout (`:92-114`). Один repair-pass: foundation идёт после `fix`, повторного прогона нет (D-SV017 сменил D-SV014). |
| **Profiles by phase kind** | Нет понятия фазы. Скоуп: `files`/`changed`/`all` (`verify.cmd.ts:150-153`). | Есть. `phase-verification-plan.ts:29-35` `phaseProfileForKind`: `bootstrap/config/doc→setup`, `test→test`, `impl/refactor/fix→code`; наборы `:43-50` (`full`: type-check, test:coverage, lint, format, yagni; `test`+producer: fix, type-check, test:coverage; иначе fix, type-check, test); required `:58-64` (`setup` → ничего не обязательно). Публично только `--profile full`; фазовые профили выводятся из `--task/--phase` (`sdd-verify.types.ts:157-183`). Infra-queue exemption: не-ready проект → фаза, владеющая недостающим гейтом, получает `setup` (`phase-context.ts:253-296`). |
| **Readiness (точный список)** | Нет. Ближайшее: диагностики детекта `NODE_NO_SCRIPTS`/`NODE_INVALID_MANIFEST` (`node-plugin.ts:70-81`), `ZERO_GATES` (`gate-runner.ts:119-124`). | `shared/sdd/readiness.ts:15-24` **`REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix']`** (8, alias `typecheck` `:30-32`). `checkReadiness` `:434-564`: + `lintHasGennady` (`scriptReachesGennady` `:170-190`), `formatReadOnly`/`lintReadOnly`/`checkReadOnly` (`WRITE_SWITCH_PATTERN` `:243-244`), `formatFixMutates`/`lintFixMutates` (`MUTATING_SWITCH_PATTERN` `:263`), `isDeclaredArgumentForwardingRepairBrick` `:296-314`, `fixHasCanonicalRepairOrder` `:216-236`, `gennadyAvailable` (`detectGennady` `:572-587`). Уровни `not-ready/provisional/ready`, `executionReady = level==='ready'` `:562`. Потребители: `cli/cmd/sdd-state/sdd-state.cmd.ts:153-155`, `cli/cmd/sdd-task/sdd-task.cmd.ts:107,123,462-487` (hard block `ERR_CLI_SDD_TASK_INFRA_NOT_READY`, `sdd-task.types.ts:427-447`), `phase-context.ts:257-296`, `shared/sdd/gate-queue.ts:365,392` (`missingGates` → владельцы через `BOOTSTRAP_REQUIREMENTS`). |
| **Receipts** | Нет. Отчёт эфемерен (stdout/`--json`). | Есть, два уровня. **Фазовый** `SDD_PHASE_RECEIPT` (`shared/sdd/phase-receipt.ts`, 1421 строк): схема `:16-60`, `planState = sha256(JSON(plan))` `:91-93`, `environmentState` = fingerprint тел скриптов + транзитивных `npm run`-хопов + локальных входов (`:1203-1255`), `targetEvidence` по байтам; запись `cli/cmd/sdd-verify/phase-run.ts:232-428`: план замораживается до исполнения (`:242-262`), старый receipt инвалидируется до первой команды (`:294`), §5 extras verbatim через shell (`index.ts:73-84`, `shell:true`) под read-only boundary (`:326-365`), атомарная запись O_EXCL|O_NOFOLLOW (`:73-150`), маркер `<!--SDD_PHASE_RECEIPT:P-->` (`:65-71`). Валидация `phase-receipt-validation.ts:209-254` (пересчёт плана, команды, байты целей, supersession через DAG). `sdd-log complete` отказывает без receipt (`cli/cmd/sdd-log/sdd-log.types.ts:284-286`). **Групповой** `shared/sdd/group-receipt.ts:14-17` `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT`, пишется `sdd-log <group> audit-receipt|review-receipt <verdict>` (`sdd-log.cmd.ts:72-73`) на owning spec, HEAD-ref + SHA-256 подпись состава (`:41,136-141`), reopen инвалидирует; коды `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` (ledger E1, коммит `4bb00f4b` 2026-09-06). |
| **Honesty detectors** | Частично: классификатор отбрасывает watch-скрипты/umbrella (`plugins/node/classify-npm-scripts.ts:26-64`), мутирующие скрипты → видимый skip (`node-plugin.ts:118-131`); `ZERO_GATES` не даёт exit 0 (`verify.cmd.ts:375-376`). Нет детекции заглушек, нет свежести покрытия. | Есть, ядро v2: `isVacuousScript`/`isStubScript` (`readiness.ts:396-420`, `NO_OP_SEGMENT` `:322-323`, quote/`(...)`-aware `commandSegments` `:338-380`); required-missing/vacuous → `⛔` `missing` (`sdd-verify.cmd.ts:511-525`, `:613-626`); single-producer coverage freshness `verifyCoverageWritten` `:191-211` + `CoverageProbe` `:169-182` через `cli/cmd/testcov/coverage-adapter-registry.ts:8` (только `istanbulCoverageAdapter`); runtime write-zone `workspace-mutation.ts:289-403` (D-SV022); `setup`-вердикт помечает себя bootstrap-уровнем (`sdd-verify.types.ts:347-354`); канон тела скрипта = fingerprint в receipt (`phase-receipt.ts:1203+`). |
| **Tree guard / `--wip` / lock** | Есть. `services/stack/tree-guard.ts:140-266`: lock `.git/gennady-verify.lock` (`:126-129`, per-worktree через `--absolute-git-dir`), crash-recovery по `cleanAtStart` (`:186-192`), refuse-dirty `DIRTY_TREE` (`:205-214`), `reset --hard` + `clean -fdq` без `-x` (`:229-230`), signal/exit handlers (`:251-258`); `wip`: без precondition, `drift()` → `''`, `reset()` no-op (`:223-228,264`), ожидание lock `LOCK_WAIT_MS` 15 мин (`gate-runner.ts:28,83`). Ранний отказ в `verify.cmd.ts:304-331` (exit 4). Нет git/HEAD → `UNSANDBOXED_RUN` (`gate-runner.ts:106-112`). | Нет git-guard и нет lock. Аналог: `workspace-mutation.ts` — sha256-снимок всех файлов кроме `.git`/`node_modules` (`:101,134-169`), fail-closed, **никогда не откатывает** (`:373` «changes were left intact for operator inspection»); отдельные write-zone для repair (exact targets), foundation (только coverage-dir), §5 extras (пусто); `full` runtime read-only (`index.ts:88-93`). git используется только для `Deleted Files` (`phase-context.ts:244-250` `git ls-files`). |
| **Verdict taxonomy** | `stack.types.ts:181` `pass | fail | env-fail | skipped | timeout | violation`; порядок разбора `gate-runner.ts:273-339` (env-fail предикат → timeout → violation → drift-FAIL → `outputMeansFailure` → exit); отчёт `formatVerifyReport` `:415-514`: `[verify] ❌ FAIL|ENV_FAIL|TIMEOUT|VIOLATION gate: <stack>:<id>`, `[verify] ⏭️  SKIP gate:`, `[verify] ALL_GATES_PASS (n/m) — …`, `ZERO_GATES`, `BLOCKED`. | `sdd-verify.types.ts:201` `pass | fail | skipped | missing`; `VerifyOutcome` `:225-227`; коды `ERR_CLI_SDD_VERIFY_GATE_FAILED` (`:380`), `ERR_CLI_SDD_VERIFY_BAD_INVOCATION` (`:14`), `ERR_CLI_SDD_VERIFY_PHASE_CONTEXT` (`phase-context.ts:82`), `ERR_CLI_SDD_VERIFY_RECEIPT` (`phase-run.ts:59`), `ERR_CLI_SDD_VERIFY_EXTRA_FAILED` (`:357,369`), `SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED` (`:255`). **Нет `env-fail`/`timeout`**: spawn-ошибка = exit 127 и статус `fail` (`sdd-verify.cmd.ts:70,108-111,231`). Различение «код vs окружение» переложено на аудитора-LLM (`ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml:32-46`, случаи (a)/(b)). |
| **Narrowing (`--only/--skip`, files)** | `--only=<a,b>`/`--skip=<a,b>`, `stack:gate` или bare `gate`, точное совпадение (`verify.cmd.ts:69-71,166-212`); неизвестный селектор → exit 4 (`:190-199`); `--only` снимает config-`skipGates` (`:164-176`). Позиционные файлы → `ScopeRequest.mode='files'` (`:150-153`); node их игнорирует (D-STACK-006, `node-plugin.ts:105-110`), anystack тоже (`anystack-plugin.ts:37-45`), golang сужает пакеты. | Нет `--only/--skip`; любой позиционный аргумент → exit 4 (`sdd-verify.types.ts:128-133`). Сужение — структурное: Target Files фазы (`phase-context.ts:169-239`) сужают только repair-rung и write-zone; foundation (`npm run test`) всегда репо-уровневый. |
| **Output-on-pass** | Сбрасывается: `gate-runner.ts:331,336` `output: ''`; `stack.types.ts:186` «retained only for non-passing gates». `--json results[]` даёт команду/статус, но не вывод. Issue #17. | Тоже не показывается: `lineFor` `sdd-verify.types.ts:288-295` печатает `✅ name (Ns)`; `GateResult.output` хранится, но рендерится только в `failBlock` `:302-315`. Receipt хранит только `command`/`exitCode` (`phase-run.ts:210-219`). |
| **JSON** | `--plan --json` (`verify.cmd.ts:219-245`, предикаты рендерятся через `describe`), `--json` результаты (`:335-372`: `ok`, `passed`, `total`, `envFailed`, `results[]{stack,id,command,timeoutMs,status,exitCode,durationMs,output}`), `--full-output`. | Нет machine-readable stdout. Машинный артефакт — JSON внутри `SDD_PHASE_RECEIPT` в тикете и `gate-state:` строки (`phase-verification-plan.ts:376-378`; печатают `phase-run.ts:423`, `sdd-task.types.ts:259`). |
| **Exit codes** | `0` pass · `1` gate failed / ZERO_GATES · `4` bad invocation/config/DIRTY_TREE · `5` no stack (`verify.cmd.ts:41-46,139-148`). | `0` · `1` gate/context/receipt failed · `4` bad invocation (`help.ts:96`; `index.ts:23,67,96`). |
| **Mutation policy / fixers / repair** | D-STACK-005: гейт не мутирует; дрейф → `violation` + `reset` (`gate-runner.ts:259-266,306-315`); `driftMeansFailure` → дрейф = `fail` «run `gennady fix`» (`:317-324`); мутации — отдельный глагол `gennady fix [stack:id] [--all]` (`cli/cmd/fix/fix.cmd.ts:1-9`, `runFix` `gate-runner.ts:523-533`, fail-fast, без guard). | Repair-first: `fix` rung мутирует **только** exact Target Files, доказано runtime-диффом (`runTargetRepair` `sdd-verify.cmd.ts:252-317`, boundary `repair`), foundation в пустой write-zone кроме coverage-dir (`:381-429,540-569`), `full` без fix-ступеней. Fixer'ы фиксированы: `format:fix`, `lint:fix` ABI, `gennady lint --autofix` (`repair-adapters.ts:58-77,94-156`). Нет per-gate policy, нет drift-гейтов. |
| **Tests (файлы/кейсы)** | `services/stack/__tests__`: env-fail 14, gate-runner 46, gate-spec-parity 2, stack-config 29, stack-registry 5, tree-guard 12; `plugins/node/__tests__/node-plugin` 14; `plugins/golang/__tests__` detect 13 / plan 20 / scope 13; `cli/cmd/verify/__tests__` 16; `cli/cmd/fix/__tests__` 4; e2e-фикстуры: node 11, golang 49, anystack 7, config 17 (`scripts/stack-e2e.ts`, требуют toolchain). **Прогон: 198/198 pass** (см. §5). | `cli/cmd/sdd-verify/__tests__`: phase-context 17, phase-run 22, sdd-verify.cmd 75, workspace-mutation 8; `shared/sdd/__tests__`: readiness 50, phase-verification-plan 11, gate-queue 14, phase-receipt 27, group-receipt 16, ladder 9, project-feasibility 11, scripts 11. **Прогон: 240/240 pass при cwd=RC** (17 сабтестов `phase-run` cwd-зависимы, см. §5). |
| **Directive consumers и парсимые маркеры** | `ai/directives/sdd/phase-execution-protocol.xml:90,319` (`STEP_5_VERIFY`: `<sdd-path> verify --wip <target-files>`, «RUN-ALL», «SUPPRESS-ON-SUCCESS», «single summary line», `--json results[]`); `ai/skills/sdd-execute/SKILL.md:98` `sdd verify --wip <target-files>`; `ai/skills/sdd-execute/scripts/verify.sh:69-92` capability-probe `verify --plan --json` → `exec gennady verify "$@"`, иначе legacy npm-классификатор (`:105-203`, печатает `[verify] ALL_GATES_PASS (n/m)`). | `phase-execution-protocol/steps/STEP_3_VERIFY.xml:5-15,28` (`AX_VERIFICATION_BEFORE_HANDOFF`: ровно один `sdd-verify --task --phase`, receipt = evidence; **текст всё ещё говорит «owns STEP_5»** — устаревшая нумерация, шаги теперь `STEP_1_ORIENT..STEP_4_HANDOFF`); `ai/kit/axiom/process/ax-permitted-bash-commands.xml:3-7` (то же «STEP_5», запрет `--profile full` из фазы); `audit/steps/STEP_1_MECHANICAL.xml:22,75-76,98` — парсит связку **`⛔` + `обязательная ступень профиля`** как случай (a) и зовёт `sdd-verify --profile full`; `readiness.directive.xml:3-8,155-167,191-192` («восемь кирпичей», `⛔`, `ERR_CLI_SDD_TASK_INFRA_NOT_READY`); `router.directive.xml:294-304` LogicSwitch по `EXECUTION_READY`/`GATE_QUEUE`; `execute.directive.xml:40,53,57-90` (receipts). Первоисточник — `.hbs` в `ai/kit/templates/sdd-v2/` (`package.json:42-43` `build:directives`, `check:directives-fresh`). |

### 1.1 Что реально использует потребитель (cloud-ios, `gennady.yaml`)

`stack.use: [anystack]`; три `extraGates`: `swiftlint` (`cwd: MRCloudApp`, `argv: [mise, exec, --, swiftlint, lint, --strict]`, `timeout: 10m`, два `envFail` — `outputMatches` и `outputMatches`+`exitCodeMatches: '!=2'` с `hint`, `fixer` `sh -c` с git-диффом изменённых `.swift`), `build` (`requires: [{argv:[test,-d,…xcworkspace], hint}]`, `argv: [sh, -c, <xcodebuild build …>]`, `timeout: 90m`, 4 `envFail`), `unit-tests` (`sh -c` со сужением по `Tools/impacted-test-targets.py`, `-resultBundlePath`, `timeout: 90m`, `envFail`). Использованные поля схемы: `cwd`, `argv` (с `sh -c` — «shell-театр» из прошлого плана подтверждён), `timeout`, `envFail{outputMatches, exitCodeMatches, hint}`, `requires{argv,hint}`, `fixer{cwd,timeout,argv}`. Не использованы: `env`, `outputMeansFailure`, `driftMeansFailure`, `skipGates`, `overrideGates`. Комментарии в файле опираются на D-STACK-017 (коммитить ДО прогона), на обрезку 20/40 строк `gate-runner.ts:19-21` и на то, что `--full-output` действует только в `--json`. Вывод: **anystack + полный `GateSpec` — это уже публичный контракт**, который v2 обязан принять как есть (иначе потребитель ломается).

---

## 2. Что изменилось в RC с 2026-08-27 относительно фактов прошлого плана

59 коммитов в RC после 2026-08-27; по verify-поверхности ключевые: `aa524dd9` (RC flow), `d633bb85` (harden scaffold/execute), `e95dd106` (actionable tool failures), `4547c82f` (workspace boundary), `383e3f73` (unclamp, eval docs), `4bb00f4b` (group receipts, 2026-09-06).

### 2.1 Поитемно

| Факт прошлого плана | Сейчас в RC | Вердикт |
|---|---|---|
| `sdd-verify.cmd.ts:240-243` — хардкод `npm run <script>` | Переехал в `sdd-verify.cmd.ts:223-226` (`runGate`); плюс второй источник строки — `phase-verification-plan.ts:271` и regex в `phase-context`/`sdd-verify.cmd.ts:502` `/^npm run (\S+)$/` | **ещё верно**, но теперь строка — часть receipt-контракта (см. §0 п.3) |
| Профили `setup/code/test/full`, лестница «type-check → test/coverage → format:fix → lint:fix → lint → format → yagni» | Лестница переписана D-SV017/D-SV018: **repair-first** `fix → type-check → test|test:coverage`; `lint/format/yagni` только в `full`; `format:fix/lint:fix` больше не гейты, а адаптеры внутри `fix` (`repair-adapters.ts`) | **устарело** (порядок и состав) |
| «Ровно один вызов `sdd-verify --profile <kind>` на фазу» | Публичен только `--profile full`; фаза зовёт `--task <ticket> --phase <P>`, профиль выводится CLI (`sdd-verify.types.ts:157-183`, D-SV018) | **устарело** |
| «Один ограниченный repair-pass: перезапуск фундамента, если fix переписал файлы» | Убран: fix идёт первым, foundation один раз (D-SV017 superseded D-SV014). `treeFingerprint` заменён на `RepairMutationBoundary` | **устарело** |
| Readiness «семь кирпичей + две обёртки» | **Восемь** required (`fix` добавлен) + `lintHasGennady` + read-only/mutating/prefix/order-проверки (`readiness.ts:15-24,434-564`) | **устарело** (список), **ещё верно** (node-only) |
| `readiness.ts` читает только `package.json#scripts` | `gatherReadinessInput` `:596-609` — подтверждено | **ещё верно** |
| Детекторы честности `isVacuousScript`/`isStubScript`, `verifyCoverageWritten`, `testcov --min` | Живы: `readiness.ts:396-420`, `sdd-verify.cmd.ts:191-211`; coverage через `coverage-adapter-registry` (D-SV034), `testcov` — отдельный reader в §5 тикета | **ещё верно** |
| Receipts — в плане не упоминались | Появились `SDD_PHASE_RECEIPT` (атомарные, с fingerprint скриптов) и групповые `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` (`group-receipt.ts`, `4bb00f4b`) | **новое, план не учитывал** |
| Workspace-mutation boundary — в плане не было | `workspace-mutation.ts` (D-SV022): детекция мутаций вне exact write-zone на грязном дереве, без git | **новое; вытесняет DL-20/22** |
| STEP_5_VERIFY как точка вызова | Шаг переименован в `STEP_3_VERIFY` (`phase-execution-protocol/steps/`), но тексты аксиом ещё ссылаются на STEP_5 (`STEP_3_VERIFY.xml:28`, `ax-permitted-bash-commands.xml:4`) | **устарело** + дефект нумерации в RC |
| `sdd-task` мягкий/жёсткий блок | Жёсткий: `sdd-task.cmd.ts:123` (pickable = queue при `!executionReady`), `:459-487` (`ERR_CLI_SDD_TASK_INFRA_NOT_READY` для не-`bootstrap/config/doc`); исключение только для владельца GATE_QUEUE | **ещё верно** (как RC-сессия и сообщила) |
| flow-verification redesign | Первая версия (универсальный `AX_PHASE_VERIFIED_BEFORE_CLOSE`) **отвергнута** критикой (ledger B1/B2 — deadlock close↔audit); принято: сохранить `AX_VERIFICATION_BEFORE_HANDOFF`, добавить групповые receipts на границе группы (ledger C1-C3, E1) | **вытеснено** новой моделью |
| «Харнесс не зовёт `sdd-verify`, node-only by design» (DL-2) | Round-trip eval на cloud-ios (`ai/flow-eval/docs/roundtrip-wall3-assessment.md`) упёрся в wall 3 — node-hardcoded readiness; обход — `roundtrip-readiness-shim.package.json` со стабами `node -e "process.exit(0)"` (файл сам просит «Remove once the flow branch consumes anystack readiness») | **ошибочно как основание откладывать verify**: харнесс уже гонит Swift и вынужден шимить readiness |

### 2.2 Фазы 5.1–5.7 прошлого плана

| Фаза | Вердикт | Почему |
|---|---|---|
| 5.1 «гейт-как-данные»: расширить `Gate` (`argv`/`cmd`, `timeoutMs`, `mutationPolicy`, `stack`), `GateStatus` += `env-fail/timeout/violation`, научить `verdict/failBlock/lineFor/haltReason` | **ещё верно** (аддитивно, поведение не меняется) с уточнением: `GateResult.ranCommand` и `PhaseVerificationGatePlan.command` должны для node остаться `npm run <x>` byte-for-byte | receipts сверяют строку команды (`phase-receipt-validation.ts:95-106`) |
| 5.2 node-пресет резолвер `resolveGates(profile, root, config)` = копия `GATES`+`verificationGateNames`+`requiredVerificationGateNames`; заменить `gatesFor()` | **ещё верно по цели, устарело по деталям**: сейчас источник плана — `phaseContext.gatePlan` (`sdd-verify.cmd.ts:357-368`), а не `gatesFor`; резолвер должен жить в `shared/sdd/` (его потребляют `sdd-task`, `phase-context`, `phase-receipt`), а не в `cli/cmd/sdd-verify/stack/` | shared план используется тремя командами (`phase-verification-plan.ts:1-3`) |
| 5.3 `env-fail`/`timeout` в вердикт | **ещё верно**; плюс аудит-директива уже различает (a)/(b) текстом — машинный `env-fail` снимет с LLM эту классификацию (`STEP_1_MECHANICAL.xml:32-46`) | — |
| 5.4 развязать readiness от npm («7 обязанностей» + node-adapter; потребители `sdd-task.cmd.ts:23,106,318`, `sdd-state.cmd.ts:10,136-138`) | **ещё верно по направлению, устарело по строкам** (теперь `sdd-task.cmd.ts:19,107,123,462-487`; `sdd-state.cmd.ts:10,153-155,214-227`; `phase-context.ts:257-296`; `gate-queue.ts:365,392`; `ladder.ts:65`). Нужно критически пересмотреть (см. §3.4) | — |
| 5.5 конфиг `verify:` + `verify.gates[]` + `argv` XOR `cmd` + `mutationPolicy` | **частично ошибочно**: переименование `stack:`→`verify:` ломает единственного реального потребителя (cloud-ios `stack.use`/`stack.anystack.extraGates`); `cmd` как сахар над `sh -c` — полезно, но не блокер. Держать `stack:` как принятую схему (D-STACK-002), добавлять аддитивно | потребитель пишет `stack:` |
| 5.6 clean-tree guard two-path + checkpoint `git write-tree` (DL-22) | **вытеснено**: RC решил ту же задачу `workspace-mutation.ts` (снимок по sha256, fail-closed, без откатов) для фазового пути; для clean-caller (`full`/CI) нужен только verbatim `tree-guard.ts` | §0 п.4 |
| 5.7 SDD-артефакты (спеки, Decision Log, директивы + `.hbs`) | **ещё верно**; список директив шире: `readiness.directive`, `STEP_3_VERIFY`, `ax-permitted-bash-commands`, `audit/STEP_1_MECHANICAL`, `router`, `infra`, `execute`; спека `specs/cli/sdd-verify/sdd-verify.spec.md` уже до D-SV038 | — |

### 2.3 DL-3/13/20/21/22/23, O-1..O-6

| ID | Вердикт | Комментарий |
|---|---|---|
| DL-3 «ядро семантики v2 + примитивы PR#5; плагин-машинерия и golang отложены» | **частично устарело**: оператор зафиксировал golang/anystack/python/swift как обязательные — «отложить golang» снято | требуемые стеки: node, golang, anystack, python, swift |
| DL-13 (REQ-A-WIP) сохранить `--wip` при переносе guard | **ещё верно** для clean-caller пути; для фазового пути `--wip` не нужен: `sdd-verify --task --phase` уже работает на грязном дереве через boundary | — |
| DL-20 mutation-policy + checkpoint | **вытеснено** (boundary), но `mutationPolicy {forbid\|keep-fix\|drift-signal}` как **данные пресета** остаётся полезной идеей для golang (`go generate` drift, `gofmt -w`) | — |
| DL-21 дизайн конфига (`verify:`, `verify.gates`, `argv` XOR `cmd`, enum вместо `driftMeansFailure`) | **частично ошибочно** (rename ломает потребителя), остальное — аддитивные улучшения, не обязательны для parity | — |
| DL-22 two-path hybrid | **вытеснено**: путь фазы уже решён иначе (boundary); clean-caller — verbatim `tree-guard.ts` | — |
| DL-23 пресеты как YAML-данные внутри gennady | **ещё верно и усиливается**: `plugins/*/plugin.json` уже манифесты; node-пресет должен быть данными, воспроизводящими текущие RC-строки | — |
| O-1 охват стеков | **решено оператором**: node+golang+anystack+python+swift (swift через anystack-конфиг потребителя) | — |
| O-2 конфиг | **решено фактом**: `gennady.yaml` `stack:` — публичный контракт, переносится as-is | — |
| O-3 имя глагола | **открыто** (см. §3.6): `sdd-verify` — фазовый/групповой глагол; `gennady verify`/`fix` — clean-caller/CI и мутации | — |
| O-4 halt vs RUN-ALL | **решено**: halt — для фаз (RC), RUN-ALL — для `full`/CI-репорта, но `full` в RC уже гибрид (halting foundation + параллельный tail) — оставить | — |
| O-5 плагин-архитектура | **пересмотр**: `plugins/<id>/plugin.json` + `plugins/index.ts` — 15 строк статического индекса (`plugins/index.ts:15`), не overengineering; брать | — |
| O-6 пресет-модель | **ещё верно** | — |

---

## 3. Варианты A / B / C — с одинаковой строгостью

### 3.0 Критерии и три «жёстких» инварианта, которые режут варианты

Сравнение идёт по семи критериям: (1) **node-parity** — байт-в-байт текущее поведение RC на node-проектах; (2) **покрытие стеков** node/golang/anystack/python/swift; (3) **сохранность receipts** (`SDD_PHASE_RECEIPT`, `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT`); (4) **сохранность детекторов честности** (`isVacuousScript`/`isStubScript`, coverage-freshness, `workspace-mutation`); (5) **публичный конфиг-контракт** `gennady.yaml` `stack:` (реальный потребитель cloud-ios); (6) **закрытие issues #9 / #17 / #20**; (7) стоимость и риск.

Три инварианта, установленные кодом (а не мнением), задают рамку любому варианту:

- **И-1 (parity команд).** `runGate` формирует `ranCommand = \`${command} ${args.join(' ')}\`` (`cli/cmd/sdd-verify/sdd-verify.cmd.ts:219-240`); эти строки попадают в `receipt.commands[]` через `ladderCommands` (`cli/cmd/sdd-verify/phase-run.ts:210-219`) и сверяются при валидации. Для node это ровно `npm run <script>` и — для `via: 'gennady'` гейта `yagni` — `npx --no-install gennady yagni` либо (self-hosting) `npx --no-install tsx cli/gennady.ts yagni` (`sdd-verify.cmd.ts:145-164`). Смена *представления* команды инвалидирует существующие receipts.
- **И-2 (parity плана, но узкая).** `planState = sha256(JSON.stringify(plan))` хэширует **не** массив гейтов, а `PhaseReceiptPlan` (`shared/sdd/phase-receipt.ts:28-49,90-92`): `ticket, phase, profile, profileBasis, targets, deletedFiles, verification[], coverageOwner?, producesCoverage, environmentState`. `receipt.gateEvidence` сверяется с **проекцией** плана на четыре поля — `gatePlan.gates.map(({name, state, command, provider}))` (`cli/cmd/sdd-verify/phase-receipt-validation.ts:98-106`). **Следствие, важное для всех вариантов: обогащение `PhaseVerificationGatePlan` новыми полями (`argv`, `timeoutMs`, `cwd`, `env`, `envFail`, `stack`) receipt-безопасно** — пока `name`/`state`/`command`/`provider` не меняются. Это снимает главное опасение фазы 5.1 прошлого плана.
- **И-3 (environmentState привязан к `npm run`).** `phaseVerificationPlanEnvironmentState` (`shared/sdd/phase-receipt.ts:1242-1254`) выводит корни fingerprint'а из `gate.command` регуляркой `/^npm run (\S+)$/`, а `fix` разворачивает в `['format:fix','lint:fix']`. Для non-node стека корней не будет вовсе → `environmentState` схлопнется до §5-команд. **Каждый новый пресет обязан принести свой источник «тела гейта»** (см. §3.1.4), иначе честность «канон покрывает тело скрипта, а не имя» (`ai/kit/axiom/process/ax-verification-before-handoff.xml:6-13`) для python/swift/go пропадает молча.

---

### 3.1 Вариант A — актуализированный `Engine ↔ Preset ↔ Detector` внутри v2

**Тезис.** Движок и семантика фазы остаются в RC; литеральный реестр `GATES` (`cli/cmd/sdd-verify/sdd-verify.types.ts:36-44`) заменяется на `resolvePreset(stack, profile, root, config)`, возвращающий обогащённый `Gate[]`; примитивы PR#5 переносятся из MAIN verbatim.

#### 3.1.1 Переносится verbatim из MAIN (копия файла + правка путей импорта, без правки логики)

| Файл MAIN | Куда | Что даёт |
|---|---|---|
| `services/stack/env-fail.ts` | `shared/verify/env-fail.ts` | `outputMatches`, `exitCodeMatches`, вычисление `env-fail` |
| `services/stack/stack-config.ts` | `shared/verify/stack-config.ts` | `GATE_SPEC_KEYS:34-45`, парсер/валидатор `GateSpec`, `applyStackConfig:428-549`, `unmatchedGateOverrides:398-414`, deep-merge `:345` |
| `services/config/config-loader.ts` | как есть | section-agnostic загрузчик, `PROJECT_CONFIG_FILENAME:11`, `provenanceOf:257`, `loadConfigSection:281` |
| `services/stack/tree-guard.ts` | `shared/verify/tree-guard.ts` | lock `.git/gennady-verify.lock`, refuse-dirty, `--wip`, crash-recovery — только для clean-caller пути (`--profile full`, CI) |
| `services/stack/stack.types.ts` (типы `Gate`, `Cmd`, `GateSpec`, `EnvFailPredicate`, `GateStatus`) | `shared/verify/verify.types.ts` | форма гейта-как-данных |
| `services/stack/stack-registry.ts` (`detectStacks:44-64`) | `shared/verify/stack-registry.ts` | детект стека из репозитория; `config.use` только сужает |
| `plugins/index.ts` (`BUILTIN_PLUGINS:15`), `plugins/*/plugin.json` | как есть | статический реестр, 15 строк |
| `plugins/anystack/anystack-plugin.ts` | как есть | «матчит всегда, 0 гейтов, всё из `extraGates`» — контракт cloud-ios |
| `plugins/golang/{golang-detect,golang-plan,golang-scope}.logic.ts` + `golang-plugin.ts` | как есть | `GO_GATE_ORDER:17-24` (`generate,build,vet,fmt,lint,test`), `GO_TOOL_ENV_FAIL:163`, `GO_TEST_ENV_FAIL:170`, `GO_GENERATE_ENV_FAIL:176`, сужение по пакетам |
| `ai/directives/coding/{baseline-rules,go-rules,python-rules}.xml` + записи `knowledge.xml` (`id="baseline-rules"`, `id="go-rules"`, `id="python-rules"`) | как есть | в RC их нет вовсе (`ai/directives/coding/` содержит только svelte/ts/uikit) |

#### 3.1.2 Переписывается (файл → характер правки)

| Файл RC | Правка | Риск для parity |
|---|---|---|
| `cli/cmd/sdd-verify/sdd-verify.types.ts:21-44` | `Gate` += `argv`/`cwd`/`env`/`timeoutMs`/`envFail`/`requires`/`stack`; `GateStatus` += `env-fail|timeout|violation`; `lineFor:288-295`, `failBlock:302-315`, `verdict`, `haltReason` учат новые статусы | средний: рендер строки успеха обязан остаться `✅ name (Ns)` |
| `cli/cmd/sdd-verify/sdd-verify.cmd.ts:145-240,431-648` | `runGate` исполняет `argv` без shell, с `timeoutMs` (async `execFile` + `AbortSignal`, `SIGKILL`), считает `envFail`; `gennadyGateCommand` становится данными пресета | **высокий** (И-1): для node argv обязан оставаться `['npm','run',script]` и `['npx','--no-install',…]` |
| `shared/sdd/phase-verification-plan.ts:29-92,253-272` | `commandForGate` → `preset.commandFor(gate)`; профили (`phaseProfileForKind:29-35`, наборы `:43-50`, required `:58-64`) остаются как есть | низкий (И-2): `command` для node = та же строка |
| `shared/sdd/readiness.ts:15-24,296-420,434-609` | расщепление: движок обязанностей + `node`-adapter; `gatherReadinessInput:596-609` получает `StackDetection` | **высокий**: 50 тестов + 8 текстов директив |
| `shared/sdd/probe.ts:12-33` | `CODE_EXT`/`CONFIG_FILES` → из пресета | низкий |
| `shared/sdd/ladder.ts:65-68` | `infraDone = s.packageJsonPresent && …` → `manifestPresent` (имя манифеста от пресета) | низкий, но виден оператору (карточка лестницы) |
| `cli/cmd/sdd-state/sdd-state.cmd.ts:152-155,214-227` | `STACK=`/`STACK_SOURCE=` в `[READINESS]`; `renderLadder` получает `manifest` | низкий |
| `cli/cmd/sdd-verify/repair-adapters.ts:39-77,94-156` | `PROJECT_LINTER_ADAPTERS` расширяется per-stack (swiftformat/black/gofmt); `formatter` перестаёт быть жёстко `npm run format:fix -- <targets>` | средний: node-ветка обязана давать те же argv |
| `cli/cmd/testcov/coverage-adapter-registry.ts:8` | `COVERAGE_ADAPTERS` += python/swift адаптеры | низкий: интерфейс `CoverageAdapter` (`coverage-adapter.types.ts:84-140`) уже платформенная граница (`detect`, `artifacts`, `producerCapability`, `isProductionSource`, `shouldSkipDirectory`) |
| `cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts:34-72` | `DETECTOR_ROWS` перестаёт быть отдельной правдой — выводится из детектора | низкий |
| новое | `plugins/python/*` (плагин), `presets/{node,golang,anystack}.ts`, `shared/verify/stack-detection.ts` | — |

#### 3.1.3 Доказательство node-parity (два вида тестов + один совместимостный)

1. **Golden резолвнутых гейтов.** Новый тест `shared/sdd/__tests__/preset-node-golden.test.ts`: на фикстуре `package.json` с восемью кирпичами (`readiness.ts:15-24`) для профилей `setup`/`code`/`test`(owner)/`test`(non-owner)/`full` сериализовать `resolvePreset('node', profile, root, config)` в JSON `{name, command, mutates, haltsOnFailure, via, required, state}` и сравнить с закоммиченным golden-файлом. Golden создаётся **из текущего RC до правок** (снимок `GATES` + `verificationGateNames` + `requiredVerificationGateNames` + `commandForGate`), поэтому расхождение видно как diff, а не как «упало где-то в цепочке».
2. **Поведенческий байт-в-байт.** `cli/cmd/sdd-verify/__tests__/parity-node.test.ts` с инжектируемым `GateRunner`: (a) последовательность вызовов `(command, args)` — массив сравнивается целиком; (b) полный stdout-рендер (`[sdd-verify] ✅ ALL PASS (N/M)`, строки `✅`/`🔧`/`⏭`/`⛔`, `failBlock`) сравнивается как одна строка; (c) записанный `SDD_PHASE_RECEIPT` (JSON внутри маркера `<!--SDD_PHASE_RECEIPT:P-->`) сравнивается после нормализации только timestamp'ов — `planState`, `targetState`, `environmentState`, `commands[]`, `gateEvidence[]` обязаны совпасть побайтово.
3. **Receipt-совместимость (регрессия на старых артефактах).** Фикстура-тикет с receipt'ом, записанным текущим RC, должна проходить `validatePhaseReceipt` (`phase-receipt-validation.ts:209-254`) после миграции. Это тест на И-2/И-3: он падает ровно тогда, когда изменился `command`, `state`, `provider`, `name` или fingerprint скриптов.

Дополнительно: `npm run test` в RC (172 теста verify-поверхности, см. §5) должен остаться зелёным **без правок самих тестов** на первом коммите — это и есть операционное определение «parity-safe шага».

#### 3.1.4 Как приходят стеки

- **node** — пресет-данные, воспроизводящие текущие строки RC (не `plugins/node/classify-npm-scripts.ts`: у него другие id гейтов и другая семантика выбора, см. §5 прогон `verify --plan --json` — `typecheck, gennady, lint, test, format` против RC `fix, type-check, test, test:coverage, lint, format, yagni`).
- **golang** — плагин MAIN verbatim; в фазовую модель добавляется маппинг «ступень ладдера → гейты плагина»: `fix` → `gofmt -w` + `go mod tidy` (мутирующие, только по Target Files — по пакетам целей), `type-check` → `go build`+`go vet`, `test` → `go test`, `full` += `generate` (drift), `golangci-lint`. `environmentState` (И-3) для go = хэш `go.mod`+`go.sum`+`Makefile`-рецептов, названных пресетом.
- **anystack** — плагин MAIN verbatim; ступеней ладдера у него нет, все гейты приходят из `stack.anystack.extraGates`. В фазовой модели anystack-гейты идут после foundation как read-only-хвост; `required` для них — пустое множество (иначе любой anystack-проект вечно `not-ready`).
- **swift (cloud-ios)** — сегодня это **anystack + `gennady.yaml`** (`stack.use: [anystack]`, три `extraGates`, см. §1.1). Отдельный `plugins/swift` нужен только для readiness/coverage; конфиг потребителя обязан продолжать работать без правок. Что содержал бы swift-пресет: маркеры `Package.swift` | `*.xcodeproj` | `*.xcworkspace` | `Project.swift` (Tuist) | `.mise.toml`; гейты `fix` → `swiftformat <targets>` / `swiftlint --fix <targets>`; `type-check` → `xcodebuild build-for-testing` (или `swift build`); `test` → `xcodebuild test`/`swift test`; `full` += `swiftlint lint --strict`; `envFail` — `outputMatches(/xcodebuild: error: (?:Unable to find a destination|The operation couldn.t be completed)/)`, `outputMatches(/error: unable to attach DB|Provisioning profile/)`, `outputMatches(/Cannot find simulator/)`, `exitCodeMatches('!=2')` для swiftlint (уже так в `gennady.yaml` потребителя); `timeout` 90m; coverage-probe — `CoverageAdapter` с `detect` по `*.xcresult`/`default.profdata`, `artifacts.report = <DerivedData>/…/Coverage.profdata` или `xccov --json`, `producerCapability` = наличие `xcrun xccov`, `isProductionSource` = `.swift`/`.m`/`.mm` вне `*Tests*`.
- **python** — свой плагин `plugins/python/{plugin.json,python-plugin.ts,python-plan.logic.ts}`: маркеры `pyproject.toml` | `setup.cfg` | `requirements.txt` | `tox.ini`; гейты `fix` → `ruff check --fix <targets>` + `ruff format <targets>` (или `black <targets>` + `isort`), `type-check` → `mypy`/`pyright`, `test` → `pytest -q`, `test:coverage` → `pytest --cov --cov-report=xml`, `full` += `ruff check` (read-only), `bandit` (опционально); `envFail` — `outputMatches(/ModuleNotFoundError: No module named '(?:pytest|mypy|ruff)'/, hint)`, `outputMatches(/Could not find a version that satisfies|Temporary failure in name resolution/)`, `outputMatches(/error: command '.*' failed: No such file/)`; `timeout` 10m по умолчанию; coverage-probe — адаптер `coverage.py`: `detect` по `.coverage`/`coverage.xml`/`[tool.coverage]` в `pyproject.toml`, `artifacts.report = coverage.xml`, `writableDirectories = ['htmlcov', '.coverage']`, `isProductionSource` = `.py` вне `tests/`/`test_*.py`; `environmentState` = хэш `[project.scripts]`/`[tool.*]`-секций `pyproject.toml` + `tox.ini`-envlist.

#### 3.1.5 Что происходит с честностью, receipts и мутациями

- `isVacuousScript`/`isStubScript` (`readiness.ts:396-420`) остаются **движком**, но получают вход «тело единицы гейта» от пресета: для node — тело npm-скрипта, для python — строка команды из `[tool.poe.tasks]`/`Makefile`-рецепта, для anystack — `argv` из `gennady.yaml` (там вакуумность = `argv` вида `['true']`/`['echo', …]`). Без этого шага `⛔ missing` для non-node стеков превращается в «всегда ready» — тихая потеря главного детектора v2.
- **Coverage-freshness** (`verifyCoverageWritten` `sdd-verify.cmd.ts:191-211` + `CoverageProbe:169-182`) выживает без правок семантики: расширяется только реестр `COVERAGE_ADAPTERS`.
- **Receipts** выживают целиком: `SDD_PHASE_RECEIPT` привязан к плану + байтам целей, а не к node (И-2). Единственная node-специфика — `environmentState` (И-3), лечится per-preset источником fingerprint'а. Групповые `SDD_AUDIT_RECEIPT`/`SDD_REVIEW_RECEIPT` (`shared/sdd/group-receipt.ts:14-17`) стека не касаются вовсе.
- **Repair-adapters** (`repair-adapters.ts`) уже реестр по capability-матчингу (`PROJECT_LINTER_ADAPTERS:58-77`) — расширение per-stack аддитивно; `formatter`-шаг перестаёт быть литеральным `npm`.
- **`workspace-mutation.ts`** (sha256-снимок дерева, fail-closed, без откатов) стек-агностичен уже сейчас; единственная правка — исключения (`node_modules`) становятся данными пресета (`.venv`, `.build`, `DerivedData`, `vendor`). Без этого swift/python дадут ложный «мутация вне write-zone» на каждом прогоне.
- `tree-guard.ts` (git-lock + refuse-dirty + `--wip`) остаётся **только** на clean-caller пути; фазовый путь продолжает жить на boundary — DL-20/22 не возвращаются.

#### 3.1.6 Issues #9 / #17 / #20 в варианте A

- **#9 (`extraGates[].when`, file scoping).** Аддитивный ключ в `GATE_SPEC_KEYS` (`stack-config.ts:34-45`): `when: [<glob>…]`. Семантика: гейт без `when` идёт всегда; гейт, чьи globs не пересеклись с набором файлов, получает `skipped: 'when (gennady.yaml)'` — то есть виден в отчёте как честный skip, а не исчезает. В v2 набор файлов не выдумывается: это **exact Target Files фазы** (`phase-context.ts:169-239`), что и закрывает исходную боль («фаза, правящая `CODEOWNERS`, тянет `xcodebuild`»). Требуется решение оператора по «сужение по умолчанию» (см. вопрос **Q4**).
- **#17 (вывод на pass).** Два независимых механизма, оба совместимы с И-1: (a) поле пресета/спека `showOutputOnPass?: boolean`; (b) конвенция «строка с маркерным префиксом `[gate] ` выживает в вердикт независимо от статуса» (у cloud-ios такие строки уже печатаются). Рекомендуется (b) как основное (не требует правок конфига у потребителя) + (a) как явный опт-ин. В receipt при этом **ничего не добавляется** — `receipt.commands[]` держит `command`/`exitCode`; иначе ломается И-2.
- **#20 (`--only` префикс/glob, сужение).** Три части: (i) `--only`/`--skip` переносятся в v2 из `cli/cmd/verify/verify.cmd.ts:166-212` с расширением до префикс/glob-матчинга и печатью резолвнутого набора в `--plan`; (ii) позиционные файлы в фазовом пути больше не «таргеты, которые молча игнорируются» — они и есть Target Files тикета, а сужение выводится из `when` (#9); (iii) шаблон в `ai/skills/sdd-execute/SKILL.md:98` и обёртка `ai/skills/sdd-execute/scripts/verify.sh:69-92` в v2 умирают вместе с v1-скиллом — фаза зовёт `sdd-verify --task … --phase …`, поэтому пункт 3 issue (bare `sdd` вместо `<SDD_PATH>`) закрывается удалением строки, а не правкой.

#### 3.1.7 Директивы и `.hbs` (первоисточник — `ai/kit/`, сборка `npm run build:directives`, `ai/kit/build-directives.ts`)

| Артефакт | Правка |
|---|---|
| `ai/kit/templates/sdd-v2/readiness.directive.hbs` (11 node-хитов: `:3-5` «`package.json` … восемь кирпичей», `:110-115`, `:159-176` таблица, `:199-213` стаб-`package.json`) | «восемь кирпичей npm» → «обязанности пресета стека»; стаб-манифест становится примером **для node**, рядом — swift/python |
| `ai/kit/templates/sdd-v2/infra.directive.hbs:279` (собранное — `ai/directives/sdd-v2/infra.directive.xml:430-432`, «Node/npm runtime artifacts `.nvmrc`, Node fields in `package.json`, `.npmrc`») | требование манифеста формулируется через стек; строка «Effective rules … `ai/directives/knowledge.xml` `<Rules>`» (`infra.directive.xml:83`) получает stack-триггеры (`go-rules`, `python-rules`, `baseline-rules`) |
| `ai/kit/axiom/process/ax-verification-before-handoff.xml:9` («`package.json` … среди Target Files») | «манифест/файл определения гейта» |
| `ai/kit/axiom/process/ax-permitted-bash-commands.xml:3-7` | убрать устаревший «STEP_5» → `STEP_3_VERIFY` |
| `ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs` (→ `ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_3_VERIFY.xml:5-15,28`) | тот же дефект нумерации; плюс упоминание `env-fail`/`timeout` как машинных статусов |
| `ai/kit/templates/sdd-v2/audit.directive.hbs` (→ `audit/steps/STEP_1_MECHANICAL.xml:22,75-76,98`) | случаи (a)/(b) («сломан инструмент» vs «код») перестают выводиться из текста — читаются из статуса `env-fail`; связка «`⛔` + обязательная ступень» сохраняется |
| `ai/kit/templates/sdd-v2/router.directive.hbs` + `ai/kit/contract/process/readiness-preflight-gate.xml:2-13` | в LogicSwitch добавляется `STACK=` как факт снапшота (не новая ветка — новый вход) |
| `ai/directives/knowledge.xml` | добавить `id="baseline-rules"`, `id="go-rules"`, `id="python-rules"` (в RC отсутствуют; в MAIN есть — `knowledge.xml:67,85,93,95`) |
| спеки | `specs/cli/sdd-verify/sdd-verify.spec.md` (D-SV0xx на пресеты/статусы), новая `specs/stack/*` перенесённая из MAIN (`specs/stack|config|plugins/**`) |

#### 3.1.8 Порядок коммитов (parity-safe первым)

1. Тесты parity **до** любых правок: golden + поведенческий + receipt-совместимость (зелёные на текущем коде).
2. Перенос примитивов MAIN verbatim (`env-fail`, типы, `stack-config`+`config-loader`, `tree-guard`) — новые файлы, ноль вызовов.
3. `Gate`/`GateStatus`/рендер: аддитивные поля и статусы, node-путь не меняется.
4. `resolvePreset` + node-пресет; `GATES`/`commandForGate` становятся его вызовом. Parity-тесты обязаны быть зелёными без правок.
5. Детектор (`detectStacks`) + `STACK=` в `sdd-state` + threading в `phase-context`.
6. Расщепление readiness (движок + node-adapter), `probe`/`ladder`.
7. anystack + `gennady.yaml` (`stack:`) — конфиг-контракт cloud-ios начинает работать в v2.
8. golang-плагин verbatim + маппинг ступеней.
9. python-плагин + coverage-адаптер.
10. swift-пресет + coverage-адаптер (`xccov`).
11. #9 `when`, #20 `--only` glob, #17 output-on-pass.
12. Директивы/`.hbs`/спеки/`knowledge.xml` (rules cascade).

#### 3.1.9 Риски A

- **R-A1.** Расщепление readiness задевает 50 тестов + `sdd-task` hard-block (`sdd-task.cmd.ts:462-487`) + текст 3 директив; ошибка здесь = «проект стал ready, хотя инструментов нет» (обратная сторона — вечный блок). Митигация: расщепление **после** parity-тестов, с сохранением node-выхода `checkReadiness` побайтово (те же `missing`/`stubbed` списки).
- **R-A2.** `environmentState` для non-node стеков (И-3) легко забыть → тихая потеря «канон = тело гейта». Митигация: тест «пресет без источника fingerprint'а запрещён» (fail-closed в `resolvePreset`).
- **R-A3.** async-исполнение с `timeoutMs` в параллельном хвосте `full` (`sdd-verify.cmd.ts:600-648`) — новые режимы отказа (частично убитые процессы). Митигация: `AbortController` на группу + тест «таймаут одного не отменяет вердикт остальных».
- **R-A4.** Объём: 12 коммитов, из них 4 крупных. Митигация: шаги 7-10 независимы друг от друга и от 11-12.

#### 3.1.10 Усилия A (S ≤ 1 фазы-день, M = 2-4, L = неделя+)

1 — M · 2 — S · 3 — M · 4 — M · 5 — M · 6 — **L** · 7 — M · 8 — M · 9 — M · 10 — **L** · 11 — M · 12 — M.

---

### 3.2 Вариант B — MAIN `services/stack` как движок + SDD-adapter-слой над ним

**Тезис.** Движком становится `services/stack/**` (детект + `Gate`-как-данные + конфиг + RUN-ALL runner + guard), а RC-семантика фазы (профили, receipts, readiness, честность) переезжает в адаптер-слой, который резолвит план фазы в набор гейтов и вызывает runner.

#### 3.2.1 Переносится verbatim

- Из MAIN: **весь** `services/stack/**` (в т.ч. `gate-runner.ts`, `plugin-api.ts`), `services/config/**`, `plugins/**`, `cli/cmd/verify/**`, `cli/cmd/fix/**`, `specs/stack|config|plugins/**`, 198 тестов (§5) — переносятся как есть.
- Из RC: `shared/sdd/{phase-receipt,group-receipt,gate-queue,ladder,project-feasibility}.ts`, `cli/cmd/sdd-verify/{phase-context,phase-run,phase-receipt-validation,workspace-mutation}.ts`, `cli/cmd/testcov/**`, `shared/sdd/readiness.ts` — тоже как есть.

#### 3.2.2 Переписывается

| Файл | Правка | Почему это не «адаптер», а хирургия движка |
|---|---|---|
| `services/stack/gate-runner.ts:133,224-340` | экспортировать per-gate исполнение | `runGate`/`executeGate` не экспортированы; наружу отдан только `runVerify:351-383` (RUN-ALL) и `runFix:523-533` |
| `services/stack/gate-runner.ts:234` | sync `spawnSync` → async | параллельный quality-tail `full` (`sdd-verify.cmd.ts:600-648`, `Promise.all`) на sync-исполнителе невозможен; либо теряется параллельность, либо переписывается исполнитель |
| `services/stack/gate-runner.ts:351-383` | добавить halting | RUN-ALL — принятый контракт v1 (`ai/directives/sdd/phase-execution-protocol.xml:90,319`, help: «RUN-ALL every gate runs»); фазовая лестница противоположна (`haltsOnFailure` → `break`) |
| `services/stack/gate-runner.ts:259-266,306-324` | разрешить мутирующую ступень | D-STACK-005: гейт не мутирует, дрейф → `violation` + `reset()`; ступень `fix` мутирует по определению, а `reset` уничтожил бы работу фазы |
| `plugins/node/classify-npm-scripts.ts` + `node-plugin.ts:45-131` | добавить второй режим выбора скриптов | прогон (§5) даёт id `typecheck, gennady, lint, test, format` и выбор по классификации; RC требует `fix, type-check, test, test:coverage, lint, format, yagni` и выбор по восьми точным именам → **parity недостижима без второго node-пресета, т.е. без работы варианта A** |
| новое `cli/cmd/sdd-verify/stack-adapter.ts` | профиль фазы → `ScopeRequest` + `--only`-набор + маппинг статусов | сам адаптер невелик (S/M) |
| `workspace-mutation.ts` | врезка в чужой исполнитель | boundary должен обнимать конкретную ступень; `runVerify` не даёт точки «до/после гейта» |

#### 3.2.3 Node-parity в B

Доказательства те же три (golden / поведенческий / receipt-совместимость), но **предмет доказательства меняется**: golden придётся строить не для «пресета», а для «маппинга ступени в гейты плагина», а плагин node в MAIN даёт другой набор id и другую выборку скриптов (жёсткое свидетельство — §5, прогон `verify --plan --json --root <main>`: `typecheck | npm run type-check`, `gennady | npx tsx cli/gennady.ts lint …` (override из `gennady.yaml`), `lint | skipped=skipGates`, `test | npm run test`, `format | npm run format:check`). То есть B **включает** в себя задачу A (написать node-пресет с восемью кирпичами), плюс задачу «переучить движок» — и в этом смысле строго дороже при одинаковом результате.

#### 3.2.4 Стеки, честность, receipts, issues в B

- Стеки — **бесплатно и лучше всех**: golang/anystack и конфиг-контракт приезжают рабочими вместе с 198 тестами; cloud-ios продолжает работать без правок; python/swift добавляются как плагины по готовому `StackPlugin` API (`services/stack/plugin-api.ts`).
- Честность — **дороже**: `isVacuousScript`/coverage-freshness/`⛔ missing` не имеют места в модели `Gate` v1 (там `skipped: string|null` и `outputMeansFailure`); их придётся вешать на адаптер до/после вызова runner'а, то есть держать вторую модель «состояния ступени» рядом с первой.
- Receipts — сохранны (И-2 их не трогает), но `receipt.commands[].command` теперь формируется из `Gate.argv` v1 → для node обязано выйти ровно `npm run <script>` (И-1); `environmentState` (И-3) требует того же per-preset источника, что и в A.
- **#9** закрывается в родном месте (ключ `when` в `GATE_SPEC_KEYS`) — плюс B. **#17** — тоже в родном месте (`gate-runner.ts:331,336` `output: ''`), но требует правки того же файла, который уже правится под async/halting. **#20** — `--only` уже есть (`verify.cmd.ts:166-212`), нужен только glob → минимальная правка. Итого: по issues B **дешевле** A.
- Директивы/`.hbs`: тот же объём, что в A (тексты readiness/infra/axiom node-специфичны независимо от того, где живёт движок), плюс необходимость решить судьбу v1-текстов `ai/directives/sdd/phase-execution-protocol.xml` и `ai/skills/sdd-execute/**` (при «v2 заменяет v1 полностью» они удаляются).

#### 3.2.5 Порядок коммитов, риски, усилия B

Порядок: 1) parity-тесты (M) → 2) перенос `services/stack`+`plugins`+`cli/cmd/{verify,fix}` verbatim (S) → 3) async+per-gate экспорт+halting в `gate-runner` (**L**) → 4) мутирующая ступень и снятие `reset` для фазового пути (M) → 5) `stack-adapter` (M) → 6) node-пресет с восемью кирпичами внутри плагина node (M) → 7) врезка `workspace-mutation`/coverage-probe (M) → 8) readiness-расщепление (**L**) → 9) python/swift (M+**L**) → 10) issues (S) → 11) директивы/спеки (M).

Риски: **R-B1** правка `gate-runner.ts` ставит под удар 198 зелёных тестов и обе публичные гарантии v1 (RUN-ALL, «гейты не мутируют») — то есть цену «reuse» платит именно то, что реюзается. **R-B2** две модели состояния ступени (v1 `skipped/outputMeansFailure` и v2 `missing/⛔/vacuous`) живут рядом → расхождение отчёта и receipt'а. **R-B3** sync→async миграция исполнителя затрагивает `tree-guard`-lock и обработчики сигналов (`tree-guard.ts:251-258`).

---

### 3.3 Вариант C — сосуществование двух глаголов

**Тезис.** `sdd-verify` остаётся фазовым/групповым глаголом (receipts, halting, честность), `gennady verify`/`gennady fix` — глаголом чистого дерева: CI, ручной прогон оператора, мутации. Ядро (типы `Gate`, `env-fail`, конфиг, детект, пресеты) общее.

- **Что переносится verbatim:** всё из §3.1.1 плюс `cli/cmd/verify/**` и `cli/cmd/fix/**` целиком.
- **Что переписывается:** ровно то же, что в A, минус «переучить движок» — то есть C = A + сохранение второго CLI-фасада над общим ядром.
- **Оправдание.** (a) `gennady fix` — единственный дом мутаций вне фазы (`gate-runner.ts:523-533`), в v2 аналога нет; (b) CI и оператор хотят RUN-ALL-отчёт «всё сразу», а не halting; (c) cloud-ios сегодня зовёт `gennady verify --wip` из скиллов — мгновенная совместимость; (d) `--plan --json` — единственный machine-readable вывод, у `sdd-verify` его нет вовсе.
- **Против.** Решение оператора «v2 заменяет v1 полностью» означает: C допустим **не как архитектура, а как поверхность CLI** — два фасада над одним ядром, с одним источником пресетов и одним набором статусов. Как только фасады получают собственные пресеты или собственные статусы, C вырождается в поддержку двух правд (и тогда `⛔`-семантика и receipt'ы начинают расходиться с отчётом).
- **Усилия:** A + S (фасад `verify` над общим ядром) + S (фасад `fix`). Риск: **R-C1** дрейф двух фасадов; митигация — тест «оба фасада на одной фикстуре резолвят одинаковый набор `Gate` (с точностью до halting/scope)».

---

### 3.4 Критическая оценка прошлой идеи readiness («Engine + presets сначала, per-stack readiness потом»)

Идея прошлого плана: сначала обобщить движок и пресеты, readiness развязать позже (фаза 5.4). **Она устарела в части «позже», и вот почему:**

1. **Readiness — не хвост, а вход.** `EXECUTION_READY` — жёсткий блок исполнения: `sdd-task.cmd.ts:123` (pickable = только GATE_QUEUE при `!executionReady`), `:462-487` `ERR_CLI_SDD_TASK_INFRA_NOT_READY`; ветвление роутера (`readiness-preflight-gate.xml:6-7`); карточка лестницы (`ladder.ts:65-68` `infraDone = packageJsonPresent && …`). Пока readiness node-only, **любой** non-node проект не проходит дальше `sdd-task` — то есть пресеты работать не начнут, даже если движок готов.
2. **Это уже подтверждено практикой.** Round-trip eval на cloud-ios (`ai/flow-eval/docs/roundtrip-wall3-assessment.md`) уперся в wall 3 и обошёл его шимом `roundtrip-readiness-shim.package.json` со стабами `node -e "process.exit(0)"` — файл сам просит удалить его, «once the flow branch consumes anystack readiness». То есть отсрочка readiness уже стоит фальшивого артефакта в eval-харнессе.
3. **Но «per-stack readiness» в прежней формулировке тоже неверна.** Восемь имён npm-скриптов — это не восемь требований, а node-кодировка семи обязанностей. Правильная декомпозиция: readiness-движок проверяет **обязанности** (`type-check`, `test`, `coverage-producer`, `format-read-only`, `format-write`, `lint-read-only` (доходит до `gennady`), `lint-write`, `public-repair`), а пресет отвечает на четыре вопроса про каждую: *объявлена ли* (имя/цель существует), *не вакуумна ли* (тело гейта), *read-only или mutating* (наличие write-switch), *forward-ability* (принимает ли точные пути). Уровни `not-ready/provisional/ready` и `executionReady` остаются движковыми.
4. **Минимальный честный компромисс, совместимый с решением оператора «Engine+presets первыми»:** ввести readiness-adapter **интерфейс** уже на шаге 4-5 (вместе с пресетом), но реализовать только node-адаптер (байт-в-байт текущий выход), а anystack-адаптер — сразу тривиальный: «обязанность считается выполненной, если её закрывает `extraGates`-гейт из `gennady.yaml`». Это ~S работы, снимает wall 3 без полного расщепления и позволяет отложить golang/python/swift-адаптеры без блокировки харнесса. Отсрочка *интерфейса* — нет; отсрочка *адаптеров* — да.

---

### 3.5 Сводная оценка

| Критерий | A (Engine в v2 + пресеты) | B (MAIN-движок + adapter) | C (два фасада над ядром A) |
|---|---|---|---|
| node-parity | достижима напрямую (пресет = снимок текущих строк) | **включает** работу A + требует переучить движок | как A |
| стеки node/golang/anystack/python/swift | golang/anystack verbatim; python/swift — новые пресеты | golang/anystack/конфиг «бесплатно», лучший старт | как A + фасад v1 работает у потребителя сразу |
| receipts | сохранны (И-2), И-3 per-preset | сохранны, те же условия | сохранны |
| детекторы честности | сохранны, расширяются данными | требуют второй модели состояния рядом с `Gate` v1 | сохранны |
| конфиг-контракт `stack:` | переносится verbatim (шаг 7) | родной | родной |
| #9 / #17 / #20 | M / M / M | S / S(в уже правимом файле) / S | S / S / S |
| правки в чужом зелёном ядре | нет | `gate-runner.ts` — 4 разнородные правки | нет |
| усилие | 4×M + 2×L + остальное | 5×M + 3×L | A + 2×S |
| главный риск | расщепление readiness (R-A1) | потеря гарантий v1 в переписанном runner'е (R-B1) | дрейф фасадов (R-C1) |

---

### 3.6 Рекомендация

**Рекомендуется A′ = вариант A с фасадами варианта C (`gennady verify` / `gennady fix` над общим ядром), т.е. A + 2×S.** Причины, по порядку веса:

1. **Parity дешевле именно в A.** Строки, которые обязаны сохраниться (И-1) и fingerprint, который обязан сохраниться (И-3), рождаются сегодня в RC. Пресет, воспроизводящий их, — снимок существующего кода. В B ту же работу всё равно придётся сделать (node-плагин MAIN даёт другие id — доказано прогоном), но сверх неё придётся переучить `gate-runner.ts` четырьмя несовместимыми способами.
2. **Ядро v2 — это не runner, а семантика.** Дорогое и невоспроизводимое в RC — receipts, `⛔ missing`, coverage-freshness, boundary мутаций, профили и halting-лестница (240 тестов). Дорогое в MAIN — данные и примитивы (`Gate`-как-данные, `envFail`, конфиг с провенансом, `tree-guard`, два плагина), и они переносятся **копированием файлов**, а не переносом поведения.
3. **`workspace-mutation` уже победил `git write-tree`-checkpoint.** Фазовый путь не нуждается в RUN-ALL-исполнителе и в `reset()`; врезать boundary в чужой sync-runner (B) дороже, чем оставить его на месте.
4. **Конфиг-контракт `stack:` в A не теряется** — он переносится как отдельный шаг (7) вместе с валидатором и провенансом, а cloud-ios продолжает работать через фасад `gennady verify` до момента, когда `sdd-verify` научится anystack.
5. **C-фасады закрывают то, чего у `sdd-verify` нет и не должно быть:** RUN-ALL-отчёт для CI, machine-readable `--plan --json`, и глагол мутаций `fix`. При этом они не создают второй правды, если пресеты и статусы — общие (тест на эквивалентность резолва).

Что в A′ **не** делать: не переименовывать секцию `stack:` в `verify:` (ломает единственного реального потребителя, DL-21 в этой части ошибочен); не тащить `plugins/node/classify-npm-scripts.ts` в фазовый путь (другая семантика выбора); не возвращать checkpoint через `git write-tree`.

---

### 3.7 Решения, которые может принять только оператор

**Q1. Судьба `gennady verify` / `gennady fix` как публичных глаголов при «v2 заменяет v1».**
(a) оставить оба фасада над общим ядром (рекомендация A′); (b) оставить только `gennady fix`, а RUN-ALL-отчёт отдать `sdd-verify --profile full --run-all`; (c) удалить оба, всё через `sdd-verify` (CI теряет `--plan --json` и мутации до появления замены).

**Q2. Совместимость существующих receipts при переходе.**
(a) жёстко сохранить И-1/И-3 (никаких изменений строк команд и источника fingerprint'а для node) — рекомендуется; (b) разрешить разовую инвалидацию с явной миграцией (`schema: 2` + правило «legacy receipt валидируется старым способом»); (c) инвалидировать без миграции (все незакрытые фазы придётся перепрогнать).

**Q3. Где живёт readiness-адаптер и когда.**
(a) интерфейс + node-адаптер + тривиальный anystack-адаптер сразу (снимает eval-шим, ~S) — рекомендуется; (b) только интерфейс, адаптеры позже (харнесс продолжает жить на `roundtrip-readiness-shim.package.json`); (c) полное расщепление сразу для всех пяти стеков (L, задевает 50 тестов и 3 директивы).

**Q4. Сужение гейтов по файлам (#9/#20) по умолчанию.**
(a) `when` по умолчанию отсутствует → гейт всегда идёт (сегодняшнее поведение, дорого для swift); (b) гейт без `when` идёт всегда, но фазовый путь дополнительно печатает предупреждение о неотсечённых долгих гейтах; (c) в фазовом пути гейт без `when` **пропускается**, если ни один Target File его не касается (быстро, но риск ложного зелёного); (d) `when` обязателен для `extraGates` с `timeout > 10m` (заставляет потребителя объявить область один раз).

**Q5. Вывод на pass (#17).**
(a) конвенция «строки с префиксом `[gate] ` выживают в вердикт» (ничего не менять в конфиге потребителя) — рекомендуется; (b) явный per-gate флаг `showOutputOnPass`; (c) `--full-output` начинает сохранять `output` и на pass (только для отчёта, не для receipt); (d) (a)+(b).

**Q6. Swift: отдельный плагин или anystack навсегда.**
(a) swift остаётся anystack + `gennady.yaml` (ноль правок у потребителя, но нет readiness/coverage для swift); (b) отдельный `plugins/swift` с маркерами и ладдером, `extraGates` продолжают работать поверх (рекомендуется, если нужен `test:coverage` и honest readiness на iOS); (c) плагин swift, но без coverage-адаптера на первом шаге.

**Q7. Порядок стеков после node.**
(a) anystack → golang → python → swift (anystack первым, потому что он разблокирует cloud-ios и eval-харнесс) — рекомендуется; (b) golang первым (готовый плагин + 46 тестов, быстрый выигрыш в доверии); (c) python первым (нужен новый плагин целиком, но он самый близкий к node по форме).

---

## 4. Детект стека в роутере и readiness

### 4.1 Где сегодня выбирается «инфраструктура» (RC)

| Узел | Файл:строка | Что происходит |
|---|---|---|
| Роутер: preflight-гейт | `ai/directives/sdd-v2/router.directive.xml:294-304`; первоисточник — `ai/kit/contract/process/readiness-preflight-gate.xml:2-13` (одно определение, которое каждая точка входа проходит одинаково) | `LogicSwitch on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"`. Стека среди входов **нет** |
| Роутер: выбор владельца | `router.directive.xml:390-391` | `WHEN intent in {new-scope, evolve-scope, multi-scope} AND scope-type = infrastructure -> READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/infra.directive.xml")` — то есть «инфраструктура» выбирается по **scope-type из портала**, не по репозиторию |
| Роутер: снапшот | `router.directive.xml:361-362` | `READINESS_PREFLIGHT_GATE` применяется к read-only снапшоту `sdd-state`; «missing repository gate scripts» возвращаются во владеющий infra-флоу |
| Infra-директива: категории | `infra.directive.xml:75` | обязательные `vcs, package-management, git-hooks`; опциональные `type-check, linting, formatting, test-unit, …` — уже стек-агностичный словарь |
| Infra-директива: rules cascade | `infra.directive.xml:83` | «look up each chosen tool in `ai/directives/knowledge.xml` `<Rules>`: find every rule whose `<Triggers>` match the tool name or its config artefacts» → Effective Rules спеки |
| Infra-директива: node-хардкод | `infra.directive.xml:430-432` (`ai/kit/templates/sdd-v2/infra.directive.hbs:279`) | «The infrastructure scope that first installs dependencies must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`)» |
| Readiness-директива | `ai/kit/templates/sdd-v2/readiness.directive.hbs:3-5,110-115,159-176,199-213` (собранное: `readiness.directive.xml:4,106,155`) | «`package.json` exists and declares the eight exact bricks `sdd-state` checks», таблица восьми кирпичей, стаб-`package.json` c `echo 'TODO: …'` |
| `sdd-state` | `cli/cmd/sdd-state/sdd-state.cmd.ts:152-155` | `gatherReadinessInput(root)` → `checkReadiness(...)`; регион прямо помечен «exact-match required scripts; missing/broken package.json reads as not-ready» |
| `sdd-state`: probe | `sdd-state.cmd.ts:161`, `shared/sdd/probe.ts:12,15-33` | `probeRepo(root)`: `CODE_EXT = /\.(js|jsx|ts|tsx)$/` («Node-only support today»), `CONFIG_FILES` = tsconfig/eslint/prettier/vitest/jest |
| `sdd-state`: карточка лестницы | `sdd-state.cmd.ts:214-227`, `shared/sdd/ladder.ts:68` | `infraDone = s.packageJsonPresent && s.gates.typecheck && s.gates.test && s.gates.lint` |
| `sdd-state`: печать | `cli/cmd/sdd-state/sdd-state.types.ts:108-145` | `FLOW_VERSION=`, `PORTAL=`, `[READINESS]`, `READINESS=ready|provisional|not-ready`, `EXECUTION_READY=`, `AUTHORING_SCOPE=`, `GATE_QUEUE=` — **строки `STACK=` не существует** |
| Портал | `shared/sdd/portal.ts:12-23` | `Scope = {name, type, status, description, specPath}`; `type` ∈ `infrastructure | contracts | product | library` — **поля «стек» в портале нет** |
| `sdd-task` | `cli/cmd/sdd-task/sdd-task.cmd.ts:107,123,462-487` | `!executionReady` → pickable только GATE_QUEUE; `ERR_CLI_SDD_TASK_INFRA_NOT_READY` для всех фаз кроме `bootstrap/config/doc` |
| `sdd-verify` | `cli/cmd/sdd-verify/phase-context.ts:253-296` | infra-queue exemption: не-ready проект → фаза-владелец недостающего гейта получает профиль `setup` |
| `gate-queue` | `shared/sdd/gate-queue.ts:365,392` | `missingGates` → владельцы через `BOOTSTRAP_REQUIREMENTS` |

**Итог: сегодня «стек» в v2 не выбирается нигде.** Есть ровно один неявный стек — node, — и он закодирован в двух местах: в списке восьми npm-скриптов и в чтении `package.json`.

### 4.2 Что именно значит «node-only» (полный список точек)

| Точка | Файл:строка | Кодировка node |
|---|---|---|
| Список обязанностей | `shared/sdd/readiness.ts:15-24` | `REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format','format:fix','lint','lint:fix','fix']`, алиас `typecheck` `:30-32` |
| Сбор входа readiness | `shared/sdd/readiness.ts:596-609` | читает только `<root>/package.json` |
| Детекторы честности | `shared/sdd/readiness.ts:243-244,263,296-314,322-323,338-420` | write/mutating-switch по тексту npm-скрипта, `commandSegments` по shell-синтаксису npm |
| Строка команды гейта | `cli/cmd/sdd-verify/sdd-verify.cmd.ts:223-226` | `{ command: 'npm', args: ['run', scriptName] }` |
| Строка команды в плане | `shared/sdd/phase-verification-plan.ts:271` | `` `npm run ${script}` `` |
| Разбор строки обратно | `cli/cmd/sdd-verify/sdd-verify.cmd.ts:502`, `shared/sdd/phase-receipt.ts:1250` | `/^npm run (\S+)$/` |
| Fingerprint окружения | `shared/sdd/phase-receipt.ts:1242-1254` + `PACKAGE_MANAGER_BUILTINS` (`:93+`, `npm|pnpm|yarn`) | тела npm-скриптов и транзитивные `npm run`-хопы |
| Repair-адаптеры | `cli/cmd/sdd-verify/repair-adapters.ts:47,58-77,94-100` | `ESLINT_EXTENSIONS`, `npm run format:fix -- <targets>`, `lint:fix` ABI |
| Coverage | `cli/cmd/testcov/coverage-adapter-registry.ts:8` | единственный адаптер `istanbulCoverageAdapter` |
| Probe | `shared/sdd/probe.ts:12,15-33` | js/ts расширения, node-конфиги |
| Лестница | `shared/sdd/ladder.ts:68` | `packageJsonPresent` |
| Снимок дерева | `cli/cmd/sdd-verify/workspace-mutation.ts:101,134-169` | исключения `.git`/`node_modules` (нет `.venv`, `.build`, `DerivedData`, `vendor`) |
| Аксиома канона | `ai/kit/axiom/process/ax-verification-before-handoff.xml:6-13` | «`package.json` (или тело скрипта) среди Target Files» |
| Директивы | `readiness.directive.hbs` (11 хитов `package.json`/`npm run`), `infra.directive.hbs` (3), `root.directive.hbs` (1), `discover-from-code.directive.hbs` (1), `audit.directive.hbs` (1); всего 39 файлов `ai/kit/**` содержат `package.json`/`npm run` | текстовая кодировка node |

### 4.3 Что уже детектирует `resolve-verify-commands.logic.ts`

`cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts` — единственный существующий в RC «детектор по маркерам»:

- `DETECTOR_ROWS` (`:34-72`), по порядку: (1) маркер `go.mod` → `['go test ./...','go vet ./...','go fmt ./...']`; (2) `npm-package-json` — три группы скриптов (`test`-группа: `test, test:run, test:ci, test:app, mc:test, unit, jest, vitest` + fallback-паттерны; `lint`-группа: `lint:ci, lint, eslint, stylelint, format:check`; `type-check`-группа: `type-check, typecheck, check`), `maxCommands: 5`; (3) маркер `Cargo.toml` → `['cargo test','cargo clippy']`.
- Фильтр честности уже есть: `isWatchLikeScript` (`:83-99`) выбрасывает `*watch*`, `--watch`, `--watchAll`, `nodemon`.
- Выход — строки `npm run <name>` (`:155`), первый матч выигрывает (`resolveSafeVerifyCommands:176-193`), пустой список — легальный ответ.
- Потребитель ровно один: `build-ai-verify-placeholders.logic` (заголовок файла `:2`), то есть **это подсказки для промпта, а не план исполнения**.
- Два дефекта как источника истины: (i) приоритет маркеров над `package.json` (go.mod в монорепо с package.json скрывает node-команды); (ii) нет swift/python вовсе. Как **референс маркеров** он полезен (готовый список имён и watch-фильтр), но третьей правдой о «что запускать» оставаться не должен — после появления детектора он выводится из него.

### 4.4 Как протянуть выбор стека из репозитория (дизайн)

Один факт, один источник, пять потребителей:

1. **Источник.** `detectStacks(root, config, registry)` (перенос MAIN `services/stack/stack-registry.ts:44-64`; кандидаты — `plugins/index.ts:15` `BUILTIN_PLUGINS`, сортировка по id; `stack.use` из `gennady.yaml` только **сужает** кандидатов, не назначает стек). Маркеры: `package.json` (`plugins/node/node-plugin.ts:45,51`), `go.mod` (`plugins/golang/golang-plugin.ts:57`), «матчит всегда» для anystack (`plugins/anystack/anystack-plugin.ts:24-34`), новые — `pyproject.toml|setup.cfg|requirements.txt|tox.ini` и `Package.swift|*.xcodeproj|*.xcworkspace|Project.swift`. Результат — `StackDetection[]` (мультистек — нормальный режим, как в v1: `cli/cmd/verify/verify.cmd.ts:160-179`).
2. **`sdd-state`** (`sdd-state.cmd.ts:152-161`): `detectStacks` вызывается **до** readiness; в блок `[READINESS]` добавляются строки `STACK=<id[,id…]>` и `STACK_SOURCE=<marker:<file> | config:stack.use>`; `readinessInput` получает `stack` и `manifest`; `renderLadder` получает `manifestPresent` вместо `packageJsonPresent` (`ladder.ts:68`), `probeRepo` — расширения/конфиги от пресета (`probe.ts:12`).
3. **readiness** (`readiness.ts:434-609`): `checkReadiness(input, adapter)`, где адаптер отвечает на четыре вопроса про каждую из семи обязанностей (§3.4 п.3). Уровни `not-ready/provisional/ready` и `executionReady:562` — движковые, их текст не меняется (важно: три директивы и `sdd-task` парсят именно этот текст).
4. **`sdd-task`** (`sdd-task.cmd.ts:107,123,462-487`) и **`gate-queue`** (`gate-queue.ts:365,392`): читают тот же `readiness` — правок семантики не требуется; меняются только сообщения, где буквально сказано «npm-скрипт».
5. **`sdd-verify`** (`phase-context.ts:253-296` → `phase-verification-plan.ts:29-92` → `sdd-verify.cmd.ts:357-368`): профиль по kind фазы остаётся; `command`/`argv` каждой ступени берутся из пресета выбранного стека. `SDD_PHASE_RECEIPT` получает `stack` **вне** `PhaseReceiptPlan`-хэша (иначе И-2 инвалидирует старые receipts) — либо, если оператор выберет Q2(b), внутрь, с bump `schema: 2`.
6. **infra-директива** (`infra.directive.xml:75,83,430-432`): стек приходит фактом из `sdd-state`, поэтому (a) «Node/npm runtime artifacts» становится «манифест выбранного стека», (b) Effective Rules резолвятся stack-триггерами.
7. **rules cascade** (`ai/directives/knowledge.xml`): в RC зарегистрированы только `typescript-rules`, `sveltekit-rules`, `vitest-rules`; в MAIN есть `baseline-rules` (`knowledge.xml:67,93,103`), `go-rules` (`:95`), `python-rules` (`:85`) и файлы `ai/directives/coding/{baseline,go,python}-rules.xml`, которых в RC нет физически. Перенос этих трёх файлов + записей реестра — обязательная часть «стек детектируется и влияет на правила», иначе python/go-проект получит typescript-правила или ничего.
8. **Роутер** (`readiness-preflight-gate.xml:2-13`): `STACK=` добавляется как **вход** LogicSwitch'а, без новых ветвей; единственная новая ветка, которая может понадобиться, — «стек не распознан» (fail-closed: anystack как последний матч закрывает и этот случай, поэтому «no stack detected» exit 5 из v1 в v2 не нужен).

**Инвариант, который стоит зафиксировать тестом:** `sdd-state`, `sdd-task` и `sdd-verify`, вызванные на одном корне, обязаны видеть один и тот же `StackDetection` (одна функция, без повторного эвристического угадывания) — иначе воспроизведётся класс ошибок «фаза резолвит одно, receipt валидируется по другому».

---

## 5. Прогоны (evidence этой сессии)

**Оговорка об окружении.** В MAIN-воркtree `node_modules` пуст, а в `node_modules` родительского репозитория нет пакета `yaml`, который импортирует `services/config/config-loader.ts` → `gennady verify` падает с `ERR_MODULE_NOT_FOUND`. Установка и симлинк внутрь воркtree заблокированы политикой сессии, поэтому MAIN запускался с **внешним tsconfig-шимом** в scratchpad (`TSX_TSCONFIG_PATH=<scratchpad>/main-shim-tsconfig.json`, `paths` копирует tsconfig MAIN и добавляет `"yaml": ["<rc>/node_modules/yaml/dist/index.js"]`). Ни один файл проекта не изменялся; шим влияет только на разрешение импорта `yaml`.

### 5.1 RC — `sdd-verify --help`

`node --import tsx <rc>/cli/gennady.ts sdd-verify --help` — вывод получен полностью. Существенное:

- Usage ровно две формы: `sdd-verify --task <ticket-path> --phase <PhaseID>` и `sdd-verify --profile full`. Ни `--only`, ни `--skip`, ни `--json`, ни позиционных файлов нет — подтверждает строку таблицы §1 «Narrowing» и мотив issue #20.
- Профили: `setup → fix (optional) · type-check (optional) · test (optional)`; `code → fix · type-check · test`; `owner test → fix · type-check · test:coverage`; `other test / coverage N-A → fix · type-check · test (still profile=test)`; `full → type-check · test:coverage · lint · format · yagni (read-only, no fix steps — a verdict must not mutate what it is judging)`.
- Ладдер: «1. fix — ordered adapters run project `format:fix`, the project `lint:fix` ABI, and Gennady contract repair over only their applicable exact Target Files … The runtime boundary rejects any mutation outside the canonical set»; «3. §5 extras are read-only; any persistent workspace mutation fails and no receipt is written»; «4. only complete success atomically writes a structured receipt … bound to the phase plan, package-script graph and current Target File bytes».
- Вывод: `success → [sdd-verify] ✅ ALL PASS (N/M)`, далее по строке на ступень: `✅ check`, `🔧 mutating`, `⏭ skipped`; «failure → only failed steps dump exit code + captured output» (issue #17 в v2 воспроизводится дословно).
- Exit codes: `0` · `1` gate/phase-context · `4` bad invocation. `env-fail`/`timeout` в таксономии нет.
- Node-специфика прямо в тексте help: «Receipts bind the actually selected project scripts, forwarded npm/pnpm/yarn argv, and repo-local script inputs».

### 5.2 RC — тесты verify-поверхности

`bash -c "cd <rc> && node --import tsx --test --experimental-test-module-mocks cli/cmd/sdd-verify/__tests__/*.test.ts shared/sdd/__tests__/readiness.test.ts"`

```
# tests 172   # suites 24   # pass 172   # fail 0   # cancelled 0   # skipped 0   # todo 0
# duration_ms 697.998917
```

Состав совпадает с таблицей §1 (phase-context 17 + phase-run 22 + sdd-verify.cmd 75 + workspace-mutation 8 + readiness 50 = 172). Прогон делался с `cwd=<rc>` (часть тестов `phase-run` cwd-зависима).

### 5.3 MAIN — `verify --help`

`TSX_TSCONFIG_PATH=… node --import tsx <main>/cli/gennady.ts verify --help` — вывод получен полностью. Существенное:

- «Stacks (auto-detected by root marker file; all detected stacks run together): `anystack` any repository — no stack detection; every gate comes from `stack.anystack.extraGates` · `golang` `go.mod` — go generate (drift check), go build, go vet, gofmt -l, golangci-lint, go test; changed-package scoping · `node` `package.json` — gates from classified npm scripts (typecheck/gennady/lint/test/format)».
- Scope: `<path...>`, `--all`, `--changed` (default). Опции: `--plan/--dry-run`, `--json`, `--wip`, `--full-output`, `--only=<a,b>`, `--skip=<a,b>`, `--stack=<id>`, `--root=<path>`.
- Контракт напечатан явно: «RUN-ALL every gate runs; failures accumulate in one report», «SUPPRESS-ON-SUCCESS passing gates print nothing», «gates never mutate … mutating ops belong to `gennady fix`», «FAIL vs ENV_FAIL a broken tool (panic, blocked proxy) is not a code finding», «exit 0 all pass · 1 gate failed · 4 bad invocation/config · 5 no stack detected».
- Пример конфига в help — с секцией `stack:` (`use`, `skipGates`, `overrideGates`, `extraGates`), «Invalid config (unknown key, wrong type, bad duration) stops verify: exit 4».

### 5.4 MAIN — тесты

`bash -c "cd <main> && TSX_TSCONFIG_PATH=… node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 services/stack/__tests__/*.test.ts"`

```
# tests 111   # suites 26   # pass 111   # fail 0   # duration_ms 8150.898834
```

Расширенный набор (тот же прогон + `plugins/{node,golang,anystack}/__tests__`, `cli/cmd/verify/__tests__`, `cli/cmd/fix/__tests__`):

```
# tests 198   # suites 37   # pass 198   # fail 0   # duration_ms 9345.183208
```

### 5.5 MAIN — `verify --plan --json --root <main>` (жёсткое свидетельство против node-parity через плагин v1)

Резолвнутый план на самом gennady (`sources: ["gennady.yaml"]`, provenance `node`, `node.skipGates`, `node.overrideGates.gennady.argv`), стек `node`, scope `changed`:

| gate id | label | argv | timeoutMs | skipped |
|---|---|---|---|---|
| `typecheck` | `npm run type-check` | `["npm","run","type-check"]` | 600000 | null |
| `gennady` | `npm run dev (overridden by gennady.yaml)` | `["npx","tsx","cli/gennady.ts","lint","cli/","shared/","services/","plugins/"]` | 600000 | null |
| `lint` | `npm run lint` | `[]` | 600000 | `skipGates (gennady.yaml)` |
| `test` | `npm run test` | `["npm","run","test"]` | 600000 | null |
| `format` | `npm run format:check` | `["npm","run","format:check"]` | 600000 | null |

Классификатор выбрал `typecheck→type-check, gennady→dev, lint→lint, test→test, format→format:check`. Сравнение с RC-реестром (`fix, type-check, test, test:coverage, lint, format, yagni`) показывает: **другие id, другое число гейтов, другая выборка скриптов, нет `test:coverage`, нет `fix`, нет `yagni`**. Отсюда вывод §3.2.3: parity для node через `plugins/node` v1 недостижима без отдельного node-пресета, то есть вариант B содержит работу варианта A.

---

## 6. Черновик декомпозиции задач (для рекомендованного A′)

Обозначения: **size** S ≤ 1 фазы-день · M 2-4 · L неделя+. **G1** — предлагаемая eval-группа «node parity + repo-driven stack» (в `ai/flow-eval/scenarios.json` групп нет, id сценариев: `fibonacci-library`, `tic-tac-toe`, `slugify-toolchain`, `broken-specs-repair`, `infra-log-summary`, `infra-rotate-logs`, `infra-makefile`; для swift/anystack — внешняя фикстура `/Users/k.lebedev/.gennady/eval/cloud-ios/fixture-detmig`). ⚑dir — задача правит директивы/`.hbs`/`ai/kit/**`; ⚑spec — правит спеки.

| id | цель | ключевые файлы | тесты, которые добавляются | G1 | size |
|---|---|---|---|---|---|
| **V-01** (parity-safe, первый) | зафиксировать текущее поведение RC как golden: набор ступеней, строки команд, рендер, receipt | новые `shared/sdd/__tests__/preset-node-golden.test.ts`, `cli/cmd/sdd-verify/__tests__/parity-node.test.ts`, фикстура receipt'а | golden-JSON по 5 профилям; байтовое сравнение stdout; `validatePhaseReceipt` на старом receipt'е | да | M |
| **V-02** | перенести примитивы MAIN verbatim, без вызовов | `shared/verify/{env-fail,verify.types,stack-config,tree-guard,stack-registry}.ts`, `services/config/config-loader.ts`, `plugins/index.ts`, `plugins/{anystack,golang}/**`, `plugins/*/plugin.json` | перенести as-is тесты MAIN: env-fail 14, stack-config 29, stack-registry 5, tree-guard 12, gate-spec-parity 2, golang 46, node-plugin 14 | нет | S |
| **V-03** | `Gate`/`GateStatus` как данные: `argv/cwd/env/timeoutMs/envFail/requires/stack`, статусы `env-fail|timeout|violation` | `cli/cmd/sdd-verify/sdd-verify.types.ts:21-44,288-315`, `sdd-verify.cmd.ts:219-240` | «новые поля не меняют `gateEvidence`-проекцию (`name/state/command/provider`)»; «`env-fail` не считается gate-failure для вердикта, но останавливает ладдер» | да | M |
| **V-04** | `resolvePreset(stack, profile, root, config)` + node-пресет, воспроизводящий текущие строки | новый `shared/verify/presets/node.ts`, правки `shared/sdd/phase-verification-plan.ts:29-92,253-272`, `sdd-verify.cmd.ts:357-368` | V-01 обязаны быть зелёными **без правок**; + «пресет без источника `environmentState` отвергается fail-closed» | да | M |
| **V-05** | детект стека из репозитория + факт в снапшоте | `shared/verify/stack-detection.ts`, `cli/cmd/sdd-state/sdd-state.cmd.ts:152-161`, `sdd-state.types.ts:108-145` (`STACK=`, `STACK_SOURCE=`), `shared/sdd/probe.ts:12-33` | «`sdd-state`/`sdd-task`/`sdd-verify` на одном корне видят один `StackDetection`»; «`stack.use` сужает, но не назначает»; мультистек-репо (package.json+go.mod) | да | M |
| **V-06** ⚑dir | readiness: движок обязанностей + node-адаптер (выход байт-в-байт) + тривиальный anystack-адаптер; снять eval-шим | `shared/sdd/readiness.ts:15-24,296-420,434-609`, `shared/sdd/ladder.ts:68`, `shared/sdd/gate-queue.ts:365,392`, `cli/cmd/sdd-task/sdd-task.cmd.ts:462-487`; тексты `ai/kit/templates/sdd-v2/readiness.directive.hbs`, `ai/kit/axiom/process/ax-verification-before-handoff.xml` | «node-выход `checkReadiness` идентичен до/после (те же `missing`/`stubbed`/`level`)»; «anystack-проект с `extraGates` получает `ready`»; удалить зависимость от `roundtrip-readiness-shim.package.json` | да | L |
| **V-07** ⚑spec | конфиг-контракт: `gennady.yaml` секция `stack:` в v2 (deep-merge, провенанс, строгая валидация, exit 4) | `shared/verify/stack-config.ts` (подключение), `cli/cmd/sdd-verify/sdd-verify.cmd.ts`, перенос `specs/stack|config|plugins/**` | e2e на `gennady.yaml` cloud-ios: 3 `extraGates` парсятся, `envFail`/`requires`/`fixer` не теряются; «неизвестный ключ → exit 4» | да (fixture-detmig) | M |
| **V-08** | anystack в фазовой модели: гейты из конфига как read-only-хвост, `required` пусто | `shared/verify/presets/anystack.ts`, `cli/cmd/sdd-verify/sdd-verify.cmd.ts:431-598` | «anystack-фаза с 3 гейтами пишет receipt»; «anystack не делает проект `not-ready`» | да (fixture-detmig) | M |
| **V-09** | golang: плагин verbatim + маппинг ступеней ладдера + `environmentState` для go | `plugins/golang/**` (без правок), `shared/verify/presets/golang.ts` | «`fix` = `gofmt -w` только по пакетам Target Files»; «`generate`-drift только в `full`»; env-fail на `MODULE_FETCH_RE` | да | M |
| **V-10** | python-плагин + coverage-адаптер | новые `plugins/python/{plugin.json,python-plugin.ts,python-plan.logic.ts}`, `shared/verify/presets/python.ts`, `cli/cmd/testcov/coverage-py-adapter.ts`, `coverage-adapter-registry.ts:8` | детект по `pyproject.toml`; ladder ruff/mypy/pytest; `envFail` на `ModuleNotFoundError`; coverage-freshness на `coverage.xml` | да | M |
| **V-11** | swift-пресет + `xccov`-адаптер + исключения снимка (`.build`, `DerivedData`) | `plugins/swift/**`, `cli/cmd/testcov/xccov-coverage-adapter.ts`, `cli/cmd/sdd-verify/workspace-mutation.ts:101,134-169` | детект `*.xcworkspace|Package.swift`; «`DerivedData` не считается мутацией»; coverage-probe на `*.xcresult` | да (fixture-detmig) | L |
| **V-12** | #9: `when: [<glob>]` в `GATE_SPEC_KEYS` + сужение по Target Files фазы | `shared/verify/stack-config.ts:34-45,247-340`, `cli/cmd/sdd-verify/phase-context.ts:169-239` | «гейт, чьи globs не пересеклись, даёт видимый `skipped: when (gennady.yaml)`»; «гейт без `when` идёт всегда» (поведение по Q4) | да | M |
| **V-13** | #20: `--only/--skip` с префиксом/glob + печать резолвнутого набора | перенос `cli/cmd/verify/verify.cmd.ts:69-71,166-212` в общий резолвер; `--plan` вывод | «`--only=swiftlint*` матчит новый гейт»; «неизвестный селектор → exit 4»; «`--only` снимает `skipGates`» | да | M |
| **V-14** | #17: вывод на pass — маркерные строки `[gate] ` + опциональный `showOutputOnPass` | `cli/cmd/sdd-verify/sdd-verify.types.ts:288-315`, `shared/verify/verify.types.ts` | «`[gate] сужено: …` виден на зелёном прогоне»; «receipt при этом не меняется (И-2)» | да | M |
| **V-15** ⚑dir ⚑spec | директивы, `.hbs`, rules cascade | `ai/kit/templates/sdd-v2/{readiness,infra,router,audit,phase-execution-protocol}.directive.hbs`, `ai/kit/axiom/process/{ax-permitted-bash-commands,ax-verification-before-handoff}.xml`, `ai/kit/contract/process/readiness-preflight-gate.xml`, `ai/directives/knowledge.xml` + перенос `ai/directives/coding/{baseline,go,python}-rules.xml`; `specs/cli/sdd-verify/sdd-verify.spec.md` | `npm run check:directives-fresh`; «`STEP_5` больше не упоминается»; «`go-rules`/`python-rules`/`baseline-rules` резолвятся из `knowledge.xml`» | да | M |
| **V-16** | фасады: `gennady verify` (RUN-ALL + `--plan --json`) и `gennady fix` над общим ядром | `cli/cmd/verify/**`, `cli/cmd/fix/**` (перенос), общий резолвер пресетов | «оба фасада на одной фикстуре резолвят один набор `Gate` (с точностью до halting/scope)»; перенести verify 16 + fix 4 теста | нет | S+S |

**Порядок и параллелизм.** V-01 → V-02 → V-03 → V-04 — строгая цепочка (parity). Далее V-05 → V-06 (readiness — единственный L в критическом пути). V-07/V-08 разблокируют cloud-ios и eval-фикстуру; V-09/V-10/V-11 независимы друг от друга и могут идти параллельно после V-05. V-12/V-13/V-14 (issues) независимы после V-03/V-07. V-15 закрывает текст, V-16 — поверхность CLI; оба последними, но V-15 обязателен до релиза (иначе директивы обещают npm там, где CLI уже принимает стек).

**Задачи, трогающие директивы/`.hbs`:** V-06 (частично — тексты readiness), V-15 (основной объём). **Трогающие спеки:** V-07 (перенос `specs/stack|config|plugins/**`), V-15 (`sdd-verify.spec.md`, Decision Log D-SV на пресеты/статусы/`when`).



# Часть II — V-B1 (независимый верификатор, Opus)

# V-B1 — независимая верификация B1-verify-track.md

Дата: 2026-09-07. Read-only, свежие глаза. Проверено по коду двух чекаутов:

- **MAIN** = `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` (`node_modules` пуст — прогоны MAIN не воспроизводились)
- **RC** = `…/scratchpad/rc-v6` (`11291af5`, `node_modules` установлен)
- Потребитель: `git -C /Users/k.lebedev/.gennady/eval/cloud-ios/fixture-detmig show HEAD:gennady.yaml`

---

## § Итог

**Счёт по цитатам §1 + §4:** проверено 96 ссылок `file:line`. **74 CONFIRMED**, **19 WRONG-LINE** (сдвиг от 1 до 16 строк; во всех случаях утверждение по существу верно), **3 REFUTED** (утверждение о механизме неверно).

**Счёт по существу:**

| Проверка | Вердикт |
|---|---|
| 1. Цитаты §1/§4 | 74 / 19 / 3 (см. § Цитаты) |
| 2. И-1 | **REFUTED в механизме**, вывод верен для другой строки |
| 2. И-2 | **CONFIRMED**, но список инвалидаторов неполон |
| 2. И-3 | **CONFIRMED и недооценён**: без `package.json` receipt не пишется вовсе (hard fail), а не «схлопывается» |
| 3. Довод против B | **справедлив по итогу**, но два из трёх «фактов» слабые; найдено 7 непокрытых steelman-аргументов за B |
| 4. Parity-стратегия | **недостаточна**: 8 конкретных дыр (durationMs, exit codes, `fix`-evidence, порядок repair-адаптеров, матрица форм скриптов, `environmentState`, парсимый текст `⛔`, module-mocks) |
| 5. Пресеты vs потребитель | дизайн теряет `outputMeansFailure`/`driftMeansFailure`; `fixer` в фазовом пути мёртв; мультистек+одна лестница не определены; `workspace-mutation` на `DerivedData` — не только ложные срабатывания, а sha256 по ~10 ГБ дважды за прогон |
| 6. Issues #9/#17/#20 | #9 и #17 реализуемы там, где сказано; **#20 в фазовом пути нарушает И-2** — `--only` сделает receipt невалидным по собственному валидатору |
| 7. Детект стека | **CONFIRMED** (селектора нет ни в `router.directive.xml`, ни в `readiness-preflight-gate.xml`, ни в `portal.ts`, ни в `sdd-state`; `baseline/go/python-rules.xml` в RC отсутствуют); одна неточность про состав `knowledge.xml` |
| 8. Задачи V-01..V-16 | **4 пропущенные задачи/файла**, 1 ошибка зависимостей (V-08/V-11 зависят от несуществующей задачи), 2 «невидимых» блокера (`plugins/` не входит в `TEST_ROOTS`; `baseline-testing.xml` не в списке переноса) |
| 9. RC 172/172 | **воспроизведено**: `# tests 172 # suites 24 # pass 172 # fail 0` |

**Рекомендация A′ выживает.** Ни одна найденная ошибка не переворачивает вывод: главный аргумент («дорогое в RC — семантика фазы и receipts, дорогое в MAIN — данные и примитивы, и они копируются файлами») подтверждён кодом. Но три поправки меняют план:

1. **Порядок работ неверен.** `environmentState` (`shared/sdd/phase-receipt.ts:1127-1233,1242-1254`) читает `package.json` внутри `try` и при его отсутствии возвращает `{ok:false}` → `receiptError` → exit 1. То есть **swift/python/anystack-проект без `package.json` не может записать receipt вообще**, независимо от гейтов. V-08 (anystack) и V-11 (swift) зависят от задачи «per-preset источник fingerprint'а», которой в §6 нет. Эту задачу надо создать и поставить сразу после V-04.
2. **`--only/--skip` (V-13) нельзя пускать в фазовый путь** — `phaseReceiptCommandIssue` требует точного равенства `ladderNames` и плана (`cli/cmd/sdd-verify/phase-receipt-validation.ts:95-96`).
3. **И-1 переформулировать**: байт-в-байт сверяется не `ranCommand`, а `PhaseVerificationGatePlan.command`. Это одновременно ослабляет риск переписывания `runGate` (§3.1.2 «риск высокий» → средний) и усиливает риск любой правки `commandForGate` (он бьёт и в `gateEvidence`, и в `environmentState`, и через него в `planState`).

---

## § Цитаты

### CONFIRMED (выборка ключевых; всего 74)

| Цитата в B1 | Что проверено |
|---|---|
| `services/stack/stack-registry.ts:44-64` `detectStacks`, `:12-14` сортировка по id | точно так |
| `plugins/index.ts:15` `BUILTIN_PLUGINS = [anystackPlugin, golangPlugin, nodePlugin]` | точно так |
| `plugins/node/node-plugin.ts:45,51`; `plugins/golang/golang-plugin.ts:57`; `plugins/anystack/anystack-plugin.ts:24-34` | маркеры `package.json` / `go.mod` / «матчит всегда, 0 гейтов» |
| `cli/cmd/verify/verify.cmd.ts:160-179` мультистек; `:41-46` exit-коды; `:107-117` config→exit 4; `:128-132` `--stack` one-shot; `:139-148` exit 5; `:150-153` `mode:'files'`; `:166-212` `--only/--skip`; `:190-199` неизвестный селектор; `:219-245` `--plan --json`; `:335-372` `--json results[]`; `:304-331` `DIRTY_TREE`; `:375-376` `ZERO_GATES`≠0 | все подтверждены |
| `services/config/config-loader.ts:11` `PROJECT_CONFIG_FILENAME`, `:257` `provenanceOf`, `:281` `loadConfigSection` | точно так |
| `services/stack/stack-config.ts:34-45` `GATE_SPEC_KEYS`, `:62` provenance-Map, `:247`+ валидация, `:345` «objects merge, leaves replace», `:398-414` `unmatchedGateOverrides`, `:428-549` `applyStackConfig` | точно так |
| `services/stack/stack.types.ts:96-110` `EnvFailPredicate`, `:117-128` `Cmd`, `:134-170` `Gate`, `:181` таксономия вердиктов, `:186` «retained only for non-passing», `:236-257` `GateSpec` | точно так |
| `services/stack/gate-runner.ts:19-21` 20/40, `:28` `LOCK_WAIT_MS`, `:106-112` `UNSANDBOXED_RUN`, `:119-124` `ZERO_GATES`, `:178-215` `requires`→env-fail, `:224-340` `executeGate`, `:273-339` порядок вердиктов, `:351-383` `runVerify` RUN-ALL, `:415-514` `formatVerifyReport` (`:430` `⏭️  SKIP gate:`, `:452` `❌ FAIL\|ENV_FAIL\|TIMEOUT\|VIOLATION gate:`, `:488` `ZERO_GATES`, `:503` `BLOCKED`, `:510` `ALL_GATES_PASS (n/m)`) | все подтверждены |
| `services/stack/tree-guard.ts:126-129` lock в `--absolute-git-dir`, `:140-266`, `:186-192` crash-recovery, `:205-214` `DIRTY_TREE`, `:223-228` wip-`reset()` no-op, `:229-230` `reset --hard`+`clean -fdq`, `:251-258` signal/exit, `:264` `drift()→''` | все подтверждены |
| `gennady.yaml:1-11` догфуд (`node.skipGates:[lint]`, `overrideGates.gennady.argv`) | точно так |
| `plugins/node/classify-npm-scripts.ts:6` `NpmScriptClass = typecheck\|gennady\|lint\|test\|format`, `:26-64` watch/umbrella-фильтр; `node-plugin.ts:118-131` мутирующий→skip | подтверждено — **статически доказывает §5.5 без прогона** |
| `shared/sdd/readiness.ts:15-24` `REQUIRED_SCRIPTS` (8), `:30-32` алиас `typecheck`, `:562` `executionReady`, `:572-587` `detectGennady`, `:596-609` `gatherReadinessInput` читает только `package.json` | точно так |
| `shared/sdd/probe.ts:12` `CODE_EXT` «Node-only support today» | точно так |
| `resolve-verify-commands.logic.ts:2` единственный потребитель, `:34-72` `DETECTOR_ROWS`, `:83-99` `isWatchLikeScript`, `:155` `npm run <name>`, `:176-193` первый матч выигрывает | точно так |
| `cli/cmd/sdd-verify/sdd-verify.types.ts:14`,`:21-30` `Gate`, `:36-44` `GATES`, `:128-133` позиционный→exit 4, `:157-183` вывод профиля, `:201` `GateStatus`, `:225-227` `VerifyOutcome`, `:288-295` `lineFor`, `:302-315` `failBlock` (`⛔` на `:305`), `:347-354` setup-нота, `:365` `✅ ALL PASS (N/M)`, `:380` `ERR_CLI_SDD_VERIFY_GATE_FAILED` | все подтверждены |
| `sdd-verify.cmd.ts:70` exit 127, `:92-114` async `execFile` **без timeout**, `:159-164` `gennadyGateCommand`, `:169-182` `CoverageProbe`, `:191-211` `verifyCoverageWritten`, `:223-226` `npm run <script>`, `:252-317` `runTargetRepair`, `:431-598` последовательная лестница, `:502` `/^npm run (\S+)$/`, `:511-525` required-missing→`missing`+`break`, `:594-597` halt, `:600-648` `Promise.all` quality-tail | все подтверждены |
| `phase-run.ts:59` `ERR_CLI_SDD_VERIFY_RECEIPT`, `:65-71` маркер, `:73`+ атомарная запись, `:210-219` `ladderCommands`, `:232-428` `runPhaseVerification`, `:242-247` freeze, `:294` инвалидация до первой команды, `:326-365` §5 read-only boundary, `:357,369` `ERR_CLI_SDD_VERIFY_EXTRA_FAILED`, `:423` печать `gate-state:` | все подтверждены |
| `phase-receipt-validation.ts:98-106` проекция `{name,state,command,provider}`, `:209-254` `phaseReceiptIssue` | точно так |
| `shared/sdd/phase-receipt.ts:16-25`/`28-49` схема, `:91-93` `planState`, `:1242-1254` + regex `:1250`, `fix→['format:fix','lint:fix']` `:1249`; файл 1421 строк | точно так |
| `shared/sdd/group-receipt.ts:14-17` маркеры, `:141` `buildGroupReceipt`; `sdd-log.cmd.ts:72-73`; `sdd-log.types.ts:284-286`; коды `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` (`group-receipt.ts:21,23`); коммит `4bb00f4b` 2026-09-06 | точно так |
| `workspace-mutation.ts:101` `EXCLUDED_TOOL_DIRS = ['.git','node_modules']`, `:134-169` sha256-снимок, `:289-403`, `:373` «changes were left intact» | точно так |
| `index.ts:23,67,96` exit-коды, `:73-84` §5 через `shell:true`, `:88-93` `full` read-only; `help.ts:96` | точно так |
| `phase-context.ts:82` `ERR_CLI_SDD_VERIFY_PHASE_CONTEXT`, `:134-226` §5-таблица, `:169-239` Target Files, `:244-250` `git ls-files`, `:253-296` infra-queue exemption | точно так |
| `phase-verification-plan.ts:29-35`,`:43-50`,`:58-64`,`:77-92`,`:376` | точно так |
| `sdd-task.cmd.ts:107,123`, `:459-487` hard block; `sdd-task.types.ts:64` код; `gate-queue.ts:365,392` | точно так |
| `sdd-state.cmd.ts:152-155`, `sdd-state.types.ts:105-148` (**строки `STACK=` нет**), `shared/sdd/portal.ts:12-23` (**поля «стек» нет**), `shared/sdd/ladder.ts:68` `infraDone` | точно так |
| Директивы RC: `STEP_3_VERIFY.xml:5-15` + дефект «STEP_5» на `:28`; `ax-permitted-bash-commands.xml:3-7` (STEP_5 на `:4`); `ax-verification-before-handoff.xml:6-13` (канон = тело скрипта), `:9` `package.json`; `audit/steps/STEP_1_MECHANICAL.xml:22,32-46,75-76,98`; `router.directive.xml:294-304,361-362,390-391`; `readiness-preflight-gate.xml:2-13`; `infra.directive.xml:75,83,430-432` | все подтверждены |
| `ai/flow-eval/scenarios.json` — 7 id (`fibonacci-library`…`infra-makefile`), групп нет; `ai/flow-eval/scripts/roundtrip-readiness-shim.package.json` (стабы `node -e "process.exit(0)"` + «Remove once the flow branch consumes anystack readiness»); `ai/flow-eval/docs/roundtrip-wall3-assessment.md` | точно так |
| MAIN `knowledge.xml:67` `baseline-rules`, `:85` `python-rules`, `:95` `go-rules` (`:93`/`:103` — `CrossRef id="baseline-rules"`); в RC `ai/directives/coding/` содержит только svelte/ts/uikit | точно так |
| §1.1 состав `gennady.yaml` потребителя: `use:[anystack]`, 3 `extraGates` (`swiftlint` 10m/2×envFail/`fixer`; `build` 90m/`requires`/4×envFail; `unit-tests` 90m/`requires`/2×envFail); использованы `cwd,argv,timeout,envFail{outputMatches,exitCodeMatches,hint},requires{argv,hint},fixer{cwd,timeout,argv}`; не использованы `env,outputMeansFailure,driftMeansFailure,skipGates,overrideGates` | точно так; **строка `[gate] сужено:` в конфиге реальна** — предложение #17(b) опирается на факт, а не на догадку |
| RC: 59 коммитов после 2026-08-27; `aa524dd9`/`d633bb85`/`e95dd106`/`4547c82f`/`383e3f73`/`4bb00f4b` — даты и сообщения сходятся | точно так |

### WRONG-LINE (19; утверждение верно, строка — нет)

| B1 говорит | Правильно |
|---|---|
| «исполнение без shell» `gate-runner.ts:234`; §3.2.2 «sync `spawnSync` `:234`» | `:233` (`spawnSync(bin!, args, {`) |
| `gate-runner.ts:133` («`runGate` не экспортирован») | `runGate` объявлен на `:132`. Сам факт **подтверждён**: `grep '^export' gate-runner.ts` → только `runVerify:351`, `truncateOutput:391`, `formatVerifyReport:415`, `runFix:522` + ре-экспорт `:25` |
| `output: ''` на `gate-runner.ts:331,336` | `:331` и `:335` |
| `runFix` `gate-runner.ts:523-533` | `:522-531` |
| violation-блок `gate-runner.ts:306-315` | `:306-314` |
| `WRITE_SWITCH_PATTERN` `readiness.ts:243-244` | `:260` |
| `MUTATING_SWITCH_PATTERN` `readiness.ts:263` | `:279` |
| `NO_OP_SEGMENT` `readiness.ts:322-323` | `:326` (на `:322-323` — комментарий «closed list of UNAMBIGUOUS shell no-ops») |
| `isVacuousScript`/`isStubScript` `readiness.ts:396-420` | `isStubScript:405`, `isVacuousScript:425` (на `:434` — `isRealScript`) |
| `checkReadiness` `readiness.ts:434-564` | `:446-564` |
| `fixHasCanonicalRepairOrder` `readiness.ts:216-236` | `:237` |
| `infraDone = packageJsonPresent && …` — `ladder.ts:65` (в §1) | `:68` (в §4.1/§4.2 указано верно) |
| `commandForGate` `phase-verification-plan.ts:253-272`; `` `npm run ${script}` `` `:271` (тж. §4.2) | `:252-271`; строка — `:270` |
| `ESLINT_EXTENSIONS` `repair-adapters.ts:47` | `:48` |
| `PACKAGE_MANAGER_BUILTINS` `phase-receipt.ts:93+` | `:95` |
| `probeRepo` `sdd-state.cmd.ts:161` | `:164` (на `:161` — комментарий региона) |
| `CONFIG_FILES` `probe.ts:15-33` | `:15-34` |
| `runGate` в И-1 — `sdd-verify.cmd.ts:219-240` | функция `:221-241`, `ranCommand` — `:230` |
| `scriptReachesGennady` `readiness.ts:170-190` | экспорт на `:176` (диапазон включает; принято) |

### REFUTED (3)

1. **И-1: «эти строки … сверяются байт-в-байт при валидации (`phase-receipt-validation.ts:95-106`)».** Неверно. На `:92-96` сверяются **имена** ступеней (`ladder.map(c => c.gate)`), на `:121-122` — роли, на `:97-106` — `gateEvidence` против проекции **плана**. `receipt.commands[].command` (то есть `ranCommand`) не сверяется **ни с чем**. Байт-в-байт сверяется только `command` §5-extras (`:131`, против `receipt.verification[i].command`, лежащего в том же receipt) и `gatePlan.gates[].command`.
2. **И-3: «для non-node стека корней не будет вовсе → `environmentState` схлопнется до §5-команд».** Неверно и опасно мягко. `phaseVerificationEnvironmentFromScripts` (`shared/sdd/phase-receipt.ts:1127-1200`) открывает `try` **до** `readFileSync(resolve(root,'package.json'))` (`:1132-1133`) и на любой ошибке возвращает `{ok:false, issue:'cannot fingerprint project verification scripts: …'}` (`:1194-1199`) → `planFor` → `receiptError` → exit 1. Репозиторий без `package.json` **не может записать receipt вообще**. Это не тихая потеря честности, а жёсткая блокировка — и именно поэтому eval-харнесс вынужден подкладывать `roundtrip-readiness-shim.package.json`, а не просто «терять fingerprint».
3. **§4.4 п.7: «в RC зарегистрированы только `typescript-rules`, `sveltekit-rules`, `vitest-rules`».** В RC `ai/directives/knowledge.xml` зарегистрировано 14 правил: `typescript-rules, svelte5-runes, sveltekit-rules, testing-common, vitest-rules, node-test, playwright-cli, playwright-e2e, storybook-usage, svelte-testing, eslint-setup, git-setup, nodejs-npm-setup, storybook-setup`. Несущая часть утверждения (`baseline-rules`, `go-rules`, `python-rules` отсутствуют и в реестре, и физически) — **подтверждена**.

### Не воспроизводилось

- MAIN 198/198 и 111/111 (§5.4), MAIN `verify --plan --json` (§5.5), MAIN `--help` (§5.3): `node_modules` в MAIN-воркtree пуст (проверено: 0 записей), установка политикой сессии запрещена. §5.5 **подтверждён статически** (см. `classify-npm-scripts.ts:6` + `node-plugin.ts:48,116`), поэтому вывод §3.2.3 не зависит от прогона.
- Поштучные счётчики тестов в §1 (env-fail 14, gate-runner 46 и т. д.); инвентарь файлов совпадает.

---

## § Инварианты И-1..И-3

### И-1 (parity команд) — REFUTED в механизме, вывод переформулировать

Цепочка, как она есть в коде:

```
runGate (sdd-verify.cmd.ts:221-241)  →  ranCommand = `${command} ${args.join(' ')}`  (:230)
ladderCommands (phase-run.ts:210-219) →  receipt.commands[] {gate, role, command: ranCommand, exitCode}
                                          ↑ фильтр status === 'pass' (:212)
phaseReceiptCommandIssue (phase-receipt-validation.ts:73-136)
    :92-96  сверяет ТОЛЬКО ladderNames = ladder.map(c => c.gate)  ← ИМЕНА
    :97-106 сверяет receipt.gateEvidence против gatePlan.gates.map({name,state,command,provider})
    :121    сверяет role
    :131    сверяет command ТОЛЬКО для gate === 'verification' (§5 extras)
```

Следствия, которых в B1 нет:

- **`ranCommand` не участвует ни в одной сверке.** Его можно менять свободно: старые receipts останутся валидными. Значит риск, помеченный в §3.1.2 для `sdd-verify.cmd.ts:145-240` как «**высокий** (И-1)», по факту **средний** — это риск отчёта и golden-теста, не совместимости receipts.
- **Настоящий байт-в-байт контракт — `PhaseVerificationGatePlan.command`**, то есть выход `commandForGate` (`phase-verification-plan.ts:252-271`): `'target-repair'` для `fix` и `` `npm run ${script}` `` для остальных. Он бьёт трижды: (i) `gateEvidence` (`:104`), (ii) корни `environmentState` через regex `/^npm run (\S+)$/` (`phase-receipt.ts:1250`), (iii) через `environmentState` — в `planState` (поле входит в `PhaseReceiptPlan:48`). Любая косметика вида `npm run --silent <x>` инвалидирует всё сразу. Именно эту строку надо помечать «высокий риск», а не argv рантайма.
- **Для ступени `fix` И-1 просто неверна.** `runTargetRepair` пишет `ranCommand = evidence.join(' && ')` (`sdd-verify.cmd.ts:313`), где элементы — `describeRepairAction` (`repair-adapters.ts:163-166`), то есть либо `npm run format:fix -- <targets>`, либо `gennady-contract(skip: no applicable .ts/.tsx targets)`. Ни `npm run fix`, ни `npx` там не появляются.
- **Legacy-receipts без `gateEvidence`** валидируются по литеральному списку `phase-receipt-validation.ts:83-91` (`['fix','type-check','test'|'test:coverage']`). Пресет, переименовавший ступени node, ломает и этот путь.

### И-2 (проекция плана) — CONFIRMED, но список инвалидаторов неполон

Подтверждено: `PhaseReceiptPlan` (`phase-receipt.ts:28-49`) не содержит массива гейтов; `planState = sha([JSON.stringify(plan)])` (`:91-93`); запись `gateEvidence` (`phase-run.ts:408-413`) и ожидание при валидации (`phase-receipt-validation.ts:98-103`) используют одну и ту же четвёрку `{name,state,command,provider}`. **Обогащение `PhaseVerificationGatePlan` полями `argv/timeoutMs/cwd/env/envFail/requires/stack` действительно receipt-безопасно.** Это главный технический вывод B1, и он верен.

Чего в И-2 не сказано, а надо (иначе «receipt-безопасно» прочтут шире, чем есть):

1. `planState` покрывает `profile`, `profileBasis`, `targets`, `deletedFiles`, `verification[]`, `coverageOwner`, `producesCoverage`, `environmentState`. Любая правка **вывода профиля** (`phaseProfileForKind`) или **парсинга §5** меняет `planState` → все открытые receipts недействительны.
2. `required` в валидаторе выводится как `gatePlan.gates.filter(g => g.state === 'CONFIGURED' && g.command !== null).map(g => g.name)` и сравнивается **точным JSON-равенством с порядком** (`:95`). То есть **состав и порядок ступеней плана — тоже байт-контракт**. Это прямо бьёт в V-08 (anystack-гейты «хвостом после foundation»): если они попадут в `gatePlan` как `CONFIGURED`, они обязаны попасть в `receipt.commands` в том же порядке; если не попадут в план — их нельзя писать в `commands` (ladder-ветка), только как `gate:'verification'`.
3. `receipt.commands` содержит **только прошедшие** ступени (`phase-run.ts:212`), поэтому «видимый skip» (#9/#12) не имеет места в receipt вообще. Гейт, отсечённый `when`, исчезает из доказательства — это надо решать явно.

### И-3 (`environmentState` привязан к `npm run`) — CONFIRMED и недооценён

Подтверждено буквально: `phaseVerificationPlanEnvironmentState` (`phase-receipt.ts:1242-1254`), корни через `/^npm run (\S+)$/` (`:1250`), `fix` → `['format:fix','lint:fix']` (`:1249`).

Три дополнения:

- **Второй, не упомянутый в §4.2 node-узел:** `phaseVerificationEnvironmentState` (`:1203-1233`) читает `package.json` сам (`:1212-1220`) и жёстко перечисляет `format:fix`, `lint:fix`, `type-check`, `test`/`test:coverage` (`:1224-1229`). Это отдельная от `…PlanEnvironmentState` функция, и её тоже надо расщеплять по пресетам.
- **Fail-closed сильнее, чем описано** (см. REFUTED #2): нет `package.json` → нет receipt. Для non-node стеков это не «тихая потеря честности», а немедленный `ERR_CLI_SDD_VERIFY_RECEIPT`.
- **Fingerprint покрывает больше, чем «тела скриптов»:** lifecycle-хуки `pre*/post*` (`:1152-1154`), неявный `start → node server.js` (`:1159-1160`), fallback `restart → stop+start` (`:1165-1174`), транзитивные `referencedScriptInvocations` и `localInputEntries` (`:1177-1184`). Любой per-preset аналог обязан воспроизвести эту семантику для node **побайтово**, иначе шаг 6 плана инвалидирует все receipts молча. Это самый недооценённый риск во всём B1: он крупнее, чем R-A1.

**Ответ на вопрос «обогащение gate plan действительно сохраняет receipts?»** — Да, при трёх условиях: (а) `name`/`state`/`command`/`provider` каждой ступени и **их порядок** не меняются; (б) `commandForGate` рендерит те же строки; (в) `environmentState` для node остаётся байт-идентичным (та же функция или её точная копия). Условие (в) в §6 не закреплено ни одной задачей.

---

## § Аргумент против B и steelman

### Проверка трёх «фактов» B1

| Факт B1 | Вердикт |
|---|---|
| «sync `spawnSync` ломает параллельный quality-tail `full`» | **Наполовину.** `spawnSync` подтверждён (`gate-runner.ts:233`), `Promise.all` подтверждён (`sdd-verify.cmd.ts:606-641`). Но `full` — глагол аудита/CI, и потеря параллельности хвоста из трёх read-only гейтов это **регресс производительности, а не корректности**. «Ломает» → «лишает параллельности». Обратная сторона, которую B1 не назвал: RC-раннер (`:92-114`) **не имеет timeout вообще**, MAIN-раннер имеет обязательный per-gate timeout + `SIGKILL` + `ETIMEDOUT` + `maxBuffer 64MB` (`:227-256`). По этому измерению B безопаснее A. |
| «`runGate`/`executeGate` не экспортированы» | **Формально верно** (`grep '^export'` даёт только 4 функции), **но как аргумент слаб**: это диф из одного слова `export`. Считать это одной из трёх причин отвергнуть B — риторическая натяжка. |
| «Классификатор node не даёт parity» | **Полностью подтверждён и статически доказуем**: `NpmScriptClass = 'typecheck'\|'gennady'\|'lint'\|'test'\|'format'` (`classify-npm-scripts.ts:6`), `NODE_GATE_IDS = NPM_SCRIPT_CLASSES` (`node-plugin.ts:16`), отбор — эвристики `:46-90`+. Ни `fix`, ни `test:coverage`, ни `yagni`. Это **единственный железный** из трёх фактов. |

Вывод «B содержит работу A плюс свою» — **справедлив**, потому что железный факт один, но он достаточный: node-пресет из восьми точных имён придётся написать в любом варианте.

### Steelman B (что B1 не рассмотрел или отверг слишком быстро)

1. **Обязательный per-gate timeout.** `executeGate` бросает исключение на не-положительном `timeoutMs` (`:227-232`), убивает `SIGKILL` (`:240`), различает `ETIMEDOUT`/`ENOBUFS` (`:249-256`) и рендерит `TIMEOUT` с нотой «это не находка в коде» (`:460-465`). В A это новый код и новый класс отказов (сам B1 признаёт это как R-A3). Потребитель ставит 90m таймауты — то есть для cloud-ios это не роскошь.
2. **Мутирующая ступень в B почти бесплатна, а не «хирургия».** `runVerify(runs, diags, {wip:true})` → `createGuardPool(true)` (`:356`) → `acquireTreeGuard(toplevel, undefined, {wip:true, lockWaitMs:LOCK_WAIT_MS})` (`:80-84`) → `drift() → ''` и `reset()` — no-op (`tree-guard.ts:223-228,264`). **Механизм «гейт мутирует, откат не происходит» уже существует и уже так работает для фазового вызова v1 (`verify --wip`).** Строка §3.2.2 «разрешить мутирующую ступень (M)» и риск R-B1 «потеря гарантии “гейты не мутируют”» — переоценены: гарантия и так снимается флагом.
3. **Halting в `runVerify` — additive-опция.** Функция 33 строки (`:351-383`), одна `flatMap`. `{haltOn}` в options не меняет ни один существующий вызов и не трогает публичный контракт CLI v1 (он остаётся RUN-ALL по умолчанию). B1 подаёт это как правку «принятого контракта v1» — контракт живёт в CLI и help, не в сигнатуре функции.
4. **`requires` уже есть и уже нужен потребителю.** `firstFailingPrecondition` (`:178-215`) проверяет существование `cwd`, спавнит предусловие, отдаёт `env-fail` с `hint`. cloud-ios объявляет `requires` в двух гейтах из трёх. В A это пишется заново.
5. **Порядок вердиктов — это тонкая, оттестированная логика**, а не «копия файла»: env-fail → timeout → violation → drift-FAIL → `outputMeansFailure` → exit (`:273-339`), причём `outputMeansFailure` смотрит только `stdout` (`:329`), а `ENOBUFS` осознанно **не** считается env-fail (`:252-256`). При переносе в RC придётся заново отвечать: считается ли `env-fail` провалом для `verdict()`, останавливает ли лестницу, попадает ли в `N/M`. B такие ответы наследует вместе с 14+46 тестами.
6. **R-B2 («две модели состояния») симметричен.** A тоже кончает двумя моделями: `skipped` (нет скрипта) + `missing` (обязательный отсутствует/вакуумный) + новые `env-fail`/`timeout`/`violation`. Это не преимущество A.
7. **Тесты MAIN в B остаются на месте**, в A они переезжают: `plugins/index.ts` импортирует `'gennady/stack'`, а это **tsconfig-алиас** (`MAIN tsconfig.json:35` → `./services/stack/plugin-api.ts`). «Перенести as-is» (V-02) невозможно без правки `tsconfig.json` RC и путей импорта во всех перенесённых тестах.

### Steelman чистого A (без фасадов) — против A′

1. **Фасад `gennady verify` заново вводит зелёный вердикт без receipt.** `verify --wip` печатает `ALL_GATES_PASS (n/m)` и выходит 0, не создавая `SDD_PHASE_RECEIPT`. Это ровно тот артефакт, который `AX_VERIFICATION_BEFORE_HANDOFF` (`ax-verification-before-handoff.xml:4`) объявляет не-доказательством («a hand-written `ver` line is not evidence»). Держать такой глагол рядом с фазовым — постоянный соблазн для агента и оператора.
2. **`gennady fix` противоречит D-SV022.** `workspace-mutation.ts` построен, чтобы мутации происходили только внутри write-zone фазы. `runFix` (`gate-runner.ts:522-531`) мутирует дерево вообще без guard (`runGate(..., null)`), без Target Files и без инвалидации receipts — то есть после `gennady fix` receipt фазы становится ложным (байты целей поедут), и обнаружится это только при следующей валидации. Пресловутая «единственная дом мутаций» — это ещё и единственная дыра в границе.
3. **`--plan --json` дешевле добавить в `sdd-verify`**, чем содержать `cli/cmd/verify/**` + `cli/cmd/fix/**` + 20 тестов + v1-текст: план уже структура (`PhaseVerificationPlan`), нужен флаг и `JSON.stringify`.
4. **Тест эквивалентности фасадов (митигация R-C1) невыразим строго.** Фасады различаются моделью области (`ScopeRequest{files|changed|all}` против exact Target Files), профилями (RUN-ALL против halting) и таксономией (`skipped` против `missing`). «С точностью до halting/scope» — это и есть та щель, в которую уезжает вторая правда.
5. **Чистый A позволяет удалить v1-корпус целиком** (`ai/directives/sdd/phase-execution-protocol.xml`, `ai/skills/sdd-execute/**`, `verify.sh`), что закрывает третью часть issue #20 удалением, как сам B1 и предлагает.

Итого по варианту: **A′ остаётся разумной рекомендацией**, но Q1 стоит переформулировать: не «оставить оба фасада», а «оставить `gennady verify --plan --json` как read-only планировщик/CI-репортёр, а `gennady fix` — только если он получит ту же `RepairMutationBoundary`, иначе он ломает receipts».

---

## § Parity

Предложено три доказательства (§3.1.3): golden резолвнутых гейтов, поведенческий байт-в-байт (argv-последовательность + stdout + receipt), receipt-совместимость на старом артефакте. **Направление верное, полноты нет.** Что проскочит:

1. **`durationMs` в stdout.** `lineFor` печатает `✅ ${name} (${secs(durationMs)})` (`sdd-verify.types.ts:288-295`, `secs` `:230-232`), `failBlock` — `exit ${exitCode} (ran: ${ranCommand})`. Сравнение «полного stdout-рендера как одной строки» (§3.1.3 п.2b) будет флакать на каждом прогоне. B1 обещает нормализовать «только timestamp'ы» — но **в `PhaseReceipt` timestamp'ов нет вообще** (поля: `schema, planState, targetState, targetEvidence, commands, gateEvidence` + план, `phase-receipt.ts:52-70`). Нормализовать надо `durationMs` в stdout, а receipt как раз можно сравнивать целиком.
2. **Exit-коды не пинятся ничем.** Ни один из трёх тестов не утверждает код процесса. Матрица нужна явно: `(profile × состояние скриптов) → {0,1,4}` — `index.ts:23` (4), `:67` (1), `:96` (`outcome.exitCode`). Введение `env-fail` (V-03) — прямой кандидат сдвинуть код и остаться незамеченным.
3. **Evidence ступени `fix`.** Golden п.1 сериализует план (`command` для `fix` = литерал `'target-repair'`) и потому **физически не может** увидеть дрейф repair-адаптеров. Нужен отдельный golden на `planTargetRepair` + `describeRepairAction`: матрица `lint:fix`-тел × расширений целей × наличия `specPath`, с точными argv (`repair-adapters.ts:99-100,121-131,143-151`).
4. **Порядок `PROJECT_LINTER_ADAPTERS` — first-match** (`repair-adapters.ts:58-77,103-105`), последняя строка `matches: () => true`. Добавление swiftformat/black/gofmt (§3.1.2) обязано вставляться **между** `eslint-project` и catch-all `project-linter`, иначе node-проект, чей `lint:fix` не называет ни `gennady`, ни `eslint`, получит другой адаптер. Тест: «для набора тел `lint:fix` выбранный адаптер = X» + «catch-all остаётся последним».
5. **Матрица golden слишком узка.** §3.1.3 варьирует только 5 профилей на одной фикстуре «восемь кирпичей». Не покрыто: `targets.length === 0` (`commandForGate:258` → `fix` = `null`), отсутствующий `lint:fix`, вакуумный `format:fix`, не-forwarding repair-brick (`isDeclaredArgumentForwardingRepairBrick`), алиас `typecheck`, `test`-фаза не-владелец покрытия. Это ровно те ветки, где пресет легко разойдётся.
6. **`environmentState` доказан только на одной фикстуре.** Тест п.3 подтверждает, что старый receipt валиден при неизменном `package.json` — он не доказывает, что рефакторенная функция даёт тот же хэш на **другой** форме манифеста. Нужен golden значений `environmentState` минимум на: транзитивный `npm run`-хоп, `pre*/post*`-хуки (`:1152-1154`), `start` без записи в scripts при наличии `server.js` (`:1159-1160`), `restart`-fallback (`:1165-1174`), `pnpm`/`yarn` форвардинг (`PACKAGE_MANAGER_BUILTINS:95`), локальные входы `localInputEntries`.
7. **Текст отчёта — контракт директив, а не косметика.** `audit/steps/STEP_1_MECHANICAL.xml:75-76` парсит связку `⛔` + «обязательная ступень профиля»; строки генерируются в `sdd-verify.cmd.ts:519` и `:621` и рендерятся `failBlock:305`. Аналогично `gate-state: …` (`phase-verification-plan.ts:376`) читает `sdd-task`. Нужны тесты на точные подстроки, иначе «улучшение формулировки» тихо сломает маршрутизацию аудита.
8. **«172 теста должны остаться зелёными без правок» — вероятно недостижимо на шаге 4.** Тесты `sdd-verify` гоняются с `--experimental-test-module-mocks`; моки привязаны к путям модулей. Введение `resolvePreset` в `shared/verify/presets/node.ts` меняет граф импортов, и часть моков придётся переадресовать. Формулировку критерия parity-safe надо ослабить до «поведенческие утверждения не меняются», иначе критерий заблокирует сам себя. Плюс: прогон 172 требует `cwd=<rc>` (подтверждено), это надо зафиксировать в задаче, а не в сноске.

Отдельно: **`tailCap`** (120 строк / 16 КБ + дайджест `not ok`, `sdd-verify.types.ts:234-281`) и `GATE_MAX_BUFFER_BYTES` — тоже часть наблюдаемого поведения и тоже ничем не запинены.

---

## § Пресеты python/swift vs потребитель

### Что дизайн переносит, а что теряет

| Поле `GateSpec`/`Gate` | Нужно потребителю | Есть в §3.1.2 (V-03) | Комментарий |
|---|---|---|---|
| `cwd` | да (`swiftlint`) | да | — |
| `argv` (`sh -c …`) | да (все три) | да | RC-раннеры спавнят без shell (`execFile(command,args)`), `sh -c` пройдёт корректно |
| `timeout` | да (10m / 90m ×2) | да | RC сегодня **без timeout вообще** (`sdd-verify.cmd.ts:92-114`) — это новый код |
| `envFail{outputMatches,exitCodeMatches,hint}` | да (8 предикатов) | да | `env-fail.ts` переносится verbatim |
| `requires{argv,hint}` | да (2 гейта) | да | — |
| `fixer{cwd,timeout,argv}` | да (`swiftlint`) | упомянут в переносе типов и в тесте V-07 | **нет потребителя в фазовом пути.** `fix`-ступень идёт через `planTargetRepair`, а не через `Gate.fixer`. Единственный исполнитель `fixer` — `runFix` (`gate-runner.ts:522`), то есть фасад V-16, который стоит последним и вне G1. До V-16 `fixer` — мёртвые данные |
| `outputMeansFailure` | нет | **НЕТ в списке V-03** | обязателен для golang (`gofmt -l` — «exit 0 + stdout = FAIL», `gate-runner.ts:326-332`). Без него V-09 не реализуем |
| `driftMeansFailure` | нет | **НЕТ в списке V-03** | обязателен для `go generate`-drift, который V-09 явно планирует («`generate`-drift только в `full`») |
| `when` (#9) | нужен (90m гейты) | V-12 | см. § Issues |

### Что потребителю нужно, а в дизайне нет

1. **`workspace-mutation` на iOS — не «ложное срабатывание», а стена по времени.** `snapshotWorkspace` (`workspace-mutation.ts:134-169`) обходит **всё** дерево кроме `.git`/`node_modules` и считает `sha256` **содержимого каждого файла** (`:161`), игнорируя `.gitignore`. Конфиг потребителя пишет `build/DerivedData` («порядка 10 ГБ на worktree» — его же комментарий) и `build/xcresult` (70-75 МБ × 2). Boundary вызывается `before` и `after` (`:378-394`), то есть это два полных хэша ~10 ГБ на каждую транзакцию. §3.1.5/V-11 формулируют это как «исключения становятся данными пресета» — правильная, но недостаточная правка: нужен либо `.gitignore`-aware обход, либо lazy-стратегия (mtime+size до содержимого). Это надо поднять из V-11 в отдельное решение.
2. **Мультистек + одна лестница не определены.** v1 считает мультистек нормой (`detectStacks` возвращает массив, `verify.cmd.ts:160-179`). Фазовая лестница имеет **по одной** ступени `fix`/`type-check`/`test`. В репозитории с `package.json` **и** `go.mod` (или с eval-шимом + Swift) неясно, чей пресет даёт `fix`. §3.1.4 и §4.4 п.1 объявляют мультистек «нормальным режимом» и не отвечают. Нужен явный ответ (кандидат: одна «основная» ступень от primary-стека + гейты остальных стеков как read-only-хвост).
3. **`test:coverage` на anystack.** `requiredVerificationGateNames` (`phase-verification-plan.ts:58-64`) — профильная функция без понятия стека, и её выход попадает в `planState` через `profile`/`producesCoverage`. «required пусто для anystack» (V-08) — это правка shared-логики, которую читают `sdd-task`, `phase-context` и валидатор (`phase-receipt-validation.ts:83-91`), а не локальная настройка пресета.
4. **Обрезка вывода меняется молча.** Потребитель в комментариях опирается на 20/40 (`gate-runner.ts:19-21`) и на то, что `--full-output` действует только в `--json`. В RC — `tailCap` 120 строк/16 КБ (`sdd-verify.types.ts:234-239`), а `--full-output` не существует. Формально это улучшение, но конфиг потребителя содержит инструкцию по разбору `.xcresult`, выстроенную под старое поведение; V-08 должен это упомянуть.
5. **Пресеты python/swift сами по себе описаны корректно** (маркеры, ladder, `envFail`-регекспы, coverage-адаптеры) и совпадают с формой `CoverageAdapter`. Но у обоих отсутствует ответ на И-3: «источник тела гейта» для python предложен (`pyproject.toml` секции), для swift — **нет** (в §3.1.4 swift-абзац `environmentState` не упоминает). Учитывая REFUTED #2 (без `package.json` receipt не пишется), swift-пресет без источника fingerprint'а нереализуем в принципе.
6. **Вакуумность на anystack.** §3.1.5 предлагает считать вакуумным `argv` вида `['true']`/`['echo', …]`. Стоит отметить, что node-детектор сознательно узок: комментарий `readiness.ts:322-323` прямо говорит, что `node -e "process.exit(0)"` **не** ловится — и eval-шим этим пользуется. То есть «главный детектор v2» уже обходится штатно, и аргумент «без per-stack вакуумности честность теряется молча» надо подавать мягче.

---

## § Issues

**#9 (`when`) — механизм реализуем там, где сказано.** `GATE_SPEC_KEYS` (`stack-config.ts:34-45`) — литеральный массив, валидация ключ-ориентированная; видимый skip уже существует (`applyStackConfig:544` → `{argv: [], skipped: 'skipGates (…)'}`, печать `gate-runner.ts:430`). Target Files фазы доступны (`phase-context.ts:229-239`). Что ломается в честности:
- отсечённая ступень **не попадает в receipt вообще** (`phase-run.ts:212` фильтрует `status === 'pass'`), то есть факт «гейт не запускался, потому что не пересёкся с целями» не сохраняется как доказательство;
- `verdict` печатает `✅ ALL PASS (${passed.length}/${results.length})` (`sdd-verify.types.ts:365`), то есть массовые `⏭` дадут зелёное `ALL PASS (1/4)`, а `STEP_1_MECHANICAL` эту дробь не парсит. Рекомендация: при `when`-скипе писать причину в `gateEvidence`/receipt и выносить количество скипов в заголовок вердикта.

**#17 (вывод на pass) — реализуем, честность не страдает.** В RC `GateResult.output` уже хранится (`sdd-verify.types.ts:211-212`) и просто не рендерится, поэтому вариант (b) — правка одной ветки `lineFor` (`:288-295`), receipt не меняется → И-2 соблюдён. Подтверждено, что префикс `[gate] ` — реальная строка потребителя (`gennady.yaml`, гейт `unit-tests`, `echo "[gate] сужено: …" >&2`), так что (b) не требует правок конфига. Единственная оговорка: вывод на pass попадает в контекст аудитора и может быть принят за доказательство — рендерить с явной привязкой к имени гейта и **не** класть в receipt.

**#20 (`--only`/glob) — здесь дизайн неверен для фазового пути.** `phaseReceiptCommandIssue` требует `JSON.stringify(ladderNames) === JSON.stringify(required)`, где `required` выводится из `gatePlan` (`phase-receipt-validation.ts:79-96`). Следствия:
- `--only`, отбросивший `CONFIGURED`-ступень, даёт receipt, **который не проходит собственный валидатор** → `sdd-log complete` откажет (`sdd-log.types.ts:284-287`);
- если вместо этого сузить сам `gatePlan`, изменятся `gateEvidence` и (через `environmentState`) `planState` → фаза перестанет соответствовать каноническому плану тикета, то есть ровно та подмена канона, которую запрещает `ax-verification-before-handoff.xml:4`.

Правильная формулировка: `--only/--skip` доступны **только** `gennady verify` и `sdd-verify --profile full` (оба не пишут фазовый receipt), и никогда при `--task/--phase`. V-13 надо переписать с этим ограничением, иначе он вводит регресс честности.

Часть (iii) #20 (`ai/skills/sdd-execute/SKILL.md:98`, `scripts/verify.sh:69-92`) — «закрывается удалением строки» верно, но **удаления никто не владеет**: в §6 нет задачи на снятие v1-корпуса.

---

## § Детект стека

Все несущие утверждения §4 подтверждены:

- `router.directive.xml:294-304` — `LogicSwitch on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"`; стека среди входов нет. Первоисточник `ai/kit/contract/process/readiness-preflight-gate.xml:2-13` — тот же список, дословно.
- `router.directive.xml:390-391` — выбор `infra.directive.xml` по `scope-type = infrastructure` (портал), не по репозиторию. `shared/sdd/portal.ts:12-23` — `Scope{name,type,status,description,specPath}`, поля «стек» нет.
- `sdd-state`: `gatherReadinessInput` → `checkReadiness` (`sdd-state.cmd.ts:152-155`), печать `sdd-state.types.ts:105-148` — строки `STACK=`/`STACK_SOURCE=` отсутствуют.
- `ai/directives/coding/` в RC: `README.md, svelte5-runes.xml, sveltekit-rules.xml, typescript-rules.xml, uikit-*` — `baseline-rules.xml`, `go-rules.xml`, `python-rules.xml` **физически отсутствуют**; в MAIN присутствуют.

Три поправки:

1. **Состав `knowledge.xml` в RC описан неверно** (см. REFUTED #3): там 14 правил, а не 3.
2. **Список переноса неполон — и это блокер.** `MAIN ai/directives/coding/go-rules.xml:8-11` и `python-rules.xml:7-10` объявляют `<DependsOn>` на **два** файла: `ai/directives/coding/baseline-rules.xml` **и `ai/directives/testing/baseline-testing.xml`**. Второго в RC нет (`ls RC ai/directives/testing/` — `baseline-testing.xml` отсутствует, в MAIN есть), и он не назван ни в §3.1.1, ни в §3.1.7, ни в V-15. В RC работает проверка `RULES_CASCADE_CLOSURE` (`shared/sdd/rules-cascade.ts`, тест `shared/sdd/__tests__/rules-cascade.test.ts`, парсер `parseRuleDependsOn` по bullet-списку `<DependsOn>`), поэтому перенос go/python-rules без `baseline-testing.xml` + его записи в реестре (MAIN `knowledge.xml:129`) **уронит closure-проверку**.
3. **Каскад правил не нуждается в `STACK=`.** `<Triggers>` у `python-rules`/`go-rules` — по расширениям Target Files («Target Files include .py source files», `knowledge.xml:88,98`), а не по имени инструмента и не по стеку. То есть п.7 §4.4 связывает каскад с детектором сильнее, чем требуется: достаточно перенести файлы и записи реестра, и каскад заработает без всякого `STACK=`. Это упрощает V-15 и снимает его зависимость от V-05.

Инвариант «`sdd-state`, `sdd-task`, `sdd-verify` видят один `StackDetection`» — правильный и стоит теста. Добавить к нему: **один и тот же источник `environmentState`** (иначе воспроизведётся класс «фаза резолвит одно, receipt валидируется по другому», о котором B1 сам предупреждает).

---

## § Задачи

### Ошибки зависимостей и порядка

1. **Нет задачи на per-preset `environmentState` — и от неё зависят V-08/V-11.** Файлы `shared/sdd/phase-receipt.ts:1127-1200` (`phaseVerificationEnvironmentFromScripts`), `:1203-1233` (`phaseVerificationEnvironmentState`), `:1242-1254` (`…PlanEnvironmentState`) не названы ни в одной из V-01..V-16. При этом отсутствие `package.json` = отказ записать receipt (REFUTED #2). Значит V-08 (anystack), V-10 (python), V-11 (swift) в текущем виде **не могут завершиться**: гейты пройдут, receipt не запишется. Нужна новая задача **V-04a «источник fingerprint'а как обязанность пресета»** (size M, зависит от V-04, блокирует V-08/V-10/V-11) с тестом «node-`environmentState` байт-идентичен до/после» на матрице из § Parity п.6.
2. **V-06 обещает «снять eval-шим», но шим — это и есть `package.json`.** Удаление `roundtrip-readiness-shim.package.json` без V-04a лишает cloud-ios receipt'ов. Зависимость V-06 → V-04a обязательна.
3. **V-13 в текущей формулировке нарушает И-2** (см. § Issues). Переписать: `--only/--skip` только для не-receipt путей.
4. **V-15 последний, но содержит Decision Log.** Собственный флоу проекта требует решения вместе с изменением (в RC есть проверки `check-dl-ids`, `spec-schema`, `check-trackers`). D-SV записи на статусы (V-03), пресеты (V-04), `when` (V-12), `--only` (V-13), output-on-pass (V-14) должны идти **внутри** этих задач, а в V-15 остаться только текст директив/`.hbs`.
5. **V-15 теряет зависимость от V-05** (см. § Детект стека п.3) — можно распараллелить.

### Пропущенные задачи

| Пропуск | Почему нужен |
|---|---|
| **`plugins/` не входит в `TEST_ROOTS`** | `scripts/test-topology.ts:19` — `TEST_ROOTS = ['ai','cli','services','shared']`; `UNIT_ROOTS` (`:38-45`) тоже без `plugins/`. `npm run test` в RC — это `node --import tsx scripts/test-topology.ts deterministic` с дискаверингом по этим корням. Значит перенесённые в V-02 `plugins/{node,golang}/__tests__` (~60 тестов) **никогда не запустятся** и «зелёно» будет ложным. V-02 обязан править `scripts/test-topology.ts` |
| **`ai/directives/testing/baseline-testing.xml` + запись `baseline-testing` в `knowledge.xml`** | жёсткий `<DependsOn>` у go/python-rules; без него падает `RULES_CASCADE_CLOSURE` (см. § Детект стека п.2) |
| **`tsconfig.json` RC: алиас `gennady/stack`** | `plugins/index.ts:5` импортирует `'gennady/stack'`, в MAIN это `tsconfig.json:35 → ./services/stack/plugin-api.ts`. V-02 «перенести as-is» без этого не собирается |
| **Снятие/обновление v1-корпуса** | `ai/directives/sdd/phase-execution-protocol.xml:90,319`, `ai/skills/sdd-execute/SKILL.md:98`, `ai/skills/sdd-execute/scripts/verify.sh:69-203` — при решении «v2 заменяет v1» их кто-то должен удалить; это же закрывает часть (iii) issue #20. Ни одна V-задача их не называет |
| **Lock/одновременность на фазовом пути** | `tree-guard` lock (`.git/gennady-verify.lock`) переносится в V-02, но никем не подключается. В RC локов нет вовсе, а `workspace-mutation` при двух параллельных `sdd-verify` в одном worktree даст взаимные ложные «мутации вне write-zone». Нужна либо задача, либо явное решение «фазовый прогон single-flight по протоколу» |
| **`sdd-state.types.ts:105-148` в V-06** | V-06 меняет readiness-текст и правит `.hbs`, но не называет файл, который печатает `[READINESS]`-таблицу (`package.json`, `lint→gennady`, `check→read-only`, `gennady-installed`) — а её и парсит `readiness.directive` |
| **`check:directives-fresh` в V-06** | V-06 правит `readiness.directive.hbs` и `ax-verification-before-handoff.xml`; без прогона `npm run check:directives-fresh` (`package.json:43`) собранные XML останутся устаревшими. В V-15 проверка есть, в V-06 — нет |
| **`--wip` в v2** | DL-13 объявляет `--wip` нужным только clean-caller'у, но ни одна задача не фиксирует, что фазовый вызов флага не имеет, и ни одна не переносит `--wip` в фасад. Это открытый конец в V-16 |

### Что в §6 верно

- Цепочка V-01 → V-02 → V-03 → V-04 как parity-ядро — корректна и в правильном порядке (тесты до правок).
- Независимость V-09/V-10/V-11 после V-05 — корректна (плагины не пересекаются по файлам), кроме общей зависимости от V-04a.
- V-07/V-08 как разблокировка cloud-ios и eval-фикстуры — корректно, и это действительно самый ценный ранний результат (снимает wall 3).
- `check:directives-fresh` в V-15 — есть. `specs/cli/sdd-verify/sdd-verify.spec.md` — есть. Миграция `stack:` у потребителя не нужна (ключ сохраняется) — верно, и это правильное решение.
- Размеры (S/M/L) выглядят реалистично, кроме V-02 (S → M из-за `tsconfig`+`TEST_ROOTS`+перезапись импортов в ~60 тестах) и V-11 (L остаётся L, но добавляется вопрос производительности снимка).

---

## § Правки к B1

Минимально необходимые, по убыванию важности:

1. **§0 п.3 и §3.0 И-1 переписать.** Персистентный контракт — не `ranCommand`, а `PhaseVerificationGatePlan.command` (`phase-verification-plan.ts:252-271`), который сверяется через `gateEvidence` (`phase-receipt-validation.ts:97-106`) и питает корни `environmentState` (`phase-receipt.ts:1250`). `ranCommand` в receipt пишется, но не валидируется; для ступени `fix` он вообще равен `describeRepairAction`-строкам (`sdd-verify.cmd.ts:313`, `repair-adapters.ts:163-166`). Соответственно риск в §3.1.2 для `sdd-verify.cmd.ts:145-240` понизить до среднего, а для `phase-verification-plan.ts:253-272` — поднять до высокого.
2. **§3.0 И-3 и §4.2 дополнить.** Добавить `phase-receipt.ts:1127-1200` и `:1203-1233` как отдельные node-узлы; заменить «`environmentState` схлопнется до §5-команд» на «без `package.json` receipt не пишется вовсе (`ERR_CLI_SDD_VERIFY_RECEIPT`)»; перечислить, что fingerprint покрывает `pre*/post*`-хуки, неявный `start`, `restart`-fallback и `localInputEntries`.
3. **§3.0 И-2 дополнить** двумя пунктами: (а) состав и **порядок** ступеней плана сравниваются точным JSON-равенством (`:95`), (б) `receipt.commands` содержит только `pass`-ступени, поэтому «видимый skip» в доказательство не попадает.
4. **§6: добавить V-04a** (per-preset `environmentState`) и провести зависимости V-06/V-08/V-10/V-11 → V-04a.
5. **§6 V-02: добавить** правку `scripts/test-topology.ts` (`TEST_ROOTS`/`UNIT_ROOTS` += `plugins`) и `tsconfig.json` (алиас `gennady/stack`); поднять size до M.
6. **§3.1.7 / §4.4 п.7 / V-15: добавить** `ai/directives/testing/baseline-testing.xml` + запись `baseline-testing` в `knowledge.xml`; исправить утверждение о составе `knowledge.xml` RC (14 правил); снять зависимость каскада от `STACK=` (триггеры по расширениям).
7. **§3.1.2 / V-03: добавить в список полей** `outputMeansFailure` и `driftMeansFailure` — без них V-09 (golang: `gofmt -l`, `go generate` drift) не реализуем.
8. **§3.1.6 / V-13 переписать #20**: `--only/--skip` запрещены при `--task/--phase`, разрешены только там, где receipt не пишется.
9. **§3.2.2 ослабить два ряда**: «sync `spawnSync` ломает параллельность» → «лишает параллельности хвоста `full`»; «разрешить мутирующую ступень / снять `reset`» → «уже доступно через `wip`-режим guard-пула (`gate-runner.ts:356`, `tree-guard.ts:223-228,264`)». Добавить в колонку «за B» обязательный per-gate timeout + `SIGKILL` + `requires`, которых в RC нет вовсе.
10. **§3.1.3 дополнить** тестами из § Parity: нормализация `durationMs` (а не «timestamp'ов» — их в receipt нет), матрица exit-кодов, golden на `planTargetRepair`/`describeRepairAction`, порядок `PROJECT_LINTER_ADAPTERS`, расширенная матрица форм скриптов, golden `environmentState`, тесты на подстроки `⛔` + «обязательная ступень профиля» и `gate-state:`. Ослабить критерий «172 теста без правок» до «без правок поведенческих утверждений» (module-mocks привязаны к путям).
11. **§3.1.5 / V-11 усилить**: `snapshotWorkspace` (`workspace-mutation.ts:134-169`) хэширует содержимое всех файлов вне `.git`/`node_modules`, игнорируя `.gitignore`, дважды за транзакцию — для cloud-ios это ~10 ГБ `build/DerivedData` × 2. Нужна не только таблица исключений, но и решение о стратегии обхода.
12. **§3.1.4 дополнить**: (а) источник `environmentState` для swift не указан — указать; (б) ответить, чей пресет владеет ступенями `fix`/`type-check`/`test` при мультистеке (сегодня в v1 мультистек — норма, в фазовой лестнице места на два стека нет).
13. **§3.7 Q1 переформулировать** (см. конец § Аргумент против B): `gennady fix` без `RepairMutationBoundary` делает receipt фазы ложным (`runFix` → `runGate(..., null)`, `gate-runner.ts:522-531`); фасад `gennady verify --wip` даёт зелёное без receipt. Добавить вариант (e): только read-only фасад `verify --plan --json`, мутации — через фазовый `fix`-rung.
14. **Мелочи:** исправить 19 строк из § Цитаты (WRONG-LINE); `§1` ссылку `ladder.ts:65` → `:68`; `§1.1` уточнить, что у `unit-tests` два `envFail`, а не «`envFail`»; отметить, что MAIN-прогоны (198/198, `--plan --json`) в этой сессии не воспроизводились, но §5.5 доказывается статически.



