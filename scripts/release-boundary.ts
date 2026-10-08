#!/usr/bin/env node

// @file: UV-27B shared fail-closed main-cutover inspector/authorizer and npm-publication denial.
// @spec: INFRA-BASE
// @consumers: package release-boundary/prepublish/release scripts; publish-next; publish-draft; release-it before:init

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @purpose Stable machine-readable denial shared by every repository-owned npm publish path. */
const NPM_PUBLICATION_DENIAL_CODE = 'UV27B_NPM_PUBLICATION_DENIED';
/** @purpose Human-readable current-track reason paired with the stable denial code. */
const NPM_PUBLICATION_DENIAL_MESSAGE =
  'npm publication is prohibited in the current main-cutover track';

const FULL_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_GIT_BUFFER = 32 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const POLICY_SCHEMA = 'gennady.release-boundary-policy.v1';
const CANDIDATE_SCHEMA = 'gennady.main-cutover-candidate.v1';
const ACK_PREFIX = 'gennady-main-cutover-ack-v1:';
const UV27A_SCHEMA = 'gennady.v1-eradication-report.v1';
const UV25_SCHEMA = 'gennady.rc-evidence-pack.v2';
const UV26_SCHEMA = 'gennady.e18-exact-evidence.v1';

/** @purpose Closed reviewed policy for exact cutover refs, evidence and authority surfaces. */
export type ReleaseBoundaryPolicy = {
  /** @purpose Version the fail-closed policy grammar. */
  schemaVersion: typeof POLICY_SCHEMA;
  /** @purpose Only local branch allowed to represent a cutover candidate. */
  releaseBranch: string;
  /** @purpose Exact remote-tracking ref the release HEAD must equal. */
  releaseUpstream: string;
  /** @purpose Exact remote-tracking ref defining the reviewed main base. */
  mainRef: string;
  /** @purpose Repo-relative immutable UV-25 evidence manifest. */
  uv25Manifest: string;
  /** @purpose Repo-relative independent UV-25 checker whose bytes are bound. */
  uv25Checker: string;
  /** @purpose Repo-relative exact E-18 evidence allowed after product source. */
  uv26Evidence: string;
  /** @purpose Product, config and spec bytes independently bound into candidate identity. */
  relevantFiles: string[];
  /** @purpose Active repository paths scanned for embedded npm publishing authority. */
  authorityScanPaths: string[];
  /** @purpose Credential environment names forbidden during cutover inspection/authorization. */
  forbiddenAuthEnvironment: string[];
};

type CutoverBlocker = { code: string; detail: string };
type DiffEntry = {
  oldMode: string;
  newMode: string;
  oldObject: string;
  newObject: string;
  status: 'A' | 'D' | 'M' | 'T' | 'U' | 'X';
  path: string;
};
type FileIdentity = { path: string; sha256: string };
type CandidateProjection = {
  schema: typeof CANDIDATE_SCHEMA;
  identity: {
    branch: string | null;
    releaseBranch: string;
    configuredUpstream: string | null;
    releaseUpstream: string;
    headSha: string | null;
    upstreamSha: string | null;
    releaseRemoteSha: string | null;
    mainRef: string;
    mainBaseSha: string | null;
    mainRemoteSha: string | null;
    evidenceSourceCommit: string | null;
    treeSha: string | null;
  };
  diff: {
    mainToCandidate: { entries: DiffEntry[]; digest: string };
    evidenceSourceToCandidate: { entries: DiffEntry[]; digest: string };
  };
  evidence: {
    uv27a: {
      schema: string | null;
      ok: boolean;
      policyDigest: string | null;
      inventoryDigest: string | null;
      reportDigest: string | null;
    };
    uv25: {
      schema: string | null;
      sourceCommit: string | null;
      manifestDigest: string | null;
      checkerDigest: string | null;
      checkerPassed: boolean;
    };
    uv26: {
      schema: string | null;
      sourceCommit: string | null;
      status: string | null;
      evidenceDigest: string | null;
    };
  };
  configuration: { files: FileIdentity[]; digest: string };
  authority: {
    forbiddenEnvironmentPresent: string[];
    embeddedAuthorityFindings: string[];
  };
};

