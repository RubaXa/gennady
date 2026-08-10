// @file: Filesystem-backed RuntimeProfilePort enforcing canonical namespace isolation and owned reset.
// @consumers: bootstrap, eval and mock harnesses
// @tasks: TSK-172

import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { access, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { logger } from '#logger';
import { ReviewRuntimeProfile } from './runtime-profile.ts';
import type { ReviewRuntimeBinding } from './types/review-runtime-binding.type.ts';
import type { ReviewRuntimeRoots } from './types/review-runtime-roots.type.ts';

const PROFILE_MARKER = '.review-runtime-profile.json';

type RuntimeProfileMarker = {
  stateNamespace: ReviewRuntimeProfile['stateNamespace'];
  runId: string | null;
  externalIoPolicy: ReviewRuntimeProfile['externalIoPolicy'];
  effectAllowlistIdentity: string | null;
};

/** @purpose Optional open policy for fresh, reopened or explicitly rooted profile state. */
export type OpenRuntimeProfileOptions = {
  /** @purpose Existing saved run must be opened without effects. */
  reopenReadOnly?: boolean;
  /** @purpose Explicit already-scoped root used by controlled test/CLI composition. */
  stateRootOverride?: string;
};

/**
 * @purpose Default physically separated roots outside the production work namespace.
 * @returns Production, test and mock roots with disjoint physical parents.
 */
export function composeDefaultReviewRuntimeRoots(): ReviewRuntimeRoots {
  return {
    production: join(homedir(), '.gennady'),
    test: join(tmpdir(), 'gennady-test-runs'),
    mock: join(tmpdir(), 'gennady-mock-runs'),
  };
}

/** @purpose Determine whether two canonical paths share any addressable namespace. */
function rootsOverlap(left: string, right: string): boolean {
  const leftToRight = relative(left, right);
  const rightToLeft = relative(right, left);
  const contains = (candidate: string): boolean =>
    candidate === '' || (!candidate.startsWith('..') && !isAbsolute(candidate));
  return contains(leftToRight) || contains(rightToLeft);
}

/**
 * @purpose Resolve symlinks in the existing prefix while preserving a not-yet-created suffix.
 * @param path Candidate namespace or run root.
 * @throws {Error} When an existing prefix cannot be inspected.
 * @returns Canonical physical path even when the final segments do not exist yet.
 */
async function canonicalizeFuturePath(path: string): Promise<string> {
  let cursor = resolve(path);
  const suffix: string[] = [];

  while (true) {
    try {
      const existing = await realpath(cursor);
      return resolve(existing, ...suffix.reverse());
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`[canonicalizeFuturePath] Cannot inspect physical path ${path}`, { cause });
      }
      const parent = dirname(cursor);
      if (parent === cursor) {
        throw new Error(`[canonicalizeFuturePath] No existing parent for ${path}`, { cause });
      }
      suffix.push(cursor.slice(parent.length + (parent.endsWith('/') ? 0 : 1)));
      cursor = parent;
    }
  }
}

/**
 * @purpose Process-scoped local implementation of the RuntimeProfilePort contract.
 * @invariant Canonical production, test and mock roots are pairwise non-overlapping.
 * @invariant Reset is available only for the currently bound test run-id.
 */
export class RuntimeProfilePort {
  /** @purpose Configured namespace roots awaiting physical canonicalization. */
  protected readonly _roots: ReviewRuntimeRoots;
  /** @purpose Active process binding; absent before a successful open. */
  protected _binding: ReviewRuntimeBinding | null = null;

  /**
   * @purpose Create a process-scoped port over the configured physical namespace roots.
   * @param [roots] Namespace roots that must remain pairwise physically disjoint.
   */
  constructor(roots: ReviewRuntimeRoots = composeDefaultReviewRuntimeRoots()) {
    this._roots = roots;
  }

