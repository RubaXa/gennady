// @file: OpencodeEngine — AgentEngine adapter for opencode subprocess execution.
// @consumers: index.ts (composition root)
// @tasks: TSK-63, TSK-64

import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { logger } from '#logger';
import { AgentRunError } from '../../core/agent-run-error.ts';
import type { AgentEngine } from '../../core/ports/agent-engine.port.ts';
import type { RunOptions, RunResult } from '../../core/run-options.type.ts';
import { opencodeErrorMap } from './opencode-error-map.ts';

const execFileAsync = promisify(execFile);

/** @purpose Proxy-related env variable names to strip from subprocess environment (both case variants). */
const PROXY_ENV_VARS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const;

/** @purpose Name of the readonly agent defined in the bundled config; passed as `--agent`. */
const READONLY_AGENT = 'readonly';

/**
 * @purpose Absolute path to the bundled static opencode config that defines the `readonly` agent
 *   (denies edit/write/patch; everything else — including bash — stays allowed). Merged into the
 *   user's opencode config via the `OPENCODE_CONFIG` env var, so providers/credentials are preserved.
 * @invariant Static file shipped with the package next to this module (no runtime generation, no AI).
 */
const READONLY_CONFIG_PATH = fileURLToPath(new URL('./readonly.config.json', import.meta.url));

/** @purpose Grace period in ms between SIGTERM and SIGKILL on timeout. */
const SIGKILL_GRACE_MS = 5_000;

/**
 * @purpose Default model identifier used when `RunOptions.model` is absent.
 * @invariant Must be a valid `provider/model` string recognized by the opencode llm-proxy provider.
 */
const DEFAULT_MODEL = 'llm-proxy/deepseek-v4-pro';

// invariant: matches `provider/model` lines emitted by `opencode models`; excludes headers and blank lines
const MODELS_LINE_PATTERN = /^[^\s/]+\/[^\s]+$/;

/**
 * @purpose Compose subprocess environment without proxy variables.
 * @param base Source environment record (typically `process.env`).
 * @returns New env record with all 6 proxy variable names deleted.
 */
function composeCleanEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of PROXY_ENV_VARS) {
    delete env[key];
  }
  // invariant: point opencode at the bundled readonly-agent config; merges with the user's
  // global config (providers/credentials preserved), adds the `readonly` agent.
  env.OPENCODE_CONFIG = READONLY_CONFIG_PATH;
  return env;
}

/**
 * @purpose opencode adapter: executes `opencode run` in readonly mode, maps failures to typed errors.
 * @implements {AgentEngine} in services/agent-run/core/ports/agent-engine.port.ts
 * @invariant Readonly enforced via the bundled static config (OPENCODE_CONFIG + `--agent readonly`); no runtime profile generation.
 * @invariant Subprocess env never contains proxy variables; subprocess is guaranteed dead when run() settles.
 * @invariant Optimistic launch: `detect()` is NOT called on the hot path; spawn ENOENT/EACCES → AGENT_NOT_INSTALLED.
 */
export class OpencodeEngine implements AgentEngine {
  /** @purpose Stable engine identifier for registry lookup and result tagging | @invariant 'opencode' */
  readonly id = 'opencode';

