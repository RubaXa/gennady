// @file: Deterministic lock — a provisioned sandbox runs the FRESH local built dist, never a stale
//   copy and never a package bin. Guards the flow-eval provisioning fix (materializeLocalCli always
//   refreshes dist/ai/shim; only the dependency closure stays idempotent).
// @consumers: ai/flow-eval/provision
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provisionScenarioDirectories } from '../provision.ts';
import type { SddEvalScenario } from '../types.ts';

/** @purpose A minimal on-disk gennady root (dist + assembled ai + fake dep dirs) for provisioning. */
function fakeGennadyRoot(distContent: string): string {
  const root = mkdtempSync(join(tmpdir(), 'fake-gennady-'));
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/gennady.js'), distContent);
  writeFileSync(join(root, 'package.json'), '{"name":"gennady","version":"0.0.0"}\n');
  mkdirSync(join(root, 'ai/skills/sdd'), { recursive: true });
  writeFileSync(join(root, 'ai/skills/sdd/SKILL.md'), '# sdd\n');
  mkdirSync(join(root, 'ai/directives/sdd-v2'), { recursive: true });
  writeFileSync(join(root, 'ai/directives/sdd-v2/router.directive.xml'), '<x/>\n');
  for (const dep of [
    'jsdom',
    'mermaid',
    'tree-sitter',
    'tree-sitter-typescript',
    'typescript',
    'prettier',
    '@types/node',
    'c8',
  ]) {
    mkdirSync(join(root, 'node_modules', dep), { recursive: true });
  }
  return root;
}

function scenario(dir: string): SddEvalScenario {
  return { id: 's', intent: 'x', phase: 'execute', mode: 'canonical-execute', directory: dir };
}

describe('provisioned sandbox uses the fresh local dist (not a package, not stale)', () => {
  it('materializes the local built dist and a bin shim that execs it', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const dir = mkdtempSync(join(tmpdir(), 'sandbox-'));
    await provisionScenarioDirectories([scenario(dir)], tmpdir(), root);
    const dist = readFileSync(join(dir, 'node_modules/gennady/dist/gennady.js'), 'utf8');
    assert.strictEqual(dist, '// BUILD V1\n');
    const shim = readFileSync(join(dir, 'node_modules/.bin/gennady'), 'utf8');
    assert.match(shim, /\.\.\/gennady\/dist\/gennady\.js/);
    assert.match(shim, /^#!/);
  });

  it('REFRESHES a stale sandbox dist on re-provision (no blanket skip)', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const dir = mkdtempSync(join(tmpdir(), 'sandbox-'));
    await provisionScenarioDirectories([scenario(dir)], tmpdir(), root);
    // A stale prior build sits in the reused sandbox; the source build then advances.
    writeFileSync(join(dir, 'node_modules/gennady/dist/gennady.js'), '// STALE V0\n');
    writeFileSync(join(root, 'dist/gennady.js'), '// BUILD V2\n');
    await provisionScenarioDirectories([scenario(dir)], tmpdir(), root);
    const dist = readFileSync(join(dir, 'node_modules/gennady/dist/gennady.js'), 'utf8');
    assert.strictEqual(dist, '// BUILD V2\n');
  });
});
