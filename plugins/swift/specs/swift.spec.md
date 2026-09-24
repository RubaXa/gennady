# Swift stack plugin

## Contract boundary

UV-06 adds the target `StackPlugin.target` / `VerifyPreset` path described below. The existing
`verify` facet, `resolveSwiftPreset`, legacy gate order, receipt fields and `environmentState` remain
a frozen compatibility path until the U4 cutover. Statements in "Legacy compatibility" are
historical runtime facts, not the target DAG.

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

SwiftPM tool availability and Xcode identity are evaluated only when their steps are in the
selected dependency-closed slice. Explicitly waived steps remain visible and do not contribute
their readiness requirements.

## Xcode/Tuist project identity

The target path never guesses or accepts a copied target argv for Xcode build/test. A project owns
the minimal identity:

```yaml
stack:
  swift:
    xcode:
      workspace: App.xcworkspace # exactly one of workspace/project
      scheme: App
      destination: platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2
      testPlan: App # optional
```

The plugin constructs direct `xcodebuild` argv without a shell. Missing identity, a missing selected
tool or a missing workspace/project path is `BLOCKED` with an actionable fix. `testPlan` is applied
only to the test step. Existing `stack.swift.overrideGates.build/test.argv` remains a
compatibility-only grandfathered input until UV-24; it is surfaced through migration diagnostics.
Combining identity with those legacy argv overrides is ambiguous and fails closed. Identity paths
must stay physically inside the repository and may not traverse or name a symlink.

UV-06 does not execute Xcode, emit `.xcresult`, or claim runtime coverage evidence. Exact
`xcodebuild`/`xccov` shape, simulator/runtime selection, freshness and resource cost remain E-18 /
UV-26 and are explicitly unverified by these unit contracts.

## Legacy compatibility path (frozen until U4)

Legacy order remains `format → build → test → lint`. A root Swift package uses `swift build` and
`swift test`. An Xcode/Tuist repository may still provide exact build/test argv through
`stack.swift.overrideGates`; the compatibility runner never guesses a workspace, scheme,
destination or DerivedData path. The legacy `format` gate retains its read-only check plus fixer
shape and historical required/optional semantics. UV-06 does not switch `sdd-verify` to the target
runner and does not change receipt identity.

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
- Xcode/Tuist build/test are commandless and blocked without project identity; a valid identity
  deterministically constructs argv and retains per-key provenance.
- Unknown config, ambiguous identity and unsafe repair prefixes fail closed with typed errors.
- Frozen legacy gate order, overrides, `environmentState` and receipt source remain unchanged.
