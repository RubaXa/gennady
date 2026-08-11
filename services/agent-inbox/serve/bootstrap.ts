// @file: Bootstrap — DI composition for agent-inbox serve: creates all services, wires them together.
// @consumers: gennady inbox serve CLI, e2e tests
// @tasks: TSK-115, TSK-117, TSK-122, TSK-123, TSK-157, TSK-158, TSK-160, TSK-161, TSK-163, TSK-170, TSK-172, TSK-173, TSK-174, TSK-175, TSK-181

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Agent as UndiciAgent } from 'undici';
import { logger } from '#logger';
import { isOpencodePid, terminateOrphanedOpencode } from './pid-utils.ts';
import { StateStore } from '../modules/inbox-core/state-store.ts';
import { VcsGitlabPort } from '../modules/inbox-vcs/vcs-gitlab.port.ts';
import type { VcsEffectPort, VcsPort } from '../modules/inbox-vcs/vcs-port.ts';
import { selectVcsRuntime } from '../modules/inbox-vcs/vcs-runtime.ts';
import { SyncService } from '../modules/inbox-vcs/sync.ts';
import { VcsSyncCoordinator } from '../modules/inbox-vcs/sync-coordinator.ts';
import { BackgroundVerifier } from '../modules/inbox-vcs/background-verify.ts';
import { EventJournal } from '../modules/inbox-core/event-journal.ts';
import { ReviewConfig } from '../modules/inbox-core/review-config.ts';
import { SystemClock } from '../modules/inbox-core/adapters/system-clock.ts';
import { DecisionJournal } from '../modules/inbox-core/decision-journal.ts';
import { BootReadiness } from '../modules/inbox-core/boot-readiness.ts';
import { InboxRegistryAccess } from '../modules/inbox-core/inbox-registry.ts';
import { CapabilityModes } from '../modules/inbox-core/capability-modes.ts';
import { mrKey } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { InMemoryTaskQueue } from '../modules/inbox-queue/task-queue.ts';
import { TaskRegistry } from '../modules/inbox-queue/task-registry.ts';
import { SessionRouter } from '../modules/inbox-queue/session-router.ts';
import { PipelineRuntime } from '../modules/inbox-pipeline/pipeline-runtime.ts';
import { VcsGitlabClient } from '../../vcs-client/gitlab/vcs-gitlab-client.ts';
import { OpenCodeMock } from '../modules/inbox-opencode/opencode.mock.ts';
import { OpenCodeReal } from '../modules/inbox-opencode/opencode.real.ts';
import {
  OpenCodePort,
  type CreateSessionOpts,
  type PromptOpts,
  type SessionHandle,
  type SessionStatus,
  type OpenCodeMessage,
} from '../modules/inbox-opencode/opencode.port.ts';
import { composeError, type OpenCodeCallResult } from '../modules/inbox-opencode/errors.ts';
import { SessionPool } from '../modules/inbox-opencode/session-pool.ts';
import { SessionRegistry } from '../modules/inbox-opencode/session-registry.ts';
import { SessionLifecycle } from '../modules/inbox-opencode/session-lifecycle.ts';
import { HttpServer } from '../modules/inbox-api/http-server.ts';
import { BoardProviderMock } from '../modules/inbox-api/board-provider.mock.ts';
import { seedDevData } from '../modules/inbox-serve/dev-seed.ts';
import { setDryRun, setDryRunRecorder } from '../modules/inbox-core/dry-run.ts';
import {
  BootstrapSafetyError,
  ReviewRuntimeProfile,
} from '../modules/inbox-core/runtime-profile.ts';
import {
  RuntimeProfilePort,
  composeDefaultReviewRuntimeRoots,
} from '../modules/inbox-core/runtime-profile.port.ts';
import type { ReviewRuntimeProfileSpec } from '../modules/inbox-core/types/review-runtime-profile-spec.type.ts';
import type { ReviewRuntimeRoots } from '../modules/inbox-core/types/review-runtime-roots.type.ts';
import type { ReviewRuntimeBinding } from '../modules/inbox-core/types/review-runtime-binding.type.ts';

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

  async park(_sid: string): Promise<void> {
    /* no-op in degraded mode */
  }

  async resume(_sid: string): Promise<boolean> {
    return false;
  }

  async messages(_sid: string): Promise<OpenCodeMessage[]> {
    return [];
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
// Lifecycle coordinator shim — backward-compat surface for CLI consumers while the
// role scheduler is being retired. All review execution goes through PipelineRuntime.
// ═══════════════════════════════════════════════════════════════

/**
 * @purpose No-op lifecycle coordinator shim.
 * @invariant CLI consumers (serve.cmd.ts) still call tick()/advanceInstances()/stop() through this
 *   interface; all substantive review execution is owned by PipelineRuntime after TSK-181 migration.
 */
class NoOpScheduler {
  async tick(): Promise<void> {}
  async advanceInstances(): Promise<void> {}
  async stop(): Promise<void> {}
  async assignManual(
    _mrId: string,
    _role: string,
    _rights?: Record<string, unknown>
  ): Promise<void> {}
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

      if (response.status > 0) {
        // opencode requires auth on all endpoints (returns 401) — any HTTP
        // response proves the server is alive and listening
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
  // Strip leaked desktop-session server auth: when gennady serve is launched from an
  // opencode desktop shell, OPENCODE_SERVER_* reaches the spawned child and forces Basic
  // Auth on it — while our SDK client never sends credentials (observed: 401 empty body
  // on POST /session, surfacing only as a generic 'Session creation failed').
  const childEnv = { ...process.env };
  let strippedServerAuth = false;
  for (const key of ['OPENCODE_SERVER_USERNAME', 'OPENCODE_SERVER_PASSWORD'] as const) {
    if (childEnv[key] !== undefined) {
      delete childEnv[key];
      strippedServerAuth = true;
    }
  }
  if (strippedServerAuth) {
    logger.warn(
      '[bootstrap] [config → sanitized] OPENCODE_SERVER_* inherited from parent env — stripping for spawned opencode serve (desktop-session leak would force Basic Auth on the child)'
    );
  }

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
        env: childEnv,
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

        if (response.status > 0) {
          // opencode requires auth on all endpoints — any response proves it is alive
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
  /** @purpose Explicit runtime capability binding; omitted value derives from legacy mocks mode. */
  runtimeProfile?: ReviewRuntimeProfileSpec;
  /** @purpose Overrides for the three pairwise-disjoint namespace roots. */
  runtimeRoots?: Partial<ReviewRuntimeRoots>;
  /** @purpose Reopen an existing test run read-only instead of creating a fresh run. */
  reopenRun?: boolean;
  /**
   * @purpose Suppress the two external-write seams (VCS mutation, operator DM) — journals the
   *   intended write to the dashboard console instead (TSK-131).
   * @invariant When set, mirrored into `INBOX_DRY_RUN` so every code path (including
   *   pipeline effect nodes) observes the same flag. Undefined leaves the env-derived default
   *   untouched.
   */
  dryRun?: boolean;
  /**
   * @purpose Observe shared boot state after HTTP becomes live.
   * @param state Current immutable readiness snapshot.
   * @returns Completion of the optional observer.
   */
  onBootState?: (state: ReturnType<BootReadiness['snapshot']>) => void | Promise<void>;
};

/** @purpose Return value from bootstrap — all service handles needed to run and stop. */
export type BootstrapResult = {
  /** @purpose The HTTP server instance, already listening while bootstrap phases run. */
  server: HttpServer;
  /**
   * @purpose No-op lifecycle coordinator shim — backward-compat surface for CLI consumers.
   * @invariant Substantive review execution is owned by `pipeline`; this shim satisfies the
   *   CLI's tick/stop surface until serve.cmd.ts migrates to pipeline-first orchestration.
   */
  scheduler: NoOpScheduler;
  /** @purpose The OpenCode adapter (mock, real, or degraded). */
  opencode: OpenCodePort;
  /** @purpose Whether the system is in degraded mode (AI disabled). */
  degraded: boolean;
  /** @purpose Human-readable opencode status for the startup bar. */
  opencodeStatus: string;
  /** @purpose Polling interval in ms. */
  pollingInterval: number;
  /** @purpose Registered role names — empty after journal-first migration; kept for CLI backward compat. */
  roles: string[];
  /** @purpose The port the server will listen on. */
  port: number;
  /** @purpose The spawned opencode child process (null in mock/degraded mode). */
  opencodeProcess: ChildProcess | null;
  /** @purpose Path to the PID file for opencode child process management. */
  opencodePidFile: string | null;
  /** @purpose Port opencode is running on (null in mock/degraded mode). */
  opencodePort: number | null;
  /** @purpose Concrete inbox-vcs port in real runtime; absent in mock mode. */
  vcsTruth: VcsPort | null;
  /** @purpose Profile-selected effect surface; readonly mode receives a deny-before-I/O guard. */
  vcsEffects: VcsEffectPort | null;
  /** @purpose Real two-tier GitLab sync service; absent in mock mode. */
  syncService: SyncService | null;
  /** @purpose Real background GitLab verifier; absent in mock mode. */
  backgroundVerifier: BackgroundVerifier | null;
  /** @purpose The one boot-owned registry shared by every OpenCode session path. */
  sessionRegistry: SessionRegistry;
  /** @purpose Lifecycle bound to the real adapter; owns park/resume/TTL cleanup. */
  sessionLifecycle: SessionLifecycle;
  /** @purpose One lifecycle-aware pool shared by operator chat and scheduler role sessions. */
  sessionPool: SessionPool;
  /** @purpose Timer driving lifecycle TTL cleanup; unref'd so it never pins CLI exit. */
  lifecycleReaper: NodeJS.Timeout;
  /** @purpose Shared queue-backed pipeline lifecycle, reachable from the booted runtime. */
  pipeline: PipelineRuntime;
  /** @purpose Shared readiness lifecycle serving GET /api/boot. */
  bootReadiness: BootReadiness;
  /** @purpose Validated physical runtime binding shared by all stateful adapters. */
  runtimeBinding: ReviewRuntimeBinding;
};

export { BootstrapSafetyError };

// ═══════════════════════════════════════════════════════════════
// Main bootstrap
// ═══════════════════════════════════════════════════════════════

/**
 * @purpose Assemble DI for agent-inbox serve: load config, create adapters,
 * wire pipeline runtime + server, return ready handles.
 * @param config Bootstrap configuration — mocks, port, optional stateDir.
 * @throws When config is absent or opencode binary is not found in production mode.
 * @returns Bootstrap result with server, pipeline, opencode adapter and status metadata.
 */
export async function bootstrap(config: BootstrapConfig): Promise<BootstrapResult> {
  const port = config.port ?? 4174;
  const pollingInterval = 300_000; // 5 minutes
  const bootReadiness = new BootReadiness();
  // D-305: the diagnostics surface must be observable before configuration and every external
  // phase. It is rebound to the complete runtime only after those dependencies are assembled.
  const server = new HttpServer({
    port,
    boardProvider: new BoardProviderMock(),
    bootReadiness,
  });
  await server.start();
  const observeBoot = async (): Promise<void> => {
    await config.onBootState?.(bootReadiness.snapshot());
  };
  const advanceBoot = async (phase: Parameters<BootReadiness['transition']>[0]): Promise<void> => {
    bootReadiness.transition(phase);
    await observeBoot();
  };
  await observeBoot();

  // #region START_BIND_RUNTIME_SAFETY_BOUNDARY
  const defaultProfile: ReviewRuntimeProfileSpec = config.mocks
    ? {
        stateNamespace: 'mock',
        externalIoPolicy: 'deterministic-mock',
        runId: `boot-${randomUUID()}`,
      }
    : { stateNamespace: 'production', externalIoPolicy: 'real-work' };
  let runtimeBinding: ReviewRuntimeBinding;
  try {
    const runtimeProfile = ReviewRuntimeProfile.compose(config.runtimeProfile ?? defaultProfile);
    const usesMockAdapters = runtimeProfile.stateNamespace === 'mock';
    if (Boolean(config.mocks) !== usesMockAdapters) {
      throw new Error(
        '[bootstrap] Legacy mocks switch conflicts with the explicit runtime profile namespace'
      );
    }
    const runtimeRoots = {
      ...composeDefaultReviewRuntimeRoots(),
      ...config.runtimeRoots,
    };
    runtimeBinding = await new RuntimeProfilePort(runtimeRoots).openProfile(runtimeProfile, {
      reopenReadOnly: config.reopenRun,
      stateRootOverride: config.stateDir,
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    bootReadiness.fail(`[bootstrap] Runtime safety binding failed: ${detail}`);
    await observeBoot();
    await server.stop();
    const error = new BootstrapSafetyError(
      '[bootstrap] Runtime safety binding failed before adapters started',
      bootReadiness.snapshot(),
      cause
    );
    logger.error('[bootstrap] [connect → failed] Runtime safety boundary rejected boot', {
      error,
    });
    throw error;
  }
  const stateStore = new StateStore(runtimeBinding);
  // #endregion END_BIND_RUNTIME_SAFETY_BOUNDARY

  // #region START_APPLY_DRY_RUN — TSK-131: an explicit dryRun option wins over the ambient
  // INBOX_DRY_RUN env, and is mirrored back into the env so deeply-nested effect paths agree
  const persistedDryRun = await stateStore.loadDryRun();
  if (runtimeBinding.profile.externalIoPolicy === 'real-readonly') {
    setDryRun(true);
  } else if (config.dryRun !== undefined) {
    setDryRun(config.dryRun);
  } else if (persistedDryRun !== undefined && process.env.INBOX_DRY_RUN === undefined) {
    setDryRun(persistedDryRun);
  }
  // #endregion END_APPLY_DRY_RUN

  // #region START_CHECK_CONFIG
  let configVcsHost: string | undefined;
  let configLoaded = false;
  let configFailure = false;

  if (config.mocks) {
    try {
      const result = await stateStore.loadConfig();
      if (result.configured) {
        configVcsHost = result.vcsHost;
        configLoaded = true;
      } else {
        bootReadiness.setConfigStatus(false, result.missing);
      }
    } catch (cause) {
      bootReadiness.setConfigStatus(false, ['reposBase', 'vcsHost']);
      logger.warn('[bootstrap] [config → degraded]', { cause });
    }
  } else {
    const result = await stateStore.loadConfig();
    if (!result.configured) {
      bootReadiness.setConfigStatus(false, result.missing);
      bootReadiness.fail('agent-inbox не настроен. Запустите gennady inbox config --init');
      await observeBoot();
      configFailure = true;
    } else {
      configVcsHost = result.vcsHost;
      configLoaded = true;
    }
  }
  if (configLoaded) bootReadiness.setConfigStatus(true);
  const useMocks = config.mocks || configFailure;
  // #endregion END_CHECK_CONFIG

  // A failed production config still starts a read-only failed boot surface; external adapters
  // are intentionally not constructed until the operator fixes the configuration.

  let opencode: OpenCodePort;
  let degraded = false;
  let opencodeStatus: string;
  let opencodeProcess: ChildProcess | null = null;
  let opencodePidFile: string | null = null;
  let opencodePort: number | null = null;
  let vcsTruth: VcsPort | null = null;
  let vcsEffects: VcsEffectPort | null = null;
  let syncService: SyncService | null = null;
  let backgroundVerifier: BackgroundVerifier | null = null;
  let vcsJournal: EventJournal | null = null;
  let vcsRegistry: InboxRegistryAccess | null = null;
  // Single-flight slot for the heavy twoTierSync (a real 155-MR sync takes minutes): the
  // initial bootstrap sync and any board-triggered refresh must share one in-flight promise
  // instead of competing for GitLab.
  let inflightSync: ReturnType<SyncService['twoTierSync']> | null = null;
  const runSyncShared = (service: SyncService): ReturnType<SyncService['twoTierSync']> => {
    if (!inflightSync) {
      const raw = service.twoTierSync();
      inflightSync = raw;
      const clear = (): void => {
        if (inflightSync === raw) inflightSync = null;
      };
      void raw.then(clear, clear);
    }
    return inflightSync;
  };
  let initialSyncSnapshots = [] as Awaited<ReturnType<SyncService['twoTierSync']>>;

  if (useMocks) {
    opencode = new OpenCodeMock();
    opencodeStatus = 'mock (dev/e2e)';
  } else {
    // #region START_CREATE_VCS
    const token = process.env.GITLAB_PERSONAL_TOKEN;
    const baseUrl = `https://${configVcsHost}/api/v4`;
    vcsTruth = new VcsGitlabPort(
      new VcsGitlabClient({ token: token ?? '', baseUrl }),
      configVcsHost ?? ''
    );
    vcsEffects = selectVcsRuntime(runtimeBinding.profile.externalIoPolicy, vcsTruth).effects;
    const inboxStateDir = join(stateStore.getStateDir(), 'agent-inbox');
    vcsJournal = new EventJournal(join(inboxStateDir, 'events.jsonl'));
    vcsRegistry = new InboxRegistryAccess(stateStore.getStateDir());
    const reviewConfig = new ReviewConfig({ stateRoots: [runtimeBinding.stateRoot] });
    reviewConfig.verifyStateRoot(runtimeBinding.stateRoot);
    const canonicalJournal = stateStore.openReviewJournal();
    syncService = new SyncService(vcsTruth, vcsRegistry, vcsJournal, {
      canonicalReview: {
        journal: canonicalJournal,
        config: reviewConfig,
        clock: new SystemClock(),
      },
      syncCoordinator: new VcsSyncCoordinator(vcsTruth, canonicalJournal),
    });
    backgroundVerifier = new BackgroundVerifier(vcsTruth, vcsJournal);
    // First real poll is deliberate: production truth port goes live; active snapshots pre-register the minute verifier.
    await advanceBoot('poll');
    {
      // Observe the sync to settlement: a bounded wait must never fabricate 'VCS unreachable' for a slow-but-healthy sync (155 MRs ≈ minutes).
      const TIMEOUT_MS = 30_000;
      const syncStartedAt = Date.now();
      let syncSettled = false;
      // Serve logs at warn level: the settlement closing the slow-warn must be warn too.
      let slowWarned = false;
      const verifier = backgroundVerifier;
      const registerActive = (snapshots: Awaited<ReturnType<SyncService['twoTierSync']>>): void => {
        for (const snapshot of snapshots.filter((item) => item.role !== null)) {
          verifier.register({
            webUrl: snapshot.mr.webUrl,
            project: snapshot.mr.project,
            iid: snapshot.mr.iid,
            lastKnownSha: snapshot.headSha,
            lastKnownUpdatedAt: snapshot.updatedAt,
          });
        }
      };
      const trackedSync = runSyncShared(syncService).then(
        (snapshots) => {
          syncSettled = true;
          const detail = {
            durationMs: Date.now() - syncStartedAt,
            snapshots: snapshots.length,
            active: snapshots.filter((item) => !item.estimated).length,
          };
          if (slowWarned) logger.warn('[bootstrap] [twoTierSync → completed]', detail);
          else logger.info('[bootstrap] [twoTierSync → completed]', detail);
          return snapshots;
        },
        (cause: unknown) => {
          syncSettled = true;
          logger.warn('[bootstrap] [twoTierSync → failed]', {
            durationMs: Date.now() - syncStartedAt,
            error: cause instanceof Error ? cause.message : String(cause),
          });
          return null;
        }
      );
      const settled = await Promise.race([
        trackedSync,
        new Promise<null>((resolve) => {
          const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
          timer.unref();
        }),
      ]);
      if (settled !== null) {
        initialSyncSnapshots = settled;
        registerActive(settled);
      } else if (syncSettled) {
        logger.warn(
          '[bootstrap] [twoTierSync → failed] continuing with empty snapshots; sync will retry on next poll'
        );
      } else {
        slowWarned = true;
        logger.warn(
          '[bootstrap] [twoTierSync → slow] initial sync still running — startup continues; active MRs register when it settles',
          { elapsedMs: TIMEOUT_MS }
        );
        void trackedSync.then((snapshots) => {
          if (snapshots) {
            registerActive(snapshots);
            server.updateInboxSnapshots(snapshots);
          }
        });
      }
    }
    backgroundVerifier.start();
    await advanceBoot('reconcile');
    // #endregion END_CREATE_VCS

    // #region START_CHECK_OPENCODE_PATH
    if (!checkOpencodePath()) {
      throw new Error(
        'opencode not found in PATH. Install @opencode-ai/sdk or run with --mocks for dev mode.'
      );
    }
    // #endregion END_CHECK_OPENCODE_PATH

    // TSK-123 P2: OPENCODE_PORT means reuse an already-running opencode serve.
    // Falls through to the spawn path when unset.
    // D-138: pid file scoped by port; orphan check at start + cleanup before spawn.
    // #region START_CONNECT_OPENCODE
    const stateDir = stateStore.getStateDir();
    const pidFile = join(stateDir, 'agent-inbox', `opencode-${port}.pid`);
    opencodePort = 4096;
    opencodePidFile = null;

    if (existsSync(pidFile)) {
      try {
        const { pid: orphanPid } = JSON.parse(await readFile(pidFile, 'utf-8')) as {
          pid: number;
          port: number;
        };
        if (await isOpencodePid(orphanPid)) {
          // Distinguish orphan opencode (serve dead) from legitimate running serve
          let httpAlive = false;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(`http://localhost:${port}/api/board`, {
              signal: controller.signal,
            });
            clearTimeout(timeout);
            httpAlive = response.ok;
          } catch {
            /* HTTP not responding — orphan */
          }

          if (httpAlive) {
            throw new Error(
              `Already running on port ${port}. Stop the existing instance first or use a different --port.`
            );
          }

          logger.warn('[bootstrap] [starting → orphan_found]', {
            port,
            pid: orphanPid,
            reason: `pid file for inbox-serve port ${port} still points at a live opencode process — a previous instance on this port exited without cleanup`,
          });
          await terminateOrphanedOpencode(
            orphanPid,
            `starting a fresh gennady inbox serve on port ${port}`
          );
          try {
            await unlink(pidFile);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Already running')) {
          throw e;
        }
        /* stale/corrupt pid file — overwritten below regardless */
      }
    }

    // Shared across all OpenCodeReal instances this process creates — see `OpenCodeRealOpts.dispatcher`.
    const opencodeDispatcher = new UndiciAgent({ headersTimeout: 0, bodyTimeout: 0 });

    const reusePort = process.env.OPENCODE_PORT ? Number(process.env.OPENCODE_PORT) : null;
    if (reusePort && Number.isFinite(reusePort)) {
      const connected = await retryOpencodeConnect(reusePort, 3, 1000);
      if (connected) {
        opencode = new OpenCodeReal({
          directory: stateDir,
          baseUrl: `http://localhost:${reusePort}`,
          dispatcher: opencodeDispatcher,
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
          dispatcher: opencodeDispatcher,
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
            dispatcher: opencodeDispatcher,
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

  const lifecycleJournal =
    vcsJournal ?? new EventJournal(join(stateStore.getStateDir(), 'agent-inbox', 'events.jsonl'));
  // D-302: an MR write belongs in that MR's canonical decision/event journal. emitDryRun awaits
  // this recorder before broadcasting, so SSE can never outrun the durable source of truth.
  setDryRunRecorder(async (entry) => {
    if (entry.mr) {
      await new DecisionJournal(
        new EventJournal(
          join(stateStore.getStateDir(), 'agent-inbox', 'mrs', mrKey(entry.mr), 'events.jsonl')
        )
      ).recordDryRunSuppression(entry.mr, entry.line);
      return;
    }
    await lifecycleJournal.append({
      ts: new Date().toISOString(),
      mr: entry.mr ?? '',
      kind: 'system',
      actor: 'core',
      payload: { event: 'dryrun', effectId: entry.line },
    });
  });
  const sessionRegistry = new SessionRegistry();
  let chatSessionPool: SessionPool;
  const sessionLifecycle = new SessionLifecycle(sessionRegistry, lifecycleJournal, opencode, {
    onClosed: async (sessionId) => chatSessionPool.evictClosed(sessionId),
  });
  // Register at the only pool acquisition seam, before a chat/role caller receives its SID.
  chatSessionPool = new SessionPool({
    maxSessions: 4,
    opencode,
    onSessionCreated: (sessionId, opts) => {
      const registration = opts.registration;
      if (!registration) return;
      sessionRegistry.register({
        sessionId,
        taskId: registration.taskId,
        mr: registration.mr,
        artifacts: registration.artifacts ?? [],
        model: opts.model,
        state: 'idle',
        context: registration.context,
        sha: registration.sha,
        runtimeNamespace: registration.runtimeNamespace ?? runtimeBinding.profile.stateNamespace,
      });
      sessionLifecycle.startWork(sessionId);
    },
    onSessionRelease: async (sessionId) => {
      if (!sessionRegistry.lookup(sessionId)) return false;
      await sessionLifecycle.close(sessionId);
      return true;
    },
  });
  const lifecycleReaper = setInterval(() => {
    void sessionLifecycle.reapExpired();
  }, 60_000);
  lifecycleReaper.unref();

  // #region START_COMPOSE_PIPELINE
  // One boot-owned queue is shared by pipeline runtime, HTTP and its durable Executor lifecycle.
  const pipelineRegistry = new TaskRegistry();
  const pipelineQueue = new InMemoryTaskQueue(pipelineRegistry);
  const chatSessionRouter = new SessionRouter(
    chatSessionPool,
    pipelineRegistry,
    sessionLifecycle,
    runtimeBinding.profile.stateNamespace
  );
  const resolveDecisionJournal = (mr: string): DecisionJournal =>
    new DecisionJournal(
      new EventJournal(
        join(stateStore.getStateDir(), 'agent-inbox', 'mrs', mrKey(mr), 'events.jsonl')
      )
    );
  const pipeline = new PipelineRuntime(
    pipelineQueue,
    pipelineRegistry,
    lifecycleJournal,
    undefined,
    stateStore.getStateDir(),
    opencode,
    vcsRegistry
      ? async (proposal) => {
          const journal = resolveDecisionJournal(proposal.mr);
          await journal.writeProposal(proposal);
          const capabilities = CapabilityModes.computeRegistry(journal.computeAllAcceptRates());
          vcsRegistry.storeCapabilitiesForRef(proposal.mr, capabilities);
          logger.info('[bootstrap] [pipeline_proposal → capability_modes_persisted]', {
            mr: proposal.mr,
            proposalId: proposal.proposalId,
          });
        }
      : undefined
  );
  pipeline.start();
  // #endregion END_COMPOSE_PIPELINE

  // The readiness owner advances exactly once through the public D-305 sequence. The HTTP
  // router receives this same object, so no local router state can drift from production boot.
  if (bootReadiness.snapshot().phase !== 'failed') {
    // Mock boot still traverses the same observable sequence without pretending an external
    // poll happened. Real mode has already completed poll/reconcile around SyncService.
    if (bootReadiness.snapshot().phase === 'connect') await advanceBoot('poll');
    if (bootReadiness.snapshot().phase === 'poll') await advanceBoot('reconcile');
    await advanceBoot('restore');
  }
  // The HTTP task surface uses the exact queue passed to the scheduler's PipelineRuntime above.

  if (useMocks) {
    // #region START_CREATE_SERVER_MOCK
    // F1: Mock mode — BoardProviderMock + seedDevData
    const boardProvider = new BoardProviderMock();
    await seedDevData(boardProvider);
    const mockRegistry = new InboxRegistryAccess(stateStore.getStateDir());
    const snapshotsPath = join(stateStore.getStateDir(), 'agent-inbox', 'sync-snapshots.json');
    const loadMockSnapshots = async () => {
      if (!existsSync(snapshotsPath)) return [] as Awaited<ReturnType<SyncService['twoTierSync']>>;
      return JSON.parse(await readFile(snapshotsPath, 'utf-8')) as Awaited<
        ReturnType<SyncService['twoTierSync']>
      >;
    };
    const mockSnapshots = await loadMockSnapshots();

    await server.attachRuntime({
      port,
      boardProvider,
      chat: {
        pool: chatSessionPool,
        store: stateStore,
        queue: pipelineQueue,
        journal: lifecycleJournal,
        sessionRouter: chatSessionRouter,
        taskRegistry: pipelineRegistry,
      },
      inboxApi: {
        queue: pipelineQueue,
        decisionJournal: new DecisionJournal(lifecycleJournal),
        resolveDecisionJournal,
        journal: lifecycleJournal,
        registry: mockRegistry,
        snapshots: mockSnapshots,
        loadSnapshots: loadMockSnapshots,
      },
      bootReadiness,
    });
    if (bootReadiness.snapshot().phase !== 'failed') await advanceBoot('ready');
    // #endregion END_CREATE_SERVER_MOCK

    logger.info('[bootstrap] [idle → assembled]', {
      mocks: useMocks,
      port,
      roles: [],
      opencodeStatus,
      degraded,
    });

    return {
      server,
      scheduler: new NoOpScheduler(),
      opencode,
      degraded,
      opencodeStatus,
      pollingInterval,
      roles: [],
      port,
      opencodeProcess,
      opencodePidFile,
      opencodePort,
      vcsTruth,
      vcsEffects,
      syncService,
      backgroundVerifier,
      sessionRegistry,
      sessionLifecycle,
      sessionPool: chatSessionPool,
      lifecycleReaper,
      pipeline,
      bootReadiness,
      runtimeBinding,
    };
  }

  // #region START_CREATE_SERVER
  // F1: Real mode — BoardProviderMock as pre-wire default; BoardProjection is installed by
  // attachRuntime via http-server._wireRuntime() once inboxApi config is provided (TSK-179).
  const boardProvider = new BoardProviderMock();
  if (!syncService || !vcsJournal || !vcsRegistry) {
    throw new Error('[bootstrap] Production VCS truth dependencies were not assembled');
  }
  // `let` captures lose CFA narrowing inside closures — rebind after the guard above.
  const syncServiceForBoard = syncService;
  await server.attachRuntime({
    port,
    boardProvider,
    chat: {
      pool: chatSessionPool,
      store: stateStore,
      queue: pipelineQueue,
      journal: lifecycleJournal,
      sessionRouter: chatSessionRouter,
      taskRegistry: pipelineRegistry,
    },
    inboxApi: {
      queue: pipelineQueue,
      decisionJournal: new DecisionJournal(vcsJournal),
      resolveDecisionJournal,
      onDecision: async (mr, journal) => {
        const capabilities = CapabilityModes.computeRegistry(journal.computeAllAcceptRates());
        vcsRegistry.storeCapabilitiesForRef(mr, capabilities);
        logger.info('[bootstrap] [decision → capability_modes_persisted]', { mr, capabilities });
      },
      journal: vcsJournal,
      registry: vcsRegistry,
      snapshots: initialSyncSnapshots,
      loadSnapshots: () => runSyncShared(syncServiceForBoard),
    },
    bootReadiness,
  });
  if (bootReadiness.snapshot().phase !== 'failed') await advanceBoot('ready');
  // #endregion END_CREATE_SERVER

  logger.info('[bootstrap] [idle → assembled]', {
    mocks: useMocks,
    port,
    roles: [],
    opencodeStatus,
    degraded,
  });

  return {
    server,
    scheduler: new NoOpScheduler(),
    opencode,
    degraded,
    opencodeStatus,
    pollingInterval,
    roles: [],
    port,
    opencodeProcess,
    opencodePidFile: opencodePidFile ?? null,
    opencodePort: opencodePort ?? null,
    vcsTruth,
    vcsEffects,
    syncService,
    backgroundVerifier,
    sessionRegistry,
    sessionLifecycle,
    sessionPool: chatSessionPool,
    lifecycleReaper,
    pipeline,
    bootReadiness,
    runtimeBinding,
  };
}
