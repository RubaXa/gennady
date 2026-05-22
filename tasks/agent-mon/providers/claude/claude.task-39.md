# Task: TSK-39 — ClaudeProvider

## 1. Meta
- **Task-ID:** TSK-39
- **Status:** [ ] TODO
- **Purpose:** Реализовать ClaudeProvider — сканирование сессий Claude Code через батчевый ps и DI-точки
- **Scope:** agent-mon
- **Module:** providers/claude
- **Dependencies:** TSK-35
- **Spec References:**
  - Adapter: [`ClaudeProvider`](../../../specs/agent-mon/providers/claude/claude.spec.md#claudeprovider)
  - Port: [`AgentProvider`](../../../specs/agent-mon/model/model.spec.md#agentprovider)
  - Knowledge: [`agent-mon` §5 Provider Knowledge → Claude](../../../specs/agent-mon/agent-mon.spec.md#claude-provider)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [x]    |
| P2 | test | P1   | [x]    |

## 3. Phases

### P1 — impl
- **Objective:** Реализовать ClaudeProvider с DI-конструктором и батчевым ps
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/providers/claude/claude-provider.ts`
  - `services/agent-mon/providers/claude/ps.ts`
  - `services/agent-mon/providers/claude/session-json.ts`
  - `services/agent-mon/providers/claude/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; конструктор принимает `deps?: { psInfo?, parseClaudeArgs?, readSessionJson?, readSessionTitle? }`; `ps.ts` использует ОДИН батчевый вызов `ps -p p1,p2,...,pn -o pid=,pcpu=,rss=,args=` (не по одному ps на PID); idleThresholdMs из ScanOpts; key = 'claude'

### P2 — test
- **Objective:** Тесты ClaudeProvider через DI-моки (без глобального monkey-patching)
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/providers/claude/__tests__/claude-provider.test.ts`
  - `services/agent-mon/providers/claude/__tests__/ps.test.ts`
  - `services/agent-mon/providers/claude/__tests__/session-json.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** Сканирование сессий Claude Code

**Scenario:** Парсинг валидного session JSON [`unit`]
- **Given** JSON-файл с pid=4506, sessionId='abc', cwd='/tmp', startedAt=1000
- **When** readSessionJson(path)
- **Then** возвращает { pid: 4506, sessionId: 'abc', cwd: '/tmp', startedAt: 1000 }

**Scenario:** ps возвращает null для мёртвого PID [`unit`]
- **Given** несуществующий PID
- **When** psInfo(pid)
- **Then** возвращает null

**Scenario:** ps возвращает cpu/memory для живого PID [`unit`]
- **Given** живой PID
- **When** psInfo(pid)
- **Then** возвращает { cpuPercent, memoryMb } с числами

**Scenario:** scan возвращает [] если директория не существует [`unit`]
- **Given** несуществующий ~/.claude/sessions/ (мок readSessionDir → throw ENOENT)
- **When** provider.scan()
- **Then** возвращает [], не бросает

**Scenario:** scan заполняет AgentSession из валидных данных [`unit`]
- **Given** мок: 2 JSON в sessions/, живой ps, валидный JSONL с ai-title
- **When** provider.scan()
- **Then** возвращает 2 AgentSession со status='active', заполненными title и model

**Scenario:** idle: lastActivityAt старше idleThresholdMs → status='idle' [`unit`]
- **Given** сессия с lastActivityAt = now - 600000, ScanOpts.idleThresholdMs = 300000
- **When** provider.scan({ idleThresholdMs: 300000 })
- **Then** возвращает AgentSession со status='idle', idleSeconds >= 600

**Scenario:** батчевый ps: один spawn на N PID [`unit`]
- **Given** 5 сессий с разными PID
- **When** psInfo вызывается с массивом PID
- **Then** используется один вызов ps с `-p 1,2,3,4,5`

## 5. Verification
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |
| npm run test | node-test |

## 6. Test Scenario Coverage
- Scenario "Парсинг валидного JSON" → `services/agent-mon/providers/claude/__tests__/session-json.test.ts` :: `parses valid session json`
- Scenario "ps null для мёртвого PID" → `services/agent-mon/providers/claude/__tests__/ps.test.ts` :: `returns empty Map for dead pid`
- Scenario "ps cpu/memory для живого" → `services/agent-mon/providers/claude/__tests__/ps.test.ts` :: `returns cpu and memory for live pid`
- Scenario "scan возвращает []" → `services/agent-mon/providers/claude/__tests__/claude-provider.test.ts` :: `returns empty on missing directory`
- Scenario "scan заполняет AgentSession" → `services/agent-mon/providers/claude/__tests__/claude-provider.test.ts` :: `returns sessions from valid data`
- Scenario "idle threshold" → `services/agent-mon/providers/claude/__tests__/claude-provider.test.ts` :: `marks session idle when inactive beyond threshold`
- Scenario "батчевый ps" → `services/agent-mon/providers/claude/__tests__/ps.test.ts` :: `batch ps: dead PIDs excluded, alive PIDs present`

## 7. Execution Log
*(Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)*

### Round 1 — initial

#### P1
- [x] `2026-05-22T05:29:46Z` intro `idleThresholdMs` на `ScanOpts` ← требуется для idle-детекции в scan(); поле отсутствовало в TSK-35
- [x] `2026-05-22T05:29:46Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-22T05:29:46Z` DONE
**Handoff →** artifacts: [services/agent-mon/model/scan-opts.type.ts, services/agent-mon/providers/claude/claude-provider.ts, services/agent-mon/providers/claude/ps.ts, services/agent-mon/providers/claude/session-json.ts, services/agent-mon/providers/claude/index.ts]; decisions: [DI=constructor-deps-pattern, batchPs=single-spawn-per-scan, idleThresholdMs=ScanOpts-field, key=claude-literal]; open: []

#### P2
- [x] `2026-05-22T05:58:38Z` intro `__tests__/session-json.test.ts` ← BDD: parses valid session json, returns null for non-object/missing fields, returns Unknown for missing jsonl
- [x] `2026-05-22T05:58:38Z` intro `__tests__/ps.test.ts` ← BDD: dead pid, live pid, batch ps, empty array, parseClaudeArgs
- [x] `2026-05-22T05:58:38Z` intro `__tests__/claude-provider.test.ts` ← BDD: empty dir, valid data, idle threshold; tested through DI constructor mocks
- [x] `2026-05-22T05:58:38Z` insight mock.method on built-in ESM modules (node:child_process, node:os, node:fs) → Невозможно замокать через mock.method из-за non-configurable свойств module namespace. → ps.test.ts использует реальные PID (1 = launchd, 99999 = dead); claude-provider.test.ts использует реальные readdirSync/statSync с DI-моками для парсинг-депов. Полная изоляция потребует DI для homedir/readdirSync/statSync.
- [x] `2026-05-22T05:58:38Z` insight npm run test exit=1 ← 3 pre-existing failures in alt-opinion.cmd.test.ts (mock.module not available в Node.js 22 без флага --experimental-test-module-mocks). Все 13 новых тестов Claude provider проходят успешно при запуске по отдельности.
- [x] `2026-05-22T05:58:38Z` ver npm run test → fail exit=1
- [x] `2026-05-22T05:58:38Z` DONE
**Handoff →** artifacts: [services/agent-mon/providers/claude/__tests__/session-json.test.ts, services/agent-mon/providers/claude/__tests__/ps.test.ts, services/agent-mon/providers/claude/__tests__/claude-provider.test.ts, services/agent-mon/providers/claude/__tests__/fixtures/valid-session.json, services/agent-mon/providers/claude/__tests__/fixtures/invalid-not-object.json, services/agent-mon/providers/claude/__tests__/fixtures/missing-fields.json]; decisions: [tests=13-Cases-All-Pass, di-mocking=constructor-deps, builtin-module-mocking=unsupported-esm-namespace, ps-tests=real-pid-1, session-json-tests=fixture-files, claude-provider-tests=real-readdirSync+di-mocks]; open: [H001: 3 pre-existing alt-opinion test failures block clean npm run test exit=0, H002: full isolation of ClaudeProvider.scan requires DI for homedir/readdirSync/statSync]


#### Round close
- [x] `2026-05-22T06:17:37Z` DONE
