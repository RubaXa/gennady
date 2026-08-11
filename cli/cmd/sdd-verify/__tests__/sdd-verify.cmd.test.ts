// @file: Unit tests for sdd-verify — fixed gate sequence, RUN-ALL, brief success, details on failure.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../sdd-verify.cmd.ts';
import {
  GATES,
  gatesFor,
  isProfile,
  verdict,
  type GateRunner,
  type GateResult,
} from '../sdd-verify.types.ts';

/** Fake runner: fails the named gates, records the commands it was asked to run. */
function fakeRunner(failNames: string[] = []): { runner: GateRunner; calls: string[] } {
  const calls: string[] = [];
  const runner: GateRunner = (command, args) => {
    const name = args[args.length - 1] ?? '';
    calls.push(`${command} ${args.join(' ')}`);
    const fail = failNames.includes(name);
    return { exitCode: fail ? 1 : 0, output: fail ? `<<${name} failed>>` : '' };
  };
  return { runner, calls };
}

describe('GATES', () => {
  it('is the fixed mutating-first exact sequence', () => {
    assert.deepStrictEqual(
      GATES.map((g) => g.name),
      ['format', 'lint', 'typecheck', 'test:coverage', 'yagni']
    );
    assert.deepStrictEqual(
      GATES.filter((g) => g.mutates).map((g) => g.name),
      ['format', 'lint']
    );
  });
});

describe('verdict', () => {
  it('all pass → brief ✅ ALL PASS with a line per gate', () => {
    const results: GateResult[] = GATES.map((g) => ({
      name: g.name,
      exitCode: 0,
      output: '',
      durationMs: 100,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, true);
    if (v.ok) {
      assert.match(v.text, /✅ ALL PASS \(5\/5\)/);
      assert.match(v.text, /✅ test:coverage/);
      assert.match(v.text, /✅ yagni/);
    }
  });

  it('a failure → exit 1; only the failed gate dumps output', () => {
    const results: GateResult[] = GATES.map((g) => ({
      name: g.name,
      exitCode: g.name === 'typecheck' ? 1 : 0,
      output: g.name === 'typecheck' ? 'TS2345 ...' : '',
      durationMs: 100,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (!v.ok) {
      assert.strictEqual(v.exitCode, 1);
      assert.match(v.message, /❌ typecheck — exit 1/);
      assert.match(v.message, /TS2345/);
      assert.match(v.message, /✅ format/);
      assert.doesNotMatch(v.message, /❌ format/);
    }
  });
});

describe('profiles', () => {
  it('gatesFor subsets GATES in canonical order per profile', () => {
    assert.deepStrictEqual(
      gatesFor('code').map((g) => g.name),
      ['format', 'lint', 'typecheck', 'yagni']
    );
    assert.deepStrictEqual(
      gatesFor('test').map((g) => g.name),
      ['format', 'typecheck', 'test:coverage']
    );
    assert.deepStrictEqual(
      gatesFor('full').map((g) => g.name),
      ['format', 'lint', 'typecheck', 'test:coverage', 'yagni']
    );
  });

  it('isProfile guards CLI input', () => {
    assert.ok(isProfile('code') && isProfile('test') && isProfile('full'));
    assert.ok(!isProfile('all') && !isProfile(''));
  });

  it('code profile runs no tests but still runs yagni; test profile runs no lint/yagni', async () => {
    const code = fakeRunner();
    await run(code.runner, 'code');
    assert.deepStrictEqual(code.calls, [
      'npm run format',
      'npm run lint',
      'npm run typecheck',
      'npm run yagni',
    ]);

    const test = fakeRunner();
    await run(test.runner, 'test');
    assert.deepStrictEqual(test.calls, [
      'npm run format',
      'npm run typecheck',
      'npm run test:coverage',
    ]);
  });
});

describe('run', () => {
  it('defaults to the full 5-gate sequence as `npm run <name>`', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner);
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run format',
      'npm run lint',
      'npm run typecheck',
      'npm run test:coverage',
      'npm run yagni',
    ]);
  });

  it('RUN-ALL: keeps running after a failure and exits 1', async () => {
    const { runner, calls } = fakeRunner(['format']);
    const o = await run(runner);
    assert.strictEqual(o.ok === false && o.exitCode, 1);
    assert.strictEqual(calls.length, 5);
  });
});
