// @file: Read-only verification of the frozen MAIN reconciliation disposition and inert archive.
// @spec: INFRA-BASE
// @consumers: R4 acceptance, R5 reconciliation reviewer

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSourceOwnershipHeader } from '../shared/sdd/source-ownership-header.ts';
import { parseSpecId } from '../shared/sdd/spec-id.ts';

export const FROZEN_REFS = {
  main: '9663c65b6376c65f4b1df0daf27a06df5b25f7a3',
  releaseAudit: 'df39f8eff9d08caca5e3d90d313479cc50ed4fc0',
  mergeBase: '46c6d616700ee4cc61dbfe077d5b0052ce661dcd',
  releaseBase: '73bea8eb82897690e8d584982189d59e6edc3f50',
} as const;
export const ARCHIVE_ROOT = 'migration/frozen-main';
export const MANIFEST_PATH = `${ARCHIVE_ROOT}/manifest.json`;
export const DECISIONS_PATH = `${ARCHIVE_ROOT}/dispositions.json`;

type Disposition = 'retain' | 'adapt' | 'archive' | 'exclude';
type BlobIdentity = { oid: string; mode: string; sha256: string; bytes: number };
export type Delta = {
  status: string;
  oldPath: string;
  path: string;
  base: BlobIdentity | null;
  source: BlobIdentity | null;
};
export type Decision = {
  disposition: Disposition;
  owner: string;
  target: string | null;
  reason: string;
  proof: string[];
};
export type Decisions = { groups: Array<Decision & { paths: string[] }> };
type FileIdentity = { path: string; oid: string; sha256: string; bytes: number };
export type FrozenManifest = {
  schema: 'gennady.frozen-main-disposition';
  version: 1;
  refs: typeof FROZEN_REFS;
  parityClaim: false;
  commits: string[];
  decisionsDigest: string;
  rows: Array<Delta & { decision: Decision }>;
  currentProof: FileIdentity[];
};

function fail(code: string, detail: string): never {
  throw new Error(`MAIN_DISPOSITION_${code}: ${detail}`);
}

/** @purpose Git plumbing bound to one explicit repo; never uses a shell or external fixture refs. */
export function git(root: string, args: string[], input?: Buffer | string): Buffer {
  return execFileSync('git', ['-C', root, ...args], {
    input,
    timeout: 30_000,
    maxBuffer: 128 * 1024 * 1024,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|ALTERNATE_OBJECT_DIRECTORIES)$/.test(
            name
          )
      )
    ),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safePath(path: string): void {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    /[\\\x00-\x1f\x7f]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    fail('UNSAFE_PATH', String(path));
}

/** @purpose Read a regular repository file, rejecting traversal and symlink components. */
export function readSafe(root: string, path: string): Buffer {
  safePath(path);
  const canonicalRoot = realpathSync(root);
  let absolute = canonicalRoot;
  const segments = path.split('/');
  for (const [index, segment] of segments.entries()) {
    absolute = join(absolute, segment);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail('UNSAFE_PATH', `${path}: symlink`);
    if (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())
      fail('UNSAFE_PATH', `${path}: not a regular file path`);
  }
  if (relative(canonicalRoot, realpathSync(absolute)).startsWith('../')) fail('UNSAFE_PATH', path);
  return readFileSync(absolute);
}

function blob(bytesByOid: Map<string, Buffer>, oid: string, mode: string): BlobIdentity | null {
  if (/^0+$/.test(oid)) return null;
  const bytes = bytesByOid.get(oid);
  if (!bytes) fail('BLOB', oid);
  return { oid, mode, sha256: sha256(bytes), bytes: bytes.length };
}

