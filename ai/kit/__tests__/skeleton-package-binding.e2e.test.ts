// @file: SkeletonPackageBindingGuard — sequential, cross-module e2e placeholder: a real agent
//   session reading a lazy skeleton's step-list entry and resolving the printed package path
//   through the `sdd-step` CLI, the way an executing worker actually would. Entirely skipped —
//   `sdd-step` is a DEFERRED_DECISION (DA-DL-15, directive-assembly.spec.md), its spec preserved as
//   a project but not implemented; `directive-assembly` does not depend on the `cli` package at
//   this test level (see directive-assembly.spec.md#skeletonpackagebindingguard, Inter-Module
//   Dependencies). Return condition: `sdd-step` ships, or a live run shows an agent losing the
//   package body on a raw Read error.
// @consumers: CI (node:test runner)
// @tasks: DA-lazy-asm

import { describe, it } from 'node:test';

describe('SkeletonPackageBindingGuard — end-to-end via sdd-step', () => {
  it(
    'an agent resolves a skeleton step-list entry through sdd-step and reads the exact package body',
    { skip: 'sdd-step is DEFERRED_DECISION (DA-DL-15) — spec exists at specs/cli/sdd-step/sdd-step.spec.md, not implemented; return condition: sdd-step ships, or live execution runs show agents losing package bodies on raw Read errors' },
    () => {
      // Intentionally empty: mechanism A (READ_AND_USE_DIRECTIVE(path) via the host's Read) has no
      // CLI in the loop today (DA-DL-19) — this placeholder keeps the deferred surface visible
      // rather than silently absent, per BDD_DEFERRED_OWNERSHIP_HONESTY.
    }
  );
});
