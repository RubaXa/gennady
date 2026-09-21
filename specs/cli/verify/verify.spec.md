# Module: `verify`

<!--SECTION:SPEC_ID-->

CLI-VERIFY

<!--/SECTION:SPEC_ID-->

**Module:** verify · **Parent scope:** [cli](../cli.spec.md)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

`verify` — стек-движок, перенесённый из MAIN и расширенный literal-плагинами `plugins/{anystack,golang,swift}/**` в рамках пачки «Verify считает окружение и гейты как данные» (`ai/drafts/research/sdd-v1-to-v2-transfer/30-TRACK-VERIFY.md` §6, задачи V-02..V-11). Перенос идёт волнами: каждая задача добавляет РЕАЛЬНЫЙ вызов очередному примитиву, подключая его к существующему ладдеру `sdd-verify` (`cli/cmd/sdd-verify/**`), который в это же время не меняется в поведении (golden V-01, инварианты И-1/И-2). До своего подключения перенесённый примитив по определению имеет 0-1 продакшн-вызовов — это фиксирует гейт `yagni`, и единственный штатный способ унять находку — `Usage Waiver` (`cli/cmd/yagni/yagni.cmd.ts:228`), записанный здесь, в контракте модуля-получателя, с явной ссылкой на задачу, которая присоединит вызов.

**Key properties:**

