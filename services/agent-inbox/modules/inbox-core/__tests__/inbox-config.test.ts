// @file: Unit tests for inbox-core InboxConfig — structured signal, atomic save, unset, missing config.
// @consumers: node:test runner
// @tasks: TSK-109

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InboxConfig } from '../inbox-config.ts';

let tmpDir: string;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'inbox-core-config-test-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('InboxConfig — structured signal', () => {
  it('GIVEN config.json нет WHEN load() THEN { configured: false, missing: [...] }', async () => {
    const cfg = new InboxConfig(tmpDir);
    const result = await cfg.load();
    assert.strictEqual(result.configured, false);
    assert.deepStrictEqual((result as { missing: string[] }).missing, ['reposBase', 'vcsHost']);
  });

  it('GIVEN config.json валидный WHEN load() THEN { configured: true }', async () => {
    const configDir = join(tmpDir, 'agent-inbox');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ version: 1, reposBase: '/repos', vcsHost: 'gitlab.example.com' }),
      'utf-8'
    );

    const cfg = new InboxConfig(tmpDir);
    const result = await cfg.load();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/repos');
    assert.strictEqual((result as { vcsHost: string }).vcsHost, 'gitlab.example.com');
  });

  it('GIVEN config.json повреждён WHEN load() THEN { configured: false }', async () => {
    const configDir = join(tmpDir, 'agent-inbox');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), 'not json{{', 'utf-8');

    const cfg = new InboxConfig(tmpDir);
    const result = await cfg.load();
    assert.strictEqual(result.configured, false);
    assert.deepStrictEqual((result as { missing: string[] }).missing, ['reposBase', 'vcsHost']);
  });

  it('GIVEN config с version:2 WHEN load() THEN { configured: false }', async () => {
    const configDir = join(tmpDir, 'agent-inbox');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ version: 2, reposBase: '/r', vcsHost: 'h' }),
      'utf-8'
    );

    const cfg = new InboxConfig(tmpDir);
    const result = await cfg.load();
    assert.strictEqual(result.configured, false);
  });

  it('GIVEN partial config (reposBase only) WHEN load() THEN missing: [vcsHost]', async () => {
    const configDir = join(tmpDir, 'agent-inbox');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ version: 1, reposBase: '/repos' }),
      'utf-8'
    );

    const cfg = new InboxConfig(tmpDir);
    const result = await cfg.load();
    assert.strictEqual(result.configured, false);
    assert.deepStrictEqual((result as { missing: string[] }).missing, ['vcsHost']);
  });
});

describe('InboxConfig — save атомарно', () => {
  it('save в несуществующую директорию → создаёт родительские директории и пишет файл', async () => {
    const cfg = new InboxConfig(tmpDir);
    await cfg.save({ reposBase: '/custom', vcsHost: 'gitlab.example.com' });
    const result = await cfg.load();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/custom');
  });

  it('save partial — обновляет только переданные ключи, сохраняя остальные', async () => {
    const cfg = new InboxConfig(tmpDir);
    await cfg.save({ reposBase: '/initial', vcsHost: 'initial.example.com' });
    await cfg.save({ vcsHost: 'updated.example.com' });
    const result = await cfg.load();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/initial');
    assert.strictEqual((result as { vcsHost: string }).vcsHost, 'updated.example.com');
  });

  it('roundtrip save + load = данные совпадают', async () => {
    const cfg = new InboxConfig(tmpDir);
    await cfg.save({ reposBase: '/roundtrip', vcsHost: 'rt.example.com' });
    const result = await cfg.load();
    assert.strictEqual(result.configured, true);
    assert.strictEqual((result as { reposBase: string }).reposBase, '/roundtrip');
    assert.strictEqual((result as { vcsHost: string }).vcsHost, 'rt.example.com');
  });
});

describe('InboxConfig — unset', () => {
  it('unset удаляет ключ из конфига', async () => {
    const cfg = new InboxConfig(tmpDir);
    await cfg.save({ reposBase: '/r', vcsHost: 'h' });
    await cfg.unset('vcsHost');
    const result = await cfg.load();
    assert.strictEqual(result.configured, false);
    assert.deepStrictEqual((result as { missing: string[] }).missing, ['vcsHost']);
  });

  it('unset на отсутствующем файле → no-op', async () => {
    const cfg = new InboxConfig(join(tmpDir, 'nonexistent-unset'));
    await cfg.unset('reposBase');
  });
});