/** @purpose Complete deterministic candidate identity, external challenge and typed blockers. */
export type CutoverCandidateReport = CandidateProjection & {
  candidateDigest: string;
  challenge: string;
  eligible: boolean;
  blockers: CutoverBlocker[];
};

type Uv27aReport = {
  schemaVersion?: unknown;
  ok?: unknown;
  policyDigest?: unknown;
  inventoryDigest?: unknown;
};
type Uv25Manifest = {
  schema?: unknown;
  sourceCommit?: unknown;
  commands?: unknown;
};
type Uv26Evidence = {
  schema?: unknown;
  sourceCommit?: unknown;
  status?: unknown;
  environment?: unknown;
};
/** @purpose Injectable read-only observations used by causal offline cutover tests. */
export type ReleaseBoundaryPorts = {
  /** @purpose Environment projection checked only for credential-name presence. */
  environment?: NodeJS.ProcessEnv;
  /**
   * @purpose Execute the fresh UV-27A machine report.
   * @param root Exact repository root.
   * @returns Bounded child status and streams.
   */
  runUv27a?: (root: string) => { status: number; stdout: string; stderr: string };
  /**
   * @purpose Execute the independent UV-25 pack checker.
   * @param root Exact repository root.
   * @param checker Repo-relative checker path.
   * @returns Bounded child status and streams.
   */
  runUv25Checker?: (
    root: string,
    checker: string
  ) => {
    status: number;
    stdout: string;
    stderr: string;
  };
  /** @purpose Deterministic race seam before authorization recomputes every candidate byte. */
  beforeAuthorizationRecheck?: () => void;
  /**
   * @purpose Resolve one exact remote branch SHA without mutating refs.
   * @param root Exact repository root.
   * @param ref Reviewed remote-tracking ref.
   * @returns Full remote SHA, or null when unavailable/malformed.
   */
  resolveRemoteRef?: (root: string, ref: string) => string | null;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], owner: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${owner} keys must be exactly: ${expected.join(', ')}`);
}

function strictString(value: unknown, owner: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new Error(`${owner} must be a non-empty normalized control-free string`);
  return value;
}

function strictStringArray(value: unknown, owner: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${owner} must be an array`);
  const result = value.map((entry, index) => strictString(entry, `${owner}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${owner} must be unique`);
  if (JSON.stringify(result) !== JSON.stringify([...result].sort(compareText)))
    throw new Error(`${owner} must be code-point sorted`);
  return result;
}

function repoPath(root: string, input: string): string {
  const value = strictString(input, 'repository path');
  if (isAbsolute(value)) throw new Error(`absolute repository path is forbidden: ${value}`);
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(`repository path escapes or names root: ${value}`);
  return rel.split(sep).join('/');
}

function safeGitRefSegments(value: string, owner: string): string[] {
  const ref = strictString(value, owner);
  if (
    ref.startsWith('-') ||
    ref.includes('..') ||
    ref.includes('@{') ||
    ref.includes('\\') ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.endsWith('.lock') ||
    /\s/u.test(ref) ||
    [...ref].some((character) => '~^:?*[]'.includes(character))
  )
    throw new Error(`${owner} is not a safe Git ref`);
  const segments = ref.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.startsWith('.') ||
        segment.endsWith('.') ||
        segment.endsWith('.lock') ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)
    )
  )
    throw new Error(`${owner} is not a safe Git ref`);
  return segments;
}

function safeGitBranch(value: string, owner: string): string {
  safeGitRefSegments(value, owner);
  return value;
}

function safeRemoteTrackingRef(value: string, owner: string): string {
  const segments = safeGitRefSegments(value, owner);
  if (segments.length < 2) throw new Error(`${owner} must include a safe remote and branch`);
  const remote = segments[0]!;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(remote) || remote.endsWith('.lock'))
    throw new Error(`${owner} has an unsafe remote name`);
  return value;
}

