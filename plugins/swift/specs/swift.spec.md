# Swift stack plugin

## Detection

The plugin detects a root `Package.swift` or a checked-in Xcode/Tuist build definition such as
`Project.swift`, `Workspace.swift`, `*.xcodeproj/project.pbxproj`, or
`*.xcworkspace/contents.xcworkspacedata`.

## Gates

Order is `format → build → test → lint`. A root Swift package uses `swift build` and `swift test`.
An Xcode/Tuist repository must provide project-specific build and test argv through
`stack.swift.overrideGates`: the plugin never guesses a workspace, scheme, destination, or
DerivedData path. An argv override makes the corresponding otherwise-skipped gate runnable.

`format` is the blocking repair capability and must carry a read-only check plus a fixer. It uses
`swiftformat` (or `swiftlint` when available) by default and may be overridden by project config.

## Receipt environment (D-SWIFT-ENV)

The receipt fingerprint covers the sorted repo-relative set of Swift/Xcode/Tuist build-definition
manifests and locks plus successful `swift --version` and `xcodebuild -version` output. Gate commands
remain in `planState` and are not duplicated into `environmentState`.

## Generated output (D-SWIFT-MUTATION)

Ignored `.build`, DerivedData, and `.xcresult` output is outside the workspace write-zone snapshot.
Non-ignored mutations remain fail-closed.
