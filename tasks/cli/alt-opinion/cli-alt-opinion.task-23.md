# Task: TSK-23 — AltOpinion Core (types + parser + runner)

## 1. Meta & Traceability

- **Task-ID:** TSK-23
- **Purpose:** Реализовать доменные типы `AltOpinionModel`, `AltOpinionResult`, `AltOpinionReport`, DI-порт `AltOpinionModelPort`, кастомный парсер `alt-opinion-parser.ts` с поддержкой `::`-синтаксиса, и ядро `alt-opinion-runner.ts` с параллельным опросом моделей (Promise.allSettled) и опциональным синтезом.
- **Scope:** cli
- **Module:** alt-opinion
- **Dependencies:** None (чистый старт, AI SDK уже в devDeps)
- **Spec References:**
  - alt-opinion FR: [cli spec §4.1.2](../../specs/cli/cli.spec.md)
  - alt-opinion Architecture: [cli spec §5.2](../../specs/cli/cli.spec.md)
  - AltOpinionModelPort NFC-06: [cli spec §4.2](../../specs/cli/cli.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime` (AI SDK вызывает HTTP)
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Target Files:**
  - `cli/cmd/alt-opinion/alt-opinion.types.ts` (Create)
  - `cli/cmd/alt-opinion/alt-opinion-parser.ts` (Create)
  - `cli/cmd/alt-opinion/alt-opinion-runner.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Доменные типы и DI-порт для alt-opinion

**Scenario:** Тип AltOpinionModel содержит provider/model/promptPath [`unit`]

- **Given** объявлен тип `AltOpinionModel`
- **When** создан объект `{ provider: 'llmproxy', model: 'deepseek-v4-pro' }`
- **Then** тип совместим, `promptPath` опционален

**Scenario:** AltOpinionResult содержит opinion текст и флаг success [`unit`]

- **Given** объявлен тип `AltOpinionResult`
- **When** модель вернула ответ — `{ model: {...}, success: true, content: '...' }`
- **Then** при ошибке — `{ model: {...}, success: false, error: 'timeout' }`

**Scenario:** AltOpinionModelPort — контракт для DI [`unit`]

- **Given** интерфейс `AltOpinionModelPort` с методом `generate(opts): Promise<string>`
- **When** реализация вызывает AI SDK
- **Then** тесты мокают порт без monkey-patching

**Feature:** Парсер аргументов alt-opinion

**Scenario:** Парсинг --model с provider/model [`unit`]

- **Given** `--model=llmproxy/deepseek-v4-pro`
- **When** парсер обрабатывает аргумент
- **Then** `models[0] === { provider: 'llmproxy', model: 'deepseek-v4-pro' }`

**Scenario:** Парсинг --model с per-model prompt [`unit`]

- **Given** `--model=llmproxy/gpt-4o::./custom.md`
- **When** парсер обрабатывает аргумент
- **Then** `models[0].promptPath === './custom.md'`

**Scenario:** Повторяемый --model → массив [`unit`]

- **Given** `--model=a/b --model=c/d --model=e/f`
- **When** парсер обрабатывает
- **Then** `models.length === 3`

**Scenario:** Неизвестный провайдер → ошибка [`unit`]

- **Given** `--model=unknown/xyz`
- **When** парсер обрабатывает
- **Then** бросает ошибку с указанием провайдера

**Scenario:** --model без provider → ошибка [`unit`]

- **Given** `--model=gpt-4o` (нет `/`)
- **When** парсер обрабатывает
- **Then** бросает ошибку

**Scenario:** --synthModel парсится корректно [`unit`]

- **Given** `--synthModel=openrouter/claude-3`
- **When** парсер обрабатывает
- **Then** `synthModel === { provider: 'openrouter', model: 'claude-3' }`

**Scenario:** --file и stdin одновременно → ошибка [`unit`]

- **Given** `--file=task.md` и stdin не пуст
- **When** парсер валидирует
- **Then** бросает ошибку "mutually exclusive"

**Scenario:** --strict флаг → boolean [`unit`]

- **Given** `--strict`
- **When** парсер обрабатывает
- **Then** `strict === true`

**Scenario:** --modelPrompt и --synthPrompt [`unit`]

- **Given** `--modelPrompt=./m.md --synthPrompt=./s.md`
- **When** парсер обрабатывает
- **Then** `modelPromptPath === './m.md'`, `synthPromptPath === './s.md'`

**Scenario:** :: в пути к файлу — только первый :: разделитель [`unit`]

- **Given** `--model=a/b::c::d.md`
- **When** парсер обрабатывает
- **Then** `models[0].promptPath === 'c::d.md'`

**Feature:** Runner — параллельный опрос моделей

**Scenario:** Happy path: 2 модели → 2 блока с якорями [`unit`]

- **Given** 2 мока порта возвращают текст
- **When** runner вызван без synthModel
- **Then** вывод содержит `<!--START_ALT_OPINION_LLMPROXY-GPT4O-->` и второй блок; `exitCode === 0`

**Scenario:** 1 модель упала, 1 успешна (без --strict) [`unit`]

- **Given** model[0] бросает, model[1] возвращает текст
- **When** runner вызван без strict
- **Then** блок model[0] содержит описание ошибки, блок model[1] — результат; `exitCode === 0`

**Scenario:** Все модели упали (без --strict) [`unit`]

- **Given** все моки бросают
- **When** runner вызван без strict
- **Then** все блоки содержат ошибки; `exitCode === 1`

**Scenario:** С --strict: 1 модель упала → exit 1 [`unit`]

- **Given** model[0] бросает
- **When** runner вызван с `strict: true`
- **Then** `exitCode === 1`

**Scenario:** Синтез: только синтез-блок в выводе [`unit`]

- **Given** 2 модели + synthModel, все успешны
- **When** runner вызван
- **Then** вывод содержит ТОЛЬКО `<!--START_ALT_OPINION_SYNTH-->`, нет индивидуальных блоков

**Scenario:** Синтез: все модели упали → exit 1 [`unit`]

- **Given** все модели бросают, synthModel указан
- **When** runner вызван
- **Then** `exitCode === 1` (не из чего синтезировать)

**Scenario:** Таймаут модели → описание в блоке [`unit`\*\*

- **Given** мок порта бросает `AbortError`
- **When** runner вызван
- **Then** блок модели содержит "timeout"

**Scenario:** Per-model prompt подставляется в вызов [`unit`]

- **Given** модель с `promptPath`, содержимое файла прочитано
- **When** runner вызывает порт
- **Then** в `generate()` передан контент per-model промпта

**Scenario:** Порядок блоков соответствует порядку --model [`unit`]

- **Given** 3 модели в порядке A, B, C
- **When** runner вызван (Promise.allSettled)
- **Then** блоки в выводе: A, B, C (сохранение порядка, не по завершению)

**Scenario:** Пустой артефакт → ошибка [`unit`]

- **Given** artifact = ""
- **When** runner вызван
- **Then** бросает ошибку "empty artifact"

## 3. Phases

### Phase P1 — types + parser

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/alt-opinion.types.ts` (Create), `cli/cmd/alt-opinion/alt-opinion-parser.ts` (Create)
- **Status:** [x]
- **Deps:** None
- **Acceptance:**
  - `alt-opinion.types.ts`: `AltOpinionModel` (provider, model, promptPath?), `AltOpinionResult` (model, success, content?, error?), `AltOpinionReport` (results, exitCode, synthContent?), `AltOpinionParsedArgs` (models, synthModel?, file?, modelPromptPath?, synthPromptPath?, strict), `AltOpinionModelPort` (generate interface)
  - `alt-opinion-parser.ts`: `parseAltOpinionArgs(rawArgs, opts?)` — парсит `--model`, `--synthModel`, `--file`, `--modelPrompt`, `--synthPrompt`, `--strict`. Валидирует provider (llmproxy|openrouter), взаимоисключение stdin/--file, `::` синтаксис, минимум 1 модель. Читает stdin если не TTY и не --file. Возвращает `AltOpinionParsedArgs` + artifact.

### Phase P2 — runner

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/alt-opinion-runner.ts` (Create)
- **Status:** [x]
- **Deps:** P1
- **Acceptance:**
  - `runAltOpinion(args, deps)` — принимает `AltOpinionParsedArgs` и `{ models: Map<string, AltOpinionModelPort>, synth?: AltOpinionModelPort, readFile: (path: string) => string }`
  - Параллельный опрос через `Promise.allSettled(models.map(...))`
  - Каждый вызов: `AbortController` с таймаутом 5 мин, шаблон `# GOAL:\n<prompt>\n\n# CONTEXT:\n<artifact>`
  - При `--synthModel`: собирает успешные мнения → вызывает синтез → возвращает только синтез-блок
  - Без `--synthModel`: возвращает все блоки в порядке --model
  - Ошибка/таймаут модели → описание в блоке модели
  - `--strict`: exit 1 при любой ошибке; без: exit 1 только если все упали
  - Дефолтные промпты зашиты в коде если не указаны `--modelPrompt`/`--synthPrompt`
  - Возвращает `AltOpinionReport` с полным выводом

## 4. Execution Log

### Round 1 — initial, P1 types+parser

#### P1

- [x] `2026-05-17T21:02:22Z` recon targets=absent divergence=none
- [x] `2026-05-17T21:02:22Z` rules typescript-rules
- [x] `2026-05-17T21:02:22Z` file cli/cmd/alt-opinion/alt-opinion.types.ts
- [x] `2026-05-17T21:02:22Z` file cli/cmd/alt-opinion/alt-opinion-parser.ts
- [x] `2026-05-17T21:02:22Z` intro AltOpinionProvider ← тип-union для валидации провайдеров llmproxy|openrouter
- [x] `2026-05-17T21:02:22Z` intro AltOpinionModel ← дескриптор модели с опциональным promptPath (:: синтаксис)
- [x] `2026-05-17T21:02:22Z` intro AltOpinionResult ← discriminated union success/error для результата вызова
- [x] `2026-05-17T21:02:22Z` intro AltOpinionReport ← агрегированный отчёт с exitCode и synthContent
- [x] `2026-05-17T21:02:22Z` intro AltOpinionParsedArgs ← тип распарсенных CLI-аргументов
- [x] `2026-05-17T21:02:22Z` intro AltOpinionModelPort ← DI-порт (interface) для мокания AI SDK в тестах
- [x] `2026-05-17T21:02:22Z` intro parseAltOpinionArgs ← парсер CLI-аргументов с :: синтаксисом и валидацией
- [x] `2026-05-17T21:02:22Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-17T21:02:22Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion.types.ts, cli/cmd/alt-opinion/alt-opinion-parser.ts]; decisions: [parser-signature=parseAltOpinionArgs(rawArgs, opts?={stdinContent?}), model-parsing=internal parseModelArg helper, provider-type=AltOpinionProvider string union, stdin-reading=sync readFileSync(process.stdin.fd), result-type=discriminated union AltOpinionResult]; open: []

### Round 2 — initial, P2 runner

#### P2

- [x] `2026-05-17T21:11:41Z` recon targets=absent divergence=none
- [x] `2026-05-17T21:11:41Z` rules typescript-rules
- [x] `2026-05-17T21:11:41Z` file cli/cmd/alt-opinion/alt-opinion-runner.ts
- [x] `2026-05-17T21:11:41Z` intro RunAltOpinionDeps ← DI-зависимости раннера: Map моделей, опциональный synth-порт, readFile
- [x] `2026-05-17T21:11:41Z` intro runAltOpinion ← ядро: параллельный опрос + синтез, возвращает AltOpinionReport
- [x] `2026-05-17T21:11:41Z` intro sanitizeArtifact ← NFC-08: экранирование # CONTEXT: и anchor-маркеров от prompt injection
- [x] `2026-05-17T21:11:41Z` intro queryModel ← внутренний helper: вызов одной модели с 5-минутным AbortSignal.timeout
- [x] `2026-05-17T21:11:41Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-17T21:11:41Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion-runner.ts]; decisions: [runner-signature=runAltOpinion(args, deps), deps-type=RunAltOpinionDeps{models:Map, synth?, readFile}, timeout-mechanism=AbortSignal.timeout(5min) external to port, sanitization=sanitizeArtifact escapes #CONTEXT: and anchor markers, prompt-template=#GOAL:\n<prompt>\n\n#CONTEXT:\n<artifact>, model-map-key=provider/model, default-prompts=embedded in code as constants, artifact-resolution=args.file?readFile(file):args.artifact]; open: [prompts-files: default prompt files (prompts/default-opinion.prompt.md, prompts/default-synth.prompt.md) not created — embedded constants in runner cover this but separate files would allow config without code change, generate-interface: AltOpinionModelPort.generate takes only prompt:string — no AbortSignal passthrough; timeout is external race, not true HTTP abort]

### Round 3 — fix: address audit findings F-04, F-06

#### P2 — re-run: fix: address audit findings F-04, F-06

- [x] `2026-05-17T21:37:54Z` recon targets=exists divergence=none
- [x] `2026-05-17T21:37:54Z` rules typescript-rules
- [x] `2026-05-17T21:37:54Z` file cli/cmd/alt-opinion/alt-opinion-runner.ts
- [x] `2026-05-17T21:42:55Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-17T21:42:55Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion-runner.ts]; decisions: [F-04=added logger.error in queryModel catch per AX_CATCH_LOG_THROW, F-06=removed AbortSignal listener after promise settles via removeEventListener]; open: []

### Round 4 — initial, P1-test: parser unit tests (node:test + assert)

#### P1-test

- [x] `2026-05-17T22:50:06Z` recon targets=absent divergence=none
- [x] `2026-05-17T22:50:06Z` rules typescript-rules, node-test
- [x] `2026-05-17T22:50:06Z` test cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts
- [x] `2026-05-17T22:50:06Z` cov Single model parsing → alt-opinion-parser.test.ts::should parse --model with provider/model
- [x] `2026-05-17T22:50:06Z` cov Per-model prompt with :: syntax → alt-opinion-parser.test.ts::should parse --model with per-model prompt via :: syntax
- [x] `2026-05-17T22:50:06Z` cov Repeated --model flags → array → alt-opinion-parser.test.ts::should accumulate repeated --model flags into an array
- [x] `2026-05-17T22:50:06Z` cov Unknown provider → throws → alt-opinion-parser.test.ts::should throw for unknown provider
- [x] `2026-05-17T22:50:06Z` cov No provider (missing /) → throws → alt-opinion-parser.test.ts::should throw when --model has no provider (missing /)
- [x] `2026-05-17T22:50:06Z` cov --synthModel parsing → alt-opinion-parser.test.ts::should parse --synthModel correctly
- [x] `2026-05-17T22:50:06Z` cov --file + stdin mutually exclusive → throws → alt-opinion-parser.test.ts::should throw when --file and stdin are both provided
- [x] `2026-05-17T22:50:06Z` cov --strict flag → boolean → alt-opinion-parser.test.ts::should set strict to true when --strict flag is present
- [x] `2026-05-17T22:50:06Z` cov --modelPrompt and --synthPrompt → alt-opinion-parser.test.ts::should parse --modelPrompt and --synthPrompt paths
- [x] `2026-05-17T22:50:06Z` cov :: in filename → alt-opinion-parser.test.ts::should treat only the first :: as the prompt separator (:: in filename)
- [x] `2026-05-17T22:50:06Z` cov No models → throws → alt-opinion-parser.test.ts::should throw when no --model flags are provided
- [x] `2026-05-17T22:50:06Z` cov No --file and stdin TTY → throws → alt-opinion-parser.test.ts::should throw when no --file and stdin is TTY with no piped content
- [x] `2026-05-17T22:50:06Z` cov Empty args → throws → alt-opinion-parser.test.ts::should throw when args are empty
- [x] `2026-05-17T22:50:06Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-17T22:50:06Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/__tests__/alt-opinion-parser.test.ts]; decisions: [tty-mocking=Object.defineProperty on process.stdin.isTTY getter in beforeEach for deterministic --file tests, test-runner=node:test + assert/node:assert/strict, test-count=13 covering all acceptance criteria, deepStrictEqual-includes-promptPath-undefined=parser returns { promptPath: undefined } when no :: syntax]; open: []
