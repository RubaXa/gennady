// @file: Unit tests for the verify command — exit codes, fatal config, qualified selectors, merge.
// @consumers: CI
// @tasks: TSK-96

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { run } = await import('../verify.cmd.ts');

/** @purpose Build argv the way node delivers it: [node, script, command, ...rest]. */
function argv(...rest: string[]): string[] {
  return ['node', 'gennady.ts', 'verify', ...rest];
}

/** @purpose Create a temp fixture dir with given files, run fn, clean up. */
async function withFixture<T>(
  files: Record<string, string>,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cmd-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** @purpose Capture console output produced by a callback. */
async function captureLog<T>(
  fn: () => Promise<T>
): Promise<{ value: T; log: string; err: string }> {
  const out: string[] = [];
  const errs: string[] = [];
  const logMock = mock.method(console, 'log', (...parts: unknown[]) => out.push(parts.join(' ')));
  const infoMock = mock.method(console, 'info', (...parts: unknown[]) => out.push(parts.join(' ')));
  const errMock = mock.method(console, 'error', (...parts: unknown[]) =>
    errs.push(parts.join(' '))
  );
  try {
    const value = await fn();
    return { value, log: out.join('\n'), err: errs.join('\n') };
  } finally {
    logMock.mock.restore();
    infoMock.mock.restore();
    errMock.mock.restore();
  }
}

describe('verify command', () => {
  it('exits 5 when no stack plugin recognizes the repository', async () => {
    await withFixture({ 'README.md': 'nothing here' }, async (dir) => {
      const { value } = await captureLog(() => run(argv(`--root=${dir}`)));
      assert.equal(value, 5);
    });
  });

  it('exits 4 on an unknown --stack id', async () => {
    await withFixture({ 'package.json': '{"name":"x","scripts":{"test":"true"}}' }, async (dir) => {
      const { value } = await captureLog(() => run(argv(`--root=${dir}`, '--stack=rust')));
      assert.equal(value, 4);
    });
  });

  it('exits 4 when --only names a gate absent from the plan', async () => {
    await withFixture({ 'package.json': '{"name":"x","scripts":{"test":"true"}}' }, async (dir) => {
      const { value } = await captureLog(() => run(argv(`--root=${dir}`, '--only=vet')));
      assert.equal(value, 4);
    });
  });

  it('invalid config stops the command before any gate — exit 4 with the error list', async () => {
    await withFixture(
      {
        'package.json': '{"name":"x","scripts":{"test":"node -e \\"process.exit(1)\\""}}',
        'gennady.yaml': 'stack:\n  node:\n    skipGate: [test]\n',
      },
      async (dir) => {
        const { value, err } = await captureLog(() => run(argv(`--root=${dir}`)));

        // The failing test script proves nothing ran: exit is 4, not 1.
        assert.equal(value, 4);
        assert.match(err, /CONFIG_ERROR/);
        assert.match(err, /did you mean "skipGates"/);
      }
    );
  });

  it('--plan --json emits the runs without executing any gate', async () => {
    await withFixture(
      { 'package.json': '{"name":"x","scripts":{"test":"node -e \\"process.exit(1)\\""}}' },
      async (dir) => {
        const { value, log } = await captureLog(() =>
          run(argv(`--root=${dir}`, '--plan', '--json'))
        );

        assert.equal(value, 0);
        const parsed = JSON.parse(log) as { runs: Array<{ detection: { stack: string } }> };
        assert.equal(parsed.runs[0]?.detection.stack, 'node');
      }
    );
  });

  it('exits 0 and prints the summary line when all gates pass', async () => {
    await withFixture(
      { 'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}' },
      async (dir) => {
        const { value, log } = await captureLog(() => run(argv(`--root=${dir}`)));

        assert.equal(value, 0);
        assert.match(log, /ALL_GATES_PASS \(1\/1\)/);
      }
    );
  });

  it('exits 1 and reports the gate when a script fails', async () => {
    await withFixture(
      { 'package.json': '{"name":"x","scripts":{"test":"node -e \\"process.exit(1)\\""}}' },
      async (dir) => {
        const { value, log } = await captureLog(() => run(argv(`--root=${dir}`)));

        assert.equal(value, 1);
        assert.match(log, /FAIL gate: node:test/);
      }
    );
  });

  it('accepts qualified stack:gate selectors in --skip; a fully-skipped run is ZERO_GATES, exit 1 (review B2)', async () => {
    await withFixture(
      { 'package.json': '{"name":"x","scripts":{"test":"node -e \\"process.exit(1)\\""}}' },
      async (dir) => {
        const { value, log } = await captureLog(() =>
          run(argv(`--root=${dir}`, '--skip=node:test'))
        );

        // The only gate is skipped: nothing was verified — that is not a pass.
        assert.equal(value, 1);
        assert.match(log, /SKIP gate: node:test/);
        assert.match(log, /ZERO_GATES/);
      }
    );
  });

  it('keeps a positional target literally named "verify" (review N2)', async () => {
    await withFixture(
      { 'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}', 'verify/.keep': '' },
      async (dir) => {
        const { value, log } = await captureLog(() =>
          run(argv(`--root=${dir}`, '--plan', '--json', 'verify'))
        );

        assert.equal(value, 0);
        const parsed = JSON.parse(log) as { runs: Array<{ scope: { mode: string } }> };
        assert.equal(parsed.runs[0]?.scope.mode, 'files');
      }
    );
  });

  it('truncates gate output in --json unless --full-output is passed (review B11)', async () => {
    await withFixture(
      {
        'package.json':
          '{"name":"x","scripts":{"test":"node -e \\"for(let i=0;i<500;i++)console.log(i);process.exit(1)\\""}}',
      },
      async (dir) => {
        const truncated = await captureLog(() => run(argv(`--root=${dir}`, '--json')));
        assert.equal(truncated.value, 1);
        const parsedTruncated = JSON.parse(truncated.log) as { results: Array<{ output: string }> };
        assert.match(parsedTruncated.results[0]?.output ?? '', /lines truncated/);

        const full = await captureLog(() => run(argv(`--root=${dir}`, '--json', '--full-output')));
        const parsedFull = JSON.parse(full.log) as { results: Array<{ output: string }> };
        assert.ok(!(parsedFull.results[0]?.output ?? '').includes('lines truncated'));
      }
    );
  });

  it('deep-merges gennady.yaml with a personal .gennadyrc and reports config skips with their source', async () => {
    await withFixture(
      {
        'package.json':
          '{"name":"x","scripts":{"test":"node -e \\"process.exit(1)\\"","type-check":"tsc --noEmit"}}',
        'gennady.yaml':
          'stack:\n  node:\n    overrideGates:\n      typecheck:\n        argv: [node, -e, "0"]\n',
        '.gennadyrc': '{"stack":{"node":{"skipGates":["test"]}}}',
      },
      async (dir) => {
        const { value, log } = await captureLog(() => run(argv(`--root=${dir}`)));

        // typecheck overridden by yaml passes; test skipped by the personal rc.
        assert.equal(value, 0);
        assert.match(log, /SKIP gate: node:test — skipGates \(\.gennadyrc\)/);
        assert.match(log, /ALL_GATES_PASS \(1\/1\)/);
      }
    );
  });

  it('shows config sources and per-gate timeouts in --plan', async () => {
    await withFixture(
      {
        'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}',
        'gennady.yaml': 'stack:\n  node:\n    overrideGates:\n      test:\n        timeout: 90s\n',
      },
      async (dir) => {
        const { value, log } = await captureLog(() => run(argv(`--root=${dir}`, '--plan')));

        assert.equal(value, 0);
        assert.match(log, /config: {4}gennady\.yaml/);
        assert.match(log, /\[90s\]/);
        assert.match(log, /overridden by gennady\.yaml/);
      }
    );
  });
});
