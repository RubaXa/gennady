// @file: Content-addressed, lock-verified dependency bindings for flow-eval sandboxes.
// @spec: AI-SKILLS
// @consumers: provision.ts; dependency-store tests
//   The source checkout owns the single physical node_modules tree. A store entry is only a small
//   metadata + symlink farm whose identity proves which lock/toolchain contract it represents.

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { hostname as systemHostname } from 'node:os';
import { SDD_EVAL_RETENTION_POLICY } from './retention-policy.ts';

/** @purpose The only tool packages flow-eval may expose inside a scenario. */
export const EVAL_ALLOWED_DEPENDENCIES = [
  'jsdom',
  'mermaid',
  'tree-sitter',
  'tree-sitter-typescript',
  'typescript',
  'prettier',
  '@types/node',
  'c8',
] as const;

type PackageLockEntry = {
  version?: string;
  integrity?: string;
  resolved?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

type PackageLock = {
  lockfileVersion?: number;
  packages?: Record<string, PackageLockEntry>;
};

type DependencyStoreMetadata = {
  schema: 1;
  fingerprint: string;
  packageLockSha256: string;
  installedLockSha256: string;
  allowedDependencies: readonly string[];
  packages: readonly string[];
  nodeAbi: string;
  platform: string;
  arch: string;
  sourceNodeModules: string;
};

/** @purpose Unforgeable ownership capability for one active-run dependency lease. */
export type EvalDependencyLeaseHandle = {
  /** @purpose Exact regular lease file guarded by this capability. */
  readonly file: string;
  /** @purpose Secret identity that prevents a stale owner from mutating a replacement lease. */
  readonly ownerToken: string;
};

/** @purpose One verified shared store plus its optional active-run lease capability. */
export type EvalDependencyStore = {
  fingerprint: string;
  directory: string;
  packageLinks: ReadonlyMap<string, string>;
  /** @purpose Optional lease capability owned by the caller until lifecycle finalization. */
  lease?: EvalDependencyLeaseHandle;
};

type EvalDependencyLease = {
  readonly schema: 1;
  readonly leaseId: string;
  readonly ownerToken: string;
  readonly hostname: string;
  readonly pid: number;
  readonly createdAt: string;
  readonly heartbeatAt: string;
};

type LegacyEvalDependencyLease = {
  readonly leaseId: string;
  readonly createdAt: string;
};

type ParsedDependencyLease =
  | { readonly format: 'current'; readonly lease: EvalDependencyLease }
  | { readonly format: 'legacy'; readonly lease: LegacyEvalDependencyLease };

/** @purpose Injectable time/host/process evidence for deterministic lease lifecycle tests. */
export type EvalDependencyLeaseRuntime = {
  /** @purpose Supply deterministic wall-clock milliseconds.
   * @returns Current wall-clock milliseconds.
   */
  readonly nowMs?: () => number;
  /** @purpose Supply deterministic host identity.
   * @returns Host identity used for local PID liveness checks.
   */
  readonly hostname?: () => string;
  /** @purpose Probe whether a same-host PID is live.
   * @param pid Positive process identifier to inspect.
   * @returns True when the process exists or cannot be signalled due to permissions.
   */
  readonly isProcessAlive?: (pid: number) => boolean;
  /** @purpose Inject an adversarial update immediately before stale lease deletion.
   * @param leaseFile Exact stale lease candidate.
   * @returns Completion after the optional test mutation.
   */
  readonly beforeLeaseDelete?: (leaseFile: string) => void | Promise<void>;
  /** @purpose Inject a failure before persisting a newly-created lock owner.
   * @param ownerFile Exact owner metadata path.
   * @returns Completion after the optional test failure.
   */
  readonly beforeLockOwnerWrite?: (ownerFile: string) => void | Promise<void>;
  /** @purpose Inject an adversarial lock replacement before recovery deletion.
   * @param lockDirectory Exact captured lock directory.
   * @returns Completion after the optional test replacement.
   */
  readonly beforeLockRecoveryDelete?: (lockDirectory: string) => void | Promise<void>;
  /** @purpose Inject a failure after exclusive lease-temp creation but before its write.
   * @param temporaryFile Exact owned temporary file.
   * @returns Completion after the optional test failure.
   */
  readonly beforeLeaseTempWrite?: (temporaryFile: string) => void | Promise<void>;
};

type PrepareDependencyStoreOptions = {
  sourceRoot: string;
  storeRoot: string;
  leaseId?: string;
  nowMs?: number;
  runtime?: EvalDependencyLeaseRuntime;
};

type DependencyStoreLeaseState =
  | { readonly status: 'active'; readonly identity: string }
  | {
      readonly status: 'stale';
      readonly identity: string;
      readonly reason: 'dead-pid' | 'stale-heartbeat' | 'legacy-lease-expired';
    }
  | { readonly status: 'quarantined'; readonly reason: string };

/** @purpose One observable store/lease GC decision for dry-run and operator reports. */
export type EvalDependencyStoreGcEntry = {
  /** @purpose Exact lease or store path involved in the decision. */
  readonly path: string;
  /** @purpose Storage object category for the decision. */
  readonly kind: 'lease' | 'store';
  /** @purpose Observable action taken or proposed by GC. */
  readonly action: 'kept' | 'removed' | 'would-remove' | 'quarantined';
  /** @purpose Stable operator-facing explanation for the action. */
  readonly reason: string;
};

/** @purpose Complete deterministic dependency-store GC report. */
export type EvalDependencyStoreGcReport = {
  /** @purpose Deterministically ordered lease and store decisions. */
  readonly entries: readonly EvalDependencyStoreGcEntry[];
};

type DependencyStoreGcOptions = {
  readonly nowMs?: number;
  readonly protectFingerprint?: string;
  readonly dryRun?: boolean;
  readonly removeAllInactive?: boolean;
  readonly runtime?: EvalDependencyLeaseRuntime;
};

type StoreRootLock = { readonly token: string; readonly directory: string };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function packageKey(name: string): string {
  return `node_modules/${name}`;
}

function parseLock(path: string, contents: string): PackageLock {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (cause) {
    throw new Error(`invalid dependency lock JSON: ${path}`, { cause });
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`invalid dependency lock: ${path}`);
  const lock = parsed as PackageLock;
  if (lock.lockfileVersion !== 3 || !lock.packages) {
    throw new Error(`dependency lock must be npm package-lock v3 with packages: ${path}`);
  }
  return lock;
}

function sameInstalledEntry(expected: PackageLockEntry, installed: PackageLockEntry): boolean {
  return (
    expected.version === installed.version &&
    expected.integrity === installed.integrity &&
    expected.resolved === installed.resolved
  );
}

/** @purpose Validate the complete installed tree and every allowlisted root against package-lock. */
function validateDependencyContract(root: PackageLock, installed: PackageLock): string[] {
  for (const name of EVAL_ALLOWED_DEPENDENCIES) {
    const expected = root.packages?.[packageKey(name)];
    const actual = installed.packages?.[packageKey(name)];
    if (!expected || !actual || !sameInstalledEntry(expected, actual)) {
      throw new Error(
        `dependency contract mismatch for ${name}: package-lock.json and installed node_modules/.package-lock.json must match; run the approved install in the source checkout`
      );
    }
  }
  const installedPaths = Object.keys(installed.packages ?? {})
    .filter(Boolean)
    .sort();
  for (const path of installedPaths) {
    const expected = root.packages?.[path];
    const actual = installed.packages?.[path];
    if (!expected || !actual || !sameInstalledEntry(expected, actual)) {
      throw new Error(
        `dependency contract mismatch for ${path}: package-lock.json and installed node_modules/.package-lock.json must match; run the approved install in the source checkout`
      );
    }
  }
  return installedPaths;
}

function metadataEquals(left: DependencyStoreMetadata, right: DependencyStoreMetadata): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function ensureSymlink(target: string, source: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const existing = await lstat(target).catch(() => undefined);
  if (!existing) {
    await symlink(source, target, 'dir');
    return;
  }
  if (!existing.isSymbolicLink()) {
    throw new Error(`dependency target already exists and is not a symlink: ${target}`);
  }
  const literal = resolve(dirname(target), await readlink(target));
  if (literal !== resolve(source)) {
    throw new Error(`dependency symlink contract mismatch at ${target}: expected ${source}`);
  }
}

function runtimeNow(runtime?: EvalDependencyLeaseRuntime, fallback?: number): number {
  return fallback ?? runtime?.nowMs?.() ?? Date.now();
}

function runtimeHostname(runtime?: EvalDependencyLeaseRuntime): string {
  return runtime?.hostname?.() ?? systemHostname();
}

function processAlive(pid: number, runtime?: EvalDependencyLeaseRuntime): boolean {
  if (runtime?.isProcessAlive) return runtime.isProcessAlive(pid);
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function leaseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseLease(path: string, contents: string): ParsedDependencyLease {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (cause) {
    throw new Error(`corrupted dependency lease JSON: ${path}`, { cause });
  }
  if (!value || typeof value !== 'object') throw new Error(`corrupted dependency lease: ${path}`);
  const lease = value as Partial<EvalDependencyLease & LegacyEvalDependencyLease>;
  if (
    lease.schema === undefined &&
    hasExactKeys(value, ['createdAt', 'leaseId']) &&
    typeof lease.leaseId === 'string' &&
    lease.leaseId.length > 0 &&
    typeof lease.createdAt === 'string' &&
    leaseTimestamp(lease.createdAt) !== null
  ) {
    return {
      format: 'legacy',
      lease: { leaseId: lease.leaseId, createdAt: lease.createdAt },
    };
  }
  if (
    !hasExactKeys(value, [
      'createdAt',
      'heartbeatAt',
      'hostname',
      'leaseId',
      'ownerToken',
      'pid',
      'schema',
    ]) ||
    lease.schema !== 1 ||
    typeof lease.leaseId !== 'string' ||
    lease.leaseId.length === 0 ||
    typeof lease.ownerToken !== 'string' ||
    lease.ownerToken.length === 0 ||
    typeof lease.hostname !== 'string' ||
    lease.hostname.length === 0 ||
    !Number.isInteger(lease.pid) ||
    (lease.pid ?? 0) < 1 ||
    typeof lease.createdAt !== 'string' ||
    typeof lease.heartbeatAt !== 'string' ||
    leaseTimestamp(lease.createdAt) === null ||
    leaseTimestamp(lease.heartbeatAt) === null
  ) {
    throw new Error(`corrupted dependency lease schema: ${path}`);
  }
  return { format: 'current', lease: lease as EvalDependencyLease };
}

function parseCurrentLease(path: string, contents: string): EvalDependencyLease {
  const parsed = parseLease(path, contents);
  if (parsed.format !== 'current') {
    throw new Error(`legacy dependency lease cannot be refreshed or released: ${path}`);
  }
  return parsed.lease;
}

async function readLeaseState(
  leaseFile: string,
  nowMs: number,
  runtime?: EvalDependencyLeaseRuntime
): Promise<DependencyStoreLeaseState> {
  try {
    const entry = await lstat(leaseFile);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      return { status: 'quarantined', reason: 'lease path is not an ordinary file' };
    }
    const contents = await readFile(leaseFile, 'utf8');
    const parsed = parseLease(leaseFile, contents);
    const identity = sha256(contents);
    if (parsed.format === 'legacy') {
      const createdAt = leaseTimestamp(parsed.lease.createdAt)!;
      if (createdAt > nowMs + SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseHeartbeatMs) {
        return {
          status: 'quarantined',
          reason: 'legacy lease timestamp is implausibly in the future',
        };
      }
      if (nowMs - createdAt > SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs) {
        return { status: 'stale', identity, reason: 'legacy-lease-expired' };
      }
      return { status: 'active', identity };
    }
    const lease = parsed.lease;
    const heartbeat = leaseTimestamp(lease.heartbeatAt)!;
    if (heartbeat > nowMs + SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseHeartbeatMs) {
      return { status: 'quarantined', reason: 'lease heartbeat is implausibly in the future' };
    }
    if (nowMs - heartbeat > SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs) {
      return { status: 'stale', identity, reason: 'stale-heartbeat' };
    }
    if (lease.hostname === runtimeHostname(runtime) && !processAlive(lease.pid, runtime)) {
      return { status: 'stale', identity, reason: 'dead-pid' };
    }
    return { status: 'active', identity };
  } catch (cause) {
    return {
      status: 'quarantined',
      reason: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

async function removeExactCreatedPath(
  path: string,
  identity: { readonly dev: number; readonly ino: number }
): Promise<boolean> {
  const current = await lstat(path).catch(() => undefined);
  if (!current || current.dev !== identity.dev || current.ino !== identity.ino) return false;
  await rm(path, { recursive: current.isDirectory(), force: true });
  return true;
}

async function writeJsonAtomically(
  path: string,
  value: unknown,
  token: string,
  runtime?: EvalDependencyLeaseRuntime
): Promise<void> {
  const temporary = `${path}.${token}.${randomUUID()}.tmp`;
  let identity: { readonly dev: number; readonly ino: number } | undefined;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      const opened = await handle.stat();
      identity = { dev: opened.dev, ino: opened.ino };
      await runtime?.beforeLeaseTempWrite?.(temporary);
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch (cause) {
    if (identity) {
      try {
        await removeExactCreatedPath(temporary, identity);
      } catch (cleanupCause) {
        throw new AggregateError(
          [cause, cleanupCause],
          `atomic dependency lease write failed and its exact temporary file could not be removed: ${temporary}`
        );
      }
    }
    throw cause;
  }
}

async function acquireStoreRootLock(
  storeRoot: string,
  runtime?: EvalDependencyLeaseRuntime
): Promise<StoreRootLock> {
  await mkdir(storeRoot, { recursive: true });
  const storeRootEntry = await lstat(storeRoot);
  if (!storeRootEntry.isDirectory() || storeRootEntry.isSymbolicLink()) {
    throw new Error(`dependency store root is not an ordinary directory: ${storeRoot}`);
  }
  const directory = join(storeRoot, '.dependency-store.lock');
  const token = randomUUID();
  const nowMs = runtimeNow(runtime);
  const owner = {
    schema: 1,
    token,
    hostname: runtimeHostname(runtime),
    pid: process.pid,
    createdAt: new Date(nowMs).toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    let created = false;
    let createdIdentity: { readonly dev: number; readonly ino: number } | undefined;
    try {
      await mkdir(directory);
      created = true;
      const entry = await lstat(directory);
      createdIdentity = { dev: entry.dev, ino: entry.ino };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    }
    const ownerPath = join(directory, 'owner.json');
    if (created) {
      try {
        await runtime?.beforeLockOwnerWrite?.(ownerPath);
        await writeFile(join(directory, 'owner.json'), `${JSON.stringify(owner)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        const current = await lstat(directory);
        if (current.dev !== createdIdentity?.dev || current.ino !== createdIdentity.ino) {
          throw new Error('newly-created lock directory identity changed before owner persistence');
        }
        return { token, directory };
      } catch (cause) {
        const current = await lstat(directory).catch(() => undefined);
        if (
          current &&
          current.dev === createdIdentity?.dev &&
          current.ino === createdIdentity.ino
        ) {
          await rm(directory, { recursive: true, force: true });
        }
        throw new Error(`cannot write dependency store synchronization owner: ${ownerPath}`, {
          cause,
        });
      }
    }

    const lockEntry = await lstat(directory).catch(() => undefined);
    if (!lockEntry?.isDirectory() || lockEntry.isSymbolicLink()) {
      throw new Error(`dependency store synchronization lock path is unsafe: ${directory}`);
    }
    const scannedLockIdentity = { dev: lockEntry.dev, ino: lockEntry.ino };
    let current:
      | { schema: 1; token: string; hostname: string; pid: number; createdAt: string }
      | undefined;
    let invalidOwner: unknown;
    try {
      const value = JSON.parse(await readFile(ownerPath, 'utf8')) as unknown;
      if (
        !value ||
        typeof value !== 'object' ||
        !hasExactKeys(value, ['createdAt', 'hostname', 'pid', 'schema', 'token'])
      ) {
        throw new Error('invalid owner schema');
      }
      const candidate = value as Partial<NonNullable<typeof current>>;
      if (
        candidate.schema !== 1 ||
        typeof candidate.token !== 'string' ||
        candidate.token.length === 0 ||
        typeof candidate.hostname !== 'string' ||
        candidate.hostname.length === 0 ||
        !Number.isInteger(candidate.pid) ||
        (candidate.pid ?? 0) < 1 ||
        typeof candidate.createdAt !== 'string' ||
        leaseTimestamp(candidate.createdAt) === null
      ) {
        throw new Error('invalid owner schema');
      }
      current = candidate as NonNullable<typeof current>;
    } catch (cause) {
      invalidOwner = cause;
    }
    if (!current) {
      const incompleteAgeMs = nowMs - lockEntry.mtimeMs;
      if (incompleteAgeMs <= SDD_EVAL_RETENTION_POLICY.dependencyStore.lockStaleMs) {
        throw new Error(
          `dependency store synchronization lock owner is missing or corrupted but still fresh: ${ownerPath}`,
          { cause: invalidOwner }
        );
      }
      await runtime?.beforeLockRecoveryDelete?.(directory);
      await removeExactCreatedPath(directory, scannedLockIdentity);
      continue;
    }
    const sameHost = current.hostname === runtimeHostname(runtime);
    const deadSameHost = sameHost && !processAlive(current.pid, runtime);
    if (!deadSameHost) {
      throw new Error(`dependency store is busy: ${directory}`);
    }
    await runtime?.beforeLockRecoveryDelete?.(directory);
    await removeExactCreatedPath(directory, scannedLockIdentity);
  }
  throw new Error(`cannot acquire dependency store synchronization lock: ${directory}`);
}

async function releaseStoreRootLock(lock: StoreRootLock): Promise<void> {
  const ownerPath = join(lock.directory, 'owner.json');
  let owner: { token?: unknown };
  try {
    owner = JSON.parse(await readFile(ownerPath, 'utf8')) as typeof owner;
  } catch (cause) {
    throw new Error(`dependency store synchronization lock changed before release: ${ownerPath}`, {
      cause,
    });
  }
  if (owner.token !== lock.token) {
    throw new Error(`dependency store synchronization lock ownership changed: ${ownerPath}`);
  }
  await rm(lock.directory, { recursive: true, force: true });
}

async function withStoreRootLock<T>(
  storeRoot: string,
  runtime: EvalDependencyLeaseRuntime | undefined,
  operation: () => Promise<T>
): Promise<T> {
  const lock = await acquireStoreRootLock(storeRoot, runtime);
  try {
    return await operation();
  } finally {
    await releaseStoreRootLock(lock);
  }
}

type ScannedStore = {
  readonly name: string;
  readonly path: string;
  readonly mtimeMs: number;
  readonly active: boolean;
  readonly quarantined: boolean;
  readonly raceProtected: boolean;
};

async function scanAndCleanLeases(
  storeRoot: string,
  options: DependencyStoreGcOptions,
  report: EvalDependencyStoreGcEntry[]
): Promise<ScannedStore[]> {
  const nowMs = runtimeNow(options.runtime, options.nowMs);
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(storeRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const stores: ScannedStore[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name === '.dependency-store.lock') continue;
    const path = join(storeRoot, entry.name);
    const metadataPath = join(path, 'metadata.json');
    if (!existsSync(metadataPath)) continue;
    let active = false;
    let quarantined = false;
    let raceProtected = false;
    const leaseDirectory = join(path, 'leases');
    const leaseDirectoryEntry = await lstat(leaseDirectory).catch(() => undefined);
    if (
      leaseDirectoryEntry &&
      (!leaseDirectoryEntry.isDirectory() || leaseDirectoryEntry.isSymbolicLink())
    ) {
      quarantined = true;
      report.push({
        path: leaseDirectory,
        kind: 'lease',
        action: 'quarantined',
        reason: 'lease directory is not an ordinary directory',
      });
    }
    const leases =
      leaseDirectoryEntry?.isDirectory() && !leaseDirectoryEntry.isSymbolicLink()
        ? await readdir(leaseDirectory, { withFileTypes: true })
        : [];
    const scannedLeases: Array<{
      readonly leaseFile: string;
      readonly state: DependencyStoreLeaseState;
    }> = [];
    for (const leaseEntry of leases.sort((left, right) => left.name.localeCompare(right.name))) {
      const leaseFile = join(leaseDirectory, leaseEntry.name);
      const state = leaseEntry.isFile()
        ? await readLeaseState(leaseFile, nowMs, options.runtime)
        : ({ status: 'quarantined', reason: 'lease entry is not an ordinary file' } as const);
      scannedLeases.push({ leaseFile, state });
      if (state.status === 'active') {
        active = true;
        report.push({ path: leaseFile, kind: 'lease', action: 'kept', reason: 'active' });
      }
      if (state.status === 'quarantined') {
        quarantined = true;
        report.push({
          path: leaseFile,
          kind: 'lease',
          action: 'quarantined',
          reason: state.reason,
        });
      }
    }
    for (const { leaseFile, state } of scannedLeases) {
      if (state.status !== 'stale') continue;
      if (quarantined) {
        report.push({
          path: leaseFile,
          kind: 'lease',
          action: 'kept',
          reason: 'store contains quarantined lease evidence',
        });
        continue;
      }
      await options.runtime?.beforeLeaseDelete?.(leaseFile);
      const rechecked = await readLeaseState(
        leaseFile,
        runtimeNow(options.runtime, options.nowMs),
        options.runtime
      );
      if (rechecked.status !== 'stale' || rechecked.identity !== state.identity) {
        active ||= rechecked.status === 'active';
        quarantined ||= rechecked.status === 'quarantined';
        raceProtected ||= rechecked.identity !== state.identity;
        report.push({
          path: leaseFile,
          kind: 'lease',
          action: rechecked.status === 'quarantined' ? 'quarantined' : 'kept',
          reason: `changed-before-delete:${rechecked.status}`,
        });
        continue;
      }
      report.push({
        path: leaseFile,
        kind: 'lease',
        action: options.dryRun ? 'would-remove' : 'removed',
        reason: state.reason,
      });
      if (!options.dryRun) await rm(leaseFile, { force: true });
    }
    stores.push({
      name: entry.name,
      path,
      mtimeMs: (await stat(metadataPath)).mtimeMs,
      active,
      quarantined,
      raceProtected,
    });
  }
  return stores;
}

async function gcDependencyStoresLocked(
  storeRoot: string,
  options: DependencyStoreGcOptions = {}
): Promise<EvalDependencyStoreGcReport> {
  const nowMs = runtimeNow(options.runtime, options.nowMs);
  const report: EvalDependencyStoreGcEntry[] = [];
  const candidates = await scanAndCleanLeases(storeRoot, options, report);
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  const protectedCount = candidates.filter(
    (entry) =>
      entry.active ||
      entry.quarantined ||
      entry.raceProtected ||
      entry.name === options.protectFingerprint
  ).length;
  let keptInactive = 0;
  for (const entry of candidates) {
    if (
      entry.active ||
      entry.quarantined ||
      entry.raceProtected ||
      entry.name === options.protectFingerprint
    ) {
      report.push({
        path: entry.path,
        kind: 'store',
        action: entry.quarantined ? 'quarantined' : 'kept',
        reason: entry.quarantined
          ? 'contains a corrupted lease; explicit operator investigation required'
          : entry.raceProtected
            ? 'lease identity changed during GC; protected for this pass'
            : entry.active
              ? 'active lease'
              : 'protected current fingerprint',
      });
      continue;
    }
    const overCount =
      protectedCount + keptInactive >= SDD_EVAL_RETENTION_POLICY.dependencyStore.maxEntries;
    const expired = nowMs - entry.mtimeMs > SDD_EVAL_RETENTION_POLICY.dependencyStore.maxAgeMs;
    const remove = options.removeAllInactive || overCount || expired;
    report.push({
      path: entry.path,
      kind: 'store',
      action: remove ? (options.dryRun ? 'would-remove' : 'removed') : 'kept',
      reason: options.removeAllInactive
        ? 'explicit inactive-store clean'
        : expired
          ? 'retention age exceeded'
          : overCount
            ? 'retention count exceeded'
            : 'within retention',
    });
    if (remove) {
      if (!options.dryRun) await rm(entry.path, { recursive: true, force: true });
    } else {
      keptInactive += 1;
    }
  }
  return { entries: report };
}

/**
 * @purpose Report or collect stale leases and bounded inactive stores without deleting active or corrupted evidence.
 * @param storeRoot Exact shared dependency-store root.
 * @param [options] Clock, retention, dry-run, cleanup, and test-injection controls.
 * @returns Deterministically ordered GC decisions.
 */
export async function gcEvalDependencyStores(
  storeRoot: string,
  options: DependencyStoreGcOptions = {}
): Promise<EvalDependencyStoreGcReport> {
  if (options.dryRun && !existsSync(storeRoot)) return { entries: [] };
  return withStoreRootLock(storeRoot, options.runtime, () =>
    gcDependencyStoresLocked(storeRoot, options)
  );
}

/** @purpose Create or verify one content-addressed symlink store; never installs or copies packages. */
export async function prepareEvalDependencyStore(
  options: PrepareDependencyStoreOptions
): Promise<EvalDependencyStore> {
  const packageLockPath = join(options.sourceRoot, 'package-lock.json');
  const installedLockPath = join(options.sourceRoot, 'node_modules/.package-lock.json');
  const [packageLockContents, installedLockContents] = await Promise.all([
    readFile(packageLockPath, 'utf8'),
    readFile(installedLockPath, 'utf8'),
  ]).catch((cause: unknown) => {
    throw new Error(
      'flow-eval dependency reuse requires package-lock.json and node_modules/.package-lock.json',
      { cause }
    );
  });
  const packageLock = parseLock(packageLockPath, packageLockContents);
  const installedLock = parseLock(installedLockPath, installedLockContents);
  const packages = validateDependencyContract(packageLock, installedLock);
  const sourceNodeModules = await realpath(join(options.sourceRoot, 'node_modules'));
  const packageLockSha256 = sha256(packageLockContents);
  const installedLockSha256 = sha256(installedLockContents);
  const identity = {
    packageLockSha256,
    installedLockSha256,
    allowedDependencies: [...EVAL_ALLOWED_DEPENDENCIES].sort(),
    nodeAbi: process.versions.modules ?? 'unknown',
    platform: process.platform,
    arch: process.arch,
    sourceNodeModules,
  };
  const fingerprint = sha256(JSON.stringify(identity));
  const metadata: DependencyStoreMetadata = {
    schema: 1,
    fingerprint,
    ...identity,
    packages,
  };
  const directory = join(options.storeRoot, fingerprint);
  return withStoreRootLock(options.storeRoot, options.runtime, async () => {
    const nowMs = runtimeNow(options.runtime, options.nowMs);
    const before = await gcDependencyStoresLocked(options.storeRoot, {
      nowMs,
      protectFingerprint: fingerprint,
      runtime: options.runtime,
    });
    const quarantined = before.entries.filter(
      (entry) => entry.kind === 'lease' && entry.action === 'quarantined'
    );
    if (quarantined.length > 0) {
      throw new Error(
        `dependency store lease quarantine requires operator cleanup: ${quarantined
          .map((entry) => `${entry.path} (${entry.reason})`)
          .join(', ')}`
      );
    }
    const activeOtherStores = before.entries
      .filter(
        (entry) =>
          entry.kind === 'store' &&
          entry.action === 'kept' &&
          entry.reason === 'active lease' &&
          entry.path !== directory
      )
      .map((entry) => entry.path);
    if (
      options.leaseId &&
      activeOtherStores.length >= SDD_EVAL_RETENTION_POLICY.dependencyStore.maxEntries
    ) {
      throw new Error(
        `dependency store retention is full with active contracts: ${activeOtherStores.join(', ')}`
      );
    }

    const created = !existsSync(directory);
    if (created) await mkdir(directory);
    const metadataPath = join(directory, 'metadata.json');
    if (existsSync(metadataPath)) {
      const existing = parseLockMetadata(metadataPath, await readFile(metadataPath, 'utf8'));
      if (!metadataEquals(existing, metadata)) {
        throw new Error(`dependency store metadata mismatch: ${metadataPath}`);
      }
    } else if (created) {
      await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    } else {
      throw new Error(`dependency store is incomplete and cannot be reused: ${directory}`);
    }
    const packageLinks = new Map<string, string>();
    for (const name of EVAL_ALLOWED_DEPENDENCIES) {
      const source = join(sourceNodeModules, name);
      const sourceReal = await realpath(source).catch((cause: unknown) => {
        throw new Error(`locked dependency is missing from the installed store: ${name}`, {
          cause,
        });
      });
      const rel = relative(sourceNodeModules, sourceReal);
      if (rel.startsWith('..') || rel === '') {
        throw new Error(`locked dependency resolves outside the installed store: ${name}`);
      }
      const target = join(directory, 'node_modules', name);
      await ensureSymlink(target, sourceReal);
      packageLinks.set(name, target);
    }
    await utimes(metadataPath, new Date(nowMs), new Date(nowMs));
    let leaseHandle: EvalDependencyLeaseHandle | undefined;
    if (options.leaseId) {
      const leases = join(directory, 'leases');
      await mkdir(leases, { recursive: true });
      const leaseFile = join(leases, `${sha256(options.leaseId)}.json`);
      if (existsSync(leaseFile)) {
        throw new Error(`dependency lease already exists: ${leaseFile}`);
      }
      const timestamp = new Date(nowMs).toISOString();
      const lease: EvalDependencyLease = {
        schema: 1,
        leaseId: options.leaseId,
        ownerToken: randomUUID(),
        hostname: runtimeHostname(options.runtime),
        pid: process.pid,
        createdAt: timestamp,
        heartbeatAt: timestamp,
      };
      await writeJsonAtomically(leaseFile, lease, lease.ownerToken, options.runtime);
      leaseHandle = { file: leaseFile, ownerToken: lease.ownerToken };
    }
    await gcDependencyStoresLocked(options.storeRoot, {
      nowMs,
      protectFingerprint: fingerprint,
      runtime: options.runtime,
    });
    return { fingerprint, directory, packageLinks, ...(leaseHandle ? { lease: leaseHandle } : {}) };
  });
}

/** @purpose Refresh one owned lease under the same store synchronization used by GC. */
async function heartbeatEvalDependencyLease(
  handle: EvalDependencyLeaseHandle,
  runtime?: EvalDependencyLeaseRuntime
): Promise<void> {
  const leaseFile = resolve(handle.file);
  const storeRoot = dirname(dirname(dirname(resolve(leaseFile))));
  await withStoreRootLock(storeRoot, runtime, async () => {
    const entry = await lstat(leaseFile).catch(() => undefined);
    if (!entry?.isFile() || entry.isSymbolicLink()) {
      throw new Error(`dependency lease is missing or not an ordinary file: ${leaseFile}`);
    }
    const lease = parseCurrentLease(leaseFile, await readFile(leaseFile, 'utf8'));
    if (
      lease.hostname !== runtimeHostname(runtime) ||
      lease.pid !== process.pid ||
      lease.ownerToken !== handle.ownerToken
    ) {
      throw new Error(`dependency lease ownership changed before heartbeat: ${leaseFile}`);
    }
    const next: EvalDependencyLease = {
      ...lease,
      heartbeatAt: new Date(runtimeNow(runtime)).toISOString(),
    };
    await writeJsonAtomically(leaseFile, next, lease.ownerToken, runtime);
  });
}

/**
 * @purpose Release only the current process's intact lease under the GC synchronization lock.
 * @param handle Exact path and owner-token capability returned by store preparation.
 * @param [runtime] Optional deterministic host, clock, liveness, and failure injections.
 * @returns Completion after verified release, or rejection without deleting replacement evidence.
 */
export async function releaseEvalDependencyLease(
  handle: EvalDependencyLeaseHandle,
  runtime?: EvalDependencyLeaseRuntime
): Promise<void> {
  const exactLeaseFile = resolve(handle.file);
  const storeRoot = dirname(dirname(dirname(exactLeaseFile)));
  await withStoreRootLock(storeRoot, runtime, async () => {
    const entry = await lstat(exactLeaseFile).catch(() => undefined);
    if (!entry) return;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`dependency lease is not an ordinary file: ${exactLeaseFile}`);
    }
    const lease = parseCurrentLease(exactLeaseFile, await readFile(exactLeaseFile, 'utf8'));
    if (
      lease.hostname !== runtimeHostname(runtime) ||
      lease.pid !== process.pid ||
      lease.ownerToken !== handle.ownerToken
    ) {
      throw new Error(`dependency lease ownership changed before release: ${exactLeaseFile}`);
    }
    await rm(exactLeaseFile);
  });
}

/** @purpose Long-run heartbeat handle owned by the sandbox lifecycle. */
export type EvalDependencyLeaseHeartbeat = {
  /** @purpose Stop scheduling heartbeats and await any in-flight refresh.
   * @returns Completion after no heartbeat remains in flight.
   */
  readonly stop: () => Promise<void>;
  /** @purpose Read the first terminal heartbeat failure.
   * @returns Captured failure, or undefined while refreshes remain healthy.
   */
  readonly error: () => Error | undefined;
};

/**
 * @purpose Keep a live run's lease fresh until lifecycle cleanup stops the handle.
 * @param handle Exact path and owner-token capability returned by store preparation.
 * @param [options] Optional heartbeat interval and deterministic runtime injections.
 * @returns A handle that stops refreshes and exposes their first terminal failure.
 */
export function startEvalDependencyLeaseHeartbeat(
  handle: EvalDependencyLeaseHandle,
  options: { readonly intervalMs?: number; readonly runtime?: EvalDependencyLeaseRuntime } = {}
): EvalDependencyLeaseHeartbeat {
  const intervalMs =
    options.intervalMs ?? SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseHeartbeatMs;
  if (!Number.isFinite(intervalMs) || intervalMs < 1) {
    throw new Error('dependency lease heartbeat interval must be a positive finite number');
  }
  let stopped = false;
  let activeBeat: Promise<void> | undefined;
  let failure: Error | undefined;
  const beat = async (): Promise<void> => {
    if (activeBeat) return activeBeat;
    if (stopped || failure) return;
    let operation!: Promise<void>;
    operation = (async () => {
      try {
        await heartbeatEvalDependencyLease(handle, options.runtime);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        // A concurrent GC/setup owns the same short-lived lock. Retrying on the next interval keeps
        // liveness fail-closed without turning normal synchronization contention into lease death.
        if (!error.message.includes('dependency store is busy:')) failure = error;
      }
    })().finally(() => {
      if (activeBeat === operation) activeBeat = undefined;
    });
    activeBeat = operation;
    return operation;
  };
  const timer = setInterval(() => void beat(), intervalMs);
  timer.unref();
  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await activeBeat;
    },
    error: () => failure,
  };
}

function parseLockMetadata(path: string, contents: string): DependencyStoreMetadata {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (cause) {
    throw new Error(`invalid dependency store metadata: ${path}`, { cause });
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`invalid dependency store metadata: ${path}`);
  }
  return value as DependencyStoreMetadata;
}

/** @purpose Bind verified shared packages into one scenario without physical dependency copies. */
export async function bindEvalDependencies(
  scenarioDirectory: string,
  store: EvalDependencyStore
): Promise<void> {
  for (const [name, storeLink] of store.packageLinks) {
    // Bind directly to the verified physical package, not through the metadata store. A retained
    // debug sandbox therefore remains usable after an inactive metadata entry is collected.
    await ensureSymlink(join(scenarioDirectory, 'node_modules', name), await realpath(storeLink));
  }
}
