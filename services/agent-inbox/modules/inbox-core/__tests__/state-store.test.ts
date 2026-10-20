// @file: Unit tests for inbox-core StateStore — unified state access, atomic operations, auto-creation.
// @consumers: node:test runner
// @tasks: TSK-109

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { StateStore } from '../state-store.ts';

let tmpDir: string;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'inbox-core-state-store-test-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('StateStore — config', () => {
  it('loadConfig без файла → structured signal { configured: false }', async () => {
    const store = new StateStore(tmpDir);
    const result = await store.loadConfig();
    assert.strictEqual(result.configured, false);
    assert.deepStrictEqual((result as { missing: string[] }).missing, ['reposBase', 'vcsHost']);
  });

  it('saveConfig атомарно создаёт stateDir и файл', async () => {
    const store = new StateStore(tmpDir);
    await store.saveConfig({ reposBase: '/repos', vcsHost: 'gitlab.example.com' });

    // verify directory was auto-created
    assert.ok(existsSync(join(tmpDir, 'agent-inbox', 'config.json')));
  });

  it('GIVEN stateDir не существует WHEN saveConfig() THEN директория создана, файл записан атомарно', async () => {
    const freshDir = join(tmpDir, 'fresh');
    const store = new StateStore(freshDir);
    // dir should not exist yet
    assert.ok(!existsSync(freshDir));

    await store.saveConfig({ reposBase: '/r', vcsHost: 'h' });

    // after save, dir and file should exist
    assert.ok(existsSync(join(freshDir, 'agent-inbox', 'config.json')));

    // and data should roundtrip
    const store2 = new StateStore(freshDir);
    const result = await store2.loadConfig();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/r');
  });

  it('saveConfig + loadConfig = roundtrip', async () => {
    const store = new StateStore(tmpDir);
    await store.saveConfig({ reposBase: '/roundtrip', vcsHost: 'rt.example.com' });
    const result = await store.loadConfig();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/roundtrip');
    assert.strictEqual((result as { vcsHost: string }).vcsHost, 'rt.example.com');
  });
});

describe('StateStore — registry', () => {
  it('loadRegistry на пустом → пустой реестр', () => {
    const store = new StateStore(tmpDir);
    const registry = store.loadRegistry();
    assert.strictEqual(registry.version, 1);
    assert.deepStrictEqual(registry.entries, {});
  });

  it('updateDelta на пустом реестре → все MR = NEW', () => {
    const store = new StateStore(tmpDir);
    const delta = store.updateDelta([
      { webUrl: 'https://x/1', project: 'g/p', iid: '1', updatedAt: '2026-01-01T00:00:00Z' },
      { webUrl: 'https://x/2', project: 'g/p', iid: '2', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
    assert.strictEqual(delta.NEW.length, 2);
    assert.strictEqual(delta['↑'].length, 0);
  });
});

describe('StateStore — audit', () => {
  it('appendAudit + queryAudit = roundtrip', async () => {
    const store = new StateStore(tmpDir);
    await store.appendAudit({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'classified',
    });
    await store.appendAudit({
      ts: '2026-01-02T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'approved',
    });

    const results = await store.queryAudit('https://x/1');
    assert.strictEqual(results.length, 2);
  });

  it('queryAudit для неизвестного MR → []', async () => {
    const store = new StateStore(tmpDir);
    await store.appendAudit({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'classified',
    });

    const results = await store.queryAudit('https://x/unknown');
    assert.strictEqual(results.length, 0);
  });
});

describe('StateStore — атомарность', () => {
  it('повторный saveConfig не повреждает файл', async () => {
    const store = new StateStore(tmpDir);
    await store.saveConfig({ reposBase: '/r1', vcsHost: 'h1' });
    await store.saveConfig({ vcsHost: 'h2' });

    const result = await store.loadConfig();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/r1');
    assert.strictEqual((result as { vcsHost: string }).vcsHost, 'h2');
  });
});
