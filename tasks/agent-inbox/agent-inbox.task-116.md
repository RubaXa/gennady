# Task: TSK-116 — ai-kit: компиляция system prompt из директив

## 1. Meta

- **Task-ID:** TSK-116 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** services/ai-kit | **Dependencies:** —
- **Purpose:** Компиляция system prompt из AIKit-директив для узлов роли. v1: `buildNodePrompt(nodeId, ctx)` читает директивы по маппингу узел→файлы и склеивает. Per-node сборка (не per-role).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-12, Bootstrap #12 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/ai-kit/compile.ts` — `buildNodePrompt(nodeId, ctx) → Promise<string>`: читает директивы по маппингу узел→файлы, склеивает
  - `services/ai-kit/node-map.ts` — маппинг: `node_scaffold` → `[arch-interrogation]`, `node_review` → `[arch-interrogation, code-interrogation]`
- **Exit:** Вызов `buildSystemPrompt('reviewer', ctx)` возвращает system prompt из AIKit-директив.

### P2 — test

- **Rules:** none
- **Target Files:** `services/ai-kit/__tests__/compile.test.ts`
- **Exit:** Тест: для роли reviewer возвращается непустая строка, содержащая ключевые слова из директив.

## 4. BDD

- GIVEN роль reviewer WHEN buildSystemPrompt THEN system prompt содержит arch-interrogation + code-interrogation
- GIVEN роль author WHEN buildSystemPrompt THEN system prompt содержит arch-interrogation + code-interrogation
- GIVEN несуществующая директива WHEN buildSystemPrompt THEN ошибка, роль не загружена
- GIVEN пустой ctx WHEN buildSystemPrompt THEN system prompt без MR-специфичных данных (только директивы)

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/ai-kit/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1 — 2026-07-10, initial

#### P1

- [x] `2026-07-10T11:00:00Z` Created `services/ai-kit/compile.ts` — `buildNodePrompt(nodeId, ctx) → Promise<string>`: читает директивы по маппингу узел→файлы, склеивает system prompt
- [x] `2026-07-10T11:00:00Z` Created `services/ai-kit/node-map.ts` — маппинг: `node_scaffold` → `[arch-interrogation]`, `node_review` → `[arch-interrogation, code-interrogation]`
- [x] `2026-07-10T11:05:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T11:05:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T11:05:00Z` DONE
- [x] **Handoff →** artifacts: [compile.ts, node-map.ts]; decisions: [D_per_node=node→directives (не per-role)]; open: []

#### P2

- [x] `2026-07-10T11:10:00Z` Created `services/ai-kit/__tests__/compile.test.ts` — 7 tests: reviewer prompt содержит arch-interrogation + code-interrogation; author role; missing directive → error; nodeScaffold → arch-interrogation only
- [x] `2026-07-10T11:10:00Z` ver `npm run test -- 'services/ai-kit/__tests__/*.test.ts'` → pass exit=0 (7/7)
- [x] `2026-07-10T11:10:00Z` DONE
- [x] **Handoff →** artifacts: [compile.test.ts]; decisions: [test_counts=7]; open: []

#### Round close

- [x] `2026-07-10T11:15:00Z` sync ai-kit
- [x] `2026-07-10T11:15:00Z` DONE
