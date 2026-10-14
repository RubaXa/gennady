#!/usr/bin/env node

// @file: UV-26 exact cloud-ios/Xcode/Tuist evidence collector and independent derived checker.
// @spec: INFRA-BASE
// @consumers: release-boundary.ts; package release:e18 commands; UV-26 causal tests

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { xccovCoverageAdapter } from '../cli/cmd/testcov/xccov-coverage-adapter.ts';
import { resolveRemotePipelineObserver } from '../cli/cmd/verify/remote-provider.ts';
import { deriveGroupState, hasValidGroupReceipt } from '../shared/sdd/group-receipt.ts';
import {
  currentSddPhaseWorktreeDigest,
  validateCurrentSddPhaseAttempt,
} from '../shared/sdd/verify/sdd-attempt-journal.ts';
import {
  watchRemotePipeline,
  type RemotePipelineObserver,
} from '../shared/verify/execution/remote-watcher.ts';
import { createRepositoryRootCommandIdentity } from '../shared/verify/reporting/command-identity.ts';

const EVIDENCE_SCHEMA = 'gennady.e18-exact-evidence.v2';
const CHECK_SCHEMA = 'gennady.e18-exact-check.v1';
const CANONICAL_EVIDENCE = 'ai/flow-eval/.baseline/e18-exact-evidence.json';
const FULL_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_LOG_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const XCCOV_TIMEOUT_MS = 10 * 60 * 1000;
const REMOTE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_COMMAND_OUTPUT = 1024 * 1024;
const MAX_RECEIPT_BYTES = 256 * 1024;
const MAX_XCCOV_BYTES = 8 * 1024 * 1024;
const REQUIRED_TUIST_VERSION = '4.202.0';
const REVIEWED_CLOUD_IOS_BASE_SHA = 'd9de0f7c16824aff043be8332818154d9ed00960';
const COMMAND_ROLES = [
  'cloud-ios-execute',
  'remote-observe',
  'xcodebuild-coverage',
  'xccov-export',
] as const;

type CommandRole = (typeof COMMAND_ROLES)[number];
type CommandResult = { status: number | null; stdout: string; stderr: string };
type HostFacts = {
  macosVersion: string;
  xcodeVersion: string;
  developerDir: string;
  tuistVersion: string;
};
type E18Ports = {
  /** @internal @testOnly Self-contained Git fixture base; production CLI never supplies this seam. */
  reviewedCloudIosBaseSha?: string;
  platform?: NodeJS.Platform;
  run?: (
    cwd: string,
    command: string,
    args: readonly string[],
    timeoutMs?: number
  ) => CommandResult;
  now?: () => string;
  resolveRemote?: (
    root: string
  ) =>
    | { readonly ok: true; readonly observer: RemotePipelineObserver }
    | { readonly ok: false; readonly message: string; readonly fix: string };
  watchRemote?: typeof watchRemotePipeline;
};
type E18CheckContext = {
  /** @internal @testOnly Fixture base; CLI and release-boundary always use the immutable reviewed base. */
  reviewedCloudIosBaseSha?: string;
  evidenceBytes?: Buffer;
  resolveTree?: (sourceSha: string) => string | null;
};
type CommandEvidence = {
  id: string;
  role: CommandRole;
  argv: string[];
  argvIdentity: string;
  exitCode: number;
  signal: null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  log: { content: string; sha256: string; bytes: number; truncated: boolean };
};
type E18Evidence = {
  schema: typeof EVIDENCE_SCHEMA;
  sourceCommit: string;
  generatedAt: string;
  environment: 'cloud-ios';
  status: 'PASS';
  gennady: { sourceSha: string; treeSha: string };
  cloudIos: { headSha: string; baseSha: string; treeSha: string; clean: true };
  toolchain: HostFacts & { tuistConfigDigest: string };
  project: {
    workspace: string;
    scheme: string;
    destination: string;
    config: { path: string; content: string; sha256: string };
  };
  execution: {
    attempt: {
      id: string;
      task: string;
      phase: string;
      terminal: 'PASS';
      resultReceipt: 'R-COMPLETE';
      startedAt: string;
      finishedAt: string;
      rawEvidence: string;
      rawEvidenceDigest: string;
      currentWorktreeDigest: string;
    };
    groupReceipts: readonly [
      { kind: 'audit'; verdict: 'PASS'; identity: string; digest: string; raw: string },
      { kind: 'review'; verdict: 'PASS'; identity: string; digest: string; raw: string },
    ];
    groupState: { members: string[]; signature: string };
    artifact: { path: string; sha256: string };
    commands: CommandEvidence[];
  };
  remote: {
    provider: 'github' | 'gitlab';
    pipelineId: string;
    pipelineDefinitionId: string;
    exactSha: string;
    status: 'success';
    observedAt: string;
    jobs: { id: string; name: string; status: 'success' }[];
    rawWatcher: string;
    rawWatcherDigest: string;
  };
  coverage: {
    xcresult: {
      path: string;
      sha256: string;
      sourceSha: string;
      producedBy: string;
      createdAt: string;
    };
    xccov: { payload: string; sha256: string; commandId: string; observedAt: string };
    sources: { path: string; coveredLines: number; executableLines: number }[];
    duplicatePaths: string[];
    totals: { coveredLines: number; executableLines: number };
    thresholdBasisPoints: number;
    actualBasisPoints: number;
    verdict: 'PASS';
  };
};

type E18RunConfig = {
  schema: 'gennady.e18-run.v1';
  cloudIosBaseSha: string;
  task: string;
  sddPhase: string;
  owningSpec: string;
  groupMembers: string[];
  artifact: string;
  projectConfig: string;
  remote: { timeoutMs: number; pollIntervalMs: number };
};

type E18ProjectConfig = {
  workspace: string;
  scheme: string;
  destination: string;
  thresholdBasisPoints: number;
  coverageStepId: string;
  coverageTimeoutMs: number;
  xcresult: string;
  sourceRoots: string[];
};

/** @purpose Safe derived result consumed by release-boundary instead of authored evidence status. */
type E18CheckReport = {
  schema: typeof CHECK_SCHEMA;
  ok: boolean;
  derivedStatus: 'PASS' | 'INVALID';
  sourceCommit: string | null;
  gennadyTree: string | null;
  cloudIosSha: string | null;
  pipelineId: string | null;
  evidenceDigest: string | null;
  issues: string[];
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  owner: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${owner} must be an object`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${owner} keys must be exactly: ${expected.join(', ')}`);
  return record;
}

function strictString(value: unknown, owner: string, maxLength = 512): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new Error(`${owner} must be a bounded normalized control-free string`);
  return value;
}

function boundedPayload(value: unknown, owner: string, maxBytes: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value) > maxBytes ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    throw new Error(`${owner} must be bounded text without unsafe control bytes`);
  return value;
}

function exactString<T extends string>(value: unknown, expected: T, owner: string): T {
  if (value !== expected) throw new Error(`${owner} must be ${expected}`);
  return expected;
}

function enumString<T extends string>(value: unknown, allowed: readonly T[], owner: string): T {
  const text = strictString(value, owner);
  if (!allowed.includes(text as T)) throw new Error(`${owner} is unsupported`);
  return text as T;
}

function fullSha(value: unknown, owner: string): string {
  const text = strictString(value, owner, 40);
  if (!FULL_SHA.test(text)) throw new Error(`${owner} must be a lowercase full SHA`);
  return text;
}

function digest(value: unknown, owner: string): string {
  const text = strictString(value, owner, 64);
  if (!SHA256.test(text)) throw new Error(`${owner} must be a lowercase SHA-256`);
  return text;
}

function prefixedDigest(value: unknown, owner: string): string {
  const text = strictString(value, owner, 71);
  if (!/^sha256:[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`${owner} must be a canonical sha256 identity`);
  }
  return text;
}

function safeId(value: unknown, owner: string): string {
  const text = strictString(value, owner, 128);
  if (!SAFE_ID.test(text)) throw new Error(`${owner} must be a safe stable identity`);
  return text;
}

function integer(value: unknown, owner: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`${owner} must be an integer in ${minimum}..${maximum}`);
  return value as number;
}

function timestamp(value: unknown, owner: string): string {
  const text = strictString(value, owner, 32);
  const millis = Date.parse(text);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== text)
    throw new Error(`${owner} must be an exact ISO-8601 UTC timestamp`);
  return text;
}

function repoRelativePath(value: unknown, owner: string, suffix?: string): string {
  const text = strictString(value, owner, 512).replaceAll('\\', '/');
  if (
    isAbsolute(text) ||
    text.startsWith('/') ||
    text.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    (suffix !== undefined && !text.endsWith(suffix))
  )
    throw new Error(`${owner} must be a normalized repo-relative${suffix ?? ''} path`);
  return text;
}

function parseVersion(value: unknown, owner: string): { text: string; parts: number[] } {
  const text = strictString(value, owner, 64);
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:\s+.*)?$/u.exec(text);
  if (!match) throw new Error(`${owner} must begin with a semantic numeric version`);
  return { text, parts: [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] };
}

