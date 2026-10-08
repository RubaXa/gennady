# UV-26 exact cloud-ios evidence

UV-26 defines one fail-closed evidence boundary for the real cloud-ios Xcode/Tuist run. The
canonical output is ai/flow-eval/.baseline/e18-exact-evidence.json; it is created only after the
independent checker derives PASS. This repository does not contain a PASS yet.

## Preconditions

- macOS 15 or newer, Xcode 16.2 or newer selected from `/Applications`, and direct Tuist 4.202.0;
- clean Gennady and cloud-ios checkouts, with the cloud-ios HEAD already pushed;
- immutable reviewed cloud-ios base `d9de0f7c16824aff043be8332818154d9ed00960` (arbitrary ancestor bases are rejected);
- a committed `gennady.e18-project.v1` JSON file in cloud-ios declaring workspace, scheme,
  destination and a non-zero coverage threshold;
- a current PASS SDD attempt, DONE group, current audit/review receipts and the produced artifact;
- one current `.xcresult` created by the recorded xcodebuild coverage step;
- read-only GitHub/GitLab credentials sufficient to observe the exact-SHA pipeline.

The collector never runs `mise trust`, installs tools, guesses Xcode identity, pushes, dispatches,
retries or cancels CI. Host preflight runs before project/config reads, provider calls or evidence
writes. Current macOS 14.8.5 therefore terminates with `E18_ENV_MACOS_UNSUPPORTED`; missing Tuist is
reported only after the macOS/Xcode prerequisites pass.

## Project-owned input

The run-config (`gennady.e18-run.v1`) identifies the exact task/phase/spec/group/artifact, reviewed
project-config path and remote observation bounds. The reviewed project config
(`gennady.e18-project.v1`) owns workspace/scheme/destination, recorded coverage step, `.xcresult`,
Swift source roots and `coverageThresholdBasisPoints`; evidence cannot lower or replace these
values.

The config also requires `coverageTimeoutMs` (1,000–86,400,000 ms). This is the reviewed effective
process timeout: Verify runs the minimum of command and step timeouts. Exact E-18 requires canonical
`xcodebuild -workspace … -scheme … -destination … -enableCodeCoverage YES -resultBundlePath … test`,
cwd equal to the repository root and no environment overrides. The inherited host environment is
outside this command-override identity and is governed by host preflight.

The runner computes `process.commandIdentity` immediately before spawn from those actual argv, cwd,
environment overrides and effective timeout using the shared `gennady.verify-command-identity.v1`
projection. It keeps the random process-attempt UUID in `process.identity` separately. The append-only
SDD journal persists the runner digest; it never reconstructs execution identity from authored argv.
Historical v1 attempts without `commandIdentity` remain readable as history, but exact E-18 rejects
them and requires a fresh coverage run. Reporter command digests use the same versioned projection.

Committing the durable journal changes HEAD without changing the verified product. Embedded raw
attempts therefore retain their original `identity.headSha`; the collector requires it to be an
ancestor of the clean current HEAD and revalidates the normalized journal-independent product/config/
rules `worktreeDigest`. Evidence records `execution.attempt.currentWorktreeDigest` and the checker
requires equality with the embedded attempt digest. Remote proof still binds the exact current pushed
`cloudIos.headSha`, not the original local attempt HEAD. Product drift is rejected even on a descendant
HEAD. Audit/review receipts must already be current for the verified tree; changing their spec bytes
after verification requires a fresh attempt under the existing freshness rules.

```sh
npm run release:e18 -- --preflight --cloud-ios-root /path/to/cloud-ios
npm run release:e18 -- --collect --cloud-ios-root /path/to/cloud-ios --run-config /path/to/e18-run.json
npm run release:e18 -- --check --json
```

Collection revalidates the actual ticket journal and group receipts, invokes the production
exact-SHA watcher, hashes the `.xcresult` tree, and executes only read-only
`xcrun xccov view --report --json`. The one JSON embeds bounded/redacted process projections, exact
safe argv, raw attempt/group receipt payloads, the reviewed project config, the production watcher
payload and xccov JSON. Every embedded payload has a recomputed digest; no token, raw unbounded log
or absolute temporary path is retained.

Immediately before atomic persistence, the collector checks both repositories' clean HEAD/tree again,
normalized worktree digest, ticket/spec/config/artifact bytes and xcresult directory identity/content.
Concurrent changes during remote observation or xccov export reject collection without writing PASS.
Contract tests use explicit host/provider ports and an internal reviewed-base seam for self-contained
temporary Git fixtures; CLI and release-boundary expose no base override. These tests do not certify
the required real macOS/Xcode/Tuist run.

`scripts/e18-exact-evidence.ts --check` reparses those raw payloads, derives command order and
identities, recomputes coverage totals/duplicates/threshold, verifies exact SHA/pinned pipeline/jobs,
and checks the Gennady source tree. The authored top-level `status` is never sufficient. UV-27B runs
this checker independently and binds checker bytes plus evidence bytes into the cutover candidate.

The frozen valid-shape fixture in unit tests is causal schema evidence only; it is not a real E-18
PASS and cannot close UV-26. A real run on the required host must replace the absent canonical JSON,
then UV-25 must be refreshed if product/config/rules bytes changed.
