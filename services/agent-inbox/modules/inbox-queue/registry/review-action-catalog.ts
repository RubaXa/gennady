// @file: ReviewActionCatalog — closed catalog of action kinds, capability/policy table, and effect classification.
// @consumers: package builder, ReviewAutomationPolicy, ReviewEffectCoordinator
// @tasks: TSK-177

import { logger } from '#logger';
import type { VcsEffectKind } from '../types/review-effect.type.ts';
import type { ReviewUnavailableEvidence, ReviewActionMode } from '../model/review-proposal.ts';
import type { ReviewGuardedIntent } from '../types/review-guarded-intent.type.ts';

/**
 * @purpose Closed capability policy for each VCS effect kind.
 * @invariant Every closed VcsEffectKind maps exactly once; unknown fails closed.
 */
export type VcsEffectCapabilityPolicy =
  | 'conditional-precondition'
  | 'reconcile-only'
  | 'unsupported';

/**
 * @purpose Registration entry for one action kind.
 */
export type ReviewActionDefinition = Readonly<{
  /** @purpose Closed VCS effect kind this action maps to */
  kind: VcsEffectKind;
  /** @purpose Capability policy for this kind */
  capabilityPolicy: VcsEffectCapabilityPolicy;
  /** @purpose Whether this action is available for manual operator selection */
  manualAllowed: boolean;
  /** @purpose Whether this action is available for automatic restoration */
  automaticAllowed: boolean;
  /** @purpose Required permission for this action | @invariant absent = no special permission */
  requiredPermission?: string;
  /** @purpose Allowlist policy | @invariant absent = no allowlist required */
  allowlistPolicy?: string;
  /** @purpose Human-readable description of the action */
  description: string;
}>;

/**
 * @purpose Evidence of a capability check for a specific action.
 */
export type CapabilityCheckEvidence = Readonly<{
  /** @purpose Effective policy determined */
  policy: VcsEffectCapabilityPolicy;
  /** @purpose Capability version read from the accepted handoff */
  capabilityVersion: string;
  /** @purpose Whether the capability was present in the snapshot */
  supported: boolean;
}>;

/**
 * @purpose Closed catalog of all action kinds with their safety policies.
 * @invariant Catalog is immutable after construction; extensions require spec/task update.
 * @invariant Every closed VcsEffectKind has exactly one total mapping; unknown kind fails closed.
 */
export class ReviewActionCatalog {
  /** @purpose Internal action kind map. */
  protected _actions: Map<VcsEffectKind, ReviewActionDefinition>;

  /** @purpose Build the catalog with all spec-defined action kinds. */
  constructor() {
    this._actions = new Map();
    this._populateCatalog();
    logger.debug('[ReviewActionCatalog#constructor] [init → ready]', { count: this._actions.size });
  }

  /**
   * @purpose Populate the catalog with all closed VCS effect kinds.
   * @sideEffect Mutates this._actions.
   */
  protected _populateCatalog(): void {
    this._register({
      kind: 'comment',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: false,
      description: 'Post a top-level review comment',
    });
    this._register({
      kind: 'reply',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: true,
      description: 'Reply to an existing discussion thread',
    });
    this._register({
      kind: 'react',
      capabilityPolicy: 'reconcile-only',
      manualAllowed: true,
      automaticAllowed: false,
      description: 'Apply emoji reaction to a note',
    });
    this._register({
      kind: 'resolve',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: true,
      allowlistPolicy: 'operator-own-or-bot-thread',
      description: 'Resolve a discussion thread',
    });
    this._register({
      kind: 'reopen',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: false,
      description: 'Reopen a resolved discussion thread',
    });
    this._register({
      kind: 'approve',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: true,
      requiredPermission: 'reviewer',
      allowlistPolicy: 'prior-approved-reviewer',
      description: 'Approve the MR — restores prior operator approval after fresh PASS',
    });
    this._register({
      kind: 'unapprove',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: false,
      requiredPermission: 'reviewer',
      description: 'Remove MR approval',
    });
    this._register({
      kind: 'request_changes',
      capabilityPolicy: 'conditional-precondition',
      manualAllowed: true,
      automaticAllowed: false,
      requiredPermission: 'reviewer',
      description: 'Request changes on the MR',
    });
    this._register({
      kind: 'edit_description',
      capabilityPolicy: 'reconcile-only',
      manualAllowed: true,
      automaticAllowed: false,
      description: 'Edit the MR description',
    });
  }

