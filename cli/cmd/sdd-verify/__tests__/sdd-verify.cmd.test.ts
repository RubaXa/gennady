// @file: Unit tests for sdd-verify — fixed gate sequence, RUN-ALL, brief success, details on failure.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATES,
  gatesFor,
  isProfile,
  verdict,
  parseInvocation,
  ERR_CLI_SDD_VERIFY_BAD_INVOCATION,
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

// ── Mock node:fs so `isSelfHosting`/`resolveScriptName` read a controlled
// package.json instead of this repo's real one — otherwise tests would be at
// the mercy of running inside gennady's own checkout (which they legitimately
// are today, but a consumer-mode test must still be exercisable). ──────────

let currentPkgJson = JSON.stringify({ name: 'gennady', scripts: { 'type-check': 'tsc' } });

const mockReadFileSync = mock.fn((path: string) => {
  if (String(path).endsWith('package.json')) return currentPkgJson;
  throw new Error(`unexpected readFileSync path in test: ${path}`);
});

mock.module('node:fs', {
  namedExports: { readFileSync: mockReadFileSync },
});

// ── Import SUT after the mock is registered ─────────────────────────────────

const { run, isSelfHosting, defaultRunner, runWithMaxBuffer, GATE_MAX_BUFFER_BYTES } =
  await import('../sdd-verify.cmd.ts');

beforeEach(() => {
  currentPkgJson = JSON.stringify({ name: 'gennady', scripts: { 'type-check': 'tsc' } });
});

describe('GATES', () => {
  it('is the fixed mutating-first exact sequence', () => {
    assert.deepStrictEqual(
      GATES.map((g) => g.name),
      ['format', 'lint', 'type-check', 'test:coverage', 'yagni']
    );
    assert.deepStrictEqual(
      GATES.filter((g) => g.mutates).map((g) => g.name),
      ['format', 'lint']
    );
  });
});

/** Builds a GateResult[] for all GATES, with a plausible `ranCommand` per gate name. */
function baseResults(): GateResult[] {
  return GATES.map((g) => ({
    name: g.name,
    exitCode: 0,
    output: '',
    durationMs: 100,
    ranCommand: g.via === 'gennady' ? `npx gennady ${g.name}` : `npm run ${g.name}`,
  }));
}

