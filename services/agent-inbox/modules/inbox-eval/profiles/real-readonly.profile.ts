// @file: RealReadonlyProfile — composes RunModeDeps with real VCS/OpenCode adapters and enforces dryRun:true.
// @consumers: ReviewEvalHarness
// @tasks: TSK-183

import { logger } from '#logger';
import { RoleEngine } from '../../inbox-roles/role-engine.ts';
import { VcsInboxReal } from '../../inbox-core/vcs-inbox.real.ts';
import type { VcsInboxPort } from '../../inbox-core/vcs-inbox.port.ts';
import { OpenCodeReal } from '../../inbox-opencode/opencode.real.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { resolveRunModeVcsHost, type RunModeDeps } from '../../../serve/run-mode.ts';

/** @purpose Caller-supplied options for composing a real-readonly profile. */
export type RealReadonlyProfileOptions = {
  /** @purpose Override for the gennady state directory (defaults to `~/.gennady`) */
  stateDir?: string;
  /** @purpose Override for the OpenCode base URL */
  openCodeBaseUrl?: string;
  /** @purpose MR pool for which the VCS host is resolved */
  mrs: readonly string[];
};

/** @purpose Composed service bundle for a real-readonly eval pass. */
export type RealReadonlyDeps = {
  /** @purpose Fully wired RunModeDeps — all read adapters; mutation paths blocked by dryRun */
  runModeDeps: RunModeDeps;
  /** @purpose VCS adapter for probe operations (read-only) */
  vcs: VcsInboxPort;
  /** @purpose Always true — readonly profile never executes effects */
  dryRun: true;
};

/**
 * @purpose Compose real VCS/OpenCode adapter bundle for a read-only eval pass.
 * @invariant `dryRun` is fixed at `true` — a real-readonly pass never writes to GitLab.
 * @invariant Callers cannot override `dryRun` for this profile; the profile enforces it.
 */
export class RealReadonlyProfile {
  /** @purpose Profile configuration bound at construction time */
  protected readonly _options: RealReadonlyProfileOptions;

  /**
   * @purpose Bind the caller-supplied options for later composition.
   * @param options Real-readonly profile configuration.
   */
  constructor(options: RealReadonlyProfileOptions) {
    this._options = options;
  }

  /**
   * @purpose Compose and return all service dependencies for a real-readonly eval pass.
   * @invariant The returned `dryRun` is always `true` — enforced at the type level.
   * @throws {Error} When VCS host resolution or engine loading fails.
   * @returns Wired `RunModeDeps` plus the read-only VCS adapter and the fixed `dryRun: true` flag.
   * @sideEffect Filesystem: reads the state store config; Network: resolves VCS host from the first MR URL.
   */
  async composeDeps(): Promise<RealReadonlyDeps> {
    logger.debug('[RealReadonlyProfile#composeDeps] [idle → composing]', {
      mrCount: this._options.mrs.length,
    });

    const store = new StateStore(this._options.stateDir);
    const engine = new RoleEngine();

    // #region START_LOAD_ENGINE_AND_VCS — invariant: engine must finish loadAll before adapters start
    try {
      await engine.loadAll();
    } catch (cause) {
      const error = new Error('[RealReadonlyProfile#composeDeps] Engine load failed', { cause });
      logger.error('[RealReadonlyProfile#composeDeps] [composing → failed]', { error });
      throw error;
    }

    const vcsHost = await resolveRunModeVcsHost(Array.from(this._options.mrs), store);
    const vcs = new VcsInboxReal({
      host: vcsHost,
      token: process.env.GITLAB_PERSONAL_TOKEN,
    });
    // #endregion END_LOAD_ENGINE_AND_VCS

    const opencode = new OpenCodeReal({
      directory: store.getStateDir(),
      baseUrl: this._options.openCodeBaseUrl ?? 'http://localhost:4096',
    });

    const runModeDeps: RunModeDeps = { engine, store, vcs, opencode };

    logger.info('[RealReadonlyProfile#composeDeps] [composing → done]', {
      vcsHost: vcsHost ?? 'unresolved',
    });

    return { runModeDeps, vcs, dryRun: true };
  }
}
