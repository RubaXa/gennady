// @file: MockRuntimeProfile — in-memory run-id-scoped state namespace without filesystem access.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import { join } from 'node:path';
import { ReviewRuntimeProfile } from '../../inbox-core/runtime-profile.ts';
import { RuntimeProfilePort } from '../../inbox-core/runtime-profile.port.ts';
import type { ReviewRuntimeBinding } from '../../inbox-core/types/review-runtime-binding.type.ts';
import type { ReviewRuntimeRoots } from '../../inbox-core/types/review-runtime-roots.type.ts';

/** @purpose Fixed disjoint mock namespace roots that never overlap production or test namespaces. */
const MOCK_ROOTS: ReviewRuntimeRoots = {
  production: '/mock-isolation/production',
  test: '/mock-isolation/test',
  mock: '/mock-isolation/mock',
};

/**
 * @purpose In-memory runtime profile port for deterministic scenarios without filesystem access.
 * @invariant openProfile never creates filesystem directories — binding is purely in-memory.
 * @invariant resetBoundTestRun rejects foreign run-id and production bindings identically to the real port.
 * @invariant No network or production filesystem access.
 */
export class MockRuntimeProfile extends RuntimeProfilePort {
  /**
   * @purpose Create a mock profile port over fixed disjoint mock namespace roots.
   */
  constructor() {
    super(MOCK_ROOTS);
  }

  /**
   * @purpose Open an in-memory profile binding without any filesystem side effects.
   * @param profile Validated namespace and external I/O contract.
   * @throws {Error} When already bound or profile combination is unsafe.
   * @returns In-memory binding consumed by mock adapters.
   */
  override async openProfile(profile: ReviewRuntimeProfile): Promise<ReviewRuntimeBinding> {
    if (this._binding) {
      throw new Error('[MockRuntimeProfile#openProfile] Runtime port is already bound');
    }
    // #region START_COMPOSE_MOCK_STATE_ROOT — non-production profiles get a run-scoped virtual root
    const stateRoot =
      profile.stateNamespace === 'production'
        ? MOCK_ROOTS.production
        : join(MOCK_ROOTS[profile.stateNamespace], profile.runId!);
    // #endregion END_COMPOSE_MOCK_STATE_ROOT

    this._binding = { profile, stateRoot, reopenedReadOnly: false };
    return this._binding;
  }

  /**
   * @purpose Reset the owned in-memory test namespace — no filesystem deletion occurs.
   * @invariant Foreign run-id, production, and mock namespace bindings are rejected.
   * @param runId Run identifier that must match the bound test profile.
   * @throws {Error} When the caller does not own a resettable test binding.
   * @returns Resolved when the reset guard passes — no filesystem side effects.
   */
  override async resetBoundTestRun(runId: string): Promise<void> {
    const binding = this._binding;
    if (
      !binding ||
      binding.profile.stateNamespace !== 'test' ||
      binding.profile.runId !== runId ||
      binding.reopenedReadOnly
    ) {
      throw new Error('[MockRuntimeProfile#resetBoundTestRun] Reset denied for foreign runtime');
    }
    // no-op filesystem side effects; in-memory reset is complete upon reaching here
  }

  /**
   * @purpose Compose a mock profile bound to the mock namespace for scenario construction.
   * @param runId Safe single-segment run identifier.
   * @returns MockRuntimeProfile pre-bound to the named mock run.
   */
  static forMockRun(runId: string): MockRuntimeProfile {
    const port = new MockRuntimeProfile();
    const profile = ReviewRuntimeProfile.compose({
      stateNamespace: 'mock',
      externalIoPolicy: 'deterministic-mock',
      runId,
    });
    void port.openProfile(profile);
    return port;
  }
}
