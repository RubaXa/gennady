# SC2 CLI coverage measurements

Read-only coverage queries run against an isolated checkout of the real Octavius revision.
The original checkout is not edited. No dependencies are installed/copied and no model is called.
After the synchronous CLI processes finish, the owned checkout is removed in `finally`.

`CLI-PERFORMANCE.json` records the initial three variants before the reader extraction refactor;
`CLI-PERFORMANCE-2.json` records the intermediate overlay plus synthetic scaling;
`CLI-PERFORMANCE-3.json` records the final overlay after denying invalid `--coverage=true` at both
entrypoints. The final measurement binds the current source/bundle; prior reports stay intact. Each records
six processes per variant: the first process separately, followed
by five warm processes. This is not an OS cold-cache experiment. `/usr/bin/time -l` supplies CPU
and peak RSS; elapsed includes process startup. Explicit adapter metadata/source reads and Git
batch bytes are separate counters, not host-wide syscall accounting. Source hashes bind the
measured overlay; the source commit alone does not claim a clean implementation revision.

Variants: no SDD metadata; portal only; 3007 real source-path declarations with one selected
phase target. Synthetic metadata exercises the real repository layout, not the historical
user's exact task. No source content or full private repository path inventory is archived here.

This measures tool performance and bounded I/O, not model autonomy or token savings. The finite
eight-attempt model series remains SC4, after SC2/SC3 independent review.

## Final CLI observations

| Variant                                       | Median of five warm processes | First-process peak RSS | Metadata files read | Worktree source files read |
| --------------------------------------------- | ----------------------------- | ---------------------- | ------------------- | -------------------------- |
| No SDD                                        | 108.59 ms                     | 70.45 MiB              | 0                   | 0                          |
| Portal only                                   | 97.95 ms                      | 72.58 MiB              | 1                   | 0                          |
| 3007 real declarations, one phase             | 167.15 ms                     | 79.31 MiB              | 3                   | 1                          |
| 1000 synthetic declarations, one real target  | 155.61 ms                     | 76.02 MiB              | 3                   | 1                          |
| 10000 synthetic declarations, one real target | 140.39 ms                     | 94.81 MiB              | 3                   | 1                          |
| 50000 synthetic declarations, one real target | 217.81 ms                     | 150.05 MiB             | 3                   | 1                          |

The real phase consumes 7776 worktree source bytes and 7828 Git batch response bytes separately.
All metadata files are consumed once per invocation. Preparation is explicitly pending because
the selected source has no header; no ownership or execution PASS is fabricated. The original
Octavius tree and dependencies are unchanged and all three temporary clones were removed.

The initial warm medians were 88.12/87.19/111.60 ms for the three real-layout variants. Intermediate medians were116.10/91.53/125.29ms.
These measurements show host/process-startup variation, including non-monotonic synthetic timings; they do not establish an acceleration or a
regression relative to a previous product command. There are no random timing thresholds in unit tests.