function validatePolicy(value: unknown, root: string): ReleaseBoundaryPolicy {
  if (!isRecord(value)) throw new Error('release-boundary policy must be an object');
  exactKeys(
    value,
    [
      'schemaVersion',
      'releaseBranch',
      'releaseUpstream',
      'mainRef',
      'uv25Manifest',
      'uv25Checker',
      'uv26Evidence',
      'relevantFiles',
      'authorityScanPaths',
      'forbiddenAuthEnvironment',
    ],
    'release-boundary policy'
  );
  if (value.schemaVersion !== POLICY_SCHEMA)
    throw new Error(`unsupported release-boundary policy schema: ${String(value.schemaVersion)}`);
  const releaseBranch = safeGitBranch(
    strictString(value.releaseBranch, 'releaseBranch'),
    'releaseBranch'
  );
  const releaseUpstream = safeRemoteTrackingRef(
    strictString(value.releaseUpstream, 'releaseUpstream'),
    'releaseUpstream'
  );
  const mainRef = safeRemoteTrackingRef(strictString(value.mainRef, 'mainRef'), 'mainRef');
  const policy: ReleaseBoundaryPolicy = {
    schemaVersion: POLICY_SCHEMA,
    releaseBranch,
    releaseUpstream,
    mainRef,
    uv25Manifest: repoPath(root, strictString(value.uv25Manifest, 'uv25Manifest')),
    uv25Checker: repoPath(root, strictString(value.uv25Checker, 'uv25Checker')),
    uv26Evidence: repoPath(root, strictString(value.uv26Evidence, 'uv26Evidence')),
    relevantFiles: strictStringArray(value.relevantFiles, 'relevantFiles').map((path) =>
      repoPath(root, path)
    ),
    authorityScanPaths: strictStringArray(value.authorityScanPaths, 'authorityScanPaths').map(
      (path) => repoPath(root, path)
    ),
    forbiddenAuthEnvironment: strictStringArray(
      value.forbiddenAuthEnvironment,
      'forbiddenAuthEnvironment'
    ),
  };
  const upstreamBranch = policy.releaseUpstream.slice(policy.releaseUpstream.indexOf('/') + 1);
  if (upstreamBranch !== policy.releaseBranch)
    throw new Error('releaseUpstream branch must equal releaseBranch');
  return policy;
}

function readPolicy(root: string): ReleaseBoundaryPolicy {
  const path = resolve(root, 'scripts/release-boundary.policy.json');
  return validatePolicy(JSON.parse(readFileSync(path, 'utf8')) as unknown, root);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function git(
  root: string,
  args: readonly string[],
  options: { allowFailure?: boolean; encoding?: 'utf8' | 'buffer' } = {}
): string | Buffer | null {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: MAX_GIT_BUFFER,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    if (options.allowFailure) return null;
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr ?? '');
    throw new Error(`git ${args[0] ?? '<missing>'} failed: ${stderr.trim().slice(0, 512)}`);
  }
  return result.stdout as string | Buffer;
}

function gitText(root: string, args: readonly string[], allowFailure = false): string | null {
  const output = git(root, args, { allowFailure, encoding: 'utf8' });
  return typeof output === 'string' ? output.trim() : null;
}

function gitObject(root: string, revision: string): string | null {
  const value = gitText(root, ['rev-parse', '--verify', `${revision}^{commit}`], true);
  return value !== null && FULL_SHA.test(value) ? value : null;
}

