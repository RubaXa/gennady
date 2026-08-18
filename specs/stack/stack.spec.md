# stack: Scope Specification

## scope-type

library

## 1. Vision & Primary Goal

Плагинная система стеков: **слой per-stack и per-repo знаний для всех команд «Геннадия»**. Стек (node, golang, дальше — любой) — деталь реализации за общим интерфейсом `StackPlugin`; различия между репозиториями выражаются не разными командами, а конфигом (см. [config.spec.md](./config/config.spec.md)), который переопределяет и расширяет встроенные плагины.

Проблема: сегодня каждая команда, которая шеллится наружу, несёт захардкоженные знания об npm (`verify.sh` → `classify-scripts` → `npm run …`; `testcov` → vitest/jest; `resolve-verify-commands` → `package.json`). Каждый новый стек порождал бы новые команды (`go-verify`, `rust-verify`, …) — анти-паттерн «в разных репах разные команды Геннадия».

Вместо этого:

- **Единые глаголы.** Команды «Геннадия» не меняются от стека к стеку; плагин выбирается авто-детекцией или конфигом.
- **Возможности (capabilities), а не одна функция.** `StackPlugin` — набор опциональных фасетов; каждый фасет обслуживает одну команду CLI. Первый фасет — `verify`; последующие (`testcov`, `lint`-таргеты, `orient`-контекст) добавляются без слома интерфейса. Полный список — §4.
- **Единый контракт verify.** RUN-ALL (все гейты выполняются, отказы накапливаются), SUPPRESS-ON-SUCCESS (успешные гейты молчат), коды выхода `0/1/4/5` — не зависят от стека.
- **Гейты никогда не мутируют** рабочее дерево (никаких `go fmt` / `prettier --write` внутри верификации).
- **FAIL ≠ ENV_FAIL.** Отказ инструмента (паника линтера, недоступный module proxy) — не finding по коду; отчёт явно запрещает агенту «чинить» код в ответ.
- **Конфиг — точка расширения.** Репозиторий описывает свою инфраструктуру один раз в `gennady.yaml`; поддерживаются внешние плагины для проприетарных стеков (v2, FR-STACK-11).

## 2. Definitions

_Каждый термин ниже используется всеми спеками scope. Термины «Геннадия», не определённые здесь, ссылаются на свои спеки._

| Term                    | Definition                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stack**               | Технологический стек репозитория, определяемый маркер-файлами: `node` (`package.json`), `golang` (`go.mod`). Репозиторий может принадлежать нескольким стекам одновременно.                                           |
| **StackPlugin**         | Реализация интерфейса §4 для одного стека: детекция + набор capability-фасетов. Встроенные: `node`, `golang`. Внешние — FR-STACK-11 (v2).                                                                             |
| **Capability**          | Опциональный фасет плагина, обслуживающий одну команду CLI. v1: `verify`. Планируемые: `testcov`, `lint`, `orient` (§4.3).                                                                                            |
| **Gate**                | Одна верификационная команда с бинарным вердиктом: `argv` + `cwd` + `env` + `timeout` + контракт вывода. Гейт **наблюдает** — он никогда не изменяет рабочее дерево. Исполняется без shell.                           |
| **Gate plan**           | Упорядоченный список гейтов, построенный плагином для скоупа и доработанный конфигом (`overrideGates` → `skipGates` → `extraGates`).                                                                                  |
| **Scope**               | Подмножество репозитория, к которому применяется прогон: явные цели (`files`), изменения от базовой ветки (`changed`, default) или весь репозиторий (`all`).                                                          |
| **Detection**           | Результат распознавания репозитория плагином: сводка для `--plan`, диагностики окружения, приватные данные плагина. Алгоритм — §3.                                                                                    |
| **Diagnostic**          | Проблема окружения, найденная до запуска гейтов: `code` + `message` + `fix`. Никогда не игнорируется молча.                                                                                                           |
| **RUN-ALL**             | Контракт прогона: выполняются все гейты плана независимо от отказов предыдущих; отказы накапливаются в одном отчёте.                                                                                                  |
| **SUPPRESS-ON-SUCCESS** | Контракт отчёта: прошедший гейт не даёт ни строки вывода; печатаются только отказы, скипы и диагностики.                                                                                                              |
| **FAIL**                | Гейт отработал и нашёл проблему **в коде**. Агент правит код.                                                                                                                                                         |
| **ENV_FAIL**            | Инструмент гейта не смог отработать (паника, ошибка конфига, недоступный registry/proxy, version skew). Код не виноват; отчёт запрещает править исходники. Классифицируется декларативными `envFail`-правилами гейта. |
| **TIMEOUT**             | Гейт превысил свой per-gate `timeout` и был убит. Отдельный статус, не FAIL.                                                                                                                                          |
| **Stack config**        | Секция `stack` конфига «Геннадия» — [config.spec.md](./config/config.spec.md).                                                                                                                                        |

