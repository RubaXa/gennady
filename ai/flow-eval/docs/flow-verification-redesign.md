# Flow-result verification redesign — plan (for independent critique)

## 1. Problem (confirmed by 4 hypotheses, file:line-backed)

The whole SDD stack guards against a **fraudulent DONE** (claiming done when not) but nothing catches an
**abandoned artifact** (code built, ticket left `[ ] TODO`, no closed round, no audit). One blind spot on
every layer:

- **Tool (H2):** every `SDD_DONE_*` finding in `shared/sdd/check.ts` is gated on `isDone` (Status has `[x]`)
  — catches a lying DONE, never a missing one. No `SDD_AUDIT_MISSING` / `SDD_PHASE_NOT_CLOSED` /
  `SDD_EXECUTION_LOG_INCOMPLETE` code exists. A TODO ticket with a built artifact: `sdd-check`=0,
  `sdd-task`=ordinary pickable, `--audit-group`="not yet" (0).
- **Flow (H3):** `STEP_6_AUDIT_REVIEW` is prose (0 ToolCalls); ticket is DONE already in STEP_5
  (`AX_AUDIT_HOOK`: "`[x] DONE` is mechanical close, not verification"). A passing audit **persists nothing**
  (read-only, ephemeral) — "audit ran" is not machine-checkable.
- **Tests (H1):** flow-eval execute = LLM-judge verdict + advisory non-gating `sdd-check --all`. Judge
  rubric never checks DONE/audit. The one catch was stochastic (worker narrated "stays TODO").
- **My round-trip (H4):** `roundtrip-eval.sh` gates on `[ -f guard ]`; grade is behavioural only.

## 2. Design principle (the operator's thesis — validated)

**After every SDD phase, a mandatory tool call mechanically verifies that phase was done correctly, and
that verification is an ENFORCING gate that persists a durable receipt.**

Two hard sub-rules, both grounded in our own history (not invented):

1. **Adaptive via the caller's hint, never self-computing.** The tool does NOT infer which phase it is in
   or reconstruct repo state on its own — the STEP that calls it declares what to check (a `--phase`, a
   phase-kind flag, or a phase-specific subcommand). This already works for impl:
   `AX_VERIFICATION_BEFORE_HANDOFF` + `sdd-verify --task <t> --phase P1` → CLI writes the receipt; no
   receipt ⇒ phase stays `[~] IN_PROGRESS`. We keep that shape and extend it to the phases that lack it.
   _Why not universal/self-inferring:_ every time a tool tried to compute the phase/state itself it became
   fragile — we hit this in THIS session (the migration grade had to be frozen to a structural baseline-diff
   because a self-computing grade mis-scored). Fragility is the documented cost of self-inference.
2. **A passing verification must persist a durable receipt.** Today a passing audit writes nothing, so
   nothing downstream can assert it ran. Every phase gate (including audit/close) must leave a machine-
   readable receipt so the next step AND the test harness can assert it.

## 3. Axiom vs step

- **New/extended AXIOM — `AX_PHASE_VERIFIED_BEFORE_CLOSE` (generalises `AX_VERIFICATION_BEFORE_HANDOFF`):**
  no phase — impl, test, audit, code-review, close, and the authoring/scaffold/migration phases — advances
  or closes without its CLI-owned verification receipt for that exact phase. A passing gate persists a
  receipt; a missing/failed gate blocks with a typed code.
- **STEP obligation:** each phase's step carries the concrete `<ToolCall owner="this-step">` that runs the
  phase-appropriate verification with its hint (mirroring STEP_3_VERIFY's existing binding). STEP_6 audit
  gains a real ToolCall + gate instead of prose.

## 4. Ordered fix plan

1. **Contract first (design):** write `AX_PHASE_VERIFIED_BEFORE_CLOSE` + the per-phase receipt schema
   (phase-id, verdict, evidence pointer, timestamp). Decide the receipt's home (execution log line vs a
   sidecar the CLI owns) — must be append-only and CLI-written, never agent-written.
