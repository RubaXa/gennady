// @file: Unit tests for the anystack preset (V-08) — config-authored gate names/commands, fixed
//   declaration order, never required (read-only, never makes a project not-ready).
// @consumers: CI
// @tasks: V-08

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnystackPreset } from '../anystack.ts';
import type { StackConfig } from '../../verify.types.ts';

function configWith(extraGates: readonly Record<string, unknown>[]): StackConfig {
  return { anystack: { extraGates } } as unknown as StackConfig;
}

describe('resolveAnystackPreset', () => {
  it('no config at all → empty gate list, never required', () => {
    const preset = resolveAnystackPreset('.', null);
    assert.deepStrictEqual(preset.gateNames('full', false), []);
    assert.deepStrictEqual(preset.requiredGateNames('full', false), []);
  });

  it('extraGates surface as gate names in exact declaration order (И-2 fixed order)', () => {
    const config = configWith([
      { id: 'style', argv: ['sh', '-c', 'true'] },
      { id: 'build', argv: ['sh', '-c', 'true'] },
      { id: 'syntax', argv: ['sh', '-c', 'true'] },
    ]);
    const preset = resolveAnystackPreset('.', config);
    assert.deepStrictEqual(preset.gateNames('full', false), ['style', 'build', 'syntax']);
  });

  it('no extraGate is ever required — anystack never makes a project not-ready', () => {
    const config = configWith([{ id: 'style', argv: ['sh', '-c', 'true'] }]);
    const preset = resolveAnystackPreset('.', config);
    assert.deepStrictEqual(preset.requiredGateNames('full', false), []);
    assert.deepStrictEqual(preset.requiredGateNames('code', true), []);
  });

  it('commandForGate renders argv as a shell-safe command string, quoting only tokens that need it', () => {
    const config = configWith([
      { id: 'syntax', argv: ['sh', '-c', 'test -f src/main.exotic'] },
      { id: 'plain', argv: ['tool', '--flag', 'value'] },
    ]);
    const preset = resolveAnystackPreset('.', config);
    assert.strictEqual(preset.commandForGate('syntax', {}, []), "sh -c 'test -f src/main.exotic'");
    assert.strictEqual(preset.commandForGate('plain', {}, []), 'tool --flag value');
  });

  it('commandForGate returns null for a name with no matching extraGate', () => {
    const config = configWith([{ id: 'style', argv: ['sh', '-c', 'true'] }]);
    const preset = resolveAnystackPreset('.', config);
    assert.strictEqual(preset.commandForGate('nonexistent', {}, []), null);
  });

  it('declares a non-empty environmentStateSource label', () => {
    const preset = resolveAnystackPreset('.', null);
    assert.ok(preset.environmentStateSource.length > 0);
  });
});
