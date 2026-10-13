# Swift stack plugin

## Contract boundary

The active Swift path is the target `StackPlugin.target` / `VerifyPreset` contract below. Historical
gate order and receipt fingerprint details remain documented only for validating already persisted
phase evidence; they are not an executable compatibility pipeline.

Swift remains an **UNVERIFIED prototype**. UV-29 deterministic failure-path fixtures are not
native Xcode/Tuist verification. Real exact E-18/UV-26 is DEFERRED post-main-cutover and is not a
release dependency; selected consumer gates still block on FAIL/ENV_FAIL/BLOCKED. An actual
phase PASS does not upgrade the global support tier.

## Detection

The plugin detects a literal root `Package.swift`, `Project.swift`, or `Workspace.swift`, or a
checked-in repo-relative `*.xcodeproj/project.pbxproj` or
`*.xcworkspace/contents.xcworkspacedata`. Nested files with any of the three root-marker names never
assign the Swift plugin and never unlock SwiftPM defaults.

## Target preset (UV-06)

The registered Swift plugin supplies one immutable DAG:

```text
build → format-fix → format → lint → test
                                  ├→ integration
                                  └→ coverage
```

`code`, `unit`, `integration`, `coverage` and `full` are tag selectors plus dependency closure;
they do not duplicate commands. SwiftPM emits zero-YAML `swift build` and `swift test` only for a
root `Package.swift`. Integration and coverage have no universal Swift identity, so their selected
slices remain visibly `BLOCKED` until an explicit target command is configured.

`format-fix` is a repair node. It may receive only normalized, existing, regular, non-symlink
`.swift` Target Files. Its argv and `writes.include` contain exactly those files; absent targets
block the selected slice instead of widening to `.` or the repository. `format` and `lint` are
read-only post-repair observations. Repair invalidates the earlier build observation so U3 can
perform a selective recheck without a duplicated DAG node.

Prerequisites derive from actual commands in the selected dependency-closed slice, not phase,
step name or detected project kind. Explicitly waived steps remain visible and do not contribute
their readiness requirements. Generic custom argv and remote-only slices require no unrelated
Apple tools or project identity; SwiftPM requires no Xcode/Tuist. Selected Xcode requires >=16.2;
selected Tuist requires >=4.202.0 (an exact-floor prerelease is insufficient). Selected formatter/
linter probes identify their project-pinned installed version; absent/broken prerequisites are
BLOCKED with PATH/install/select hints, never a fabricated gate PASS.

Bounded version probes use the exact selected executable/wrapper, cwd and env (including
DEVELOPER_DIR), protected by WorkspaceGuard before execution. Unexpected writes are restored
dirty-safely; ref drift retains the checkpoint for explicit recovery. Timeout descendants are
terminated before release. A missing Git guard never becomes unprotected readiness. `--plan`
may observe these prerequisites but never executes gates or supplies run evidence.

## Xcode/Tuist project identity

The builtin target path never guesses Xcode build/test identity. A project owns the minimal
identity; explicit custom argv retains the same selected-command prerequisite checks:

```yaml
stack:
  swift:
    xcode:
      workspace: App.xcworkspace # exactly one of workspace/project
      scheme: App
      destination: platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2
      testPlan: App # required only for selected test-bearing Xcode actions
```

The plugin constructs direct `xcodebuild` argv without a shell. Missing identity, a missing selected
tool or a missing workspace/project path is `BLOCKED` with an actionable fix. `testPlan` is applied
only to the builtin test step; actual custom test/test-without-building/build-for-testing actions
also require it, including integration/coverage. Option values such as a scheme named `test` are
not actions. `xcrun --find` is discovery; xccov export does not require build/test identity.
Removed `stack.swift.skipGates/overrideGates/extraGates` fields fail closed;
project commands and waivers belong under `verify.presets.swift`. Identity paths must stay
physically inside the repository and may not traverse or name a symlink.

UV-06 does not execute Xcode, emit `.xcresult`, or claim runtime coverage evidence. Exact
`xcodebuild`/`xccov` shape, simulator/runtime selection, freshness and resource cost remain E-18 /
UV-26 and are explicitly unverified by these unit contracts. UV-26 now supplies the fail-closed
`gennady.e18-exact-evidence.v2` collector/checker contract: it binds reviewed project-owned Xcode
identity and coverage threshold, current SDD process/receipt evidence, production exact-SHA remote
proof, hashed `.xcresult` and embedded/reparsed xccov JSON. The contract fixture is not runtime
proof; the real macOS 15+/Xcode 16.2+/Tuist 4.202.0 cloud-ios run is DEFERRED post-main-cutover,
not a release/main-cutover bar. This future exact collector/checker contract remains strict.

Ordinary compile/test/lint and unknown nonzero failures are FAIL. ENV_FAIL requires a concrete
environment signature (for example an unavailable simulator or SwiftLint dynamic library), not
every nonzero exit. Private raw verdict/stat inputs remain intact; output, readiness, public
JSON/text, errors and SDD journals use the shared safeVerifyText sanitizer, including selected
command-env secret values. Timeout/cancellation/mutation semantics are unchanged.

## Historical receipt-validation facts

Persisted pre-cutover evidence used `format → build → test → lint`. The marker-aware phase receipt
validator retains those historical identities for currentness and V1 grandfathering, but no public
command executes that ladder or accepts its gate overrides.

## Receipt environment (VERIFY-DL-4 / D-SWIFT-ENV)

The frozen receipt fingerprint covers the sorted repo-relative set of Swift/Xcode/Tuist
build-definition manifests and locks plus successful `swift --version` and `xcodebuild -version`
output. Gate commands remain in `planState` and are not duplicated into `environmentState`.

## Generated output (D-SWIFT-MUTATION)

Ignored `.build`, DerivedData and `.xcresult` output is outside the workspace write-zone snapshot.
Non-ignored mutations remain fail-closed. The target model does not broaden this legacy boundary;
runtime mutation attribution belongs to U3.

## Acceptance

- Root SwiftPM with the selected tools and exact Swift Target Files plans `code`/`unit` without YAML.
- Nested `Package.swift` alone is not detected.
- Every phase is a dependency-closed slice of one DAG; missing integration/coverage commands do not
  block `code` or `unit`.
- Swift repair argv and writes contain only exact selected `.swift` files.
- Builtin Xcode build/test are commandless and blocked without project identity; a valid identity
  deterministically constructs argv and retains per-key provenance. Actual selected custom Xcode
  operations enforce their own identity/version checks; generic/remote commands do not inherit
  unrelated identity requirements. Composed custom phases and metadata remain intact.
- Unknown config, ambiguous identity and unsafe repair prefixes fail closed with typed errors.
- Historical `environmentState` receipts remain parseable/currentness-checked without restoring the
  removed gate runner.
