# stack: Scope Specification

## scope-type

library

## 1. Vision & Primary Goal

Плагинная система стеков: **слой per-stack и per-repo знаний для команд «Геннадия»**. Стек (node, golang, дальше — любой) — деталь реализации за общим интерфейсом `StackPlugin`; различия между репозиториями выражаются не разными командами, а конфигом ([config.spec.md](./config/config.spec.md)), который переопределяет и расширяет встроенные плагины.

Проблема: сегодня каждая команда, которая шеллится наружу, несёт захардкоженные знания об npm (`verify.sh` → `classify-scripts` → `npm run …`; `testcov` → vitest/jest; `resolve-verify-commands` → `package.json`). Каждый новый стек порождал бы новые команды (`go-verify`, `rust-verify`, …) — анти-паттерн «в разных репах разные команды Геннадия».

Вместо этого:

- **Единые глаголы.** Команды «Геннадия» не меняются от стека к стеку; плагин выбирается авто-детекцией или конфигом.
- **Возможности (capabilities): одна обязательная, остальные опциональные.** `StackPlugin` — набор фасетов; каждый фасет обслуживает одну команду CLI. Обязателен только `verify` — плагин, реализующий один `verify`, полноценен и usage-ready (это единственный фасет, от которого зависит цикл SDD execute→verify). Опциональные фасеты (`fix`, `testcov`, `dbc-lint`, `directives`) могут быть не реализованы, и их поддержка может различаться между плагинами. Классификация — §4.3.
- **Единый контракт verify.** RUN-ALL (все гейты выполняются, отказы накапливаются), SUPPRESS-ON-SUCCESS (успешные гейты молчат), коды выхода `0/1/4/5` — не зависят от стека.
- **Гейты никогда не мутируют** рабочее дерево. Мутирующие операции полезны (prettier --write, autofix, codegen) — но это **отдельная сущность** `Fixer` и отдельный глагол `gennady fix` (§4.4), никогда не смешиваемые с верификацией.
- **FAIL ≠ ENV_FAIL.** Отказ инструмента (паника линтера, недоступный module proxy) — не finding по коду; отчёт явно запрещает агенту «чинить» код в ответ.
- **Конфиг — точка расширения.** Репозиторий описывает свою инфраструктуру один раз в `gennady.yaml`; личные надстройки — deep-merge из `.gennadyrc` (config.spec §1.2).

Вне скоупа v1 (TODO, §12): внешние плагины для проприетарных стеков. Идея зафиксирована; дизайн отложен — в том числе вопрос формата подключения (ссылка — плохой id; вероятная форма: `use` как map `id → source`).

## 2. Definitions

_Каждый термин ниже используется всеми спеками scope. Термины «Геннадия», не определённые здесь, ссылаются на свои спеки._

| Term                    | Definition                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stack**               | Технологический стек репозитория, определяемый маркер-файлом в корне: `node` (`package.json`), `golang` (`go.mod`). Репозиторий может принадлежать нескольким стекам одновременно.                                                                           |
| **StackPlugin**         | Реализация интерфейса §4 для одного стека: детекция + фасет `verify` (обязательный) + опциональные фасеты. Встроенные: `node`, `golang`.                                                                                                                     |
| **Capability**          | Фасет плагина, обслуживающий одну команду CLI. Обязательный: `verify`. Опциональные: `fix`, `testcov`, `dbc-lint`, `directives` (§4.3); их поддержка может различаться между плагинами.                                                                      |
| **Gate**                | Одна верификационная команда с бинарным вердиктом: `argv` + `cwd` + `env` + `timeout` + контракт вывода. Гейт **наблюдает** — он никогда не изменяет рабочее дерево. Исполняется без shell. Квалифицированное имя: `<stack>:<id>` (например `golang:build`). |
| **Fixer**               | Мутирующая операция (`prettier --write`, `gennady lint --autofix`, codegen) — отдельная сущность §4.4. Исполняется только явным `gennady fix`; никогда не входит в verify-план.                                                                              |
| **Gate plan**           | Упорядоченный список гейтов, построенный плагином для скоупа и доработанный конфигом (`overrideGates` → `skipGates` → `extraGates`).                                                                                                                         |
| **Scope**               | Подмножество репозитория, к которому применяется прогон: явные цели (`files`), изменения от базовой ветки (`changed`, default) или весь репозиторий (`all`).                                                                                                 |
| **Detection**           | Результат распознавания репозитория плагином: сводка для `--plan`, диагностики окружения, приватные данные плагина. Алгоритм — §3.                                                                                                                           |
| **Diagnostic**          | Проблема окружения, найденная до запуска гейтов: `code` + `message` + `fix`. Никогда не игнорируется молча.                                                                                                                                                  |
| **RUN-ALL**             | Контракт прогона: выполняются все гейты плана независимо от отказов предыдущих; отказы накапливаются в одном отчёте.                                                                                                                                         |
| **SUPPRESS-ON-SUCCESS** | Контракт отчёта: прошедший гейт не даёт ни строки вывода; печатаются только отказы, скипы и диагностики.                                                                                                                                                     |
| **FAIL**                | Гейт отработал и нашёл проблему **в коде**. Агент правит код.                                                                                                                                                                                                |
| **ENV_FAIL**            | Инструмент гейта не смог отработать (паника, ошибка конфига инструмента, недоступный registry/proxy, version skew). Код не виноват; отчёт запрещает править исходники. Классифицируется предикатами гейта (§4.2).                                            |
| **TIMEOUT**             | Гейт превысил свой per-gate `timeout` и был убит. Отдельный статус, не FAIL.                                                                                                                                                                                 |
| **Stack config**        | Секция `stack` конфига «Геннадия» — [config.spec.md](./config/config.spec.md).                                                                                                                                                                               |