function defaultRemoteRef(root: string, trackingRef: string): string | null {
  const slash = trackingRef.indexOf('/');
  if (slash <= 0 || slash === trackingRef.length - 1) return null;
  const remote = trackingRef.slice(0, slash);
  const branch = trackingRef.slice(slash + 1);
  const result = spawnSync('git', ['ls-remote', '--refs', '--', remote, `refs/heads/${branch}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;
  const line = (result.stdout ?? '').trim();
  const match = /^([0-9a-f]{40})\trefs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.exec(line);
  return match?.[1] ?? null;
}

function parseRawDiff(bytes: Buffer): DiffEntry[] {
  const tokens = bytes.toString('utf8').split('\0');
  const result: DiffEntry[] = [];
  for (let index = 0; index < tokens.length - 1; index += 2) {
    const metadata = tokens[index] ?? '';
    const path = tokens[index + 1] ?? '';
    const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([ADMTUX])$/u.exec(
      metadata
    );
    if (!match || path.length === 0 || path.includes('\n') || path.includes('\r'))
      throw new Error('git raw diff contains an unsupported or malformed entry');
    result.push({
      oldMode: match[1]!,
      newMode: match[2]!,
      oldObject: match[3]!,
      newObject: match[4]!,
      status: match[5]! as DiffEntry['status'],
      path,
    });
  }
  return result.sort((left, right) => compareText(left.path, right.path));
}

function diffManifest(
  root: string,
  mainBaseSha: string | null,
  headSha: string | null
): DiffEntry[] {
  if (mainBaseSha === null || headSha === null) return [];
  if (gitObject(root, mainBaseSha) === null || gitObject(root, headSha) === null) return [];
  const output = git(
    root,
    ['diff-tree', '-r', '--raw', '-z', '--no-renames', mainBaseSha, headSha],
    { encoding: 'buffer' }
  );
  if (!Buffer.isBuffer(output)) throw new Error('git raw diff did not return bytes');
  return parseRawDiff(output);
}

function readHeadFile(root: string, headSha: string | null, path: string): Buffer | null {
  if (headSha === null) return null;
  const output = git(root, ['show', `${headSha}:${path}`], {
    allowFailure: true,
    encoding: 'buffer',
  });
  return Buffer.isBuffer(output) ? output : null;
}

function readRegularFile(root: string, path: string): Buffer | null {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return null;
  const stat = lstatSync(absolute);
  return stat.isFile() && !stat.isSymbolicLink() ? readFileSync(absolute) : null;
}

function fileIdentities(
  root: string,
  headSha: string | null,
  paths: readonly string[],
  blockers: CutoverBlocker[]
): FileIdentity[] {
  return paths.map((path) => {
    const bytes = readHeadFile(root, headSha, path);
    if (bytes === null) {
      blockers.push({ code: 'CUTOVER_CONFIG_MISSING', detail: path });
      return { path, sha256: '' };
    }
    return { path, sha256: sha256(bytes) };
  });
}

function defaultUv27a(root: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/check-v1-eradication.ts', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: MAX_GIT_BUFFER,
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function defaultUv25(
  root: string,
  checker: string
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', checker], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_BUFFER,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function uv27aEvidence(
  root: string,
  ports: ReleaseBoundaryPorts,
  blockers: CutoverBlocker[]
): CandidateProjection['evidence']['uv27a'] {
  const result = (ports.runUv27a ?? defaultUv27a)(root);
  let report: Uv27aReport | null = null;
  try {
    report = JSON.parse(result.stdout) as Uv27aReport;
  } catch {
    // Report validation below emits one bounded finding.
  }
  const valid =
    result.status === 0 &&
    isRecord(report) &&
    report.schemaVersion === UV27A_SCHEMA &&
    report.ok === true &&
    typeof report.policyDigest === 'string' &&
    SHA256.test(report.policyDigest) &&
    typeof report.inventoryDigest === 'string' &&
    SHA256.test(report.inventoryDigest);
  if (!valid)
    blockers.push({
      code: 'CUTOVER_UV27A_INVALID',
      detail: `fresh UV-27A report did not PASS (${result.stderr.trim().slice(0, 256) || 'invalid report'})`,
    });
  return {
    schema: typeof report?.schemaVersion === 'string' ? report.schemaVersion : null,
    ok: valid,
    policyDigest: typeof report?.policyDigest === 'string' ? report.policyDigest : null,
    inventoryDigest: typeof report?.inventoryDigest === 'string' ? report.inventoryDigest : null,
    reportDigest: report === null ? null : sha256(canonicalJson(report)),
  };
}

function uv25Evidence(
  root: string,
  policy: ReleaseBoundaryPolicy,
  ports: ReleaseBoundaryPorts,
  blockers: CutoverBlocker[]
): CandidateProjection['evidence']['uv25'] {
  const manifestBytes = readRegularFile(root, policy.uv25Manifest);
  const checkerBytes = readRegularFile(root, policy.uv25Checker);
  let manifest: Uv25Manifest | null = null;
  try {
    manifest =
      manifestBytes === null ? null : (JSON.parse(manifestBytes.toString('utf8')) as Uv25Manifest);
  } catch {
    // Validation below emits one stable finding.
  }
  const checker = (ports.runUv25Checker ?? defaultUv25)(root, policy.uv25Checker);
  const sourceCommit =
    isRecord(manifest) && typeof manifest.sourceCommit === 'string' ? manifest.sourceCommit : null;
  const validShape = isRecord(manifest) && manifest.schema === UV25_SCHEMA && sourceCommit !== null;
  if (!validShape || checker.status !== 0)
    blockers.push({
      code: 'CUTOVER_UV25_INVALID',
      detail: `UV-25 manifest/checker invalid (${checker.stderr.trim().slice(0, 256) || 'invalid manifest'})`,
    });
  return {
    schema: typeof manifest?.schema === 'string' ? manifest.schema : null,
    sourceCommit,
    manifestDigest: manifestBytes === null ? null : sha256(manifestBytes),
    checkerDigest: checkerBytes === null ? null : sha256(checkerBytes),
    checkerPassed: checker.status === 0,
  };
}

function uv26Evidence(
  root: string,
  policy: ReleaseBoundaryPolicy,
  evidenceSourceCommit: string | null,
  blockers: CutoverBlocker[]
): CandidateProjection['evidence']['uv26'] {
  const bytes = readRegularFile(root, policy.uv26Evidence);
  if (bytes === null) {
    blockers.push({ code: 'CUTOVER_UV26_MISSING', detail: policy.uv26Evidence });
    return { schema: null, sourceCommit: null, status: null, evidenceDigest: null };
  }
  let evidence: Uv26Evidence | null = null;
  try {
    evidence = JSON.parse(bytes.toString('utf8')) as Uv26Evidence;
  } catch {
    // Validation below emits one stable finding.
  }
  const valid =
    isRecord(evidence) &&
    evidence.schema === UV26_SCHEMA &&
    evidence.status === 'PASS' &&
    evidence.environment === 'cloud-ios' &&
    evidence.sourceCommit === evidenceSourceCommit;
  if (!valid)
    blockers.push({
      code: 'CUTOVER_UV26_INVALID',
      detail: 'exact E-18 evidence must be PASS/cloud-ios and bind exact evidence source commit',
    });
  return {
    schema: typeof evidence?.schema === 'string' ? evidence.schema : null,
    sourceCommit: typeof evidence?.sourceCommit === 'string' ? evidence.sourceCommit : null,
    status: typeof evidence?.status === 'string' ? evidence.status : null,
    evidenceDigest: sha256(bytes),
  };
}

function uv25AllowedPaths(root: string, policy: ReleaseBoundaryPolicy): string[] {
  const bytes = readRegularFile(root, policy.uv25Manifest);
  if (bytes === null) throw new Error('UV-25 manifest must be a regular non-symlink file');
  const value = JSON.parse(bytes.toString('utf8')) as Uv25Manifest;
  if (!Array.isArray(value.commands)) throw new Error('UV-25 manifest commands must be an array');
  const packRoot = dirname(policy.uv25Manifest);
  const result = [policy.uv25Manifest, `${packRoot}/README.md`];
  for (let index = 0; index < value.commands.length; index += 1) {
    const command = value.commands[index];
    if (!isRecord(command) || typeof command.logFile !== 'string')
      throw new Error(`UV-25 manifest command[${index}].logFile is invalid`);
    const logPath = repoPath(root, `${packRoot}/${command.logFile}`);
    if (!logPath.startsWith(`${packRoot}/logs/`))
      throw new Error(`UV-25 log path escapes frozen logs root: ${command.logFile}`);
    result.push(logPath);
  }
  const sorted = [...new Set(result)].sort(compareText);
  if (sorted.length !== result.length) throw new Error('UV-25 manifest contains duplicate paths');
  return sorted;
}

function validateEvidenceOnlyDelta(
  root: string,
  policy: ReleaseBoundaryPolicy,
  sourceCommit: string | null,
  headSha: string | null,
  entries: readonly DiffEntry[],
  blockers: CutoverBlocker[]
): void {
  if (sourceCommit === null || !FULL_SHA.test(sourceCommit)) {
    blockers.push({
      code: 'CUTOVER_EVIDENCE_SOURCE_INVALID',
      detail: 'UV-25 sourceCommit must be a full SHA',
    });
    return;
  }
  if (
    headSha === null ||
    git(root, ['merge-base', '--is-ancestor', sourceCommit, headSha], { allowFailure: true }) ===
      null
  ) {
    blockers.push({
      code: 'CUTOVER_EVIDENCE_SOURCE_NOT_ANCESTOR',
      detail: 'UV-25 sourceCommit must be an ancestor of candidate HEAD',
    });
    return;
  }
  let allowed: Set<string>;
  try {
    allowed = new Set([...uv25AllowedPaths(root, policy), policy.uv26Evidence]);
  } catch (error) {
    blockers.push({
      code: 'CUTOVER_EVIDENCE_ALLOWLIST_INVALID',
      detail: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const unexpected = entries.map(({ path }) => path).filter((path) => !allowed.has(path));
  if (unexpected.length > 0)
    blockers.push({
      code: 'CUTOVER_PRODUCT_DRIFT_AFTER_EVIDENCE_SOURCE',
      detail: unexpected.sort(compareText).join(', '),
    });
  const allowedChanged = new Set(entries.map(({ path }) => path));
  for (const path of allowed) {
    if (!existsSync(resolve(root, path)))
      blockers.push({ code: 'CUTOVER_EVIDENCE_FILE_MISSING', detail: path });
    else if (!allowedChanged.has(path) && readHeadFile(root, sourceCommit, path) === null) {
      blockers.push({
        code: 'CUTOVER_EVIDENCE_FILE_NOT_COMMITTED',
        detail: `${path} is neither in evidence delta nor source commit`,
      });
    }
  }
}

function trackedAuthorityFiles(root: string, scanPaths: readonly string[]): string[] {
  const output = git(root, ['ls-files', '-z', '--', ...scanPaths], {
    allowFailure: true,
    encoding: 'utf8',
  });
  return typeof output !== 'string' ? [] : output.split('\0').filter(Boolean).sort(compareText);
}

function authorityFindings(root: string, scanPaths: readonly string[]): string[] {
  const findings: string[] = [];
  for (const path of trackedAuthorityFiles(root, scanPaths)) {
    const absolute = resolve(root, path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      findings.push(`${path}:unsafe-file`);
      continue;
    }
    const content = readFileSync(absolute, 'utf8');
    if (/^\s*(?:_authToken|token)\s*=\s*[^${\s]/imu.test(content))
      findings.push(`${path}:embedded-npm-auth`);
    if (/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/u.test(content))
      findings.push(`${path}:embedded-token-authority`);
    if (/\b(?:npm\s+publish|release-it)\b/u.test(content))
      findings.push(`${path}:embedded-publish-command`);
    if (/\bnpm\s+publish\b[^\n]*--ignore-scripts\b/u.test(content))
      findings.push(`${path}:publish-ignore-scripts`);
  }
  return findings.sort(compareText);
}

function inspect(
  rootInput: string,
  policyInput?: ReleaseBoundaryPolicy,
  ports: ReleaseBoundaryPorts = {}
): CutoverCandidateReport {
  const root = resolve(rootInput);
  const policy = policyInput === undefined ? readPolicy(root) : validatePolicy(policyInput, root);
  const blockers: CutoverBlocker[] = [];
  const branch = gitText(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
  const configuredUpstream = gitText(
    root,
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    true
  );
  const headSha = gitObject(root, 'HEAD');
  const upstreamSha = gitObject(root, policy.releaseUpstream);
  const mainBaseSha = gitObject(root, policy.mainRef);
  const resolveRemoteRef = ports.resolveRemoteRef ?? defaultRemoteRef;
  const releaseRemoteSha = resolveRemoteRef(root, policy.releaseUpstream);
  const mainRemoteSha = resolveRemoteRef(root, policy.mainRef);
  const treeSha = headSha === null ? null : gitText(root, ['rev-parse', `${headSha}^{tree}`], true);

  if (branch !== policy.releaseBranch)
    blockers.push({ code: 'CUTOVER_WRONG_BRANCH', detail: `expected ${policy.releaseBranch}` });
  if (configuredUpstream !== policy.releaseUpstream)
    blockers.push({
      code: 'CUTOVER_WRONG_UPSTREAM',
      detail: `expected ${policy.releaseUpstream}`,
    });
  if (headSha === null)
    blockers.push({ code: 'CUTOVER_HEAD_INVALID', detail: 'HEAD is not a commit' });
  if (upstreamSha === null)
    blockers.push({ code: 'CUTOVER_UPSTREAM_MISSING', detail: policy.releaseUpstream });
  else if (headSha !== upstreamSha)
    blockers.push({
      code: 'CUTOVER_UPSTREAM_DIVERGED',
      detail: 'local HEAD must equal exact release upstream',
    });
  if (releaseRemoteSha === null)
    blockers.push({
      code: 'CUTOVER_RELEASE_REMOTE_UNAVAILABLE',
      detail: 'exact remote release branch could not be observed',
    });
  else if (releaseRemoteSha !== upstreamSha || releaseRemoteSha !== headSha)
    blockers.push({
      code: 'CUTOVER_RELEASE_REMOTE_STALE',
      detail: 'local release ref/HEAD does not equal remote branch SHA',
    });
  if (mainBaseSha === null)
    blockers.push({ code: 'CUTOVER_MAIN_BASE_MISSING', detail: policy.mainRef });
  else if (
    headSha === null ||
    git(root, ['merge-base', '--is-ancestor', mainBaseSha, headSha], { allowFailure: true }) ===
      null
  )
    blockers.push({
      code: 'CUTOVER_MAIN_NOT_ANCESTOR',
      detail: 'current main base must be an ancestor of candidate HEAD',
    });
  if (mainRemoteSha === null)
    blockers.push({
      code: 'CUTOVER_MAIN_REMOTE_UNAVAILABLE',
      detail: 'exact remote main branch could not be observed',
    });
  else if (mainRemoteSha !== mainBaseSha)
    blockers.push({
      code: 'CUTOVER_MAIN_REF_STALE',
      detail: 'local main remote-tracking ref does not equal remote main SHA',
    });
  const dirty = gitText(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (dirty !== '')
    blockers.push({ code: 'CUTOVER_DIRTY_WORKTREE', detail: 'tracked/untracked changes present' });

  const mainEntries = diffManifest(root, mainBaseSha, headSha);
  const files = fileIdentities(root, headSha, policy.relevantFiles, blockers);
  const environment = ports.environment ?? process.env;
  const forbiddenEnvironmentPresent = policy.forbiddenAuthEnvironment.filter(
    (name) => typeof environment[name] === 'string' && environment[name] !== ''
  );
  if (forbiddenEnvironmentPresent.length > 0)
    blockers.push({
      code: 'CUTOVER_NPM_AUTH_PRESENT',
      detail: `forbidden auth environment is present: ${forbiddenEnvironmentPresent.join(', ')}`,
    });
  const embeddedAuthorityFindings = authorityFindings(root, policy.authorityScanPaths);
  if (embeddedAuthorityFindings.length > 0)
    blockers.push({
      code: 'CUTOVER_EMBEDDED_PUBLISH_AUTHORITY',
      detail: embeddedAuthorityFindings.join(', '),
    });

  const uv25 = uv25Evidence(root, policy, ports, blockers);
  const evidenceEntries = diffManifest(root, uv25.sourceCommit, headSha);
  validateEvidenceOnlyDelta(root, policy, uv25.sourceCommit, headSha, evidenceEntries, blockers);
  const projection: CandidateProjection = {
    schema: CANDIDATE_SCHEMA,
    identity: {
      branch,
      releaseBranch: policy.releaseBranch,
      configuredUpstream,
      releaseUpstream: policy.releaseUpstream,
      headSha,
      upstreamSha,
      releaseRemoteSha,
      mainRef: policy.mainRef,
      mainBaseSha,
      mainRemoteSha,
      evidenceSourceCommit: uv25.sourceCommit,
      treeSha,
    },
    diff: {
      mainToCandidate: {
        entries: mainEntries,
        digest: sha256(canonicalJson(mainEntries)),
      },
      evidenceSourceToCandidate: {
        entries: evidenceEntries,
        digest: sha256(canonicalJson(evidenceEntries)),
      },
    },
    evidence: {
      uv27a: uv27aEvidence(root, ports, blockers),
      uv25,
      uv26: uv26Evidence(root, policy, uv25.sourceCommit, blockers),
    },
    configuration: { files, digest: sha256(canonicalJson(files)) },
    authority: { forbiddenEnvironmentPresent, embeddedAuthorityFindings },
  };
  const candidateDigest = sha256(canonicalJson(projection));
  blockers.sort((left, right) =>
    compareText(`${left.code}:${left.detail}`, `${right.code}:${right.detail}`)
  );
  return {
    ...projection,
    candidateDigest,
    challenge: `${ACK_PREFIX}${candidateDigest}`,
    eligible: blockers.length === 0,
    blockers,
  };
}

/**
 * @purpose Build one read-only exact candidate report without granting cutover authority.
 * @param root Exact repository root.
 * @param [ports] Optional deterministic observation seams.
 * @param [policy] Optional already-validated fixture policy.
 * @returns Versioned candidate identity, challenge and typed blockers.
 */
export function inspectCutoverCandidate(
  root: string,
  ports: ReleaseBoundaryPorts = {},
  policy?: ReleaseBoundaryPolicy
): CutoverCandidateReport {
  return inspect(root, policy, ports);
}

/**
 * @purpose Recompute an eligible candidate and match one external exact non-reusable ACK.
 * @param root Exact repository root.
 * @param ack External challenge response; never persisted.
 * @param [ports] Optional deterministic observation seams.
 * @param [policy] Optional already-validated fixture policy.
 * @returns The revalidated eligible candidate bound by ACK.
 */
export function authorizeCutoverCandidate(
  root: string,
  ack: string | undefined,
  ports: ReleaseBoundaryPorts = {},
  policy?: ReleaseBoundaryPolicy
): CutoverCandidateReport {
  ports.beforeAuthorizationRecheck?.();
  const report = inspect(root, policy, ports);
  if (!report.eligible)
    throw new Error(`UV27B_CUTOVER_BLOCKED: ${report.blockers.map(({ code }) => code).join(',')}`);
  if (ack === undefined) throw new Error('UV27B_ACK_MISSING: external exact ACK is required');
  if (ack !== report.challenge)
    throw new Error('UV27B_ACK_MISMATCH: ACK does not bind the current candidate digest');
  return report;
}

/**
 * @purpose Stop every supported npm publication path before its first side effect.
 * @param [_entrypoint] Bounded caller identity reserved for diagnostics without changing the denial.
 */
export function denyNpmPublication(_entrypoint = 'unknown'): void {
  throw new Error(`${NPM_PUBLICATION_DENIAL_CODE}: ${NPM_PUBLICATION_DENIAL_MESSAGE}`);
}

function parseArgs(argv: readonly string[]): {
  action: 'candidate' | 'authorize' | 'deny-publication';
  root: string;
  ack?: string;
  json: boolean;
} {
  let action: 'candidate' | 'authorize' | 'deny-publication' | undefined;
  let root = process.cwd();
  let ack: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === '--candidate' || token === '--authorize' || token === '--deny-publication') {
      if (action !== undefined) throw new Error('exactly one release-boundary action is required');
      action = token.slice(2) as 'candidate' | 'authorize' | 'deny-publication';
    } else if (token === '--root') root = argv[++index] ?? '';
    else if (token === '--ack') ack = argv[++index];
    else if (token === '--json') json = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  if (action === undefined)
    throw new Error('one of --candidate, --authorize, --deny-publication is required');
  if (root === '') throw new Error('--root requires a value');
  if (action !== 'authorize' && ack !== undefined)
    throw new Error('--ack is valid only with --authorize');
  return { action, root: resolve(root), ack, json };
}

function renderText(report: CutoverCandidateReport): string {
  return (
    `${report.eligible ? 'ELIGIBLE' : 'BLOCKED'} main-cutover ${report.candidateDigest}\n` +
    `head=${report.identity.headSha ?? '<missing>'} main=${report.identity.mainBaseSha ?? '<missing>'} ` +
    `tree=${report.identity.treeSha ?? '<missing>'}\n` +
    `challenge=${report.challenge}\n` +
    report.blockers.map(({ code, detail }) => `${code}: ${detail}\n`).join('')
  );
}

function isMain(): boolean {
  return (
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.action === 'deny-publication') denyNpmPublication('cli');
    const report =
      options.action === 'candidate'
        ? inspectCutoverCandidate(options.root)
        : authorizeCutoverCandidate(options.root, options.ack);
    process.stdout.write(
      options.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report)
    );
    process.exitCode = report.eligible ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
