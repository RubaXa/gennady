// @file: Unit tests for the registry — detection order, multi-stack activation, gate vocabulary.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { StackDetection, StackId, StackPlugin } from '../stack.types.ts';

const { detectStacks, BUILTIN_STACK_PLUGINS, BUILTIN_GATE_IDS } =
  await import('../stack-registry.ts');

/** @purpose A plugin recognizing either everything or nothing. */
function plugin(id: string, matches: boolean): StackPlugin {
  return {
    id: id as StackId,
    marker: 'any',
    description: id,
    gateIds: [],
    detect: (root: string): StackDetection | null =>
      matches ? { stack: id as StackId, root, summary: [], diagnostics: [], details: null } : null,
    verify: {
      resolveScope: (_detection, request) => ({ mode: request.mode, note: '', details: null }),
      planGates: () => [],
    },
  };
}

describe('detectStacks', () => {
  it('activates every plugin that recognizes the repository, not just the first', () => {
    const registry = [plugin('anystack', true), plugin('node', true), plugin('golang', false)];
    assert.deepStrictEqual(
      detectStacks('/repo', null, registry).map(({ plugin: p }) => p.id),
      ['anystack', 'node'],
      'anystack + a real stack is a normal multi-stack run'
    );
  });

  it('restricts candidates to stack.use, so a placeholder can be selected alone', () => {
    const registry = [plugin('anystack', true), plugin('node', true)];
    assert.deepStrictEqual(
      detectStacks('/repo', { use: ['anystack'] }, registry).map(({ plugin: p }) => p.id),
      ['anystack']
    );
  });

  it('keeps NO_STACK_DETECTED reachable when use names a stack that does not match', () => {
    const registry = [plugin('anystack', true), plugin('golang', false)];
    assert.deepStrictEqual(
      detectStacks('/repo', { use: ['golang'] }, registry),
      [],
      'an empty active set is what verify turns into exit 5'
    );
  });
});

describe('registry composition', () => {
  it('orders built-ins by id and derives the gate vocabulary from the plugins', () => {
    const ids = BUILTIN_STACK_PLUGINS.map((p) => p.id);
    assert.deepStrictEqual(ids, [...ids].sort(), 'report order must not depend on readdir order');
    assert.deepStrictEqual(Object.keys(BUILTIN_GATE_IDS).sort(), [...ids].sort());
    assert.deepStrictEqual(
      BUILTIN_GATE_IDS.anystack,
      [],
      'the placeholder declares no gates; extraGates supply them all'
    );
  });

  it('anystack recognizes any directory, so it is always available', () => {
    const anystack = BUILTIN_STACK_PLUGINS.find((p) => p.id === 'anystack');
    assert.ok(anystack, 'anystack must be a built-in');
    assert.notStrictEqual(anystack.detect('/nowhere/at/all'), null);
  });
});