## 3. Detection Algorithm

Детекция определяет, какие плагины активны для репозитория. Алгоритм детерминирован:

1. **Кандидаты.** Берётся реестр встроенных плагинов в фиксированном порядке: `[node, golang]` (+ внешние из `stack.use`, v2).
2. **Ограничение `use`.** Если в конфиге задан `stack.use` — реестр сужается до перечисленных id. Неизвестный id → диагностика `STACK_USE_UNKNOWN`, **не** тихое игнорирование. CLI-флаг `--stack=<id>` действует как одноразовый `use`.
3. **Опрос.** У каждого кандидата вызывается `detect(root)`:
   - `node`: `package.json` в корне существует и парсится как JSON. Битый JSON → не распознан (детекция не может доверять содержимому).
   - `golang`: хотя бы один `go.mod` в корне или до 3 уровней вглубь (BFS, минуя `vendor/`, `testdata/`, `node_modules/`, скрытые каталоги). Ближайший к корню модуль — первичный.
4. **Активные = все распознавшие.** Репозиторий может быть node и golang одновременно — оба плагина активны, их гейты объединяются в один прогон в порядке реестра.
5. **Ноль активных** → `NO_STACK_DETECTED`, exit 5, с перечнем известных маркеров и подсказкой (`--root`, `stack.use`).

Инварианты: `detect` не мутирует дерево; из процессов позволены только короткие probe-вызовы версий инструментов (например `golangci-lint version`, чтобы поймать version skew до прогона).

## 4. StackPlugin Interface

### 4.1 Ядро

```ts
type StackPlugin = {
  /** Уникальный id плагина: 'node' | 'golang' | (v2: внешний id). */
  readonly id: StackId;

  /**
   * Распознать репозиторий. null — репозиторий не принадлежит стеку.
   * Инвариант: не мутирует дерево; процессы — только version-probe'ы.
   */
  detect(root: string): StackDetection | null;

  /** Capability-фасеты. v1: обязателен только verify. */
  readonly verify: StackVerifyCapability;
  // future (v2+, добавляются как опциональные поля — см. §4.3):
  // readonly testcov?: StackTestcovCapability;
  // readonly lint?: StackLintCapability;
};
```

### 4.2 Фасет `verify`

```ts
type StackVerifyCapability = {
  /**
   * Сузить прогон. request.mode: 'files' (явные цели) | 'changed' (diff от
   * базовой ветки + staged + untracked; default) | 'all' (весь репозиторий).
   * Плагин, не умеющий сужаться (node: npm-скрипты репо-уровневые), возвращает
   * репо-уровневый scope с честным note.
   */
  resolveScope(detection: StackDetection, request: ScopeRequest): StackScope;

  /**
   * Построить упорядоченный план гейтов. Каждый гейт несёт обязательный
   * timeout (§5 D-STACK-007) и опциональные envFail-правила. Неисполнимый
   * гейт представлен skipped: <reason>, а не выброшен.
   */
  planGates(detection: StackDetection, scope: StackScope, options: GatePlanOptions): Gate[];
};
```

Ключевые типы данных (полные поля — Entity Inventory §6):

