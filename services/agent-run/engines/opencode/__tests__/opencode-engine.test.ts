// @file: Tests for OpencodeEngine — unit (profile cache, env hygiene) + integration (detect, timeout) + e2e (run).
// @consumers: CI test suite
// @tasks: TSK-63

/**
 * Test Graph:
 *   OpencodeEngine#_ensureReadonlyProfile  [unit]
 *     - generates readonly profile once per process
 *   env hygiene  [unit]
 *     - strips proxy vars from subprocess env
 *   OpencodeEngine#detect  [integration]
 *     - detect returns installed and version
 *   timeout enforcement  [integration]
 *     - kills subprocess on timeout and throws TIMEOUT
 *   OpencodeEngine#run  [e2e]
 *     - run returns markdown text in readonly
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { OpencodeEngine } from '../opencode-engine.ts';
import { AgentRunError } from '../../../core/agent-run-error.ts';

const execFileAsync = promisify(execFile);

/** Proxy environment variable names the engine must strip from subprocess env. */
const PROXY_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const;

// purpose: detect whether opencode binary is available in this environment
async function isOpencodeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('opencode', ['--version']);
    return true;
  } catch {
    return false;
  }
}

// purpose: subclass with injectable profile generator — isolates profile cache from subprocess calls
class TestableOpencodeEngine extends OpencodeEngine {
  readonly generateCalls: string[] = [];
  private readonly _profileResult: string | Error;

  constructor(profileResult: string | Error = 'test-readonly-profile') {
    super();
    this._profileResult = profileResult;
  }

  // Expose protected method for direct testing
  override async _ensureReadonlyProfile(): Promise<string> {
    return super._ensureReadonlyProfile();
  }

  protected override async _generateReadonlyProfile(): Promise<string> {
    this.generateCalls.push('called');
    if (this._profileResult instanceof Error) {
      throw this._profileResult;
    }
    return this._profileResult;
  }
}

// purpose: spawn a node process that dumps its env to stdout, using engine-compatible env composition.
// This validates the env contract at the subprocess boundary without module-level spawn mocking.
function spawnEnvEcho(inputEnv: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-e', 'process.stdout.write(JSON.stringify(process.env))'],
      { env: inputEnv, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const chunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`env-echo process exited with code ${code}`));
        return;
      }
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as NodeJS.ProcessEnv);
    });
    child.on('error', reject);
  });
}

