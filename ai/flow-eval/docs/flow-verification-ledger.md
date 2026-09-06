# Flow-verification ledger — durable record (nothing lost)

Append-only knowledge base for the flow-result-verification redesign. Every finding, rejected approach,
and accepted decision lives here with its evidence, so no knowledge is lost between sessions. Companion to
`flow-verification-redesign.md` (the plan) and `roundtrip-wall3-assessment.md` (the round-trip findings).

## A. CONFIRMED — works / true (file:line-backed)

- **A1. The blind spot is systemic (H1–H4 all confirmed).** The whole stack guards a _fraudulent_ DONE,
  never an _abandoned_ artifact (code built, ticket `[ ] TODO`, no closed round, no audit).
- **A2. impl-phase verification is real and forge-resistant.** `sdd-verify --task --phase` writes an
  atomic, containment-checked, re-validated `SDD_PHASE_RECEIPT` (`phase-run.ts` O_EXCL|O_NOFOLLOW;
  `phase-receipt-validation.ts` re-derives plan+bytes). `sdd-log complete` refuses without it
  (`sdd-log.types.ts:284-286`). This is the model to copy.
- **A3. Adaptive-via-hint is correct FOR GATES.** `sdd-verify` takes the phase as an explicit arg
  (`phase-context.ts:98-129`); it never self-infers the phase. Confirmed operator principle — for gates.
- **A4. The SwiftLint toolchain works headless (one-time).** Swift 6.2 toolchain in ~/Library + rpath
  shim; the SIGBUS was a trailing-slash `//` in TMPDIR. Artur's guard = 80/82 on the frozen bench.
  (See swiftlint-toolchain-setup.md.)
- **A5. The round-trip CYCLE works.** Given a completable pass, flash regenerates a functioning guard +
  its own probe stand (rt4: 71/82, fc2: 70/82 soft).
- **A6. Artur's edge-case knowledge was EMPIRICAL, discovered by the flow (execute+audit agents) against
  the real swiftlint, not written up-front; it reached the spec late and only at altitude.** Confirmed
  from the RCA pack (01/03-\*.md): 6 rounds + 3 audits; checks 6/7/8 not in the initial 5-check spec.

## B. REFUTED / REJECTED — does NOT work, with WHY (so we never retry these)

- **B1. One universal axiom `AX_PHASE_VERIFIED_BEFORE_CLOSE` over ALL phases — REJECTED.** Audit is not a
  phase: group-scoped, post-close, read-only, ephemeral-on-pass by design (`AX_REOPEN_ROUNDS_IN_TICKET`,
  `AX_EPHEMERAL_OUTPUT`, `AX_AUDIT_HOOK`). One axiom mislabels audit.
- **B2. Require an audit receipt at `sdd-log close` — REJECTED (deadlock).** close (STEP_5) precedes audit
  (STEP_6); group audit runs only after the last ticket is DONE. Enforce at the GROUP-COMPLETION boundary.
- **B3. Per-ticket durable audit receipt / persisting findings — REJECTED.** Fights the ephemeral-on-pass
  invariant. Persist only the group ran+verdict FACT; findings stay ephemeral.
- **B4. Receipt in a sidecar file (`audits/…`) — REJECTED.** `AX_REOPEN_ROUNDS_IN_TICKET`/`AX_EPHEMERAL_OUTPUT`
  say sidecars were "overkill"; pollutes the tree.
- **B5. Receipt in a git-note — REJECTED.** Not in the corpus `sdd-check --all` scans; lost across git ops.
- **B6. Enriching the forward spec alone makes flash succeed in ONE pass — REFUTED (rt5/rt7).** A complete
  spec drives flash toward the RIGHT hard implementation (YAML node-position parser) but it can't finish
  it in one pass; the hard implementation needs iteration.
- **B7. "Never scan state" as a universal rule — REFUTED.** Coherence queries (`sdd-check --all`,
  group-completion) MUST scan — but against an EXPLICIT expected set, never self-inferred. The real
  migration lesson is "freeze/explicit reference," not "never scan."
- **B8. Purely text/hint-only completion query — REFUTED.** Abandoned-vs-never-started needs repo/git/
  receipt evidence.
