// @file: VcsPermissionPolicy — complete pre-I/O effect permission and capability truth table.
// @consumers: Effects
// @tasks: TSK-174

import type { VcsCapabilities, VcsEffectRequest, VcsEffectOutcome } from './vcs-port.ts';

/** @purpose Policy result distinguished from provider outcomes because denied effects are never created. */
export type VcsPermissionDecision = Pick<VcsEffectOutcome, 'status' | 'evidence'> & {
  /** @purpose Whether an external effect may now be attempted */
  allowed: boolean;
};

/**
 * @purpose Enforce identity, ownership, revision, body, permission, and native-capability gates.
 * @invariant Resolve/reopen allow only operator threads, or allowlisted bot threads on operator-authored MRs.
 * @invariant Automatic reopen and silent request-changes substitution are disabled in v0.
 */
export class VcsPermissionPolicy {
  /** @purpose Exact bot usernames permitted by the configured ownership exception. */
  protected readonly _botAllowlist: ReadonlySet<string>;

  /**
   * @purpose Bind thread ownership decisions to one explicit bot allowlist.
   * @param [botAllowlist] Exact bot usernames eligible for the owned-MR exception.
   */
  constructor(botAllowlist: readonly string[] = []) {
    this._botAllowlist = new Set(botAllowlist);
  }

  /**
   * @purpose Decide whether one validated effect may cross the external I/O boundary.
   * @param request Validated effect request and permission facts.
   * @param capabilities Fresh host capability probe.
   * @returns Allow, deny, or unavailable with stable evidence.
   */
  authorize(request: VcsEffectRequest, capabilities: VcsCapabilities): VcsPermissionDecision {
    const permission = request.permission;
    if (!permission.operatorLogin) {
      return this._deny('identity-missing');
    }
    if (request.currentRevision !== request.revision) {
      return this._deny('revision-stale');
    }

    // #region START_AUTHORIZE_EFFECT_TRUTH_TABLE
    switch (request.kind) {
      case 'resolve':
      case 'reopen': {
        if (request.kind === 'reopen' && permission.automatic) {
          return this._deny('automatic-reopen-disabled');
        }
        const threadAuthor = permission.threadAuthor ?? '';
        if (threadAuthor === permission.operatorLogin) return this._allow('operator-thread');
        if (this._botAllowlist.has(threadAuthor) && permission.operatorIsMrAuthor) {
          return this._allow('allowlisted-bot-thread-on-owned-mr');
        }
        return this._deny(
          this._botAllowlist.has(threadAuthor) ? 'operator-does-not-own-mr' : 'foreign-thread'
        );
      }
      case 'request_changes':
        if (!capabilities.requestChanges) {
          return this._unavailable(`native-request-changes-unsupported:${capabilities.evidence}`);
        }
        if (!permission.reviewerPermission) return this._deny('reviewer-permission-missing');
        if (!request.body?.trim()) return this._deny('blocking-review-body-missing');
        return this._allow('native-request-changes-capability-and-permission');
      case 'approve':
      case 'unapprove':
        return permission.reviewerPermission
          ? this._allow('reviewer-permission')
          : this._deny('reviewer-permission-missing');
      case 'edit_description':
        return permission.operatorIsMrAuthor
          ? this._allow('mr-author')
          : this._deny('mr-ownership-missing');
      case 'comment':
      case 'reply':
      case 'react':
        return permission.reviewerPermission || permission.operatorIsMrAuthor
          ? this._allow('mr-participant-permission')
          : this._deny('mr-participant-permission-missing');
    }
    // #endregion END_AUTHORIZE_EFFECT_TRUTH_TABLE
  }

  /**
   * @purpose Materialize a positive policy decision.
   * @param evidence Stable reason supporting the decision.
   * @returns Positive decision that permits external I/O.
   */
  protected _allow(evidence: string): VcsPermissionDecision {
    return { allowed: true, status: 'no_op', evidence };
  }

  /**
   * @purpose Materialize a deterministic pre-I/O denial.
   * @param evidence Stable reason supporting the denial.
   * @returns Denial that prevents external I/O.
   */
  protected _deny(evidence: string): VcsPermissionDecision {
    return { allowed: false, status: 'denied', evidence };
  }

  /**
   * @purpose Materialize an unavailable native capability without creating an outcome effect.
   * @param evidence Stable capability evidence.
   * @returns Unavailable decision that prevents external I/O.
   */
  protected _unavailable(evidence: string): VcsPermissionDecision {
    return { allowed: false, status: 'unavailable', evidence };
  }
}