- **Пересмотрено при закрытии V-16a:** модуль **получил собственный, но read-only CLI-вход** — `cli/cmd/verify/**` (`gennady verify --plan --json`, D-13, никогда не мутирует и не запускает гейт). Формулировка «не имеет собственного CLI-входа» верна только для мутирующего/исполняющего пути — им по-прежнему владеют `sdd-verify`/`sdd-state`/`sdd-task`, подключаемые задачами V-03..V-11.
- **V-04a закрыта:** `phase-receipt.ts` (`environmentState`, вне этого модуля) теперь резолвит пресет через `resolvePreset('node', …)` (`presets/node.ts`) и фейлится явно на этапе резолва для стека без реализованного источника (И-3) — реальный вызов из `gennady sdd-verify` в этот модуль есть.
- **V-05/V-05b закрыты:** новый `shared/verify/stack-detection.ts` (`detectRepoStack`) даёт один общий факт `StackDetection` вместо per-caller угадывания; `sdd-state`, `sdd-task` и `sdd-verify/phase-context` вызывают его безусловно с одной и той же валидной секцией `stack:`. Детектор сам владеет bootstrap-safety: корень без конкретного маркера и без `stack.use` получает исторический node fallback (`STACK_SOURCE=fallback:node`), `go.mod` без `stack.use` детектится как golang, а `stack.use` только сужает кандидатов. `sdd-state` печатает итоговые `STACK=`/`STACK_SOURCE=` в `[READINESS]`. Реальный второй вызов `detectStacks` (`stack-registry.ts`) есть — его запись `Usage Waiver` снята.
- **V-07 закрыта:** `cli/cmd/sdd-verify/index.ts` подключает `loadStackConfig(root, BUILTIN_GATE_IDS)` как реальный preflight-гейт — любая ошибка схемы `stack:` (`gennady.yaml`/`.gennadyrc`) останавливает `sdd-verify` с exit 4 (`ERR_CLI_SDD_VERIFY_STACK_CONFIG`) до выполнения любого гейта; отсутствие секции — не ошибка. `loadStackConfig`/`BUILTIN_GATE_IDS`/`StackConfigError`/`StackConfigLoad` сняты (реальные вторые ссылки); `validateStackConfig`/`allOf`/`ConfigSectionLoad`/`formatDuration` остаются waived (уточнены по факту, см. §6). Доказано e2e (`cli/__tests__/tool-behavior/sdd-verify-stack-config.test.ts`): валидный `gennady.yaml` с 3 `extraGates` (id/argv/envFail/requires/fixer) не спотыкается о гейт; неизвестный ключ и неизвестный `stack.use` id → exit 4. **Открытый разрыв, не закрытый этой пачкой (кандидат V-07b):** за пределами exit-4 валидации слитый `config`/провенанс нигде не наблюдаемы ни в одном v2-выводе — `resolvePhaseContext` (V-08b) теперь читает `config` для anystack-гейтов, но это потребление, не наблюдаемость (нет per-key provenance в снимке/выводе).
- **V-08 закрыта (пресет):** новый `shared/verify/presets/anystack.ts` (`resolveAnystackPreset`) реализует `StackPreset` — `resolvePreset('anystack', …)` больше не возвращает `null`, доказано unit-тестами. Гейты — только из `stack.anystack.extraGates` (`pluginConfigOf`), в точном порядке объявления (И-2, fixed order); ни один никогда не required — anystack не делает проект not-ready. `ANYSTACK_GATE_IDS`/`StackPreset`/`pluginConfigOf` сняты (реальные вторые ссылки). D-64 позднее подключил `applyStackConfig` к общему full-profile, чтобы extra gates сохраняли исполняемые `envFail`/`requires`/cwd/env свойства; `unmatchedGateOverrides` остаётся waived до подключения override-модели.
- **V-08b/V-08c закрыты:** `phase-verification-plan.ts` больше не резолвит `resolvePreset('node', …)` жёстко — `resolvePhaseVerificationPlan`/`verificationGateNames`/`requiredVerificationGateNames`/`commandForGate` принимают `stack`/`config` (по умолчанию `'node'`, byte-identical, V-01 golden не тронут). Отсутствующий пресет теперь даёт явный fail-closed `Error` с именем стека/профиля, а CLI-фазовый путь превращает его в teaching failure; `TypeError` через non-null assertion невозможен. `sdd-verify/phase-context.ts` резолвит стек через безусловный `detectRepoStack` и передаёт его в план; `phase-run.ts` для нестандартного стека выполняет `gatePlan.gates` вербатимно, в объявленном порядке, через тот же runner, что и §5-команды (нет npm-лестницы для anystack). `phase-receipt.ts`'s `phaseVerificationPlanEnvironmentState` для `stack !== 'node'` фингерпринтит сами config-authored команды гейтов вместо чтения `package.json` — восстановлен fail-closed контракт В-04a's guard для стека без своего источника (тест на `'golang'`), и добавлен позитивный тест: anystack успешно резолвится без `package.json` вообще. E2E-тест (`phase-run.test.ts`): фикстура без `package.json`, 3 anystack-гейта → receipt пишется, `receipt.commands` в порядке `gatePlan.gates` (И-2 п.а).
- V-09 подключает перенесённый golang plugin через `presets/golang.ts`: phase ladder, full-profile и environment fingerprint используют один literal plugin plan.
- **V-11:** Swift детектируется только по root `Package.swift`/`Project.swift`/`Workspace.swift` либо реальному `.xcodeproj`/`.xcworkspace`; SwiftPM получает безопасные defaults, а Xcode/Tuist build/test argv остаются config-owned. `environmentState` хэширует полный отсортированный набор build-definition manifests/locks и успешные `swift --version`/`xcodebuild -version`. Phase repair форматирует exact Target Files; ignored generated output исключается `.gitignore`-aware обходом, а non-ignored mutation остаётся fail-closed. Coverage adapter экспортирует ровно canonical/current bounded `.xcresult` через `xcrun xccov`, не угадывая workspace/scheme/destination (VERIFY-DL-4).
- `Usage Waiver` в §8 (`Module Contracts`) — не постоянное освобождение, а расписание: у каждой записи есть задача-владелец, которая обязана либо провести реальный вызов и снять запись, либо явно пересмотреть её при своём закрытии (см. `Module Decision Log`, §11, для истории снятий).
- Перенесённые файлы — MAIN `d37d5910`, минимальная правка импортов под путь RC (детали и построчные диффы — в `R-V-02.md`, не дублируются здесь).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:OVERVIEW-->

## 2. Overview

