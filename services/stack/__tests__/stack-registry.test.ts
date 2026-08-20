// @file: Unit tests for the registry — detection order and opt-in plugins.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { StackDetection, StackPlugin } from '../stack.types.ts';

const { detectStacks, BUILTIN_STACK_PLUGINS, BUILTIN_GATE_IDS } =
  await import('../stack-registry.ts');

/** @purpose A plugin that recognizes everything, optionally opt-in. */
function alwaysMatches(id: string, optIn: boolean): StackPlugin {
  return {
    id: id as StackPlugin['id'],
    marker: 'any',
    description: id,
    gateIds: [],
    ...(optIn ? { optIn: true } : {}),
    detect: (root: string): StackDetection => ({
      stack: id as StackDetection['stack'],
      root,
      summary: [],
      diagnostics: [],
      details: null,
    }),
    verify: {
      resolveScope: (_d, request) => ({ mode: request.mode, note: '', details: null }),
      planGates: () => [],
    },
  };
}

describe('detectStacks — opt-in plugins', () => {
  it('never auto-detects an opt-in plugin, even though it matches everything', () => {
    const registry = [alwaysMatches('anystack', true)];
    assert.deepStrictEqual(
      detectStacks('/repo', null, registry),
      [],
      'a placeholder that matched by itself would delete NO_STACK_DETECTED as a class of error'
    );
  });

  it('activates it when stack.use names it', () => {
    const registry = [alwaysMatches('anystack', true)];
    const active = detectStacks('/repo', { use: ['anystack'] }, registry);
    assert.deepStrictEqual(
      active.map(({ plugin }) => plugin.id),
      ['anystack']
    );
  });

  it('still auto-detects a plugin that is not opt-in', () => {
    const registry = [alwaysMatches('always', false)];
    assert.strictEqual(detectStacks('/repo', null, registry).length, 1);
  });

  it('keeps opt-in out of the way of a real stack', () => {
    const registry = [alwaysMatches('anystack', true), alwaysMatches('real', false)];
    assert.deepStrictEqual(
      detectStacks('/repo', null, registry).map(({ plugin }) => plugin.id),
      ['real']
    );
  });
});

describe('registry composition', () => {
  it('orders built-ins by id and derives the gate vocabulary from the plugins', () => {
    const ids = BUILTIN_STACK_PLUGINS.map((plugin) => plugin.id);
    assert.deepStrictEqual(ids, [...ids].sort(), 'report order must not depend on readdir order');
    assert.deepStrictEqual(Object.keys(BUILTIN_GATE_IDS).sort(), [...ids].sort());
    assert.deepStrictEqual(
      BUILTIN_GATE_IDS.anystack,
      [],
      'the placeholder declares no gates; extraGates supply them all'
    );
  });
});
