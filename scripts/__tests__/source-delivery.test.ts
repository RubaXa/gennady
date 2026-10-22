// @file: Regression proof that review coverage sources survive repository ignore rules.
// @spec: INFRA-BASE
// @consumers: deterministic test runner, source delivery verification

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE_DIRECTORY = 'services/agent-inbox/modules/inbox-pipeline/coverage';
const REQUIRED_SOURCES = [
  `${SOURCE_DIRECTORY}/review-repair-coordinator.ts`,
  `${SOURCE_DIRECTORY}/review-structural-validator.ts`,
];

it('ships required review coverage sources while ignoring generated coverage output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gennady-source-delivery-'));
  try {
    copyFileSync(join(ROOT, '.gitignore'), join(directory, '.gitignore'));
    const initialized = spawnSync('git', ['init', '--quiet', directory], { encoding: 'utf8' });
    assert.equal(initialized.status, 0, `${initialized.error ?? ''}${initialized.stderr}`);

    for (const path of REQUIRED_SOURCES) {
      assert.ok(statSync(join(ROOT, path)).isFile(), `required runtime source absent: ${path}`);
    }

    const generated = [
      'coverage/lcov.info',
      'coverage/index.html',
      'services/agent-inbox/coverage/lcov.info',
      `${SOURCE_DIRECTORY}/lcov.info`,
      `${SOURCE_DIRECTORY}/html/index.html`,
    ];
    const ignored = spawnSync(
      'git',
      ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '--stdin'],
      {
        cwd: directory,
        encoding: 'utf8',
        input: [...REQUIRED_SOURCES, ...generated].join('\n') + '\n',
      }
    );
    assert.equal(ignored.status, 0, `${ignored.error ?? ''}${ignored.stderr}`);
    assert.deepEqual(ignored.stdout.trim().split('\n'), generated);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
