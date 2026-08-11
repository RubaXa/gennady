// @file: ReadonlyEffectGuard — explicit deny-before-I/O adapter for real-readonly runtime profiles.
// @consumers: inbox-vcs runtime selection, contract tests
// @tasks: TSK-174

import type { VcsEffectPort } from './vcs-port.ts';

/** @purpose Machine-identifiable rejection raised by every readonly mutation surface. */
export class ReadonlyVcsEffectError extends Error {
  /** @purpose Stable error category for API/outcome adaptation. */
  readonly code = 'VCS_READONLY' as const;

  /**
   * @purpose Construct one deny-before-I/O result for a closed effect kind.
   * @param kind Effect operation rejected by the readonly boundary.
   */
  constructor(kind: keyof VcsEffectPort) {
    super(`[ReadonlyEffectGuard#${kind}] External VCS effects are disabled by runtime profile`);
    this.name = 'ReadonlyVcsEffectError';
  }
}

/**
 * @purpose Implement the complete effect port as a profile-level deny-before-I/O boundary.
 * @implements {VcsEffectPort} in ./vcs-port.ts
 * @invariant No method owns or calls a provider adapter; every effect fails locally.
 */
export class ReadonlyEffectGuard implements VcsEffectPort {
  /** @see {VcsEffectPort#postDiscussion} in ./vcs-port.ts */
  async postDiscussion(): Promise<void> {
    throw new ReadonlyVcsEffectError('postDiscussion');
  }

  /** @see {VcsEffectPort#postNote} in ./vcs-port.ts */
  async postNote(): Promise<void> {
    throw new ReadonlyVcsEffectError('postNote');
  }

  /** @see {VcsEffectPort#react} in ./vcs-port.ts */
  async react(): Promise<void> {
    throw new ReadonlyVcsEffectError('react');
  }

  /** @see {VcsEffectPort#resolve} in ./vcs-port.ts */
  async resolve(): Promise<void> {
    throw new ReadonlyVcsEffectError('resolve');
  }

  /** @see {VcsEffectPort#reopen} in ./vcs-port.ts */
  async reopen(): Promise<void> {
    throw new ReadonlyVcsEffectError('reopen');
  }

  /** @see {VcsEffectPort#approve} in ./vcs-port.ts */
  async approve(): Promise<void> {
    throw new ReadonlyVcsEffectError('approve');
  }

  /** @see {VcsEffectPort#unapprove} in ./vcs-port.ts */
  async unapprove(): Promise<void> {
    throw new ReadonlyVcsEffectError('unapprove');
  }

  /** @see {VcsEffectPort#requestChanges} in ./vcs-port.ts */
  async requestChanges(): Promise<void> {
    throw new ReadonlyVcsEffectError('requestChanges');
  }

  /** @see {VcsEffectPort#editDescription} in ./vcs-port.ts */
  async editDescription(): Promise<void> {
    throw new ReadonlyVcsEffectError('editDescription');
  }
}
