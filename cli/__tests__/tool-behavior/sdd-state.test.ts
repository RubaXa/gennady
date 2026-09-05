// @file: Live-CLI behavior of sdd-state's readiness report — a real run against a fixture whose
//   eight required scripts, read-only/mutating shapes, and gennady install all satisfy
//   shared/sdd/readiness.ts, so the snapshot must report full readiness with nothing missing.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildRepoFixture, noop } from './fixture.ts';
import { runCli } from './run-cli.ts';

describe('sdd-state — live readiness snapshot', () => {
  it('all eight bricks present + read-only/mutating correctly shaped + gennady installed → fully ready', () => {
    const { root } = buildRepoFixture({
      directives: true,
      gennadyInstalled: true,
      scripts: {
        'type-check': noop(0),
        test: noop(0),
        'test:coverage': noop(0),
        // read-only: no --write/--fix/--autofix.
        format: 'prettier --check .',
        // mutating: carries --write.
        'format:fix': 'prettier --write',
        // read-only, and invokes gennady in command position (no execution involved).
        lint: 'gennady lint src/',
        // mutating: gennady's own autofix switch.
        'lint:fix': 'gennady lint --autofix',
        fix: 'npm run format:fix -- . && npm run lint:fix -- src/',
      },
    });
    try {
      const r = runCli(['sdd-state'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /READINESS=ready/);
      assert.doesNotMatch(r.stdout, /READINESS=not-ready/);
      assert.match(r.stdout, /gennady-installed\t✔/);
      for (const script of [
        'type-check',
        'test',
        'test:coverage',
        'format',
        'format:fix',
        'lint',
        'lint:fix',
        'fix',
      ]) {
        assert.match(r.stdout, new RegExp(`${script}\t✔`), `expected ${script} declared ✔`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