function versionAtLeast(parts: readonly number[], required: readonly number[]): boolean {
  for (let index = 0; index < Math.max(parts.length, required.length); index += 1) {
    const left = parts[index] ?? 0;
    const right = required[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

function parseCommand(value: unknown, index: number): CommandEvidence {
  const owner = `execution.commands[${index}]`;
  const record = exactRecord(
    value,
    [
      'id',
      'role',
      'argv',
      'argvIdentity',
      'exitCode',
      'signal',
      'startedAt',
      'finishedAt',
      'durationMs',
      'log',
    ],
    owner
  );
  if (!Array.isArray(record.argv) || record.argv.length === 0 || record.argv.length > 64)
    throw new Error(`${owner}.argv must be a bounded non-empty token list`);
  const argv = record.argv.map((token, tokenIndex) => {
    const text = strictString(token, `${owner}.argv[${tokenIndex}]`, 512);
    if (
      /(?:gh[pousr]_|github_pat_|glpat-|Bearer\s|NPM_TOKEN|NODE_AUTH_TOKEN|PRIVATE KEY)/iu.test(
        text
      ) ||
      /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\)/u.test(text)
    )
      throw new Error(`${owner}.argv contains a secret-like or absolute path token`);
    return text;
  });
  if (record.argvIdentity !== sha256(argv.join('\u0000')))
    throw new Error(`${owner}.argvIdentity does not match embedded argv`);
  const startedAt = timestamp(record.startedAt, `${owner}.startedAt`);
  const finishedAt = timestamp(record.finishedAt, `${owner}.finishedAt`);
  const durationMs = integer(record.durationMs, `${owner}.durationMs`, 0, 24 * 60 * 60 * 1000);
  if (Date.parse(finishedAt) - Date.parse(startedAt) !== durationMs)
    throw new Error(`${owner}.durationMs does not match timestamps`);
  if (record.signal !== null) throw new Error(`${owner}.signal must be null for PASS evidence`);
  const log = exactRecord(record.log, ['content', 'sha256', 'bytes', 'truncated'], `${owner}.log`);
  if (typeof log.truncated !== 'boolean') throw new Error(`${owner}.log.truncated must be boolean`);
  const logContent = typeof log.content === 'string' ? log.content : '';
  if (Buffer.byteLength(logContent) > MAX_LOG_BYTES)
    throw new Error(`${owner}.log.content exceeds the bounded evidence budget`);
  if (log.bytes !== Buffer.byteLength(logContent))
    throw new Error(`${owner}.log.bytes does not match embedded content`);
  if (log.sha256 !== sha256(logContent))
    throw new Error(`${owner}.log.sha256 does not match embedded content`);
  return {
    id: safeId(record.id, `${owner}.id`),
    role: enumString(record.role, COMMAND_ROLES, `${owner}.role`),
    argv,
    argvIdentity: digest(record.argvIdentity, `${owner}.argvIdentity`),
    exitCode: integer(record.exitCode, `${owner}.exitCode`, 0, 255),
    signal: null,
    startedAt,
    finishedAt,
    durationMs,
    log: {
      content: logContent,
      sha256: digest(log.sha256, `${owner}.log.sha256`),
      bytes: integer(log.bytes, `${owner}.log.bytes`, 0, MAX_LOG_BYTES),
      truncated: log.truncated,
    },
  };
}

function parseEvidence(value: unknown, reviewedBaseSha = REVIEWED_CLOUD_IOS_BASE_SHA): E18Evidence {
  const root = exactRecord(
    value,
    [
      'schema',
      'sourceCommit',
      'generatedAt',
      'environment',
      'status',
      'gennady',
      'cloudIos',
      'toolchain',
      'project',
      'execution',
      'remote',
      'coverage',
    ],
    'evidence'
  );
  exactString(root.schema, EVIDENCE_SCHEMA, 'evidence.schema');
  exactString(root.environment, 'cloud-ios', 'evidence.environment');
  exactString(root.status, 'PASS', 'evidence.status');
  const sourceCommit = fullSha(root.sourceCommit, 'evidence.sourceCommit');
  const generatedAt = timestamp(root.generatedAt, 'evidence.generatedAt');

  const gennady = exactRecord(root.gennady, ['sourceSha', 'treeSha'], 'evidence.gennady');
  const gennadySource = fullSha(gennady.sourceSha, 'evidence.gennady.sourceSha');
  if (gennadySource !== sourceCommit)
    throw new Error('evidence.gennady.sourceSha must equal evidence.sourceCommit');

  const cloudIos = exactRecord(
    root.cloudIos,
    ['headSha', 'baseSha', 'treeSha', 'clean'],
    'evidence.cloudIos'
  );
  if (cloudIos.clean !== true) throw new Error('evidence.cloudIos.clean must be true');
  const cloudHead = fullSha(cloudIos.headSha, 'evidence.cloudIos.headSha');
  if (fullSha(cloudIos.baseSha, 'evidence.cloudIos.baseSha') !== reviewedBaseSha)
    throw new Error('evidence.cloudIos.baseSha must equal the immutable reviewed cloud-ios base');

  const toolchain = exactRecord(
    root.toolchain,
    ['macosVersion', 'xcodeVersion', 'developerDir', 'tuistVersion', 'tuistConfigDigest'],
    'evidence.toolchain'
  );
  const macos = parseVersion(toolchain.macosVersion, 'evidence.toolchain.macosVersion');
  if (!versionAtLeast(macos.parts, [15, 0]))
    throw new Error('evidence.toolchain.macosVersion must be >= 15.0');
  const xcode = parseVersion(toolchain.xcodeVersion, 'evidence.toolchain.xcodeVersion');
  if (!versionAtLeast(xcode.parts, [16, 2]))
    throw new Error('evidence.toolchain.xcodeVersion must be >= 16.2');
  const developerDir = strictString(toolchain.developerDir, 'evidence.toolchain.developerDir', 256);
  if (!/^\/Applications\/[A-Za-z0-9 ._-]+\.app\/Contents\/Developer$/u.test(developerDir))
    throw new Error('evidence.toolchain.developerDir must identify one stable /Applications Xcode');
  const tuist = parseVersion(toolchain.tuistVersion, 'evidence.toolchain.tuistVersion');
  if (tuist.parts.join('.') !== REQUIRED_TUIST_VERSION)
    throw new Error(`evidence.toolchain.tuistVersion must be ${REQUIRED_TUIST_VERSION}`);

  const project = exactRecord(
    root.project,
    ['workspace', 'scheme', 'destination', 'config'],
    'evidence.project'
  );
  const projectConfigRecord = exactRecord(
    project.config,
    ['path', 'content', 'sha256'],
    'evidence.project.config'
  );
  const projectConfigContent = boundedPayload(
    projectConfigRecord.content,
    'evidence.project.config.content',
    MAX_RECEIPT_BYTES
  );
  if (projectConfigRecord.sha256 !== sha256(projectConfigContent))
    throw new Error('evidence.project.config.sha256 does not match embedded config');
  let parsedProjectConfig: ReturnType<typeof parseProjectConfig>;
  try {
    parsedProjectConfig = parseProjectConfig(JSON.parse(projectConfigContent) as unknown);
  } catch (cause) {
    throw new Error(
      `evidence.project.config is invalid: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  if (
    project.workspace !== parsedProjectConfig.workspace ||
    project.scheme !== parsedProjectConfig.scheme ||
    project.destination !== parsedProjectConfig.destination
  )
    throw new Error('evidence.project identity does not match embedded reviewed config');

  const execution = exactRecord(
    root.execution,
    ['attempt', 'groupReceipts', 'groupState', 'artifact', 'commands'],
    'evidence.execution'
  );
  const attempt = exactRecord(
    execution.attempt,
    [
      'id',
      'task',
      'phase',
      'terminal',
      'resultReceipt',
      'startedAt',
      'finishedAt',
      'rawEvidence',
      'rawEvidenceDigest',
      'currentWorktreeDigest',
    ],
    'evidence.execution.attempt'
  );
  const attemptStarted = timestamp(attempt.startedAt, 'evidence.execution.attempt.startedAt');
  const attemptFinished = timestamp(attempt.finishedAt, 'evidence.execution.attempt.finishedAt');
  if (Date.parse(attemptFinished) < Date.parse(attemptStarted))
    throw new Error('evidence.execution.attempt timestamps are reversed');
  exactString(attempt.terminal, 'PASS', 'evidence.execution.attempt.terminal');
  exactString(attempt.resultReceipt, 'R-COMPLETE', 'evidence.execution.attempt.resultReceipt');
  const attemptPhase = safeId(attempt.phase, 'evidence.execution.attempt.phase');
  const attemptTask = repoRelativePath(attempt.task, 'evidence.execution.attempt.task', '.md');
  const rawAttempt = strictString(
    attempt.rawEvidence,
    'evidence.execution.attempt.rawEvidence',
    MAX_RECEIPT_BYTES
  );
  if (attempt.rawEvidenceDigest !== sha256(rawAttempt))
    throw new Error(
      'evidence.execution.attempt.rawEvidenceDigest does not match embedded evidence'
    );
  let decodedAttempt: Record<string, unknown>;
  try {
    decodedAttempt = JSON.parse(Buffer.from(rawAttempt, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error('evidence.execution.attempt.rawEvidence is not a runner-owned payload');
  }
  if (
    decodedAttempt.runId !== attempt.id ||
    decodedAttempt.sddPhase !== attemptPhase ||
    decodedAttempt.state !== 'PASS' ||
    decodedAttempt.reportState !== 'complete'
  )
    throw new Error('evidence.execution.attempt does not match the embedded PASS attempt');
  const attemptIdentity = exactRecord(
    decodedAttempt.identity,
    ['headSha', 'worktreeDigest', 'scopeDigest', 'planDigest', 'configDigest', 'rulesDigest'],
    'evidence.execution.attempt.identity'
  );
  fullSha(attemptIdentity.headSha, 'evidence.execution.attempt.identity.headSha');
  if (
    prefixedDigest(
      attempt.currentWorktreeDigest,
      'evidence.execution.attempt.currentWorktreeDigest'
    ) !== attemptIdentity.worktreeDigest
  )
    throw new Error(
      'embedded attempt worktreeDigest must match the observed current cloud-ios product/config/rules bytes'
    );
  for (const field of [
    'worktreeDigest',
    'scopeDigest',
    'planDigest',
    'configDigest',
    'rulesDigest',
  ] as const) {
    prefixedDigest(attemptIdentity[field], `evidence.execution.attempt.identity.${field}`);
  }
  const decodedTrust = decodedAttempt.trust as Record<string, unknown> | undefined;
  if (decodedTrust?.resolved !== true)
    throw new Error('evidence.execution.attempt embedded trust is unresolved');
  if (!Array.isArray(execution.commands) || execution.commands.length !== COMMAND_ROLES.length)
    throw new Error(`evidence.execution.commands must contain ${COMMAND_ROLES.length} commands`);
  const commands = execution.commands.map(parseCommand);
  if (JSON.stringify(commands.map(({ role }) => role)) !== JSON.stringify(COMMAND_ROLES))
    throw new Error(`evidence.execution.commands order must be ${COMMAND_ROLES.join(' → ')}`);
  if (new Set(commands.map(({ id }) => id)).size !== commands.length)
    throw new Error('evidence.execution.commands ids must be unique');
  for (const role of COMMAND_ROLES) {
    const matching = commands.filter((command) => command.role === role);
    if (matching.length !== 1) throw new Error(`evidence must contain exactly one ${role} command`);
  }
  const executeCommand = commands.find(({ role }) => role === 'cloud-ios-execute')!;
  if (executeCommand.id !== attempt.id)
    throw new Error('cloud-ios execute command identity must equal the runner-owned attempt id');
  if (commands.some(({ exitCode }) => exitCode !== 0))
    throw new Error('PASS evidence requires every observed command to exit 0');
  if (
    Date.parse(executeCommand.startedAt) < Date.parse(attemptStarted) ||
    Date.parse(executeCommand.finishedAt) > Date.parse(attemptFinished)
  )
    throw new Error('cloud-ios execute command must be bounded by the recorded attempt');

  if (!Array.isArray(execution.groupReceipts) || execution.groupReceipts.length !== 2)
    throw new Error('evidence.execution.groupReceipts must contain audit and review');
  const receipts = execution.groupReceipts.map((entry, index) => {
    const receipt = exactRecord(
      entry,
      ['kind', 'verdict', 'identity', 'digest', 'raw'],
      `evidence.execution.groupReceipts[${index}]`
    );
    const raw = boundedPayload(
      receipt.raw,
      `evidence.execution.groupReceipts[${index}].raw`,
      MAX_RECEIPT_BYTES
    );
    if (receipt.digest !== sha256(raw))
      throw new Error(`evidence.execution.groupReceipts[${index}].digest does not match raw`);
    let rawReceipt: Record<string, unknown>;
    try {
      rawReceipt = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`evidence.execution.groupReceipts[${index}].raw is invalid JSON`);
    }
    return {
      kind: enumString(
        receipt.kind,
        ['audit', 'review'] as const,
        `evidence.execution.groupReceipts[${index}].kind`
      ),
      verdict: exactString(
        receipt.verdict,
        'PASS',
        `evidence.execution.groupReceipts[${index}].verdict`
      ),
      identity: safeId(receipt.identity, `evidence.execution.groupReceipts[${index}].identity`),
      digest: digest(receipt.digest, `evidence.execution.groupReceipts[${index}].digest`),
      raw,
      rawReceipt,
    };
  });
  if (receipts[0]?.kind !== 'audit' || receipts[1]?.kind !== 'review')
    throw new Error('evidence.execution.groupReceipts order must be audit, review');
  const groupReceipts: E18Evidence['execution']['groupReceipts'] = [
    {
      kind: 'audit',
      verdict: 'PASS',
      identity: receipts[0]!.identity,
      digest: receipts[0]!.digest,
      raw: receipts[0]!.raw,
    },
    {
      kind: 'review',
      verdict: 'PASS',
      identity: receipts[1]!.identity,
      digest: receipts[1]!.digest,
      raw: receipts[1]!.raw,
    },
  ];
  const groupState = exactRecord(
    execution.groupState,
    ['members', 'signature'],
    'evidence.execution.groupState'
  );
  if (!Array.isArray(groupState.members) || groupState.members.length === 0)
    throw new Error('evidence.execution.groupState.members must be non-empty');
  const groupMembers = groupState.members.map((member, index) =>
    repoRelativePath(member, `evidence.execution.groupState.members[${index}]`)
  );
  if (JSON.stringify(groupMembers) !== JSON.stringify([...groupMembers].sort(compareText)))
    throw new Error('evidence.execution.groupState.members must be code-point sorted');
  const groupSignature = strictString(
    groupState.signature,
    'evidence.execution.groupState.signature',
    80
  );
  for (const receipt of receipts) {
    if (
      receipt.rawReceipt.verdict !== 'PASS' ||
      receipt.rawReceipt.kind !== receipt.kind ||
      receipt.rawReceipt.signature !== groupSignature ||
      JSON.stringify(receipt.rawReceipt.members) !==
        JSON.stringify(groupMembers.map((member) => basename(member)))
    )
      throw new Error(`evidence.execution.groupReceipts ${receipt.kind} is stale or mismatched`);
  }
  const artifact = exactRecord(
    execution.artifact,
    ['path', 'sha256'],
    'evidence.execution.artifact'
  );
  const artifactPath = repoRelativePath(artifact.path, 'evidence.execution.artifact.path');
  const artifactDigest = digest(artifact.sha256, 'evidence.execution.artifact.sha256');

  const remote = exactRecord(
    root.remote,
    [
      'provider',
      'pipelineId',
      'pipelineDefinitionId',
      'exactSha',
      'status',
      'observedAt',
      'jobs',
      'rawWatcher',
      'rawWatcherDigest',
    ],
    'evidence.remote'
  );
  const remoteObservedAt = timestamp(remote.observedAt, 'evidence.remote.observedAt');
  const rawWatcher = boundedPayload(
    remote.rawWatcher,
    'evidence.remote.rawWatcher',
    MAX_RECEIPT_BYTES
  );
  if (remote.rawWatcherDigest !== sha256(rawWatcher))
    throw new Error('evidence.remote.rawWatcherDigest does not match embedded watcher payload');
  let watcher: Record<string, unknown>;
  try {
    watcher = JSON.parse(rawWatcher) as Record<string, unknown>;
  } catch {
    throw new Error('evidence.remote.rawWatcher is invalid JSON');
  }
  const watcherProof = watcher.proof as Record<string, unknown> | undefined;
  if (
    watcher.state !== 'REMOTE_SUCCESS' ||
    watcher.pipelineId !== remote.pipelineId ||
    watcherProof?.pipelineId !== remote.pipelineId ||
    watcherProof?.definitionId !== remote.pipelineDefinitionId ||
    watcherProof?.sourceSha !== remote.exactSha ||
    watcherProof?.pipelineSha !== remote.exactSha ||
    watcherProof?.terminalState !== 'REMOTE_SUCCESS' ||
    watcherProof?.provider !== remote.provider ||
    watcherProof?.observedAt !== remote.observedAt
  )
    throw new Error('evidence.remote normalized fields do not match embedded watcher payload');
  exactString(remote.status, 'success', 'evidence.remote.status');
  if (fullSha(remote.exactSha, 'evidence.remote.exactSha') !== cloudHead)
    throw new Error('evidence.remote.exactSha must equal cloud-ios HEAD');
  if (!Array.isArray(remote.jobs) || remote.jobs.length === 0)
    throw new Error('evidence.remote.jobs must be non-empty');
  const jobs = remote.jobs.map((entry, index) => {
    const job = exactRecord(entry, ['id', 'name', 'status'], `evidence.remote.jobs[${index}]`);
    return {
      id: safeId(job.id, `evidence.remote.jobs[${index}].id`),
      name: strictString(job.name, `evidence.remote.jobs[${index}].name`, 128),
      status: exactString(job.status, 'success', `evidence.remote.jobs[${index}].status`),
    };
  });
  if (new Set(jobs.map(({ id }) => id)).size !== jobs.length)
    throw new Error('evidence.remote.jobs ids must be unique');
  const rawJobs = Array.isArray(watcherProof?.jobs)
    ? (watcherProof.jobs as Record<string, unknown>[]).map((job) => ({
        id: job.id,
        name: job.name,
        status: job.rawStatus,
      }))
    : [];
  if (
    JSON.stringify(jobs) !==
    JSON.stringify(
      rawJobs.map((job) => ({ ...job, status: job.status === 'passed' ? 'success' : job.status }))
    )
  )
    throw new Error('evidence.remote jobs do not match embedded watcher proof');

  const coverage = exactRecord(
    root.coverage,
    [
      'xcresult',
      'xccov',
      'sources',
      'duplicatePaths',
      'totals',
      'thresholdBasisPoints',
      'actualBasisPoints',
      'verdict',
    ],
    'evidence.coverage'
  );
  const xcresult = exactRecord(
    coverage.xcresult,
    ['path', 'sha256', 'sourceSha', 'producedBy', 'createdAt'],
    'evidence.coverage.xcresult'
  );
  const xccov = exactRecord(
    coverage.xccov,
    ['payload', 'sha256', 'commandId', 'observedAt'],
    'evidence.coverage.xccov'
  );
  const xccovPayload = boundedPayload(
    xccov.payload,
    'evidence.coverage.xccov.payload',
    MAX_XCCOV_BYTES
  );
  if (xccov.sha256 !== sha256(xccovPayload))
    throw new Error('evidence.coverage.xccov.sha256 does not match embedded payload');
  const parsedXccov = xccovCoverageAdapter.parseReport(xccovPayload);
  const xcodeCommand = commands.find(({ role }) => role === 'xcodebuild-coverage')!;
  const xccovCommand = commands.find(({ role }) => role === 'xccov-export')!;
  const attemptProcesses = Array.isArray(decodedAttempt.processes)
    ? (decodedAttempt.processes as Record<string, unknown>[])
    : [];
  const boundProcesses = attemptProcesses.filter(
    (process) => process.stepId === parsedProjectConfig.coverageStepId
  );
  if (boundProcesses.length !== 1)
    throw new Error('embedded attempt must contain exactly one reviewed coverage process');
  const boundProcess = boundProcesses[0]!;
  const expectedXcodeArgv = [
    'xcodebuild',
    '-workspace',
    String(project.workspace),
    '-scheme',
    String(project.scheme),
    '-destination',
    String(project.destination),
    '-enableCodeCoverage',
    'YES',
    '-resultBundlePath',
    String(xcresult.path),
    'test',
  ];
  const expectedCoverageCommandIdentity = createRepositoryRootCommandIdentity({
    argv: expectedXcodeArgv,
    timeoutMs: parsedProjectConfig.coverageTimeoutMs,
  });
  if (
    boundProcess.status !== 'pass' ||
    boundProcess.identity !== xcodeCommand.id ||
    boundProcess.exitCode !== xcodeCommand.exitCode ||
    boundProcess.startedAt !== xcodeCommand.startedAt ||
    boundProcess.finishedAt !== xcodeCommand.finishedAt
  )
    throw new Error('xcodebuild command does not match the runner-owned coverage process');
  if (
    prefixedDigest(
      boundProcess.commandIdentity,
      'evidence.execution.attempt.processes[].commandIdentity'
    ) !== expectedCoverageCommandIdentity
  ) {
    throw new Error(
      'runner-owned coverage command identity does not match reviewed xcodebuild argv/cwd/env/timeout'
    );
  }
  if (xcresult.producedBy !== xcodeCommand.id)
    throw new Error('evidence.coverage.xcresult.producedBy must bind xcodebuild command');
  if (xccov.commandId !== xccovCommand.id)
    throw new Error('evidence.coverage.xccov.commandId must bind xccov command');
  if (fullSha(xcresult.sourceSha, 'evidence.coverage.xcresult.sourceSha') !== cloudHead)
    throw new Error('evidence.coverage.xcresult.sourceSha must equal cloud-ios HEAD');
  if (xcresult.path !== parsedProjectConfig.xcresult)
    throw new Error('evidence.coverage.xcresult.path does not match reviewed project config');
  const xcresultCreatedAt = timestamp(xcresult.createdAt, 'evidence.coverage.xcresult.createdAt');
  if (
    Date.parse(xcresultCreatedAt) < Date.parse(xcodeCommand.startedAt) ||
    Date.parse(xcresultCreatedAt) > Date.parse(xcodeCommand.finishedAt)
  )
    throw new Error('evidence.coverage.xcresult is stale relative to xcodebuild command');
  const xccovObservedAt = timestamp(xccov.observedAt, 'evidence.coverage.xccov.observedAt');
  if (Date.parse(xccovObservedAt) < Date.parse(xcodeCommand.finishedAt))
    throw new Error('evidence.coverage.xccov predates the current xcresult');

  if (!Array.isArray(coverage.duplicatePaths) || coverage.duplicatePaths.length !== 0)
    throw new Error('evidence.coverage.duplicatePaths must be empty');
  if (!Array.isArray(coverage.sources) || coverage.sources.length === 0)
    throw new Error('evidence.coverage.sources must be non-empty');
  const sources = coverage.sources.map((entry, index) => {
    const source = exactRecord(
      entry,
      ['path', 'coveredLines', 'executableLines'],
      `evidence.coverage.sources[${index}]`
    );
    const executableLines = integer(
      source.executableLines,
      `evidence.coverage.sources[${index}].executableLines`,
      1,
      Number.MAX_SAFE_INTEGER
    );
    const coveredLines = integer(
      source.coveredLines,
      `evidence.coverage.sources[${index}].coveredLines`,
      0,
      executableLines
    );
    return {
      path: repoRelativePath(source.path, `evidence.coverage.sources[${index}].path`, '.swift'),
      coveredLines,
      executableLines,
    };
  });
  const sourcePaths = sources.map(({ path }) => path);
  if (
    new Set(sourcePaths).size !== sourcePaths.length ||
    JSON.stringify(sourcePaths) !== JSON.stringify([...sourcePaths].sort(compareText))
  )
    throw new Error('evidence.coverage.sources must be unique and code-point sorted');
  const payloadTotals = Object.values(parsedXccov.metrics).reduce(
    (totals, metrics) => ({
      coveredLines: totals.coveredLines + metrics.sH,
      executableLines: totals.executableLines + metrics.sT,
    }),
    { coveredLines: 0, executableLines: 0 }
  );
  const totals = exactRecord(
    coverage.totals,
    ['coveredLines', 'executableLines'],
    'evidence.coverage.totals'
  );
  const coveredLines = sources.reduce((sum, source) => sum + source.coveredLines, 0);
  const executableLines = sources.reduce((sum, source) => sum + source.executableLines, 0);
  if (totals.coveredLines !== coveredLines || totals.executableLines !== executableLines)
    throw new Error('evidence.coverage.totals must equal normalized source totals');
  if (
    payloadTotals.coveredLines !== coveredLines ||
    payloadTotals.executableLines !== executableLines
  )
    throw new Error('evidence.coverage.sources do not match embedded xccov payload');
  const thresholdBasisPoints = integer(
    coverage.thresholdBasisPoints,
    'evidence.coverage.thresholdBasisPoints',
    0,
    10_000
  );
  if (thresholdBasisPoints !== parsedProjectConfig.thresholdBasisPoints)
    throw new Error('evidence.coverage threshold does not match embedded reviewed config');
  const actualBasisPoints = Math.floor((coveredLines * 10_000) / executableLines);
  if (coverage.actualBasisPoints !== actualBasisPoints)
    throw new Error('evidence.coverage.actualBasisPoints must be derived from normalized totals');
  exactString(coverage.verdict, 'PASS', 'evidence.coverage.verdict');
  if (actualBasisPoints < thresholdBasisPoints)
    throw new Error('evidence.coverage threshold is not satisfied');

  if (
    Date.parse(remoteObservedAt) < Date.parse(executeCommand.finishedAt) ||
    Date.parse(generatedAt) <
      Math.max(
        Date.parse(attemptFinished),
        Date.parse(remoteObservedAt),
        Date.parse(xccovObservedAt)
      )
  )
    throw new Error('evidence timestamps do not preserve execute → CI → coverage → evidence order');

  const expectedCommands: Readonly<Record<CommandRole, readonly string[]>> = {
    'cloud-ios-execute': ['gennady', 'sdd-verify', '--task', attemptTask, '--phase', attemptPhase],
    'remote-observe': [
      'gennady:remote-watcher',
      String(remote.provider),
      String(remote.exactSha),
      String(remote.pipelineId),
    ],
    'xcodebuild-coverage': expectedXcodeArgv,
    'xccov-export': ['xcrun', 'xccov', 'view', '--report', '--json', String(xcresult.path)],
  };
  for (const command of commands) {
    if (JSON.stringify(command.argv) !== JSON.stringify(expectedCommands[command.role]))
      throw new Error(`evidence.execution command ${command.role} argv is not canonical`);
  }

  const safeProjection = JSON.stringify(root);
  if (
    /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\)/u.test(
      safeProjection.replaceAll(developerDir, '')
    ) ||
    /(?:gh[pousr]_|github_pat_|glpat-|Bearer\s|NPM_TOKEN|NODE_AUTH_TOKEN|PRIVATE KEY)/iu.test(
      safeProjection
    )
  )
    throw new Error('evidence contains a secret-like value or absolute developer/temp path');

  return {
    schema: EVIDENCE_SCHEMA,
    sourceCommit,
    generatedAt,
    environment: 'cloud-ios',
    status: 'PASS',
    gennady: {
      sourceSha: gennadySource,
      treeSha: fullSha(gennady.treeSha, 'evidence.gennady.treeSha'),
    },
    cloudIos: {
      headSha: cloudHead,
      baseSha: fullSha(cloudIos.baseSha, 'evidence.cloudIos.baseSha'),
      treeSha: fullSha(cloudIos.treeSha, 'evidence.cloudIos.treeSha'),
      clean: true,
    },
    toolchain: {
      macosVersion: macos.text,
      xcodeVersion: xcode.text,
      developerDir,
      tuistVersion: tuist.text,
      tuistConfigDigest: digest(
        toolchain.tuistConfigDigest,
        'evidence.toolchain.tuistConfigDigest'
      ),
    },
    project: {
      workspace: parsedProjectConfig.workspace,
      scheme: parsedProjectConfig.scheme,
      destination: parsedProjectConfig.destination,
      config: {
        path: repoRelativePath(projectConfigRecord.path, 'evidence.project.config.path', '.json'),
        content: projectConfigContent,
        sha256: digest(projectConfigRecord.sha256, 'evidence.project.config.sha256'),
      },
    },
    execution: {
      attempt: {
        id: safeId(attempt.id, 'evidence.execution.attempt.id'),
        task: attemptTask,
        phase: attemptPhase,
        terminal: 'PASS',
        resultReceipt: 'R-COMPLETE',
        startedAt: attemptStarted,
        finishedAt: attemptFinished,
        rawEvidence: rawAttempt,
        rawEvidenceDigest: digest(
          attempt.rawEvidenceDigest,
          'evidence.execution.attempt.rawEvidenceDigest'
        ),
        currentWorktreeDigest: prefixedDigest(
          attempt.currentWorktreeDigest,
          'evidence.execution.attempt.currentWorktreeDigest'
        ),
      },
      groupReceipts,
      groupState: { members: groupMembers, signature: groupSignature },
      artifact: { path: artifactPath, sha256: artifactDigest },
      commands,
    },
    remote: {
      provider: enumString(
        remote.provider,
        ['github', 'gitlab'] as const,
        'evidence.remote.provider'
      ),
      pipelineId: safeId(remote.pipelineId, 'evidence.remote.pipelineId'),
      pipelineDefinitionId: safeId(
        remote.pipelineDefinitionId,
        'evidence.remote.pipelineDefinitionId'
      ),
      exactSha: cloudHead,
      status: 'success',
      observedAt: remoteObservedAt,
      jobs,
      rawWatcher,
      rawWatcherDigest: digest(remote.rawWatcherDigest, 'evidence.remote.rawWatcherDigest'),
    },
    coverage: {
      xcresult: {
        path: repoRelativePath(xcresult.path, 'evidence.coverage.xcresult.path', '.xcresult'),
        sha256: digest(xcresult.sha256, 'evidence.coverage.xcresult.sha256'),
        sourceSha: cloudHead,
        producedBy: xcodeCommand.id,
        createdAt: xcresultCreatedAt,
      },
      xccov: {
        payload: xccovPayload,
        sha256: digest(xccov.sha256, 'evidence.coverage.xccov.sha256'),
        commandId: xccovCommand.id,
        observedAt: xccovObservedAt,
      },
      sources,
      duplicatePaths: [],
      totals: { coveredLines, executableLines },
      thresholdBasisPoints,
      actualBasisPoints,
      verdict: 'PASS',
    },
  };
}

/**
 * @purpose Independently derive exact E-18 PASS from strict terminal evidence; never trust a boolean.
 * @param input Untrusted parsed evidence.
 * @param [context] Exact bytes and Git-tree resolver owned by the caller.
 * @returns Bounded safe checker projection.
 */
export function checkE18Evidence(input: unknown, context: E18CheckContext = {}): E18CheckReport {
  try {
    const evidence = parseEvidence(input, context.reviewedCloudIosBaseSha);
    const resolvedTree = context.resolveTree?.(evidence.sourceCommit) ?? evidence.gennady.treeSha;
    if (resolvedTree !== evidence.gennady.treeSha)
      throw new Error('evidence.gennady.treeSha does not match sourceCommit tree');
    return {
      schema: CHECK_SCHEMA,
      ok: true,
      derivedStatus: 'PASS',
      sourceCommit: evidence.sourceCommit,
      gennadyTree: evidence.gennady.treeSha,
      cloudIosSha: evidence.cloudIos.headSha,
      pipelineId: evidence.remote.pipelineId,
      evidenceDigest:
        context.evidenceBytes === undefined
          ? sha256(JSON.stringify(canonicalize(evidence)))
          : sha256(context.evidenceBytes),
      issues: [],
    };
  } catch (cause) {
    return {
      schema: CHECK_SCHEMA,
      ok: false,
      derivedStatus: 'INVALID',
      sourceCommit: null,
      gennadyTree: null,
      cloudIosSha: null,
      pipelineId: null,
      evidenceDigest: context.evidenceBytes === undefined ? null : sha256(context.evidenceBytes),
      issues: [
        cause instanceof Error ? cause.message.slice(0, 512) : 'unknown E-18 evidence error',
      ],
    };
  }
}

function defaultRun(
  cwd: string,
  command: string,
  args: readonly string[],
  timeoutMs = COMMAND_TIMEOUT_MS
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_COMMAND_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? result.error?.message ?? ''),
  };
}

function successfulOutput(result: CommandResult, code: string): string {
  if (result.status !== 0) throw new Error(`${code}: ${result.stderr.trim().slice(0, 256)}`);
  return result.stdout.trim();
}

/**
 * @purpose Prove macOS 15+, selected Xcode 16.2+ and direct Tuist 4.202.0 before project/network work.
 * @param cloudIosRoot Read-only cloud-ios checkout used only after host capability passes.
 * @param [ports] Injectable local command/platform seam for causal tests.
 * @returns Exact bounded host/toolchain identities.
 */
export function preflightE18Environment(
  cloudIosRoot: string,
  ports: E18Ports = {}
): HostFacts & { tuistConfigDigest: string } {
  if ((ports.platform ?? process.platform) !== 'darwin')
    throw new Error('E18_ENV_PLATFORM_UNSUPPORTED: exact E-18 requires macOS');
  const run = ports.run ?? defaultRun;
  const macosVersion = successfulOutput(
    run(process.cwd(), 'sw_vers', ['-productVersion']),
    'E18_ENV_MACOS_UNAVAILABLE'
  );
  const macos = parseVersion(macosVersion, 'macOS version');
  if (!versionAtLeast(macos.parts, [15, 0]))
    throw new Error(`E18_ENV_MACOS_UNSUPPORTED: macOS ${macos.text}; require >= 15.0`);

  const xcodeOutput = successfulOutput(
    run(process.cwd(), 'xcodebuild', ['-version']),
    'E18_ENV_XCODE_UNAVAILABLE'
  );
  const xcodeMatch = /^Xcode\s+(\d+\.\d+(?:\.\d+)?)/mu.exec(xcodeOutput);
  if (!xcodeMatch) throw new Error('E18_ENV_XCODE_INVALID: xcodebuild -version output');
  const xcode = parseVersion(xcodeMatch[1], 'Xcode version');
  if (!versionAtLeast(xcode.parts, [16, 2]))
    throw new Error(`E18_ENV_XCODE_UNSUPPORTED: Xcode ${xcode.text}; require >= 16.2`);
  const developerDir = successfulOutput(
    run(process.cwd(), 'xcode-select', ['-p']),
    'E18_ENV_DEVELOPER_DIR_UNAVAILABLE'
  );
  if (!/^\/Applications\/[A-Za-z0-9 ._-]+\.app\/Contents\/Developer$/u.test(developerDir))
    throw new Error('E18_ENV_DEVELOPER_DIR_UNSAFE: select one /Applications Xcode');
  const tuistOutput = successfulOutput(
    run(process.cwd(), 'tuist', ['version']),
    'E18_ENV_TUIST_UNAVAILABLE'
  );
  const tuistMatch = /(\d+\.\d+\.\d+)/u.exec(tuistOutput);
  if (tuistMatch?.[1] !== REQUIRED_TUIST_VERSION)
    throw new Error(
      `E18_ENV_TUIST_VERSION: observed ${tuistMatch?.[1] ?? 'unknown'}; require ${REQUIRED_TUIST_VERSION}`
    );
  const misePath = resolve(cloudIosRoot, '.mise.toml');
  const mise = readFileSync(misePath);
  if (
    !new RegExp(`tuist\\s*=\\s*["']${REQUIRED_TUIST_VERSION.replaceAll('.', '\\.')}["']`, 'u').test(
      mise.toString('utf8')
    )
  )
    throw new Error(`E18_ENV_TUIST_PIN: .mise.toml must pin tuist ${REQUIRED_TUIST_VERSION}`);
  return {
    macosVersion: macos.text,
    xcodeVersion: xcode.text,
    developerDir,
    tuistVersion: REQUIRED_TUIST_VERSION,
    tuistConfigDigest: sha256(mise),
  };
}

function gitText(root: string, args: readonly string[], code: string): string {
  return successfulOutput(defaultRun(root, 'git', args), code);
}

function assertCleanRepository(root: string, owner: string): void {
  const status = gitText(
    root,
    ['status', '--porcelain=v1', '--untracked-files=all'],
    `${owner}_GIT`
  );
  if (status !== '')
    throw new Error(`${owner}_DIRTY: ${status.split('\n').slice(0, 8).join(', ')}`);
}

function parseRunConfig(
  value: unknown,
  reviewedBaseSha = REVIEWED_CLOUD_IOS_BASE_SHA
): E18RunConfig {
  const root = exactRecord(
    value,
    [
      'schema',
      'cloudIosBaseSha',
      'task',
      'sddPhase',
      'owningSpec',
      'groupMembers',
      'artifact',
      'projectConfig',
      'remote',
    ],
    'runConfig'
  );
  exactString(root.schema, 'gennady.e18-run.v1', 'runConfig.schema');
  if (fullSha(root.cloudIosBaseSha, 'runConfig.cloudIosBaseSha') !== reviewedBaseSha)
    throw new Error('runConfig.cloudIosBaseSha must equal the immutable reviewed cloud-ios base');
  const remote = exactRecord(root.remote, ['timeoutMs', 'pollIntervalMs'], 'runConfig.remote');
  if (!Array.isArray(root.groupMembers) || root.groupMembers.length === 0)
    throw new Error('runConfig.groupMembers must be non-empty');
  const groupMembers = root.groupMembers.map((entry, index) =>
    repoRelativePath(entry, `runConfig.groupMembers[${index}]`, '.md')
  );
  if (new Set(groupMembers).size !== groupMembers.length)
    throw new Error('runConfig lists must not contain duplicate paths');
  return {
    schema: 'gennady.e18-run.v1',
    cloudIosBaseSha: fullSha(root.cloudIosBaseSha, 'runConfig.cloudIosBaseSha'),
    task: repoRelativePath(root.task, 'runConfig.task', '.md'),
    sddPhase: safeId(root.sddPhase, 'runConfig.sddPhase'),
    owningSpec: repoRelativePath(root.owningSpec, 'runConfig.owningSpec', '.md'),
    groupMembers: [...groupMembers].sort(compareText),
    artifact: repoRelativePath(root.artifact, 'runConfig.artifact'),
    projectConfig: repoRelativePath(root.projectConfig, 'runConfig.projectConfig', '.json'),
    remote: {
      timeoutMs: integer(remote.timeoutMs, 'runConfig.remote.timeoutMs', 1_000, REMOTE_TIMEOUT_MS),
      pollIntervalMs: integer(
        remote.pollIntervalMs,
        'runConfig.remote.pollIntervalMs',
        100,
        60_000
      ),
    },
  };
}

function parseProjectConfig(value: unknown): E18ProjectConfig {
  const root = exactRecord(
    value,
    [
      'schema',
      'workspace',
      'scheme',
      'destination',
      'coverageThresholdBasisPoints',
      'coverageStepId',
      'coverageTimeoutMs',
      'xcresult',
      'sourceRoots',
    ],
    'projectConfig'
  );
  exactString(root.schema, 'gennady.e18-project.v1', 'projectConfig.schema');
  if (!Array.isArray(root.sourceRoots) || root.sourceRoots.length === 0)
    throw new Error('projectConfig.sourceRoots must be non-empty');
  const sourceRoots = root.sourceRoots.map((entry, index) =>
    repoRelativePath(entry, `projectConfig.sourceRoots[${index}]`)
  );
  if (new Set(sourceRoots).size !== sourceRoots.length)
    throw new Error('projectConfig.sourceRoots must not contain duplicates');
  return {
    workspace: repoRelativePath(root.workspace, 'projectConfig.workspace', '.xcworkspace'),
    scheme: safeId(root.scheme, 'projectConfig.scheme'),
    destination: strictString(root.destination, 'projectConfig.destination', 256),
    thresholdBasisPoints: integer(
      root.coverageThresholdBasisPoints,
      'projectConfig.coverageThresholdBasisPoints',
      1,
      10_000
    ),
    coverageStepId: safeId(root.coverageStepId, 'projectConfig.coverageStepId'),
    coverageTimeoutMs: integer(
      root.coverageTimeoutMs,
      'projectConfig.coverageTimeoutMs',
      1_000,
      24 * 60 * 60 * 1000
    ),
    xcresult: repoRelativePath(root.xcresult, 'projectConfig.xcresult', '.xcresult'),
    sourceRoots: [...sourceRoots].sort(compareText),
  };
}

function existingInside(root: string, path: string, owner: string, directory = false): string {
  const absolute = resolve(root, path);
  const lexical = relative(root, absolute);
  if (lexical === '' || lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical))
    throw new Error(`${owner} escapes cloud-ios root`);
  const resolved = realpathSync(absolute);
  const resolvedRelative = relative(realpathSync(root), resolved);
  if (
    resolvedRelative === '..' ||
    resolvedRelative.startsWith(`..${sep}`) ||
    isAbsolute(resolvedRelative)
  )
    throw new Error(`${owner} resolves outside cloud-ios root`);
  const entry = lstatSync(absolute);
  if (entry.isSymbolicLink() || (directory ? !entry.isDirectory() : !entry.isFile()))
    throw new Error(`${owner} must be an existing non-symlink ${directory ? 'directory' : 'file'}`);
  return absolute;
}

function boundedLog(value: string): {
  content: string;
  sha256: string;
  bytes: number;
  truncated: boolean;
} {
  const redacted = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/\b(Bearer|PRIVATE-TOKEN:)\s+\S+/giu, '$1 [redacted]')
    .replace(
      /\b(token|password|secret|authorization|api[_-]?key)\s*([=:])\s*\S+/giu,
      '$1$2[redacted]'
    );
  const marker = '\n[e18 evidence truncated]';
  let content = redacted;
  let truncated = false;
  if (Buffer.byteLength(content) > MAX_LOG_BYTES) {
    const budget = MAX_LOG_BYTES - Buffer.byteLength(marker);
    content = '';
    let bytes = 0;
    for (const character of redacted) {
      const size = Buffer.byteLength(character);
      if (bytes + size > budget) break;
      content += character;
      bytes += size;
    }
    content += marker;
    truncated = true;
  }
  return { content, sha256: sha256(content), bytes: Buffer.byteLength(content), truncated };
}

function commandFromAttempt(
  role: 'cloud-ios-execute' | 'xcodebuild-coverage',
  attempt: Record<string, unknown>,
  argv: readonly string[],
  process?: Record<string, unknown>
): CommandEvidence {
  const target = process ?? attempt;
  const startedAt = timestamp(target.startedAt, `${role}.startedAt`);
  const finishedAt = timestamp(target.finishedAt, `${role}.finishedAt`);
  const durationMs = integer(target.durationMs, `${role}.durationMs`, 0, 24 * 60 * 60 * 1000);
  const raw = JSON.stringify(canonicalize(target));
  const log = boundedLog(raw);
  return {
    id: safeId(process?.identity ?? attempt.runId, `${role}.identity`),
    role,
    argv: [...argv],
    argvIdentity: sha256(argv.join('\u0000')),
    exitCode: integer(process?.exitCode ?? 0, `${role}.exitCode`, 0, 255),
    signal: null,
    startedAt,
    finishedAt,
    durationMs,
    log,
  };
}

function observedCommand(
  role: 'remote-observe' | 'xccov-export',
  argv: readonly string[],
  startedAt: string,
  finishedAt: string,
  output: string
): CommandEvidence {
  return {
    id: randomUUID(),
    role,
    argv: [...argv],
    argvIdentity: sha256(argv.join('\u0000')),
    exitCode: 0,
    signal: null,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    log: boundedLog(output),
  };
}

function latestAttempt(
  ticket: string,
  phase: string
): { raw: string; value: Record<string, unknown> } {
  const attempts = [...ticket.matchAll(/<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/gu)]
    .map((match) => {
      const raw = match[1]!;
      try {
        return {
          raw,
          value: JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<
            string,
            unknown
          >,
        };
      } catch {
        throw new Error('E18_ATTEMPT_CORRUPT: malformed runner-owned attempt evidence');
      }
    })
    .filter(({ value }) => value.sddPhase === phase);
  const latest = attempts.at(-1);
  if (latest === undefined) throw new Error(`E18_ATTEMPT_MISSING: phase ${phase}`);
  if (latest.value.state !== 'PASS' || latest.value.reportState !== 'complete')
    throw new Error(`E18_ATTEMPT_NOT_PASS: phase ${phase}`);
  return latest;
}

function receiptBlock(
  spec: string,
  kind: 'audit' | 'review'
): { raw: string; value: Record<string, unknown> } {
  const marker = kind === 'audit' ? 'SDD_AUDIT_RECEIPT' : 'SDD_REVIEW_RECEIPT';
  const matches = [
    ...spec.matchAll(
      new RegExp(
        `<!--${marker}-->\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`\\n<!--\\/${marker}-->`,
        'gu'
      )
    ),
  ];
  const raw = matches.at(-1)?.[1];
  if (raw === undefined) throw new Error(`E18_GROUP_RECEIPT_MISSING: ${kind}`);
  if (Buffer.byteLength(raw) > MAX_RECEIPT_BYTES)
    throw new Error(`E18_GROUP_RECEIPT_OVERSIZED: ${kind}`);
  try {
    return { raw, value: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    throw new Error(`E18_GROUP_RECEIPT_CORRUPT: ${kind}`);
  }
}

function treeDigest(root: string): string {
  const hash = createHash('sha256');
  let entries = 0;
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort(compareText)) {
      entries += 1;
      if (entries > 100_000) throw new Error('E18_XCRESULT_OVERSIZED: too many entries');
      const absolute = resolve(directory, name);
      const relativePath = relative(root, absolute).split(sep).join('/');
      const entry = lstatSync(absolute);
      if (entry.isSymbolicLink()) throw new Error(`E18_XCRESULT_SYMLINK: ${relativePath}`);
      hash.update(
        `${entry.isDirectory() ? 'd' : 'f'}\u0000${relativePath}\u0000${entry.mode & 0o777}\u0000`
      );
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) hash.update(readFileSync(absolute));
      else throw new Error(`E18_XCRESULT_UNSUPPORTED_ENTRY: ${relativePath}`);
    }
  };
  walk(root);
  return hash.digest('hex');
}

function safeAtomicWrite(path: string, bytes: Buffer): void {
  const directory = dirname(path);
  const temporary = resolve(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  let identity: { dev: number; ino: number } | null = null;
  let renamed = false;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) throw new Error('E18_EVIDENCE_UNSAFE: temporary is not regular');
    identity = { dev: opened.dev, ino: opened.ino };
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    const current = lstatSync(temporary);
    if (
      current.isSymbolicLink() ||
      !current.isFile() ||
      current.dev !== identity.dev ||
      current.ino !== identity.ino ||
      existsSync(path)
    )
      throw new Error('E18_EVIDENCE_UNSAFE: output or owned temporary identity changed');
    renameSync(temporary, path);
    renamed = true;
    const installed = lstatSync(path);
    if (installed.dev !== identity.dev || installed.ino !== identity.ino)
      throw new Error('E18_EVIDENCE_UNSAFE: installed evidence is not the owned temporary');
    const parent = openSync(directory, constants.O_RDONLY);
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (!renamed && identity !== null) {
      try {
        const entry = lstatSync(temporary);
        if (
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          entry.dev === identity.dev &&
          entry.ino === identity.ino
        )
          rmSync(temporary);
      } catch {
        // Only the exact owned temporary may be removed.
      }
    }
  }
}

/**
 * @purpose Materialize the one canonical evidence file only after host, repo and terminal facts pass.
 * @param gennadyRoot Clean Gennady product checkout whose exact commit/tree is proven.
 * @param cloudIosRoot Clean cloud-ios checkout proved by terminal evidence.
 * @param runConfigPath Reviewed project-owned identities and bounded evidence inputs.
 * @param [ports] Injectable host/time seam for causal tests.
 * @returns Derived PASS report for the exact bytes atomically persisted.
 */
export async function collectE18Evidence(
  gennadyRoot: string,
  cloudIosRoot: string,
  runConfigPath: string,
  ports: E18Ports = {}
): Promise<E18CheckReport> {
  const host = preflightE18Environment(cloudIosRoot, ports);
  assertCleanRepository(gennadyRoot, 'E18_GENNADY');
  assertCleanRepository(cloudIosRoot, 'E18_CLOUD_IOS');
  const config = parseRunConfig(
    JSON.parse(readFileSync(runConfigPath, 'utf8')) as unknown,
    ports.reviewedCloudIosBaseSha
  );
  const sourceCommit = gitText(gennadyRoot, ['rev-parse', 'HEAD'], 'E18_GENNADY_HEAD');
  const sourceTree = gitText(gennadyRoot, ['rev-parse', 'HEAD^{tree}'], 'E18_GENNADY_TREE');
  const cloudHead = gitText(cloudIosRoot, ['rev-parse', 'HEAD'], 'E18_CLOUD_IOS_HEAD');
  const cloudTree = gitText(cloudIosRoot, ['rev-parse', 'HEAD^{tree}'], 'E18_CLOUD_IOS_TREE');
  if (
    defaultRun(cloudIosRoot, 'git', [
      'merge-base',
      '--is-ancestor',
      config.cloudIosBaseSha,
      cloudHead,
    ]).status !== 0
  )
    throw new Error('E18_CLOUD_IOS_BASE_INVALID: base is not an ancestor of exact HEAD');

  const taskPath = existingInside(cloudIosRoot, config.task, 'runConfig.task');
  const specPath = existingInside(cloudIosRoot, config.owningSpec, 'runConfig.owningSpec');
  const artifactPath = existingInside(cloudIosRoot, config.artifact, 'runConfig.artifact');
  const memberInputs = config.groupMembers.map((path) => ({
    file: path,
    content: readFileSync(existingInside(cloudIosRoot, path, `group member ${path}`), 'utf8'),
  }));
  const ticket = readFileSync(taskPath, 'utf8');
  const spec = readFileSync(specPath, 'utf8');
  const currentAttempt = validateCurrentSddPhaseAttempt(cloudIosRoot, taskPath, config.sddPhase);
  if (!currentAttempt.ok) throw new Error(`E18_ATTEMPT_NOT_CURRENT: ${currentAttempt.issue}`);
  if (
    !hasValidGroupReceipt(spec, memberInputs, 'audit') ||
    !hasValidGroupReceipt(spec, memberInputs, 'review')
  )
    throw new Error('E18_GROUP_RECEIPT_INVALID: audit and review must both be current PASS');
  const attempt = latestAttempt(ticket, config.sddPhase);
  const currentWorktreeDigest = currentSddPhaseWorktreeDigest(
    cloudIosRoot,
    taskPath,
    config.sddPhase
  );
  const attemptIdentity = attempt.value.identity as Record<string, unknown>;
  const attemptHead = fullSha(attemptIdentity.headSha, 'attempt.identity.headSha');
  if (
    defaultRun(cloudIosRoot, 'git', ['merge-base', '--is-ancestor', attemptHead, cloudHead])
      .status !== 0
  )
    throw new Error('E18_ATTEMPT_HEAD_INVALID: attempt HEAD is not an ancestor of pushed HEAD');
  const artifactDigest = sha256(readFileSync(artifactPath));
  const groupState = deriveGroupState(memberInputs);
  if (!groupState.allDone)
    throw new Error(`E18_R_COMPLETE_INVALID: open members ${groupState.notDone.join(', ')}`);
  const audit = receiptBlock(spec, 'audit');
  const review = receiptBlock(spec, 'review');

  const projectConfigPath = existingInside(
    cloudIosRoot,
    config.projectConfig,
    'runConfig.projectConfig'
  );
  const projectConfigContent = readFileSync(projectConfigPath, 'utf8');
  const project = parseProjectConfig(JSON.parse(projectConfigContent) as unknown);
  existingInside(cloudIosRoot, project.workspace, 'projectConfig.workspace', true);

  const attemptProcesses = Array.isArray(attempt.value.processes)
    ? (attempt.value.processes as Record<string, unknown>[])
    : [];
  const coverageProcess = attemptProcesses.filter(
    (process) => process.stepId === project.coverageStepId
  );
  if (coverageProcess.length !== 1 || coverageProcess[0]!.status !== 'pass')
    throw new Error(
      `E18_XCODE_PROCESS_INVALID: expected one passing ${project.coverageStepId} process`
    );
  const executeArgv = ['gennady', 'sdd-verify', '--task', config.task, '--phase', config.sddPhase];
  const xcodeArgv = [
    'xcodebuild',
    '-workspace',
    project.workspace,
    '-scheme',
    project.scheme,
    '-destination',
    project.destination,
    '-enableCodeCoverage',
    'YES',
    '-resultBundlePath',
    project.xcresult,
    'test',
  ];

  const remoteResolution = (ports.resolveRemote ?? resolveRemotePipelineObserver)(cloudIosRoot);
  const xcresultBefore = existingInside(
    cloudIosRoot,
    project.xcresult,
    'projectConfig.xcresult',
    true
  );
  const xcresultDigest = treeDigest(xcresultBefore);
  const xcresultIdentity = lstatSync(xcresultBefore);
  if (!remoteResolution.ok)
    throw new Error(`E18_REMOTE_UNAVAILABLE: ${remoteResolution.message}; ${remoteResolution.fix}`);
  const remoteStartedAt = ports.now?.() ?? new Date().toISOString();
  const remoteResult = await (ports.watchRemote ?? watchRemotePipeline)({
    observer: remoteResolution.observer,
    sourceSha: cloudHead,
    timeoutMs: config.remote.timeoutMs,
    pollIntervalMs: config.remote.pollIntervalMs,
  });
  const remoteFinishedAt = ports.now?.() ?? new Date().toISOString();
  if (remoteResult.state !== 'REMOTE_SUCCESS' || remoteResult.proof === undefined)
    throw new Error(`E18_REMOTE_NOT_PASS: ${remoteResult.state} ${remoteResult.message}`);
  if (
    remoteResult.proof.jobs.length === 0 ||
    remoteResult.proof.jobs.some((job) => job.rawStatus !== 'success' && job.rawStatus !== 'passed')
  )
    throw new Error('E18_REMOTE_JOBS_NOT_PASS: every terminal job must be an observed success');
  const remoteRaw = JSON.stringify(canonicalize(remoteResult));
  const remoteArgv = [
    'gennady:remote-watcher',
    remoteResult.proof.provider,
    cloudHead,
    remoteResult.proof.pipelineId,
  ];

  const xcresultPath = existingInside(
    cloudIosRoot,
    project.xcresult,
    'projectConfig.xcresult',
    true
  );
  const xcodeCommand = commandFromAttempt(
    'xcodebuild-coverage',
    attempt.value,
    xcodeArgv,
    coverageProcess[0]
  );
  const expectedCoverageCommandIdentity = createRepositoryRootCommandIdentity({
    argv: xcodeArgv,
    timeoutMs: project.coverageTimeoutMs,
  });
  if (
    prefixedDigest(
      coverageProcess[0]!.commandIdentity,
      'attempt coverage process commandIdentity'
    ) !== expectedCoverageCommandIdentity
  ) {
    throw new Error(
      'E18_XCODE_COMMAND_MISMATCH: runner-owned command identity does not match reviewed xcodebuild argv/cwd/env/timeout'
    );
  }
  const xcresultStat = lstatSync(xcresultPath);
  if (
    xcresultStat.mtimeMs < Date.parse(xcodeCommand.startedAt) ||
    xcresultStat.mtimeMs > Date.parse(xcodeCommand.finishedAt) + 1000
  )
    throw new Error('E18_XCRESULT_STALE: bundle mtime is outside the recorded xcodebuild process');
  const xccovArgv = ['xcrun', 'xccov', 'view', '--report', '--json', project.xcresult];
  const xccovStartedAt = ports.now?.() ?? new Date().toISOString();
  const xccovResult = (ports.run ?? defaultRun)(
    cloudIosRoot,
    'xcrun',
    ['xccov', 'view', '--report', '--json', xcresultPath],
    XCCOV_TIMEOUT_MS
  );
  const xccovFinishedAt = ports.now?.() ?? new Date().toISOString();
  const xccovPayload = successfulOutput(xccovResult, 'E18_XCCOV_EXPORT');
  if (Buffer.byteLength(xccovPayload) > MAX_XCCOV_BYTES)
    throw new Error('E18_XCCOV_OVERSIZED: JSON exceeds bounded evidence budget');
  const xccovReport = xccovCoverageAdapter.parseReport(xccovPayload);
  const productionFiles = project.sourceRoots.flatMap((path) =>
    xccovCoverageAdapter.collectProductionFiles(
      existingInside(cloudIosRoot, path, `coverage source root ${path}`, true)
    )
  );
  const sources = [...new Set(productionFiles)].sort(compareText).map((absolute) => {
    const mapped = xccovCoverageAdapter.resolveSource(cloudIosRoot, xccovReport, absolute);
    if (mapped.kind !== 'found')
      throw new Error(
        `E18_XCCOV_SOURCE_${mapped.kind.toUpperCase()}: ${relative(cloudIosRoot, absolute)}`
      );
    const metrics = xccovReport.metrics[mapped.key]!;
    return {
      path: relative(cloudIosRoot, absolute).split(sep).join('/'),
      coveredLines: metrics.sH,
      executableLines: metrics.sT,
    };
  });
  if (sources.length === 0) throw new Error('E18_XCCOV_SOURCES_EMPTY');
  const totals = sources.reduce(
    (sum, source) => ({
      coveredLines: sum.coveredLines + source.coveredLines,
      executableLines: sum.executableLines + source.executableLines,
    }),
    { coveredLines: 0, executableLines: 0 }
  );
  const actualBasisPoints = Math.floor((totals.coveredLines * 10_000) / totals.executableLines);
  if (actualBasisPoints < project.thresholdBasisPoints)
    throw new Error(
      `E18_COVERAGE_THRESHOLD: ${actualBasisPoints} < ${project.thresholdBasisPoints}`
    );
  const xccovEvidencePayload = JSON.stringify({
    targets: [{ name: 'selected-production', files: sources }],
  });

  const executeCommand = commandFromAttempt('cloud-ios-execute', attempt.value, executeArgv);
  const remoteCommand = observedCommand(
    'remote-observe',
    remoteArgv,
    remoteStartedAt,
    remoteFinishedAt,
    remoteRaw
  );
  const xccovCommand = observedCommand(
    'xccov-export',
    xccovArgv,
    xccovStartedAt,
    xccovFinishedAt,
    xccovEvidencePayload
  );
  const raw: E18Evidence = {
    schema: EVIDENCE_SCHEMA,
    sourceCommit,
    generatedAt: ports.now?.() ?? new Date().toISOString(),
    environment: 'cloud-ios',
    status: 'PASS',
    gennady: { sourceSha: sourceCommit, treeSha: sourceTree },
    cloudIos: {
      headSha: cloudHead,
      baseSha: config.cloudIosBaseSha,
      treeSha: cloudTree,
      clean: true,
    },
    toolchain: host,
    project: {
      workspace: project.workspace,
      scheme: project.scheme,
      destination: project.destination,
      config: {
        path: config.projectConfig,
        content: projectConfigContent,
        sha256: sha256(projectConfigContent),
      },
    },
    execution: {
      attempt: {
        id: String(attempt.value.runId),
        task: config.task,
        phase: config.sddPhase,
        terminal: 'PASS',
        resultReceipt: 'R-COMPLETE',
        startedAt: String(attempt.value.startedAt),
        finishedAt: String(attempt.value.finishedAt),
        rawEvidence: attempt.raw,
        rawEvidenceDigest: sha256(attempt.raw),
        currentWorktreeDigest,
      },
      groupReceipts: [
        {
          kind: 'audit',
          verdict: 'PASS',
          identity: `group-audit-${sha256(audit.raw).slice(0, 16)}`,
          digest: sha256(audit.raw),
          raw: audit.raw,
        },
        {
          kind: 'review',
          verdict: 'PASS',
          identity: `group-review-${sha256(review.raw).slice(0, 16)}`,
          digest: sha256(review.raw),
          raw: review.raw,
        },
      ],
      groupState: { members: groupState.members, signature: groupState.signature },
      artifact: { path: config.artifact, sha256: artifactDigest },
      commands: [executeCommand, remoteCommand, xcodeCommand, xccovCommand],
    },
    remote: {
      provider: remoteResult.proof.provider,
      pipelineId: remoteResult.proof.pipelineId,
      pipelineDefinitionId: remoteResult.proof.definitionId,
      exactSha: remoteResult.proof.pipelineSha,
      status: 'success',
      observedAt: remoteResult.proof.observedAt,
      jobs: remoteResult.proof.jobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: 'success' as const,
      })),
      rawWatcher: remoteRaw,
      rawWatcherDigest: sha256(remoteRaw),
    },
    coverage: {
      xcresult: {
        path: project.xcresult,
        sha256: xcresultDigest,
        sourceSha: cloudHead,
        producedBy: xcodeCommand.id,
        createdAt: new Date(xcresultStat.mtimeMs).toISOString(),
      },
      xccov: {
        payload: xccovEvidencePayload,
        sha256: sha256(xccovEvidencePayload),
        commandId: xccovCommand.id,
        observedAt: xccovFinishedAt,
      },
      sources,
      duplicatePaths: [],
      totals,
      thresholdBasisPoints: project.thresholdBasisPoints,
      actualBasisPoints,
      verdict: 'PASS',
    },
  };
  const normalized = parseEvidence(raw, ports.reviewedCloudIosBaseSha);
  if (normalized.cloudIos.headSha !== cloudHead)
    throw new Error('E18_CLOUD_IOS_HEAD_DRIFT: observations do not bind current cloud-ios HEAD');
  const output = Buffer.from(`${JSON.stringify(canonicalize(normalized), null, 2)}\n`, 'utf8');
  const report = checkE18Evidence(normalized, {
    reviewedCloudIosBaseSha: ports.reviewedCloudIosBaseSha,
    evidenceBytes: output,
    resolveTree: () => sourceTree,
  });
  if (!report.ok) throw new Error(`E18_EVIDENCE_INVALID: ${report.issues.join('; ')}`);
  const outputPath = resolve(gennadyRoot, CANONICAL_EVIDENCE);
  if (existsSync(outputPath))
    throw new Error('E18_EVIDENCE_EXISTS: remove only through reviewed evidence refresh workflow');
  assertCleanRepository(gennadyRoot, 'E18_GENNADY');
  assertCleanRepository(cloudIosRoot, 'E18_CLOUD_IOS');
  const finalBundle = lstatSync(
    existingInside(cloudIosRoot, project.xcresult, 'projectConfig.xcresult', true)
  );
  if (
    gitText(gennadyRoot, ['rev-parse', 'HEAD'], 'E18_GENNADY_HEAD') !== sourceCommit ||
    gitText(gennadyRoot, ['rev-parse', 'HEAD^{tree}'], 'E18_GENNADY_TREE') !== sourceTree ||
    gitText(cloudIosRoot, ['rev-parse', 'HEAD'], 'E18_CLOUD_IOS_HEAD') !== cloudHead ||
    gitText(cloudIosRoot, ['rev-parse', 'HEAD^{tree}'], 'E18_CLOUD_IOS_TREE') !== cloudTree ||
    currentSddPhaseWorktreeDigest(cloudIosRoot, taskPath, config.sddPhase) !==
      currentWorktreeDigest ||
    readFileSync(taskPath, 'utf8') !== ticket ||
    readFileSync(specPath, 'utf8') !== spec ||
    readFileSync(projectConfigPath, 'utf8') !== projectConfigContent ||
    sha256(readFileSync(artifactPath)) !== artifactDigest ||
    finalBundle.dev !== xcresultIdentity.dev ||
    finalBundle.ino !== xcresultIdentity.ino ||
    finalBundle.mtimeMs !== xcresultIdentity.mtimeMs ||
    treeDigest(xcresultPath) !== xcresultDigest
  )
    throw new Error('E18_SOURCE_DRIFT: repository or evidence bytes changed during collection');
  safeAtomicWrite(outputPath, output);
  return report;
}

function resolveTreeFromGit(root: string, sourceSha: string): string | null {
  const result = defaultRun(root, 'git', ['rev-parse', '--verify', `${sourceSha}^{tree}`]);
  const output = result.status === 0 ? result.stdout.trim() : '';
  return FULL_SHA.test(output) ? output : null;
}

function parseCli(argv: readonly string[]): Record<string, string | true> {
  const result: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith('--')) throw new Error(`unknown positional argument: ${token}`);
    const key = token.slice(2);
    if (['check', 'collect', 'preflight', 'json'].includes(key)) {
      if (result[key] !== undefined) throw new Error(`duplicate option --${key}`);
      result[key] = true;
      continue;
    }
    if (!['evidence', 'cloud-ios-root', 'run-config', 'root'].includes(key))
      throw new Error(`unknown option --${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} requires a value`);
    if (result[key] !== undefined) throw new Error(`duplicate option --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const options = parseCli(argv);
    const modes = ['check', 'collect', 'preflight'].filter((key) => options[key] === true);
    if (modes.length !== 1)
      throw new Error('choose exactly one of --check, --collect, --preflight');
    const root = resolve(typeof options.root === 'string' ? options.root : process.cwd());
    if (options.preflight === true) {
      if (typeof options['cloud-ios-root'] !== 'string')
        throw new Error('--preflight requires --cloud-ios-root');
      const facts = preflightE18Environment(resolve(options['cloud-ios-root']));
      process.stdout.write(`${JSON.stringify({ ok: true, facts })}\n`);
      return 0;
    }
    if (options.collect === true) {
      if (
        typeof options['cloud-ios-root'] !== 'string' ||
        typeof options['run-config'] !== 'string'
      )
        throw new Error('--collect requires --cloud-ios-root and --run-config');
      const report = await collectE18Evidence(
        root,
        resolve(options['cloud-ios-root']),
        resolve(options['run-config'])
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return 0;
    }
    const evidencePath = resolve(
      root,
      typeof options.evidence === 'string' ? options.evidence : CANONICAL_EVIDENCE
    );
    const bytes = readFileSync(evidencePath);
    const report = checkE18Evidence(JSON.parse(bytes.toString('utf8')) as unknown, {
      evidenceBytes: bytes,
      resolveTree: (sourceSha) => resolveTreeFromGit(root, sourceSha),
    });
    process.stdout.write(`${JSON.stringify(report, null, options.json === true ? 2 : 0)}\n`);
    return report.ok ? 0 : 1;
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : 'unknown E-18 error'}\n`);
    return 4;
  }
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url))
  process.exitCode = await runCli(process.argv.slice(2));
