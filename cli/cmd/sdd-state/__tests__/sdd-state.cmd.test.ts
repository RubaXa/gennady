// @file: Integration tests for SddStateCommand#run — flow version, exact readiness, scopes+description, session, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type SddStateModule = typeof import('../sdd-state.cmd.ts');

let mod: SddStateModule;
let origExit: typeof process.exit;
let origArgv: string[];
let ready: string;
let noPortal: string;
let v1Repo: string;
let bare: string;

const PORTAL = [
  '# proj',
  '## Scopes',
  '| Scope | Type | Spec | Description |',
  '|---|---|---|---|',
  '| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | TS toolchain |',
  '| [`web`](./web/web.spec.md) | product | 🚧 | React SPA |',
].join('\n');

const READY_PKG = JSON.stringify({
  scripts: {
    typecheck: 'tsc --noEmit',
    test: 'node --test',
    'test:coverage': 'c8 node --test',
    lint: 'npm run lint:contracts',
    'lint:contracts': 'gennady lint .',
    format: 'prettier --write .',
  },
});

const SESSION = [
  '# SDD session — 2026-06-21',
  'intent: evolve-scope',
  'working set:',
  '  - specs/web/web.spec.md — add auth — open',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-state', ...rest];
}

describe('SddStateCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-state'];

    ready = mkdtempSync(join(tmpdir(), 'sdd-state-ready-'));
    mkdirSync(join(ready, 'specs'), { recursive: true });
    writeFileSync(join(ready, 'specs', 'README.md'), PORTAL, 'utf-8');
    writeFileSync(join(ready, 'specs', '.sdd-session.md'), SESSION, 'utf-8');
    writeFileSync(join(ready, 'package.json'), READY_PKG, 'utf-8');
    mkdirSync(join(ready, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(ready, 'node_modules', '.bin', 'gennady'), '#!/bin/sh\n', 'utf-8');
    mkdirSync(join(ready, 'src'), { recursive: true });
    writeFileSync(join(ready, 'src', 'app.ts'), 'export const app = 1;\n', 'utf-8');
    writeFileSync(join(ready, 'tsconfig.json'), '{}\n', 'utf-8');

    noPortal = mkdtempSync(join(tmpdir(), 'sdd-state-none-'));
    writeFileSync(
      join(noPortal, 'package.json'),
      JSON.stringify({ scripts: { test: 'node --test' } }),
      'utf-8'
    );

    bare = mkdtempSync(join(tmpdir(), 'sdd-state-bare-'));

    v1Repo = mkdtempSync(join(tmpdir(), 'sdd-state-v1-'));
    mkdirSync(join(v1Repo, 'tasks'), { recursive: true });
    writeFileSync(join(v1Repo, 'package.json'), READY_PKG, 'utf-8');

    mod = await import('../sdd-state.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(ready, { recursive: true, force: true });
    rmSync(noPortal, { recursive: true, force: true });
    rmSync(v1Repo, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  });

  it('reports v2 flow, ready, scopes with description, and the session', async () => {
    const o = await mod.run(argv(ready));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /FLOW_VERSION=v2/);
      assert.match(o.text, /READINESS=ready/);
      assert.match(o.text, /package\.json\t✔/);
      assert.match(o.text, /typecheck\t✔/);
      assert.match(o.text, /test:coverage\t✔/);
      assert.match(o.text, /lint→gennady\t✔/);
      assert.match(o.text, /gennady-installed\t✔/);
      assert.match(o.text, /infra-base\tinfrastructure\tdone\tTS toolchain/);
      assert.match(o.text, /web\tproduct\twip\tReact SPA/);
      assert.match(o.text, /intent: evolve-scope/);
      assert.match(o.text, /readiness=ready/);
    }
  });

  it('reports not-ready with the missing list when required scripts are absent', async () => {
    const o = await mod.run(argv(noPortal));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /READINESS=not-ready/);
      assert.match(o.text, /missing:[^)]*typecheck/);
      assert.match(o.text, /missing:[^)]*format/);
      assert.match(o.text, /missing:[^)]*gennady/);
      assert.match(o.text, /package\.json\t✔/);
      assert.match(o.text, /gennady-installed\t✘/);
      assert.match(o.text, /PORTAL=absent/);
      assert.match(o.text, /session=absent/);
    }
  });

  it('omits [PROBE] by default, includes it with --probe (code/infra heuristics)', async () => {
    const def = await mod.run(argv(ready));
    assert.strictEqual(def.ok, true);
    if (def.ok) assert.ok(!def.text.includes('[PROBE]'), 'no probe section by default');

    const pr = await mod.run(argv(ready, '--probe'));
    assert.strictEqual(pr.ok, true);
    if (pr.ok) {
      assert.match(pr.text, /\[PROBE\]/);
      assert.match(pr.text, /CODE=present/);
      assert.match(pr.text, /INFRA=present/);
      assert.match(pr.text, /code=present/);
    }
  });

  it('reports package.json absent when the root has none', async () => {
    const o = await mod.run(argv(bare));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /package\.json\t✘/);
      assert.match(o.text, /missing:[^)]*package\.json/);
    }
  });

  it('detects the v1 layout (tasks/) → FLOW_VERSION=v1', async () => {
    const o = await mod.run(argv(v1Repo));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /FLOW_VERSION=v1/);
  });

  it('exit 2 on a non-directory root, exit 4 on extra args', async () => {
    const badr = await mod.run(argv(join(noPortal, 'package.json')));
    assert.strictEqual(badr.ok === false && badr.exitCode, 2);
    const bad4 = await mod.run(argv(ready, noPortal));
    assert.strictEqual(bad4.ok === false && bad4.exitCode, 4);
  });
});