  /**
   * @purpose Register one action kind.
   * @param def Action definition to register.
   */
  protected _register(def: ReviewActionDefinition): void {
    this._actions.set(def.kind, Object.freeze(def));
  }

  /**
   * @purpose Resolve an action definition by kind.
   * @param kind Closed VCS effect kind.
   * @throws {Error} When the kind is not registered — fails closed.
   * @returns Action definition.
   */
  resolveAction(kind: VcsEffectKind): ReviewActionDefinition {
    const def = this._actions.get(kind);
    if (!def) {
      const error = new Error(`[ReviewActionCatalog#resolveAction] Unknown action kind: ${kind}`);
      logger.error(`[ReviewActionCatalog#resolveAction] [lookup → not_found] kind=${kind}`, {
        error,
      });
      throw error;
    }
    return def;
  }

  /**
   * @purpose Total-map a VCS effect kind to its capability policy.
   * @param kind Closed VCS effect kind.
   * @returns Capability policy for this kind.
   */
  capabilityPolicyFor(kind: VcsEffectKind): VcsEffectCapabilityPolicy {
    return this.resolveAction(kind).capabilityPolicy;
  }

  /**
   * @purpose Enumerate package candidates from an accepted handoff's capability snapshot.
   * @param guardedIntent Accepted guarded intent containing the capability snapshot.
   * @param mode Manual or automatic — filters which actions are allowed.
   * @returns Array of proposals including unavailable proposals with evidence for unsupported kinds.
   */
  enumeratePackageCandidates(
    guardedIntent: ReviewGuardedIntent,
    mode: ReviewActionMode
  ): Array<{
    kind: VcsEffectKind;
    available: boolean;
    unavailableEvidence?: ReviewUnavailableEvidence;
  }> {
    const result: Array<{
      kind: VcsEffectKind;
      available: boolean;
      unavailableEvidence?: ReviewUnavailableEvidence;
    }> = [];
    const snapshot = guardedIntent.handoff.capabilitySnapshot;

    // #region START_ENUMERATE_CANDIDATES — check each action against capability snapshot
    for (const [kind, def] of this._actions) {
      const modeAllowed = mode === 'automatic' ? def.automaticAllowed : def.manualAllowed;

      if (!modeAllowed) continue;

      // capability check: a key in the snapshot with value false means unsupported
      const snapshotKey = `can_${kind.replace(/_/g, '')}`;
      const capabilityPresent = snapshot[snapshotKey] !== false;

      if (def.capabilityPolicy === 'unsupported' || !capabilityPresent) {
        result.push({
          kind,
          available: false,
          unavailableEvidence: Object.freeze({
            reason: 'unsupported_capability',
            detail: `Provider capability ${snapshotKey}=false; kind=${kind} is unsupported`,
          }),
        });
      } else {
        result.push({ kind, available: true });
      }
    }
    // #endregion END_ENUMERATE_CANDIDATES

    logger.debug(
      `[ReviewActionCatalog#enumerate] [idle → enumerated] guardId=${guardedIntent.guardId} candidates=${result.length} mode=${mode}`
    );
    return result;
  }

  /**
   * @purpose Classify whether an action mode is allowed for a given kind.
   * @param kind Action kind.
   * @param mode Mode to check.
   * @returns True when allowed.
   */
  isModeAllowed(kind: VcsEffectKind, mode: ReviewActionMode): boolean {
    const def = this._actions.get(kind);
    if (!def) return false;
    return mode === 'automatic' ? def.automaticAllowed : def.manualAllowed;
  }

  /**
   * @purpose List all registered action kinds.
   * @returns Array of VcsEffectKind values.
   */
  listKinds(): VcsEffectKind[] {
    return [...this._actions.keys()];
  }
}
