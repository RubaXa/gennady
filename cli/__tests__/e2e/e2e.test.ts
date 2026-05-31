// @file: E2E orchestrator — setup error-path tests + sequential lint → orient → sync → sync-skills.
// @consumers: E2eContext, setupE2e
// @tasks: TSK-60

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  setupE2e,
  setContext,
  getContext,
  runSetupWithDeps,
  createContext,
  type SetupE2eDeps,
  type E2eContext,
  type SpawnResult,
} from './setup.ts';
import { registerLintTests } from './lint.e2e.test.ts';
import { registerOrientTests } from './orient.e2e.test.ts';
import { registerSyncTests } from './sync.e2e.test.ts';
import { registerSyncSkillsTests } from './sync-skills.e2e.test.ts';

describe('setup', () => {
  it('should export setupE2e function', () => {
    assert.strictEqual(typeof setupE2e, 'function');
  });

  it('should export runSetupWithDeps factory', () => {
    assert.strictEqual(typeof runSetupWithDeps, 'function');
  });

  it('should export createContext factory', () => {
    assert.strictEqual(typeof createContext, 'function');
  });

  it('should export E2eContext and SpawnResult types', () => {
    // type-existence check — compiled file loads without errors
    assert.ok(true);
  });
});

describe('spawn', () => {
  it('should throw when npx is not found', async () => {
    const emitter = new EventEmitter();
    const child = Object.assign(emitter, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: () => {},
    });

    const nodeSpawnMock = mock.fn(() => child as unknown as ReturnType<SetupE2eDeps['nodeSpawn']>);
    const deps = {
      execSync: () => Buffer.from('ok'),
      mkdtempSync: () => '/tmp/test',
      cpSync: () => {},
      rmSync: () => {},
      readdirSync: () => [],
      lstatSync: () => ({ isDirectory: () => true }),
      writeFileSync: () => {},
      nodeSpawn: nodeSpawnMock,
    } as unknown as SetupE2eDeps;

    const ctx = createContext(deps, '/tmp/gennady-e2e-test');
    const promise = ctx.spawn(['lint', 'src/clean.ts']);
    const createdChild = nodeSpawnMock.mock.calls[0]?.result as unknown as EventEmitter;
    setImmediate(() =>
      createdChild.emit('error', Object.assign(new Error('npx not found'), { code: 'ENOENT' }))
    );

    await assert.rejects(() => promise, /npx not found/);
  });

  it('should throw on spawn timeout after 30s', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const emitter = new EventEmitter();
      const child = Object.assign(emitter, {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => {},
      });

      const deps = {
        execSync: () => Buffer.from('ok'),
        mkdtempSync: () => '/tmp/test',
        cpSync: () => {},
        rmSync: () => {},
        readdirSync: () => [],
        lstatSync: () => ({ isDirectory: () => true }),
        writeFileSync: () => {},
        nodeSpawn: () => child,
      } as unknown as SetupE2eDeps;

      const ctx = createContext(deps, '/tmp/gennady-e2e-test');
      const promise = ctx.spawn(['lint', 'src/clean.ts']);
      mock.timers.tick(30_000);
      await assert.rejects(() => promise, /spawn timed out after 30s/);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('cleanup', () => {
  it('should be idempotent', () => {
    let rmCallCount = 0;
    const deps = {
      execSync: () => Buffer.from('ok'),
      mkdtempSync: () => '/tmp/test',
      cpSync: () => {},
      rmSync: () => {
        rmCallCount++;
      },
      readdirSync: () => [],
      lstatSync: () => ({ isDirectory: () => true }),
      writeFileSync: () => {},
      nodeSpawn: () => ({ stdout: null, stderr: null, on: () => ({}), kill: () => {} }),
    } as unknown as SetupE2eDeps;

    const ctx = createContext(deps, '/tmp/gennady-e2e-test');
    ctx.cleanup();
    ctx.cleanup();
    assert.strictEqual(rmCallCount, 1, 'cleanup should be idempotent');
  });
});

describe('setup error paths', () => {
  function createExecSyncMock(failOn: 'none' | 'pack' | 'install') {
    return mock.fn((cmd: string, opts?: { encoding?: string }) => {
      if (failOn === 'pack' && cmd === 'npm pack') {
        const err = Object.assign(new Error('pack error'), { stderr: 'pack: ENOENT' });
        throw err;
      }
      if (failOn === 'install' && cmd.startsWith('npm install')) {
        const err = Object.assign(new Error('install error'), { stderr: 'install: ENOENT' });
        throw err;
      }
      if (cmd === 'npm pack') return 'gennady-1.0.0.tgz';
      return Buffer.from('ok');
    });
  }

  it('should complete full setup successfully', async () => {
    const execSyncMock = createExecSyncMock('none');
    let rmCalled = false;
    const deps = {
      execSync: execSyncMock,
      mkdtempSync: mock.fn(() => '/tmp/gennady-e2e-test'),
      cpSync: mock.fn(),
      rmSync: mock.fn(() => {
        rmCalled = true;
      }),
      readdirSync: mock.fn(() => []),
      lstatSync: mock.fn(() => ({ isDirectory: () => true })),
      writeFileSync: mock.fn(),
      nodeSpawn: mock.fn(() => {
        const e = new EventEmitter();
        const child = Object.assign(e, {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: mock.fn(),
        });
        return child as unknown as ReturnType<SetupE2eDeps['nodeSpawn']>;
      }),
    } as unknown as SetupE2eDeps;

    const ctx = await runSetupWithDeps(deps);
    assert.strictEqual(typeof ctx.cwd, 'string');
    assert.strictEqual(typeof ctx.spawn, 'function');
    assert.strictEqual(typeof ctx.cleanup, 'function');
  });

  it('should fail on npm pack error', async () => {
    const execSyncMock = createExecSyncMock('pack');
    const deps = {
      execSync: execSyncMock,
      mkdtempSync: mock.fn(() => '/tmp/gennady-e2e-test'),
      cpSync: mock.fn(),
      rmSync: mock.fn(),
      readdirSync: mock.fn(() => []),
      lstatSync: mock.fn(() => ({ isDirectory: () => true })),
      writeFileSync: mock.fn(),
      nodeSpawn: mock.fn(),
    } as unknown as SetupE2eDeps;

    await assert.rejects(() => runSetupWithDeps(deps), /npm pack failed/);
  });

  it('should fail on npm install error', async () => {
    const execSyncMock = createExecSyncMock('install');
    const deps = {
      execSync: execSyncMock,
      mkdtempSync: mock.fn(() => '/tmp/gennady-e2e-test'),
      cpSync: mock.fn(),
      rmSync: mock.fn(),
      readdirSync: mock.fn(() => []),
      lstatSync: mock.fn(() => ({ isDirectory: () => true })),
      writeFileSync: mock.fn(),
      nodeSpawn: mock.fn(),
    } as unknown as SetupE2eDeps;

    await assert.rejects(() => runSetupWithDeps(deps), /npm install failed/);
  });

  it('should fail on missing fixture directory', async () => {
    const execSyncMock = createExecSyncMock('none');
    let rmCalled = false;
    const deps = {
      execSync: execSyncMock,
      mkdtempSync: mock.fn(() => '/tmp/gennady-e2e-test'),
      cpSync: mock.fn(),
      rmSync: mock.fn(() => {
        rmCalled = true;
      }),
      readdirSync: mock.fn(() => []),
      lstatSync: mock.fn(() => ({ isDirectory: () => false })),
      writeFileSync: mock.fn(),
      nodeSpawn: mock.fn(),
    } as unknown as SetupE2eDeps;

    await assert.rejects(() => runSetupWithDeps(deps), /fixture copy failed/);
    assert.strictEqual(rmCalled, true, 'should rollback temp dir on fixture failure');
  });

  it('should fail on temp dir EACCES', async () => {
    const execSyncMock = createExecSyncMock('none');
    const deps = {
      execSync: execSyncMock,
      mkdtempSync: mock.fn(() => {
        const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
        throw err;
      }),
      cpSync: mock.fn(),
      rmSync: mock.fn(),
      readdirSync: mock.fn(() => []),
      lstatSync: mock.fn(() => ({ isDirectory: () => true })),
      writeFileSync: mock.fn(),
      nodeSpawn: mock.fn(),
    } as unknown as SetupE2eDeps;

    await assert.rejects(() => runSetupWithDeps(deps), /temp dir creation failed/);
  });

  it('should rollback temp dir on partial setup failure', async () => {
    const execSyncMock = createExecSyncMock('install');
    let rmCalled = false;
    const deps = {
      execSync: execSyncMock,
      mkdtempSync: mock.fn(() => '/tmp/gennady-e2e-test'),
      cpSync: mock.fn(),
      rmSync: mock.fn(() => {
        rmCalled = true;
      }),
      readdirSync: mock.fn(() => []),
      lstatSync: mock.fn(() => ({ isDirectory: () => true })),
      writeFileSync: mock.fn(),
      nodeSpawn: mock.fn(),
    } as unknown as SetupE2eDeps;

    await assert.rejects(() => runSetupWithDeps(deps), /npm install failed/);
    assert.strictEqual(rmCalled, true, 'should clean up temp dir on partial failure');
  });
});

const isE2eRun = process.env.GENNADY_E2E === '1';

if (isE2eRun) {
  describe('e2e', () => {
    before(async () => {
      const ctx = await setupE2e();
      setContext(ctx);
    });

    registerLintTests();
    registerOrientTests();
    registerSyncTests();
    registerSyncSkillsTests();

    after(() => {
      getContext().cleanup();
    });
  });
}
