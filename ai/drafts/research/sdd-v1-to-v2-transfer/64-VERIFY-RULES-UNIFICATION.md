# 64 — Единая система Verify, preset-плагины, remote execution и динамические правила

> Статус: **ACK U0 ПРИНЯТ 2026-09-24, КОД НЕ НАЧАТ**. Основание: операторский разговор
> 2026-09-24 после завершения самомиграции SDD v2. Этот документ **замещает** старые открытые
> развилки O-1/O-2 и design-tail plugin↔preset convergence, но не переписывает исторические
> отчёты 30/33. Публикация пакета запрещена до выполнения §12.
>
> Implementation baseline: `codex/sdd-v2-rc52-followup@8281a584`. Источник plan history:
> PR #26 `sdd-v2-audit-migration-3b23b1@4e7b14a7`.
>
> **Amendment 2026-09-25:** workflow SDD phase kind и Verify phase selector разведены как две
> открытые vocabulary. Built-in preset даёт zero-YAML default mapping между ними, project YAML
> overlays/overrides его с provenance. Operator ACK по Evidence/Receipt (§12.1) принят; UV-13
> остаётся заблокирован до реализации и review UV-12E вместе с UV-22. Этот amendment фиксирует
> выбранный evidence contract, но не притворяется его реализацией и не разрешает ранний cutover.

## 1. Решённая цель

Остаётся один публичный движок:

```text
gennady verify --phase <selector> [--task <ticket> --sdd-phase <P>]
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
9. при SDD-контексте передать тот же report в receipt sink.

`--phase` принимает произвольный объявленный preset/YAML-owned selector id. Core не выводит
pipeline из имени `code`, `test`, `full` или любого другого токена. Workflow SDD phase kind —
отдельная открытая vocabulary; composed mapping `preset default → project override` переводит kind
в selector до вызова Verify.

`sdd-verify` перестаёт быть вторым движком. После переходного периода его CLI-фасад и отдельная
лестница удаляются. Отдельной публичной команды `gennady fix` не будет: разрешённые ремонты — шаги
того же фазового прогона. Byte-parity legacy receipt не является универсальным default: она
обязательна только для явно включённого legacy overlay с видимым provenance.

## 2. Целевой поток

```text
VerifyRequest
  root + phase + scope/files + task/spec + HEAD/VCS
        │
        ▼
VerificationContext
        ├─ stack detection
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
        ├─ text/json reporter
        └─ optional SDD receipt sink
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
| `knowledge.xml` | colocated `*.rule.yaml` | центральный реестр удаляется после эквивалентной миграции |
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
`gennady verify --phase <resolved-selector> --task <ticket> --sdd-phase <P>`. Агент не выбирает
individual gates/steps и не собирает несколько Verify invocations вручную. Mapping fail-closed до
spawn только если kind остаётся unresolved после composition; diagnostic показывает preset source
и actionable project override path.

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
Загрузка стороннего npm-кода — отдельный security design gate; core снимает closed `StackId`, но не
включает произвольный dynamic import до решения trust/version/isolation.

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

Prompt-файлы не являются XML-документами и не используются как metadata registry. Metadata живёт
рядом, отдельным sidecar:

```text
ai/directives/coding/typescript-rules.xml
ai/directives/coding/typescript-rules.rule.yaml

plugins/golang/directives/infra/golang-setup.xml
plugins/golang/directives/infra/golang-setup.rule.yaml
```

```yaml
id: typescript
applies:
  stacks: [node]
  phases: [code, unit, integration]
  files: ['**/*.ts', '**/*.tsx']
dependsOn: []
priority: required
```

Rule sources:

1. generic built-ins;
2. active stack plugins;
3. detected frameworks;
4. task/spec intent candidates;
5. project-local rules;
6. explicit phase additions.

Resolver получает phase, Target Files, stack detections, frameworks, task goal и spec refs. Выход —
immutable snapshot с `required` и объяснёнными `suggested`. Hard predicates (расширение файла,
marker, phase, dependency) обязательны механически. Смысловые кандидаты предлагаются с причиной;
их выбор фиксируется в snapshot/receipt и проверяется аудитом, а не выдаётся за полностью
формализованный человеческий смысл.

