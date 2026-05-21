# Task: TSK-26 — AltOpinion Telemetry

## 1. Meta & Traceability

- **Task-ID:** TSK-26
- **Purpose:** Добавить телеметрию в каждый opinion-блок: wall time, token usage, finish reason. Изменить `AltOpinionModelPort.generate()` сигнатуру с `Promise<string>` на `Promise<{ content, usage?, finishReason? }>`, расширить `AltOpinionResult` полем `telemetry`, обновить формат вывода runner, поправить cmd-адаптер провайдера, обновить тесты.
- **Scope:** cli
- **Module:** alt-opinion
- **Dependencies:** TSK-23, TSK-24, TSK-25
- **Spec References:**
  - FR-ALT-18..21: [cli spec §4.1.2](../../specs/cli/cli.spec.md)
  - NFC-09: [cli spec §4.2](../../specs/cli/cli.spec.md)
  - D-005: [module spec §6](../../specs/cli/alt-opinion/alt-opinion.spec.md)
- **§Effective Rules:** typescript-rules, node-test
- **Status:** `[x]` DONE
- **Verification Levels:** `unit`, `integration`
- **Target Files:**
  - `cli/cmd/alt-opinion/alt-opinion.types.ts` (Modify)
  - `cli/cmd/alt-opinion/alt-opinion-runner.ts` (Modify)
  - `cli/cmd/alt-opinion/alt-opinion.cmd.ts` (Modify)
  - `cli/cmd/alt-opinion/__tests__/alt-opinion-runner.test.ts` (Modify)
  - `cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts` (Modify)

## 2. Acceptance Criteria (BDD)

**Scenario:** Opinion block ends with telemetry line [`unit`]

- **Given** модель вернула `{ content: "OK", usage: { promptTokens: 10, completionTokens: 2 }, finishReason: "stop" }`
- **When** runner формирует вывод
- **Then** блок завершается `<!--TELEMETRY wall=<N>ms tokens=10/2 reason=stop-->`

**Scenario:** Telemetry without usage (no token info) [`unit`]

- **Given** порт вернул `{ content: "OK" }` (без usage)
- **When** runner формирует вывод
- **Then** блок завершается `<!--TELEMETRY wall=<N>ms reason=unknown-->`

**Scenario:** Synthesis block also has telemetry [`unit`]

- **Given** синтез-модель вернула ответ с usage
- **When** runner формирует синтез-блок
- **Then** синтез-блок завершается строкой `<!--TELEMETRY ...-->`

**Scenario:** Wall time measured correctly [`unit`]

- **Given** мок порта с задержкой 10ms
- **When** runner вызывает модель
- **Then** `telemetry.wallMs >= 10`

**Scenario:** Error model block has telemetry too [`unit`]

- **Given** модель упала с ошибкой
- **When** runner формирует блок ошибки
- **Then** блок содержит telemetry с wall временем (без токенов)

**Scenario:** Real smoke test with telemetry [`integration`]

- **Given** `echo "OK" | gennady alt-opinion --model=openrouter/google/gemini-2.0-flash-001`
- **When** команда выполняется
- **Then** stdout содержит `<!--TELEMETRY wall=` с реальными ms и токенами

## 3. Phases

### Phase P1 — types + port

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/alt-opinion.types.ts` (Modify)
- **Status:** [x]
- **Deps:** None
- **Acceptance:**
  - `AltOpinionModelPort.generate(prompt: string): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number }; finishReason?: string }>`
  - `AltOpinionResult` получает поле `telemetry?: AltOpinionTelemetry`
  - `AltOpinionTelemetry = { wallMs: number; promptTokens?: number; completionTokens?: number; finishReason?: string }`
  - `AltOpinionReport.synthTelemetry?: AltOpinionTelemetry`

### Phase P2 — runner + output

- **Status:** [x]
- **Deps:** P1
- **Acceptance:**
  - `queryModel`: замеряет wallMs через `performance.now()`, сохраняет usage/finishReason из ответа порта
  - `formatModelBlock`: добавляет `\n<!--TELEMETRY wall=<N>ms tokens=<p>/<c> reason=<r>-->` после END-якоря
  - `formatSynthBlock`: тоже добавляет telemetry строку
  - `cmd.ts` адаптер: `generateText` из AI SDK возвращает `{ text, usage, finishReason }` — правильно мапится в новый `generate()` контракт
  - При ошибке модели — telemetry с wall временем, без токенов

### Phase P3 — tests

- **Kind:** test
- **Rules:** node-test, typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/__tests__/alt-opinion-runner.test.ts` (Modify), `cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts` (Modify)
- **Status:** [x]
- **Deps:** P2
- **Acceptance:**
  - runner тесты: моки возвращают `{ content, usage, finishReason }` вместо строки; проверяют telemetry в выводе
  - cmd тесты: проверяют наличие `<!--TELEMETRY` в выводе
  - `npx tsc --noEmit` pass
  - `node --import tsx --test` pass (все 36+ тестов)

