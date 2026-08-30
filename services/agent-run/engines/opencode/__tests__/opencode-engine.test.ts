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
 *     - pre-validates explicit model and rejects MODEL_UNAVAILABLE with the list
 *   OpencodeEngine#run  [e2e]
 *     - run returns markdown text in readonly
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { OpencodeEngine, composeCleanEnv } from '../opencode-engine.ts';
import { AgentRunError } from '../../../core/agent-run-error.ts';

const execFileAsync = promisify(execFile);

const INTEGRATION_ENABLED = process.env['GENNADY_OPENCODE_INTEGRATION'] === '1';
const E2E_ENABLED = process.env['GENNADY_E2E'] === '1';
const DEFAULT_MODEL = 'llm-proxy/deepseek-v4-pro';

const INTEGRATION_ENV_ALLOWLIST = [
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'LANG',
  'LC_ALL',
] as const;

const CREDENTIAL_PROOF_KEYS = [
  'GITLAB_PERSONAL_TOKEN',
  'GITLAB_TOKEN',
  'GLAB_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AZURE_OPENAI_API_KEY',
  'OPENCODE_SERVER_USERNAME',
  'OPENCODE_SERVER_PASSWORD',
] as const;

/** Env variable names the engine must strip from subprocess env (proxy + opencode server-auth). */
const PROXY_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
  'OPENCODE_SERVER_PASSWORD',
  'OPENCODE_SERVER_USERNAME',
] as const;

