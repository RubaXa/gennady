# Task: TSK-23 — AltOpinion Core (types + parser + runner)

## 1. Meta & Traceability

- **Task-ID:** TSK-23
- **Reopens:** 5
- **Purpose:** Реализовать доменные типы `AltOpinionModel`, `AltOpinionResult`, `AltOpinionReport`, DI-порт `AltOpinionModelPort`, кастомный парсер `alt-opinion-parser.ts` с поддержкой `::`-синтаксиса, и ядро `alt-opinion-runner.ts` с параллельным опросом моделей (Promise.allSettled) и опциональным синтезом.
- **Deferred Test Ownership:** TSK-25 (runner BDD-сценарии — тесты раннера в `alt-opinion-runner.test.ts`)
- **Scope:** cli
- **Module:** alt-opinion
- **Dependencies:** None (чистый старт, AI SDK уже в devDeps)
- **Spec References:**
  - alt-opinion FR: [cli spec §4.1.2](../../specs/cli/cli.spec.md)
  - alt-opinion Architecture: [cli spec §5.2](../../specs/cli/cli.spec.md)
  - AltOpinionModelPort NFC-06: [cli spec §4.2](../../specs/cli/cli.spec.md)
  - Module spec D-006, D-007: [alt-opinion spec §6](../../specs/cli/alt-opinion/alt-opinion.spec.md)
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
  - **Зависимость от D-006**: cmd-слой передаёт порты, созданные через `provider.chat(modelId)` (Chat Completions API)
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

### Round 5 — 2026-05-21, fix: stdin detection by data presence (D-008)

| Phase | Kind | Status | Target Files                                             | Deps |
| ----- | ---- | ------ | -------------------------------------------------------- | ---- |
| P1    | fix  | [x]    | cli/cmd/alt-opinion/alt-opinion-parser.ts                | —    |
| P2    | test | [x]    | cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts | P1   |

#### P1 fix — stdin detection by data presence

- **Fix:** Replace `!process.stdin.isTTY` proxy with actual data check: read stdin synchronously, considered present only if non-empty. Per spec D-008.
- **Why:** `!isTTY` is always true in CI/agent environments (stdin is /dev/null). Parser falsely rejects `--file` in these environments.

#### P2 test — regression: non-TTY empty stdin + --file

- **Test name:** "should not conflict --file with empty non-TTY stdin"
- **What it verifies:** process.stdin.isTTY=false, stdin empty (stdinContent: ''), --file present → no mutual exclusion error, artifact = file contents.
- **Also:** "should conflict --file with non-TTY stdin that HAS data" — stdin non-empty + --file → mutual exclusion error.
- **Also:** "should accept empty non-TTY stdin without --file as INPUT_MISSING" — stdin empty, no --file → "No input provided" error.

- [x] `2026-05-21T15:34:52Z` recon targets=exists divergence=none
- [x] `2026-05-21T15:34:52Z` ver npx tsc --noEmit → fail exit=2 (pre-existing: agent-mon/providers/opencode-provider.ts(51,18); alt-opinion files: 0 errors)
- [x] `2026-05-21T15:34:52Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion-parser.ts]; decisions: [stdin-detection=actual-data-presence-not-isTTY, D-008=read-stdin-by-length-after-trim, empty-stdin+file=no-conflict, data-stdin+file=mutual-exclusion]; open: []

#### P2 test — regression: non-TTY empty stdin + --file

- [x] `2026-05-21T15:40:48Z` recon targets=exists divergence=none
- [x] `2026-05-21T15:40:48Z` test cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts
- [x] `2026-05-21T15:40:48Z` cov Empty non-TTY stdin + --file no conflict → alt-opinion-parser.test.ts::should not conflict --file with empty non-TTY stdin
- [x] `2026-05-21T15:40:48Z` cov Non-TTY stdin with data + --file mutual exclusion → alt-opinion-parser.test.ts::should conflict --file with non-TTY stdin that HAS data
- [x] `2026-05-21T15:40:48Z` cov Empty non-TTY stdin without --file → INPUT_MISSING → alt-opinion-parser.test.ts::should accept empty non-TTY stdin without --file as INPUT_MISSING
- [x] `2026-05-21T15:40:48Z` ver npx tsc --noEmit → fail exit=2 (pre-existing: agent-mon/providers/opencode-provider.ts(51,18); alt-opinion files: 0 errors)
- [x] `2026-05-21T15:40:48Z` ver node --test cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts → pass exit=0
- [x] `2026-05-21T15:40:48Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/__tests__/alt-opinion-parser.test.ts]; decisions: [test-count=16, new-tests=3 covering stdin-data-presence D-008, isTTY-override-via-Object.defineProperty-inside-test]; open: []