2. **Tool layer (adaptive, hint-driven):** extend the verification CLI so each phase kind has its call:
   - impl/test: existing `sdd-verify --phase` (keep).
   - **audit:** a gate call the audit step makes on finishing (e.g. `sdd-verify --audit-group <id>` /
     `sdd-log audit-receipt`) that writes an audit receipt — so "audit ran (clean or reopened)" is durable.
   - **close:** `sdd-check`/`sdd-log close` must refuse when a required phase or the audit receipt is
     absent (new codes `SDD_PHASE_NOT_CLOSED`, `SDD_AUDIT_MISSING`).
   - a single **completion query** `sdd-task --verify-complete <ticket>` (or `sdd-check --task --complete`)
     that exits non-zero iff (Status≠DONE) OR (open round) OR (missing required receipt). Hint-driven: the
     caller says "check completion", the tool does not guess.
3. **Flow layer:** bind those calls into the steps as enforcing `<ToolCall>`s; STEP_6 audit becomes gated;
   STEP_7 close refuses without the audit receipt.
4. **Test layer (verify by tool-calls/receipts):** the flow-eval execute grade asserts the durable receipts
   per phase (impl receipt, audit receipt, closed round, Status=DONE) — success is _the phases were
   verified_, not _the artifact exists / judge liked it_. Extend `quality-gate.ts` (mechanical R-rule) +
   fix `roundtrip-eval.sh` to assert DONE+receipts, not `[ -f ]`. Optionally assert on the actual tool-call
   trace from the session (telemetry already extracts it).
5. **Regression safety:** the whole change must keep `harness.test.ts`, migration unit tests (44/44) and
   flow-eval unit tests (84/84) green, and must not fail legitimately-complete tickets. Add fixtures for
   the abandoned-artifact case (must now FAIL) and the properly-closed case (must PASS).
6. **Return to Artur:** rebuild TSK-IB-005 as a SIMPLIFIED eval that exercises the whole verified flow end
   to end (spec → scaffold → execute → audit → close), asserting the per-phase receipts, then re-run the
   round-trip and confirm it now catches a skipped audit.

## 5. Open questions for the critic

- Is generalising `AX_VERIFICATION_BEFORE_HANDOFF` to all phases the right move, or does audit's
  group-granularity + read-only + ephemeral-on-pass design exist for a reason we would break?
- Where should the audit receipt live so it is durable without polluting artifacts (execution log vs
  CLI-owned sidecar vs git-note)?
- Is a per-phase receipt overkill for cheap phases; where is the line?
- Does "verify by tool-calls that happened" belong in the mechanical gate, the judge, or both?
- What existing behaviours/tests would a hard completion gate break, and how do we stage it safely?

---

# REVISED PLAN v2 (post independent critique)

Diagnosis (H1–H4) stands. Two load-bearing errors in the v1 plan were refuted with file:line evidence:

## Corrections