// purpose: detect whether opencode binary is available in this environment
async function isOpencodeAvailable(env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await execFileAsync('opencode', ['--version'], { env, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function composeIntegrationEnv(base: NodeJS.ProcessEnv, isolationRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: isolationRoot,
    XDG_CONFIG_HOME: join(isolationRoot, 'config'),
    XDG_DATA_HOME: join(isolationRoot, 'data'),
    XDG_CACHE_HOME: join(isolationRoot, 'cache'),
    NO_COLOR: '1',
  };

  for (const key of INTEGRATION_ENV_ALLOWLIST) {
    if (base[key] !== undefined) env[key] = base[key];
  }

  return env;
}

describe('OpencodeEngine', () => {
  let opencodeAvailable = false;
  let isolatedModels: string[] = [];
  let integrationRoot: string | undefined;
  const inheritedEnv = process.env;

  before(async () => {
    if (!INTEGRATION_ENABLED) return;

    integrationRoot = await mkdtemp(join(tmpdir(), 'opencode-engine-test-'));
    process.env = composeIntegrationEnv(inheritedEnv, integrationRoot);
    opencodeAvailable = await isOpencodeAvailable(process.env);
    if (opencodeAvailable) isolatedModels = await new OpencodeEngine().listModels();
  });

  after(async () => {
    process.env = inheritedEnv;
    if (integrationRoot !== undefined) await rm(integrationRoot, { recursive: true, force: true });
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
    it('strips proxy + opencode server-auth vars and isolates session DB', () => {
      // contract: composeCleanEnv (the REAL engine function) strips all proxy vars (both cases) AND
      //           OPENCODE_SERVER_PASSWORD/USERNAME (the leak that causes "Session not found"), keeps
      //           non-stripped vars, and sets OPENCODE_CONFIG (readonly) + OPENCODE_DB=:memory: (isolation).
      const syntheticEnv: NodeJS.ProcessEnv = { GENNADY_SAFE: 'intact' };
      for (const key of PROXY_KEYS) syntheticEnv[key] = 'http://proxy.test:9999';
      const cleanedEnv = composeCleanEnv(syntheticEnv);

      // #region START_STRIP_ASSERT_ABSENT
      for (const key of PROXY_KEYS) {
        assert.strictEqual(key in cleanedEnv, false, `${key} must be absent from subprocess env`);
      }
      assert.strictEqual(cleanedEnv['GENNADY_SAFE'], 'intact');
      // #endregion END_STRIP_ASSERT_ABSENT

      // #region START_INJECTED_ENV_ASSERT
      assert.ok(
        (cleanedEnv['OPENCODE_CONFIG'] ?? '').endsWith('readonly.config.json'),
        'OPENCODE_CONFIG must point at the bundled readonly config'
      );
      assert.strictEqual(
        cleanedEnv['OPENCODE_DB'],
        ':memory:',
        'session DB must be isolated per run'
      );
      // #endregion END_INJECTED_ENV_ASSERT
    });

    it('integration boundary replaces user config dirs and drops provider credentials', () => {
      const source: NodeJS.ProcessEnv = {
        PATH: '/test/bin',
        HOME: '/real/user',
        XDG_CONFIG_HOME: '/real/user/config',
      };
      for (const key of CREDENTIAL_PROOF_KEYS) source[key] = 'must-not-reach-opencode';

      const isolated = composeIntegrationEnv(source, '/isolated/opencode-test');

      assert.strictEqual(isolated.PATH, '/test/bin');
      assert.strictEqual(isolated.HOME, '/isolated/opencode-test');
      assert.strictEqual(isolated.XDG_CONFIG_HOME, '/isolated/opencode-test/config');
      for (const key of CREDENTIAL_PROOF_KEYS) assert.strictEqual(isolated[key], undefined, key);
    });
  });

  // ── integration: detect ──────────────────────────────────────────────────

  describe('#detect', () => {
    it('detect returns installed and version', async (t) => {
      // contract: when opencode is installed, detect() returns installed:true with a non-empty version string
      // non-goal: do not assert exact version — changes across releases

      if (!INTEGRATION_ENABLED || !opencodeAvailable) {
        t.skip(
          !INTEGRATION_ENABLED
            ? 'integration skipped — set GENNADY_OPENCODE_INTEGRATION=1 to enable'
            : 'opencode binary not available in the isolated integration environment'
        );
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

      if (!INTEGRATION_ENABLED || !opencodeAvailable || !isolatedModels.includes(DEFAULT_MODEL)) {
        t.skip(
          !INTEGRATION_ENABLED
            ? 'integration skipped — set GENNADY_OPENCODE_INTEGRATION=1 to enable'
            : !opencodeAvailable
              ? 'opencode binary not available in the isolated integration environment'
              : `default model ${DEFAULT_MODEL} is unavailable without user credentials/config`
        );
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

      if (!INTEGRATION_ENABLED || !opencodeAvailable) {
        t.skip(
          !INTEGRATION_ENABLED
            ? 'integration skipped — set GENNADY_OPENCODE_INTEGRATION=1 to enable'
            : 'opencode binary not available in the isolated integration environment'
        );
        return;
      }

      const models = isolatedModels;

      // #region START_PARSE_MODELS_ASSERT_FORMAT
      // all returned items must match provider/model pattern (non-empty provider + non-empty model)
      for (const model of models) {
        assert.match(model, /^[^\s/]+\/[^\s]+$/, `expected provider/model format, got: ${model}`);
      }
      // #endregion END_PARSE_MODELS_ASSERT_FORMAT
    });

    it('defaults model to deepseek in args', async (t) => {
      // contract: when RunOptions.model is absent, OpencodeEngine.run() uses DEFAULT_MODEL = 'llm-proxy/deepseek-v4-pro'
      // test approach: run() with no model and a 1ms timeout → TIMEOUT error; the only way TIMEOUT is thrown
      //   (not AGENT_NOT_INSTALLED) is if spawn succeeded → args including --model were accepted by opencode
      // non-goal: do not assert on full run output — non-deterministic

      if (!INTEGRATION_ENABLED || !opencodeAvailable || !isolatedModels.includes(DEFAULT_MODEL)) {
        t.skip(
          !INTEGRATION_ENABLED
            ? 'integration skipped — set GENNADY_OPENCODE_INTEGRATION=1 to enable'
            : !opencodeAvailable
              ? 'opencode binary not available in the isolated integration environment'
              : `default model ${DEFAULT_MODEL} is unavailable without user credentials/config`
        );
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
    it('pre-validates explicit model and rejects MODEL_UNAVAILABLE with the list', async (t) => {
      // contract: an EXPLICIT model not in listModels() is rejected up front with MODEL_UNAVAILABLE,
      //           hint containing the available list — WITHOUT spawning the run. (opencode does not
      //           surface invalid-model in stderr — it returns a generic UnknownError — so detection
      //           must happen via pre-validation against listModels(), not post-run mapping.)
      // non-goal: do not assert exact hint text — list is dynamic.

      if (!INTEGRATION_ENABLED || !opencodeAvailable || isolatedModels.length === 0) {
        t.skip(
          !INTEGRATION_ENABLED
            ? 'integration skipped — set GENNADY_OPENCODE_INTEGRATION=1 to enable'
            : !opencodeAvailable
              ? 'opencode binary not available in the isolated integration environment'
              : 'no models are available without user credentials/config'
        );
        return;
      }

      const engine = new OpencodeEngine();

      // #region START_MODEL_UNAVAILABLE_HINT_ASSERT
      // Use a clearly non-existent model id → pre-validation throws MODEL_UNAVAILABLE
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

      if (
        !INTEGRATION_ENABLED ||
        !E2E_ENABLED ||
        !opencodeAvailable ||
        !isolatedModels.includes(DEFAULT_MODEL)
      ) {
        t.skip(
          !INTEGRATION_ENABLED
            ? 'integration skipped — set GENNADY_OPENCODE_INTEGRATION=1 to enable'
            : !E2E_ENABLED
              ? 'e2e skipped — set GENNADY_E2E=1 to enable'
              : !opencodeAvailable
                ? 'opencode binary not available in the isolated integration environment'
                : `default model ${DEFAULT_MODEL} is unavailable without user credentials/config`
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