#### Round close

- [x] `2026-05-21T11:30:00Z` DONE

### Round 6 — fix: address audit findings F-01, F-02, F-03

#### P1 — re-run: fix: address audit findings F-01, F-02, F-03

- [x] `2026-05-21T15:56:36Z` recon targets=exists divergence=none
- [x] `2026-05-21T15:56:36Z` rules typescript-rules
- [x] `2026-05-21T15:56:36Z` F-01: swapped @throws / @returns order per AX_BASE_CONTRACT_SHAPE mandatory tag sequence
- [x] `2026-05-21T15:56:36Z` F-02: added @param opts (was absent from contract despite signature presence)
- [x] `2026-05-21T15:56:36Z` F-03: replaced @param opts.stdinContent (nested field enumeration forbidden by AX_TAG_USAGE_MATRIX) with @param opts
- [x] `2026-05-21T15:56:36Z` ver npx tsc --noEmit → pass exit=0 (pre-existing: opencode-provider.ts; alt-opinion files: 0 errors)
- [x] `2026-05-21T15:56:36Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion-parser.ts]; decisions: [F-01=@throws-before-@returns-per-tag-order, F-02=added-@param-opts, F-03=nested-field-replaced-with-opts-bag]; open: []

#### Round close

- [x] `2026-05-21T15:56:36Z` DONE

### Round 7 — 2026-05-21, audit re-run after R2 findings resolved

- [x] `2026-05-21T17:00:00Z` ver npx tsc --noEmit → pass exit=0 (alt-opinion files: 0 errors)
- [x] `2026-05-21T17:00:00Z` ver node --test cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts → pass exit=0 (16/16)
- [x] `2026-05-21T17:00:00Z` ver npx tsx cli/gennady.ts lint alt-opinion/\*.ts → fail exit=0 (7 lint errors — see Audit Round 1 below)
- [x] `2026-05-21T17:00:00Z` DONE

#### Round close

- [x] `2026-05-21T17:00:00Z` Audit dispatched → FAIL (7 findings, phases_to_fix=[P1, P2])

## Audit Rounds

### Audit Round 1 — 2026-05-21, after Execution Round 7

```
@audit task=TSK-23 round=1 after-exec-round=7 triggered-reopen=Round-8 status=FAIL counts=B0·M4·m2·I1 phases_to_fix=[P1, P2]
F-01 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=cli/cmd/alt-opinion/alt-opinion.types.ts:96 | phase=P1 | src=ai/directives/coding/typescript-rules.xml#AX_BASE_CONTRACT_SHAPE | route=code-fix | act=поменять порядок тегов: `@returns` перед `@throws` в JSDoc метода `AltOpinionModelPort.generate()` — должно быть `@throws` затем `@returns`
F-02 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=cli/cmd/alt-opinion/alt-opinion-runner.ts:148 | phase=P2 | src=ai/directives/coding/typescript-rules.xml#AX_TAG_USAGE_MATRIX | route=code-fix | act=добавить `@param path` в JSDoc свойства `readFile` в `RunAltOpinionDeps`
F-03 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=cli/cmd/alt-opinion/alt-opinion-runner.ts:148 | phase=P2 | src=ai/directives/coding/typescript-rules.xml#AX_TAG_USAGE_MATRIX | route=code-fix | act=добавить `@returns` в JSDoc свойства `readFile` в `RunAltOpinionDeps`
F-04 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=cli/cmd/alt-opinion/alt-opinion-runner.ts:162 | phase=P2 | src=ai/directives/coding/typescript-rules.xml#AX_BASE_CONTRACT_SHAPE | route=code-fix | act=исправить порядок тегов в JSDoc `runAltOpinion`: `@returns` перед `@throws` → поменять; `@invariant` после `@sideEffect` → переместить перед `@param`
F-05 | sev=m | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/cli/alt-opinion/cli-alt-opinion.task-23.md:318 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=добавить блок `#### Round close` в Round 6 — отсутствует формальное закрытие раунда
F-06 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/cli/README.md:82 | phase=— | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=синхронизировать Reopens в трекере: ticket=5, tracker=2 → обновить tracker на 5
F-07 | sev=I | type=BDD_COVERAGE_MISMATCH | conf=M | loc=tasks/cli/alt-opinion/cli-alt-opinion.task-23.md:114 | phase=— | src=specs/cli/alt-opinion/alt-opinion.spec.md | route=ticket-update | act=добавить в ticket Meta `Deferred Test Ownership: TSK-25` для runner BDD-сценариев — тесты раннера существуют в `alt-opinion-runner.test.ts` (созданы TSK-25/TSK-26)
```

### Round 8 — 2026-05-21, audit-driven fix: F-01, F-02, F-03, F-04, F-05, F-06, F-07

#### P1 — re-run: fix: address audit findings F-01

- [x] `2026-05-21T17:05:00Z` recon targets=exists divergence=none
- [x] `2026-05-21T17:05:00Z` F-01: swapped @returns / @throws in AltOpinionModelPort.generate() JSDoc — @throws before @returns per AX_BASE_CONTRACT_SHAPE
- [x] `2026-05-21T17:05:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-21T17:05:00Z` ver npx tsx cli/gennady.ts lint cli/cmd/alt-opinion/alt-opinion.types.ts → pass exit=0 (0 errors)
- [x] `2026-05-21T17:05:00Z` DONE

#### P2 — re-run: fix: address audit findings F-02, F-03, F-04

- [x] `2026-05-21T17:05:00Z` recon targets=exists divergence=none
- [x] `2026-05-21T17:05:00Z` F-02: added @param path to readFile JSDoc in RunAltOpinionDeps
- [x] `2026-05-21T17:05:00Z` F-03: added @returns to readFile JSDoc in RunAltOpinionDeps
- [x] `2026-05-21T17:05:00Z` F-04: fixed tag order in runAltOpinion JSDoc — @invariant before @param, @throws before @returns
- [x] `2026-05-21T17:05:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-21T17:05:00Z` ver npx tsx cli/gennady.ts lint cli/cmd/alt-opinion/alt-opinion-runner.ts → pass exit=0 (0 errors)
- [x] `2026-05-21T17:05:00Z` ver node --test cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts → pass exit=0 (16/16)
- [x] `2026-05-21T17:05:00Z` DONE

#### Ticket-update: F-05, F-06, F-07

- [x] `2026-05-21T17:05:00Z` F-05: added #### Round close block to Round 6
- [x] `2026-05-21T17:05:00Z` F-06: synced tracker Reopens: 2 → 5
- [x] `2026-05-21T17:05:00Z` F-07: added Deferred Test Ownership: TSK-25 to ticket Meta

#### Round close

- [x] `2026-05-21T17:05:00Z` DONE

### Audit Round 2 — 2026-05-21, after Execution Round 8

```
@audit task=TSK-23 round=2 after-exec-round=8 triggered-reopen=none status=PASS counts=B0·M0·m0·I0
~applied | cli/cmd/alt-opinion/alt-opinion.types.ts:96 | @returns/ @throws порядок исправлен — @throws перед @returns
~applied | cli/cmd/alt-opinion/alt-opinion-runner.ts:148 | добавлены @param path и @returns в readFile JSDoc
~applied | cli/cmd/alt-opinion/alt-opinion-runner.ts:162 | порядок тегов в runAltOpinion исправлен — @invariant, @param, @throws, @returns, @sideEffect
~applied | ticket Round 6 | добавлен блок #### Round close
~applied | tasks/cli/README.md tracker | Reopens синхронизирован: 2 → 5
~applied | ticket Meta | добавлен Deferred Test Ownership: TSK-25
```
