# Round-trip wall 3 — independent assessment (readiness / adaptive verify)

## What actually blocks the cloud-ios round-trip

Regenerating Artur's guard via `sdd-execute` stalls a real worker at three walls; the worker (flash) hit
the first and never wrote code. Telemetry of the failed run (`session-telemetry.py` on the OpenCode
session): 32 tool calls (bash×21, read×10, grep×1), **zero writes**, reasoning=70232 / output=3849 tokens
— it explored, never authored, because the flow rejected its inputs.

| #   | Wall                                                          | Evidence                                         | Nature                                              |
| --- | ------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| 1   | Ticket §5 verification tables are 2-column                    | `sdd-task` → `SDD_VERIFICATION_TABLE_INVALID` ×7 | migration incompleteness (grade treated as backlog) |
| 2   | Spec uses `<!--SCOPE-TYPE: x-->` not the `SCOPE_TYPE` section | `sdd-state` → "SCOPE_TYPE is not found"          | migration format gap                                |
| 3   | v2 readiness hardcoded to a node gate profile                 | `EXECUTION_READY=no`, `sdd-task` hard-blocks     | **branch divergence (below)**                       |

## Root cause of wall 3 (from source, branch `sdd-v2-rc52-followup`)

- `shared/sdd/readiness.ts:15` — `REQUIRED_SCRIPTS = ['type-check','test','test:coverage','format',
'format:fix','lint','lint:fix','fix']` is a **literal** list. `gatherReadinessInput` (`:596`) reads only
  `package.json` scripts. No `gennady.yaml` / `stack.use` / `anystack` / `extraGates` anywhere in this
  branch's `.ts` source.
- `executionReady = (level === 'ready')` requires `package.json` + all 8 scripts + `lint→gennady` +
  gennady installed (`readiness.ts:498-510`). A package.json-less Swift repo can never satisfy it.
- Hard block, not advisory: `sdd-task.cmd.ts:123` (`pickable = executionReady ? graph : queue`) and
  `:459-487` (impl/refactor/test/fix phases refuse to run when `!executionReady`). Only bootstrap/config/doc
  phases, or a phase owning a missing gate, are exempt.
- The **adaptive** verify (`StackPlugin`, `plugins/{node,golang,anystack}`, `extraGates`) exists on `main`
  (matured Aug 2026), which **diverged from this branch at 2026-06-29 and was never merged in**. cloud-ios's
  `gennady.yaml` (`stack.use: [anystack]`, swiftlint/xcodebuild extraGates) is written for that `main`
  mechanism — absent here. So on this branch `gennady verify` runs npm scripts, not swiftlint.

So wall 3 is not "migration lost something": the v2-flow branch re-implemented readiness/verify hardcoded
to node while the language-adaptive verify grew in parallel on `main`. The two were never reconciled.

## Options (smallest → largest)

1. **Shim `package.json` (0 source changes).** Fixture gets a `package.json` whose `type-check/test/lint/…`
   scripts shell out to swiftlint/xcodebuild (verify runs `npm run <script>` verbatim —
   `phase-verification-plan.ts:252`). readiness goes green, execute proceeds on Artur's real IB-script
   ticket. Proves the spec→tasks→code≥original cycle NOW. Con: works around the root, not a real fix.
2. **Make this branch's readiness/verify stack-aware.** Derive the gate list from `gennady.yaml`
   `stack.anystack.extraGates` in `readiness.ts` + `phase-verification-plan.ts`. Con: re-invents on this
   branch what `main` already has → divergence squared.
3. **Reconcile `main` → v2 flow.** Port/merge the plugin/anystack adaptive verify into the flow branch.
   Architecturally correct and a merge the product needs regardless; largest effort.

## Recommendation

Path **1** to prove the cycle now on real iOS code with zero source risk, AND record wall 3 as a confirmed
architectural finding ("flow branch lacks `main`'s adaptive verify; readiness is node-hardcoded; reconcile").
Walls 1–2 are fixed by teaching the migrator to emit v2-current tables + `SCOPE_TYPE` section and by making
the migration grade fail on `SDD_VERIFICATION_TABLE_INVALID` (execute-blocking), so the flow stops producing
un-executable artifacts. To be agreed before acting.

---

## Round-trip RESULT (rt4, flash, after walls 1-3 cleared)

The cycle WORKS: with walls 1 (tables), 2 (scope-type, non-blocking), 3 (readiness shim) cleared and the
self-introduced probes.sh contradiction removed, flash regenerated a FUNCTIONING guard (550 lines) AND
rebuilt its own Tools/tests stand — session telemetry showed continuous progress, no stuck.

Soft grade (exit-code + tree-invariant, wording ignored per the no-byte-for-byte policy):

- Artur original : 80/82
- Regenerated : **71/82** soft · 7/82 exact · 73 wording-only gaps

The 9 real behavioural gaps (exit-code divergences) are edge cases: check-6/7 YAML forms (quoted key,
anchor-in-flow-collection, unknown config-shaped key), baseline-emptied, env-base-unresolvable,
match_kind typo, pin-missing. Checked against the KEPT artifacts: these forms are ABSENT from the
forward ticket §1-6 and mostly from the spec — they lived ONLY in the execution log, which the reset
CLEARED (~198 lines, ticket 408→210). So the regen is below Artur because the granular edge-case
knowledge was removed with the log, not because flash is weak: it implemented every check the forward
spec describes. This confirms the thesis — where the model falls short, the restorable artifact is
incomplete, not the model.

Fork: (a) keep the execution log as part of the restorable ticket (faithful to "restore code from
spec+TASKS"; the log is part of the task) — OR (b) promote the edge-case forms from the log into the
forward spec/BDD so the spec alone is complete. Either makes the restorable artifact carry Artur's depth.