```mermaid
flowchart LR
  subgraph existing["Существующий ладдер (расширен V-03/V-04/V-04a, не изменил поведение)"]
    CMD["sdd-verify.cmd.ts\nrunGate: envFail/requires (V-03)"] --> PLAN["phase-verification-plan.ts\nverificationGateNames→resolvePreset (V-04)"]
    PLAN --> RCPT["phase-receipt.ts\nenvironmentState→resolvePreset, fail-closed (V-04a)"]
  end

  subgraph presets["Пресеты — реальный вызов есть (V-04/V-04a/V-08)"]
    NODE["presets/node.ts\nresolvePreset(stack,…) dispatcher — node + anystack + golang + swift"]
    ANYP["presets/anystack.ts\nresolveAnystackPreset — extraGates, fixed order, never required (V-08)"]
  end

  subgraph connected["Подключено этой волной (реальный вызов есть)"]
    STATE["sdd-state.cmd.ts\ndetectRepoStack (V-05)"]
    SD["stack-detection.ts\nRepoStackDetection — one shared fact"]
    IDX["sdd-verify/index.ts\nloadStackConfig preflight, exit 4 (V-07)"]
  end

  subgraph ported["Перенесённые примитивы этого модуля — 0-1 вызовов до подключения"]
    REG["stack-registry.ts\ndetectStacks (V-05) · BUILTIN_GATE_IDS (V-07)"]
    CFG["stack-config.ts\nvalidateStackConfig/allOf: exercised at runtime, no 2nd textual ref · applyStackConfig: connected by D-64 · unmatchedGateOverrides: open"]
    ENVF["env-fail.ts\nallOf, compileEnvFailRules"]
    TG["tree-guard.ts\nacquireTreeGuard"]
    LOADER["config-loader.ts\nformatDuration (V-16), ConfigSectionLoad"]
    PLUGINS["plugins/index.ts\nBUILTIN_PLUGINS"]
    ANY["plugins/anystack/**\nANYSTACK_GATE_IDS connected (V-08); planGates()/verify facet still unused"]
    GO["plugins/golang/**"]
    SWIFT["plugins/swift/**\nmarker/scope/format-build-test-lint"]
  end

  PLAN --> NODE
  RCPT --> NODE
  NODE --> ANYP
  ANYP -. "pluginConfigOf (connected, V-08)" .-> CFG
  ANYP -. "ANYSTACK_GATE_IDS (connected, V-08)" .-> ANY
  PLUGINS --> ANY
  PLUGINS --> GO
  PLUGINS --> SWIFT
  CFG -.-> ENVF
  REG -.-> PLUGINS
  STATE --> SD
  SD --> REG
  IDX --> CFG
  IDX --> LOADER
  IDX --> REG

  CMD -. "V-03 done: Gate.envFail/requires machinery in runGate; 0 GATES entries feed it yet" .-> ENVF
  NODE -. "V-09: golang preset (presets/golang.ts)" .-> GO
  NODE -->|"V-11: presets/swift.ts"| SWIFT
  TG -. "V-18 (вне этой волны)" .-> PLAN
```

_Сплошные рёбра — уже связанный код (ничего не меняется этой пачкой); пунктирные — связь, которую проведёт конкретная задача V-03..V-09/V-18, тем самым снимая соответствующие записи `Usage Waiver` из §8._

<!--/SECTION:OVERVIEW-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 3. Module Usage Example

**V-05:** `cli/cmd/sdd-state/sdd-state.cmd.ts` импортирует `detectRepoStack` и печатает его результат в `[READINESS]`:

```ts
import { detectRepoStack } from '../../../shared/verify/stack-detection.ts';
import { loadStackConfig } from '../../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../../shared/verify/stack-registry.ts';

const loaded = loadStackConfig(root, BUILTIN_GATE_IDS);
const stackConfig = loaded.errors.length === 0 ? loaded.config : null;
const stack = detectRepoStack(root, stackConfig); // same unconditional call in all three commands
// stack.stacks === ['node'] | ['golang'] | ['golang','node'] | ['anystack']
// stack.source  === 'marker:package.json' | 'config:stack.use' | 'fallback:node' | …
```

**V-07:** `cli/cmd/sdd-verify/index.ts` loads and validates the `stack:` config section before any gate runs — a malformed `gennady.yaml`/`.gennadyrc` exits 4, never a partial run:

```ts
import { loadStackConfig, type StackConfigLoad } from '../../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../../shared/verify/stack-registry.ts';
import { stackConfigError } from './sdd-verify.types.ts';

const stackConfigLoad: StackConfigLoad = loadStackConfig(projectRoot, BUILTIN_GATE_IDS);
if (stackConfigLoad.errors.length > 0) {
  const outcome = stackConfigError(stackConfigLoad.errors);
  console.error(outcome.message);
  process.exit(outcome.exitCode); // 4
}
```

**V-08:** `resolvePreset('anystack', …)` — same call, different stack — resolves through `presets/node.ts`'s dispatcher:

```ts
import { resolvePreset } from 'shared/verify/presets/node.ts';

const preset = resolvePreset('anystack', 'full', root, stackConfigLoad.config);
preset!.gateNames('full', false); // extraGate ids, declaration order
preset!.requiredGateNames('full', false); // always [] — never blocks the ladder
preset!.commandForGate('syntax', {}, []); // extraGate argv, shell-quoted
```

**V-09 закрыта:** golang preset отображает фазовые обязанности в `fix → type-check → test`, а full-profile сохраняет literal plugin gates и их `envFail`/`outputMeansFailure`/`driftMeansFailure`.

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 4. Entity Inventory (Closed-World)