1. **Audit is NOT a phase — one universal axiom is wrong.** Audit is cross-ticket, group-scoped,
   post-close, read-only, and ephemeral-on-pass BY DESIGN: `AX_REOPEN_ROUNDS_IN_TICKET` ("audits that PASS
   without a reopen produce no ticket write — ephemeral; `audits/` sidecars were overkill"),
   `AX_EPHEMERAL_OUTPUT`, `AX_AUDIT_HOOK` (runs only after the group's LAST ticket is DONE). Do not persist
   per-ticket audit receipts or the findings; that fights three deliberate invariants.
2. **"Require audit receipt at `sdd-log close`" is a DEADLOCK.** close happens in STEP_5, audit in STEP_6
   (post-close). Can't close (no audit) ↔ can't audit (not closed). Enforcement point must be the
   **group-completion boundary**, never close.

## Revised design — two invariants, not one

- **KEEP `AX_VERIFICATION_BEFORE_HANDOFF`** for impl/test/code phases. It already binds
  `sdd-verify --task --phase`, writes a CLI-owned, atomic, re-validated `SDD_PHASE_RECEIPT`
  (`phase-run.ts` O_EXCL|O_NOFOLLOW; `phase-receipt-validation.ts` re-derives plan+bytes) — genuinely
  forge-resistant. This is the model to imitate, not replace.
- **ADD `AX_GROUP_AUDIT_LEAVES_A_RECEIPT`** (invariant): a group whose last ticket is DONE is not "audited"
  until the CLI recorded ONE group-completion receipt naming the audited git ref + terminal verdict (PASS
  or reopened-Round-N). Findings stay ephemeral; only the ran+verdict FACT is durable. A reopen (new
  Round on any member) invalidates it until re-audit.
- **ADD `AX_GROUP_REVIEW_LEAVES_A_RECEIPT`** — same shape for `sdd-code-review` (STEP_6 second half). The
  v1 plan missed code-review entirely; a skipped behavioural review is arguably worse than a skipped audit.

## Receipt home & forgery

- Reuse the **persistence PRIMITIVE** `atomicTicketWrite` (CLI-owned, atomic, corpus-visible) — NOT the
  per-phase receipt parser (welded to phase plans). Write the group receipt on the **owning spec** (audit
  is spec-scoped). New transition e.g. `sdd-log <group> audit-receipt <verdict>`.
- **Must be CLI-written AND validated by re-derivation** (re-resolve group membership via
  `resolveAuditGroup`, confirm all-DONE, bind to the audited git ref). Without this a weak model
  (`deepseek-v4-flash`) forges a plausible receipt block and the gate is cosmetic.

## The operator's "adaptive-via-hint" rule — refined line

- Correct FOR GATES ("did THIS step do its job?" → must be told the phase, like `sdd-verify --phase`).
- NOT universal: coherence QUERIES ("is the whole world coherent?" → `sdd-check --all`, group-completion)
  MUST scan state — but against an **EXPLICIT expected set** (the group's ticket list from
  `resolveAuditGroup`), never a self-inferred one. This is the real migration lesson ("freeze/explicit
  reference," not "never scan").
- Consequence the v1 plan hand-waved: detecting an ABANDONED artifact (built-then-TODO vs never-started)
  requires reading repo/git/receipt evidence — a scan. Define exactly what evidence the completion query
  may read; it cannot be text-only.

## Test principle — receipts primary, trace secondary

- Assert the durable CLI-written+re-validated receipts read FROM DISK post-run, in the **mechanical gate**
  (`quality-gate.ts` R-rule), not the LLM judge. In the single-session eval, subagent tool calls may not
  surface in top-session telemetry (`runner.ts:65-151`), so disk receipt > trace. Use the telemetry trace
  only as a soft corroboration.

## Fix ORDER — tests FIRST (red-first), because the defect is silent

0. Write two RED fixtures/assertions and prove they FAIL on today's code:
   (a) abandoned artifact — file on disk, ticket `[ ] TODO`, open round → must be caught;
   (b) group whose last ticket is DONE but audit never ran → must be caught.
   Wire into `quality-gate.ts` + a `roundtrip-eval.sh` grade assertion. Must be red NOW.
1. Contract/axiom design — the SPLIT above (impl axiom kept; two group invariants added); receipt schema +
   git-ref binding + reopen invalidation.
2. Tool layer — a group-completion query scanning the EXPLICIT group set + a CLI-owned re-validated
   `sdd-log audit-receipt` transition. NOT at close.
3. Flow layer — bind the receipt ToolCall into STEP_6, assert in STEP_7; leave STEP_5 close untouched.
4. Turn the fixtures green.
5. Repo-wide regression — grandfather existing DONE tickets (flowVersion/schema-marker dormancy) so
   `sdd-check --all` doesn't go red project-wide; keep 44/44 + 84/84 green; warn-then-error; scope the
   hard error to the round-trip eval first.
6. Rebuild TSK-IB-005 as the simplified end-to-end eval asserting the group audit+review receipts.

## 3 highest-risk assumptions to validate BEFORE building

1. Enforcement point = group-completion boundary, NOT `sdd-log close` (else deadlock).
2. The completion query is allowed to read repo/git/receipt evidence, scanned against an EXPLICIT expected
   set (not self-inferred) — abandoned ≠ never-started needs evidence.
3. The audit receipt is forge-proof (CLI re-derivation) and read from disk, not telemetry — else flash
   fakes it / a subagent call is invisible.
