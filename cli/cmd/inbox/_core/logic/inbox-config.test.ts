// @file: Unit tests for inbox-config: loadConfig, saveConfig, validateConfig, configPath.
// @consumers: node:test runner
// @tasks: TSK-90

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { loadConfig, saveConfig, validateConfig } from './inbox-config.logic.ts';
import { configPath } from './state-paths.logic.ts';

let tmpDir: string;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'inbox-config-test-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('loadConfig("/nonexistent") → null', async () => {
    const result = await loadConfig(join(tmpDir, 'nonexistent.json'));
    assert.strictEqual(result, null);
  });

  it('loadConfig с битым JSON → бросает ошибку (CONFIG)', async () => {
    const corrupt = join(tmpDir, 'corrupt.json');
    await writeFile(corrupt, 'not json{{', 'utf-8');
    await assert.rejects(loadConfig(corrupt), {
      message: /invalid JSON/,
    });
  });

  it('loadConfig с version:2 → бросает ошибку (CONFIG)', async () => {
    const v2 = join(tmpDir, 'v2.json');
    await writeFile(v2, JSON.stringify({ version: 2 }), 'utf-8');
    await assert.rejects(loadConfig(v2), {
      message: /Unsupported config version/,
    });
  });

  it('loadConfig валидного файла → возвращает config', async () => {
    const valid = join(tmpDir, 'valid.json');
    const cfg = { version: 1 as const, reposBase: '/repos', vcsHost: 'gitlab.example.com' };
    await writeFile(valid, JSON.stringify(cfg), 'utf-8');
    const result = await loadConfig(valid);
    assert.deepStrictEqual(result, cfg);
  });
});

describe('saveConfig', () => {
  it('saveConfig в несуществующую директорию → создаёт родительские директории', async () => {
    const deep = join(tmpDir, 'deep', 'nested', 'config.json');
    await saveConfig(deep, { version: 1, reposBase: '/r', vcsHost: 'h' });
    const result = await loadConfig(deep);
    assert.ok(result);
    assert.strictEqual(result.version, 1);
  });

  it('saveConfig + loadConfig = roundtrip, данные совпадают', async () => {
    const path = join(tmpDir, 'roundtrip.json');
    const cfg = { version: 1 as const, reposBase: '/r', vcsHost: 'h' };
    await saveConfig(path, cfg);
    const loaded = await loadConfig(path);
    assert.deepStrictEqual(loaded, cfg);
  });
});

describe('validateConfig', () => {
  it('validateConfig({version:1, reposBase:"/p", vcsHost:"h"}) → valid:true, missing:[]', () => {
    const result = validateConfig({ version: 1, reposBase: '/p', vcsHost: 'h' });
    assert.deepStrictEqual(result, { valid: true, missing: [] });
  });

  it('validateConfig({version:1}) → valid:false, missing:["reposBase","vcsHost"]', () => {
    const result = validateConfig({ version: 1 });
    assert.deepStrictEqual(result, { valid: false, missing: ['reposBase', 'vcsHost'] });
  });

  it('validateConfig({version:1, reposBase:"/p"}) → valid:false, missing:["vcsHost"]', () => {
    const result = validateConfig({ version: 1, reposBase: '/p' });
    assert.deepStrictEqual(result, { valid: false, missing: ['vcsHost'] });
  });
});

describe('configPath', () => {
  it('configPath("/custom/state") → "/custom/state/agent-inbox/config.json"', () => {
    assert.strictEqual(configPath('/custom/state'), '/custom/state/agent-inbox/config.json');
  });

  it('configPath с дефолтным stateDir → <homedir>/.gennady/agent-inbox/config.json', () => {
    const defaultState = join(homedir(), '.gennady');
    assert.strictEqual(
      configPath(defaultState),
      join(homedir(), '.gennady', 'agent-inbox', 'config.json')
    );
  });
});
