# 64 — Единая система Verify, preset-плагины, remote execution и динамические правила

> Статус: **ACK U0 ПРИНЯТ 2026-09-24; UV-24 DONE #99; UV-25 #101 — HISTORICAL DONE; MAIN CUTOVER BLOCKED**.
> U8-MC policy approved, UV-27A/B implemented; после reviewed #106 нужны MAIN carry R1…R4,
> reviewed history reconciliation R5 и final UV-25 refresh. Real UV-26/E-18 и exact candidate ACK pending; npm
> publication вынесена в отдельный будущий plan/ACK и запрещена в текущем deliverable. Основание:
> операторский разговор
> 2026-09-24 после завершения самомиграции SDD v2. Этот документ **замещает** старые открытые
> развилки O-1/O-2 и design-tail plugin↔preset convergence, но не переписывает исторические
> отчёты 30/33. Публикация запрещена во всём текущем deliverable; future publication требует отдельного post-cutover plan/ACK.
>
> Current audit baseline: `codex/sdd-v2-rc52-followup@df39f8eff9d08caca5e3d90d313479cc50ed4fc0` (#106 merged).
> Plan refinement base: `sdd-v2-audit-migration-3b23b1@d5cb9174069afd80ad2b9d80a89f0c6a80dbbfcb`.
>
> **Amendment 2026-09-25:** workflow SDD phase kind и Verify phase selector разведены как две
> открытые vocabulary. Built-in preset даёт zero-YAML default mapping между ними, project YAML
> overlays/overrides его с provenance. Operator ACK по Evidence/Receipt (§12.1) принят; UV-13
> остаётся заблокирован до реализации и review UV-22C, embedded-rules chain и UV-12E. Этот amendment фиксирует
> выбранный evidence contract, но не притворяется его реализацией и не разрешает ранний cutover.
>
> **Task/Rules/Verify ACK 2026-09-26:** standalone Verify остаётся universal и SDD-agnostic;
> существующий `sdd-verify --task … --phase …` становится thin facade над тем же engine и владеет
> SDD state/sinks. Rules metadata embedded в prompt header и читается custom lexical parser-ом, не
> XML parser-ом и не sidecar. RuleRegistry + PhaseFacts + RuleResolver + pre-dispatch RuleSnapshot
> integration теперь обязательны до UV-12E/UV-13.
>
> **Release-risk amendment 2026-10-05:** прежняя формулировка «после UV-25 остаётся только UV-26»
> отменена. Review после merge #101 доказал, что документный stop не является executable release
> barrier: supported local publish paths не связаны с UV-26 evidence и exact operator ACK. Поэтому
> перед UV-26 вводится UV-27: сначала ACK этого плана, затем одна shared fail-closed release-
> authorization SSOT в release-ветке. Только после неё идут exact E-18, при необходимости refresh
> UV-25, immutable candidate, exact operator ACK и отдельное действие публикации.
>
> **Main-cutover amendment 2026-10-05:** merged #102 сохраняется как история принятого proposal, но
> его tarball/publication ACK semantics отменены последующим решением оператора. Current deliverable —
> один обычный replacement-tree PR #25 (`codex/sdd-v2-rc52-followup` → `main`), не npm release.
> UV-27 теперь означает fail-closed main-cutover authorization, V1 eradication audit и полный запрет
> publication через supported repo-owned paths при недоступных registry credentials/OTP/authority.
> Future npm publication требует нового отдельного design/ACK после cutover.

## 1. Решённая цель

Остаётся один публичный движок:

```text
gennady verify --phase <selector>
```

У правил есть отдельная **read-only справочная поверхность**, но не второй resolver:

```text
gennady rules list [--stack <id>] [--phase <phase>]
gennady rules show <rule-id>
gennady rules resolve --phase <phase> (--files <glob...> | --changed-from <ref> | --task <ticket>)
                      [--format text|json]
```

`rules list/show` отвечают «что доступно», а `rules resolve` — «что выбрано для этого контекста и
почему». Последний вызывает ровно тот же `RuleResolver`, что и `verify`, и возвращает тот же digest
snapshot. Он не запускает Verify steps, не меняет рабочее дерево и не записывает SDD receipt.

Он обязан:

1. детектировать все применимые стеки;
2. загрузить встроенные preset-DAG этих стеков;
3. наложить минимальные project overrides;
4. собрать динамический набор правил из phase/task/Target Files/стеков;
5. проверить readiness только выбранного среза;
6. выполнить локальные observe/repair/drift шаги и удалённые async/watch шаги;
7. повторить только проверки, инвалидированные автоматическими repair;
8. вернуть один typed report: readiness, verdict, mutations, evidence, selected rules;
9. не читать и не писать SDD task/EXECUTION_LOG metadata.

SDD владеет отдельная thin facade с фактической существующей surface:

```text
gennady sdd-verify --task <ticket> --phase <P>
```

Она строит exact phase scope/facts, замораживает rules, вызывает **тот же** Verify engine один раз и
передаёт тот же report в SDD-owned journal/optional legacy receipt sink. Это не второй planner/runner.

`--phase` принимает произвольный объявленный preset/YAML-owned selector id. Core не выводит
pipeline из имени `code`, `test`, `full` или любого другого токена. Workflow SDD phase kind —
отдельная открытая vocabulary; composed mapping `preset default → project override` переводит kind
в selector до вызова Verify.

`sdd-verify` перестаёт быть вторым движком. После переходного периода сохраняется thin SDD facade,
а отдельная лестница удаляется. Отдельной публичной команды `gennady fix` не будет: разрешённые ремонты — шаги
того же фазового прогона. Byte-parity legacy receipt не является универсальным default: она
обязательна только для явно включённого legacy overlay с видимым provenance.

## 2. Целевой поток

```text
Standalone VerifyRequest
  root + selector + scope/files + HEAD/VCS
        │
        ▼
VerificationContext
        ├─ provider detection from PhaseFacts/project facts
        ├─ project capabilities
        ├─ rule resolution
        └─ VCS identity
        │
        ▼
Preset composition
  built-in DAGs → detected facts → project override → personal override
        │
        ▼
Readiness
  READY | DEGRADED | BLOCKED (per phase, per stack, actionable fixes)
        │
        ▼
Selected DAG slice
  local-observe | local-repair | drift-signal | remote-watch
        │
        ▼
VerifyRunReport
  verdict + step results + changed files/diff + evidence + rules snapshot
        └─ text/json reporter (no SDD persistence)

SDD dispatch
  task + SDD phase → PhaseFacts → frozen RuleSnapshot → composed selector
        │
        └─ thin sdd-verify facade → same Verify engine/report → SDD journal/receipt sinks
```

## 3. Целевые сущности

| Сейчас | Цель | Миграция |
|---|---|---|
| `Gate` | `VerifyStep` | добавить `tags`, `needs`, `effect`, `executor`, `writes`, `invalidates`, `onFailure` |
| `GateSpec` | `VerifyStepOverride` | config больше не описывает pipeline с нуля; только меняет встроенный preset или добавляет шаг |
| `Cmd` | `LocalCommand` | сохранить argv без shell, cwd/env/timeout |
| `fixer` | `effect: repair` | repair становится штатной частью одного прогона |
| `driftMeansFailure` | `effect: drift-signal` | явный контракт codegen/генераторов |
| `StackPlugin` | `StackPlugin` + `VerifyPreset` | plugin детектирует и поставляет готовый DAG/readiness/rules |
| closed `StackId` union | runtime `PluginId` | убрать закрытый набор языков из core |
| `PhaseVerificationPlan` | `PhaseSelector` | opaque declared id выбирает теги общего DAG, не копирует команды и не получает semantics от имени |
| глобальная Node-readiness | `CapabilityMatrix` | readiness по выбранной фазе и стеку |
| `tree-guard` + `workspace-mutation` | `WorkspaceGuard` | единый checkpoint, write zones, diff и cleanup |
| `GateResult` | `VerifyStepResult` | одна таксономия локальных и remote результатов |
| `VerifyReport` | `VerifyRunReport` | readiness + plan + results + mutations + evidence |
| `vcs-pipeline` | `RemoteExecutor` + CLI facade | один watcher для standalone CLI и verify |
| `knowledge.xml` | embedded prompt `<Meta>` headers | центральный реестр удаляется после entry-by-entry metadata/equivalence migration |
| `rules-cascade` | `RuleResolver` | динамический snapshot правил под фазу/задачу |

### 3.1 `VerifyStep`

```ts
type VerifyStep = {
  id: string;
  plugin: string;
  tags: string[];
  needs: string[];
  executor: 'local' | 'vcs-pipeline' | 'remote-job';
  effect: 'observe' | 'repair' | 'drift-signal' | 'remote-watch';
  command?: LocalCommand;
  requires: Requirement[];
  writes?: WriteBoundary;
  invalidates?: string[];
  timeoutMs: number;
  onFailure: 'stop-phase' | 'block-dependents' | 'continue';
};
```

Статусы шага: `pass | fail | env-fail | timeout | violation | skipped | waived | cancelled`.
`pending/running` допустимы только как промежуточные состояния async executor, но не как финальный
успех. Финальный run verdict: `pass | fail | blocked | env-fail | timeout | violation`.

## 4. Pipeline, workflow kinds и Verify selectors

Preset описывает gates/steps один раз. Verify phase selector выбирает seed-узлы по tags/selectors,
а planner добавляет transitive `needs`; отдельная command ladder на фазу запрещена. Selector id —
произвольная непустая строка, объявленная preset или project YAML. Следующий пример — built-in
набор одного preset, а не закрытая vocabulary и не hardcoded semantics имён:

```yaml
verify:
  phases:
    code:        { include: [code] }
    unit:        { include: [code, unit] }
    integration: { include: [code, unit, integration] }
    coverage:    { include: [code, unit, coverage] }
    full:        { include: [code, unit, integration, coverage] }
    ci:          { include: [remote-ci] }
```

Проект может объявить `ui`, `device`, `deploy`, `acceptance` и любые другие selectors. Ни один
selector не означает «выполнить весь configured pipeline» только из-за имени: он всегда выбирает
объяснимый DAG-срез через declared tags/selectors + dependency closure.

Единственное default-entry исключение: CLI-поверхность, которая явно разрешает опустить `--phase`,
выбирает объявленный compatibility default selector `full`. Это свойство конкретного entrypoint,
а не вывод semantics из строки `full` и не правило для других selector names.

Workflow SDD phase kind (`implementation`, `migration`, `verification`, project-specific values и
т. п.) живёт в другой open vocabulary. Каждый built-in preset обязан дать zero-YAML default
mapping `SDD kind → Verify selector`; project YAML overlays/overrides этот mapping с per-key
provenance. `sdd-task` обязан разрешить composed mapping и выдать агенту ровно одну точную команду
существующей facade `gennady sdd-verify --task <ticket> --phase <P>`. Facade повторно доказывает
composed selector/scope и вызывает universal engine с `<resolved-selector>`. Агент не выбирает
individual gates/steps и не собирает несколько Verify invocations вручную. Mapping fail-closed до
spawn только если kind остаётся unresolved после composition; diagnostic показывает preset source
и actionable project override path. Standalone `gennady verify` не принимает task flags.

Fail policy задаётся шагом. Foundation (`type-check`, build, required test) обычно `stop-phase`;
независимый quality-tail может `continue`, чтобы вернуть несколько дешёвых findings одним отчётом.

## 5. Встроенные presets и минимальный setup

### 5.1 Node

Node становится обычным `StackPlugin`, а не special case. Marker — `package.json`; package manager
детектируется по lockfile/`packageManager`.

```text
type-check
→ lint-fix
→ gennady-lint
→ format-fix
→ selective recheck
→ unit
→ integration
→ coverage
```

Zero-YAML контракт: проект предоставляет стандартные scripts, когда соответствующая фаза нужна:
`type-check`, `lint`, `lint:fix`, `format`, `format:fix`, `test`, `test:coverage`,
`test:integration`. Umbrella `fix` больше не нужен core: порядок ремонтов задаёт preset.

Отсутствующий `test:integration` не блокирует `code`/`unit`, но блокирует вызванную
`integration`. Readiness печатает точный fragment для `package.json` или путь override.

### 5.2 Go

Сохраняются существующие detection/scope/tool-resolution primitives.

```text
build → vet → golangci-lint --fix → gofmt -w
      → selective build/vet recheck → go test → integration → coverage
```

`go generate` по умолчанию `drift-signal`: автоматически материализовать результат можно только
после объявления допустимой `writes` boundary. Missing `go`/`gofmt`/required linter — `BLOCKED` с
версионированной install instruction, не тихий skip.

### 5.3 Swift

SwiftPM (`Package.swift`) работает без YAML:

```text
swift build → swiftformat/swiftlint repair → selective build recheck
            → swift test → coverage
```

Для Xcode/Tuist plugin не угадывает workspace/scheme/test plan/destination. Проект задаёт только
идентичность:

```yaml
stack:
  swift:
    xcode:
      workspace: Cloud.xcworkspace
      scheme: Cloud
      destination: platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2
      testPlan: Cloud
```

Preset сам строит `xcodebuild`, result bundle, `xccov`, freshness и coverage checks. Xcode/Tuist
credentials/runtime относятся к readiness/environment, а не к дефектам кода.

### 5.4 Anystack и расширение

`anystack` — пустой declarative preset для неизвестного стека. Built-in plugins покрывают Node,
Go и Swift. Project-defined steps/phases дают расширение без исполняемого внешнего плагина.
UV-23 окончательно фиксирует data-only boundary: built-in plugins остаются bundled trusted code,
а project/npm/URL executable plugin declaration и dynamic import запрещены и fail closed до import
или spawn. Произвольная CLI-команда допустима только как полное declarative step data, после strict
materialization в общий plan и только через общий executor (`shell:false`, readiness, timeout,
WorkspaceGuard/write boundaries, bounded evidence). Отдельного plugin runtime нет.

### 5.5 Multistack

D-64 в части «primary blocking, остальные non-blocking tail» замещается scope-aware моделью:

- подключаются все реально обнаруженные presets;
- блокируют все стеки, файлы которых попали в выбранный scope;
- informational/non-blocking режим объявляется проектом явно;
- step ids квалифицируются: `node:type-check`, `golang:vet`;
- `stack.use` только фильтрует/упорядочивает detection, но не назначает отсутствующий стек.

## 6. Config overlay

`stack:` остаётся детекторной/стек-специфичной конфигурацией. Поведение pipeline живёт в `verify:`:

```yaml
verify:
  presets:
    node:
      steps:
        type-check:
          command: { npmScript: check:types }
        browser-e2e:
          tags: [integration]
          needs: [unit]
          command: { npmScript: test:e2e }
          timeout: 20m
        coverage:
          enabled: false
          reason: handled by remote CI
```

Порядок merge и provenance сохраняются:

1. built-in preset;
2. detected project facts;
3. `gennady.yaml`;
4. project `.gennadyrc`;
5. personal `.gennadyrc`;
6. CLI выбирает phase/scope, но не создаёт скрытый pipeline.

Старые `skipGates/overrideGates/extraGates` принимаются только временным migration adapter. Legacy
byte-parity включается только этим explicit overlay и сохраняет provenance источника; отсутствие
overlay не навязывает новому preset старые имена, порядок или receipt bytes. До релизного evidence
все потребители переводятся на новую schema, adapter удаляется.

## 7. Readiness

Readiness считается до запуска только для selected slice и выдаёт инструкции агенту:

```text
STACKS: node, golang

code         READY
unit         READY
integration  BLOCKED
coverage     DEGRADED
ci           BLOCKED

Missing:
  node:browser-e2e — add package.json script "test:e2e"
  remote-ci — GitLab detected, credentials unavailable
```

Каждый preset поставляет requirements, probes, supported versions, install/config hints и
required/optional classification. Verify ничего не устанавливает молча. Explicit disable обязательного
шага виден как `WAIVED/DEGRADED`, а не превращается в обычный pass.

## 8. Repair и рабочее дерево

Один run:

```text
checkpoint → observe → repair → mutation diff → invalidation → selective recheck → verdict
```

Инварианты:

- repair имеет `writes` boundary;
- неожиданный файл = `VIOLATION`;
- после repair обязательна повторная проверка инвалидированных шагов;
- легитимный repair продвигает checkpoint;
- число repair passes ограничено; повторная нестабильная мутация = `NON_CONVERGENT`/`violation`;
- ignored outputs учитываются явно, не скрывают drift tracked files;
- shared stash не используется;
- инструмент не теряет пользовательские/агентские dirty changes;
- report перечисляет changed files и объясняет источник каждой мутации.

Объединяются лучшие свойства текущих `tree-guard.ts` и `workspace-mutation.ts`: lock/crash recovery
и точная write-zone атрибуция. `reset --hard` не является универсальным rollback для dirty agent tree.

## 9. Remote executor

`phase=ci` не повторяет локальные тесты. Он проверяет именно опубликованный commit:

```text
resolve HEAD SHA
→ prove SHA is pushed
→ locate pipeline for exact SHA
→ poll terminal state
→ collect jobs and failed logs
→ emit evidence and verdict
```

Общий async executor должен поддерживать `start?`, `poll`, `cancel?`, `collectEvidence`, timeout и
provider-specific terminal states. Первый поставляемый adapter — GitLab; GitHub следует после
provider-contract tests.

Каноническая remote taxonomy не сводит любой non-success к `failed`:

```text
REMOTE_PENDING
REMOTE_NOT_FOUND_YET
REMOTE_SUCCESS
REMOTE_FAILED
REMOTE_CANCELED
REMOTE_MANUAL
REMOTE_SKIPPED
REMOTE_TIMED_OUT
REMOTE_UNAVAILABLE
REMOTE_UNAUTHORIZED
REMOTE_RATE_LIMITED
REMOTE_SHA_MISMATCH
```

`manual`/`skipped` разрешаются policy шага как `waived`, `blocked` или `failed`; implicit exit-0
запрещён. Provider status нормализуется отдельно от raw provider value, которое остаётся evidence.

Незавершённая работа в `/Users/k.lebedev/Developer/gennady` — обязательный источник для переноса,
но не готовый commit. Переносятся после отдельной проверки:

- pipeline polling/watch и terminal-state handling;
- exact pipeline identity (provider + project + ref + SHA/pipeline id);
- jobs/list/status и failed-log collection;
- сохранение полного raw log во временный файл с уникальным каталогом;
- фильтрация только для presentation, raw evidence не теряется;
- typed pipeline summary и provider capability boundary;
- unit/provider tests с последовательностью состояний, timeout и API failure.

Read-only аудит 2026-09-24 классифицировал конкретный source diff:

| Источник dirty checkout | Что переносится | Обязательная переработка/проверка |
|---|---|---|
| `services/vcs-client/abstract/vcs-client-pipeline.ts` | provider port `getPipelines`, `getPipelineJobs`, `getJobLog` | GitLab/GitHub contract; unsupported provider = readiness `BLOCKED` |
| `services/vcs-client/entities/vcs-pipeline-summary.type.ts` | компактная pipeline identity (id/iid/SHA/ref/status/timestamps/title) | полный SHA; unknown metadata = `undefined`, не пустая строка |
| `services/vcs-client/gitlab/vcs-gitlab-pipeline.ts` | pipeline listing, jobs конкретного pipeline, gid→numeric id | pagination; recorded/live contract; exact SHA assertion |
| `vcs-pipeline.cmd.ts` (`sleep` DI, watch loop) | fake-clock-friendly polling и progress только при transition | pin immutable pipeline id; AbortSignal; retry/backoff/rate-limit tests |
| `cli/cmd/_shared/log-filter.ts` | pure bounded log evidence reducer | ANSI/CR/section fixtures + redaction/secret-leak proof |
| существующие VCS tests | ref/MR, metadata, jobs, logs, state transitions | переписать вокруг unified report, а не CLI stdout |

Новый watcher обязан: доказать pushed HEAD → искать pipeline с exact SHA → закрепить immutable
pipeline id → дальше poll-ить только этот id. Текущая идея «каждый раз взять latest» запрещена:
она может перескочить на чужой commit.

Из dirty source **не переносятся**:

- дублирующиеся строки/объявления в `vcs-pipeline.cmd.ts` (в черновике есть compile error);
- предположение, что GraphQL уже вернул newest-first без явной проверки;
- фильтр «failed = любой non-success»;
- сырой trace в receipt: в receipt идёт redacted bounded excerpt + immutable log identity;
- session-context-recover, discussions fixes, `out/` и help-текст — они вне Verify/Rules scope.

Не переносятся вслепую несвязанные изменения session recovery, inbox discussions и документации.
Перед портированием фиксируется source diff manifest; реализация переписывается поверх текущего
release API, а не cherry-pick-ится из старой ветки.

Автоматический rollback пользовательской ветки при красном CI в базовый контракт **не входит**.
Сначала поставляется read-only exact-SHA watcher. Любая remote mutation/rollback требует отдельного
операторского решения с ownership, force-push policy и recovery proof.

## 10. Динамические правила без `knowledge.xml`

Metadata embedded в самом rule prompt file; sidecar YAML запрещён. Prompt **не XML-документ** и
никогда не передаётся XML parser/validator. Custom lexical header parser читает только:

1. первый literal root tag с обязательными quoted attributes `rule-id`, `rule-schema`, `type`, `ver`;
2. ровно один strict `<Meta>` block непосредственно в header;
3. matching final literal root close в конце файла.

Внутри `Meta` разрешены только self-closing predicates:

```text
<When language="typescript" role="source"/>
<When framework="vitest" role="test"/>
<Unless operation="generated"/>
<DependsOn rule="baseline-coding"/>
```

Несколько `When` — OR; attributes внутри одного `When` — AND; comma-values одного attribute — OR;
любой matching `Unless` veto-ит rule. `DependsOn` образует deterministic dependency closure. Vocab
predicate attributes открытый; initial supported set: `language`, `role`, `framework`, `pattern`,
`operation`, `intent`, `platform`, `tool`. Имена — lowercase ASCII tokens. Quoted values декодируют
только `&quot;`, `&apos;`, `&amp;`, `&lt;`, `&gt;`; outer whitespace trim, comma lists trim/dedupe/sort.
Empty members, duplicate attributes, unknown entities/control chars, unknown/malformed metadata,
лишний Meta или mismatched root fail closed. Всё между header и final close — opaque arbitrary
markdown/HTML-like prompt body; parser не нормализует и не экранирует его.

`PhaseFacts` — open-vocabulary immutable input: exact target/planned files; artifacts with
language/role/framework; operations; intents; platform/tool/project facts. Selection происходит по
artifacts каждой фазы, не primary stack. Rules layered отдельно: TypeScript core, strict production,
test-light/testing/framework rules. Vitest test artifact исключает strict production TS, но получает
TS core + testing + Vitest. Mixed TS+Go+CSS/Bash phase получает union применимых rules.

Project/phase explicit add/skip всегда несёт provenance + непустую reason; skip required dependency
fail closed. Resolver выдаёт immutable `RuleSnapshot`: required/suggested/skipped с reasons,
dependencies, provenance, exact prompt bodies и digest. Snapshot замораживается **до agent work** в
SDD dispatch, exact bodies передаются агенту, а тот же digest проходит в Verify report и SDD sink;
любой registry/facts/override drift делает phase evidence stale.

`PhaseFacts` порождает два независимых продукта: `RuleResolver` instruction snapshot и
`VerifyPlanner` executable provider selection. Rule files не являются command registry. Providers
имеют собственные DAG/default selectors; один selector может выбрать разные slices per provider.
Node/Go/Swift zero-YAML сохраняется; project YAML extends/overrides per provider и может добавить
config-only language/tool steps. Exact affected providers выбираются facts/scope, все блокируют;
missing required provider видим как BLOCKED, без primary-stack tail.

### 10.1 Справочник как CLI-инструмент

`gennady rules` — публичная проекция `RuleRegistry + RuleResolver`, а не статический help-файл и не
копия логики Verify:

- `list` выводит inventory с id, source, embedded predicates/dependencies и availability;
- `show` печатает metadata и prompt-body одного правила вместе с provenance/dependencies;
- `resolve` требует объяснимый scope: явные files, diff от ref или SDD ticket. Если scope нельзя
  вывести однозначно, команда fail-closed просит один из этих входов, а не выбирает весь registry;
- text-вывод ориентирован на агента/оператора; JSON стабилен и содержит `selected.required`,
  `selected.suggested`, `skipped`, причины, dependency closure, provenance и snapshot digest;
- `gennady verify --plan` встраивает этот же rules snapshot в план. Равные входы обязаны давать
  равный digest у `rules resolve`, `verify --plan` и фактического `VerifyRunReport`;
- команда всегда read-only. Запись snapshot/receipt происходит только владельцем workflow — Verify
  run или SDD sink.

Существующий `gennady agents-rules` — статическая инструкция по `orient`, не этот справочник. Его
контракт не переиспользуется и не выдаётся за dynamic rules API.

`knowledge.xml` удаляется только после entry-by-entry embedded metadata migration, equivalence,
dependency closure и project-local override proof. После миграции consumer grep обязан быть нулём.
`shared/sdd/rules-cascade.ts` заменяется общим `RuleResolver`; SDD замораживает snapshot до dispatch
и сверяет freshness digest.

## 11. Карта файлов

### 11.1 Создать

```text
shared/verify/model/
  verify-step.type.ts
  verify-preset.type.ts
  verify-context.type.ts
  verify-report.type.ts
  verify-readiness.type.ts

shared/verify/planning/
  compose-presets.ts
  select-phase.ts
  resolve-dependencies.ts
  validate-plan.ts

shared/verify/execution/
  verify-runner.ts
  local.executor.ts
  remote.executor.ts
  workspace-guard.ts
  invalidation.ts
  repair-loop.ts

shared/verify/readiness/
  resolve-capabilities.ts
  format-readiness.ts

shared/verify/reporting/
  text-reporter.ts
  json-reporter.ts

shared/rules/
  rule-descriptor.type.ts
  rule-registry.ts
  rule-resolver.ts
  rule-snapshot.ts
  rule-config.ts

cli/cmd/rules/
  rules.cmd.ts
  rules-list.ts
  rules-show.ts
  rules-resolve.ts
  rules-report.ts

specs/cli/verify/verify.spec.md
specs/cli/rules/rules.spec.md

plugins/node/
  node-plugin.ts
  node-detect.logic.ts
  node-preset.logic.ts
  plugin.json

shared/sdd/verify/
  sdd-verify-context.ts
  sdd-receipt-sink.ts
  sdd-receipt-validation.ts
```

### 11.2 Переписать/свести

| Текущий файл/зона | Действие |
|---|---|
| `shared/verify/verify.types.ts` | split в model types; удалить закрытый `StackId` |
| `shared/verify/plugin-api.ts` | экспорт нового plugin/preset/readiness contract |
| `shared/verify/stack-registry.ts` | runtime plugin ids, deterministic registry |
| `shared/verify/stack-detection.ts` | Node через plugin; scope-aware multistack |
| `shared/verify/stack-config.ts` | `VerifyStepOverride`, phase schema, migration diagnostics |
| `shared/verify/tree-guard.ts` | объединить с workspace mutation в `WorkspaceGuard` |
| `cli/cmd/verify/**` | plan-only facade → настоящий executor + `--plan` diagnostic mode |
| `cli/cmd/sdd-verify/{index,help}.ts` | сохранить command surface, переписать на thin SDD facade над shared engine + sinks |
| CLI dispatch/help/`cli/AGENTS.md` | добавить `gennady rules list/show/resolve`; не смешивать с `agents-rules` |
| `plugins/golang/*-plan.logic.ts` | возвращает `VerifyPreset` DAG |
| `plugins/swift/*-plan.logic.ts` | возвращает `VerifyPreset` DAG |
| `plugins/anystack/anystack-plugin.ts` | пустой declarative preset |
| `cli/cmd/vcs-pipeline/**` | facade над общим watcher |
| `services/vcs-client/**pipeline**` | exact-SHA polling, terminal states, typed evidence |
| `shared/sdd/readiness.ts` | facade над общим `CapabilityMatrix` |
| SDD directives/skills/specs | phase dispatch сохраняет `sdd-verify --task ... --phase ...` как thin facade; standalone Verify task flags запрещены |

### 11.3 Перенести, затем удалить старое место

| Старое | Новое |
|---|---|
| `cli/cmd/sdd-verify/workspace-mutation.ts` | `shared/verify/execution/workspace-guard.ts` |
| `cli/cmd/sdd-verify/phase-context.ts` | `shared/sdd/verify/sdd-verify-context.ts` |
| `cli/cmd/sdd-verify/phase-receipt-validation.ts` | `shared/sdd/verify/sdd-receipt-validation.ts` |
| receipt-часть `cli/cmd/sdd-verify/phase-run.ts` | `shared/sdd/verify/sdd-receipt-sink.ts` |
| dirty VCS watcher | `shared/verify/execution/remote.executor.ts` + services VCS |

### 11.4 Удалить после cutover

```text
shared/verify/presets/node.ts
shared/verify/presets/golang.ts
shared/verify/presets/swift.ts
shared/verify/presets/anystack.ts
shared/sdd/phase-verification-plan.ts

cli/cmd/sdd-verify/full-profile-plan.ts
cli/cmd/sdd-verify/repair-adapters.ts
cli/cmd/sdd-verify/workspace-mutation.ts
cli/cmd/sdd-verify/sdd-verify.cmd.ts
cli/cmd/sdd-verify/sdd-verify.types.ts

ai/directives/knowledge.xml
shared/sdd/rules-cascade.ts
```

`cli/cmd/sdd-verify/__tests__` удаляется не оптом: поведенческие сценарии переносятся в engine,
preset и SDD sink tests. Frozen old-runner↔new-adapter byte parity применяется только к fixture с
явно включённым legacy overlay/provenance; новый preset без overlay проверяется по общему report и
не обязан воспроизводить legacy command bytes/order. В overlay-corpus сравниваются нормализованные
`verdict`, exit code, diagnostic id/severity/location и receipt fields. В частности, A13/D-4
(`SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` = blocking error в v2), grandfathering V1,
marker-only phase receipt validation и запрет фабрикации исторических receipts обязаны совпасть.

### 11.6 Где живёт канон после ACK

`64-VERIFY-RULES-UNIFICATION.md` остаётся research/decision evidence в PR #26 → `main`. Он не
является runtime dependency и не должен читаться реализацией из gitignored `ai/drafts` release-
ветки. В U1 принятый контракт материализуется в неигнорируемых
`specs/cli/verify/verify.spec.md` и `specs/cli/rules/rules.spec.md`; task/Decision Log ко-лоцируются
там по SDD v2. Эти specs становятся implementation source of truth, а 64 — трассировкой исходного
ACK. Любое смысловое изменение после ACK сначала обновляет canonical spec + Decision Log.

### 11.5 Сохранить как проверенные примитивы

```text
shared/verify/env-fail.ts
plugins/golang/*-detect.logic.ts
plugins/golang/*-scope.logic.ts
plugins/swift/*-detect.logic.ts
plugins/swift/*-scope.logic.ts
cli/cmd/testcov/*coverage-adapter*
services/vcs-client/**
```

## 12. Волны и точки остановки

Работа идёт волнами. Внутри волны отдельное операторское подтверждение каждого PR не требуется:
ревьюер проверяет PR по dependency order, а Lead останавливает волну только на перечисленной decision
boundary.

| Волна | Содержание | Выход | Остановка |
|---|---|---|---|
| U0 | этот документ, решения, acceptance, source manifest dirty VCS work | утверждённая архитектура | **да: ACK архитектуры** |
| U1 | canonical specs + model + planner + config overlay + parity adapters | принятый контракт живёт в `specs/**`, новый DAG строится, старый runtime не сломан | нет |
| U2 | Node/Go/Swift/Anystack presets + per-phase readiness + multistack | одинаковый план на трёх стеках | нет |
| U3 | local executor + WorkspaceGuard + repair/invalidation | `gennady verify` реально исполняет phase slice | нет |
| U4 | SDD adapter + arbitrary selectors; затем embedded RuleRegistry, PhaseFacts, resolver и pre-dispatch RuleSnapshot; SDD-facade Evidence/Receipt; затем cutover второго runner | thin facade вызывает общий engine; snapshot frozen до agent work; ACK §12.1 реализован в UV-12E | **UV-13 ждёт reviewed UV-22C + UV-18A/B + UV-19 + UV-20S + UV-12E** |
| U5 | exact-SHA remote watcher; перенос лучших dirty VCS частей | `phase=ci` ждёт GitLab/GitHub pipeline | только перед remote mutation/rollback |
| U6 | remaining rules CLI/migration: `gennady rules` facade + entry migration/delete `knowledge.xml` | справочник и удаление legacy registry | только перед недетерминированным model-selector |
| U7 | data-only extension ADR и consumer fixture | external executable declarations fail closed; declarative argv исполняется только common executor | нет: operator выбрал запрет второго runtime |
| U8 | cleanup; reviewed MAIN carry R1…R4; history reconciliation R5; final UV-25; real E-18; immutable candidate | #99/#101 historical evidence + UV-27 guard + fresh UV-25/UV-26 proof + exhaustive disposition | **real E-18 host; затем exact ACK immutable candidate; публикация — отдельный будущий plan/ACK** |

### 12.1 ACK U4-ER — Evidence/Receipt

Operator ACK принят. Он задаёт следующий обязательный контракт реализации UV-12E; сам текст ACK не
считается implementation evidence, поэтому UV-13 остаётся `BLOCKED` до reviewed corrective UV-22C,
embedded RuleRegistry/PhaseFacts/RuleSnapshot integration и UV-12E.

1. **Append-only история attempts в существующем ticket.** Сначала валидируются task identity и
   точный writable `EXECUTION_LOG` target. После этого каждый SDD Verify attempt создаёт ровно одну
   compact structured entry **до mapping/planning/readiness/spawn**. Ticket-scoped runner owner
   сериализует attempts: live owner блокирует новый run без изменения первой entry; только proven
   dead/stale owner восстанавливается как `INTERRUPTED`. Эта же entry атомарно переходит из
   промежуточного `RUNNING` в одну normalized terminal state:
   `PASS|FAIL|BLOCKED|ENV_FAIL|TIMEOUT|VIOLATION|CANCELLED`. Recovery/следующий run
   детерминированно переводит orphan `RUNNING` в recovery-only `INTERRUPTED`. Attempts сохраняются:
   поздний pass не удаляет и не переписывает предыдущие failed/blocked/interrupted entries. Failure
   до получения valid task/log identity физически не может быть persisted и возвращается как CLI
   diagnostic без attempt entry.
2. **Микроскопическая human line.** Она содержит только run id, SDD phase, selector, terminal state,
   steps `x/y`, минимальные counts для каждого test step и duration. Ticket не становится warehouse:
   full stdout/stderr и artifacts туда не пишутся; detailed bounded/redacted diagnostics возвращает
   агенту CLI report.
3. **Machine identity в той же entry.** Structured payload содержит exact HEAD, deterministic
   worktree/scope digest, охватывающий uncommitted state, plan digest, preset/config provenance
   digest, frozen pre-dispatch RuleSnapshot digest, timestamps и run id. Один rules digest проходит
   через dispatch, Verify report и SDD sink. Любой relevant drift делает prior pass stale.
4. **Versioned normalized test statistics.** Каждый test step объявляет policy
   `required|optional|none`; built-in `unit` и `integration` по умолчанию `required`. Readiness
   блокирует missing required stats capability до spawn. После исполнения promised required stats,
   которые отсутствуют или malformed, дают `VIOLATION`. Минимальный normalized payload:
   `executed/passed/failed/skipped` плюс protocol и runner provenance. Workflow phase kinds и Verify
   selectors при этом остаются open/custom vocabulary.
5. **Trust принадлежит selector.** Обычные local selectors принимают `trust=local-runner`; final
   `ci` требует remote-provider proof exact pushed SHA и immutable pipeline identity. Local receipt
   runner-owned и детерминированно валидируется, но явно не является cryptographic/tamper-proof.
   Remote implementation остаётся U5.
6. **Legacy overlay условен.** Byte parity включается только explicit legacy overlay с provenance;
   no-overlay path не наследует legacy command/order semantics, как уже определено выше.

Acceptance UV-12E: standalone Verify отвергает SDD flags и оставляет ticket byte-identical. SDD
facade invalid task/log identity даёт только CLI diagnostic и ноль entries; valid target создаёт
одну entry до mapping/planning/readiness/spawn, поэтому `BLOCKED` и `ENV_FAIL` также сохраняются;
live concurrent owner блокируется unchanged, proven orphan recovery и все terminal transitions
доказаны adversarial fixtures; append-only history
переживает следующий pass; normalized stats/readiness/violation покрыты required, optional и none;
exact local identity/digests и staleness детерминированы; report/ticket явно несут selector trust;
overlay on/off остаются раздельными. Только после review embedded rules/snapshot dependencies,
UV-12E и corrective UV-22C начинается UV-13
directive/CLI cutover; UV-14 по-прежнему не удаляет compatibility runner до UV-13.

### 12.2 SUPERSEDED U8-RA — historical publication authorization proposal from #102

> **Не текущий executable plan.** Этот раздел сохраняет историю решения #102 и threat-model,
> полезный для будущего npm-publication design. Он не выдаёт publication ACK, не создаёт tarball
> candidate и не является зависимостью current main cutover. Текущий нормативный контракт —
> U8-MC/UV-27 в §12.3. Все npm paths до отдельного post-cutover plan/ACK должны fail closed.

Этот раздел — proposal для operator ACK, а не выданное разрешение на публикацию. Merge #99 закрыл
UV-24, merge #101 закрыл UV-25, но они не превращают `pending-UV-26` в release-ready и не являются
publication ACK. Прежняя модель «UV-26 — единственный остаток» отменена. Обязательный порядок:

1. operator ACK этого UV-27 plan;
2. реализация и review UV-27 в release-ветке, **без** package publication;
3. UV-26 exact cloud-ios E-18 на реальном Xcode/Tuist environment;
4. refresh UV-25, если после его `sourceCommit` изменились product/config/rules или release-gate bytes;
5. materialize и review одного immutable release candidate `.tgz`;
6. exact operator ACK, связанный с candidate HEAD, version, tarball SHA-256 и file manifest;
7. публикация как отдельное, явно авторизованное действие над тем же reviewed `.tgz`.

UV-27 реализует **одну shared fail-closed release-authorization SSOT**, а не четыре независимых
проверки. Её обязаны потреблять все поддержанные registry-writing paths: direct `npm publish` через
`prepublishOnly`, `publish-next`, `publish-draft` и `release-it`. До npm auth, изменения manifests,
commit/tag/push или registry side effect SSOT проверяет одновременно:

- exact approved release branch, upstream и HEAD; clean candidate tree; согласованные
  `package.json`/`package-lock.json` version; отсутствие конфликтующего npm version и git tag;
- UV-25 manifest/checker и UV-26 exact-E-18 evidence; frozen rules/config/product identities;
- product-drift policy: после UV-25 `sourceCommit` разрешён только exact evidence-pack allowlist;
  любое изменение product/config/rules заставляет переснять UV-25 на новом clean commit;
- tarball SHA-256 и полный sorted file manifest; allowlist/`ai/.npmignore`, отсутствие test/eval
  artifacts, secret-like values, private keys, credentials и developer absolute paths;
- exact non-reusable operator approval, привязанный к HEAD + version + tarball SHA-256 + manifest
  digest. Статическая `approved=true` в репозитории не является ACK.

Candidate публикуется как exact reviewed `.tgz`: после ACK запрещено пересобирать package или
повторно вычислять содержимое из moving worktree. Commit/tag либо проверяемый local tag, связанный с
candidate HEAD, создаётся и валидируется **до** необратимого npm side effect. Remote push policy
должна быть явной и recovery-safe: ошибка push после registry success не может сообщать «не
опубликовано», повторно публиковать version или оставлять неописанный recovery path; автоматический
force-push/rollback запрещён.

**Bypass threat model.** Repo hook не способен технически остановить сознательный
`npm publish --ignore-scripts`. Поэтому registry credentials, OTP и protected publishing authority
не выдаются процессу до exact operator ACK; supported commands отвергают `--ignore-scripts`, обход
shared SSOT и отсутствие approval. UV-27 доказывает отсутствие credentials/OTP в pre-ACK tests и
никогда не выполняет реальную публикацию.

Remote live evidence делится на два слоя: обязательная deterministic offline hashed/redacted
provider projection с exact SHA/workflow/pipeline/job identities и bounded fields; live recheck —
read-only best-effort proof, явно retention/token/API-dependent. Истечение внешнего historical run не
может молча переписать сохранённый offline proof или превратиться в ложный PASS.

Negative acceptance UV-27 обязана пройти для всех четырёх supported paths и доказать rejection до
side effect при: wrong branch, upstream, HEAD, version, tarball SHA/file manifest, missing/stale
UV-25, missing UV-26, product/config/rules drift, отсутствующем/mismatched/reused ACK, bypass flag и
доступных до ACK registry credentials/OTP. Отдельные tests фиксируют exact candidate reuse после ACK,
pre-publish commit/tag precondition и честный post-registry recovery verdict.

### 12.3 U8-MC — approved policy, pending exact candidate / Main replacement-tree cutover

Текущий deliverable — **ровно один** итоговый PR в `main`: существующий draft PR #25 с base `main`
и head `codex/sdd-v2-rc52-followup`. На момент этого amendment его observed identity:
`base main=9663c65b6376c65f4b1df0daf27a06df5b25f7a3`,
`head=df39f8eff9d08caca5e3d90d313479cc50ed4fc0`, `mergeable=CONFLICTING`,
`mergeStateStatus=DIRTY`. Эти значения — audit facts, не approved candidate: после любого движения
веток или разрешения конфликтов exact identity обязана быть переснята.

Внутренние product feature PR по-прежнему идут только в release-ветку; plan feature PR — только в
`sdd-v2-audit-migration-3b23b1`. Никакой второй cutover PR в `main` не создаётся. `main` не
force-push/reset/rewrite-ится: replacement означает final reviewed v2 tree через обычный PR merge,
а не потерю Git history.

UV-27 — umbrella с двумя обязательными implementation workstreams в release-ветке:

1. **UV-27A — V1 eradication inventory/audit.** До cutover строится machine-checkable полный
   inventory v1-only directives, skills, code, specs, docs, scripts и tests. Каждая запись получает
   owner/classification и expected deletion/replacement. Denylist + explicit v2 allowlist + negative
   scans доказывают отсутствие v1 residue и одновременно запрещают случайное удаление canonical v2.
   Примеры из интервью не являются исчерпывающим списком.
2. **UV-27B — cutover guard + npm publication lock.** Одна shared fail-closed cutover SSOT связывает
   approved release branch/upstream/HEAD, current `main` base SHA, resulting Git tree SHA,
   deterministic diff/deletion manifest digest, UV-25/UV-26 evidence digests, clean branch/upstream
   state и exact non-reusable operator ACK. Supported repo-owned direct `npm publish` path через
   `prepublishOnly`, `publish-next`, `publish-draft` и `release-it` fail closed. Repo hook технически
   не может перехватить произвольный external `npm publish --ignore-scripts` с пользовательским
   token; current guarantee — registry credentials/OTP/protected publishing authority отсутствуют.

Main base SHA обязан стать предком reviewed candidate **до merge**. Так как PR #25 сейчас
CONFLICTING/DIRTY, history reconciliation выполняется обычным history-preserving Git operation в
отдельной feature-ветке от exact release, затем reviewed PR в release (не прямой mutation stable).
Conflict resolution обязано сохранить exact reviewed v2 final tree и пройти повторную
проверку inventory/tree/diff/evidence; запрещено молча импортировать v1 content из `main` или
объявлять reviewed прежний candidate. Force-push/reset `main`, destructive overwrite и обход review
запрещены.

Strict current order:

1. существующая approved U8-MC policy и reviewed UV-27A/B, без npm side effect; этот refinement не выдаёт новый ACK;
2. reviewed MAIN carry R1…R4 в release, затем отдельный reviewed history-preserving reconciliation R5 (§12.3.1);
3. **final UV-25 refresh AFTER last product/config/rules/packaging change AND reconciliation**; #101 остаётся historical DONE, не current-candidate proof;
4. real UV-26 exact cloud-ios E-18 как безусловный A3/E-18 bar; host macOS 14.8.5 не проходит require>=15.0, OPEN до compatible host; любой последующий relevant drift инвалидирует соответствующее evidence;
5. materialize exact cutover candidate and update existing PR #25 diff/body;
6. independent reviewer review exact candidate;
7. exact operator ACK, bound to release HEAD + current main base SHA + tree SHA + diff/deletion
   manifest digest + evidence digests + branch/upstream state;
8. ordinary merge PR #25 to `main`;
9. post-merge verification on `main` against the approved tree/evidence identities.

Npm publication не является шагом этой очереди. Нет tarball/operator publish ACK, version `2.x`
или registry action. Future npm publication начинается только новым post-cutover design/ACK.

#### 12.3.1 MAIN carry и reconciliation — operational refinement 2026-10-09

Это детализация существующего approved U8-MC, не новая архитектура, не U0/ACK и не разрешение
main merge/publication. Stable branches остаются plan `sdd-v2-audit-migration-3b23b1` и implementation
`codex/sdd-v2-rc52-followup`; все изменения идут отдельными reviewed feature PR в соответствующую stable.

Frozen audit refs: main `9663c65b6376c65f4b1df0daf27a06df5b25f7a3`, release
`df39f8eff9d08caca5e3d90d313479cc50ed4fc0`, merge-base
`46c6d616700ee4cc61dbfe077d5b0052ce661dcd`. MAIN-only **117 commits / 520 net paths**:
170 present byte-identical, 19 deleted on both sides, 174 absent in release, 157 different.
`merge-tree` diagnostic reports **157 initial conflict paths** (44 content, 27 modify/delete,
84 add/add, 2 file-location). Это не число оставшихся конфликтов после R1…R4 и не результат resolution.

| Gap                                                       | Current V2 owner / disposition                                                                           | Reviewed slice / causal proof                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project-owned custom root files erased by full sync       | `cli/cmd/sync/sync-core.ts`, `specs/cli/sync/sync.spec.md`; adapt non-destruction, not registry          | R1: custom root bytes survive; stale files inside proven package-owned subtree still deleted; unknown root absence is not ownership proof                                                                                                                                                          |
| `resolvePackageDir` assumes `/dist/` entry layout         | `shared/common/sync/sync-core.shared.ts`; adapt metadata-based discovery                                 | R1: foreign cwd + actual source and nested-dist package fixtures resolve strictly, never permissive null                                                                                                                                                                                           |
| lint implementation self-executes on import               | `cli/cmd/lint/{lint.cmd,index}.ts`; adapt bootstrap boundary                                             | R1: import cannot run/print/exit/write; CLI exit 0/1/4 and autofix/format parity remain                                                                                                                                                                                                            |
| Safe Go prompt suggests mutating `go fmt`                 | `cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts`; adapt read-only command | R1: real unformatted temp Go file retains exact bytes; scoped `gofmt -l` reports it; no old Verify shell engine                                                                                                                                                                                    |
| RC requires models even for independent sections          | `shared/backend/rc/rc-config.ts`, current V2 config owners; adapt                                        | R1: absent models accepts verify-only RC; malformed present models still error; no closed StackId                                                                                                                                                                                                  |
| Four MAIN baseline rules absent                           | current embedded lexical RuleRegistry/Resolver; adapt `<Meta>`                                           | R2: `ai/directives/coding/{baseline-rules,go-rules,python-rules}.xml`, `ai/directives/testing/baseline-testing.xml`; real resolver/semantic equivalence; never restore `knowledge.xml` registry                                                                                                    |
| Four declared package exports point outside shipped files | current `package.json`/library publish specs; retain declared APIs, adapt build                          | R3: `gennady` root (`services/agent-mon/index.ts`), providers claude/opencode (current agent-mon provider entries), `gennady/stack` (`shared/verify/plugin-api.ts`) get dist-backed JS/types; actual local pack/install/import; no `services/stack` engine, no D60 experimental-composition change |

Historical data is not runtime parity: MAIN `tasks/ai-skills/sdd-skills/sdd-skills.task-97.md`
(owner `specs/ai-skills/sdd-skills/sdd-skills.spec.md`, DONE, 3 phases, 5 reopens, 8 execution/10 audit rounds)
has no semantic-equivalent release ticket. Nearest `specs/ai-skills/sdd-skills/sdd-skills.task.SS-run-all.md`
is a different 2-phase batch-scheduler history; matching owner/ID is not equivalence. MAIN
`tasks/stack/stack-library.task-95.md` and `tasks/stack/verify-command.task-96.md` contain journals
not represented by current Verify runtime. R4 preserves these **frozen byte-for-byte**, original
source/blob hashes and provenance, without synthesizing active DONE/receipt/new phases. MAIN-only
config/plugins/stack/stack-e2e/infra-e2e specs, indexes and flow docs receive explicit historical
archive disposition, not silent deletion or reactivation.

R4/R5 acceptance requires **exhaustive disposition of all 520 path deltas**, frozen MAIN/source
blob hashes and stable ref identities: `retain` equivalent current V2 bytes, `adapt` improvements
to current owners, `archive` historical user/spec/journal data, `exclude` intentionally replaced
V1 runtime/closed StackId/old verify/bash helpers. Seven gaps above are not the exhaustive manifest.
Changed source refs require a new delta audit before reconciliation. Archive must stay outside
active package runtime/auto-import and cannot recreate legacy registry or fake active states.

Slices: R1 safety/config → independent QA/review; R2 lexical rules and R3 declared export packaging
may follow as one independent wave; R4 frozen archive + full disposition after fixes; R5 ordinary
history-preserving `main` merge into a feature branch from reviewed release, audited conflict
choices and retirement of auto-imported V1 files, reviewed PR into release. No blind `merge -s ours`,
no destructive main overwrite, no synthetic history. Only then final UV-25/E-18 candidate evidence.
Current operator stop-points remain real E-18 compatible host and exact reviewed candidate ACK;
routine preservation/fixes require no new operator choice. Any actual public named-export collision
or irreducible data-loss ambiguity must be reported before mutation (safe default: preserve archive).

Negative acceptance должна fail closed до merge при wrong/stale main base, release HEAD, Git tree,
diff/deletion manifest, V1 inventory, UV-25/UV-26 evidence, branch/upstream state или operator ACK;
при любой V1 residue; при случайном удалении canonical v2; если любой supported repo-owned
direct/npm-script/release-it path способен дойти до publication side effect; либо если процессу
доступны registry credentials/OTP/protected authority. Test не утверждает, что repo может остановить
произвольный внешний npm process с самостоятельно предоставленным user token и `--ignore-scripts`.

## 13. Задачи новой очереди

| ID | Волна | Задача | Depends on | Acceptance |
|---|---:|---|---|---|
| UV-01 | U1 | материализовать canonical verify/rules specs; split model и новый `VerifyStep`/`VerifyPreset` contract | U0 | неигнорируемые specs связаны с D-65..D-70; type/API tests; closed `StackId` отсутствует |
| UV-02 | U1 | DAG validation, phase slicing, qualified ids | UV-01 | cycles/missing deps/unknown tags fail closed |
| UV-03 | U1 | config overlay + provenance + legacy adapter | UV-01 | deterministic merge, actionable migration errors |
| UV-04 | U2 | Node plugin/preset и script readiness | UV-01..03 | zero-YAML fixture по code/unit/coverage |
| UV-05 | U2 | Go preset conversion | UV-01..03 | build/vet/repair/test, codegen drift proof |
| UV-06 | U2 | SwiftPM/Xcode preset conversion | UV-01..03 | zero-YAML SwiftPM + minimal Xcode identity fixture |
| UV-07 | U2 | scope-aware multistack | UV-04..06 | затронутые стеки блокируют, явный non-blocking виден |
| UV-08 | U3 | WorkspaceGuard/checkpoint/write boundaries | UV-01..03 | dirty changes preserved, unexpected write violation |
| UV-09 | U3 | local executor и verdict taxonomy | UV-02, UV-08 | fail/env-fail/timeout/violation parity |
| UV-10 | U3 | repair loop + selective invalidation | UV-09 | re-run only invalidated, non-convergence bounded |
| UV-11 | U3 | text/json reports + readiness instructions | UV-04..10 | stable machine-readable report |
| UV-12 | U4 | SDD context и receipt sink | UV-11 | same report powers standalone and SDD receipt |
| UV-22 | U4 | declarative custom presets/selectors + composed SDD kind mapping | UV-03, UV-11 | built-in zero-YAML defaults + project overrides with provenance; arbitrary selector fixture; steps declared once |
| UV-22C | U4 | corrective ownership boundary for UV-22 | UV-22 | standalone Verify rejects task flags/ticket mutation; `sdd-task` emits one exact existing SDD facade invocation; facade resolves the mapped selector and uses the shared engine |
| U4-ER | U4 | **ACKED operator decision Evidence/Receipt (§12.1)** | UV-12 | canonical plan/spec фиксируют attempt journal, stats, freshness identities, selector trust и conditional legacy overlay |
| UV-18A | U4R | embedded lexical rule header parser + deterministic RuleRegistry | U0 | adversarial body remains byte-identical despite invalid XML-ish text; root/Meta/escaping/unknown metadata fail closed; no XML parser/sidecar |
| UV-18B | U4R | PhaseFacts/artifact classifier + Verify provider facts | UV-18A, UV-07 | TS source vs Vitest test-light; mixed TS+Go+CSS/Bash union; all affected available providers block, missing required provider visible BLOCKED |
| UV-19 | U4R | deterministic RuleResolver + When/Unless/dependency/override closure | UV-18A, UV-18B, UV-02 | OR/AND/comma/veto semantics; add/skip provenance/reason; required dependency skip fail closed; deterministic snapshot |
| UV-20S | U4R | SDD pre-dispatch RuleSnapshot integration | UV-19, UV-12, UV-22C | exact bodies supplied before agent work; same digest across rules resolve/dispatch/Verify report/sink; drift stale |
| UV-12E | U4 | evidence model + SDD-facade attempt log + stats/freshness/trust projection | UV-12, UV-22C, UV-20S, U4-ER ACK | standalone Verify ticket-byte-identical/rejects SDD flags; facade task/log identity first; live owner blocks unchanged, proven orphan→INTERRUPTED; atomic terminal states; append-only history; normalized stats; HEAD/worktree/scope/plan/provenance/rules identities; local trust visible |
| UV-13 | U4 | **BLOCKED до reviewed UV-22C + UV-18A/B + UV-19 + UV-20S + UV-12E:** migrate directives/skills/specs and conditional legacy-overlay parity golden | UV-22C, UV-18A, UV-18B, UV-19, UV-20S, UV-12E | overlay corpus preserves verdict/exit/diagnostic identity+severity+location/receipt fields, A13/D-4, V1 grandfathering and marker-only semantics; no-overlay path uses canonical evidence/receipt contract |
| UV-14 | U4 | remove independent `sdd-verify` runner | UV-13 | no runtime imports/references to old runner |
| UV-15 | U5 | audit/manifest dirty VCS source | U0 | every source change classified A/B/C |
| UV-16 | U5 | common pipeline watcher + typed evidence | UV-15, UV-09 | exact-SHA state sequence, timeout/API tests |
| UV-17 | U5 | `remote.executor` + `phase=ci` | UV-16, UV-11 | pushed SHA proof, jobs/logs in report |
| UV-20 | U6 | read-only `gennady rules` facade over UV-20S snapshot | UV-20S | list/show/resolve read-only; reasons/provenance/bodies/digest match dispatch/report |
| UV-21 | U6 | entry-by-entry embedded metadata migration and delete `knowledge.xml` | UV-18A..20 | equivalence + local override proof; zero consumer grep before deletion |
| UV-23 | U7 | data-only extension boundary ADR + consumer fixture | UV-01, UV-22 | path/package/URL/dynamic-import declarations fail closed до import/spawn; arbitrary declarative argv проходит общий planner/executor; report показывает qualified step + safe config provenance |
| UV-24 | U8 | delete compatibility and stale tests | UV-14, UV-17, UV-21, UV-22 | **DONE #99:** zero legacy references, fresh directives |
| UV-25 | U8 | Node/Go/Swift/remote/rules evidence pack | UV-24; final refresh after R5 | **HISTORICAL DONE #101; FINAL REFRESH PENDING** after LAST product change/reconciliation; exact E-18 OPEN |
| U8-RA | U8 | **SUPERSEDED by U8-MC:** historical #102 publication proposal (§12.2) | UV-25 | retained as decision history; no current ACK or executable publication semantics |
| U8-MC | U8 | approved main replacement-tree policy; operational carry/reconciliation refinement (§12.3.1) | historical UV-25 #101; no new policy ACK | exact candidate ACK is a separate pending boundary after R1…R5 + fresh UV-25/UV-26; plan merge alone is not cutover ACK |
| UV-27 | U8 | V1 eradication inventory + fail-closed cutover guard/npm lock | existing approved U8-MC policy, historical UV-25 | **IMPLEMENTED #104/#105**; exact candidate proof/ACK still pending; supported npm paths fail closed |
| UV-26 | U8 | exact cloud-ios E-18 | UV-06, UV-17, UV-27A/B | real Xcode/Tuist execute→CI→coverage evidence; refresh UV-25 on relevant drift before candidate review |
| U8-MC-R1 | U8 | safety/config: sync ownership, package root, lint import, safe Go, independent RC sections | reviewed #106 | PENDING reviewed release PR; causal RED→GREEN; no V1 runtime restoration |
| U8-MC-R2/R3 | U8 | lexical baseline rules / current four public package exports | independent of R1 implementation; QA before integration | PENDING; no registry/old stack engine; D60 unchanged |
| U8-MC-R4 | U8 | frozen raw data archive + exhaustive 520-path disposition/hashes | R1…R3 reviewed | PENDING; no synthetic active DONE/receipt |
| U8-MC-R5 | U8 | ordinary history-preserving reconciliation via feature PR into release | R1…R4 reviewed | PENDING; audited V2 conflict choices + inventory, then final UV-25/E-18 candidate |

## 14. Main-cutover acceptance

PR #25 не выходит из draft/review и не merge-ится, пока одновременно не доказано:

- Node, Go, Swift используют один planner/runner;
- обычный Node/Go/SwiftPM проект не требует `gennady.yaml`;
- Xcode требует project identity, а не копию argv;
- arbitrary declared selector выбирает только свой DAG-срез; core не выводит semantics из имени;
- SDD kind разрешается composed mapping `preset default → project override` в одну exact Verify
  invocation, без выбора gates агентом; unresolved fail-closed только после composition;
- repair оставляет diff и повторяет инвалидированные проверки;
- missing required capability не выдаёт зелёный skip;
- multistack блокирует все затронутые стеки;
- `phase=ci` ждёт pipeline exact pushed SHA и сохраняет evidence;
- SDD receipt строится из общего report;
- rules собираются динамически без центрального `knowledge.xml`, а `gennady rules` объясняет тот
  же snapshot без запуска Verify;
- project extension boundary остаётся data-only: executable plugin path/package/URL/import
  отвергается до import/spawn, а arbitrary declarative argv доказан через common guarded executor;
- explicit legacy-overlay parity сохраняет A13/D-4 severity, diagnostic identity/location,
  grandfathering и marker-only semantics до удаления `sdd-verify`; no-overlay не наследует legacy
  bytes/order;
- Evidence/Receipt ACK реализован UV-12E: append-only attempt journal, proof actual invocation,
  machine-readable stats, drift-sensitive identities и явная selector-owned local/remote trust
  boundary;
- independent `sdd-verify` runner и compatibility adapters удалены;
- dirty VCS source перенесён через manifest + tests, а не потерян;
- UV-27A inventory удалил все v1-only surfaces и доказал отсутствие residue без удаления canonical
  v2; UV-27B связал exact main base/release head/tree/diff/evidence, блокирует supported repo-owned
  npm paths и доказывает отсутствие credentials/OTP/protected authority;
- exact Swift E-18 завершён в реальном release environment;
- после последнего relevant product/config/rules/gate drift новый evidence pack снят с одного clean
  commit; checker разрешает после `sourceCommit` только exact evidence-pack allowlist;
- existing PR #25 содержит exact reviewed replacement tree; current main base — предок candidate;
  diff/deletion manifest, evidence digests и branch/upstream state связаны с operator ACK;
- ordinary merge #25 сохраняет history, а post-merge verification на `main` подтверждает approved
  tree. Package publication отсутствует и требует будущего отдельного plan/ACK.

## 15. Явно не делаем до соответствующей остановки

- не публикуем npm-пакет;
- не готовим tarball ACK, не выбираем version `2.x` и не считаем cutover ACK разрешением npm publish;
- не выдаём registry credentials/OTP/publishing authority в этом треке;
- не создаём второй PR в `main`: итоговый cutover — существующий #25;
- не force-push/reset/rewrite-им `main` и не разрешаем conflicts импортом v1 tree без re-review;
- не включаем автоматический rollback/force-push после CI failure;
- не создаём runtime для project/npm/URL executable plugins и не делаем dynamic import project code;
- не выдаём LLM semantic rule selection за детерминированную проверку;
- не cherry-pick-им грязный `/Users/k.lebedev/Developer/gennady` целиком;
- не сохраняем две публичные системы verify/fix;
- не оставляем D-64 non-blocking tail как источник ложного зелёного verdict.
- не начинаем UV-13 до review UV-22C, UV-18A/B, UV-19, UV-20S и реализации ACK §12.1 в UV-12E.
