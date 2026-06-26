# Task: TSK-72 — vcs-reply: resolve/reopen discussion через stdin JSON

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-72
- **Status:** [ ] TODO
- **Purpose:** Расширить `vcs-reply`: поле `resolve: true|false` в stdin JSON — резолв/реопен discussion (с ответом или без)
- **Scope:** `cli`
- **Module:** `vcs-reply` (refine)
- **Dependencies:** TSK-71
- **Reopens:** 0
- **Spec References:**
  - Scope spec: [cli.spec.md §4.1.13, D-018](../../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->
### P1 — impl
- **Objective:** Расширить stdin JSON-парсинг: поле `resolve?: boolean`. Добавить логику: `resolve:true + discussionId + body` → addNote → resolveDiscussion; `resolve:true + discussionId` (без body) → resolveDiscussion; `resolve:false + discussionId` → reopen (body игнорируется). Валидация: `resolve:true` без `discussionId` → ошибка. `--dry-run` для resolve и reopen. Exit code: 0 все успешно или пустой массив, 1 ≥1 элемент упал. `project`/`iid` из CLI-флагов пробрасываются в вызовы `addNote`/`resolveDiscussion`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
- **Inputs:** TSK-71 handoff (resolveDiscussion)
- **Exit:** resolve логика интегрирована; typecheck pass; `project`/`iid` передаются в вызовы
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** Unit-тесты: resolve+reply (полный вызов с project/iid), resolve-only, reopen, reopen+body (body игнорируется), resolve без discussionId → validation error, resolve-only с 403 ошибкой, addNote ok + resolve fail → warning, dry-run для resolve и reopen, пустой массив → exit 0, exit code при partial failure. Регрессия: существующие тесты vcs-reply не сломаны.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-reply/__tests__/vcs-reply.resolve.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 11 BDD сценариев покрыты; tests pass; существующие тесты vcs-reply не сломаны
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)

**Feature:** Resolve discussion через vcs-reply stdin JSON

**Scenario:** Ответ + резолв [`unit`]
- **Given** `--project g/r --iid 42` + stdin `[{discussionId:"abc", body:"fixed", resolve:true}]`
- **When** команда выполняется
- **Then** вызывается `addNote({project:"g/r", iid:42, discussionId:"abc", body:"fixed"})`
- **And** после успеха вызывается `resolveDiscussion({project:"g/r", iid:42, discussionId:"abc", resolved:true})`
- **And** exit 0

**Scenario:** Только резолв (без body) [`unit`]
- **Given** `--project g/r --iid 42` + stdin `[{discussionId:"abc", resolve:true}]`
- **When** команда выполняется
- **Then** `addNote` не вызывается
- **And** вызывается `resolveDiscussion({project:"g/r", iid:42, discussionId:"abc", resolved:true})`

**Scenario:** Только резолв с ошибкой API [`unit`]
- **Given** `resolveDiscussion` выбрасывает VcsError с status=403
- **When** элемент `{discussionId:"abc", resolve:true}`
- **Then** stderr содержит ошибку 403
- **And** exit 1

**Scenario:** Reopen [`unit`]
- **Given** stdin `[{discussionId:"abc", resolve:false}]`
- **When** команда выполняется
- **Then** вызывается `resolveDiscussion({project:"g/r", iid:42, discussionId:"abc", resolved:false})`

**Scenario:** Reopen + body → body игнорируется [`unit`]
- **Given** stdin `[{discussionId:"abc", body:"irrelevant", resolve:false}]`
- **When** команда выполняется
- **Then** `addNote` не вызывается
- **And** вызывается `resolveDiscussion({..., resolved:false})` (body игнорируется)

**Scenario:** resolve без discussionId → ошибка валидации [`unit`]
- **Given** stdin `[{body:"hi", resolve:true}]`
- **When** команда выполняется
- **Then** stderr содержит «resolve требует discussionId»
- **And** exit 1

**Scenario:** addNote ок, resolve fail → warning [`unit`]
- **Given** `addNote` успешен, `resolveDiscussion` выбрасывает 403
- **When** элемент `{discussionId:"abc", body:"fixed", resolve:true}`
- **Then** stderr содержит «Note posted but resolve failed: 403 Forbidden»
- **And** exit 1

**Scenario:** Exit code partial failure [`unit`]
- **Given** массив из 2 элементов: один успешен, один упал
- **When** команда выполняется
- **Then** exit 1 (≥1 упал)

**Scenario:** Пустой массив → exit 0 [`unit`]
- **Given** stdin `[]`
- **When** команда выполняется
- **Then** exit 0

**Scenario:** Dry-run для resolve [`unit`]
- **Given** `--dry-run` + `{discussionId:"abc", resolve:true}`
- **When** команда выполняется
- **Then** stdout «Would resolve: discussionId=abc», API не вызывается

**Scenario:** Dry-run для reopen [`unit`]
- **Given** `--dry-run` + `{discussionId:"abc", resolve:false}`
- **When** команда выполняется
- **Then** stdout «Would reopen: discussionId=abc», API не вызывается
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification
| Command | Required by |
|---------|-------------|
| `tsc --noEmit` | typescript-rules |
| `node --import tsx --test cli/cmd/vcs-reply/__tests__/vcs-reply.resolve.test.ts` | node-test |
| `node --import tsx --test cli/cmd/vcs-reply/__tests__/vcs-reply.cmd.test.ts` | node-test (regression) |

- **Task-specific Completion additions:** None
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage
- Ответ+резолв → `vcs-reply.resolve.test.ts` :: `resolve+reply: project/iid passed to addNote then resolveDiscussion`
- Только резолв → `vcs-reply.resolve.test.ts` :: `resolve-only: no addNote, resolveDiscussion with project/iid`
- Резолв с ошибкой → `vcs-reply.resolve.test.ts` :: `resolve-only 403: VcsError propagated`
- Reopen → `vcs-reply.resolve.test.ts` :: `reopen: resolved=false`
- Reopen+body → `vcs-reply.resolve.test.ts` :: `reopen with body: body ignored, only reopen`
- resolve без discussionId → `vcs-reply.resolve.test.ts` :: `resolve without discussionId: validation error`
- addNote ok, resolve fail → `vcs-reply.resolve.test.ts` :: `addNote succeeds, resolve fails: warning with error text`
- Exit code → `vcs-reply.resolve.test.ts` :: `partial failure: exit 1`
- Пустой массив → `vcs-reply.resolve.test.ts` :: `empty array: exit 0`
- Dry-run resolve → `vcs-reply.resolve.test.ts` :: `dry-run resolve: prints Would resolve`
- Dry-run reopen → `vcs-reply.resolve.test.ts` :: `dry-run reopen: prints Would reopen`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log
### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] `<ts>` ver `tsc --noEmit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: []; decisions: []; open: []

#### P2
- [ ] `<ts>` ver `node --import tsx --test ...` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: []; decisions: []; open: []

#### Round close
- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
