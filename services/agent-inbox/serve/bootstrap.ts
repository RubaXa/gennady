// @file: Bootstrap — DI composition for agent-inbox serve: creates all services, wires them together.
// @consumers: gennady inbox serve CLI, e2e tests
// @tasks: TSK-115, TSK-117, TSK-122, TSK-123

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { logger } from '#logger';
import { StateStore } from '../modules/inbox-core/state-store.ts';
import { VcsInboxMock } from '../modules/inbox-core/vcs-inbox.mock.ts';
import { VcsInboxReal } from '../modules/inbox-core/vcs-inbox.real.ts';
import type { VcsInboxPort } from '../modules/inbox-core/vcs-inbox.port.ts';
import { OpenCodeMock } from '../modules/inbox-opencode/opencode.mock.ts';
import { OpenCodeReal } from '../modules/inbox-opencode/opencode.real.ts';
import {
  OpenCodePort,
  type CreateSessionOpts,
  type PromptOpts,
  type SessionHandle,
  type SessionStatus,
} from '../modules/inbox-opencode/opencode.port.ts';
import { composeError, type OpenCodeCallResult } from '../modules/inbox-opencode/errors.ts';
import { RoleEngine } from '../modules/inbox-roles/role-engine.ts';
import { RoleScheduler } from '../modules/inbox-roles/role-scheduler.ts';
import { SessionPool } from '../modules/inbox-opencode/session-pool.ts';
import { HttpServer } from '../modules/inbox-api/http-server.ts';
import { BoardProviderMock } from '../modules/inbox-api/board-provider.mock.ts';
import { BoardProviderReal } from '../modules/inbox-api/board-provider.real.ts';
import { seedDevData } from '../modules/inbox-serve/dev-seed.ts';
import { setDryRun, isDryRun } from '../modules/inbox-core/dry-run.ts';

// ═══════════════════════════════════════════════════════════════
// Degraded OpenCode adapter — returns SESSION_ERROR for all prompts.
// ═══════════════════════════════════════════════════════════════

/**
 * @purpose Degraded OpenCode adapter returning SESSION_ERROR for all prompts.
 * Keeps HTTP server and dashboard available when real opencode is unreachable.
 * @implements {OpenCodePort} in ../modules/inbox-opencode/opencode.port.ts
 */
class DegradedOpencode extends OpenCodePort {
  protected _seq = 0;

  async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
    const sid = `degraded-${++this._seq}`;
    logger.warn(`[DegradedOpencode#createSession] [degraded] ${sid} "${opts.title}"`);
    return { sid, title: opts.title, directory: opts.directory, status: 'idle' };
  }

  async prompt(sid: string, _opts: PromptOpts): Promise<OpenCodeCallResult> {
    logger.warn(`[DegradedOpencode#prompt] [degraded] ${sid} — AI engine unavailable`);
    return composeError(
      'SESSION_ERROR',
      'AI engine is in degraded mode — opencode server is not responding. Start opencode and restart gennady inbox serve.'
    );
  }

  async status(_sid: string): Promise<SessionStatus> {
    return 'terminated';
  }

  async continueSignal(sid: string, _opts: PromptOpts): Promise<OpenCodeCallResult> {
    logger.warn(`[DegradedOpencode#continueSignal] [degraded] ${sid}`);
    return composeError(
      'SESSION_ERROR',
      'AI engine is in degraded mode — opencode server unavailable'
    );
  }

  async abort(_sid: string): Promise<void> {
    /* no-op in degraded mode */
  }

  async close(_sid: string): Promise<void> {
    /* no-op in degraded mode */
  }
}

// ═══════════════════════════════════════════════════════════════
// Bootstrap helpers
// ═══════════════════════════════════════════════════════════════

/**
 * @purpose Ask the OS for an ephemeral free TCP port.
 * @invariant A fixed scan range exhausts under contention and races the later bind. `listen(0)`
 *   draws from the OS's full ephemeral pool instead.
 * @returns An OS-assigned free port number.
 */
async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : null;
      server.close(() => {
        if (port === null) {
          reject(new Error('[findFreePort] OS did not return a port number'));
        } else {
          resolve(port);
        }
      });
    });
  });
}

/**
 * @purpose Check whether the `opencode` binary is available in PATH.
 * @returns True if `which opencode` exits with code 0.
 */
