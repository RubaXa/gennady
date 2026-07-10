# Task: TSK-109 — inbox-core: StateStore + InboxConfig + InboxRegistry + AuditLog

## 1. Meta

- **Task-ID:** TSK-109 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** TSK-90–TSK-94 (DONE CLI config/registry)
- **Purpose:** Перенос CLI-логики состояния (config, registry, audit) в модуль `inbox-core`. CLI начинает использовать модуль вместо прямых вызовов `_core/logic/`. Файлы состояния остаются общими (SV-12). Атомарность, structured signal, дельта — переиспользуются.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-03, AI-20, AI-21, [inbox-core.spec.md](../../specs/agent-inbox/inbox-core/inbox-core.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/inbox-config.ts` — InboxConfig: обёртка над `cli/cmd/inbox/_core/logic/inbox-config.logic.ts`
  - `services/agent-inbox/modules/inbox-core/inbox-registry.ts` — InboxRegistry: обёртка над `cli/cmd/inbox/_core/logic/inbox-registry.logic.ts`
  - `services/agent-inbox/modules/inbox-core/audit-log.ts` — AuditLog: новый, append-only, ротация 10MB
  - `services/agent-inbox/modules/inbox-core/state-store.ts` — StateStore: единая точка доступа
  - `services/agent-inbox/modules/inbox-core/errors.ts` — коды ошибок (AI-22)
- **Exit:** Файлы читаются/пишутся атомарно. CLI рефакторен на inbox-core. AuditLog — новый.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/__tests__/inbox-config.test.ts`
  - `services/agent-inbox/modules/inbox-core/__tests__/inbox-registry.test.ts`
  - `services/agent-inbox/modules/inbox-core/__tests__/audit-log.test.ts`
  - `services/agent-inbox/modules/inbox-core/__tests__/state-store.test.ts`
- **Exit:** Все тесты проходят. Покрыты: structured signal, дельта (NEW/↑/idle), атомарная запись, ротация, ошибки.

## 4. BDD

- GIVEN config.json нет WHEN loadConfig() THEN { configured: false, missing: [...] }
- GIVEN config.json валидный WHEN loadConfig() THEN InboxConfig { configured: true }
- GIVEN config.json повреждён WHEN loadConfig() THEN { configured: false }
- GIVEN реестр с 2 MR WHEN updateDelta([MR1(updated), MR3(new)]) THEN delta = { NEW: [MR3], '↑': [MR1] }
- GIVEN audit.jsonl > 10MB WHEN append() THEN ротация в audit.1.jsonl
- GIVEN stateDir не существует WHEN StateStore.saveConfig() THEN директория создана, файл записан атомарно

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                               | Level | Test File              |
| -------------------------------------- | ----- | ---------------------- |
| config отсутствует → structured signal | unit  | inbox-config.test.ts   |
| config валидный → InboxConfig          | unit  | inbox-config.test.ts   |
| config повреждён → configured:false    | unit  | inbox-config.test.ts   |
| config save атомарно                   | unit  | inbox-config.test.ts   |
| реестр: дельта NEW/↑/idle              | unit  | inbox-registry.test.ts |
| реестр: promoteHeadSha                 | unit  | inbox-registry.test.ts |
| audit: append + query                  | unit  | audit-log.test.ts      |
| audit: ротация 10MB                    | unit  | audit-log.test.ts      |
| state-store атомарность                | unit  | state-store.test.ts    |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