  /**
   * @purpose Probe whether the opencode binary is installed and retrieve its version.
   * @returns Installation status; `version` is present only when the binary responds to `--version`.
   */
  async detect(): Promise<{ installed: boolean; version?: string }> {
    logger.debug('[OpencodeEngine#detect] [idle → probing]');

    // #region START_VERSION_PROBE — failure mode: ENOENT/EACCES → installed:false; unexpected error degrades gracefully
    try {
      const { stdout } = await execFileAsync('opencode', ['--version']);
      const version = stdout.trim() || undefined;
      logger.info(`[OpencodeEngine#detect] [probing → installed] version=${version ?? 'unknown'}`);
      return { installed: true, version };
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES') {
        logger.info('[OpencodeEngine#detect] [probing → not-installed]');
        return { installed: false };
      }
      logger.error('[OpencodeEngine#detect] [probing → failed] unexpected error', { cause });
      return { installed: false };
    }
    // #endregion END_VERSION_PROBE
  }

  /**
   * @purpose Execute opencode with the provided task and return the markdown response.
   * @param options Resolved run options including task, dirs, mode, and timeout.
   * @throws {AgentRunError} On any engine failure; does not write to disk (readonly contract).
   * @returns Markdown response text and the engine id that produced it.
   */
  async run(options: RunOptions): Promise<RunResult> {
    const { task, dirs = [], timeout = 1_800_000, model = DEFAULT_MODEL } = options;
    logger.debug(
      `[OpencodeEngine#run] [idle → preparing] timeout=${timeout} dirs=${dirs.length} model=${model}`
    );

    // invariant: readonly enforced via bundled static config (see composeCleanEnv → OPENCODE_CONFIG)
    const agentProfile = READONLY_AGENT;

    // #region START_COMPOSE_TASK
    // non-goal: external_directory deferred to v1+ spike; first dir is --dir, rest appended to task text
    const primaryDir = dirs[0];
    const extraDirs = dirs.slice(1);
    const taskText =
      extraDirs.length > 0
        ? `${task}\n\nAdditional directories:\n${extraDirs.map((d) => `- ${d}`).join('\n')}`
        : task;
    // #endregion END_COMPOSE_TASK

    const args: string[] = ['run', taskText, '--agent', agentProfile, '--model', model];
    if (primaryDir !== undefined) {
      args.push('--dir', primaryDir);
    }

    const cleanEnv = composeCleanEnv(process.env);

    logger.debug(`[OpencodeEngine#run] [preparing → spawning] agent=${agentProfile}`);

    // #region START_SUBPROCESS_RUN — invariant: process guaranteed dead when promise settles (SIGTERM→SIGKILL on timeout)
    return new Promise<RunResult>((resolve, reject) => {
      let settled = false;
      // invariant: set before SIGTERM; prevents close handler from winning the rejection race
      let timedOut = false;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const child = spawn('opencode', args, {
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // #region START_SPAWN_ERROR_HANDLING — failure mode: ENOENT/EACCES → AGENT_NOT_INSTALLED via error-map
      child.on('error', (spawnError) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        const mapping = opencodeErrorMap({
          spawnErrorCode: (spawnError as NodeJS.ErrnoException).code,
        });
        logger.error(`[OpencodeEngine#run] [spawning → failed] code=${mapping.code}`, {
          cause: spawnError,
        });
        reject(new AgentRunError(mapping.code, mapping.hint));
      });
      // #endregion END_SPAWN_ERROR_HANDLING

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // #region START_PROCESS_EXIT_HANDLING — failure mode: non-zero exit → error-map → AgentRunError
      child.on('close', (exitCode) => {
        if (settled) return;
        if (timedOut) return; // timeout handler will settle with TIMEOUT; do not race it
        settled = true;
        clearTimeout(killTimer);

        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');

        if (exitCode === 0) {
          logger.info('[OpencodeEngine#run] [spawning → completed]');
          resolve({ text: stdout, engine: 'opencode' });
          return;
        }

        const mapping = opencodeErrorMap({ exitCode: exitCode ?? undefined, stderr });
        logger.error(
          `[OpencodeEngine#run] [spawning → failed] exit=${exitCode} code=${mapping.code}`,
          { stderr }
        );

        // #region START_MODEL_UNAVAILABLE_HINT_ENRICHMENT — invariant: enriched async; rejection deferred until list resolves
        if (mapping.code === 'MODEL_UNAVAILABLE') {
          this.listModels()
            .then((models) => {
              const listText =
                models.length > 0
                  ? `Available models:\n${models.map((m) => `  - ${m}`).join('\n')}`
                  : 'No models available via listModels().';
              reject(new AgentRunError('MODEL_UNAVAILABLE', `${mapping.hint}\n\n${listText}`));
            })
            .catch(() => {
              reject(new AgentRunError(mapping.code, mapping.hint));
            });
          return;
        }
        // #endregion END_MODEL_UNAVAILABLE_HINT_ENRICHMENT

        reject(new AgentRunError(mapping.code, mapping.hint));
      });
      // #endregion END_PROCESS_EXIT_HANDLING

      // #region START_TIMEOUT_ENFORCEMENT — invariant: SIGTERM first, then SIGKILL after grace; engine throws TIMEOUT directly (not via error-map)
      const killTimer = setTimeout(() => {
        if (settled) return;
        timedOut = true; // must be set before kill() so the close handler yields
        logger.warn(`[OpencodeEngine#run] [spawning → timeout] sending SIGTERM timeout=${timeout}`);
        child.kill('SIGTERM');

        const sigkillTimer = setTimeout(() => {
          if (!child.killed) {
            logger.warn(
              '[OpencodeEngine#run] [timeout → sigkill] process did not exit after SIGTERM'
            );
            child.kill('SIGKILL');
          }
        }, SIGKILL_GRACE_MS);

        // settled flag prevents double-resolve; close event fires after kill
        child.on('close', () => {
          clearTimeout(sigkillTimer);
          if (!settled) {
            settled = true;
            logger.error('[OpencodeEngine#run] [timeout → rejected] AgentRunError TIMEOUT');
            reject(new AgentRunError('TIMEOUT', `opencode run exceeded timeout of ${timeout}ms`));
          }
        });
      }, timeout);
      // #endregion END_TIMEOUT_ENFORCEMENT
    });
    // #endregion END_SUBPROCESS_RUN
  }

  /**
   * @purpose Retrieve the list of model identifiers available via `opencode models`.
   * @invariant Never throws; returns `[]` on non-zero exit or any unexpected error.
   * @returns Array of `provider/model` strings; empty on failure.
   * @sideEffect Spawns `opencode models` subprocess.
   */
  async listModels(): Promise<string[]> {
    logger.debug('[OpencodeEngine#listModels] [idle → retrieving]');

    // #region START_LIST_MODELS_PARSE — failure mode: non-zero exit or parse error → [] (degraded)
    try {
      const { stdout } = await execFileAsync('opencode', ['models']);
      const models = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => MODELS_LINE_PATTERN.test(line));
      logger.debug(`[OpencodeEngine#listModels] [retrieving → done] count=${models.length}`);
      return models;
    } catch (cause) {
      logger.error(
        '[OpencodeEngine#listModels] [retrieving → degraded] opencode models failed; returning []',
        {
          cause,
        }
      );
      return [];
    }
    // #endregion END_LIST_MODELS_PARSE
  }
}
