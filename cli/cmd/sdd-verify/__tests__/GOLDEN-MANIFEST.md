<!-- @file: V-01 golden manifest (V-R-01 Б-none, Н-1/Н-8) — the frozen baseline SHA these golden
     files were snapshotted at, kept OUT of the golden files themselves (JSON has no comments; a
     header in a `.golden.txt` would break byte-for-byte stdout comparison). See
     `parity-node.test.ts`'s own header comment and drift message for the same SHA. -->

# Golden manifest — `cli/cmd/sdd-verify/__tests__`

Baseline: `rc-baseline-1` (annotated tag) = commit `227c03a83830124fe2aa22541dd5374beb8a53c6`.
Regenerate ONLY inside a named owning task, via `UPDATE_VERIFY_GOLDEN=1 npm test`.

Per-file owner of intentional drift (V-R-01 §"Восемь изъянов", Н-8 — pinned per file, not only in
the shared header/drift-message):

| Golden file                                              | Produced by                                                                     | Owner                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `parity-node.calls.code.golden.json`                     | call-sequence, profile `code`                                                   | V-04                                                   |
| `parity-node.calls.full.golden.json`                     | call-sequence, profile `full`                                                   | V-04                                                   |
| `parity-node.stdout.code-pass.golden.txt`                | byte-for-byte stdout render                                                     | V-14                                                   |
| `parity-node.stdout.code-typecheck-fail.golden.txt`      | byte-for-byte stdout render                                                     | V-14                                                   |
| `parity-node.stdout.setup-pass.golden.txt`               | byte-for-byte stdout render; contains the `⏭ fix — … пропущено` bootstrap line | V-14 (render), V-12 (the skipped-fix line's semantics) |
| `parity-node.exit-matrix.*.golden.json` (7 files)        | run()-level `{ok, exitCode, code}` status matrix                                | V-04                                                   |
| `parity-node.receipt-shape.golden.json`                  | receipt field/order shape                                                       | V-04                                                   |
| `parity-node.environment-state.code.golden.txt`          | `environmentState` hash, frozen node fixture                                    | V-04a                                                  |
| `parity-node.environment-state.test-owner.golden.txt`    | `environmentState` hash, frozen node fixture                                    | V-04a                                                  |
| `fixtures/receipt-fixture/app.task.V01-PARITY.golden.md` | frozen "old artifact" receipt (V-R-01 Б-5)                                      | V-04                                                   |

None of these files carry the baseline SHA in their own bytes — it lives here and in the drift
assertion message (`parity-node.test.ts`'s `assertGoldenJson`/`assertGoldenText`), which names this
manifest.
