// @file: Execute the documented orphan-decision repro against its frozen source, not candidate code.
// @spec: AI-SKILLS
// @consumers: execution-autonomy baseline qualification

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';
import { cleanTestChildEnv } from '../../../cli/__tests__/tool-behavior/run-cli.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const SOURCE = '7958ecb0a3cabcfd2ba923d272a65e00a981a0c6';

it('reproduces the documented orphan failure on frozen source with shared dependencies and cleanup', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'gennady-autonomy-baseline-'));
  try {
    const archive = execFileSync(
      'git',
      [
        '-C',
        ROOT,
        'archive',
        SOURCE,
        'package.json',
        'tsconfig.json',
        'cli',
        'shared',
        'services',
        'plugins',
      ],
      {
        env: cleanTestChildEnv(process.env),
        maxBuffer: 64 * 1024 * 1024,
        timeout: 30_000,
      }
    );
    execFileSync('tar', ['-xf', '-', '-C', temporary], {
      input: archive,
      timeout: 30_000,
      env: { ...cleanTestChildEnv(process.env), LC_ALL: 'C', LANG: 'C' },
    });
    symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(temporary, 'node_modules'), 'dir');
    const baseline = readFileSync(
      join(ROOT, 'ai/flow-eval/results/2026-10-26-execution-autonomy/BASELINE.md'),
      'utf8'
    );
    const snippet = /```js\n([\s\S]*?)\n```/.exec(baseline.split('## 2.')[0] ?? '')?.[1];
    assert.ok(snippet, 'the original documented repro must remain present');
    const outcome = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-'], {
      cwd: temporary,
      input: snippet,
      encoding: 'utf8',
      env: cleanTestChildEnv(process.env),
      timeout: 30_000,
    });
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.status, 0, outcome.stdout + outcome.stderr);
    const result = JSON.parse(outcome.stdout);
    assert.equal(result.case, 'handoff-orphan');
    assert.equal(result.completeAccepted, true);
    assert.equal(result.records, 0);
    assert.equal(result.verdict.ok, false);
    assert.equal(result.controlRecords, 1);
    assert.equal(result.controlVerdictAccepted, true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
