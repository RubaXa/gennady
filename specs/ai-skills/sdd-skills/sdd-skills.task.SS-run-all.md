# Task: SS-run-all — sdd verify: RUN-ALL + SUPPRESS-ON-SUCCESS

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** SS-run-all
- **Status:** [ ] TODO
- **Purpose:** Переделать `sdd verify` с fail-fast на run-all с подавлением успешного вывода
- **Scope:** ai-skills
- **Module:** sdd-skills
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Scope: [`ai-skills` §5 SddScripts](../ai-skills.spec.md)
  - Module: [`sdd-skills` §5 SddScripts contract](./sdd-skills.spec.md)
- **Directive References:** [`phase-execution-protocol.xml` §AX_PERMITTED_BASH_COMMANDS, §STEP_5_VERIFY](../../../ai/directives/sdd-v2/phase-execution-protocol.directive.xml)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Переписать `verify.sh`: заменить fail-fast (`|| exit 1`) на run-all с накоплением ошибок; подавить успешный вывод; обновить help в `sdd` диспатчере.
- **Rules:**
  - [sdd-skills scope spec](./sdd-skills.spec.md)
  - [phase-execution-protocol.xml](../../../ai/directives/sdd-v2/phase-execution-protocol.directive.xml)
- **Target Files:**
  - `ai/skills/sdd-execute/scripts/verify.sh`
  - `ai/skills/sdd-execute/scripts/sdd`
- **Inputs:** none
- **Exit:** exit 0 при всех зелёных → одна строка `[verify] ALL_GATES_PASS (N/N)`; exit 1 при хотя бы одном красном → только вывод упавших гейтов (command + exit code + captured stdout+stderr); stderr инструментов захватывается через `2>&1`

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Запустить `sdd verify` на проекте, убедиться что все гейты проходят и вывод чистый.
- **Rules:**
  - [sdd-skills scope spec](./sdd-skills.spec.md)
- **Target Files:**
  - (нет — только верификация)
- **Inputs:** P1 Handoff (verify.sh, sdd help)
- **Exit:** `sdd verify <files>` → `[verify] ALL_GATES_PASS (N/N)` exit 0

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see [sdd-skills §5 SddScripts contract](./sdd-skills.spec.md)

**Feature:** `sdd verify` с RUN-ALL и SUPPRESS-ON-SUCCESS

**Scenario:** Все гейты зелёные [`integration`]

- **Given** проект со всеми проходящими проверками
- **When** `sdd verify <target-files>`
- **Then** exit 0
- **And** stdout содержит только `[verify] ALL_GATES_PASS (N/N)` (ничего лишнего)

**Scenario:** Один или несколько гейтов красные [`integration`]

- **Given** проект с ошибкой typecheck и ошибкой lint
- **When** `sdd verify <target-files>`
- **Then** exit 1
- **And** stdout содержит для каждого упавшего гейта: `[verify] ❌ FAIL gate: <label>\n  command: <cmd>\n  exit: <N>\n\n--- captured output ---\n<tool stdout+stderr>\n--- end ---`
- **And** успешные гейты (test, format) не показаны

**Scenario:** Все гейты выполняются независимо от предыдущих ошибок [`integration`]

- **Given** проект с ошибкой typecheck (самый первый гейт)
- **When** `sdd verify <target-files>`
- **Then** выполняются ВСЕ гейты (typecheck, gennady lint, lint, test, format)
- **And** exit 1 (из-за typecheck)

**Scenario:** Пустой список файлов [`contract`]

- **Given** вызов `sdd verify` без аргументов
- **When** скрипт запущен
- **Then** exit 4
- **And** stdout содержит `BAD_INVOCATION`

**Scenario:** Несуществующий файл [`contract`]

- **Given** вызов `sdd verify nonexistent.ts`
- **When** скрипт запущен
- **Then** exit 4
- **And** stdout содержит `FILE_NOT_FOUND: nonexistent.ts`

**Scenario:** Отсутствует npm или node [`contract`]

- **Given** среда без `npm` или `node` в PATH
- **When** `sdd verify <target-files>`
- **Then** exit 5
- **And** stdout содержит `ENV_MISSING`

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                                         | Required by | Role  |
| ----------------------------------------------- | ----------- | ----- |
| sdd verify cli/gennady.ts                       | P2          | extra |
| bash -n ai/skills/sdd-execute/scripts/verify.sh | P1          | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- все гейты зелёные → `sdd-verify.cmd.test.ts` :: `all pass → brief ✅ ALL PASS with a line per gate`
- красный гейт показывает output → `sdd-verify.cmd.test.ts` :: `a failure → exit 1; only the failed gate dumps output, and names the command it ran`
- blocking failure останавливает ladder → `sdd-verify.cmd.test.ts` :: `a halted ladder names the stopping gate and the reason in the final line`
- пустой и повторный scalar отклоняются → `sdd-verify.cmd.test.ts` :: `missing, empty, and repeated scalar values are hard errors, never implicit full`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-05-31, initial

#### P1

- [ ] `<ts>` Task initialized.
- [ ] `<ts>` Implementation file: `ai/skills/sdd-execute/scripts/verify.sh`.
- [ ] `<ts>` Implementation file: `ai/skills/sdd-execute/scripts/sdd`.
- [ ] `<ts>` Verification: `<command>` → `<pass|fail>` [`exit=<code>`].
- [ ] `<ts>` Self-audit: walked loaded rule axioms against generated code. Violations: `<list or "none">`.
- [ ] `<ts>` Introduced (if any): `<Entity>` because `<reason>`.
- [ ] `<ts>` Tracker synced: `tasks/ai-skills/sdd-skills/README.md` + `tasks/README.md`.
- [x] DONE.

#### P2

- [ ] migration reopened: prior test evidence is incomplete

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### P2

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->

## Critic Rounds

### Critic Round 1 — 2026-05-31

- Verdict: NEEDS_WORK
- Accepted: 4
  - Missing edge case scenarios → added 3 scenarios
  - Stderr behavior unspecified → clarified `2>&1` capture
  - Failed gate output format incomplete → specified format in BDD
  - P1 Exit wording ambiguous → rewritten
- Rejected: 2 (phase splitting, axiom refs)
- Changes: P1 Exit clarified, 3 edge case BDD scenarios, stderr note, output format, Test Coverage

### Critic Round 2 — 2026-05-31

- Verdict: NEEDS_WORK
- Accepted: 0
- Rejected: 4 (error-path verification gap, exit codes spec gap, implicit gate list, P2 file arg)
- Changes: none

---

**Handoff →** artifacts: [ai/skills/sdd-execute/scripts/verify.sh, ai/skills/sdd-execute/scripts/sdd, ai/skills/sdd-execute/scripts/classify-scripts.js]; decisions: [verify=RUN-ALL+SUPPRESS-ON-SUCCESS]; open: []