_Полный список файлов-сущностей, перенесённых задачей V-02. Функции/типы внутри них — в `Module Contracts` (§8), только там, где на них есть `Usage Waiver`._

| Name                                | Type     | Purpose                                                                                            |
| ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `shared/verify/verify.types.ts`     | Types    | Общие типы стек-движка (`Gate`, `StackRun`, `VerifyReport`, …)                                     |
| `shared/verify/env-fail.ts`         | Utility  | Компилятор env-fail предикатов (`allOf`, `exitCodeMatches`, …)                                     |
| `shared/verify/tree-guard.ts`       | Port     | Лок рабочего дерева на время гейта (single-flight, ещё не подключён)                               |
| `shared/verify/stack-registry.ts`   | Service  | Реестр builtin-стеков и их gate id, детект активных стеков                                         |
| `shared/verify/plugin-api.ts`       | Port     | Публичная поверхность `gennady/stack` для авторов стек-плагинов                                    |
| `shared/verify/stack-config.ts`     | Service  | Конфиг-контракт `gennady.yaml` секция `stack:` (deep-merge, провенанс)                             |
| `services/config/config-loader.ts`  | Service  | Универсальный загрузчик секции конфига + провенанс + форматирование                                |
| `plugins/index.ts`                  | Registry | Список встроенных стек-плагинов (`BUILTIN_PLUGINS`)                                                |
| `plugins/anystack/**`               | Adapter  | Read-only стек-плагин для произвольных гейтов из `gennady.yaml`                                    |
| `plugins/golang/**`                 | Adapter  | Стек-плагин Go: детект, scope, план (`gofmt`, `go vet`, `go generate`)                             |
| `plugins/swift/**`                  | Adapter  | SwiftPM/Xcode/Tuist: root-marker detection, scope, literal format/build/test/lint plan             |
| `shared/verify/presets/node.ts`     | Service  | `resolvePreset(stack, …)` — dispatcher; node inline, anystack delegated (V-04/V-08)                |
| `shared/verify/presets/anystack.ts` | Service  | `resolveAnystackPreset` — config-authored gates, fixed order, never required (V-08)                |
| `shared/verify/presets/swift.ts`    | Service  | Swift phase/full mapping and manifest+tool-version `environmentState` (V-11)                       |
| `shared/verify/stack-detection.ts`  | Service  | `detectRepoStack(root, config)` — один общий факт `StackDetection`, подключён к `sdd-state` (V-05) |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 5. Entity Surfaces

Поверхности перенесённых сущностей раскрываются по мере подключения (V-05/V-07/V-08/V-09); до этого — только `Module Contracts` (§8) с записями `Usage Waiver`.

<details>
<summary>Развёрнутые поверхности сущностей</summary>

TODO(V-05, V-07, V-08, V-09): наполняется задачей, которая реально подключает соответствующий файл (см. Entity Inventory, §4, и Overview, §2).

</details>

<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 6. Module Contracts (DbC)

Реестр `Usage Waiver` начинался с **26** символов задачи V-02. После V-05/V-07/V-08 были сняты 9 записей; D-64 снял `applyStackConfig` реальным full-profile вызовом и добавил 2 экспортированных test seam для проверки priority. Итого открыто **18** записей. Каждая запись объясняет необходимость символа при 0–1 production usage; форма — по прецеденту `specs/shared/shared.spec.md`, `specs/cli/sdd-check/sdd-check.spec.md` (`cli/cmd/yagni/yagni.cmd.ts:228`).

<details>
<summary>Usage Waiver — 18 символов open: 16 унаследованных после снятия `applyStackConfig` и 2 D-64 test seam. По владельцу: V-09 — 5 (`C`, `I`, `Bad`, `scopeHasGoGenerate`, `isStructuralListError`); V-18 — 4 (`TreeGuard`, `TreeGuardOptions`, `GuardAcquisition`, `acquireTreeGuard`); D-64 test seam — 2 (`DEFAULT_STACK_PRIORITY`, `orderDetectedStacks`); без твёрдого владельца — 7 (`ConfigSectionLoad`, `formatDuration`, `allOf`, `validateStackConfig`, `unmatchedGateOverrides`, `StackRun`, `VerifyReport`).</summary>

### `C`

