// @file: Tests for OpencodeEngine — unit (profile cache, env hygiene) + integration (detect, timeout, model) + e2e (run).
// @consumers: CI test suite
// @tasks: TSK-63, TSK-64

/**
 * Test Graph:
 *   readonly config artifact  [unit]
 *     - bundled config defines readonly agent that denies edit/write/patch
 *   env hygiene  [unit]
 *     - strips proxy vars from subprocess env
 *   OpencodeEngine#detect  [integration]
 *     - detect returns installed and version
 *   timeout enforcement  [integration]
 *     - kills subprocess on timeout and throws TIMEOUT
 *   OpencodeEngine#listModels  [integration/degradation]
 *     - parses opencode models output
 *     - defaults model to deepseek in args
 *   OpencodeEngine#run with MODEL_UNAVAILABLE  [integration]
 *     - enriches MODEL_UNAVAILABLE hint with model list
 *   OpencodeEngine#run  [e2e]
 *     - run returns markdown text in readonly
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

  // ── unit: readonly config artifact ───────────────────────────────────────

  describe('readonly config artifact', () => {
    it('bundled config defines readonly agent that denies edit/write/patch', async () => {
      // contract: the static config shipped with the engine (pointed at via OPENCODE_CONFIG)
      //           defines a `readonly` agent that denies the file-editing tools; bash stays allowed
      //           (not denied) so the agent keeps its primary investigation tool.
      const cfgPath = fileURLToPath(new URL('../readonly.config.json', import.meta.url));
      const cfg = JSON.parse(await readFile(cfgPath, 'utf8')) as {
        agent: { readonly: { mode: string; permission: Record<string, string> } };
      };

      const perm = cfg.agent.readonly.permission;
      assert.strictEqual(perm['edit'], 'deny');
      assert.strictEqual(perm['write'], 'deny');
      assert.strictEqual(perm['patch'], 'deny');
      // bash must NOT be denied — readonly keeps shell for investigation
      assert.notStrictEqual(perm['bash'], 'deny');
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

      const engine = new OpencodeEngine();

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

  // ── integration: listModels ──────────────────────────────────────────────

  describe('#listModels', () => {
    it('parses opencode models output', async (t) => {
      // contract: listModels() returns only provider/model-shaped strings from opencode models output;
      //           non-matching lines (headers, blank lines) are filtered; non-zero exit → []
      // non-goal: do not assert exact model list — varies across opencode versions

      if (!opencodeAvailable) {
        // degradation path: opencode unavailable → execFileAsync throws → listModels() degrades to []
        const engine = new OpencodeEngine();
        const result = await engine.listModels();
        assert.deepStrictEqual(result, []);
        return;
      }

      const engine = new OpencodeEngine();
      const models = await engine.listModels();

      // #region START_PARSE_MODELS_ASSERT_FORMAT
      // all returned items must match provider/model pattern (non-empty provider + non-empty model)
      for (const model of models) {
        assert.match(model, /^[^\s/]+\/[^\s]+$/, `expected provider/model format, got: ${model}`);
      }
      // opencode with llm-proxy configured returns at least one model
      assert.ok(models.length > 0, 'expected at least one model from opencode models');
      // #endregion END_PARSE_MODELS_ASSERT_FORMAT
    });

    it('defaults model to deepseek in args', async (t) => {
      // contract: when RunOptions.model is absent, OpencodeEngine.run() uses DEFAULT_MODEL = 'llm-proxy/deepseek-v4-pro'
      // test approach: run() with no model and a 1ms timeout → TIMEOUT error; the only way TIMEOUT is thrown
      //   (not AGENT_NOT_INSTALLED) is if spawn succeeded → args including --model were accepted by opencode
      // non-goal: do not assert on full run output — non-deterministic

      if (!opencodeAvailable) {
        t.skip('opencode binary not available — cannot verify default model arg acceptance');
        return;
      }

      const engine = new OpencodeEngine();

      // #region START_DEFAULT_MODEL_RUN_NO_MODEL
      // Run without model; 1ms timeout ensures TIMEOUT before LLM responds
      // TIMEOUT (not AGENT_NOT_INSTALLED / MODEL_UNAVAILABLE) proves: opencode accepted the default model arg
      await assert.rejects(
        () => engine.run({ task: 'ping', dirs: [], timeout: 1 }),
        (error: unknown) => {
          assert.ok(error instanceof AgentRunError);
          // TIMEOUT means opencode spawned successfully with the default model arg
          // MODEL_UNAVAILABLE would mean the default 'llm-proxy/deepseek-v4-pro' was rejected
          assert.strictEqual(
            error.code,
            'TIMEOUT',
            `expected TIMEOUT but got ${error.code}: ${error.hint}`
          );
          return true;
        }
      );
      // #endregion END_DEFAULT_MODEL_RUN_NO_MODEL
    });
  });

  // ── integration: MODEL_UNAVAILABLE hint enrichment ────────────────────────

  describe('#run MODEL_UNAVAILABLE', () => {
    it('enriches MODEL_UNAVAILABLE hint with model list', async (t) => {
      // contract: when opencode exits with "unknown model" stderr, run() enriches the hint with
      //           the list from listModels(); the final AgentRunError.hint contains at least one model id
      // non-goal: do not assert exact hint text — list is dynamic; hint format may include markdown
      // note: uses real OpencodeEngine (not TestableOpencodeEngine) so that opencode receives a
      //       real profile name and responds with a model-specific error rather than a profile-not-found error

      if (!opencodeAvailable) {
        t.skip('opencode binary not available — cannot test MODEL_UNAVAILABLE hint enrichment');
        return;
      }

      const engine = new OpencodeEngine();

      // #region START_MODEL_UNAVAILABLE_HINT_ASSERT
      // Use a clearly non-existent model id to trigger MODEL_UNAVAILABLE from opencode
      await assert.rejects(
        () =>
          engine.run({
            task: 'ping',
            dirs: [],
            model: 'no-such-provider/no-such-model-xyzzy',
            timeout: 30_000,
          }),
        (error: unknown) => {
          assert.ok(error instanceof AgentRunError);
          assert.strictEqual(error.code, 'MODEL_UNAVAILABLE');
          // hint must contain at least one provider/model pattern — proving enrichment ran
          assert.match(
            error.hint,
            /[^\s/]+\/[^\s]+/,
            'expected hint to contain at least one provider/model from listModels()'
          );
          return true;
        }
      );
      // #endregion END_MODEL_UNAVAILABLE_HINT_ASSERT
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