  /**
   * @purpose Validate physical roots and open one fresh or diagnostic runtime namespace.
   * @invariant A port binds at most one profile for its process lifetime.
   * @param profile Validated namespace and external I/O contract.
   * @param [options] Reopen and explicit-root policy supplied by the composition root.
   * @throws {Error} On root collision, unsafe reopen, reused fresh run or storage failure.
   * @returns Canonical profile binding consumed by StateStore and adapters.
   * @sideEffect Filesystem: creates a fresh namespace marker unless reopening an existing run.
   */
  async openProfile(
    profile: ReviewRuntimeProfile,
    options: OpenRuntimeProfileOptions = {}
  ): Promise<ReviewRuntimeBinding> {
    logger.debug('[RuntimeProfilePort#openProfile] [idle → validating]', {
      namespace: profile.stateNamespace,
      io: profile.externalIoPolicy,
      runId: profile.runId,
    });

    if (this._binding) {
      throw new Error('[RuntimeProfilePort#openProfile] Runtime port is already bound');
    }
    if (options.reopenReadOnly && profile.externalIoPolicy !== 'real-readonly') {
      throw new Error(
        '[RuntimeProfilePort#openProfile] Saved runs can reopen only with real-readonly I/O'
      );
    }

    // #region START_ENFORCE_PHYSICAL_NAMESPACE_ISOLATION
    const canonicalRoots = {
      production: await canonicalizeFuturePath(this._roots.production),
      test: await canonicalizeFuturePath(this._roots.test),
      mock: await canonicalizeFuturePath(this._roots.mock),
    } satisfies ReviewRuntimeRoots;
    const pairs = [
      ['production', 'test'],
      ['production', 'mock'],
      ['test', 'mock'],
    ] as const;
    for (const [left, right] of pairs) {
      if (rootsOverlap(canonicalRoots[left], canonicalRoots[right])) {
        throw new Error(
          `[RuntimeProfilePort#openProfile] Runtime roots collide: ${left}=${canonicalRoots[left]} ${right}=${canonicalRoots[right]}`
        );
      }
    }
    // #endregion END_ENFORCE_PHYSICAL_NAMESPACE_ISOLATION

    const requestedRoot = options.stateRootOverride ?? profile.resolveStateRoot(canonicalRoots);
    const stateRoot = await canonicalizeFuturePath(requestedRoot);
    const owningRoot = canonicalRoots[profile.stateNamespace];
    if (!options.stateRootOverride && !rootsOverlap(owningRoot, stateRoot)) {
      throw new Error('[RuntimeProfilePort#openProfile] Resolved state root escaped its namespace');
    }
    for (const otherNamespace of ['production', 'test', 'mock'] as const) {
      if (
        otherNamespace !== profile.stateNamespace &&
        rootsOverlap(canonicalRoots[otherNamespace], stateRoot)
      ) {
        throw new Error(
          `[RuntimeProfilePort#openProfile] State root collides with ${otherNamespace} namespace`
        );
      }
    }

    // #region START_OPEN_OWNED_NAMESPACE
    try {
      const exists = await this._pathExists(stateRoot);
      if (options.reopenReadOnly) {
        if (!exists || profile.stateNamespace !== 'test') {
          throw new Error(
            '[RuntimeProfilePort#openProfile] Saved test run does not exist for read-only reopen'
          );
        }
        await this._verifyMarker(stateRoot, profile, true);
      } else if (profile.stateNamespace !== 'production' && exists && !options.stateRootOverride) {
        throw new Error(
          `[RuntimeProfilePort#openProfile] Fresh run-id already exists: ${profile.runId}`
        );
      } else if (profile.stateNamespace === 'production') {
        await mkdir(stateRoot, { recursive: true });
      } else {
        if (exists && (await this._pathExists(join(stateRoot, PROFILE_MARKER)))) {
          throw new Error(
            `[RuntimeProfilePort#openProfile] Explicit fresh root already belongs to a run: ${stateRoot}`
          );
        }
        await mkdir(stateRoot, { recursive: true });
        await this._writeMarker(stateRoot, profile);
      }
    } catch (cause) {
      const error = new Error('[RuntimeProfilePort#openProfile] Runtime namespace open failed', {
        cause,
      });
      logger.error('[RuntimeProfilePort#openProfile] [validating → failed]', { error });
      throw error;
    }
    // #endregion END_OPEN_OWNED_NAMESPACE

    this._binding = {
      profile,
      stateRoot,
      reopenedReadOnly: options.reopenReadOnly ?? false,
    };
    logger.info(`[RuntimeProfilePort#openProfile] [validating → bound] ${stateRoot}`);
    return this._binding;
  }