- **Usage Waiver:** approximate-declaration ложноположительный — однобуквенный top-level идентификатор внутри одноразовых e2e-фикстур golang (`go-fmt-excludes-nested-testdata/cmd/c.go`, `go-scope-build-constraints/constrained/c.go`), не публичная поверхность плагина; фикстуры реально упражняются e2e-прогоном golang-пресета — снимается в V-09 (пересмотреть по факту: если V-09 не добавит текстовую ссылку, годится только сужение source-policy `yagni` для `e2e/fixtures/**`, отдельная задача вне этой волны).

### `I`

- **Usage Waiver:** тот же класс ложноположительного, фикстура `go-fmt-excludes-nested-testdata/internal/i.go` — снимается в V-09 (см. запись `C`).

### `Bad`

- **Usage Waiver:** тот же класс ложноположительного, фикстура `go-fmt-excludes-nested-testdata/internal/testdata/golden.go` — снимается в V-09 (см. запись `C`).

### `scopeHasGoGenerate`

- **Usage Waiver:** единственный вызов сегодня — внутри своего же файла (`golang-plan.logic.ts`); второй — из golang-пресета, переносящего `driftMeansFailure` (`go generate`) в ладдер (`30-TRACK-VERIFY.md` §6, V-09) — снимается в V-09.

### `isStructuralListError`

- **Usage Waiver:** единственный вызов сегодня — внутри своего же файла (`golang-scope.logic.ts`); второй — из golang-пресета/e2e `go-broken-package-not-dropped` — снимается в V-09.

### `ConfigSectionLoad`

- **Usage Waiver:** тип результата `loadConfigSection`, сегодня потребляется без явной аннотации (`stack-config.ts:357`). **Пересмотрено при закрытии V-07:** подключение (`loadStackConfig` → `sdd-verify/index.ts`) не задело этот тип напрямую — `sdd-verify` типизирует `StackConfigLoad` (снят) и `StackConfigError` (снят), а `ConfigSectionLoad` остаётся внутренним для `config-loader.ts`/`stack-config.ts`. Владелец не назначен; снимается, когда какой-то будущий потребитель секции конфига (не `stack`) явно затипизирует переменную этим именем.

### `formatDuration`

- **Usage Waiver:** печать `timeoutMs` гейта в человекочитаемом виде. **Пересмотрено при закрытии V-07:** V-07 добавляет только загрузку+валидацию (+exit 4), без печати самого гейт-плана. **Пересмотрено при закрытии V-16a:** `gennady verify --plan --json` вышел с узким `VerifyPlanGate` без `timeoutMs`. **Пересмотрено D-64/V-13b:** config-authored secondary `extraGates` теперь входят в общий full-plan, но его JSON по-прежнему несёт только `name`/`stack`/`command`/`required`/`blocking`; timeout не обещан и не исполняется текущим `GateRunner`. Waiver остаётся до отдельного расширения runner/JSON-контракта, не до plugin↔preset convergence.

### `allOf`

- **Usage Waiver:** комбинатор env-fail предикатов, сегодня вызывается только внутри `compileEnvFailRules` (`env-fail.ts:248`) — единственный call site, независимо от того, сколько раз сам `compileEnvFailRules` вызывается. **Пересмотрено при закрытии V-07:** `envFail`-правило на `extraGates` теперь реально валидируется по живому CLI-пути (`sdd-verify/index.ts` → `loadStackConfig` → `validateStackConfig` → `validateGateSpec` → `compileEnvFailRules` → `allOf`), доказано e2e-тестом (`cli/__tests__/tool-behavior/sdd-verify-stack-config.test.ts`, кейс с `envFail: [exitCodeMatches, stderrMatches]` на анистек-гейте) — но это **исполнение**, не новая **текстовая** ссылка на символ `allOf`, а гейт `yagni` считает именно текстовые ссылки. Снимается, когда появится второй прямой call site самого `allOf` (не через `compileEnvFailRules`) — открытый вопрос, владелец не назначен.

### `validateStackConfig`

- **Usage Waiver:** единственный вызов сегодня — внутри `loadStackConfig` (`stack-config.ts:369`). **Подтверждено при закрытии V-07** (как и предполагала запись): подключение `loadStackConfig` к `sdd-verify/index.ts` не добавило прямой второй вызов `validateStackConfig` самого по себе — запись пересмотрена явно, не перенесена молча. Владелец не назначен.

### `unmatchedGateOverrides`

