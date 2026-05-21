# Task: TSK-24 — AltOpinion CLI (cmd + prompts + registration)

## 1. Meta & Traceability

- **Task-ID:** TSK-24
- **Purpose:** Реализовать CLI-обвязку `alt-opinion.cmd.ts`, дефолтные промпт-файлы, регистрацию в `gennady.ts`, `help.cmd.ts`, `cli/AGENTS.md`.
- **Scope:** cli
- **Module:** alt-opinion
- **Dependencies:** TSK-23
- **Spec References:**
  - alt-opinion Golden DX: [cli spec §3 alt-opinion DX](../../specs/cli/cli.spec.md)
  - alt-opinion Architecture §5.2: [cli spec](../../specs/cli/cli.spec.md)
- **Status:** `[x]` DONE
- **Verification Levels:** `integration`
- **Target Files:**
  - `cli/cmd/alt-opinion/index.ts` (Create)
  - `cli/cmd/alt-opinion/alt-opinion.cmd.ts` (Create)
  - `cli/cmd/alt-opinion/prompts/default-opinion.prompt.md` (Create)
  - `cli/cmd/alt-opinion/prompts/default-synth.prompt.md` (Create)
  - `cli/gennady.ts` (Modify)
  - `cli/cmd/help/help.cmd.ts` (Modify)
  - `cli/AGENTS.md` (Modify)

## 2. Acceptance Criteria (BDD)

**Scenario:** stdin → вызов runner → Markdown вывод [`integration`]
**Scenario:** --file → чтение файла → runner [`integration`]
**Scenario:** --file не существует → ошибка [`integration`]
**Scenario:** stdin + --file → ошибка [`integration`]
**Scenario:** --synthModel → только синтез [`integration`]
**Scenario:** Без --synthModel → все мнения [`integration`]
**Scenario:** Нет API-ключа → ошибка [`integration`]
**Scenario:** --strict: ошибка → exit 1 [`integration`]
**Scenario:** --modelPrompt из файла [`integration`]
**Scenario:** Per-model prompt override :: [`integration`]
**Scenario:** Дефолтные промпты [`integration`]
**Scenario:** Регистрация в gennady.ts [`integration`]
**Scenario:** help содержит alt-opinion [`integration`]
**Scenario:** Env vars: LLM_PROXY_API_KEY, LLM_PROXY_BASE_URL, OPENROUTER_API_KEY [`integration`]
**Scenario:** provider.chat(modelId) — Chat Completions API (D-006) [`integration`]

## 3. Phases

### Phase P1 — cmd + prompts + registration

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** см. выше
- **Status:** [x]
- **Deps:** TSK-23

## 4. Execution Log

### Round 1 — 2026-05-18, initial

- [x] `2026-05-18T00:40:00` recon targets=absent divergence=none
- [x] `2026-05-18T00:40:00` file cli/cmd/alt-opinion/index.ts
- [x] `2026-05-18T00:40:00` file cli/cmd/alt-opinion/alt-opinion.cmd.ts
- [x] `2026-05-18T00:40:00` file cli/cmd/alt-opinion/prompts/default-opinion.prompt.md
- [x] `2026-05-18T00:40:00` file cli/cmd/alt-opinion/prompts/default-synth.prompt.md
- [x] `2026-05-18T00:40:00` file cli/gennady.ts (case 'alt-opinion')
- [x] `2026-05-18T00:40:00` file cli/cmd/help/help.cmd.ts (alt-opinion + lint)
- [x] `2026-05-18T00:40:00` file cli/AGENTS.md (alt-opinion row)
- [x] `2026-05-18T00:40:00` intro AltOpinionCmdDeps, run, resolveModelAnchorKey, sanitizeOutput
- [x] `2026-05-18T00:40:00` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T00:40:00` DONE

### Round 2 — 2026-05-18, audit-driven fix: F-01..F-07

- [x] `2026-05-18T00:42:00` fix index.ts headers (@file, @consumers, @tasks)
- [x] `2026-05-18T00:42:00` fix spec Entity Inventory (AltOpinionCmdDeps, run)
- [x] `2026-05-18T00:42:00` fix spec AltOpinionModelPort signature
- [x] `2026-05-18T00:42:00` fix Execution Log placeholders
- [x] `2026-05-18T00:42:00` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T00:42:00` DONE

**Handoff →** artifacts: all 7 target files; decisions: cmd runs via AI SDK providers; open: none