### 10.1 Справочник как CLI-инструмент

`gennady rules` — публичная проекция `RuleRegistry + RuleResolver`, а не статический help-файл и не
копия логики Verify:

- `list` выводит inventory с id, source, stack/framework/phase predicates и availability;
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

`knowledge.xml` удаляется только после эквивалентной миграции каждой записи, dependency closure
proof и проверки project-local override. `shared/sdd/rules-cascade.ts` заменяется общим
`RuleResolver`; SDD лишь сверяет freshness snapshot.

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
| CLI dispatch/help/`cli/AGENTS.md` | добавить `gennady rules list/show/resolve`; не смешивать с `agents-rules` |
| `plugins/golang/*-plan.logic.ts` | возвращает `VerifyPreset` DAG |
| `plugins/swift/*-plan.logic.ts` | возвращает `VerifyPreset` DAG |
| `plugins/anystack/anystack-plugin.ts` | пустой declarative preset |
| `cli/cmd/vcs-pipeline/**` | facade над общим watcher |
| `services/vcs-client/**pipeline**` | exact-SHA polling, terminal states, typed evidence |
| `shared/sdd/readiness.ts` | facade над общим `CapabilityMatrix` |
| SDD directives/skills/specs | `sdd-verify` → `verify --task ... --sdd-phase ...` |

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
cli/cmd/sdd-verify/help.ts
cli/cmd/sdd-verify/index.ts

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
| U4 | SDD adapter; declarative custom selectors/presets; Evidence/Receipt model+journal; затем receipt cutover и удаление второго runner | SDD mapping разрешается в один общий engine; ACK §12.1 реализован в UV-12E до cutover | **ACK принят; UV-13 ждёт reviewed UV-12E + UV-22** |
| U5 | exact-SHA remote watcher; перенос лучших dirty VCS частей | `phase=ci` ждёт GitLab/GitHub pipeline | только перед remote mutation/rollback |
| U6 | sidecar registry + resolver + snapshot; миграция `knowledge.xml` | правила выбираются динамически | только перед недетерминированным model-selector |
| U7 | external-plugin trust/version/isolation contract и consumer fixture | граница внешнего кода доказана | перед исполнением внешнего кода |
| U8 | удалить adapters/legacy; Node+Go+Swift evidence; exact E-18 | release evidence pack | **да: решение о публикации** |

### 12.1 ACK U4-ER — Evidence/Receipt

Operator ACK принят. Он задаёт следующий обязательный контракт реализации UV-12E; сам текст ACK не
считается implementation evidence, поэтому UV-13 остаётся `BLOCKED` до merge/review UV-12E и UV-22.

1. **Append-only история attempts в существующем ticket.** Сначала валидируются task identity и
   точный writable `EXECUTION_LOG` target. После этого каждый SDD Verify attempt создаёт ровно одну
   compact structured entry **до planning/readiness/spawn**. Эта же entry атомарно переходит из
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
   digest, rules digest, timestamps и run id. Любой relevant drift делает prior pass stale.
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

