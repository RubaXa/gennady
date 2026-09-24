// @file: Content-addressed, lock-verified dependency bindings for flow-eval sandboxes.
// @spec: AI-SKILLS
// @consumers: provision.ts; dependency-store tests
//   The source checkout owns the single physical node_modules tree. A store entry is only a small
//   metadata + symlink farm whose identity proves which lock/toolchain contract it represents.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
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

/** @purpose One verified shared store plus its optional active-run lease. */
export type EvalDependencyStore = {
  fingerprint: string;
  directory: string;
  packageLinks: ReadonlyMap<string, string>;
  leaseFile?: string;
};

type PrepareDependencyStoreOptions = {
  sourceRoot: string;
  storeRoot: string;
  leaseId?: string;
  nowMs?: number;
};

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

async function hasActiveLease(directory: string): Promise<boolean> {
  try {
    return (await readdir(join(directory, 'leases'))).length > 0;
  } catch {
    return false;
  }
}

/** @purpose Bound inactive metadata stores by age and count; an active lease is never removed. */
async function pruneDependencyStores(
  storeRoot: string,
  options: { nowMs?: number; protectFingerprint?: string } = {}
): Promise<string[]> {
  const nowMs = options.nowMs ?? Date.now();
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(storeRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates: Array<{ name: string; path: string; mtimeMs: number; active: boolean }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(storeRoot, entry.name);
    const metadataPath = join(path, 'metadata.json');
    if (!existsSync(metadataPath)) continue;
    candidates.push({
      name: entry.name,
      path,
      mtimeMs: (await stat(metadataPath)).mtimeMs,
      active: await hasActiveLease(path),
    });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  const kept = candidates.filter(
    (entry) => entry.active || entry.name === options.protectFingerprint
  );
  const inactive = candidates.filter(
    (entry) => !entry.active && entry.name !== options.protectFingerprint
  );
  const removed: string[] = [];
  for (let index = 0; index < inactive.length; index++) {
    const entry = inactive[index];
    const overCount = kept.length + index >= SDD_EVAL_RETENTION_POLICY.dependencyStore.maxEntries;
    const expired = nowMs - entry.mtimeMs > SDD_EVAL_RETENTION_POLICY.dependencyStore.maxAgeMs;
    if (!overCount && !expired) continue;
    await rm(entry.path, { recursive: true, force: true });
    removed.push(entry.path);
  }
  return removed;
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
  await mkdir(options.storeRoot, { recursive: true });
  const existingStores = await readdir(options.storeRoot, { withFileTypes: true });
  const activeOtherStores = [];
  for (const entry of existingStores) {
    if (!entry.isDirectory() || entry.name === fingerprint) continue;
    const candidate = join(options.storeRoot, entry.name);
    if (await hasActiveLease(candidate)) activeOtherStores.push(candidate);
  }
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
      throw new Error(`locked dependency is missing from the installed store: ${name}`, { cause });
    });
    const rel = relative(sourceNodeModules, sourceReal);
    if (rel.startsWith('..') || rel === '') {
      throw new Error(`locked dependency resolves outside the installed store: ${name}`);
    }
    const target = join(directory, 'node_modules', name);
    await ensureSymlink(target, sourceReal);
    packageLinks.set(name, target);
  }
  await utimes(metadataPath, new Date(), new Date());
  let leaseFile: string | undefined;
  if (options.leaseId) {
    const leases = join(directory, 'leases');
    await mkdir(leases, { recursive: true });
    leaseFile = join(leases, `${sha256(options.leaseId)}.json`);
    await writeFile(
      leaseFile,
      `${JSON.stringify({ leaseId: options.leaseId, createdAt: new Date(options.nowMs ?? Date.now()).toISOString() })}\n`,
      'utf8'
    );
  }
  await pruneDependencyStores(options.storeRoot, {
    nowMs: options.nowMs,
    protectFingerprint: fingerprint,
  });
  return { fingerprint, directory, packageLinks, ...(leaseFile ? { leaseFile } : {}) };
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
