# PR #132 — independent final parser review

Reviewed HEAD: `969200ae63fcdbba413b4ab525ad8c1d53cb5528` (verified). Repository working tree remained unchanged.

Scope: `ai/flow-eval/brownfield-command-proof.ts`, `brownfieldProposalInvocationProven`, SDK-capture wiring in `ai/flow-eval/scripts/brownfield-benchmark-live.ts`, and `ai/flow-eval/__tests__/brownfield-command-proof.test.ts`.

## Finding

**[P2, inherited behavior retained] Bare/bare invocations can falsely prove “proposal after lint.”**

Location: `ai/flow-eval/brownfield-benchmark.ts:332–338`; negative-test gap: `ai/flow-eval/__tests__/brownfield-command-proof.test.ts:250–257`.

The completion-to-start ordering check runs only when at least one command has an echo wrapper. Two ordinary bare commands bypass it and are accepted solely because `lint.i < proposal.i`. OpenCode can execute two tool parts from the same assistant message concurrently; normalization assigns `i` by part order, so those indices do not prove that lint completed first.

Pure Node reproduction (no shell/model/network execution): construct the exact accepted bare lint and proposal events with `i=0/1`, completed status and exit codes `1/0`, but lint timestamps `100..250` and proposal timestamps `150..200`. `brownfieldProposalInvocationProven(events)` returns `true`, even though proposal started before lint finished. Complete trace, valid pending persistence and unchanged inputs can all coexist with this overlap. No other deterministic E3 confirmation gate enforces this ordering.

Impact: `proposalInvocationProven=true` can overstate the causal evidence that the successful proposal followed actual lint. This predates the HEAD change and is not an echo-wrapper regression, but remains a reachable false proof within the reviewed function. The overlap negative test uses only wrapped fixture events, leaving this branch unqualified. Apply the temporal proof consistently to bare/bare calls as well, or represent absent/overlapping timing as unproven; add a bare/bare overlap regression case.

## Other reviewed properties

- No new blocking false PASS was found in the literal echo-wrapper path. Its grammar accepts only one exact `; echo EXIT:$?` or `; echo "EXIT:$?"` suffix; ASCII base tokens reject composition, redirection, substitutions, quoting and Unicode whitespace.
- Echo recovery requires a complete capture, one matching SDK call, matching session/message/call identity, assistant/bash/completed state, exact command and timestamps, shell exit zero, explicit nontruncation, equal output copies, a bounded output and exactly one terminal exit marker.
- Live wiring supplies the full captured messages and requires `messagesComplete`, `bodyComplete` and no capture issue. Missing/inconsistent captured wrapper evidence fails closed.
- Pending/operator constraints were not weakened. E3 acceptance still separately requires canonical pending persistence, actual remaining lint diagnostics, unchanged protected bytes and the existing safety/review/cleanup chain. The invocation predicate additionally rejects observed `deviation-verdict` calls.
- Investigated a clipped bare-command prefix hypothesis with a pure Node reproduction: the helper can recognize that prefix, but the existing evidence projection flags truncation, making `traceComplete=false`; the mandatory confirmation gate rejects it. This was not treated as a reachable final PASS.

## Validation and limits

Read-only static review plus two focused pure Node reproductions (bare overlap and projection-truncation gate). No live/model/network evals, full test suite, coverage, dependency installation or repository edits. No claim that the entire PR or arbitrary shell syntax was reviewed. Existing external SDK/server integrity remains a trust assumption.

Визуального артефакта нет — это backend-модуль без UI.

## Fix-forward recheck — local changes after reviewed HEAD

**The P2 finding above is closed by the reviewed local fix.** The original finding is retained as the historical review result.

`brownfieldProposalInvocationProven` now applies one unconditional temporal gate to bare, wrapped and mixed pairs: all four timestamps must be safe integers, each interval must be forward, and lint completion must be no later than proposal start. The bare/bare bypass is gone. The helper revision is now `bounded-exit-echo-v3`; the immutable recorded reassessment explicitly retains its historical `bounded-exit-echo-v2` revision rather than being relabeled as new evidence.

The added bare regression covers the original overlapping-call counterexample, ordered success, missing/NaN values for every timestamp and an inverted lint interval. Inspected the supplied RED log (original counterexample failed as expected) and GREEN log (19 focused tests passed).

Independent pure Node recheck against the local fix passed 24 negative cases: overlap, fully reversed call order, either interval inverted, and missing/NaN/infinite/fractional/unsafe timestamp values in all four fields. Ordered calls and a valid adjacent completion/start boundary both remain accepted. No remaining blocker or substantive negative-test gap was found for this specific temporal-order finding. No model, network or full-corpus evaluation was run, and no repository files were edited by this reviewer.

Визуального артефакта нет — это backend-модуль без UI.