- **Usage Waiver:** валидация `overrideGates` из `gennady.yaml` против уже спланированных гейтов (полных `Gate` объектов с `envFail`/`requires`/`fixer`). **Пересмотрено при закрытии V-08:** anystack-пресет (`presets/anystack.ts`) реализует `StackPreset` — узкий контракт фазовой лестницы (`gateNames`/`commandForGate: string | null`), не полный `Gate[]`-план MAIN-стековой модели; для anystack `overrideGates` не имеет смысла (нет builtin-гейтов, которые можно было бы override). Владелец не назначен — снимается, если/когда полная `Gate`-модель (`gennady verify`, V-16) когда-нибудь заменит фазовую лестницу или получит собственный слой поверх неё.

### `DEFAULT_STACK_PRIORITY`

- **Usage Waiver:** экспортированный test seam фиксирует утверждённый D-64 default order `swift > golang > node > anystack`, включая будущий Swift до появления его detector/preset. Production использует константу через `orderDetectedStacks`; прямой экспорт нужен только точному regression-тесту, а не искусственному второму production usage (VERIFY-DL-2).

### `orderDetectedStacks`

- **Usage Waiver:** экспортированный чистый test seam доказывает обе стороны D-64: default priority с будущим Swift и `stack.use` как detected-intersection без назначения отсутствующего стека. Production вызывает его только из `detectRepoStack`; отдельный экспорт удерживает матрицу при добавлении будущих detector/preset (VERIFY-DL-2).

### `TreeGuard`

- **Usage Waiver:** тип лока рабочего дерева. Не входит в набор задач этой волны (V-03..V-09) — по `30-TRACK-VERIFY.md` §6 подключение `tree-guard`-лока к фазовому пути явно отнесено к **V-18** («single-flight … `tree-guard`-lock переносится в V-02, но не подключается к фазовому пути»). Снимается в V-18 (вне текущей пачки — см. отклонения в `R-V-02.md`/сводном отчёте пачки).

### `TreeGuardOptions`

- **Usage Waiver:** та же причина и тот же владелец, что и `TreeGuard` — снимается в V-18.

### `GuardAcquisition`

- **Usage Waiver:** та же причина и тот же владелец, что и `TreeGuard` — снимается в V-18.

### `acquireTreeGuard`

- **Usage Waiver:** та же причина и тот же владелец, что и `TreeGuard` — снимается в V-18.

### `StackRun`

- **Usage Waiver:** тип одного запуска стека; в MAIN потребляется движком `services/stack/gate-runner.ts`, который эта волна не переносит целиком. **Пересмотрено при закрытии V-04/V-16a:** presets и read-only фасад сознательно сохранили RC-формы `GateResult[]`/`VerifyOutcome` и `VerifyPlanDocument`, не MAIN `StackRun`. **Пересмотрено D-64/V-13b:** мультистековый `AssembledFullProfile` теперь реален как primary preset + secondary preset/extra-gate tail, но без plugin↔preset convergence; подмена его MAIN `StackRun` смешала бы отложенный Variant C в #46. Waiver остаётся до отдельного решения Variant C либо удаления неиспользуемого MAIN-типа.

### `VerifyReport`

- **Usage Waiver:** итоговый отчёт прогона стека — тот же пересмотр при закрытии V-04, что и `StackRun`: `resolvePreset`/`StackPreset` не используют эту форму. **Пересмотрено при закрытии V-16a (V-BATCH-13):** та же причина, что у `StackRun` — фасад несёт собственный `VerifyPlanDocument`, не `VerifyReport`. Владелец исчерпан; тот же преемник-кандидат («`extraGates`/anystack вживляются в полный профиль»), иначе кандидат на удаление вне этой волны.

</details>

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 7. Public Options & Policies

**`stack:`** (`gennady.yaml`, `.gennadyrc`) — merged deep, repo `.gennadyrc` > `gennady.yaml` > `$HOME/.gennadyrc`, per-key provenance (`shared/verify/stack-config.ts`, `services/config/config-loader.ts`). Schema is strict: any unknown key, wrong type, or bad value is fatal — `sdd-verify` exits 4 (`ERR_CLI_SDD_VERIFY_STACK_CONFIG`) before any gate runs (V-07, `cli/cmd/sdd-verify/index.ts`). No section present at all is not an error.

- `use: [<plugin-id>, …]` — restricts the candidate stack registry; never assigns an undetected stack.
- `<pluginId>.skipGates: [<gate-id>, …]` — excludes builtin gates, visibly (skip entries, never silent drops).
- `<pluginId>.overrideGates.<gate-id>: <GateSpec>` — overrides one builtin gate's `argv`/`cwd`/`env`/`timeout`/`outputMeansFailure`/`driftMeansFailure`/`envFail`/`requires`/`fixer`; unset fields inherit.
- `<pluginId>.extraGates: [<GateSpec>, …]` — repo-specific gates appended after the builtins; `id`+`argv` mandatory; `anystack`'s entire gate list comes from here (its own builtin gate list is empty).

