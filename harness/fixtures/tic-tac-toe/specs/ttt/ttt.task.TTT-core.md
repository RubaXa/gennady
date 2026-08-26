# Task: TTT-core — Tic-tac-toe engine + CLI

<!--SECTION:META-->
## Meta
- **Task-ID:** TTT-core
- **Status:** [ ] TODO
- **Purpose:** Реализовать чистый движок крестиков-ноликов (`createGame`/`applyMove`/`status`/`render`) и тонкий CLI поверх него, с юнит- и e2e-тестами.
- **Scope:** ttt
- **Module:** N/A
- **Dependencies:** None
- **Spec References:**
  - Contract: [Public API Surface](./ttt.spec.md#public-api-surface)
  - Constraints: [Requirements TTT-REQ-1..4](./ttt.spec.md#requirements)
  - Constraints: [Architecture](./ttt.spec.md#architecture)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `e2e`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |
| P3 | impl | P1 | [ ] |
| P4 | test | P3 | [ ] |

<!-- Kind ∈ bootstrap | impl | test | config | doc | refactor (fix only on execution). impl and test are ALWAYS separate phases. Orchestrator reads this table to plan. -->
<!--/SECTION:PHASES_OVERVIEW-->

## Phases

<!--SECTION:PHASE_P1-->
### P1 — impl
- **Objective:** Реализовать чистый движок: `createGame`, `applyMove` (новый неизменяемый state, исключение на нелегальный ход), `status`, `render`.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Spec Refs:**
  - Contract: [Public API Surface](./ttt.spec.md#public-api-surface)
  - Constraints: [Requirements TTT-REQ-1..3](./ttt.spec.md#requirements)
- **Target Files:**
  - src/game.ts (new)
- **Entities:** createGame, applyMove, status, render, GameState
- **Inputs:** none
- **Exit:** `src/game.ts` экспортирует `createGame`, `applyMove`, `status`, `render`, `GameState`; `applyMove` на занятую клетку или индекс вне 0–8 бросает ошибку и не мутирует вход; `npx tsc --noEmit` проходит.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** Юнит-тесты движка: постановка метки и смена хода, отклонение нелегальных ходов, победа по линии, ничья, форма публичного API.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
  - [testing-common](../../ai/directives/testing/common.xml)
- **Spec Refs:**
  - Contract: [Public API Surface](./ttt.spec.md#public-api-surface)
- **Target Files:**
  - test/game.test.ts (new)
- **Inputs:** P1 handoff
- **Exit:** `node --import tsx --test test/game.test.ts` зелёный; каждое canonical case name из Test Scenario Coverage присутствует дословно; `npx gennady testcov --min=90 src/game.ts` проходит.
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->
### P3 — impl
- **Objective:** Тонкий CLI `src/cli.ts`: принимает последовательность индексов ходов из argv, проигрывает партию через движок, печатает финальную доску и исход.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Spec Refs:**
  - Contract: [Public API Surface](./ttt.spec.md#public-api-surface)
  - Constraints: [Requirements TTT-REQ-4](./ttt.spec.md#requirements)
- **Target Files:**
  - src/cli.ts (new)
- **Entities:** main
- **Inputs:** P1 handoff
- **Exit:** `node --import tsx src/cli.ts 4 0 8 2 6` печатает доску и строку исхода; нелегальный ход печатает сообщение об ошибке и завершается ненулевым кодом.
<!--/SECTION:PHASE_P3-->

<!--SECTION:PHASE_P4-->
### P4 — test
- **Objective:** e2e-тест CLI: запуск процесса на последовательности ходов, проверка напечатанной доски и исхода.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
  - [testing-common](../../ai/directives/testing/common.xml)
- **Spec Refs:**
  - Constraints: [Requirements TTT-REQ-4](./ttt.spec.md#requirements)
- **Target Files:**
  - test/cli.test.ts (new)
- **Inputs:** P3 handoff
- **Exit:** `node --import tsx --test test/cli.test.ts` зелёный; каждое canonical case name из Test Scenario Coverage присутствует дословно.
<!--/SECTION:PHASE_P4-->

<!--SECTION:BDD-->
## Acceptance Criteria (BDD)
Each scenario is tagged with the requirement it proves and its verification level — the
use-case → `[TTT-REQ-N]` → vision chain the operator reviews at scaffold.

**Feature:** Game engine

**Scenario:** a move on an empty cell places the mark and passes the turn [`unit`] `[TTT-REQ-1]`
- **Given** a fresh game with X to move
- **When** X applies a move to an empty cell
- **Then** that cell holds `X`
- **And** it is now O's turn

**Scenario:** a move on an occupied cell is rejected [`unit`] `[TTT-REQ-2]`
- **Given** a game where cell 4 is already taken
- **When** a move is applied to cell 4
- **Then** an error is thrown
- **And** the original state is unchanged

**Scenario:** a move out of range is rejected [`unit`] `[TTT-REQ-2]`
- **Given** a fresh game
- **When** a move is applied to cell 9
- **Then** an error is thrown

**Scenario:** a completed line reports the winner [`unit`] `[TTT-REQ-3]`
- **Given** a board with `X` filling the top row
- **When** status is read
- **Then** it reports a win for `X`

**Scenario:** a full board with no line reports a draw [`unit`] `[TTT-REQ-3]`
- **Given** a full board with no three-in-a-row
- **When** status is read
- **Then** it reports a draw

**Scenario:** the public API has the declared shape [`contract`] `[TTT-REQ-1]`
- **Given** the `game` module
- **When** its exports are inspected
- **Then** `createGame`, `applyMove`, `status`, `render` are functions and `status` returns a `kind` field

**Feature:** CLI

**Scenario:** the CLI plays a sequence of moves and prints the outcome [`e2e`] `[TTT-REQ-4]`
- **Given** the CLI invoked with a winning sequence of move indices
- **When** the process runs to completion
- **Then** it prints the final board
- **And** a line naming the winner
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## Verification
Гейт фазы — `npx gennady sdd-verify --profile full` — выполняется на STEP_5; в таблицу не дублируется.

| Command | Required by |
|---------|-------------|
| `npx gennady testcov --min=90 src/game.ts` | node-test, testing-common |

- **Task-specific Completion additions:** none beyond project baseline.
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## Test Scenario Coverage   <!-- BLOCKER: an unmapped scenario blocks task close -->
- Scenario a move on an empty cell places the mark and passes the turn → `test/game.test.ts` :: `move on empty cell places mark and passes turn`
- Scenario a move on an occupied cell is rejected → `test/game.test.ts` :: `move on occupied cell is rejected`
- Scenario a move out of range is rejected → `test/game.test.ts` :: `move out of range is rejected`
- Scenario a completed line reports the winner → `test/game.test.ts` :: `completed line reports the winner`
- Scenario a full board with no line reports a draw → `test/game.test.ts` :: `full board with no line reports a draw`
- Scenario the public API has the declared shape → `test/game.test.ts` :: `public API has the declared shape`
- Scenario the CLI plays a sequence of moves and prints the outcome → `test/cli.test.ts` :: `CLI plays a sequence and prints the outcome`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## Execution Log
*(Round = one execute-then-audit attempt; per-phase blocks within a Round. Skeleton is minimal — event lines appear only when the event happens. A `[x]` line still carrying an unreplaced angle-bracket token is a fabricated DONE — forbidden.)*

### Round 1 — 2026-08-26, initial
<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:DECISION_LOG-->
## Decision Log
<!-- local decisions taken during execution, ADR-compact. Omit if none beyond the spec. -->
<!--/SECTION:DECISION_LOG-->

<!-- AUDIT_ROUNDS appended only after the first reopen-triggering audit (per the audit directive). -->
