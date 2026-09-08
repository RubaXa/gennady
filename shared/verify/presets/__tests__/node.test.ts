// @file: Unit tests for the node preset — gate names, required names, command resolution, and
//   resolvePreset's stack dispatch (V-04). Byte-for-byte parity with the pre-V-04 hardcoded lists
//   is proven separately by shared/sdd/__tests__/preset-node-golden.test.ts (V-01 golden).
// @consumers: CI
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nodeGateNames, resolvePreset } from '../node.ts';

describe('nodeGateNames', () => {
  it('full profile: type-check, test:coverage, lint, format, yagni', () => {
    assert.deepStrictEqual(nodeGateNames('full', false), [
      'type-check',
      'test:coverage',
      'lint',
      'format',
      'yagni',
    ]);
  });

  it('test profile owning coverage: fix, type-check, test:coverage', () => {
    assert.deepStrictEqual(nodeGateNames('test', true), ['fix', 'type-check', 'test:coverage']);
  });

  it('test profile not owning coverage: fix, type-check, test', () => {
    assert.deepStrictEqual(nodeGateNames('test', false), ['fix', 'type-check', 'test']);
  });

  it('code/setup profiles: fix, type-check, test', () => {
    assert.deepStrictEqual(nodeGateNames('code', false), ['fix', 'type-check', 'test']);
    assert.deepStrictEqual(nodeGateNames('setup', false), ['fix', 'type-check', 'test']);
  });
});

describe('resolvePreset', () => {
  it("resolves 'node' to a preset carrying the node gate names and an environmentStateSource", () => {
    const preset = resolvePreset('node', 'full', '.');
    assert.ok(preset);
    assert.strictEqual(preset.stack, 'node');
    assert.deepStrictEqual(preset.gateNames('full', false), [
      'type-check',
      'test:coverage',
      'lint',
      'format',
      'yagni',
    ]);
    assert.ok(preset.environmentStateSource.length > 0);
  });

  it('requiredGateNames: setup requires nothing, every other profile requires its full gate list', () => {
    const preset = resolvePreset('node', 'full', '.')!;
    assert.deepStrictEqual(preset.requiredGateNames('setup', false), []);
    assert.deepStrictEqual(preset.requiredGateNames('code', false), ['fix', 'type-check', 'test']);
    assert.deepStrictEqual(
      preset.requiredGateNames('full', false),
      preset.gateNames('full', false)
    );
  });

  it("commandForGate: 'fix' resolves to target-repair only when both repair leaves are declared, real, and argument-forwarding", () => {
    const preset = resolvePreset('node', 'full', '.')!;
    const scripts = {
      'format:fix': 'prettier --write',
      'lint:fix': 'eslint --fix',
    };
    assert.strictEqual(preset.commandForGate('fix', scripts, ['src/a.ts']), 'target-repair');
    assert.strictEqual(preset.commandForGate('fix', scripts, []), null); // no targets
    assert.strictEqual(preset.commandForGate('fix', {}, ['src/a.ts']), null); // leaves undeclared
  });

  it('commandForGate: an ordinary gate resolves to `npm run <declared script name>`', () => {
    const preset = resolvePreset('node', 'full', '.')!;
    assert.strictEqual(
      preset.commandForGate('type-check', { 'type-check': 'tsc' }, []),
      'npm run type-check'
    );
    assert.strictEqual(preset.commandForGate('type-check', {}, []), null);
  });

  it('an unimplemented stack resolves to null (anystack/golang arrive in V-08/V-09)', () => {
    assert.strictEqual(resolvePreset('anystack', 'full', '.'), null);
    assert.strictEqual(resolvePreset('golang', 'full', '.'), null);
  });
});
