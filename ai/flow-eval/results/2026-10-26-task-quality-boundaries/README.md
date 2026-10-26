# PR 129 boundary follow-up — four finite Flash attempts

Decision: retain the two wording clarifications, not as a demonstrated speed/quality optimization.
No further live series is planned for this follow-up. Baseline is PR 129 at `a39f7929`, not the
older pre-PR main. Inputs are frozen working-tree policy snapshots (`cleanBefore=false`).

| Case                                     | Baseline                                                                       | Clarified candidate | Non-cache tokens B → C | Tools B → C | SDK wall B → C  |
| ---------------------------------------- | ------------------------------------------------------------------------------ | ------------------- | ---------------------- | ----------- | --------------- |
| Shared manifest and missing prerequisite | Both structural defects found; scheduling correction, no invented runtime test | Same                | 1823 → 1938            | 0 → 0       | 7.429s → 6.160s |
| Project-owned CLI target/helper          | Correct answer 7; no false prohibition                                         | Same                | 2754 → 2627            | 4 → 4       | 8.358s → 7.489s |

The suspected model failures were **not reproduced**. Wording changes remove real textual
ambiguities: test/diagnostic evidence applies where relevant; installed Gennady internals are not
the consumer project's CLI source. They do not expand writes, commands, rules, approvals or Verify.

The CLI trajectory is **not clean** in either arm. Both performed native Read of `.` and `./cli`
before `./cli/main.ts` and `./cli/helper.ts`. The exact-file path checker reports `unrelated-read`
in both raw records. These extra directory reads are retained as a shared observation; no failing
path label was removed or downgraded. Thus answer correctness is 4/4, not full trajectory PASS 4/4.
There were no shell calls or seed changes. This observation does not demonstrate a new candidate
regression, nor does one pair establish non-inferiority or permission safety for every task.

Total: four attempts, 11 observed assistant messages, 9142 non-cache tokens. Cache usage is separate;
the proxy reports zero cost, but the monetary bill is unknown. Short wall-time differences are
descriptive only. No independent model judge was called. A human reads the synthetic answers;
deterministic checks only validate the declared facets, actual native tool path and retained bytes.

Each session and sandbox was deleted after capture; the private server and owned root were removed,
with zero dependency copies. Seven raw JSON files are byte-bound by recorded tests. The previous
18 records remain unchanged; the earlier review policy is preserved as a JSON string snapshot
beside those records, instead of pretending the current clarified policy produced them.

The executed runner snapshot is also retained against its original protocol hash. Subsequent
independent review found that missing `--boundaries` baseline validation occurred after directory
allocation. The validation now runs first; a subprocess test checks nonzero exit and no private/public
directory creation. No model run was needed for that repair, and the four live records do not claim
to have executed it.

Replay the offline tests with `node --import tsx --test ai/flow-eval/__tests__/task-quality-boundary*.test.ts`.
An authorized live replay uses a fresh result directory and an explicit baseline revision:

```bash
node --import tsx ai/flow-eval/scripts/task-quality-live.ts ai/flow-eval/results/task-boundary-repeat --boundaries a39f7929
```
