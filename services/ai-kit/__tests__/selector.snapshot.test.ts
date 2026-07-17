// @file: Snapshot tests for services/ai-kit/selector.ts — D-124/AI-46 provable directive assembly.
//   Commits the assembled directive text for representative (sessionType, track, mrShape) inputs
//   so composition drift (wrong brick, wrong order, dropped placeholder) shows as a diff instead of
//   silence. Snapshot files live in __tests__/snapshots/ next to this test (project convention, see
//   snapshot-path.setup.ts) and are updated ONLY through the runner's snapshot-update flow under
//   operator confirmation — never hand-edited.
// @consumers: node:test runner
// @tasks: TSK-136

import { describe, it } from 'node:test';
import '#snapshot-path-setup';

import { selectDirective } from '../selector.ts';
import type { MrShape } from '../../agent-inbox/modules/inbox-core/context-builder.ts';

const NO_FLAGS: MrShape = {
  newSymbols: false,
  nestedLoops: false,
  filterMapChain: false,
  isTiny: false,
  securityHits: false,
  depManifest: false,
};

describe('selectDirective snapshot (D-124/AI-46)', () => {
  it('renders track-review base with no active mrShape flags', (t) => {
    t.assert.snapshot(selectDirective('session', 'logic', NO_FLAGS));
  });

  it('renders security-lens base with no active mrShape flags', (t) => {
    t.assert.snapshot(selectDirective('session', 'security', NO_FLAGS));
  });

  it('renders code-lens base with no active mrShape flags', (t) => {
    t.assert.snapshot(selectDirective('session', 'code', NO_FLAGS));
  });

  it('renders synthesize base with no active mrShape flags', (t) => {
    t.assert.snapshot(selectDirective('synthesize', undefined, NO_FLAGS));
  });

  it('renders track-review base with newSymbols and nestedLoops composed additively', (t) => {
    t.assert.snapshot(
      selectDirective('session', 'logic', { ...NO_FLAGS, newSymbols: true, nestedLoops: true })
    );
  });

  it('renders security-lens base with isTiny active', (t) => {
    t.assert.snapshot(selectDirective('session', 'security', { ...NO_FLAGS, isTiny: true }));
  });
});