## 3. Detection Algorithm

Детекция определяет, какие плагины активны для репозитория. Алгоритм детерминирован и намеренно примитивен — **существования маркер-файла в корне достаточно**; для экзотических раскладок есть `stack.use`:

1. **Кандидаты.** Реестр встроенных плагинов в фиксированном порядке: `[node, golang]`.
2. **Ограничение `use`.** Если в конфиге задан `stack.use` — реестр сужается до перечисленных id. Неизвестный id → ошибка конфига (config.spec §4.1). CLI-флаг `--stack=<id>` действует как одноразовый `use`.
3. **Опрос.** У каждого кандидата вызывается `detect(root)`:
   - `node`: существует файл `<root>/package.json`. Содержимое на детекцию не влияет: сломанный агентом JSON не должен «раздетектить» плагин — битый файл всплывёт диагностикой на этапе планирования гейтов.
   - `golang`: существует файл `<root>/go.mod`. Поиска вглубь нет — overkill; для нестандартной раскладки оператор задаёт `use` и/или `--root`.
4. **Активные = все распознавшие.** Репозиторий может быть node и golang одновременно — оба плагина активны, их гейты объединяются в один прогон в порядке реестра.
5. **Ноль активных** → `NO_STACK_DETECTED`, exit 5, с перечнем известных маркеров и подсказкой (`--root`, `stack.use`).

Инварианты: `detect` не мутирует дерево; из процессов позволены только короткие probe-вызовы версий инструментов (например `golangci-lint version`, чтобы поймать version skew до прогона). Дополнительные обходы (например поиск вложенных `go.mod` для диагностики `NESTED_MODULES`) — информационные и на решение о детекции не влияют.

## 4. StackPlugin Interface

### 4.1 Ядро

```ts
type StackPlugin = {
  /** Уникальный id плагина: 'node' | 'golang'. */
  readonly id: StackId;

  /** Маркер-файл детекции (например `go.mod`) — все ростеры (help, ошибки) рендерятся из реестра. */
  readonly marker: string;

  /** Однострочное описание для help и ростеров. */
  readonly description: string;

  /**
   * Распознать репозиторий по маркер-файлу в корне (§3). null — не этот стек.
   * Инвариант: не мутирует дерево; процессы — только version-probe'ы.
   */
  detect(root: string): StackDetection | null;

  /** ОБЯЗАТЕЛЬНЫЙ фасет: плагин с одним verify полноценен (§4.3). */
  readonly verify: StackVerifyCapability;

  /** Опциональные фасеты; поддержка различается между плагинами (§4.3, §4.4). */
  readonly fix?: StackFixCapability;
  // readonly testcov?: StackTestcovCapability;     // planned, §4.3
  // readonly dbcLint?: StackDbcLintCapability;     // planned, §4.3
  // readonly directives?: StackDirectivesCapability; // planned, §4.5
};
```

**Почему `detect` возвращает `StackDetection`, а не boolean.** Решение «наш/не наш» действительно бинарно (§3), но по пути детекция собирает факты, которые нужны всем последующим шагам: строки сводки для `--plan`, диагностики окружения (version-skew ловится probe-вызовом уже здесь), распарсенные данные репозитория (для golang: вендоринг, путь конфига golangci, модуль) — они переиспользуются в `resolveScope`/`planGates` через `details`, чтобы каждый фасет не перечитывал диск заново. Boolean заставил бы делать ту же работу повторно в каждом фасете.

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
   * Построить упорядоченный план гейтов. Неисполнимый гейт представлен
   * skipped: <reason>, а не выброшен.
   */
  planGates(detection: StackDetection, scope: StackScope, options: GatePlanOptions): Gate[];
};

/**
 * Предикат классификации отказа: получает exit code и combined output гейта,
 * true = отказ вызван окружением (ENV_FAIL), а не кодом. Библиотека даёт
 * готовые комбинаторы; плагины составляют из них набор per-gate.
 */
type EnvFailPredicate = (exitCode: number | null, output: string) => boolean;