```ts
type Gate = {
  id: string; // 'build', 'test', ... — уникален внутри плагина
  stack: StackId; // в отчётах гейт именуется `${stack}:${id}`
  label: string;
  argv: readonly string[]; // исполняется spawn'ом БЕЗ shell
  cwd: string;
  env?: Readonly<Record<string, string>>; // merge поверх process.env
  timeoutMs: number; // ОБЯЗАТЕЛЕН; общий лимит прогона = сумма
  outputMeansFailure: boolean; // контракт `gofmt -l`: exit 0 + stdout = FAIL
  envFail?: { exitAbove?: number; patterns?: readonly string[] };
  skipped: string | null;
};
```

### 4.3 Roadmap возможностей (ответ на «только verify?»)

Каждая команда «Геннадия», шеллящаяся наружу, со временем получает свой фасет; знания о стеке уходят из команд в плагины. Порядок внедрения — по фактической боли:

| Capability        | Команда CLI                                          | Что отдаёт плагин                                                                                | Статус                             |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `verify`          | `gennady verify` (+ `verify.sh` skill-гейт)          | детекция, скоуп, план гейтов                                                                     | **v1 (этот scope)**                |
| `testcov`         | `gennady testcov`                                    | как запустить тесты с coverage, где искать отчёт (go: `go test -coverprofile` + `go tool cover`) | planned                            |
| `lint`            | `gennady lint` (resolve-targets)                     | какие расширения/файлы линтить DbC-линтером per stack                                            | planned                            |
| `verify-commands` | prompt-плейсхолдеры (`build-ai-verify-placeholders`) | безопасные команды верификации для промптов — сейчас захардкожены, замыкаются на фасет `verify`  | planned (v1.1: читает план verify) |
| `orient`          | `gennady orient`                                     | per-stack карта входных точек / модулей                                                          | idea                               |

Инвариант интерфейса: новые фасеты добавляются **опциональными полями** — существующие плагины не ломаются.

## 5. Functional Requirements

| ID          | Requirement                                                                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-STACK-01 | `StackPlugin` — общий интерфейс стека: `id`, `detect`, capability-фасеты; v1-фасет `verify` = `resolveScope` + `planGates` (§4)                                                                                                                                                                                              |
| FR-STACK-02 | Реестр встроенных плагинов `node`, `golang`; детекция по алгоритму §3; активны все распознавшие                                                                                                                                                                                                                              |
| FR-STACK-03 | `gennady verify` — стек-агностичная команда: детекция → скоуп → план → RUN-ALL прогон → отчёт; `--plan` показывает план и диагностику без запуска                                                                                                                                                                            |
| FR-STACK-04 | Конфиг по [config.spec.md](./config/config.spec.md): `use`, per-plugin `skipGates` / `overrideGates` / `extraGates` + плагин-специфичные ключи                                                                                                                                                                               |
| FR-STACK-05 | Порядок применения конфига: план плагина → `overrideGates` → `skipGates` → `extraGates`. `overrideGates` и `extraGates` разделяют одну схему `GateSpec` (`argv`, `cwd`, `env`, `timeout`, `outputMeansFailure`)                                                                                                              |
| FR-STACK-06 | Гейт — чистые данные; исполняется без shell; `env` мержится поверх окружения процесса; раннер один на все стеки                                                                                                                                                                                                              |
| FR-STACK-07 | **Per-gate timeout обязателен** для каждого исполняемого гейта; дефолты задаёт плагин per-gate, конфиг переопределяет; глобального таймаута нет — верхняя граница прогона = сумма таймаутов плана (D-STACK-007)                                                                                                              |
| FR-STACK-08 | Классификация отказов: `fail` / `env-fail` (по `envFail`-правилам гейта) / `timeout` / `skipped` (с причиной)                                                                                                                                                                                                                |
| FR-STACK-09 | golang-плагин: гейты `build → vet → fmt → lint → test [→ tidy]`; `-mod=vendor` при вендоринге (кроме `go.work`); конфиг golangci через `-c`, включая имена без точки; скоуп по умолчанию — пакеты, изменённые от базовой ветки; диагностики version-skew / nested-modules / missing-config                                   |
| FR-STACK-10 | node-плагин: гейты из npm-скриптов `package.json` по классификатору (typecheck / gennady / lint / test / format); watch-скрипты и umbrella-скрипты исключаются; скоуп репо-уровневый                                                                                                                                         |
| FR-STACK-11 | **Внешние плагины (v2):** `stack.use` принимает ссылку на внешний плагин (`gitlab.corp.mail.ru/sdd/my-awesome-stack`); плагин — исполняемый файл, реализующий JSON-протокол detect/scope/plan через stdin/stdout. Поверхность конфига зарезервирована в v1; исполнение чужого кода — за явным opt-in в конфиге (D-STACK-001) |
| FR-STACK-12 | `verify.sh` (skill `sdd-execute`) делегирует в `gennady verify`, если тот доступен (с capability-probe против старых установок); легаси npm-путь остаётся фоллбеком                                                                                                                                                          |