/** @purpose Reconstruct the exact 520 reviewed delta records, preserving the rename preimage. */
export function sourceDelta(root: string): Delta[] {
  const parts = git(root, [
    'diff',
    '--raw',
    '--no-abbrev',
    '-z',
    '-M50%',
    FROZEN_REFS.mergeBase,
    FROZEN_REFS.main,
  ])
    .toString('utf8')
    .split('\0');
  const oids = [
    ...new Set(
      parts
        .filter((part) => part.startsWith(':'))
        .flatMap((part) => part.slice(1).split(' ').slice(2, 4))
        .filter((oid) => !/^0+$/.test(oid))
    ),
  ];
  const batch = git(root, ['cat-file', '--batch'], `${oids.join('\n')}\n`);
  const bytesByOid = new Map<string, Buffer>();
  let offset = 0;
  for (const oid of oids) {
    const end = batch.indexOf(10, offset);
    const [observed, type, size] = batch.subarray(offset, end).toString().split(' ');
    if (observed !== oid || type !== 'blob' || !/^\d+$/.test(size)) fail('BLOB', oid);
    offset = end + 1;
    bytesByOid.set(oid, batch.subarray(offset, offset + Number(size)));
    offset += Number(size) + 1;
  }
  const rows: Delta[] = [];
  for (let index = 0; parts[index]; ) {
    const header = parts[index++].slice(1).split(' ');
    const [oldMode, mode, oldOid, oid, status] = header;
    const oldPath = parts[index++];
    const path = status.startsWith('R') ? parts[index++] : oldPath;
    safePath(oldPath);
    safePath(path);
    rows.push({
      status,
      oldPath,
      path,
      base: blob(bytesByOid, oldOid, oldMode),
      source: blob(bytesByOid, oid, mode),
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function same(actual: unknown, expected: unknown, code: string, detail: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, detail);
}

export function sourceCommits(root: string): string[] {
  return git(root, [
    'rev-list',
    '--reverse',
    '--topo-order',
    `${FROZEN_REFS.releaseAudit}..${FROZEN_REFS.main}`,
  ])
    .toString('utf8')
    .trim()
    .split('\n');
}

function decisionsByPath(decisions: Decisions): Map<string, Decision> {
  const result = new Map<string, Decision>();
  for (const { paths, ...decision } of decisions.groups) {
    if (!['retain', 'adapt', 'archive', 'exclude'].includes(decision.disposition))
      fail('DECISION', 'unknown disposition');
    safePath(decision.owner);
    if (decision.target !== null) safePath(decision.target);
    if (!decision.reason?.trim() || !decision.proof.length)
      fail('DECISION', 'reason/proof required');
    for (const proof of decision.proof) safePath(proof);
    if (decision.disposition === 'adapt' && !decision.target)
      fail('DECISION', 'adapt target required');
    for (const path of paths) {
      safePath(path);
      if (result.has(path)) fail('DUPLICATE', path);
      result.set(path, decision);
    }
  }
  return result;
}

/** @purpose Capture current proof bytes, not a self-referential eventual commit identity. */
export function currentProof(root: string, decisions: Decisions): FileIdentity[] {
  const paths = new Set<string>([
    DECISIONS_PATH,
    `${ARCHIVE_ROOT}/README.md`,
    'scripts/main-carry-disposition.ts',
    'scripts/freeze-main-disposition.ts',
    'scripts/release-boundary.ts',
    'scripts/git-hooks/pre-commit',
    'scripts/v1-eradication.policy.json',
  ]);
  for (const decision of decisions.groups) {
    paths.add(decision.owner);
    if (decision.target) paths.add(decision.target);
    for (const proof of decision.proof) paths.add(proof);
    if (decision.disposition === 'retain') for (const path of decision.paths) paths.add(path);
  }
  return [...paths].sort().map((path) => {
    if (path === MANIFEST_PATH || path.startsWith(`${ARCHIVE_ROOT}/objects/`))
      fail('SELF_REFERENCE', path);
    const bytes = readSafe(root, path);
    return {
      path,
      oid: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      sha256: sha256(bytes),
      bytes: bytes.length,
    };
  });
}

/** @purpose Build a reviewable immutable source manifest; only the separate generator persists it. */
export function createFrozenManifest(root: string): FrozenManifest {
  const decisionBytes = readSafe(root, DECISIONS_PATH);
  const decisions = JSON.parse(decisionBytes.toString('utf8')) as Decisions;
  const byPath = decisionsByPath(decisions);
  const rows = sourceDelta(root).map((row) => {
    const decision = byPath.get(row.path);
    if (!decision) fail('MISSING', row.path);
    byPath.delete(row.path);
    return { ...row, decision };
  });
  if (byPath.size) fail('EXTRA', [...byPath.keys()].join(', '));
  return {
    schema: 'gennady.frozen-main-disposition',
    version: 1,
    refs: FROZEN_REFS,
    parityClaim: false,
    commits: sourceCommits(root),
    decisionsDigest: sha256(decisionBytes),
    rows,
    currentProof: currentProof(root, decisions),
  };
}

function archiveInventory(root: string, path: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (!entry.isFile()) fail('ARCHIVE_INVENTORY', `${child}: only inert regular blobs allowed`);
    if ((lstatSync(join(root, child)).mode & 0o111) !== 0)
      fail('ARCHIVE_INVENTORY', `${child}: executable archive`);
    readSafe(root, child);
    paths.push(child);
  }
  return paths.sort();
}

/** @purpose Check source exhaustiveness, inert archive, live refs/lineage and actual current proof. */
export function checkFrozenMain(
  root: string,
  options: { preReconciliation?: boolean } = {}
): {
  rows: number;
  commits: number;
  objects: number;
  counts: Record<Disposition, number>;
  manifestDigest: string;
} {
  const manifest = JSON.parse(readSafe(root, MANIFEST_PATH).toString('utf8')) as FrozenManifest;
  same(manifest.refs, FROZEN_REFS, 'REF', 'frozen refs changed');
  if (
    manifest.schema !== 'gennady.frozen-main-disposition' ||
    manifest.version !== 1 ||
    manifest.parityClaim !== false
  )
    fail('SCHEMA', 'not an immutable historical disposition');
  // Live freshness belongs to the mandatory release-boundary candidate check, not
  // permanent historical integrity after legitimate main advancement.
  if (options.preReconciliation) {
    const main = git(root, ['rev-parse', 'refs/remotes/origin/main']).toString('utf8').trim();
    if (main !== FROZEN_REFS.main)
      fail('REF_DRIFT', 'origin/main changed; new delta audit required');
    for (const ref of ['HEAD', 'refs/remotes/origin/codex/sdd-v2-rc52-followup']) {
      try {
        git(root, ['merge-base', '--is-ancestor', FROZEN_REFS.releaseBase, ref]);
      } catch {
        fail('LINEAGE', `${ref} does not descend from reviewed release base`);
      }
    }
    try {
      git(root, [
        'merge-base',
        '--is-ancestor',
        'refs/remotes/origin/codex/sdd-v2-rc52-followup',
        'HEAD',
      ]);
    } catch {
      fail('LINEAGE', 'HEAD is stale/divergent relative to current origin/release');
    }
  }
  const mergeBase = git(root, ['merge-base', FROZEN_REFS.main, FROZEN_REFS.releaseAudit])
    .toString('utf8')
    .trim();
  if (mergeBase !== FROZEN_REFS.mergeBase) fail('REF', 'wrong frozen merge base');
  if (manifest.rows.length !== 520 || manifest.commits.length !== 117)
    fail('COUNT', 'expected 520 delta records and 117 MAIN-only commits');
  const paths = manifest.rows.map((row) => row.path);
  if (new Set(paths).size !== paths.length) fail('DUPLICATE', 'delta path');
  const expected = createFrozenManifest(root);
  if (new Set(expected.rows.flatMap((row) => [row.oldPath, row.path])).size !== 521)
    fail('COUNT', 'expected 521 raw path identities including both rename sides');
  same(manifest.commits, expected.commits, 'COMMITS', 'MAIN-only commit refs changed');
  same(
    manifest.decisionsDigest,
    expected.decisionsDigest,
    'DECISION',
    'authoring decision bytes changed'
  );
  same(
    manifest.rows,
    expected.rows,
    'ROWS',
    'source blob, path, ref or disposition mapping changed'
  );
  same(
    manifest.currentProof,
    expected.currentProof,
    'CURRENT_DRIFT',
    'current target/owner/checker proof bytes changed'
  );
  const proofs = new Map(manifest.currentProof.map((proof) => [proof.path, proof]));
  const objects = new Map<string, BlobIdentity>();
  const counts: Record<Disposition, number> = { retain: 0, adapt: 0, archive: 0, exclude: 0 };
  for (const row of manifest.rows) {
    counts[row.decision.disposition]++;
    if (row.decision.disposition === 'adapt' && row.decision.target?.endsWith('.ts')) {
      const headers = parseSourceOwnershipHeader(
        readSafe(root, row.decision.target).toString('utf8')
      );
      const declared = headers.blocks.filter((block) => block.tag === 'spec');
      const owner = parseSpecId(readSafe(root, row.decision.owner).toString('utf8'));
      if (declared.length !== 1 || owner.status !== 'valid' || declared[0].value !== owner.id)
        fail('OWNER', `${row.path}: current declared source owner does not match mapping`);
    }
    if (row.decision.disposition === 'retain') {
      if (!row.source || proofs.get(row.path)?.oid !== row.source.oid)
        fail('FALSE_RETAIN', row.path);
    }
    for (const identity of [row.base, row.source])
      if (identity) objects.set(identity.oid, identity);
  }
  const objectPaths = [...objects.keys()]
    .map((oid) => `${ARCHIVE_ROOT}/objects/${oid}.blob`)
    .sort();
  same(
    readdirSync(join(root, ARCHIVE_ROOT)).sort(),
    ['README.md', 'dispositions.json', 'manifest.json', 'objects'],
    'ARCHIVE_INVENTORY',
    'undeclared archive root entry'
  );
  const objectDirectory = lstatSync(join(root, ARCHIVE_ROOT, 'objects'));
  if (!objectDirectory.isDirectory() || objectDirectory.isSymbolicLink())
    fail('ARCHIVE_INVENTORY', 'unsafe objects directory');
  same(
    archiveInventory(root, `${ARCHIVE_ROOT}/objects`),
    objectPaths,
    'ARCHIVE_INVENTORY',
    'missing or undeclared archive object'
  );
  for (const [oid, identity] of objects) {
    const bytes = readSafe(root, `${ARCHIVE_ROOT}/objects/${oid}.blob`);
    // Expected SHA-256/size came from actual Git blobs above, not archive-authored metadata.
    if (bytes.length !== identity.bytes || sha256(bytes) !== identity.sha256)
      fail('ARCHIVE_CORRUPTION', oid);
  }
  return {
    rows: manifest.rows.length,
    commits: manifest.commits.length,
    objects: objects.size,
    counts,
    manifestDigest: sha256(readSafe(root, MANIFEST_PATH)),
  };
}

if (
  process.argv[1] &&
  existsSync(resolve(process.argv[1])) &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const args = process.argv.slice(2);
    if (args.length && args.join(' ') !== '--pre-reconciliation')
      fail('ARGUMENT', 'only --pre-reconciliation is supported');
    process.stdout.write(
      `${JSON.stringify(checkFrozenMain(root, { preReconciliation: args.length > 0 }), null, 2)}\n`
    );
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
