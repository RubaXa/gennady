// @file: OpencodeEngine — AgentEngine adapter for opencode subprocess execution.
// @consumers: index.ts (composition root)
// @tasks: TSK-63

import { execFile, spawn } from 'node:child_process';
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

/** @purpose Allow-list of permissions for the readonly opencode agent profile. */
const READONLY_PERMISSIONS = 'read,glob,grep,webfetch,websearch,lsp';

/** @purpose Grace period in ms between SIGTERM and SIGKILL on timeout. */
const SIGKILL_GRACE_MS = 5_000;

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
  return env;
}

/**
 * @purpose opencode adapter: executes `opencode run` in readonly mode, maps failures to typed errors.
 * @implements {AgentEngine} in services/agent-run/core/ports/agent-engine.port.ts
 * @invariant Profile generated at most once per process lifetime (lazy singleton cache + promise guard).
 * @invariant Subprocess env never contains proxy variables; subprocess is guaranteed dead when run() settles.
 * @invariant Optimistic launch: `detect()` is NOT called on the hot path; spawn ENOENT/EACCES → AGENT_NOT_INSTALLED.
 */
export class OpencodeEngine implements AgentEngine {
  /** @purpose Stable engine identifier for registry lookup and result tagging | @invariant 'opencode' */
  readonly id = 'opencode';

  /** @purpose Cached readonly agent profile name; null = not yet generated. */
  protected _readonlyProfile: string | null = null;

  /** @purpose Promise guard ensuring profile is generated exactly once even under concurrent run() calls. */
  protected _profileGeneration: Promise<string> | null = null;

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
    const { task, dirs = [], timeout = 120_000 } = options;
    logger.debug(`[OpencodeEngine#run] [idle → preparing] timeout=${timeout} dirs=${dirs.length}`);

    // invariant: generated at most once per process (lazy cache + promise guard)
    const agentProfile = await this._ensureReadonlyProfile();

    // #region START_COMPOSE_TASK
    // non-goal: external_directory deferred to v1+ spike; first dir is --dir, rest appended to task text
    const primaryDir = dirs[0];
    const extraDirs = dirs.slice(1);
    const taskText =
      extraDirs.length > 0
        ? `${task}\n\nAdditional directories:\n${extraDirs.map((d) => `- ${d}`).join('\n')}`
        : task;
    // #endregion END_COMPOSE_TASK

    const args: string[] = ['run', taskText, '--agent', agentProfile];
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
   * @purpose Ensure the readonly agent profile exists, generating it at most once per process.
   * @invariant Promise-guarded: concurrent callers receive the same generation promise.
   * @throws {AgentRunError} With code `LAUNCH_FAILED` when `opencode agent create` fails.
   * @returns The agent profile name to pass as `--agent <name>`.
   */
  protected async _ensureReadonlyProfile(): Promise<string> {
    if (this._readonlyProfile !== null) {
      return this._readonlyProfile;
    }

    // invariant: only one concurrent generation allowed
    this._profileGeneration ??= this._generateReadonlyProfile();

    // #region START_PROFILE_CACHE_ON_SUCCESS — failure mode: reset promise on error so next call can retry
    try {
      const name = await this._profileGeneration;
      this._readonlyProfile = name;
      return name;
    } catch (cause) {
      this._profileGeneration = null;
      throw cause;
    }
    // #endregion END_PROFILE_CACHE_ON_SUCCESS
  }

  /**
   * @purpose Run `opencode agent create` with the readonly permissions allow-list.
   * @throws {AgentRunError} With code `LAUNCH_FAILED` on non-zero exit from `agent create`.
   * @returns The profile name captured from stdout.
   * @sideEffect Spawns `opencode agent create` subprocess; profile persists for process lifetime.
   */
  protected async _generateReadonlyProfile(): Promise<string> {
    logger.info(
      '[OpencodeEngine#_generateReadonlyProfile] [idle → creating] readonly agent profile'
    );

    // #region START_AGENT_CREATE — failure mode: non-zero exit → LAUNCH_FAILED (profile generation failure)
    try {
      const { stdout, stderr } = await execFileAsync('opencode', [
        'agent',
        'create',
        '--permissions',
        READONLY_PERMISSIONS,
      ]);

      const profileName = stdout.trim();
      if (!profileName) {
        const mapping = opencodeErrorMap({ stderr });
        throw new AgentRunError(mapping.code, mapping.hint);
      }

      logger.info(
        `[OpencodeEngine#_generateReadonlyProfile] [creating → created] profile=${profileName}`
      );
      return profileName;
    } catch (cause) {
      if (cause instanceof AgentRunError) throw cause;

      const execError = cause as { code?: number; stderr?: string; message?: string };
      const stderrText = execError.stderr ?? '';
      const mapping = opencodeErrorMap({ exitCode: execError.code, stderr: stderrText });
      const error = new AgentRunError(
        mapping.code,
        `[OpencodeEngine#_generateReadonlyProfile] agent create failed: ${mapping.hint}`
      );
      logger.error('[OpencodeEngine#_generateReadonlyProfile] [creating → failed]', { cause });
      throw error;
    }
    // #endregion END_AGENT_CREATE
  }
}
