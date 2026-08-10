// @file: ReviewRuntimeProfile value object enforcing the closed runtime capability matrix.
// @consumers: RuntimeProfilePort, bootstrap, eval and mocks
// @tasks: TSK-172

import { join } from 'node:path';
import type { ReviewRuntimeProfileSpec } from './types/review-runtime-profile-spec.type.ts';
import type { ReviewRuntimeRoots } from './types/review-runtime-roots.type.ts';
import type { BootReadiness } from './boot-readiness.ts';

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * @purpose Observable boot error raised when runtime safety or namespace storage binding fails.
 * @invariant Captures the failed boot snapshot before any external adapter starts.
 */
export class BootstrapSafetyError extends Error {
  /** @purpose Failed readiness snapshot delivered to diagnostics and tests. */
  readonly bootState: ReturnType<BootReadiness['snapshot']>;

  /**
   * @purpose Preserve the failed boot state and the rejected safety/storage cause.
   * @param message Trace-prefixed runtime safety failure summary.
   * @param bootState Observable failed boot snapshot captured before adapters start.
   * @param cause Rejected profile or storage binding cause.
   */
  constructor(message: string, bootState: ReturnType<BootReadiness['snapshot']>, cause: unknown) {
    super(message, { cause });
    this.name = 'BootstrapSafetyError';
    this.bootState = bootState;
  }
}

/**
 * @purpose Immutable safety contract joining one local namespace to one external I/O policy.
 * @invariant Only production+real-work, test+real-readonly, test+real-effects and mock+deterministic-mock compose.
 * @invariant Real-effects requires an explicit allowlist identity before adapter composition.
 */
export class ReviewRuntimeProfile {
  /** @purpose Namespace owning all local state for this process. */
  readonly stateNamespace: ReviewRuntimeProfileSpec['stateNamespace'];
  /** @purpose External I/O capability available to this process. */
  readonly externalIoPolicy: ReviewRuntimeProfileSpec['externalIoPolicy'];
  /** @purpose Run identity outside production | @invariant Null for production */
  readonly runId: string | null;
  /** @purpose Identity of the effect allowlist validated at boot. */
  readonly effectAllowlistIdentity: string | null;

  /**
   * @purpose Materialize fields after the static composition gate proves the profile safe.
   * @param spec Validated runtime namespace and external I/O capability declaration.
   */
  protected constructor(spec: ReviewRuntimeProfileSpec) {
    this.stateNamespace = spec.stateNamespace;
    this.externalIoPolicy = spec.externalIoPolicy;
    this.runId = spec.runId ?? null;
    this.effectAllowlistIdentity = spec.effectAllowlistIdentity?.trim() || null;
  }

  /**
   * @purpose Compose one runtime profile after exhaustively validating namespace and I/O capabilities.
   * @param spec Requested namespace, I/O policy, run identity and optional effect allowlist identity.
   * @throws {Error} When the combination, run-id or allowlist contract is unsafe.
   * @returns Immutable profile safe to bind to a physical namespace.
   */
  static compose(spec: ReviewRuntimeProfileSpec): ReviewRuntimeProfile {
    const allowed =
      (spec.stateNamespace === 'production' && spec.externalIoPolicy === 'real-work') ||
      (spec.stateNamespace === 'test' && spec.externalIoPolicy === 'real-readonly') ||
      (spec.stateNamespace === 'test' && spec.externalIoPolicy === 'real-effects') ||
      (spec.stateNamespace === 'mock' && spec.externalIoPolicy === 'deterministic-mock');

    if (!allowed) {
      throw new Error(
        `[ReviewRuntimeProfile#compose] Unsafe runtime combination ${spec.stateNamespace}+${spec.externalIoPolicy}`
      );
    }

    if (spec.stateNamespace === 'production') {
      if (spec.runId || spec.effectAllowlistIdentity) {
        throw new Error(
          '[ReviewRuntimeProfile#compose] Production profile cannot carry run-id or test effect allowlist'
        );
      }
      return new ReviewRuntimeProfile(spec);
    }

    if (!spec.runId || !SAFE_RUN_ID.test(spec.runId) || spec.runId === '..') {
      throw new Error(
        '[ReviewRuntimeProfile#compose] Non-production profile requires a safe single-segment run-id'
      );
    }

    if (spec.externalIoPolicy === 'real-effects' && !spec.effectAllowlistIdentity?.trim()) {
      throw new Error(
        '[ReviewRuntimeProfile#compose] Real-effects profile requires an explicit effect allowlist identity'
      );
    }

    if (spec.externalIoPolicy !== 'real-effects' && spec.effectAllowlistIdentity) {
      throw new Error(
        '[ReviewRuntimeProfile#compose] Effect allowlist identity is valid only for real-effects profile'
      );
    }

    return new ReviewRuntimeProfile(spec);
  }

  /**
   * @purpose Resolve the lexical state root inside its namespace before physical canonicalization.
   * @param roots Namespace roots supplied by the composition root.
   * @returns Production root or a run-id child of the test/mock root.
   */
  resolveStateRoot(roots: ReviewRuntimeRoots): string {
    if (this.stateNamespace === 'production') return roots.production;
    return join(roots[this.stateNamespace], this.runId!);
  }

  /**
   * @purpose Derive the safe diagnostic profile used to reopen a saved real test run.
   * @throws {Error} When called for production or deterministic mock state.
   * @returns Test+real-readonly profile preserving the original run-id.
   */
  composeReadOnlyReopen(): ReviewRuntimeProfile {
    if (this.stateNamespace !== 'test' || !this.runId) {
      throw new Error(
        '[ReviewRuntimeProfile#composeReadOnlyReopen] Only a saved real test run can reopen read-only'
      );
    }
    return ReviewRuntimeProfile.compose({
      stateNamespace: 'test',
      externalIoPolicy: 'real-readonly',
      runId: this.runId,
    });
  }
}
