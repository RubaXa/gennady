// @file: Tests for verify.sh delegation probe and the legacy classifier's mutation screen.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY_SH = path.join(SCRIPTS_DIR, 'verify.sh');
const CLASSIFIER = path.join(SCRIPTS_DIR, 'classify-scripts.js');

/** @purpose Create a temp fixture with files, run fn, clean up. */
function withFixture<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sh-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** @purpose Run verify.sh in dir with a fake `gennady` binary shadowing PATH. */
function runVerify(dir: string, fakeGennady: string): { status: number | null; out: string } {
  const bin = path.join(dir, '_bin');
  fs.mkdirSync(bin, { recursive: true });
  const fake = path.join(bin, 'gennady');
  fs.writeFileSync(fake, fakeGennady);
  fs.chmodSync(fake, 0o755);
  // GENNADY_HOME points at an empty dir so the dev-checkout path cannot rescue the probe.
  const proc = spawnSync('bash', [VERIFY_SH, 'target.txt'], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GENNADY_HOME: bin },
  });
  return { status: proc.status, out: `${proc.stdout}${proc.stderr}` };
}

describe('verify.sh capability probe', () => {
  it('delegates to a gennady whose `verify --plan --json` emits JSON', () => {
    withFixture({ 'target.txt': 'x' }, (dir) => {
      const { status, out } = runVerify(
        dir,
        '#!/usr/bin/env bash\n' +
          'if [[ "$1" == "verify" ]]; then\n' +
          '  case "$*" in *"--plan"*) echo "{}"; exit 0;; esac\n' +
          '  echo "DELEGATED: $*"; exit 0\n' +
          'fi\n' +
          'echo "Usage: gennady <command>"; exit 0\n'
      );

      assert.equal(status, 0, out);
      assert.match(out, /DELEGATED: verify target\.txt/);
    });
  });

  it('does not delegate to an older gennady that answers everything with its help and exit 0', () => {
    withFixture(
      {
        'target.txt': 'x',
        // The only npm script is mutating: the legacy fallback must screen it out,
        // never run it as a gate (the pre-fix behavior rewrote the tree and passed).
        'package.json': '{"name":"x","scripts":{"lint":"eslint . --fix"}}',
      },
      (dir) => {
        const { out } = runVerify(
          dir,
          '#!/usr/bin/env bash\necho "Usage: gennady <command>"\nexit 0\n'
        );

        assert.ok(!out.includes('DELEGATED'), `must not delegate: ${out}`);
        assert.ok(!out.includes('ALL_GATES_PASS'), `mutating script must not pass as a gate: ${out}`);
        assert.match(out, /NO_SCRIPTS_DISCOVERED/);
      }
    );
  });
});

describe('classify-scripts.js mutation screen', () => {
  it('classifies --fix/--autofix/--write bodies as mutating and never selects them', () => {
    withFixture(
      {
        'package.json': JSON.stringify({
          name: 'x',
          scripts: {
            lint: 'eslint . --fix',
            format: 'prettier --write .',
            'lint:contracts': 'gennady lint --autofix src/',
            test: 'vitest run',
          },
        }),
      },
      (dir) => {
        const parsed = JSON.parse(execFileSync('node', [CLASSIFIER, dir], { encoding: 'utf-8' })) as {
          scripts: Array<{ name: string; classes: string[] }>;
          selected: Record<string, string>;
        };

        for (const name of ['lint', 'format', 'lint:contracts']) {
          const entry = parsed.scripts.find((script) => script.name === name);
          assert.deepEqual(entry?.classes, ['mutating'], name);
        }
        assert.equal(parsed.selected.lint, undefined);
        assert.equal(parsed.selected.format, undefined);
        assert.equal(parsed.selected.gennady, undefined);
        assert.equal(parsed.selected.test, 'test');
      }
    );
  });
});