## 6. Approved Golden DX Example

```bash
# --- любой репозиторий: план без запуска ---
$ gennady verify --plan

[verify] plan for /repo (stacks: golang)
  module:    gitlab.corp.mail.ru/e-mail-ru/mailapi (go 1.26.2)
  vendored:  true
  config:    /repo/golangci.yml
  scope:     changed — 2 Go file(s) changed vs origin/master

  ⚠️  GOLANGCI_GO_TOO_OLD: golangci-lint built with go1.25.5, module requires go1.26.2 — the linter will panic.
      fix: install a newer golangci-lint, or skip via gennady.yaml: stack.golang.skipGates: [lint]

  ▶️  golang:build  [5m]  go build -mod=vendor ./maillibs/urlshortener
  ▶️  golang:vet    [5m]  go vet -mod=vendor ./maillibs/urlshortener
  ▶️  golang:fmt    [1m]  gofmt -l maillibs/urlshortener/shortener.go
  ▶️  golang:lint   [5m]  golangci-lint run -c /repo/golangci.yml ./maillibs/urlshortener
  ▶️  golang:test   [10m] go test -timeout=10m -mod=vendor ./maillibs/urlshortener

# --- happy path: всё прошло — одна строка ---
$ gennady verify
[verify] ALL_GATES_PASS (5/5) — golang: 2 Go file(s) changed vs origin/master
# exit 0

# --- отказ гейта: команда, cwd, exit, вывод ---
$ gennady verify
[verify] ❌ FAIL gate: golang:vet — go vet
  command: go vet -mod=vendor ./maillibs/urlshortener
  cwd:     /repo
  exit:    1
--- captured output ---
./shortener.go:42:2: fmt.Printf format %d has arg s of wrong type string
--- end ---
# exit 1

# --- отказ инструмента: агенту явно запрещено «чинить» код ---
$ gennady verify --only=lint
[verify] ❌ ENV_FAIL gate: golang:lint
  note:    the tool itself failed to run — this is NOT a finding about the code.
           Fix the toolchain; do not change source in response to this output.
# exit 1

# --- node-репозиторий: та же команда, тот же контракт ---
$ gennady verify
[verify] ALL_GATES_PASS (4/4) — node: npm scripts (type-check, lint:contracts, test, format:check)

# --- явные цели и подмножества гейтов ---
$ gennady verify internal/userapi
$ gennady verify --all --skip=test
$ gennady verify --only=build,vet --json

# --- не распознан ни один стек ---
$ cd /tmp/empty && gennady verify
[verify] NO_STACK_DETECTED: no stack plugin recognized /tmp/empty
  known stacks: node (package.json), golang (go.mod)
  fix: run from a project root, pass --root=<path>, or declare stack.use in gennady.yaml
# exit 5
```

Пример конфига репозитория (`gennady.yaml`; полный справочник полей — [config.spec.md](./config/config.spec.md)):

```yaml
stack:
  use: [golang]
  golang:
    skipGates: [lint] # golangci-lint здесь собран старым Go — до обновления
    testTimeout: 10m
    overrideGates:
      build:
        env:
          GOPROXY: http://gomods.mail.cloud.devmail.ru:3000/ # корп-прокси модулей
      test:
        argv: [make, test]
        timeout: 15m
    extraGates:
      - id: codegen-drift
        argv: [make, check-generated]
        timeout: 3m
```

