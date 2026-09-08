# SwiftLint behavioural bench — one-time host setup (no full Xcode)

The cloud-ios guard-script bench (`Tools/tests/probes.sh`) runs the real SwiftLint 0.65.1. SwiftLint
needs SourceKit (`sourcekitdInProc.framework`). This host has only Command Line Tools (Swift 6.0.3),
but SwiftLint 0.65.1 is built against **Swift 6.2** — a mismatched SourceKit aborts with `SIGBUS`.

This is the minimal, reversible, **no-full-Xcode, no-sudo** way to give it a matching SourceKit.

## 1. Swift 6.2 toolchain (one-time, ~2.7 GB, user-owned)

Download the official swift.org toolchain and extract its payload into a user dir (no installer, no
admin password):

```bash
curl -fL -o /tmp/swift-6.2.pkg \
  https://download.swift.org/swift-6.2-release/xcode/swift-6.2-RELEASE/swift-6.2-RELEASE-osx.pkg
pkgutil --expand-full /tmp/swift-6.2.pkg /tmp/swift-6.2-expand
mv /tmp/swift-6.2-expand/swift-6.2-RELEASE-osx-package.pkg/Payload \
   "$HOME/Library/Developer/Toolchains/swift-6.2-RELEASE.xctoolchain"
rm -f /tmp/swift-6.2.pkg   # reclaim ~1.6 GB
```

## 2. rpath shim so SwiftLint finds the 6.2 SourceKit

SwiftLint's `LC_RPATH` includes
`/Applications/Xcode_26.5.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2/macosx`.
We create that path as symlinks pointing at the user toolchain — no real Xcode, survives SIP
(`@rpath`, not `DYLD_*`):

```bash
TC="$HOME/Library/Developer/Toolchains/swift-6.2-RELEASE.xctoolchain"
# framework where the toolchain keeps it lives at usr/lib; link it into the swift-6.2/macosx dir
# SwiftLint's rpath scans, keeping the real tree intact so @loader_path deps resolve.
ln -sfn ../../sourcekitdInProc.framework "$TC/usr/lib/swift-6.2/macosx/sourcekitdInProc.framework"
mkdir -p /Applications/Xcode_26.5.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2
ln -sfn "$TC/usr/lib/swift-6.2/macosx" \
   /Applications/Xcode_26.5.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2/macosx
```

(`/Applications` is writable without sudo here; the `Xcode_26.5.app` dir is a synthetic shim — 0 B of
its own, everything under it is a symlink into the user toolchain.)

## 3. The TMPDIR gotcha (the real blocker)

Even with SourceKit resolved, SwiftLint 0.65.1 on this standalone toolchain **overflows a worker-thread
stack inside CoreFoundation path normalisation** (`CFStringCreateByReplacingPercentEscapes` → `SIGBUS`)
whenever a linted file path contains a **double slash `//`**. The guard builds probe paths as
`"${TMPDIR}/swiftlint-exceptions.XXXX/..."`, so a `TMPDIR` **with a trailing slash** (the macOS default
`/var/folders/<...>/T/` has one) yields `//` and crashes 10/10; a `TMPDIR` with no trailing slash is
0/10. Verified exhaustively. Fix is environment-only — **run the bench with `TMPDIR` stripped of any
trailing slash** (`run-bench.sh` does `export TMPDIR=/tmp`). Artur's guard script is never modified.

Full Xcode's Foundation does not hit this recursion; it is specific to the headless standalone-toolchain
setup, and it is identical for any guard script under test, so it never skews a guard-vs-guard comparison.

## Reference result

Artur's guard @048270bae8 scores **80/82** here, stable across runs. The 2 env-limited misses
(`C5-fires-pin-rolled-back-minor`, `C5-fires-pin-missing`) need old-Swift toolchains / a non-discoverable
SwiftLint that this host cannot provide; they behave identically for any guard, so they are neutral for
the round-trip's regenerated-vs-Artur comparison. See `.results/rtbase-reference-bench.summary.txt`.
