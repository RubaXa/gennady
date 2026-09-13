# V14 — Experiments digest: SDD semantic redundancy & the single-source fix

**Provenance & honesty note.** These experiments ran as *ephemeral simulations* inside one v1
session (Claude Code, models: haiku for sim/build agents, a stronger model for the strategist and
synthesis). The **primary subagent transcripts and the scratch artifact trees are session-local and
are being lost** when that session ends — they were never committed to git. This file is the durable
secondary record: method, numbers, verdicts, and a reproduction recipe. Numbers are as measured;
haiku variance means small counts may wobble ±1 on re-run, but the qualitative confirm/refute holds
and was cross-checked by hand-grep where noted.

The one shipped outcome IS durable: iter 3 = commit `8bb384770ceb89c547a58d33ac7e1461da166bf0`
(`feat(sdd): single-source facts by reference, kill doc-to-doc drift`), released as
`gennady@0.9.0-next.4` (release commit `d37d591031d51bad9e80418268e3b4db80c6fbd5`).

---

## 1. Question

Root cause of the "SDD is heavy / editing specs is fragile" complaint (Артур: «исправил в одном
месте, оставил устаревшим в четырёх»). Hypothesis reframed away from line-count toward **semantic
redundancy**: the same atomic fact restated across many artifacts with no single source, kept in sync
by hand → drift.

## 2. Corpus (now lost; described here)

Real SDD artifact trees produced by earlier impartial sim agents running the full Flow on tiny tasks:
- **Tree A (Go)** — `env.Require(name string) (string, error)`: `specs/env/env.spec.md`,
  `tasks/env/env.ENV-001.md`, `env.go`, `env_test.go`.