Acceptance UV-12E: invalid task/log identity даёт только CLI diagnostic и ноль entries; valid target
создаёт одну entry до planning/readiness/spawn, поэтому `BLOCKED` и `ENV_FAIL` также сохраняются;
recovery и все normalized terminal transitions доказаны adversarial fixtures; append-only history
переживает следующий pass; normalized stats/readiness/violation покрыты required, optional и none;
exact local identity/digests и staleness детерминированы; report/ticket явно несут selector trust;
overlay on/off остаются раздельными. Только после review UV-12E и UV-22 начинается UV-13
directive/CLI cutover; UV-14 по-прежнему не удаляет compatibility runner до UV-13.

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
| UV-22 | U4 | declarative custom presets/selectors + composed SDD kind mapping | UV-03, UV-11 | built-in zero-YAML defaults + project overrides with provenance; arbitrary selector fixture; steps declared once; `sdd-task` emits one exact mapped Verify invocation |
| U4-ER | U4 | **ACKED operator decision Evidence/Receipt (§12.1)** | UV-12 | canonical plan/spec фиксируют attempt journal, stats, freshness identities, selector trust и conditional legacy overlay |
| UV-12E | U4 | evidence model + local SDD attempt log + stats/freshness/trust projection | UV-12, U4-ER ACK | task/log identity first; then one pre-planning entry; atomic RUNNING→PASS/FAIL/BLOCKED/ENV_FAIL/TIMEOUT/VIOLATION/CANCELLED and recovery-only INTERRUPTED; append-only history; normalized per-test-step stats; HEAD/worktree/scope/plan/provenance/rules identities; local trust visible; no artifact warehouse |
| UV-13 | U4 | **BLOCKED до reviewed UV-22 + UV-12E:** migrate directives/skills/specs and conditional legacy-overlay parity golden | UV-22, UV-12E | overlay corpus preserves verdict/exit/diagnostic identity+severity+location/receipt fields, A13/D-4, V1 grandfathering and marker-only semantics; no-overlay path uses canonical evidence/receipt contract |
| UV-14 | U4 | remove independent `sdd-verify` runner | UV-13 | no runtime imports/references to old runner |
| UV-15 | U5 | audit/manifest dirty VCS source | U0 | every source change classified A/B/C |
| UV-16 | U5 | common pipeline watcher + typed evidence | UV-15, UV-09 | exact-SHA state sequence, timeout/API tests |
| UV-17 | U5 | `remote.executor` + `phase=ci` | UV-16, UV-11 | pushed SHA proof, jobs/logs in report |
| UV-18 | U6 | sidecar rule schema/registry | U0 | no directive XML parsing as registry |
| UV-19 | U6 | deterministic rule resolver + dependency closure | UV-18, UV-02 | files/stack/phase/framework fixtures |
| UV-20 | U6 | task-intent candidates + immutable snapshot + `gennady rules` facade | UV-19, UV-12 | list/show/resolve read-only; reasons/provenance/freshness/digest совпадают с verify plan/report |
| UV-21 | U6 | migrate and delete `knowledge.xml` | UV-18..20 | entry-by-entry equivalence, local override proof |
| UV-23 | U7 | external plugin trust/version/isolation ADR | UV-01 | design decision before dynamic import |
| UV-24 | U8 | delete compatibility and stale tests | UV-14, UV-17, UV-21, UV-22 | zero legacy references, fresh directives |
| UV-25 | U8 | Node/Go/Swift/remote/rules evidence pack | UV-24 | all acceptance scenarios reproducible |
| UV-26 | U8 | exact cloud-ios E-18 | UV-06, UV-17 | real Xcode/Tuist execute→CI→coverage evidence |

## 14. Release acceptance

Пакет не публикуется, пока одновременно не доказано:

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
- explicit legacy-overlay parity сохраняет A13/D-4 severity, diagnostic identity/location,
  grandfathering и marker-only semantics до удаления `sdd-verify`; no-overlay не наследует legacy
  bytes/order;
- Evidence/Receipt ACK реализован UV-12E: append-only attempt journal, proof actual invocation,
  machine-readable stats, drift-sensitive identities и явная selector-owned local/remote trust
  boundary;
- independent `sdd-verify` runner и compatibility adapters удалены;
- dirty VCS source перенесён через manifest + tests, а не потерян;
- exact Swift E-18 завершён в реальном release environment;
- новый evidence pack снят с одного чистого commit.

## 15. Явно не делаем до соответствующей остановки

- не публикуем npm-пакет;
- не включаем автоматический rollback/force-push после CI failure;
- не загружаем произвольный внешний npm plugin;
- не выдаём LLM semantic rule selection за детерминированную проверку;
- не cherry-pick-им грязный `/Users/k.lebedev/Developer/gennady` целиком;
- не сохраняем две публичные системы verify/fix;
- не оставляем D-64 non-blocking tail как источник ложного зелёного verdict.
- не начинаем UV-13 до merge/review UV-22 и реализации ACK §12.1 в UV-12E.