  /**
   * @purpose Reset only the currently bound real test run without addressing production bytes.
   * @invariant Foreign run-id, production, mock and reopened diagnostic bindings are rejected before deletion.
   * @param runId Test run identity expected to own the active binding.
   * @throws {Error} When the caller does not own a resettable test binding or marker verification fails.
   * @returns Completion after the owned test namespace is recreated with its marker.
   * @sideEffect Filesystem: removes and recreates only the owned test run root.
   */
  async resetBoundTestRun(runId: string): Promise<void> {
    const binding = this._binding;
    if (
      !binding ||
      binding.profile.stateNamespace !== 'test' ||
      binding.profile.runId !== runId ||
      binding.reopenedReadOnly
    ) {
      throw new Error('[RuntimeProfilePort#resetBoundTestRun] Reset denied for foreign runtime');
    }

    try {
      await this._verifyMarker(binding.stateRoot, binding.profile, false);
      await rm(binding.stateRoot, { recursive: true, force: false });
      await mkdir(binding.stateRoot, { recursive: true });
      await this._writeMarker(binding.stateRoot, binding.profile);
      logger.info(`[RuntimeProfilePort#resetBoundTestRun] [bound → reset] ${binding.stateRoot}`);
    } catch (cause) {
      const error = new Error('[RuntimeProfilePort#resetBoundTestRun] Test reset failed', {
        cause,
      });
      logger.error('[RuntimeProfilePort#resetBoundTestRun] [bound → failed]', { error });
      throw error;
    }
  }

  /**
   * @purpose Determine whether a path exists without treating absence as a storage failure.
   * @param path Candidate filesystem address.
   * @returns Whether the path is currently addressable.
   */
  protected async _pathExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw cause;
    }
  }

  /**
   * @purpose Persist the namespace ownership marker required before reset or reopen.
   * @param root Bound runtime root receiving the ownership marker.
   * @param profile Validated profile whose identity the marker records.
   * @returns Completion after the marker is durable.
   */
  protected async _writeMarker(root: string, profile: ReviewRuntimeProfile): Promise<void> {
    const marker: RuntimeProfileMarker = {
      stateNamespace: profile.stateNamespace,
      runId: profile.runId,
      externalIoPolicy: profile.externalIoPolicy,
      effectAllowlistIdentity: profile.effectAllowlistIdentity,
    };
    await writeFile(join(root, PROFILE_MARKER), `${JSON.stringify(marker)}\n`, 'utf8');
  }

  /**
   * @purpose Verify that an existing root belongs to the requested namespace/run before access.
   * @param root Existing runtime root whose marker is authoritative.
   * @param profile Requested runtime identity.
   * @param allowReadOnlyPolicyChange Whether a saved effects run may reopen under read-only I/O.
   * @returns Completion after marker ownership and policy are accepted.
   */
  protected async _verifyMarker(
    root: string,
    profile: ReviewRuntimeProfile,
    allowReadOnlyPolicyChange: boolean
  ): Promise<void> {
    const marker = JSON.parse(
      await readFile(join(root, PROFILE_MARKER), 'utf8')
    ) as RuntimeProfileMarker;
    const sameOwner =
      marker.stateNamespace === profile.stateNamespace && marker.runId === profile.runId;
    const samePolicy = marker.externalIoPolicy === profile.externalIoPolicy;
    if (!sameOwner || (!allowReadOnlyPolicyChange && !samePolicy)) {
      throw new Error('[RuntimeProfilePort#_verifyMarker] Runtime marker ownership mismatch');
    }
  }
}