## 7. Entity Inventory (Closed-World)

| Name                                           | Type         | Purpose                                                                                                             |
| ---------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `StackPlugin`                                  | Interface    | §4: `id`, `detect`, capability-фасеты (v1: `verify`)                                                                |
| `StackVerifyCapability`                        | Interface    | Фасет verify: `resolveScope` + `planGates`                                                                          |
| `StackId`                                      | Type         | `'node' \| 'golang'` (v2: + внешние id)                                                                             |
| `StackDetection`                               | Value Object | Результат детекции: `stack`, `root`, `summary` (строки для `--plan`), `diagnostics`, `details` (per-plugin payload) |
| `StackDiagnostic`                              | Value Object | `code`, `message`, `fix`                                                                                            |
| `ScopeRequest`                                 | Value Object | `mode` (`files`/`changed`/`all`), `targets`                                                                         |
| `StackScope`                                   | Value Object | `mode`, `note`, `details` (per-plugin)                                                                              |
| `Gate`                                         | Value Object | §4.2: `id`, `stack`, `label`, `argv`, `cwd`, `env?`, `timeoutMs`, `outputMeansFailure`, `envFail?`, `skipped`       |
| `GateEnvFailRule`                              | Value Object | `exitAbove?`, `patterns?`                                                                                           |
| `GateResult`                                   | Value Object | `gate`, `status` (`pass\|fail\|env-fail\|skipped\|timeout`), `exitCode`, `durationMs`, `output`                     |
| `StackRun`                                     | Value Object | Вклад одного стека: `detection`, `scope`, `gates`                                                                   |
| `VerifyReport`                                 | Value Object | `runs`, `diagnostics`, `results`, `passed`, `total`, `ok`                                                           |
| `GatePlanOptions`                              | Value Object | `tidy` + `pluginConfig` (срез конфига плагина)                                                                      |
| `StackConfig`, `StackPluginConfig`, `GateSpec` | Type         | Схема конфига — [config.spec.md](./config/config.spec.md)                                                           |
| `loadStackConfig`                              | Function     | Чтение конфига по порядку discovery из config.spec §2; невалидное → диагностика, не крах                            |
| `pluginConfigOf`                               | Function     | Извлечение среза конфига одного плагина с толерантностью к мусору                                                   |
| `applyStackConfig`                             | Function     | Применение конфига к плану: `overrideGates` → `skipGates` → `extraGates` (FR-STACK-05)                              |
| `detectStacks`                                 | Function     | Алгоритм §3                                                                                                         |
| `BUILTIN_STACK_PLUGINS`                        | Constant     | `[nodePlugin, golangPlugin]`                                                                                        |
| `runVerify`                                    | Function     | RUN-ALL исполнение планов всех стеков без shell; per-gate timeout; классификация статусов                           |
| `formatVerifyReport`                           | Function     | Отчёт: диагностики + скипы + отказы (усечение вывода) + summary при успехе                                          |
| `nodePlugin`                                   | Service      | `StackPlugin` для npm-репозиториев                                                                                  |
| `classifyNpmScripts`                           | Function     | Эвристика классификации npm-скриптов: typecheck/gennady/lint/test/format                                            |
| `golangPlugin`                                 | Service      | `StackPlugin` для Go-репозиториев                                                                                   |
| `detectGoProject`                              | Function     | Детекция Go: модули (BFS ≤3), `go.work`, вендоринг, конфиг golangci, тулчейн, диагностики                           |
| `resolveGoScope`                               | Function     | Скоуп: `files` / `changed` / `all`                                                                                  |
| `planGoGates`                                  | Function     | План гейтов Go: build → vet → fmt → lint → test [→ tidy]                                                            |
| `run`                                          | Command      | CLI `gennady verify`                                                                                                |

## 8. Module Contracts (DbC)

### 8.1 StackPlugin

- **Runtime Backing:** `real-runtime` · **Verification Levels:** `unit`