**V-08 закрыта:** `extraGates` reach the phase ladder through `resolveAnystackPreset`; D-64 additionally passes them through `applyStackConfig` in the assembled full-profile so runtime command properties are preserved. `overrideGates`/`skipGates` still have no effect for anystack because it has no builtin gates.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 8. File Structure

```
shared/verify/
├── verify.types.ts
├── env-fail.ts
├── tree-guard.ts
├── stack-registry.ts
├── plugin-api.ts
├── stack-config.ts
└── presets/            <!-- V-04 node, V-08 anystack, V-09 golang, V-11 swift -->
services/config/
└── config-loader.ts
plugins/
├── index.ts
├── anystack/**
├── golang/**
└── swift/**
```

**File Mapping:** см. Entity Inventory (§4) — один-к-одному с этим деревом; `presets/` подключён задачами V-04/V-08/V-09/V-11.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 9. Module Decision Log

Четыре записи: узкий waiver L-21, мультистек-контракт D-64, граница Go repair V-09 и Swift runtime boundary V-11.

<details>
<summary>Полные записи Decision Log</summary>

### VERIFY-DL-1 — Узкий waiver в новой спеке вместо слияния V-02/V-04 или исключения гейта `yagni`

- **Status:** active
- **Why:** `R-V-02.md` §4 зафиксировал 4 варианта разблокировки коммита V-02 (перенос примитивов без вызовов бьётся о гейт `yagni`, а `specs/**` был вне периметра «трогать» у исполнителя). Lead выбрал вариант 1 — точечный новый файл `specs/cli/verify/verify.spec.md` с `Usage Waiver` по существующему механизму, не сливая задачи и не отключая гейт. Каждая запись называет задачу-владельца; снятие записи — обязанность этой задачи, а не разовая амнистия.

### VERIFY-DL-2 / D-64 — Primary и full-profile в мультистек-репозитории

- **Status:** active
- **Decision:** без `stack.use` detected-множество упорядочивается `swift > golang > node > anystack`, где anystack — default last-resort. `stack.use` задаёт порядок только пересечения с реально detected стеками: сужает и приоритизирует, но не назначает отсутствующий стек. Явно перечисленный `anystack` является реально applicable always-match и участвует ровно на позиции списка (`[anystack, node]` на Node-репозитории делает anystack primary); markerless корень без `stack.use` сохраняет отдельный `bootstrapNode` fallback.
- **Full profile:** primary единолично владеет блокирующим full-profile. После него идут гейты остальных detected стеков: read-only, с qualified именами `stack:gate`, стабильным порядком и non-blocking verdict. Они видимы в JSON/текстовом отчёте и выбираются общим `--only`/`--skip` matcher.
- **Single model:** `sdd-verify --profile full` исполняет, а `gennady verify --plan --json` отображает один `AssembledFullProfile`; расхождение порядка/команд/обязательности между фасадами запрещено.
- **Deferred:** сведение plugin и preset в одну модель (plugin↔preset convergence, Variant C) не реализуется в PR #46 и остаётся отдельным design track. Поэтому detected primary без реализованного preset отказывает fail-closed до своей стековой пачки, а не подменяется Node.

### VERIFY-DL-3 — Go phase repair ограничен exact Target Files

- **Status:** active
- **Decision:** V-09 исполняет `fix` как `gofmt -w` только над `.go`-файлами из структурных Target Files. Он не запускает `go mod tidy`, не меняет `go.mod`/`go.sum` и не форматирует соседние `.go`-файлы. `type-check` отображается в literal plugin `go build` + `go vet`, `test` — в `go test`; `generate` drift и `gofmt -l` принадлежат только full-profile.
- **Why:** обзор трека §3.1.4 одновременно предлагал module-wide `go mod tidy` и требовал phase repair «только по Target Files». Эти требования несовместимы с действующим runtime write-zone: `tidy` может менять module manifests вне declared targets. Узкая acceptance V-09 и операторское решение выбирают exact-target repair; module maintenance должна быть отдельной явно владеющей фазой, а не скрытой частью formatter rung.

### VERIFY-DL-4 — Swift environment, project-owned Xcode argv и generated-output boundary

