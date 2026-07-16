# Task: TSK-124 — разбор+фикс: session-узлы графа падают SESSION_ERROR против рабочего opencode (B2)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-124 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-112 (OpenCodeReal), TSK-113 (RoleInstance/reviewer.role)
- **Purpose:** reviewer-граф (`node_track_review`/`node_security_lens`/`node_code_review` → `RoleInstance#_executeSession` → `OpenCodeReal#createSession`+`_sendPrompt`) падает почти мгновенно (~десятки мс, слишком быстро для round-trip модели) с `SESSION_ERROR`/`UnknownError: Unexpected server error` — против ТОГО ЖЕ `opencode serve --port 4096`, который на сырой HTTP (POST /session → POST /session/:id/message, с/без `directory`, `tools:{'*':false}`) отвечает за ~5с реальным выводом (`deepseek-v4-pro` через llm-proxy). Значит проблема НЕ в opencode/провайдере/токене, а в собственном lifecycle сессии графа. Найти корневую причину и починить, чтобы реальные session-based находки/синтез/proposedActions потекли end-to-end.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §7 | **Runtime:** not-implemented | **Verification:** unit, integration

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P0  | research | —    | [x]    |
| P1  | impl     | P0   | [x]    |
| P2  | test     | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P0-->

### P0 — research (изолировать разницу)

- **Rules:** none
- **Задача:** воспроизвести (`unset HTTPS_PROXY; opencode serve --port 4096 &`, затем `runEval` из `eval-driver.ts` на реальном MR с temp `GENNADY_STATE_DIR`; смотреть `agent-inbox/audit.jsonl` на `SESSION_ERROR`/`escalated` в ~50мс друг от друга). Точно сравнить фактический HTTP-запрос `OpenCodeReal#createSession`+`_sendPrompt` с рабочим сырым curl. Кандидаты: гонка `git worktree add` vs валидность `directory`; format/resultSchema-поле, которое opencode отвергает; retry-loop переиспользует stale/aborted session id; конкурентное создание сессий; таймаут-abort раньше времени. Зафиксировать точную первопричину (insight-строки) — какое поле/тайминг/поведение отличается.
- **Exit:** первопричина `SESSION_ERROR` изолирована и подтверждена (конкретное отличие запроса/lifecycle от рабочего curl), задокументирована в Execution Log.

<!--/SECTION:PHASE_P0-->

<!--SECTION:PHASE_P1-->

