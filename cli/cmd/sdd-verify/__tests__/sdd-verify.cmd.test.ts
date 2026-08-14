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

  it('a runaway failed gate is tail-capped to its last 120 lines with a truncation note', () => {
    const bigOutput = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const results: GateResult[] = GATES.map((g) => ({
      name: g.name,
      exitCode: g.name === 'test:coverage' ? 1 : 0,
      output: g.name === 'test:coverage' ? bigOutput : '',
      durationMs: 100,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(
      v.message,
      /… output truncated to last 120 lines — full transcript: npm run test:coverage/
    );
    assert.doesNotMatch(v.message, /line 379\b/); // dropped — only the last 120 lines (380..499) survive
    assert.match(v.message, /line 499/); // the tail is kept
    assert.doesNotMatch(v.message, /^line 0$/m);
  });

  it('output that already fits both bounds is left untouched (no truncation note)', () => {
    const results: GateResult[] = GATES.map((g) => ({
      name: g.name,
      exitCode: g.name === 'lint' ? 1 : 0,
      output: g.name === 'lint' ? 'short failure\ndetail line' : '',
      durationMs: 100,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /short failure/);
    assert.match(v.message, /detail line/);
    assert.doesNotMatch(v.message, /truncated/);
  });

  it('a failed gate whose few lines still exceed 16KB is byte-capped, not just line-capped', () => {
    const hugeLine = 'x'.repeat(20 * 1024); // 20KB on one line — over the 16KB cap alone
    const output = ['first line', hugeLine].join('\n');
    const results: GateResult[] = GATES.map((g) => ({
      name: g.name,
      exitCode: g.name === 'yagni' ? 1 : 0,
      output: g.name === 'yagni' ? output : '',
      durationMs: 100,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /truncated/);
    assert.doesNotMatch(v.message, /first line/); // dropped to satisfy the 16KB bound
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
      'npx gennady yagni',
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
  it('defaults to the full 5-gate sequence — npm scripts as `npm run <name>`, yagni direct as `npx gennady yagni`', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner);
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run format',
      'npm run lint',
      'npm run typecheck',
      'npm run test:coverage',
      'npx gennady yagni',
    ]);
  });

  it('RUN-ALL: keeps running after a failure and exits 1', async () => {
    const { runner, calls } = fakeRunner(['format']);
    const o = await run(runner);
    assert.strictEqual(o.ok === false && o.exitCode, 1);
    assert.strictEqual(calls.length, 5);
  });

  it('yagni gate is never proxied through a project npm script — the project need not declare one', async () => {
    const { runner, calls } = fakeRunner();
    await run(runner, 'full');
    assert.ok(!calls.includes('npm run yagni'));
    assert.ok(calls.includes('npx gennady yagni'));
  });
});
