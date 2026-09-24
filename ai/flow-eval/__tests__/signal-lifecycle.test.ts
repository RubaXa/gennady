// @file: Subprocess proof for SIGINT/SIGTERM compact-evidence-before-cleanup behavior.
// @spec: AI-SKILLS
// @consumers: signal-lifecycle-child.ts

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const roots = new Set<string>();
const FIXTURE = resolve(import.meta.dirname, 'fixtures/signal-lifecycle-child.ts');

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

describe('flow-eval process signal lifecycle', () => {
  for (const [signal, exitCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const) {
    it(`${signal} compacts partial evidence, cleans the sandbox, and exits ${exitCode}`, () => {
      const root = mkdtempSync(join(tmpdir(), 'eval-signal-'));
      roots.add(root);
      const result = spawnSync(process.execPath, ['--import', 'tsx', FIXTURE, root, signal], {
        encoding: 'utf8',
      });
      assert.equal(result.status, exitCode, result.stderr);
      const output = JSON.parse(result.stdout) as {
        signal: string;
        finalized: { removed: number; pending: string[]; runDirectory: string };
      };
      assert.equal(output.signal, signal);
      assert.equal(output.finalized.removed, 1);
      assert.deepEqual(output.finalized.pending, []);
      assert.equal(
        JSON.parse(readFileSync(join(output.finalized.runDirectory, 'lifecycle.json'), 'utf8'))
          .reason,
        signal
      );
      assert.ok(
        existsSync(join(output.finalized.runDirectory, 'interrupted/specs/interrupted.spec.md'))
      );
      assert.equal(
        readdirSync(root).some((name) => name.startsWith('sdd-flow-eval-')),
        false
      );
    });
  }
});