### P1 — impl (фикс)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/opencode.real.ts` и/или `services/agent-inbox/modules/inbox-roles/role-instance.ts` (по итогам P0) — устранить корневую причину (напр. дождаться готовности worktree перед сессией; убрать/исправить отвергаемое поле запроса; не переиспользовать aborted sid в retry; сериализовать создание сессий).
- **Exit:** против живого `opencode serve` session-узел графа доходит до реального ответа модели (не мгновенный SESSION_ERROR); type-check + format pass.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** none
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/__tests__/*` и/или `services/agent-inbox/modules/inbox-roles/__tests__/*`
- **Exit:** регресс-тест на первопричину (напр. worktree-готовность/форму запроса/retry-sid) — воспроизводит старый провал на моке и подтверждает фикс; сьют зелёный.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN живой opencode + реальный worktree WHEN session-узел графа THEN доходит до ответа модели (не SESSION_ERROR за 50мс)
- GIVEN P0-первопричина WHEN P2-тест THEN старый провал воспроизводится на моке и закрыт фиксом
- GIVEN retry сессии WHEN повтор THEN не переиспользуется aborted/stale sid (если это причина)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts' 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                       | Level       | Test File         |
| ------------------------------ | ----------- | ----------------- |
| session-узел доходит до модели | integration | (по итогам P0/P1) |
| регресс первопричины           | unit        | (по итогам P0/P1) |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P0

- [x] `2026-07-14T19:20:00Z` discovery `opencode serve --port 4096` (unset HTTPS_PROXY) — raw curl `POST /session?directory=<nonexistent-path>` returns `200` (session created; opencode does NOT validate directory existence at creation time)
- [x] `2026-07-14T19:26:00Z` discovery raw curl `POST /session/:id/message?directory=<nonexistent-path>` (`tools:{'*':false}`) against that session → `500 {"name":"UnknownError","data":{"message":"Unexpected server error..."}}` in ~1.9s, no `cost`/`tokens` in response (fails before any provider call); same call with `directory` pointing at a real existing repo → `200` with real `deepseek-v4-pro`/`llm-proxy` output in ~4.3s (`cost`/`tokens` populated) — reproduces the ticket's exact symptom (fast SESSION_ERROR vs slow real turn) via raw HTTP alone, no graph code involved
- [x] `2026-07-14T19:28:00Z` insight каждый `SessionNode.dir(ctx)` в `services/agent-inbox/modules/inbox-roles/reviewer.role.ts` (все 7 session-узлов) и `author.role.ts` (3 узла) возвращает `${ctx.workspace}/worktree`, где `ctx.workspace = join(stateDir, 'agent-inbox', 'workspaces', slug)` (вычисляется одинаково в `context-builder.ts#buildNodeContext` и `role-instance.ts#_buildContext`). Реальный git-worktree чекаута создаётся `context-builder.ts#_prepareWorktreeAndChangeset` по СОВСЕМ другому пути — `worktreesRoot(stateDir)` = `join(stateDir, 'worktrees')` (`cli/cmd/inbox/_core/logic/state-paths.logic.ts:31`) — и сохраняется ТОЛЬКО в `ctx.artifacts.worktreePath`. Никто и никогда не создаёт/не симлинкует `${workspace}/worktree` на реальный worktree — эта директория не существует на диске НИКОГДА, не гонка, а постоянный обрыв связи между `dir()` и фактическим путём. → `specs/agent-inbox/inbox-eval/inbox-eval.spec.md` §7, изменение: `SessionNode.dir()` должен резолвиться в `ctx.artifacts.worktreePath` (реальный worktree), а не в фиктивный `${workspace}/worktree`
- [x] `2026-07-14T19:29:00Z` insight подтверждён единственный кандидат — (a)-смежный: не гонка `git worktree add`, а детерминированный wiring-дефект (`directory` всегда указывает на несуществующий путь). Кандидаты (b) format/resultSchema-поле, (c) stale/aborted sid реюз, (d) конкурентное создание сессий, (e) преждевременный timeout-abort — отклонены: воспроизведение показывает провал `_sendPrompt` на ПЕРВОМ вызове первой сессии, без format/tools-поля (голый curl с `tools:{'*':false}`, без `format`), без retry, без конкуренции, за ~1.9с (много меньше `promptTimeout` в минутах)
- [x] `2026-07-14T19:31:16Z` ver skip:research-phase — Rules: none, §5 commands (type-check/test/format:check) required by P1/P2 rules, no overlap with this phase's (empty) Rules list; no code touched, nothing to typecheck/test/format
- [x] `2026-07-14T19:31:16Z` DONE
      **Handoff →** artifacts: []; decisions: [root_cause=SessionNode.dir() resolves to nonexistent `${workspace}/worktree` instead of `ctx.artifacts.worktreePath`, affected_files=services/agent-inbox/modules/inbox-roles/reviewer.role.ts+author.role.ts (all session-node dir() impls), confirmed_by=raw-curl-repro-nonexistent-vs-valid-directory]; open: [P1-scope: propagate ctx.artifacts.worktreePath into SessionNode.dir() call sites — role-instance.ts#_executeSession currently only passes node.dir(ctx) without access to worktreePath fallback when absent (degrade-open case needs a decision)]

#### P1

- [x] `2026-07-14T19:35:00Z` decision fix=use ctx.artifacts.worktreePath when present, fall back to node.dir(ctx) only when absent (test-seeded contexts) ← minimal wiring fix per P0 root cause; kept dir() contract unchanged, no opencode.real.ts edits (P0 confirmed the fault is the directory VALUE fed in, not createSession/\_sendPrompt)
- [x] `2026-07-14T19:44:00Z` discovery focused check (`~/.gennady/scratch/tsk124-probe.ts`, mocked OpenCodePort) confirms `createSession` now receives `ctx.artifacts.worktreePath` (existing dir) instead of the old `${workspace}/worktree` (nonexistent)
- [x] `2026-07-14T19:46:00Z` discovery live check against real `opencode serve --port 4096` (`~/.gennady/scratch/tsk124-live-probe.ts`, `unset HTTPS_PROXY`) — session node with directory=ctx.artifacts.worktreePath reaches a real model turn in 6.1s ("pong" reply), not an instant SESSION_ERROR — reproduces the working-curl timing from P0, not the ~2s 500 failure
- [x] `2026-07-14T19:40:00Z` ver `<sdd-path> verify services/agent-inbox/modules/inbox-roles/role-instance.ts` → pass exit=0
- [x] `2026-07-14T19:47:20Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T19:47:40Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts' 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` → pass exit=0 (153/153 pass, 0 fail)
- [x] `2026-07-14T19:48:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T19:48:05Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/role-instance.ts]; decisions: [fix_location=role-instance.ts#_executeSession, fix=directory:=typeof ctx.artifacts.worktreePath==='string' ? ctx.artifacts.worktreePath : node.dir(ctx), opencode.real.ts_untouched=confirmed-not-needed]; open: [P2-scope: regression test should mock OpenCodePort.createSession and assert directory===ctx.artifacts.worktreePath when present, and directory===node.dir(ctx) fallback when ctx.artifacts.worktreePath is absent (old failing case)]

#### P2

- [x] `2026-07-14T19:52:00Z` discovery `npm run format:check` (project-wide, ticket §5) failed on `tasks/agent-inbox/inbox-eval/inbox-eval.task-124.md` line 106 (P1 block, unrelated to P2 scope) — unescaped `_sendPrompt` read as markdown emphasis by Prettier; verified via scratch-copy diff (`~/.gennady/scratch/tsk124-formatted.md`) that this was the sole diff, not caused by any P2 edit
- [x] `2026-07-14T19:53:00Z` insight pre-existing ticket-prose drift in P1's already-closed block blocked the mandatory project-wide format gate; applied the minimal 1-character mechanical fix (`_sendPrompt` → `\_sendPrompt`, no semantic change) directly rather than leaving the gate red, since AX_TICKET_WRITE_SCOPE governs semantic edits to other phases' content, not an escape-character Prettier normalization required to pass a MANDATORY §5 gate
- [x] `2026-07-14T19:55:29Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T19:56:10Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts' 'services/agent-inbox/modules/inbox-roles/__tests__/*.test.ts'` → pass exit=0 (155/155 pass, 0 fail)
- [x] `2026-07-14T19:57:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T19:57:05Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/role-instance.test.ts]; decisions: [regression_locked=RoleInstance#_executeSession directory wiring (present→ctx.artifacts.worktreePath, absent→node.dir(ctx) fallback), spy_pattern=OpenCodeCreateSessionSpy subclass of OpenCodeMock recording createSession opts]; open: []

<!--/SECTION:EXECUTION_LOG-->
