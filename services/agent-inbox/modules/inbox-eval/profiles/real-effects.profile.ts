// @file: RealEffectsProfile — real adapters with allowlisted-MR-only effects and non-allowlisted dryRun.
// @consumers: ReviewEvalHarness
// @tasks: TSK-183

import { logger } from '#logger';
import { VcsInboxReal } from '../../inbox-core/vcs-inbox.real.ts';
import type { VcsInboxPort } from '../../inbox-core/vcs-inbox.port.ts';
import { OpenCodeReal } from '../../inbox-opencode/opencode.real.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { fetchDiffRefsLive } from '../../inbox-roles/context-builder.ts';
import {
  composeRunModePipeline,
  resolveRunModeVcsHost,
  type RunModeDeps,
} from '../../../serve/run-mode.ts';

/** @purpose Caller-supplied options for composing a real-effects profile. */
export type RealEffectsProfileOptions = {
  /** @purpose Explicit MR URLs permitted to receive real effects | @invariant Must be non-empty; empty list makes all effects a no-op */
  effectAllowlist: readonly string[];
  /** @purpose Override for the gennady state directory (defaults to `~/.gennady`) */
  stateDir?: string;
  /** @purpose Override for the OpenCode base URL */
  openCodeBaseUrl?: string;
  /** @purpose Explicit effect allowlist identity (human-readable label recorded in the profile marker) */
  effectAllowlistIdentity: string;
  /** @purpose Full MR pool including non-allowlisted MRs to evaluate read-only */
  mrs: readonly string[];
};

/** @purpose Composed service bundle for a real-effects eval pass. */
export type RealEffectsDeps = {
  /** @purpose Fully wired RunModeDeps with real adapters */
  runModeDeps: RunModeDeps;
  /** @purpose VCS adapter for probe operations (read-only) */
  vcs: VcsInboxPort;
  /**
   * @purpose Set of MR URLs permitted to receive effects; all others run with dryRun:true.
   * @invariant Never broadened beyond the original `effectAllowlist` — no discovery-driven additions.
   */
  effectAllowlist: ReadonlySet<string>;
  /** @purpose MRs excluded from effects because they are not in the allowlist */
  nonAllowlistedMrs: ReadonlySet<string>;
};

/**
 * @purpose Compose real adapter bundle for an effects-enabled eval pass, restricted to an explicit allowlist.
 * @invariant Effect allowlist is immutable after construction — never broadened.
 * @invariant Non-allowlisted MRs from the pool are tracked separately so the harness can run them with dryRun:true.
 * @invariant `composeDeps` enforces that the allowlist is non-empty before wiring adapters.
 */
export class RealEffectsProfile {
  /** @purpose Profile configuration bound at construction time */
  protected readonly _options: RealEffectsProfileOptions;
  /** @purpose Immutable allowlist set materialised from `_options.effectAllowlist` */
  protected readonly _allowlistSet: ReadonlySet<string>;

  /**
   * @purpose Bind options and materialise the immutable allowlist set.
   * @param options Real-effects profile configuration.
   * @throws {Error} When `effectAllowlist` is empty — effects with no target is a misconfiguration.
   */
  constructor(options: RealEffectsProfileOptions) {
    if (options.effectAllowlist.length === 0) {
      throw new Error(
        '[RealEffectsProfile] Effect allowlist must be non-empty — an empty allowlist disables all effects'
      );
    }
    this._options = options;
    this._allowlistSet = new Set(options.effectAllowlist);
  }

  /**
   * @purpose Determine whether an MR is in the effect allowlist.
   * @param mr MR web URL to check.
   * @returns True iff the MR is explicitly allowlisted.
   */
  isAllowlisted(mr: string): boolean {
    return this._allowlistSet.has(mr);
  }

  /**
   * @purpose Compose and return all service dependencies for a real-effects eval pass.
   * @invariant The returned `effectAllowlist` is exactly the construction-time allowlist — no enlargement.
   * @invariant The returned `nonAllowlistedMrs` is the complement of `effectAllowlist` within the full MR pool.
   * @throws {Error} When VCS host resolution or engine loading fails.
   * @returns Wired `RunModeDeps`, read-only VCS adapter, allowlist set and non-allowlisted MR set.
   * @sideEffect Filesystem: reads the state store config; Network: resolves VCS host from the first MR URL.
   */
  async composeDeps(): Promise<RealEffectsDeps> {
    logger.debug('[RealEffectsProfile#composeDeps] [idle → composing]', {
      allowlistSize: this._allowlistSet.size,
      mrCount: this._options.mrs.length,
    });

    const store = new StateStore(this._options.stateDir);
    // #region START_COMPOSE_VCS — resolve the allowlisted provider before pipeline ownership
    const vcsHost = await resolveRunModeVcsHost(Array.from(this._options.mrs), store);
    const vcs = new VcsInboxReal({
      host: vcsHost,
      token: process.env.GITLAB_PERSONAL_TOKEN,
    });
    // #endregion END_COMPOSE_VCS

    const opencode = new OpenCodeReal({
      directory: store.getStateDir(),
      baseUrl: this._options.openCodeBaseUrl ?? 'http://localhost:4096',
    });

    const pipeline = composeRunModePipeline(store, opencode, 'test');
    const runModeDeps: RunModeDeps = { pipeline, store, vcs, fetchDiffRefs: fetchDiffRefsLive };

    const nonAllowlistedMrs = new Set(
      this._options.mrs.filter((mr) => !this._allowlistSet.has(mr))
    );

    logger.info('[RealEffectsProfile#composeDeps] [composing → done]', {
      vcsHost: vcsHost ?? 'unresolved',
      allowlistSize: this._allowlistSet.size,
      nonAllowlistedCount: nonAllowlistedMrs.size,
    });

    return {
      runModeDeps,
      vcs,
      effectAllowlist: this._allowlistSet,
      nonAllowlistedMrs,
    };
  }
}