function checkOpencodePath(): boolean {
  try {
    execSync('which opencode', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * @purpose Try to reach the opencode server health endpoint with retries.
 * @param maxRetries Number of connection attempts.
 * @param delayMs Delay in ms between attempts.
 * @returns True if the server responds with 2xx within the retry window.
 */
async function retryOpencodeConnect(
  port: number,
  maxRetries: number,
  delayMs: number
): Promise<boolean> {
  const url = `http://localhost:${port}/`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.debug(`[bootstrap] opencode health check attempt ${attempt}/${maxRetries}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        logger.info('[bootstrap] opencode server is reachable');
        return true;
      }
    } catch (cause) {
      logger.debug('[bootstrap] opencode health check failed', {
        attempt,
        error: (cause as Error).message,
      });
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.warn('[bootstrap] opencode server unreachable after all retries');
  return false;
}

/**
 * @purpose Spawn opencode serve child process, poll root until reachable.
 * Falls back to degraded mode after maxSpawnRetries failures.
 * @param maxHealthChecks Number of polls (default: 10, 500ms apart).
 * @param maxSpawnRetries Max spawn attempts before giving up (default: 3).
 * @returns ChildProcess on success, null on failure.
 */
async function spawnOpencode(
  cwd: string,
  port: number,
  maxHealthChecks: number = 10,
  maxSpawnRetries: number = 3
): Promise<ChildProcess | null> {
  for (let attempt = 1; attempt <= maxSpawnRetries; attempt++) {
    logger.info(
      `[bootstrap] spawning opencode serve on port ${port} (attempt ${attempt}/${maxSpawnRetries})`
    );

    let proc: ChildProcess;
    try {
      proc = spawn('opencode', ['serve', '--port', String(port)], {
        stdio: 'pipe',
        detached: false,
        cwd,
      });

      // Forward opencode stdout/stderr to logger for diagnostics
      proc.stdout?.on('data', (data: Buffer) => {
        logger.debug(`[opencode:stdout] ${data.toString().trim()}`);
      });
      proc.stderr?.on('data', (data: Buffer) => {
        logger.debug(`[opencode:stderr] ${data.toString().trim()}`);
      });
      proc.on('error', (err: Error) => {
        logger.warn('[bootstrap] opencode child process error', { error: err.message });
      });
    } catch (cause) {
      logger.warn('[bootstrap] failed to spawn opencode', {
        attempt,
        error: (cause as Error).message,
      });
      continue;
    }

    // Wait for the server to become reachable — poll root endpoint
    let healthy = false;
    for (let hc = 1; hc <= maxHealthChecks; hc++) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if process exited prematurely
      if (proc.exitCode !== null) {
        logger.warn('[bootstrap] opencode process exited early', {
          exitCode: proc.exitCode,
          attempt,
        });
        break;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`http://localhost:${port}/`, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.ok) {
          healthy = true;
          logger.info('[bootstrap] opencode serve is reachable (spawned)');
          break;
        }
      } catch {
        logger.debug(`[bootstrap] opencode health check ${hc}/${maxHealthChecks}`);
      }
    }

    if (healthy) {
      return proc;
    }

    // Spawn failed — kill the process and retry
    logger.warn('[bootstrap] opencode spawn attempt failed, killing process');
    try {
      proc.kill('SIGTERM');
    } catch {
      /* ignore kill errors */
    }
  }

  logger.warn('[bootstrap] opencode spawn failed after all retries');
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Bootstrap config & result types
// ═══════════════════════════════════════════════════════════════

/** @purpose Configuration for the bootstrap function. */
export type BootstrapConfig = {
  /** @purpose Whether to use mock adapters (dev/e2e) or real (production). */
  mocks: boolean;
  /** @purpose Port to listen on (default: 4174). */
  port?: number;
  /** @purpose Root state directory (default: ~/.gennady). */
  stateDir?: string;
  /**
   * @purpose Suppress the two external-write seams (VCS mutation, operator DM) — journals the
   *   intended write to the dashboard console instead (TSK-131).
   * @invariant When set, mirrored into `INBOX_DRY_RUN` so every code path (including
   *   scheduler-driven effect nodes) observes the same flag. Undefined leaves the env-derived
   *   default untouched.
   */
  dryRun?: boolean;
};

/** @purpose Return value from bootstrap — all service handles needed to run and stop. */
export type BootstrapResult = {
  /** @purpose The HTTP server instance (not yet started). */
  server: HttpServer;
  /** @purpose The role scheduler (timer not yet started). */
  scheduler: RoleScheduler;
  /** @purpose The OpenCode adapter (mock, real, or degraded). */
  opencode: OpenCodePort;
  /** @purpose Whether the system is in degraded mode (AI disabled). */
  degraded: boolean;
  /** @purpose Human-readable opencode status for the startup bar. */
  opencodeStatus: string;
  /** @purpose Polling interval in ms. */
  pollingInterval: number;
  /** @purpose List of loaded role names. */
  roles: string[];
  /** @purpose The port the server will listen on. */
  port: number;
  /** @purpose The spawned opencode child process (null in mock/degraded mode). */
  opencodeProcess: ChildProcess | null;
  /** @purpose Path to the PID file for opencode child process management. */
  opencodePidFile: string | null;
  /** @purpose Port opencode is running on (null in mock/degraded mode). */
  opencodePort: number | null;
};

// ═══════════════════════════════════════════════════════════════
// Main bootstrap
// ═══════════════════════════════════════════════════════════════

/**
 * @purpose Assemble DI for agent-inbox serve: load config, create adapters,
 * wire engine + scheduler + server, return ready handles.
 * @param config Bootstrap configuration — mocks, port, optional stateDir.
 * @throws When config is absent or opencode binary is not found in production mode.
 * @returns Bootstrap result with server, scheduler, opencode adapter and status metadata.
 */
export async function bootstrap(config: BootstrapConfig): Promise<BootstrapResult> {
  const port = config.port ?? 4174;
  const pollingInterval = 300_000; // 5 minutes
  const stateStore = new StateStore(config.stateDir);

  // #region START_APPLY_DRY_RUN — TSK-131: an explicit dryRun option wins over the ambient
  // INBOX_DRY_RUN env, and is mirrored back into the env so deeply-nested effect paths agree
  if (config.dryRun !== undefined) {
    setDryRun(config.dryRun);
  }
  // #endregion END_APPLY_DRY_RUN

  // #region START_CHECK_CONFIG
  let configVcsHost: string | undefined;

  if (config.mocks) {
    // In mock mode, config is optional for VCS — mock returns seeded data.
    // Still try to load config for the status bar.
    try {
      const result = await stateStore.loadConfig();
      if (result.configured) {
        configVcsHost = result.vcsHost;
      }
    } catch {
      /* config load failure is non-blocking in mock mode */
    }
  } else {
    // Production mode: config is required
    const result = await stateStore.loadConfig();
    if (!result.configured) {
      throw new Error('agent-inbox не настроен. Запустите gennady inbox config --init');
    }
    configVcsHost = result.vcsHost;
  }
  // #endregion END_CHECK_CONFIG

  let vcs: VcsInboxPort;
  let opencode: OpenCodePort;
  let degraded = false;
  let opencodeStatus: string;
  let opencodeProcess: ChildProcess | null = null;
  let opencodePidFile: string | null = null;
  let opencodePort: number | null = null;

  if (config.mocks) {
    vcs = new VcsInboxMock();
    opencode = new OpenCodeMock();
    opencodeStatus = 'mock (dev/e2e)';
  } else {
    // #region START_CREATE_VCS
    const token = process.env.GITLAB_PERSONAL_TOKEN;
    vcs = new VcsInboxReal({
      host: configVcsHost,
      token,
    });
    // #endregion END_CREATE_VCS

    // #region START_CHECK_OPENCODE_PATH
    if (!checkOpencodePath()) {
      throw new Error(
        'opencode not found in PATH. Install @opencode-ai/sdk or run with --mocks for dev mode.'
      );
    }
    // #endregion END_CHECK_OPENCODE_PATH

    // TSK-123 P2: an operator-supplied OPENCODE_PORT means "an opencode serve is already up on
    // this port, reuse it" — skip findFreePort/spawnOpencode entirely (spawning a second instance
    // wastes ~20s of retry budget racing the already-bound port and blows the e2e webServer
    // readiness window for a live run). Falls through to the pre-existing spawn path when unset.
    // #region START_CONNECT_OPENCODE
    const stateDir = stateStore.getStateDir();
    const pidFile = join(stateDir, 'agent-inbox', 'opencode.pid');
    opencodePort = 4096;
    opencodePidFile = null;

    const reusePort = process.env.OPENCODE_PORT ? Number(process.env.OPENCODE_PORT) : null;
    if (reusePort && Number.isFinite(reusePort)) {
      const connected = await retryOpencodeConnect(reusePort, 3, 1000);
      if (connected) {
        opencode = new OpenCodeReal({
          directory: stateDir,
          baseUrl: `http://localhost:${reusePort}`,
        });
        opencodeStatus = `connected (reused port ${reusePort})`;
        opencodePort = reusePort;
      } else {
        degraded = true;
        opencode = new DegradedOpencode();
        opencodeStatus = 'degraded (OPENCODE_PORT set but unreachable)';
        opencodePort = reusePort;
      }
    } else {
      try {
        opencodePort = await findFreePort();
      } catch {
        throw new Error('No free port available in range 4096–4106 for opencode');
      }

      const proc = await spawnOpencode(stateDir, opencodePort);
      if (proc && proc.pid) {
        // Ensure agent-inbox directory exists before writing PID file
        await mkdir(join(stateDir, 'agent-inbox'), { recursive: true });
        await writeFile(
          pidFile,
          JSON.stringify({ pid: proc.pid, port: opencodePort }) + '\n',
          'utf-8'
        );
        opencodePidFile = pidFile;
        opencode = new OpenCodeReal({
          directory: stateDir,
          baseUrl: `http://localhost:${opencodePort}`,
        });
        opencodeStatus = `connected (port ${opencodePort})`;
        opencodeProcess = proc;
      } else {
        // Spawn failed — try polling an already-running instance
        const connected = await retryOpencodeConnect(opencodePort, 3, 2000);
        if (connected) {
          opencode = new OpenCodeReal({
            directory: stateDir,
            baseUrl: `http://localhost:${opencodePort}`,
          });
          opencodeStatus = `connected (port ${opencodePort})`;
        } else {
          degraded = true;
          opencode = new DegradedOpencode();
          opencodeStatus = 'degraded (opencode not responding)';
        }
      }
    }
    // #endregion END_CONNECT_OPENCODE
  }

  // Review Chat sessions share the same opencode adapter RoleScheduler drives (mock, real, or
  // degraded) — one pool, bound after `opencode` is finalized above, feeds both scheduler-driven
  // role turns and operator-driven chat turns (TSK-133, SV-11, D-102).
  const chatSessionPool = new SessionPool({ maxSessions: 4, opencode });

  // Bounded pool for the reviewer role's parallel review-lens fan-out (TSK-perf): track-review/
  // security-lens/code-review run concurrently, each needing its own opencode session (the
  // instance's single `_sessionId` can only back one turn at a time) — 3 slots matches the fixed
  // lens count today; the queue safely bounds a future higher-fan-out extension too.
  const reviewSessionPool = new SessionPool({ maxSessions: 3, opencode });

  // F6: Roles start inactive by default — no auto-activation (mock mode activates after seeding
  // below; real mode via operator dashboard action). Real serve also drives the reviewer graph
  // against a live worktree/changeset (mock mode keeps its zero-network empty-artifacts start);
  // effect nodes honour the dry-run flag (TSK-131).
  // #region START_CREATE_ROLES
  const engine = new RoleEngine();
  await engine.loadAll();

  const scheduler = new RoleScheduler({
    engine,
    store: stateStore,
    vcs,
    opencode,
    pollingInterval,
    buildLiveContext: !config.mocks,
    dryRun: isDryRun(),
    reviewSessionPool,
  });
  // #endregion END_CREATE_ROLES

  const loadedRoles = engine.list();

  if (config.mocks) {
    // #region START_CREATE_SERVER_MOCK
    // F1: Mock mode — BoardProviderMock + seedDevData
    const boardProvider = new BoardProviderMock();
    await seedDevData(boardProvider);

    // F6: In mock/dev mode, activate roles after seeding for BDD parity
    for (const role of loadedRoles) {
      engine.activate(role.name);
    }

    const server = new HttpServer({
      port,
      boardProvider,
      chat: { pool: chatSessionPool, store: stateStore },
    });
    // #endregion END_CREATE_SERVER_MOCK

    logger.info('[bootstrap] [idle → assembled]', {
      mocks: config.mocks,
      port,
      roles: loadedRoles.map((r) => r.name),
      opencodeStatus,
      degraded,
    });

    return {
      server,
      scheduler,
      opencode,
      degraded,
      opencodeStatus,
      pollingInterval,
      roles: loadedRoles.map((r) => r.name),
      port,
      opencodeProcess,
      opencodePidFile,
      opencodePort,
    };
  }

  // #region START_CREATE_SERVER
  // F1: Real mode — BoardProviderReal backed by RoleScheduler; reports/<mr>/ read from the
  // same state dir the reviewer graph materializes to disk (TSK-122 gap-3/gap-4).
  const boardProvider = new BoardProviderReal(scheduler, engine, stateStore.getStateDir());
  const server = new HttpServer({
    port,
    boardProvider,
    chat: { pool: chatSessionPool, store: stateStore },
  });
  // #endregion END_CREATE_SERVER

  logger.info('[bootstrap] [idle → assembled]', {
    mocks: config.mocks,
    port,
    roles: loadedRoles.map((r) => r.name),
    opencodeStatus,
    degraded,
  });

  return {
    server,
    scheduler,
    opencode,
    degraded,
    opencodeStatus,
    pollingInterval,
    roles: loadedRoles.map((r) => r.name),
    port,
    opencodeProcess,
    opencodePidFile: opencodePidFile ?? null,
    opencodePort: opencodePort ?? null,
  };
}