- Preconditions: `detect(root)` получает абсолютный существующий путь.
- Postconditions: `detect` → null или `StackDetection` с непустым `summary`; `planGates` → детерминированный порядок; каждый исполняемый гейт имеет `timeoutMs > 0`; неисполнимый гейт — `skipped: <reason>`, не исключение.
- Invariants: плагин не мутирует дерево; процессы на `detect` — только version-probe'ы; плагин не знает о конфиге (overrides применяет `applyStackConfig` поверх плана).

### 8.2 Gate Runner

- **Runtime Backing:** `real-runtime` · **Verification Levels:** `unit`

- Preconditions: каждый исполняемый гейт имеет непустой `argv[0]` и `timeoutMs > 0`.
- Postconditions: RUN-ALL; SUPPRESS-ON-SUCCESS; `outputMeansFailure: true` + exit 0 + непустой stdout → `fail`; превышение `timeoutMs` → `timeout`; совпадение `envFail` → `env-fail` + запрет менять код в отчёте; `ok === true` ⇔ все исполненные гейты `pass`.
- Invariants: `spawnSync(argv)` без shell; `gate.env` мержится поверх `process.env`; вывод отказа усечён с маркером и командой воспроизведения.

### 8.3 Stack Config

- Контракты схемы и деградации — [config.spec.md](./config/config.spec.md) §5.

### 8.4 Verify Command

- **Runtime Backing:** `real-runtime` · **Verification Levels:** `unit`, `e2e`

- Postconditions: exit `0` — все гейты прошли; `1` — отказ; `4` — неверный вызов (неизвестный гейт в `--only`/`--skip`, неизвестный `--stack`); `5` — ни один плагин не распознал репозиторий. `--plan` не исполняет ни одного гейта. `--json` — машиночитаемые `runs` + `results`.
- Invariants: явные позиционные цели → `files`; `--all` → `all`; иначе `changed`.

## 9. File Structure

```
services/stack/
├── stack.types.ts                     # Closed-world типы §7
├── stack-registry.ts                  # BUILTIN_STACK_PLUGINS + detectStacks() (§3)
├── stack-config.ts                    # loadStackConfig() + applyStackConfig() (config.spec)
├── gate-runner.ts                     # runVerify() + formatVerifyReport()
└── plugins/
    ├── node/
    │   ├── node-plugin.ts
    │   └── classify-npm-scripts.ts
    └── golang/
        ├── golang-plugin.ts
        ├── golang-detect.logic.ts
        ├── golang-scope.logic.ts
        └── golang-plan.logic.ts

cli/cmd/verify/
├── index.ts
├── verify.cmd.ts
└── help.ts
```

**Registration points:** `cli/gennady.ts`, `cli/cmd/help/help.cmd.ts`, `cli/cmd/README.md`, `README.md`, `ai/skills/sdd-execute/scripts/verify.sh` (FR-STACK-12).

## 10. Decision Log

### D-STACK-001 — Внешние плагины: поверхность в v1, исполнение в v2

- **Status:** active (пересмотрено по ревью)
- **Why:** Верификация — доверенная поверхность: она исполняет команды. Но проприетарные стеки внутри периметра неизбежны, поэтому **протокол проектируется сейчас**: внешний плагин — исполняемый файл, реализующий JSON-протокол (`detect`/`scope`/`plan` через stdin/stdout), подключаемый через `stack.use: ["gitlab.corp.mail.ru/sdd/my-awesome-stack"]`. Исполнение чужого кода происходит только по явной записи в конфиге репозитория — то есть по opt-in владельца репо. v1 резервирует поверхность (`use` с неизвестным встроенным id даёт диагностику со ссылкой на v2), v2 реализует загрузку.
- **Rejected alternatives:** npm-резолв `gennady-stack-*` (магия без явного opt-in), запрет внешних плагинов навсегда (не переживёт первый проприетарный стек).

### D-STACK-002 — Конфиг: `gennady.yaml` (коммитится) + `.gennadyrc` (личный, легаси)

- **Status:** active (пересмотрено по ревью)
- **Why:** Полное обоснование и схема — [config.spec.md](./config/config.spec.md). Кратко: YAML ради комментариев (конфиг инфраструктуры без комментариев не живёт); `.gennadyrc` в gitignore из-за ключей в `models`, поэтому коммитимая часть — отдельный файл; парсер YAML — dev-зависимость, бандлится Vite (политика zero-runtime-deps сохраняется).

