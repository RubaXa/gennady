# FORMAT2 — fresh 24-attempt repetition

Authorized by the operator after calibrated-v3 fixed the observed pending-approval false-negative.
This is a NEW campaign, not a continuation, replacement or resampling of FORMAT1.

- Common code source: c676bb090e6f4f93a199c9a46f9726be9260c865, reviewed and fully gated in PR128.
- Baseline equals that exact source. Three candidates add only the original two STEP_2_FILL
  source/generated prompt files; all treatment bytes and 22 facts are unchanged from FORMAT1.
- Cases module-flat/module-nested; baseline/prose/pseudocode/action-observation; three repetitions
  per cell = 24 attempts. New campaign IDs and new fixed seed format2-oct23-v1; concurrency=1.
  Seeded per-case base permutation followed by cyclic repetition rotations gives each arm three
  distinct ordinal positions per case. This is partial position counterbalancing, not a fully
  balanced four-repetition Latin square or carryover-balanced design; cache effects remain possible.
- Same Node22, dependencies, build, harness, tasks, model, budgets and grader across all arms.
  Flash only through the configured AI Proxy. No fallback. Worker/judge/reflection accounted separately.
- Existing success criteria remain: per-case quality/facts/links/pending/reference preservation,
  no growth of tool/message medians; at least10% lower median worker non-cache tokens in BOTH cases.
  Static envelope and standard comparator remain unchanged. Time improvement requires lower time.
  Three repetitions are a pilot, not statistical equivalence or cross-spec-type transfer.
- Keep primary artifact, semantic, path, failure and unknown outcomes separate. Known violations
  prevent adoption; unknown is never PASS. Retain the prior exactly-one-Write campaign criterion
  as an additional derived adoption observation, NOT a universal ban on repair rewrites.
- Complete all24 regardless of isolated quality failure, judge inconclusive/deadline or ordinary
  worker failure with complete bound evidence. No retries to green, no replacing old attempts,
  no editing the oracle/prompts/config after the first model call.
- Stop dispatch only for actual model misroute, unavailable/mismatched runtime/source identity,
  systemic proxy/capture failure or unsafe/failed cleanup. Report the actual blocker immediately.
  A bounded host-recorded judge deadline with absent usage is inconclusive/unknown cost, not a
  proven wrong-model event; an observed non-Flash judge model always stops dispatch.
- Save raw evidence before deleting each attempt's owned sessions and fixtures. Delete only
  inactive owned dependency stores. After the campaign, stop the private server and remove its
  credentials/state/caches and experiment worktrees, preserving bounded results and branch commits.

Before first call: freeze all source SHAs, treatment/fact inventory, config/script hashes, runtime
projection, task/oracle/harness/environment identities, seeded order, and this contract's hash.
Independent review precedes dispatch. No publication or merge is authorized by this contract.

Final decision per hypothesis: better / worse / mixed / insufficient data, then keep / reject /
keep original. Show per-case medians, all denominators and individual outcomes. Do not stop at
another plan-only report; finish the24 or name an actual operational blocker.
