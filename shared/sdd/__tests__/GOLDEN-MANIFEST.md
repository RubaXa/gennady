<!-- @file: V-01 golden manifest (V-R-01 Б-none, Н-1/Н-8) — the frozen baseline SHA these golden
     files were snapshotted at, kept OUT of the golden files themselves (JSON has no comments; a
     header in a `.golden.txt` would break byte-for-byte stdout comparison). See
     `preset-node-golden.test.ts`'s own header comment and drift message for the same SHA. -->

# Golden manifest — `shared/sdd/__tests__`

Baseline: `rc-baseline-1` (annotated tag) = commit `227c03a83830124fe2aa22541dd5374beb8a53c6`.
Regenerate ONLY inside a named owning task, via `UPDATE_VERIFY_GOLDEN=1 npm test`.

| Golden file                                     | Produced by                                                | Owner of intentional drift  |
| ----------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| `gates-registry.golden.json`                    | `preset-node-golden.test.ts` — canonical `GATES` order     | V-04 (`resolvePreset` port) |
| `preset-node-golden.setup.golden.json`          | resolved gates, profile `setup`                            | V-04                        |
| `preset-node-golden.code.golden.json`           | resolved gates, profile `code`                             | V-04                        |
| `preset-node-golden.test-owner.golden.json`     | resolved gates, profile `test`, coverage owner             | V-04                        |
| `preset-node-golden.test-non-owner.golden.json` | resolved gates, profile `test`, non-owner                  | V-04                        |
| `preset-node-golden.full.golden.json`           | resolved gates, profile `full`                             | V-04                        |
| `plan-target-repair.*.golden.json` (6 files)    | `planTargetRepair` matrix (adapter × extension × specPath) | V-04                        |

None of these files carry the baseline SHA in their own bytes — it lives here and in the drift
assertion message (`preset-node-golden.test.ts`'s `assertGoldenJson`), which names this manifest.
