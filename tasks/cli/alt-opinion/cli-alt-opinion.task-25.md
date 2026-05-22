# Task: TSK-25 — AltOpinion Tests (parser + runner + integration)

## 1. Meta & Traceability

- **Task-ID:** TSK-25
- **Purpose:** Unit-тесты парсера (13 кейсов), runner (11 кейсов с DI-моками), CLI-интеграция (12 кейсов).
- **Scope:** cli
- **Module:** alt-opinion
- **Dependencies:** TSK-23, TSK-24
- **Spec References:**
  - alt-opinion FR: [cli spec §4.1.2](../../specs/cli/cli.spec.md)
  - Module spec: [alt-opinion spec §3](../../specs/cli/alt-opinion/alt-opinion.spec.md)
- **Status:** `[x]` DONE
- **Verification Levels:** `unit`, `integration`
- **Target Files:**
  - `cli/cmd/alt-opinion/__tests__/alt-opinion-parser.test.ts` (Create)
  - `cli/cmd/alt-opinion/__tests__/alt-opinion-runner.test.ts` (Create)
  - `cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts` (Create)

## 2. Acceptance Criteria (BDD)

### Parser tests (13)

**Scenario:** single model, :: syntax, repeated models, unknown provider, no provider, synthModel, file+stdin exclusive, strict flag, modelPrompt/synthPrompt, :: in filename, no models, TTY no file, empty args

### Runner tests (11)

**Scenario:** happy 2 models, 1 fail 1 success non-strict, all fail non-strict, strict 1 fail, synthesis only synth block, synthesis all fail, per-model prompt, order preservation, empty artifact, default prompt, sanitization

### CLI integration tests (12)

**Scenario:** --file existing, --file missing, stdin+file exclusive, no API key, all success exit 0, all fail non-strict exit 1, partial strict exit 1, markdown anchor format, synthModel only, modelPrompt from file, per-model :: syntax, empty stdin

## 3. Phases

### Phase P1 — parser tests

- **Kind:** test
- **Rules:** node-test, typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/__tests__/alt-opinion-parser.test.ts`
- **Status:** [x]
- **Deps:** TSK-23

### Phase P2 — runner tests

- **Kind:** test
- **Rules:** node-test, typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/__tests__/alt-opinion-runner.test.ts`
- **Status:** [x]
- **Deps:** TSK-23

### Phase P3 — CLI integration tests

- **Kind:** test
- **Rules:** node-test, typescript-rules
- **Target Files:** `cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts`
- **Status:** [x]
- **Deps:** TSK-23, TSK-24

## 4. Execution Log

### Round 1 — 2026-05-18, initial

- [x] `2026-05-18T00:50:00` recon targets=absent divergence=none
- [x] `2026-05-18T00:50:00` file cli/cmd/alt-opinion/**tests**/alt-opinion-parser.test.ts
- [x] `2026-05-18T00:50:00` file cli/cmd/alt-opinion/**tests**/alt-opinion-runner.test.ts
- [x] `2026-05-18T00:50:00` file cli/cmd/alt-opinion/**tests**/alt-opinion.cmd.test.ts
- [x] `2026-05-18T00:50:00` ver node --import tsx --test parser + runner → 24/24 pass exit=0
- [x] `2026-05-18T00:51:00` ver node --import tsx --experimental-test-module-mocks --test cmd → 12/12 pass exit=0
- [x] `2026-05-18T00:51:00` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T00:51:00` Scenario coverage: 13 parser + 11 runner + 12 CLI = 36/36
- [x] `2026-05-18T00:51:00` DONE

### Round 2 — 2026-05-18, real smoke test

- [x] `2026-05-18T00:55:00` smoke echo "OK" | gennady alt-opinion --model=openrouter/google/gemini-2.0-flash-001 → exit=0, output OK
- [x] `2026-05-18T00:55:00` smoke 2 models parallel → gemini OK, deepseek-r1 error (graceful degradation) exit=0
- [x] `2026-05-18T00:55:00` DONE

**Handoff →** artifacts: 3 test files, 36 tests pass, 2 real smoke tests pass; decisions: parser 13 cases, runner 11 cases with DI mocks, CLI 12 cases with mock.module; open: none

### Round 3 — 2026-05-21, llmproxy smoke test (D-007)

- [x] `2026-05-21T08:21:00Z` smoke echo "content" | gennady alt-opinion --model=llmproxy/deepseek-v4-pro --model=llmproxy/glm-5.1 --synthModel=llmproxy/deepseek-v4-pro → exit=0, синтез-блок с телеметрией (wall=169502ms tokens=4282/4712 reason=stop)
- [x] `2026-05-21T08:21:00Z` fix env vars: LLM*PROXY_API_KEY, LLM_PROXY_BASE_URL (было GENNADY_LLM_PROXY*\*)
- [x] `2026-05-21T08:21:00Z` fix provider.chat() — Chat Completions API вместо Responses API (D-006)
- [x] `2026-05-21T08:21:00Z` ver node --import tsx --test → all 36 tests pass exit=0
- [x] `2026-05-21T08:21:00Z` DONE

**Handoff →** artifacts: 3 test files, 36 tests pass, 3 real smoke tests pass (openrouter + llmproxy); decisions: env-var-naming=LLM*PROXY*_ not GENNADY*LLM_PROXY*_, chat-api=provider.chat() not provider(), smoke-llmproxy=D-007; open: none
