# PR #132 — independent final reassessment audit

Audited HEAD: `969200ae63fcdbba413b4ab525ad8c1d53cb5528`.
Preservation reference: `c1761a121b579e544e01f1aaaa485670b7aa4757`.

**Verdict: no blockers found in the assigned reassessment/evidence scope.** This review independently read the saved inputs and original retained private captures; it did not rely on the previous review's conclusions. Repository files were not changed. No LLM, live, network, full-corpus, or coverage run was performed.

## Evidence checked

- The three previous result trees are unchanged against the reference commit, including all 199 tracked files: bf3-live 106, e3-e4-confirmation 45, e3-explicit-command 48. Git trees match and every current file matches its reference bytes. Prior raw flags, judge verdicts, metrics, and executed source snapshots remain intact.
- The new manifest exhaustively binds its ten non-manifest files; Git membership, hashes, absence of symlinks, and mutation/omission negative controls pass. All three frozen evaluator source snapshots also equal the current source bytes and their declared SHA-256 values.
- Both raw records match their declared SHA-256. Input source bindings match the original private archive, primary JSON, compressed SDK messages, and decompressed body hashes. Original archives were read in memory, without publishing or extracting their contents into the repository.
- Independently reconstructed public events and SDK capture projection equal the published JSON exactly. SDK identity hashing preserves the observed equalities; command, timestamp, exit, and candidate output bindings are preserved. Unrelated outputs are explicitly withheld. A privacy pattern scan across every new archive file found no personal host path, original SDK ID, or credential value; inspection found only synthetic fixture diagnostics in the retained outputs, with no private project source/diff or agent prose.

## Results and meaning

| Input                   | Original raw proof / confirmation | Reassessment proof / confirmation | Original judge |
| ----------------------- | --------------------------------- | --------------------------------- | -------------- |
| E3 v2, policy-censored  | false / not-proven                | false / not-proven                | fail           |
| E3 v3, completed-worker | false / not-proven                | true / proven                     | pass           |

The private captures independently produce the same false/true proof results as the public projections. Without SDK capture the wrapper proof remains false. Pending persistence remains a separate required condition; transferred capture identities and incomplete capture fail closed.

The change is a separately versioned measurement correction. It does not rewrite raw results or reinterpret the semantic judge. `confirmationAccepted: true` means evaluator acceptance of the evidence; the underlying proposal remains pending-operator. Full trajectory pass, lint exemption, operator acceptance, model behavior improvement, and an A/B or cost win are not claimed. Zero new primary attempts and zero new model calls are consistent with the saved derivation-only runner and unchanged primary archives. Those counters describe this reassessment, not the earlier campaign's spend.

## Offline validation

The focused command below passed **13/13**, zero failures/skips/cancellations:

```sh
node --import tsx --test ai/flow-eval/__tests__/brownfield-command-proof.test.ts ai/flow-eval/__tests__/brownfield-echo-reassessment-recorded.test.ts ai/flow-eval/__tests__/brownfield-e3-explicit-recorded.test.ts
```

This consists of five command-proof tests, four new recorded reassessment tests, and four prior explicit-command recorded tests. The new recorded file also passed independently, 4/4.

## Limits and test-count discrepancy

Public replay validates the published normalized evidence and bindings; the original private archives remain necessary to independently reproduce the privacy projection. This audit accessed those retained archives and verified the projection itself. The bounded recognizer deliberately does not support arbitrary shell composition. The original v2 diagnostic uses a rejected redirection form as well as the wrong proposal executable; it appropriately remains not-proven.

The saved ordinary pre-commit log records `5435 executed / 5427 passed / 0 failed / 8 skipped` for `node:unit`. A separate reviewer summary reports `5440 / 5432 / 0 / 8`. The package/config route for `npm test` and the unit gate uses the same deterministic topology runner, so configuration inspection alone does not establish a reason for the additional five. No corresponding standalone reporter was available in the supplied evidence. Treat `5440 / 5432` as an unverified independent-run count, not as the recorded pre-commit count. No new full-corpus run was performed to resolve this reporting discrepancy.

Visual artifact: none — this is an offline backend/evidence audit without a UI; no screenshot is applicable.