- **Status:** active
- **Decision:** Swift `environmentState` = hash отсортированного repo-relative набора Swift/Xcode/Tuist manifests+locks плюс успешные `swift --version` и `xcodebuild -version`; gate commands остаются только в `planState`. SwiftPM defaults допустимы только при root `Package.swift`; Xcode/Tuist workspace/scheme/destination задаёт `stack.swift` config. Phase `fix` работает по exact Target Files. Workspace mutation scan пропускает только реально gitignored output. `xccov` producer экспортирует canonical/current bounded `.xcresult`, созданный project-owned test gate, и сохраняет mtime bundle в JSON-report для честной freshness.
- **Why:** generic Xcode argv неизбежно угадывает project identity, полный hash DerivedData неприемлем на реальном cloud-ios, а новый JSON mtime после экспорта скрывал бы stale source относительно старого test bundle. Эти границы сохраняют ownership проекта, производительность и fail-closed evidence одновременно.
- **Eval fixture:** опубликованный cloud-ios commit `d9de0f7c16824aff043be8332818154d9ed00960` остаётся immutable; обязательный V-19 scope для долгих legacy build/test gates добавляется только deterministic overlay внутри isolated eval worktree перед переносом literals в Swift overrides.
- **Runtime validation: DEFERRED / UNVERIFIED IN REAL XCODE.** По решению оператора release validation должна проверить exact `xccov` argv и JSON shape, duplicate source paths across targets, bundle-mtime freshness, единый active Xcode/`DEVELOPER_DIR`, реальные workspace/scheme/destination/runtime и resource cost. Unit/contract tests зелёные, а parser фейлится closed, но это не является runtime proof E-18.

</details>

<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 10. Inter-Module Dependencies

- **Depends on:** None (перенесённый код пока изолирован — см. Overview, §2)
- **Scope Reference (cross-scope):** None
- **Provides to:** [sdd-verify](../sdd-verify/sdd-verify.spec.md) (node, anystack, golang и swift presets подключены к фазовой/full модели), [sdd-state](../sdd-state/sdd-state.spec.md) (общий stack detection/readiness), `testcov` (Swift xccov adapter)

```mermaid
graph TD
  verify["verify"] -- "V-08: anystack preset + config gates" --> sdd-verify["sdd-verify"]
  verify -- "V-09: Go preset/readiness/environment" --> sdd-verify
  verify -- "V-11: Swift preset/readiness/xccov" --> sdd-verify
  verify -- "V-03/V-04/V-04a/V-07: gate contracts/config preflight" --> sdd-verify
  verify -- "V-05: STACK=/STACK_SOURCE=" --> sdd-state["sdd-state"]
```

_Кто подключит `verify` к своему ладдеру и какая задача проведёт это ребро._

<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 11. Handoff to Tasks

- **Implementation files to be created:** `shared/verify/presets/golang.ts` (V-09) — `presets/{node,anystack}.ts` (V-04/V-08) and `shared/verify/stack-detection.ts` (V-05) already exist
- **Test files to be created:** по каждой задаче-владельцу — см. `30-TRACK-VERIFY.md` §6, колонка «тесты, которые добавляются»
- **Stack dependencies:**
  - Language: `typescript` (резолвится в `ai/directives/coding/typescript-rules.xml`)
  - Test framework: `node:test` (резолвится в `ai/directives/testing/baseline-testing.xml`)
- **Module Rules Additions:** None

  | Rule | Category | Source |
  | ---- | -------- | ------ |
  | None | —        | —      |

- **Open risks & validation needs:**
  - `StackRun`/`VerifyReport` (§6) — **закрыто по факту V-16a (V-BATCH-13):** предполагаемый владелец `gennady verify --plan --json` closed with its own `VerifyPlanDocument`/`VerifyPlanGate`, not the MAIN shape — owner exhausted, unassigned; revisit if/when «extraGates/anystack вживляются в полный профиль» lands, else candidates for removal.
  - `validateStackConfig`/`ConfigSectionLoad`/`allOf` (§6) — **закрыто по факту V-07:** подключение `loadStackConfig` не добавило новую текстовую ссылку на эти три символа (только исполняет их на реальном CLI-пути, доказано e2e); владелец не назначен — снимается, когда появится прямой второй call site.
  - `unmatchedGateOverrides` (§6) остаётся без владельца; `applyStackConfig` снят с waiver после реального D-64 вызова из assembled full-profile.
  - `C`/`I`/`Bad` (§6) — структурный false-positive source-policy `yagni` на `e2e/fixtures/**`; если V-09 не даст реального второго упоминания, нужна отдельная задача на сужение `yagni` (вне этой волны).

<!--/SECTION:HANDOFF-->
