# Task: TSK-116 — ai-kit: компиляция system prompt из директив

## 1. Meta

- **Task-ID:** TSK-116 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** services/ai-kit | **Dependencies:** —
- **Purpose:** Рефакторинг существующего кода компиляции директив в `services/ai-kit/`. v1: `buildSystemPrompt(role, ctx)` читает директивы из `ai/directives/agent-inbox/` напрямую и склеивает в system prompt. Без JSON-схем, без тяжёлых форматов.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-12, Bootstrap #12 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/ai-kit/compile.ts` — `buildSystemPrompt(role, ctx) → Promise<string>`: читает директивы по маппингу роль→файлы, склеивает
  - `services/ai-kit/role-map.ts` — маппинг: `reviewer` → `[arch-interrogation, code-interrogation]`, `author` → `[arch-interrogation, code-interrogation]`
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

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
