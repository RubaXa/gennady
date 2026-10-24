# FORMAT1 — stopped sanity screen, no prompt adopted

The planned pilot was 24 Flash attempts: four instruction representations × two module cases × three repetitions. It stopped after **3 completed attempts and 1 interrupted attempt** when investigation found a false-negative artifact-oracle condition. The remaining 20 attempts were not dispatched. This archive does not relabel or rerun any original outcome. It does not prove a winning format, a speedup, or token savings.

## What actually ran

Only `module-flat`, repetition 1, was observed. All actors used the configured AI Proxy route and `llm-proxy/deepseek-v4-flash`; the interrupted attempt has incomplete usage and is not cost-qualified.

| Arm                | Frozen artifact / semantic | Tools | Worker non-cache tokens | Worker messages | Worker seconds | Completed native target writes |
| ------------------ | -------------------------- | ----: | ----------------------: | --------------: | -------------: | -----------------------------: |
| Baseline           | FAIL / inconclusive        |    23 |                  49,336 |              16 |         83.904 |                              2 |
| Prose              | PASS / PASS                |    34 |                  70,203 |              27 |        148.248 |                              2 |
| Pseudocode         | PASS / PASS                |    25 |                  50,483 |              20 |         91.735 |                              2 |
| Action–observation | interrupted / interrupted  |    29 |                 unknown |         unknown |        unknown |                              2 |

These are individual attempts, not comparable arm medians. Every observed attempt made **two completed native target Writes** against this campaign's frozen exactly-one-Write acceptance criterion. That positive observation blocks adoption in this pilot; it does not assert that the product globally bans legitimate correction rewrites. Opaque Bash elsewhere does not erase the observation. The original path assessment stays unchanged, and no new primary grade is fabricated. See `report-v1/contract-observations.json` for linked call IDs.

## Keep consumption roles separate

- Worker usage: **170,022 non-cache tokens across 3 usage-qualified attempts**. The interrupted fourth attempt is unknown; this is not a complete campaign total.
- Judge usage: prose **11,939**, pseudocode **12,565** non-cache tokens. The baseline judge hit its host deadline after **180,018 ms**. Its SDK record says `complete: true` with zero token/cost counters; those bytes are preserved, but consumption/cost are **unknown, not zero**. The interrupted attempt has no qualified judge usage.
- Post-task reflection: **128,346 non-cache tokens across 3 completed interviews**: baseline 38,346; prose 51,365; pseudocode 38,635. Reflection is diagnostic self-report, not an independent cause or grading authority. The interrupted attempt has no reflection; absence is not zero overhead.
- All observed provider monetary counters are insufficient to establish billing. Provider HTTP calls/retries and actual monetary cost remain unknown. Static prompt-envelope bytes are not billed tokens.

## What was learned

The campaign exposed an artifact-oracle false-negative requiring a product/test fix before another qualified run. Baseline failure, judge timeout, repeated native Writes, and the interrupted attempt remain in the archive. There is **no selected prompt and no quality-preserving optimization claim**. Any repaired-oracle follow-up needs its own frozen source identity, fresh control, and new campaign; it must not overwrite this evidence or backfill the missing repetitions.

### Separate versioned oracle recalibration

`recalibration/calibrated-v3-replay.json` records a later, model-free replay of the same saved bytes under calibrated-v2 and calibrated-v3: 34 artifacts × two reference-fixture modes = 68 sequential fixture checks, all cleaned. The historical 30-artifact baseline has no changed checks. In FORMAT1 only the baseline artifact's `pending-approval` check changes from false to true; Russian wording already stated that operator approval had not been issued. This is a corrected artifact-oracle interpretation, not a new live attempt, a changed semantic verdict, or evidence of format improvement. The interrupted artifact may satisfy structural checks without its interrupted attempt becoming completed or successful. Original summary/trajectory/quality bytes remain untouched. This offline calibration used the uncommitted calibrated-v3 working-tree fix: `sourceCommit` records the observed HEAD, while `oracleSHA256` binds the actual edited oracle bytes. It is not a clean-source performance experiment. The recalibration JSON also binds its script identity; the original replayer is archived unchanged as `code/replay-calibrated-v3.mts.txt`, including its historical temporary module path as evidence, not as a claim of a portable executable.

## Evidence layout and portable replay

- `protocol/`: exact original public configuration, preregistration, live-runtime projection hashes, variants, execution order, controller batch state, interpretation notes.
- `records/`: all four original controller records. `controller-output/*.txt`: exact original bounded controller logs with deliberate `.log` → `.txt` export outside the globally ignored `logs/` directory; original-byte mappings are in `original-byte-mappings.json` and the manifest binds them.
- `report-v1/`: the original offline report, four complete replay-input snapshots, raw role counters and separate usage qualification, partial trajectory projections, unchanged standard comparisons, derived contract observations.
- `report-v1/permanent/`: **one** full permanent-results tree: exact original summaries, trajectories, artifacts, judge diagnostics and reflections. The report's redundant summary-only copies are merged here only after exact SHA equality; a second permanent tree is not stored.
- `variants/`: exact source/generated prompt snapshots at each recorded commit, exact `STEP_2_FILL` Action slices, and frozen Git diffs. Branches can be reviewed without keeping their worktrees. Baseline's documentation-only normalization and each comparison's identities remain in the original preregistration.
- `code/*.txt`: exact controller, preparer, offline reporter and model-free lifecycle/check scripts. These are archived source bytes, not active product scripts.
- `cleanup-proof.json`: all four persisted records, deleted-session acknowledgements, absent owned fixture directories, restored journal permissions, and stopped owned-server PID observations. Session deletion is proved by captured API acknowledgements, not a claim that a fresh server queried old sessions after shutdown.
- `replay-proof.json`: existing CLI replay from a separate owned directory, including expected fail-closed exits for partial inputs, byte comparisons and output hashes. The commands are reproduced in `report-v1/README.md`.
- `recalibration/`: separately versioned post-stop oracle replay, never substituted for the frozen primary results.
- `manifest.json`: exhaustive regular-file SHA-256 inventory plus original source-byte mappings and public-export checks. No required manifest entry refers to an untracked/ignored log.

Replay with Node 22 and an installed Gennady checkout. The existing baseline-report and compare CLIs return **2** for partial/incomparable input; the existing call-audit CLI rejects incomplete inputs with **1**. Those fail-closed outcomes are expected, not green quality claims. Historical source/cwd strings stay unchanged as evidence; offline renderers do not need the old fixture paths to exist.

For a positive archive-integrity check with Node alone, run from this directory:

```bash
node --input-type=module < code/check-archive.mjs.txt
```

This verifies the exhaustive manifest, original-byte mappings, stopped matrix, role-usage qualification, observed write violations, recorded cleanup and portable replay proof. A successful archive check is not a successful or complete model experiment.

The archive deliberately excludes private server configuration, provider credentials, caches, databases, npm/Bun state, source `node_modules` and `dist`. Seven owned sessions were acknowledged deleted; all four owned fixture roots were removed, journals restored, and the private server stopped. After shutdown the campaign owner also removed the exact private server/config/cache/data/npm/Bun directories (approximately 202 MiB reclaimed, owner-reported operational cleanup, not model evidence). Final campaign-worktree reclamation is a separate owner action after this durable export is reviewed.

No screenshot is applicable: this is backend/offline evaluation evidence without a UI. The machine-readable trajectories and terminal facts are retained instead.