// Встроенные комбинаторы (services/stack):
//   exitAbove(n)        — exit code строго больше n (golangci-lint: >1 = поломка)
//   outputMatches(re)   — вывод содержит совпадение (например /^panic: /m)
// Сбой запуска процесса (ENOENT и т.п.) раннер классифицирует как ENV_FAIL сам —
// это environmental для любого стека, комбинатор не нужен.

type Gate = {
  /** Id гейта, уникален внутри плагина ('build', 'test', …). */
  id: string;
  /** Стек-владелец; квалифицированное имя в отчётах и CLI: `${stack}:${id}`. */
  stack: StackId;
  /** Короткая человекочитаемая подпись для отчётов. */
  label: string;
  /** Команда с аргументами; исполняется spawn'ом БЕЗ shell — без интерполяции и пайпов. */
  argv: readonly string[];
  /** Рабочая директория гейта (абсолютная). */
  cwd: string;
  /** Переменные окружения, мержатся поверх process.env; из конфига — GateSpec.env. */
  env?: Readonly<Record<string, string>>;
  /**
   * ОБЯЗАТЕЛЬНЫЙ per-gate таймаут (мс); превышение → статус TIMEOUT.
   * Глобального таймаута нет: верхняя граница прогона = сумма таймаутов плана
   * (D-STACK-007). Гейт, чей инструмент имеет собственный флаг таймаута
   * (go test -timeout), рендерит это же значение во флаг — инструмент
   * завершается сам чуть раньше жёсткого kill'а и успевает напечатать диагноз.
   */
  timeoutMs: number;
  /** Контракт `gofmt -l`: exit 0 + непустой stdout = FAIL. */
  outputMeansFailure: boolean;
  /** Предикаты ENV_FAIL; пусто/отсутствует — любой отказ трактуется как FAIL (код виноват). */
  envFail?: readonly EnvFailPredicate[];
  /** Причина, по которой гейт не исполняется (репортится, не запускается); null — исполняемый. */
  skipped: string | null;
};
```

### 4.3 Классификация capabilities: mandatory vs optional

**Обязательные** — без них плагин не является валидным `StackPlugin`, а v1 не является usage-ready. Обязателен ровно один фасет:

| Capability | Команда CLI                                 | Почему обязателен                                                                                | Задачи v1                                                       |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `verify`   | `gennady verify` (+ skill-гейт `verify.sh`) | Единственный фасет, от которого зависит цикл SDD execute→verify — то, ради чего scope существует | TSK-95 (библиотека + оба плагина), TSK-96 (команда + делегация) |

Отдельная обязательная команда `gennady build` не вводится: сборка уже является гейтом verify (`golang:build`; для node — typecheck как ближайший аналог компиляции), и точечный запуск покрыт `gennady verify --only=build`. Выделенная команда дублировала бы контракт verify ради одного гейта; если появится сценарий, где build нужен вне верификации (артефакты, кросс-компиляция) — это будет отдельный фасет со своей спекой.

**Опциональные** — могут быть не реализованы; поддержка может различаться между плагинами (плагин без опционального фасета честно репортит «не поддерживается» в соответствующей команде). Реализуются отдельными задачами после v1:

| Capability        | Команда CLI                        | Что отдаёт плагин                                                                                                                                                                                                                                                                                                                | Статус                                                                  |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `fix`             | `gennady fix` (новая)              | Fixer'ы — мутирующие операции стека (§4.4)                                                                                                                                                                                                                                                                                       | planned, post-v1                                                        |
| `testcov`         | `gennady testcov`                  | Как запустить тесты с coverage и где искать отчёт (go: `go test -coverprofile` + `go tool cover`); сегодня testcov захардкожен на vitest/jest/node:test                                                                                                                                                                          | planned, post-v1                                                        |
| `dbc-lint`        | `gennady lint`                     | Не путать с гейтом `lint` внутри verify: verify запускает **линтеры проекта** (golangci-lint, eslint) как гейты, а `gennady lint` — это **собственный DbC-линтер «Геннадия»** (контракты, file-headers, anchors). Фасет отдаёт ему per-stack таргеты: какие файлы/расширения парсить (сегодня захардкожено: только `.ts`/`.tsx`) | planned, post-v1                                                        |
| `verify-commands` | подстановки в AI-промпты           | Сейчас prompt-генераторы (`commit`, `review`) вставляют в промпт захардкоженный список «как верифицировать этот репозиторий» (`resolve-verify-commands.logic.ts`). После v1 этот список должен браться из плана фасета `verify` — та же информация, один источник истины                                                         | planned, post-v1 (замыкается на `verify`, отдельного фасета не требует) |
| `directives`      | `gennady sync`, SDD cascade tables | Стек-специфичные **промпты**: coding/testing-директивы стека (§4.5)                                                                                                                                                                                                                                                              | planned, post-v1                                                        |

Инвариант интерфейса: опциональные фасеты добавляются **опциональными полями** — существующие плагины не ломаются.

### 4.4 Fixer'ы — мутирующие операции (planned, optional)

Мутирующие команды полезны, но несовместимы с верификацией — поэтому отдельная сущность и отдельный глагол. Сегодня в «Геннадии» мутирующие операции разбросаны: `gennady lint --autofix`, npm-скрипт `format` (`prettier --write`); единой сущности нет — вводим:

- **`Fixer`** — та же схема, что `GateSpec` (argv/cwd/env/timeout), но мутация **разрешена и ожидаема**. Квалифицированное имя `<stack>:<id>` (например `golang:fmt-write`, `node:format`).
- **`gennady fix [id…]`** — исполняет fixer'ы: все объявленные или перечисленные. Последовательно (мутируют одно дерево), RUN-ALL не применяется — отказ останавливает цепочку.
- Источники: фасет `fix` плагина (встроенные fixer'ы: golang — `gofmt -w`, `go mod tidy`; node — из классифицированных скриптов `format`/`lint:fix`) + секция `fixers` конфига (config.spec §3.3).
- Инвариант: множества гейтов и fixer'ов не пересекаются; verify никогда не исполняет fixer, fix никогда не считается верификацией.
- Ограничение v1: drift-проверка, существующая только как мутирующая кодогенерация (`make generate` + assert-no-diff), гейтом быть не может и в `extraGates` не заворачивается — она остаётся в CI. Кандидат на v2 — прогон fixer'а в изолированном worktree со сравнением результата («песочница»), тогда мутирующий генератор становится не-мутирующим чеком.

Дизайн зафиксирован здесь; реализация — post-v1 (§4.3).

### 4.5 Директивы — стек-специфичные промпты (planned, optional)

Per-stack знания «Геннадия» — это не только скрипты, но и **промпты**: AI-правила кодирования и тестирования стека. Сегодня они лежат плоско в `ai/directives/` и являются node-специфичными (`coding/typescript-rules.xml`, `testing/node-test.xml`, `testing/vitest-rules.xml`), хотя потребители (SDD cascade tables в `tasks/*/README.md`, команда `gennady sync`) считают их универсальными.

Фасет `directives` делает промпты частью плагина:

- Плагин отдаёт директивы своего стека по ролям: `coding` (правила кода), `testing` (правила тестов), `infra` (настройка тулчейна).
- node-специфичные директивы переезжают под node-плагин; для golang создаются аналоги (`golang-rules.xml`, `go-test-rules.xml`; `golang-setup.xml` уже существует как infra-директива).
- Потребители перестают хардкодить имена файлов: SDD scaffolding строит cascade table из директив активных плагинов репозитория; `gennady sync` синхронизирует в проект директивы его стеков, а не весь набор.

Дизайн-набросок зафиксирован; полная спека фасета — при взятии в работу (post-v1, §4.3).

## 5. Functional Requirements

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-STACK-01 | `StackPlugin` — общий интерфейс стека: `id`, `detect`, обязательный фасет `verify`, опциональные фасеты (§4)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR-STACK-02 | Реестр встроенных плагинов `node`, `golang`; детекция по маркер-файлу в корне (§3); активны все распознавшие                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR-STACK-03 | `gennady verify` — стек-агностичная команда: детекция → скоуп → план → RUN-ALL прогон → отчёт; `--plan` показывает план, диагностику и провенанс конфига без запуска                                                                                                                                                                                                                                                                                                                                                                               |
| FR-STACK-04 | Конфиг по [config.spec.md](./config/config.spec.md): deep-merge источников с per-key провенансом, `use`, per-plugin `skipGates` / `overrideGates` / `extraGates`                                                                                                                                                                                                                                                                                                                                                                                   |
| FR-STACK-05 | Порядок применения конфига: план плагина → `overrideGates` → `skipGates` → `extraGates`. `overrideGates` и `extraGates` разделяют одну схему `GateSpec`                                                                                                                                                                                                                                                                                                                                                                                            |
| FR-STACK-06 | Гейт — чистые данные; исполняется без shell; `env` мержится поверх окружения процесса; раннер один на все стеки                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-STACK-07 | **Per-gate timeout обязателен**; дефолты задаёт плагин per-gate, конфиг переопределяет; глобального таймаута нет — верхняя граница прогона = сумма таймаутов плана (D-STACK-007). Инструмент с собственным флагом таймаута получает то же значение во флаг                                                                                                                                                                                                                                                                                         |
| FR-STACK-08 | Классификация отказов: `fail` / `env-fail` (по предикатам гейта, §4.2) / `timeout` / `skipped` (с причиной)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR-STACK-09 | golang-плагин: гейты `build → vet → fmt → lint → test`; `-mod=vendor` при вендоринге (кроме `go.work`); конфиг golangci авто-поиском (dot и non-dot имена) через `-c`; скоуп по умолчанию — пакеты, изменённые от базовой ветки; диагностики version-skew / nested-modules / missing-config. Паник-предикат не вешается на гейт `test`: паника кода под тестами — genuine FAIL, а не ENV_FAIL. Плагин-специфичных ключей конфига нет (D-STACK-009); drift-гейт `go mod tidy -diff` — рекомендованный `extraGates`-рецепт (пример в config.spec §2) |
| FR-STACK-10 | node-плагин: гейты из npm-скриптов `package.json` по классификатору (typecheck / gennady / lint / test / format); watch- и umbrella-скрипты исключаются; скрипт с мутирующими флагами (`--fix`/`--autofix`/`--write`) планируется видимым skip'ом — check-only argv задаётся через `overrideGates` (D-STACK-005); скоуп репо-уровневый                                                                                                                                                                                                             |
| FR-STACK-11 | В `--only`/`--skip` гейты адресуются квалифицированно `stack:gate` или коротко `gate` (все активные стеки); неизвестное имя → exit 4. Стек-специфичных CLI-флагов нет                                                                                                                                                                                                                                                                                                                                                                              |
| FR-STACK-12 | Невалидный конфиг (парсинг, неизвестный ключ, неверный тип, неизвестный id в `use`) **останавливает команду до исполнения** — exit 4 с перечнем ошибок (config.spec §4.1)                                                                                                                                                                                                                                                                                                                                                                          |
| FR-STACK-13 | `verify.sh` (skill `sdd-execute`) делегирует в `gennady verify`, если тот доступен (с capability-probe против старых установок); легаси npm-путь остаётся фоллбеком                                                                                                                                                                                                                                                                                                                                                                                |
| FR-STACK-14 | Fixer'ы (§4.4): отдельная сущность мутирующих операций и команда `gennady fix`; в v1 — только дизайн, реализация post-v1                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 6. Approved Golden DX Example

```bash
# --- любой репозиторий: план без запуска ---
$ gennady verify --plan

[verify] plan for /repo (stacks: golang)
  config:    gennady.yaml + .gennadyrc (personal)     # провенанс: per-key ниже
  module:    example.com/team/backend (go 1.26.2)
  vendored:  true
  lint-cfg:  /repo/golangci.yml
  scope:     changed — 2 Go file(s) changed vs origin/master

  ⚠️  GOLANGCI_GO_TOO_OLD: golangci-lint built with go1.25.5, module requires go1.26.2 — the linter will panic.
      fix: install a newer golangci-lint, or skip via gennady.yaml: stack.golang.skipGates: [lint]

  ▶️  golang:build  [5m]   go build -mod=vendor ./maillibs/urlshortener
  ▶️  golang:vet    [5m]   go vet -mod=vendor ./maillibs/urlshortener
  ▶️  golang:fmt    [1m]   gofmt -l maillibs/urlshortener/shortener.go
  ⏭️  golang:lint   skip — skipGates (gennady.yaml)
  ▶️  golang:test   [15m]  go test -timeout=15m -mod=vendor ./maillibs/urlshortener
      # timeout 15m ← .gennadyrc (personal), поверх gennady.yaml

# --- happy path: всё прошло — одна строка ---
$ gennady verify
[verify] ALL_GATES_PASS (4/4) — golang: 2 Go file(s) changed vs origin/master
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
$ gennady verify --only=golang:lint
[verify] ❌ ENV_FAIL gate: golang:lint
  note:    the tool itself failed to run — this is NOT a finding about the code.
           Fix the toolchain; do not change source in response to this output.
# exit 1

# --- невалидный конфиг: verify НЕ запускается ---
$ gennady verify
[verify] CONFIG_ERROR: gennady.yaml is invalid — refusing to run
  stack.golang.skipGate: unknown key (did you mean "skipGates"?)
  stack.rust: unknown plugin id (known: node, golang)
# exit 4

# --- node-репозиторий: та же команда, тот же контракт ---
$ gennady verify
[verify] ALL_GATES_PASS (4/4) — node: npm scripts (type-check, lint:contracts, test, format:check)

# --- явные цели и подмножества гейтов (квалифицированные имена: stack:gate) ---
$ gennady verify internal/userapi
$ gennady verify --all --skip=test              # 'test' во всех активных стеках
$ gennady verify --only=golang:build,golang:vet --json

# --- не распознан ни один стек ---
$ cd /tmp/empty && gennady verify
[verify] NO_STACK_DETECTED: no stack plugin recognized /tmp/empty
  known stacks: node (package.json), golang (go.mod)
  fix: run from a project root, pass --root=<path>, or declare stack.use in gennady.yaml
# exit 5
```

Пример конфига (`gennady.yaml`; полный справочник полей — [config.spec.md](./config/config.spec.md)):

```yaml
stack:
  use: [golang]
  golang:
    # golangci-lint в образе собран go1.25 — паникует на go1.26; вернуть после апдейта образа
    skipGates: [lint]
    overrideGates:
      build:
        env:
          GOPROXY: https://goproxy.example.com/ # корп-прокси модулей
      test:
        argv: [make, test] # тесты только через make (CGO-флаги)
        timeout: 15m
    extraGates:
      - id: tidy-drift
        argv: [go, mod, tidy, -diff]
        timeout: 5m
      - id: codegen-drift
        argv: [make, check-generated]
        timeout: 3m
```

## 7. Entity Inventory (Closed-World)

| Name                                           | Type         | Purpose                                                                                         |
| ---------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `StackPlugin`                                  | Interface    | §4.1: `id`, `detect`, обязательный `verify`, опциональные фасеты                                |
| `StackVerifyCapability`                        | Interface    | Фасет verify: `resolveScope` + `planGates`                                                      |
| `StackFixCapability`                           | Interface    | Фасет fix (planned, §4.4): встроенные fixer'ы плагина                                           |
| `StackId`                                      | Type         | `'node' \| 'golang'`                                                                            |
| `StackDetection`                               | Value Object | `stack`, `root`, `summary` (строки для `--plan`), `diagnostics`, `details` (per-plugin payload) |
| `StackDiagnostic`                              | Value Object | `code`, `message`, `fix`                                                                        |
| `ScopeRequest`                                 | Value Object | `mode` (`files`/`changed`/`all`), `targets`                                                     |
| `StackScope`                                   | Value Object | `mode`, `note`, `details` (per-plugin)                                                          |
| `Gate`                                         | Value Object | §4.2 — все поля с комментариями там                                                             |
| `EnvFailPredicate`                             | Type         | `(exitCode, output) => boolean`; комбинаторы: `exitAbove`, `outputMatches`, `spawnFailed`       |
| `Fixer`                                        | Value Object | §4.4 (planned): мутирующая операция, схема GateSpec                                             |
| `GateResult`                                   | Value Object | `gate`, `status` (`pass\|fail\|env-fail\|skipped\|timeout`), `exitCode`, `durationMs`, `output` |
| `StackRun`                                     | Value Object | Вклад одного стека: `detection`, `scope`, `gates`                                               |
| `VerifyReport`                                 | Value Object | `runs`, `diagnostics`, `results`, `passed`, `total`, `ok`                                       |
| `GatePlanOptions`                              | Value Object | `pluginConfig` (срез конфига плагина после merge)                                               |
| `StackConfig`, `StackPluginConfig`, `GateSpec` | Type         | Схема конфига — [config.spec.md](./config/config.spec.md)                                       |
| `loadStackConfig`                              | Function     | Загрузка + deep-merge + строгая валидация (config.spec §2, §5); ошибки фатальны                 |
| `pluginConfigOf`                               | Function     | Извлечение среза конфига одного плагина                                                         |
| `applyStackConfig`                             | Function     | Применение конфига к плану: `overrideGates` → `skipGates` → `extraGates` (FR-STACK-05)          |
| `detectStacks`                                 | Function     | Алгоритм §3                                                                                     |
| `BUILTIN_STACK_PLUGINS`                        | Constant     | `[nodePlugin, golangPlugin]`                                                                    |
| `runVerify`                                    | Function     | RUN-ALL исполнение планов всех стеков без shell; per-gate timeout; классификация статусов       |
| `formatVerifyReport`                           | Function     | Отчёт: диагностики + скипы + отказы (усечение вывода) + summary при успехе                      |
| `exitAbove`, `outputMatches`                   | Function     | Встроенные комбинаторы `EnvFailPredicate`; spawn-сбои раннер классифицирует сам                 |
| `nodePlugin`                                   | Service      | `StackPlugin` для npm-репозиториев                                                              |
| `classifyNpmScripts`                           | Function     | Эвристика классификации npm-скриптов: typecheck/gennady/lint/test/format                        |
| `golangPlugin`                                 | Service      | `StackPlugin` для Go-репозиториев                                                               |
| `detectGoProject`                              | Function     | Данные Go-репо: модуль, `go.work`, вендоринг, конфиг golangci, тулчейн, диагностики             |
| `resolveGoScope`                               | Function     | Скоуп: `files` / `changed` / `all`                                                              |
| `planGoGates`                                  | Function     | План гейтов Go: build → vet → fmt → lint → test                                                 |
| `run`                                          | Command      | CLI `gennady verify`                                                                            |

## 8. Module Contracts (DbC)

### 8.1 StackPlugin

- **Runtime Backing:** `real-runtime` · **Verification Levels:** `unit`

- Preconditions: `detect(root)` получает абсолютный существующий путь.
- Postconditions: `detect` → null или `StackDetection` с непустым `summary`; `planGates` → детерминированный порядок; каждый исполняемый гейт имеет `timeoutMs > 0`; неисполнимый гейт — `skipped: <reason>`, не исключение.
- Invariants: плагин не мутирует дерево; процессы на `detect` — только version-probe'ы; плагин не знает о конфиге (overrides применяет `applyStackConfig` поверх плана).

### 8.2 Gate Runner

- **Runtime Backing:** `real-runtime` · **Verification Levels:** `unit`

- Preconditions: каждый исполняемый гейт имеет непустой `argv[0]` и `timeoutMs > 0`.
- Postconditions: RUN-ALL; SUPPRESS-ON-SUCCESS; `outputMeansFailure: true` + exit 0 + непустой stdout → `fail`; превышение `timeoutMs` → `timeout`; любой сработавший `envFail`-предикат → `env-fail` + запрет менять код в отчёте; `ok === true` ⇔ все исполненные гейты `pass`.
- Invariants: `spawnSync(argv)` без shell; `gate.env` мержится поверх `process.env`; вывод отказа усечён с маркером и командой воспроизведения.

### 8.3 Stack Config

- Контракты схемы, merge и строгой валидации — [config.spec.md](./config/config.spec.md) §4.1.

### 8.4 Verify Command

- **Runtime Backing:** `real-runtime` · **Verification Levels:** `unit`, `e2e`

- Postconditions: exit `0` — все гейты прошли **и хотя бы один исполнен**; `1` — есть отказ, **или ни один гейт не исполнен** (`ZERO_GATES`: прогон, который ничего не проверил, не является успехом); `4` — неверный вызов **или невалидный конфиг** (FR-STACK-12; ни один гейт не исполнен); `5` — ни один плагин не распознал репозиторий. `--plan` не исполняет ни одного гейта и показывает per-key провенанс конфига. `--json` — машиночитаемые `runs` + `results`; вывод отказавших гейтов усечён (head+tail) как и в человеческом отчёте, `--full-output` отключает усечение. **Контракт для оркестраторов:** `results[].status === "env-fail"` и агрегат `envFailed` — стабильные поля; env-fail означает поломку окружения, править код в ответ нельзя. Отдельного exit-кода для env-fail нет (оркестратор читает JSON), коды остаются `0/1/4/5`.
- Invariants: явные позиционные цели → `files`; `--all` → `all`; иначе `changed`. `--only`/`--skip` принимают `stack:gate` и короткое `gate`.

## 9. File Structure

```
services/stack/
├── stack.types.ts                     # Closed-world типы §7
├── stack-registry.ts                  # BUILTIN_STACK_PLUGINS + detectStacks() (§3)
├── stack-config.ts                    # loadStackConfig(): discovery, deep-merge, строгая валидация
├── gate-runner.ts                     # runVerify() + formatVerifyReport() + env-fail комбинаторы
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

**Registration points:** `cli/gennady.ts`, `cli/cmd/help/help.cmd.ts`, `cli/cmd/README.md`, `README.md`, `ai/skills/sdd-execute/scripts/verify.sh` (FR-STACK-13).

## 10. Decision Log

### D-STACK-001 — Внешние плагины отложены целиком (TODO)

- **Status:** active
- **Recorded:** spec review round 2, PR #5
- **Why:** Сокращение скоупа v1. Идея зафиксирована (проприетарные стеки в периметре появятся), дизайн — отдельной итерацией. Заметка на будущее из ревью: ссылка — плохой id; вероятная форма подключения — map `use: {<id>: <source>}`.

### D-STACK-002 — Конфиг: `gennady.yaml` (коммитится) + deep-merge личных `.gennadyrc`

- **Status:** active
- **Recorded:** spec review round 2, PR #5
- **Why:** Полное обоснование и схема — [config.spec.md](./config/config.spec.md) (формат, merge с per-key провенансом, версионирование, строгая валидация).

### D-STACK-003 — Гейт — данные, раннер — один

- **Status:** active
- **Why:** Пока гейт — это `argv + cwd + env + timeout + контракт`, RUN-ALL/SUPPRESS-ON-SUCCESS/усечение/таймаут/классификация написаны один раз и не могут разъехаться между стеками. Плагины остаются чистыми планировщиками — тестируются без запуска процессов.

### D-STACK-004 — env-fail-классификация: предикаты на гейте, не знания в раннере

- **Status:** active
- **Recorded:** spec review round 2, PR #5 — форма изменена с деклараций на предикаты
- **Why:** «Паника golangci-lint», «exit > 1 у линтера», «Forbidden от module proxy» — знания Go-стека. Гейт несёт набор функций-предикатов `(exitCode, output) => boolean`, собранных из библиотечных комбинаторов (`exitAbove`, `outputMatches`, `spawnFailed`); раннер лишь вызывает их. Ни одного стек-специфичного регекспа в общем коде; предикаты выразительнее статических деклараций (композиция, отрицания).

### D-STACK-005 — Мутирующие команды запрещены как гейты; для мутаций — Fixer'ы

- **Status:** active
- **Recorded:** spec review round 2, PR #5 — добавлена сущность Fixer
- **Why:** `go fmt` / `prettier --write` / `go mod tidy` переписывают дерево — гейт никогда не падает и молча дописывает диф агента посреди фазы. Проверочные формы: `gofmt -l` (+ `outputMeansFailure`), `prettier --check`, `go mod tidy -diff`. Мутирующие операции нужны — поэтому отдельная сущность `Fixer` и глагол `gennady fix` (§4.4): явный вызов оператором, никогда не в verify-плане.

### D-STACK-006 — node-плагин игнорирует позиционные цели

- **Status:** active
- **Why:** npm-скрипты — репо-уровневые команды; сузить `npm run test` до файла нельзя без знаний о раннере (забота будущего фасета `testcov`). Честное поведение: node-гейты всегда репо-уровневые, `scope.note` это фиксирует.

### D-STACK-007 — Per-gate timeout обязателен; глобального таймаута нет

- **Status:** active
- **Recorded:** spec review round 2, PR #5 — добавлен рендер во флаг инструмента, убран конфиг-ключ testTimeout
- **Why:** Два источника таймаута — кластер багов «timeout inconsistency». Один источник истины: каждый гейт несёт `timeoutMs`; дефолты — у плагина per-gate (golang: build/vet/lint 5m, fmt 1m, test 10m; node: 10m); конфиг переопределяет per-gate. Верхняя граница прогона = сумма таймаутов плана, таймауты видны в `--plan`. Инструмент с собственным флагом (go test -timeout) получает то же значение — самозавершается раньше жёсткого kill'а и успевает напечатать goroutine dump.
- **Rejected alternatives:** глобальный `--timeout` (v1-прототип; убран), конфиг-ключ `testTimeout` (дубль per-gate таймаута; убран).

### D-STACK-008 — Capability-фасеты: verify обязателен, остальные опциональны

- **Status:** active
- **Recorded:** spec review round 2, PR #5 — добавлена явная классификация mandatory/optional
- **Why:** Per-stack параметризация нужна не только verify (§4.3), но usage-ready v1 определяется единственным фасетом, от которого зависит SDD-цикл — verify. Опциональные фасеты добавляются опциональными полями, их поддержка легально различается между плагинами; плагин без фасета честно репортит «не поддерживается».

### D-STACK-009 — Никаких плагин-специфичных ключей конфига в v1

- **Status:** active
- **Recorded:** spec review round 2, PR #5
- **Why:** Прежние ключи избыточны: `testTimeout` — дубль обязательного per-gate `timeout` (гейт сам рендерит его в `go test -timeout`); `lintConfig` — покрывается авто-поиском + `overrideGates.lint.argv`; `tidy` — убран из встроенных гейтов, drift-проверка объявляется одной строкой в `extraGates` (пример в config.spec §2). Если реальная нужда появится — ключи пойдут в выделенный объект `stack.<plugin>.config` с отдельной спекой плагина и строгой валидацией; всё вне известной схемы — ошибка конфига.
- **Rejected alternatives:** placeholder-подстановки `${VAR}` в argv (интерполяция в argv — новый класс ошибок; вернёмся, если появится кейс, не покрываемый env+override).

### D-STACK-010 — Мультипроектные репозитории: один root на прогон (v1), multi-root — отложено

- **Status:** active
- **Recorded:** review, mobile-spike feedback (PR #5)
- **Why:** Канонический мобильный монорепозиторий держит проекты в `ios/` и `android/` без маркеров в корне: `detect(root)` зовётся с одним root, `--root` принимает одно значение, `use` не форсит активацию — такой корень честно даёт `NO_STACK_DETECTED`. v1-воркфлоу: прогон на каждый проект (`--root=ios`, `--root=android`) + диагностика вложенных манифестов, как у golang с nested modules. Дизайн multi-root (кандидаты root'ов от плагина либо несколько `--root` у прогона) — отдельная итерация до Android-плагина; фиксируем направление, не реализацию.

## 11. Inter-Module Dependencies

- **Depends on:** `shared/backend/rc/rc-config.ts` (личный `.gennadyrc`), `shared/common/parse-args.ts`
- **Provides to:** `cli` (команда `verify`; далее — fix/testcov/lint по §4.3), `ai-skills` (`verify.sh`, skill `sdd-infra-golang`)

## 12. Handoff to Task Scaffolding

- **Tasks (v1, mandatory capability):** TSK-95 (библиотека: types, config, registry, runner, plugins node+golang), TSK-96 (CLI `verify` + `verify.sh` делегация + документация)
- **Post-v1 (optional capabilities, скаффолдятся отдельными задачами по §4.3):** фасет `fix` + команда `gennady fix` (§4.4); фасет `testcov`; фасет `dbc-lint`; фасет `directives` (§4.5); миграция `resolve-verify-commands` на план verify
- **TODO (отложено без дизайна):** внешние плагины (D-STACK-001)
- **Stack dependencies:** TypeScript → `ai/directives/coding/typescript-rules.xml`; node:test → `ai/directives/testing/node-test.xml`
- **Prototype:** рабочая реализация против спеки round-1 (73 unit-теста, проверена на the internal Go repos/gennady) — ветка `impl/stack-plugin-system`; при перебазировании: renames `skip`→`skipGates`, `gates`→`overrideGates`; `env`; обязательный per-gate `timeout` (рендер в `go test -timeout`); envFail → предикаты; deep-merge конфигов + провенанс; строгая валидация (fatal, exit 4); YAML-loader; детекция по корню; без `--tidy`/`--timeout`; квалифицированные id в `--only`/`--skip`