describe('verdict', () => {
  it('all pass → brief ✅ ALL PASS with a line per gate', () => {
    const results = baseResults();
    const v = verdict(results);
    assert.strictEqual(v.ok, true);
    if (v.ok) {
      assert.match(v.text, /✅ ALL PASS \(5\/5\)/);
      assert.match(v.text, /^\[sdd-verify\]/);
      assert.match(v.text, /✅ test:coverage/);
      assert.match(v.text, /✅ yagni/);
    }
  });

  it('a failure → exit 1; only the failed gate dumps output, and names the command it ran', () => {
    const results = baseResults().map((r) => ({
      ...r,
      exitCode: r.name === 'type-check' ? 1 : 0,
      output: r.name === 'type-check' ? 'TS2345 ...' : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (!v.ok) {
      assert.strictEqual(v.exitCode, 1);
      assert.match(v.message, /❌ type-check — exit 1 \(ran: npm run type-check\)/);
      assert.match(v.message, /^\[sdd-verify\]/);
      assert.match(v.message, /TS2345/);
      assert.match(v.message, /✅ format/);
      assert.doesNotMatch(v.message, /❌ format/);
    }
  });

  it('a runaway failed gate is tail-capped to its last 120 lines with a truncation note', () => {
    const bigOutput = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const results = baseResults().map((r) => ({
      ...r,
      exitCode: r.name === 'test:coverage' ? 1 : 0,
      output: r.name === 'test:coverage' ? bigOutput : '',
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
    const results = baseResults().map((r) => ({
      ...r,
      exitCode: r.name === 'lint' ? 1 : 0,
      output: r.name === 'lint' ? 'short failure\ndetail line' : '',
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
    const results = baseResults().map((r) => ({
      ...r,
      exitCode: r.name === 'yagni' ? 1 : 0,
      output: r.name === 'yagni' ? output : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /truncated/);
    assert.doesNotMatch(v.message, /first line/); // dropped to satisfy the 16KB bound
  });

  it('the truncation note names the actual ranCommand, not a hardcoded npm form', () => {
    const bigOutput = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const results = baseResults().map((r) => ({
      ...r,
      exitCode: r.name === 'yagni' ? 1 : 0,
      output: r.name === 'yagni' ? bigOutput : '',
      ranCommand: r.name === 'yagni' ? 'npx tsx cli/gennady.ts yagni' : r.ranCommand,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /❌ yagni — exit 1 \(ran: npx tsx cli\/gennady\.ts yagni\)/);
    assert.match(
      v.message,
      /… output truncated to last 120 lines — full transcript: npx tsx cli\/gennady\.ts yagni/
    );
  });
});

describe('profiles', () => {
  it('gatesFor subsets GATES in canonical order per profile', () => {
    assert.deepStrictEqual(
      gatesFor('code').map((g) => g.name),
      ['format', 'lint', 'type-check', 'yagni']
    );
    assert.deepStrictEqual(
      gatesFor('test').map((g) => g.name),
      ['format', 'type-check', 'test:coverage']
    );
    assert.deepStrictEqual(
      gatesFor('full').map((g) => g.name),
      ['format', 'lint', 'type-check', 'test:coverage', 'yagni']
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
      'npm run type-check',
      'npx tsx cli/gennady.ts yagni', // self-hosting (mocked package.json name: gennady)
    ]);

    const test = fakeRunner();
    await run(test.runner, 'test');
    assert.deepStrictEqual(test.calls, [
      'npm run format',
      'npm run type-check',
      'npm run test:coverage',
    ]);
  });
});

describe('parseInvocation', () => {
  // parseArgs (shared/common/parse-args.ts) keeps process.argv[2] — the command token itself —
  // inside `_`, so every case below prefixes argv with the real `node script sdd-verify` shape.
  const argv = (...rest: string[]): string[] => ['node', 'gennady.ts', 'sdd-verify', ...rest];

  it('no flags → defaults to the full profile', () => {
    const r = parseInvocation(argv());
    assert.deepStrictEqual(r, { ok: true, profile: 'full' });
  });

  it('--profile <value> and --profile=<value> both resolve the profile', () => {
    assert.deepStrictEqual(parseInvocation(argv('--profile', 'code')), {
      ok: true,
      profile: 'code',
    });
    assert.deepStrictEqual(parseInvocation(argv('--profile=test')), {
      ok: true,
      profile: 'test',
    });
  });

  it('a bare path — the exact real-world defect (a worker appending a target file) — is a hard error, not a silently ignored no-op', () => {
    const r = parseInvocation(argv('--profile', 'code', 'ai/kit/lazy-assembly.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /unexpected path argument\(s\): ai\/kit\/lazy-assembly\.ts/);
    assert.match(r.message, /whole project/i);
    assert.match(r.message, /npx gennady lint --spec=<module-spec> <paths>/);
  });

  it('multiple stray paths are all named in the error', () => {
    const r = parseInvocation(argv('foo.ts', 'bar.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /unexpected path argument\(s\): foo\.ts bar\.ts/);
  });

  it('does not discard a positional argument merely because it equals the command token', () => {
    const r = parseInvocation(argv('sdd-verify'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /unexpected path argument\(s\): sdd-verify/);
  });

  it('an unrelated unknown flag (--scope) is rejected, not silently dropped', () => {
    const r = parseInvocation(argv('--scope', 'src'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /scope/);
  });

  it('a misspelled flag (--profil, missing the trailing e) is rejected, not silently dropped', () => {
    const r = parseInvocation(argv('--profil', 'code'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /profil/);
  });

  it('an unknown --profile value is a bad invocation naming the accepted set', () => {
    const r = parseInvocation(argv('--profile', 'bogus'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /unknown --profile 'bogus'/);
  });

  it('bad-invocation message always carries the usage line', () => {
    const r = parseInvocation(argv('stray.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /usage: npx gennady sdd-verify \[--profile <code\|test\|full>]/);
  });
});

describe('isSelfHosting', () => {
  it('true when the project package.json name is exactly "gennady"', () => {
    currentPkgJson = JSON.stringify({ name: 'gennady' });
    assert.strictEqual(isSelfHosting(), true);
  });

  it('false for a consumer project — detected by package name, never by directory/path', () => {
    currentPkgJson = JSON.stringify({ name: 'some-consumer-app' });
    assert.strictEqual(isSelfHosting(), false);
  });

  it('false when package.json is missing or unparsable — fails closed to consumer behavior', () => {
    currentPkgJson = 'not json';
    assert.strictEqual(isSelfHosting(), false);
  });
});

describe('run — via: gennady gate dispatch', () => {
  it('self-hosting (package.json name: gennady) → calls the local source through tsx', async () => {
    currentPkgJson = JSON.stringify({ name: 'gennady', scripts: { 'type-check': 'tsc' } });
    const { runner, calls } = fakeRunner();
    const o = await run(runner);
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run format',
      'npm run lint',
      'npm run type-check',
      'npm run test:coverage',
      'npx tsx cli/gennady.ts yagni',
    ]);
  });

  it('consumer project (package.json name ≠ gennady) → calls npx gennady <gate> unchanged', async () => {
    currentPkgJson = JSON.stringify({
      name: 'some-consumer-app',
      scripts: { 'type-check': 'tsc' },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner);
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run format',
      'npm run lint',
      'npm run type-check',
      'npm run test:coverage',
      'npx gennady yagni',
    ]);
  });

  it('a failing gennady gate names the actual command it ran, in both modes', async () => {
    currentPkgJson = JSON.stringify({ name: 'gennady' });
    const selfHosted = await run(fakeRunner(['yagni']).runner, 'code');
    assert.strictEqual(selfHosted.ok, false);
    if (!selfHosted.ok) {
      assert.match(selfHosted.message, /❌ yagni — exit 1 \(ran: npx tsx cli\/gennady\.ts yagni\)/);
    }

    currentPkgJson = JSON.stringify({ name: 'some-consumer-app' });
    const consumer = await run(fakeRunner(['yagni']).runner, 'code');
    assert.strictEqual(consumer.ok, false);
    if (!consumer.ok) {
      assert.match(consumer.message, /❌ yagni — exit 1 \(ran: npx gennady yagni\)/);
    }
  });

  it('yagni gate is never proxied through a project npm script — the project need not declare one', async () => {
    const { runner, calls } = fakeRunner();
    await run(runner, 'full');
    assert.ok(!calls.includes('npm run yagni'));
    assert.ok(calls.some((c) => c.endsWith(' yagni')));
  });
});

describe('defaultRunner — real spawnSync maxBuffer behavior', () => {
  it('GATE_MAX_BUFFER_BYTES is generously above the default 1MB (real TAP output measured ~1.08MB)', () => {
    assert.strictEqual(GATE_MAX_BUFFER_BYTES, 64 * 1024 * 1024);
    assert.ok(GATE_MAX_BUFFER_BYTES > 1024 * 1024);
  });

  it('captures output well past the old 1MB default without ENOBUFS', () => {
    // node's default spawnSync maxBuffer is 1MB; write 2MB so this only passes if
    // defaultRunner's own maxBuffer override is actually in effect.
    const r = defaultRunner('node', ['-e', "process.stdout.write('x'.repeat(2 * 1024 * 1024))"]);
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(r.output.length, 2 * 1024 * 1024);
  });

  it('a real overflow past maxBuffer is reported honestly (spawn error, exit 127) — never a silently truncated verdict', () => {
    const r = runWithMaxBuffer(
      'node',
      ['-e', "process.stdout.write('x'.repeat(10_000))"],
      100 // tiny on purpose — forces a real spawnSync maxBuffer overflow
    );
    assert.strictEqual(r.exitCode, 127);
    assert.match(r.output, /node:/); // command name prefix
    assert.ok(r.output.length < 1000); // an honest short error, not a clipped 100-byte fragment of stdout
    assert.doesNotMatch(r.output, /^x+$/); // never a silent partial-output truncation
  });
});

describe('run', () => {
  it('defaults to the full 5-gate sequence — npm scripts as `npm run <name>`, yagni direct', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner);
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run format',
      'npm run lint',
      'npm run type-check',
      'npm run test:coverage',
      'npx tsx cli/gennady.ts yagni', // self-hosting default set in beforeEach
    ]);
  });

  it('RUN-ALL: keeps running after a failure and exits 1', async () => {
    const { runner, calls } = fakeRunner(['format']);
    const o = await run(runner);
    assert.strictEqual(o.ok === false && o.exitCode, 1);
    assert.strictEqual(calls.length, 5);
  });
});