- **Tree B (Python)** — `chunked(iterable, size)` library: spec + `tasks/chunked-lib/*` + code + tests.
- **DRY tree** — a single-source rewrite of Tree A (built by an agent under the discipline "state each
  fact once; reference elsewhere; literals only in code/test").

## 3. Method

- **Sim agents (impartial):** cheap haiku agents given only a realistic task + "use the SDD flow at
  <repo>, follow the directives as written, work in <scratch>, report honestly how it went." No
  steering, no mention of the fact under test, no expected outcome.
- **Fragility injection (causal test):** deterministically change ONE canonical fact (the error-message
  wording) in the **spec only**, then hand the tree to an independent agent under a *realistic narrow
  instruction* ("finish the task; make code and tests match the spec") — NOT "reconcile the whole
  tree". Then **measure drift mechanically** by grepping the old phrase across the tree.
- **Measurement:** `grep -rc "<old phrase>"` per file. Self-reports were NOT trusted; every count was
  re-grepped.

## 4. Experiments

| # | Hypothesis / lever | Procedure | Result | Verdict |
|---|---|---|---|---|
| **E1** | knowledge is redundant | census of every atomic fact × its locations, restatement vs distinct-projection | Go **33%** redundant, Python **67%**; worst chain = one error string in **7–8 places** (spec Golden DX + requirement template + code + ticket BDD ×2 + tests ×2). Hand-grep on Tree A confirmed the error phrase in 12 occurrences across 4 files. | **CONFIRM** |
| **E2** | agents can't sync copies | inject spec change, prompt "make the whole tree consistent with the edited spec" | agent updated **all 8** restated copies → **0 stale** | **REFUTE** (agents capable when told to reconcile all) |
| **E2b** | drift happens under *ordinary* work | same injection, prompt only "finish the task; code+tests match spec" | agent fixed code+tests, **left 2 stale copies in the ticket BDD** → ticket now contradicts spec AND code | **CONFIRM** (Артур's bug reproduced; cause = ordinary work never triggers tree-wide reconcile) |
| **E3** | cheap grep drift-checker | check "every error-literal quoted in ticket must appear verbatim in spec", run on drifted + consistent + pristine trees | **false-positive on ALL three** trees, including consistent ones — spec holds a template (`env: <NAME> …`), ticket holds an instance (`env: MISSING_VAR …`); strings never match even when semantically consistent | **REFUTE** (naive value-grep unreliable = exactly Артур's "команды поиска неверны") |
| **E4** | which strategy | impartial strategist given only E1–E3, judge S1/S2/S3/S4 in superposition | see §5 | synthesis |
| **E5** | single-source removes drift | DRY tree (ticket references `spec §Error Format`, no literal), same narrow injection+prompt | **0 stale** (spec+code+test consistent, ticket never needed touching) → **drift 2 → 0** | **CONFIRM** (S1 proven) |
| **Verify** | does the *directive* induce the structure | fresh scaffolder follows the updated `AX_SSOT_TRACEABILITY`; measure its ticket | ticket pasted the literal **0 times**; all 7 BDD error-outcomes reference `§Error Format`; concrete input instances in `Given` stayed literal (justified projection) | **CONFIRM** |

## 5. Strategy verdicts (E4, superposition)

- **S1 single-source-by-reference** — PARTIAL, best backbone. Dissolves E2b: a ticket that *references*
  a fact has nothing to drift. Limits: tests must hold the real literal; template↔instance are
  legitimate distinct projections; cost = indirection + dangling-anchor risk.
- **S2 executable-as-truth** — PARTIAL→STRONG for the testable subset. Only strategy with *runtime*
  enforcement (a test fails if code diverges), vs S1's discipline. Push testable literals into a code
  constant the test imports. Cannot reach non-testable facts (rationale/intent).
- **S3 mechanical grep-checker** — FAILS (E3). At most an advisory lint, never a gate.
- **S4 accept redundancy** — FAILS on correctness (E2b: drift is the default outcome).
- **Synthesis:** layered ownership — testable literals → code owns + test enforces (S2+S1);
  templates/contracts → spec owns the canonical, instances stay projections; rationale/intent →
  spec single-sourced by anchor (S1 only). Keep distinct projections. Advisory (not gate) dangling-
  anchor check — **structural** (does the anchor exist), never value-matching.
- **Biggest risk:** indirection trades one failure for another — dangling/renamed anchors are silent
  and no test catches them; and S2's enforcement evaporates the moment a test re-hardcodes the literal
  "for readability".

## 6. Shipped (iter 3)

Generalized `AX_SSOT_TRACEABILITY` in `ai/directives/sdd/scaffold.directive.xml` from contracts-only
to every canonical fact (docs reference by anchor, never restate; executable literal only in
code+test; distinct projections kept). Added a bullet to `AX_TICKET_HAS_BDD_AND_TESTS` (scenario
outcome references the spec fact). Added advisory INFO `dangling-spec-ref` to `audit.directive.xml`
(structural anchor resolution only). Full unit suite 1509 pass; prepublishOnly gate green.

## 7. Reproduction recipe

1. **Produce a corpus:** haiku agent, prompt skeleton — "You are trying the gennady SDD workflow for
   the first time. Task: <tiny task, name the language>. Work only in <scratch dir>, never modify the
   repo. Follow the directives as written; make your own decisions where the flow asks the operator.
   Report honestly how it went." (No steering.)
2. **Injection:** `perl -0pi -e 's/<old error phrase>/<new phrase>/g' <spec.md>` (spec only).
3. **Reconcile blind:** haiku agent, prompt — "You are the developer on <task-id>. The spec's error
   wording was refined. Finish the task: make code and tests match the spec." (Narrow — do NOT say
   "reconcile the whole tree".)
4. **Measure:** `grep -rn "<old phrase>" <tree>` → count stale copies. Redundant tree → >0 (drift);
   single-source tree → 0.
5. **DRY variant:** build the same tree under "state each fact once, reference elsewhere; literals only
   in code+test" and repeat 2–4 → expect 0.
6. **Directive verification:** fresh scaffolder reads the *updated* scaffold directive + an anchored
   spec (`## Error Format {#error-format}` defined once); check the produced ticket greps the literal
   0× and references `§Error Format`.

## 8. Limitations

- haiku variance; single runs per cell (not statistical A/B) — qualitative, directional, hand-verified.
- Primary transcripts + scratch trees are session-local and lost; this is the secondary record.
- Environment confound in an earlier wave: subagents could not run `git`/`npm`/the gennady CLI
  (sandbox), so runtime-tooling issues (#17/#19/#20) were not exercised there — separate from these
  redundancy experiments, which are doc/text-level and unaffected.