- **B9. Trailing-slash TMPDIR / full .mise.toml in the sandbox — REJECTED (env).** `//` → SwiftLint SIGBUS;
  `.mise.toml` with npm:/http: tools → mise network auto-install offline. Fixed: TMPDIR no trailing slash,
  trimmed .mise.toml.
- **B10. Clearing the execution log at reset AND expecting Artur-depth — REFUTED as a test design.** The
  edge-case knowledge lived only in the log; but the log is runtime output, not the forward spec — the
  honest conclusion is the spec was incomplete, not that the log should be restored.

## C. ACCEPTED — design decisions (current)

- **C1. Keep `AX_VERIFICATION_BEFORE_HANDOFF`** for impl/test/code phases (copy its receipt model).
- **C2. Add `AX_GROUP_AUDIT_LEAVES_A_RECEIPT`** + **`AX_GROUP_REVIEW_LEAVES_A_RECEIPT`** — durable group
  ran+verdict fact, findings ephemeral, git-ref-bound, reopen-invalidated.
- **C3. Receipt via the `atomicTicketWrite` primitive, CLI-written + re-validated by re-derivation**, on
  the owning spec; enforced at the group-completion boundary.
- **C4. Tests assert receipts read FROM DISK in the mechanical gate**; telemetry trace = soft corroboration.
- **C5. Build order = RED-FIRST** (prove the defect leaks today), then contract → tool → flow → green →
  regression (grandfather existing DONE) → Artur simplified eval last.

## D. METRICS — deterministic, per-session (the improvement proof)

Every execute session emits a deterministic metrics record (see `session-metrics.py`), so any change is
proven to IMPROVE or at least NOT REGRESS. Tracked per run: `tool_calls_total`, `by_tool`, `steps`,
`reasoning_tokens`, `output_tokens`, `writes`, `guard_written`, `guard_lines`, `ticket_status`,
`round_closed`, `impl_receipt`, `audit_receipt`, `review_receipt`, `bench_soft`, `stuck`. Non-regression
rule: after a flow change, for the same scenario+model, `steps` and `tool_calls_total` must be ≤ baseline
(or within a stated tolerance) AND completion signals (`ticket_status=DONE`, receipts present) must not
regress. Baselines recorded in `.results/metrics-ledger.jsonl`.

## E. LANDED (this session) + follow-on

- **E1. Group-audit/review receipt mechanism LANDED & green.** `shared/sdd/group-receipt.ts`,
  `sdd-log <group> audit-receipt|review-receipt <verdict>` (CLI-written on the owning spec, refuses unless
  all members DONE, SHA-256 member-state signature ⇒ reopen-invalidation), check codes
  `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` (WARN, grandfathered on `PHASE_RECEIPTS:v1`),
  axioms `AX_GROUP_AUDIT_LEAVES_A_RECEIPT`/`AX_GROUP_REVIEW_LEAVES_A_RECEIPT`, and STEP_6 now carries real
  `<ToolCall>`s for both receipts (no longer prose). `npm run check` = ALL PASS (5/5); unit tests cover
  writer-refusal/valid-mint, forge+stale rejection, warn-missing/clean-valid/reopen-invalid, grandfather.
  Commits `4bb00f4b` (feature) + `94164668` (durable snapshot of these docs + scripts).
- **E2. RED-FIRST gate proven & wired.** `session-metrics.py gate` exits 1 on the abandoned-artifact state
  (guard built, ticket TODO, round not closed, receipts absent) — deterministic, no LLM. Wired into
  `roundtrip-eval.sh` execute summary (fixes H4). Baseline `fc2-baseline` recorded in metrics-ledger.jsonl.
- **E3. FOLLOW-ON — migration must emit `PHASE_RECEIPTS:v1` (and full v2 ticket schema).** The migrated
  infra-base tickets carry no `PHASE_RECEIPTS:v1` marker, so the new group enforcement is grandfathered
  OFF for them (same family as the earlier 2-col verification-table + `SCOPE-TYPE`-vs-`SCOPE_TYPE` gaps).
  For the enforcement to apply to a round-tripped ticket, migration must upgrade tickets to the full v2
  schema (marker included). This is the migrator-completeness work, tracked separately.
