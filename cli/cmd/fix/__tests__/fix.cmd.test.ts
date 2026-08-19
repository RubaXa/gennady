// @file: Unit tests for the fix command — gate-attached fixers in the real tree, selection, errors.
// @consumers: CI
// @tasks: TSK-96

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { run } = await import('../fix.cmd.ts');

/** @purpose Build argv the way node delivers it: [node, script, command, ...rest]. */
function argv(...rest: string[]): string[] {
  return ['node', 'gennady.ts', 'fix', ...rest];
}

/** @purpose Create a temp fixture dir with given files, run fn, clean up. */
async function withFixture<T>(
  files: Record<string, string>,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-cmd-'));
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

describe('fix command', () => {
  it('runs a config fixer in the REAL tree — that is the point of fix', async () => {
    await withFixture(
      {
        'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}',
        'gennady.yaml':
          'stack:\n  node:\n    extraGates:\n      - id: touch\n        argv: [node, -e, "0"]\n        fixer:\n          argv: [node, touch.cjs]\n',
      },
      async (dir) => {
        // Simpler: rewrite the fixer to create out.txt via a helper script file.
        fs.writeFileSync(
          path.join(dir, 'touch.cjs'),
          "require('fs').writeFileSync('out.txt','x');"
        );
        fs.writeFileSync(
          path.join(dir, 'gennady.yaml'),
          'stack:\n  node:\n    extraGates:\n      - id: touch\n        argv: [node, -e, "0"]\n        fixer:\n          argv: [node, touch.cjs]\n'
        );
        const { value, log } = await captureLog(() => run(argv(`--root=${dir}`)));

        assert.equal(value, 0, log);
        assert.match(log, /✅ node:touch/);
        assert.equal(
          fs.existsSync(path.join(dir, 'out.txt')),
          true,
          'fixer must mutate the real tree'
        );
      }
    );
  });

  it('exits 4 on an unknown fixer id, listing the available ones', async () => {
    await withFixture(
      {
        'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}',
        'gennady.yaml':
          'stack:\n  node:\n    extraGates:\n      - id: touch\n        argv: [node, -e, "0"]\n        fixer:\n          argv: [node, -e, "0"]\n',
      },
      async (dir) => {
        const { value, err } = await captureLog(() =>
          run(argv(`--root=${dir}`, 'node:nonexistent'))
        );

        assert.equal(value, 4);
        assert.match(err, /unknown fixer/);
        assert.match(err, /node:touch/);
      }
    );
  });

  it('stops the chain on the first failing fixer and exits 1', async () => {
    await withFixture(
      {
        'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}',
        'gennady.yaml':
          'stack:\n  node:\n    extraGates:\n      - id: boom\n        argv: [node, -e, "0"]\n        fixer:\n          argv: [node, -e, "process.exit(3)"]\n      - id: never\n        argv: [node, -e, "0"]\n        fixer:\n          argv: [node, -e, "0"]\n',
      },
      async (dir) => {
        const { value, log, err } = await captureLog(() => run(argv(`--root=${dir}`)));

        assert.equal(value, 1);
        assert.match(err, /❌ FAIL node:boom/);
        assert.ok(!log.includes('node:never'), 'fixers after a failure must not run');
      }
    );
  });

  it('reports nothing-to-do when no fixers are declared', async () => {
    await withFixture(
      { 'package.json': '{"name":"x","scripts":{"test":"node -e 0"}}' },
      async (dir) => {
        const { value, log } = await captureLog(() => run(argv(`--root=${dir}`)));

        // node declares no gate-attached fixer in v1, so there is nothing to run.
        assert.equal(value, 0);
        assert.match(log, /nothing to do/);
      }
    );
  });
});