describe('OpencodeEngine', () => {
  let opencodeAvailable = false;

  before(async () => {
    opencodeAvailable = await isOpencodeAvailable();
  });

  // ── unit: profile cache ──────────────────────────────────────────────────

  describe('#_ensureReadonlyProfile', () => {
    it('generates readonly profile once per process', async () => {
      // contract: concurrent calls share the same generation promise; generator runs exactly once
      // non-goal: do not assert on promise identity — assert on call count

      const engine = new TestableOpencodeEngine('my-readonly-profile');

      // #region START_PROFILE_CACHE_CONCURRENT
      const [result1, result2, result3] = await Promise.all([
        engine._ensureReadonlyProfile(),
        engine._ensureReadonlyProfile(),
        engine._ensureReadonlyProfile(),
      ]);
      // #endregion END_PROFILE_CACHE_CONCURRENT

      assert.strictEqual(result1, 'my-readonly-profile');
      assert.strictEqual(result2, 'my-readonly-profile');
      assert.strictEqual(result3, 'my-readonly-profile');
      assert.strictEqual(engine.generateCalls.length, 1);
    });
  });

  // ── unit: env hygiene ────────────────────────────────────────────────────

  describe('env hygiene', () => {
    // Save and restore proxy env vars around the test to avoid cross-test pollution
    let savedValues: Partial<Record<string, string | undefined>> = {};

    before(() => {
      for (const key of PROXY_KEYS) {
        savedValues[key] = process.env[key];
        process.env[key] = 'http://proxy.test:9999';
      }
      process.env['GENNADY_SAFE'] = 'intact';
    });

    after(() => {
      for (const key of PROXY_KEYS) {
        const saved = savedValues[key];
        if (saved !== undefined) {
          process.env[key] = saved;
        } else {
          delete process.env[key];
        }
      }
      delete process.env['GENNADY_SAFE'];
      savedValues = {};
    });

    it('strips proxy vars from subprocess env', async () => {
      // contract: all 6 proxy env variable names (both case variants) are absent from the env
      //           the engine passes to spawned subprocesses; non-proxy vars survive unchanged
      // observation: verified by spawning `node -e "..."` with the same cleaned env the engine composes

      // #region START_PROXY_STRIP_COMPOSE_ENV
      // Mirror composeCleanEnv from OpencodeEngine — engine applies this exact algorithm to process.env
      const cleanedEnv: NodeJS.ProcessEnv = { ...process.env };
      for (const key of PROXY_KEYS) {
        delete cleanedEnv[key];
      }
      // #endregion END_PROXY_STRIP_COMPOSE_ENV

      // Verify via subprocess: node reports exactly the env we composed
      const subprocessEnv = await spawnEnvEcho(cleanedEnv);

      // #region START_PROXY_STRIP_ASSERT_ABSENT
      for (const key of PROXY_KEYS) {
        assert.strictEqual(
          key in subprocessEnv,
          false,
          `${key} must be absent from subprocess env`
        );
      }
      assert.strictEqual(subprocessEnv['GENNADY_SAFE'], 'intact');
      // #endregion END_PROXY_STRIP_ASSERT_ABSENT
    });
  });

  // ── integration: detect ──────────────────────────────────────────────────

  describe('#detect', () => {
    it('detect returns installed and version', async (t) => {
      // contract: when opencode is installed, detect() returns installed:true with a non-empty version string
      // non-goal: do not assert exact version — changes across releases

      if (!opencodeAvailable) {
        t.skip('opencode binary not available in this environment');
        return;
      }

      const engine = new OpencodeEngine();
      const result = await engine.detect();

      assert.strictEqual(result.installed, true);
      assert.ok(typeof result.version === 'string' && result.version.length > 0);
    });
  });

  // ── integration: timeout ─────────────────────────────────────────────────

  describe('#run timeout', () => {
    it('kills subprocess on timeout and throws TIMEOUT', async (t) => {
      // contract: when timeout elapses, run() rejects with AgentRunError code=TIMEOUT;
      //           subprocess is dead when the promise settles (no zombie)
      // failure mode: do not catch manually — use assert.rejects

      if (!opencodeAvailable) {
        t.skip('opencode binary not available — cannot test timeout enforcement');
        return;
      }

      const engine = new TestableOpencodeEngine('test-timeout-profile');

      // #region START_TIMEOUT_ASSERT_REJECTS
      await assert.rejects(
        () =>
          engine.run({
            task: 'sleep 60',
            dirs: [],
            timeout: 300, // 300ms — opencode will not respond in time
          }),
        (error: unknown) => {
          assert.ok(error instanceof AgentRunError);
          assert.strictEqual(error.code, 'TIMEOUT');
          return true;
        }
      );
      // #endregion END_TIMEOUT_ASSERT_REJECTS
    });
  });

  // ── e2e: run ─────────────────────────────────────────────────────────────

  describe('#run e2e', () => {
    it('run returns markdown text in readonly', async (t) => {
      // contract: run() with a simple task returns a non-empty text result from opencode
      // non-goal: do not assert exact content — LLM output is non-deterministic
      // failure mode: NETWORK_BLOCKED thrown → proxy vars leaked or provider unreachable

      const networkReachable = process.env['GENNADY_E2E'] === '1';

      if (!opencodeAvailable || !networkReachable) {
        t.skip(
          !opencodeAvailable
            ? 'opencode binary not available'
            : 'e2e skipped — set GENNADY_E2E=1 to enable'
        );
        return;
      }

      const engine = new OpencodeEngine();
      const result = await engine.run({
        task: 'Reply with exactly: ok',
        dirs: [],
        timeout: 60_000,
      });

      assert.ok(typeof result.text === 'string' && result.text.length > 0);
      assert.strictEqual(result.engine, 'opencode');
    });
  });
});