## 4. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-05-18T07:25:48Z` recon targets=exists divergence=none
- [x] `2026-05-18T07:25:48Z` rules typescript-rules
- [x] `2026-05-18T07:25:48Z` file cli/cmd/alt-opinion/alt-opinion.types.ts
- [x] `2026-05-18T07:25:48Z` intro AltOpinionTelemetry ← acceptance: P1.3 new telemetry type for wall time, token usage, finish reason
- [x] `2026-05-18T07:25:48Z` ver npx tsc --noEmit → fail exit=2 (ошибки только в P2-файлах runner/cmd — ожидаемо)
- [x] `2026-05-18T07:25:48Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion.types.ts]; decisions: [generate-returns-object-content-usage-finishReason, AltOpinionTelemetry-introduced]; open: []

#### P2

- [x] `2026-05-18T07:32:42Z` recon targets=exists divergence=none
- [x] `2026-05-18T07:32:42Z` rules typescript-rules
- [x] `2026-05-18T07:32:42Z` file cli/cmd/alt-opinion/alt-opinion-runner.ts
- [x] `2026-05-18T07:32:42Z` file cli/cmd/alt-opinion/alt-opinion.cmd.ts
- [x] `2026-05-18T07:32:42Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T07:32:42Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion-runner.ts, cli/cmd/alt-opinion/alt-opinion.cmd.ts]; decisions: [queryModel-measures-wallMs, formatTelemetryLine-helper, generate-adapter-maps-inputTokens-outputTokens]; open: []

#### P3

- [x] `2026-05-18T07:44:42Z` recon targets=exists divergence=none
- [x] `2026-05-18T07:44:42Z` rules node-test, typescript-rules
- [x] `2026-05-18T07:44:42Z` test cli/cmd/alt-opinion/**tests**/alt-opinion-runner.test.ts
- [x] `2026-05-18T07:44:42Z` test cli/cmd/alt-opinion/**tests**/alt-opinion.cmd.test.ts
- [x] `2026-05-18T07:44:42Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T07:44:42Z` ver node --import tsx --test cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts cli/cmd/alt-opinion/**tests**/alt-opinion-runner.test.ts → pass exit=0 (28 tests)
- [x] `2026-05-18T07:44:42Z` ver node --import tsx --experimental-test-module-mocks --test cli/cmd/alt-opinion/**tests**/alt-opinion.cmd.test.ts → pass exit=0 (12 tests)
- [x] `2026-05-18T07:44:42Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/__tests__/alt-opinion-runner.test.ts, cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts]; decisions: [runner-tests-updated-to-object-mocks, 4-new-telemetry-tests, cmd-tests-verify-telemetry-line]; open: []

### Round 2 — 2026-05-21, fix env vars + provider.chat()

#### P2 — re-run: fix env vars in cmd.ts adapter

- [x] `2026-05-21T08:21:00Z` recon targets=exists divergence=minor (env var names in cmd.ts)
- [x] `2026-05-21T08:21:00Z` file cli/cmd/alt-opinion/alt-opinion.cmd.ts
- [x] `2026-05-21T08:21:00Z` fix env var names: GENNADY_LLM_PROXY_* → LLM_PROXY_*, GENNADY_OPENROUTER_* → OPENROUTER_*
- [x] `2026-05-21T08:21:00Z` fix provider(model) → provider.chat(model) (D-006: Chat Completions API)
- [x] `2026-05-21T08:21:00Z` fix test env var cleanup (GENNADY_LLM_PROXY_* → LLM_PROXY_*)
- [x] `2026-05-21T08:21:00Z` ver node --import tsx --test → all 36 tests pass exit=0
- [x] `2026-05-21T08:21:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/alt-opinion/alt-opinion.cmd.ts, cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts]; decisions: [env-vars=LLM_PROXY_ADDR_KEY+LLM_PROXY_BASE_URL+OPENROUTER_API_KEY per spec §5.1, chat-api=provider.chat(model) per spec D-006, tests-updated=env var cleanup in test file]; open: []