### D-STACK-003 — Гейт — данные, раннер — один

- **Status:** active
- **Why:** Пока гейт — это `argv + cwd + env + timeout + контракт`, RUN-ALL/SUPPRESS-ON-SUCCESS/усечение/таймаут/классификация написаны один раз и не могут разъехаться между стеками. Плагины остаются чистыми планировщиками — тестируются без запуска процессов.

### D-STACK-004 — env-fail-правила принадлежат гейту, не раннеру

- **Status:** active
- **Why:** «Паника golangci-lint», «exit > 1 у линтера», «Forbidden от module proxy» — знания Go-стека. Раннер применяет декларативные `envFail`-правила из гейта; ни одного стек-специфичного регекспа в общем коде.

### D-STACK-005 — Мутирующие команды запрещены как гейты

- **Status:** active
- **Why:** `go fmt` / `prettier --write` / `go mod tidy` переписывают дерево — гейт никогда не падает и молча дописывает диф агента посреди фазы. Проверочные формы: `gofmt -l` (+ `outputMeansFailure`), `prettier --check`, `go mod tidy -diff`. Autofix — отдельное явное действие оператора. Относится и к `extraGates` из конфига.

### D-STACK-006 — node-плагин игнорирует позиционные цели

- **Status:** active
- **Why:** npm-скрипты — репо-уровневые команды; сузить `npm run test` до файла нельзя без знаний о раннере (это забота будущего фасета `testcov`). Честное поведение: node-гейты всегда репо-уровневые, `scope.note` это фиксирует.

### D-STACK-007 — Per-gate timeout обязателен; глобального таймаута нет

- **Status:** active (по ревью)
- **Why:** Два источника таймаута (глобальный + локальный) — кластер багов «timeout inconsistency»: глобальный убивает прогон посреди здорового гейта, локальный молча перекрывается глобальным. Один источник истины: каждый гейт несёт `timeoutMs`; дефолты — у плагина per-gate (build/vet/lint 5m, fmt 1m, test 10m, tidy 5m; node-скрипты 10m); конфиг переопределяет per-gate. Верхняя граница прогона предсказуема — сумма таймаутов плана, видна в `--plan`.
- **Rejected alternatives:** глобальный `--timeout` (v1-прототип; убран).

### D-STACK-008 — Capability-фасеты вместо монолитного интерфейса

- **Status:** active (по ревью)
- **Why:** Per-stack параметризация нужна не только verify: testcov, lint-таргеты, verify-плейсхолдеры промптов — все шеллятся наружу со знаниями о стеке. Монолитный интерфейс «всё сразу» заставил бы каждый плагин реализовывать всё; фасеты позволяют добавлять возможности опциональными полями без слома существующих плагинов (§4.3).

## 11. Inter-Module Dependencies

- **Depends on:** `shared/backend/rc/rc-config.ts` (личный `.gennadyrc`), `shared/common/parse-args.ts`
- **Provides to:** `cli` (команда `verify`; далее — testcov/lint по §4.3), `ai-skills` (`verify.sh`, skill `sdd-infra-golang`)

## 12. Handoff to Task Scaffolding

- **Tasks (v1):** TSK-95 (библиотека: types, config, registry, runner, plugins node+golang), TSK-96 (CLI `verify` + `verify.sh` делегация + документация)
- **Deferred (scaffold after v1):** внешние плагины по FR-STACK-11 (JSON-протокол + загрузчик); фасет `testcov`; фасет `lint`; миграция `resolve-verify-commands` на фасет verify
- **Stack dependencies:** TypeScript → `ai/directives/coding/typescript-rules.xml`; node:test → `ai/directives/testing/node-test.xml`
- **Prototype:** рабочая реализация v1 (73 unit-теста, проверена на mailapi/cloudapi/gennady) лежит на ветке `impl/stack-plugin-system` и будет перебазирована на утверждённую спеку (renames: `skipGates`/`overrideGates`, `env`, per-gate `timeout`, YAML-конфиг)
