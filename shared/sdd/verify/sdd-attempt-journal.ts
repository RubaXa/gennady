// @file: Crash-safe SDD-owned Verify attempt journal over the universal VerifyRunReport.
// @consumers: thin sdd-verify facade
// @spec: CLI-SDD-VERIFY

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  proveRepoFile,
  readProvenRepoFile,
  revalidateRepoFile,
  type RepoFileIdentity,
} from '../../common/repo-file-identity.ts';
import type { VerifyRunReport, VerifyStepResult } from '../../verify/model/verify-report.type.ts';

const ATTEMPT_SCHEMA = 'gennady.sdd-verify-attempt.v1';
const LOCK_SCHEMA = 'gennady.sdd-verify-attempt-lock.v1';
const LOCK_STALE_MS = 5 * 60_000;
const HEARTBEAT_MS = 5_000;
const MAX_RECORDED_PROCESSES = 256;
const MAX_PERSISTED_SCALAR_BYTES = 256;

type AttemptState =
  | 'RUNNING'
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'ENV_FAIL'
  | 'TIMEOUT'
  | 'VIOLATION'
  | 'CANCELLED'
  | 'INTERRUPTED';

type AttemptIdentity = {
  readonly headSha: string | null;
  readonly worktreeDigest: string | null;
  readonly scopeDigest: string | null;
  readonly planDigest: string | null;
  readonly configDigest: string | null;
  readonly rulesDigest: string | null;
};

type AttemptRecord = {
  readonly schema: typeof ATTEMPT_SCHEMA;
  readonly runId: string;
  readonly sddPhase: string;
  readonly selector: string | null;
  readonly state: AttemptState;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly steps: { readonly completed: number; readonly total: number };
  readonly testStats: readonly (NonNullable<VerifyStepResult['testStats']> & {
    readonly stepId: string;
  })[];
  readonly processes: readonly {
    readonly stepId: string;
    readonly status: VerifyStepResult['status'];
    readonly exitCode: number | null;
    readonly durationMs: number;
    readonly identity: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly termination: 'completed' | 'timeout' | 'cancelled';
    readonly signal: 'SIGINT' | 'SIGTERM' | null;
  }[];
  readonly projection: { readonly complete: boolean; readonly totalProcesses: number };
  readonly reportState: 'pending' | 'complete' | 'pre-report';
  readonly identity: AttemptIdentity;
  readonly trust: {
    readonly level: 'local-runner' | 'remote-provider' | 'pending';
    readonly source: string;
    readonly resolved: boolean;
    readonly provider?: string;
    readonly exactSha?: string;
    readonly pipelineId?: string;
  };
  readonly legacyOverlay?: { readonly enabled: true; readonly provenance: string };
};

type LockOwner = {
  readonly schema: typeof LOCK_SCHEMA;
  readonly runId: string;
  readonly token: string;
  readonly hostname: string;
  readonly pid: number;
  readonly heartbeatAt: string;
};

type SddAttemptOutcome = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly report?: VerifyRunReport;
};

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sameEntry(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

type OwnedTemporaryFile = {
  readonly absolute: string;
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
};

function ownedTemporaryIssue(temporary: OwnedTemporaryFile): string | null {
  try {
    const current = fs.lstatSync(temporary.absolute);
    return current.isFile() &&
      !current.isSymbolicLink() &&
      current.dev === temporary.dev &&
      current.ino === temporary.ino
      ? null
      : 'temporary file identity changed';
  } catch (cause) {
    return `temporary file is unavailable: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`;
  }
}

function cleanupOwnedTemporary(temporary: OwnedTemporaryFile): void {
  try {
    if (ownedTemporaryIssue(temporary) === null) fs.unlinkSync(temporary.absolute);
  } catch {
    // Best-effort cleanup is allowed only for the exact captured inode.
  }
}

function readOwnedInstalled(pathname: string, temporary: OwnedTemporaryFile): Buffer {
  const descriptor = fs.openSync(pathname, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const current = fs.fstatSync(descriptor);
    if (!current.isFile() || current.dev !== temporary.dev || current.ino !== temporary.ino) {
      throw new Error('installed file descriptor is not the owned temporary file');
    }
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function createOwnedTemporary(
  destination: string,
  label: string,
  content: string,
  mode: number
): OwnedTemporaryFile {
  const directory = path.dirname(destination);
  let descriptor: number | undefined;
  let temporary: OwnedTemporaryFile | undefined;
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const absolute = path.join(
        directory,
        `.${path.basename(destination)}.${label}-${randomUUID()}.tmp`
      );
      try {
        descriptor = fs.openSync(
          absolute,
          fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_WRONLY |
            fs.constants.O_NOFOLLOW,
          mode & 0o777
        );
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'EEXIST' && attempt < 7) continue;
        throw cause;
      }
      const opened = fs.fstatSync(descriptor);
      temporary = { absolute, dev: opened.dev, ino: opened.ino, mode: opened.mode };
      if (!opened.isFile()) throw new Error('temporary descriptor is not a regular file');
      fs.fchmodSync(descriptor, mode & 0o7777);
      const owned = fs.fstatSync(descriptor);
      temporary = { absolute, dev: owned.dev, ino: owned.ino, mode: owned.mode };
      fs.writeFileSync(descriptor, content, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      const issue = ownedTemporaryIssue(temporary);
      if (issue !== null) throw new Error(issue);
      return temporary;
    }
    throw new Error('cannot create exclusive temporary file');
  } catch (cause) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (temporary !== undefined) cleanupOwnedTemporary(temporary);
    throw cause;
  }
}

function fsyncParent(file: string): void {
  const parent = fs.openSync(path.dirname(file), 'r');
  try {
    fs.fsyncSync(parent);
  } finally {
    fs.closeSync(parent);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function persistedScalarIssue(value: string, field: string): string | null {
  if (value.trim() === '') return `${field} is empty`;
  if (Buffer.byteLength(value, 'utf8') > MAX_PERSISTED_SCALAR_BYTES) {
    return `${field} exceeds ${MAX_PERSISTED_SCALAR_BYTES} UTF-8 bytes`;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return `${field} contains control characters`;
  if (
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value) ||
    /(?:^|[\s:=])\/[A-Za-z0-9._-]/.test(value)
  ) {
    return `${field} contains an absolute path`;
  }
  if (
    /(?:bearer\s+[A-Za-z0-9._~-]+|(?:token|secret|password|api[_-]?key)\s*[:=]\s*\S+|\b(?:gh[pousr]_[A-Za-z0-9]{12,}|sk-[A-Za-z0-9]{12,}))/i.test(
      value
    )
  ) {
    return `${field} contains secret-like material`;
  }
  return null;
}

function assertPersistedScalar(value: string, field: string): void {
  const issue = persistedScalarIssue(value, field);
  if (issue !== null) throw new Error(`SDD_VERIFY_ATTEMPT_EVIDENCE_INVALID: ${issue}`);
}

function reportScalarIssue(report: VerifyRunReport): string | null {
  const values: readonly (readonly [string, string])[] = [
    ['context.headSha', report.context.headSha],
    ['context.rules.digest', report.context.rules.digest],
    ['rules.digest', report.rules.digest],
    ['selector', report.plan.phase],
    ['trust.source', report.plan.trust.source],
    ...report.plan.steps.flatMap((step) => [
      ['plan.stepId', step.id] as const,
      ...(step.testStats === undefined
        ? []
        : ([['plan.testStats.source', step.testStats.source] as const] as const)),
    ]),
    ...report.results.flatMap((result) => [
      ['result.stepId', result.stepId] as const,
      ...(result.testStats === undefined
        ? []
        : ([
            ['result.testStats.schema', result.testStats.schema] as const,
            ['result.testStats.protocol', result.testStats.protocol] as const,
            ['result.testStats.runner', result.testStats.runner] as const,
            ['result.testStats.source', result.testStats.source] as const,
          ] as const)),
      ...(result.process === undefined
        ? []
        : ([
            ['result.process.identity', result.process.identity] as const,
            ['result.process.startedAt', result.process.startedAt] as const,
            ['result.process.finishedAt', result.process.finishedAt] as const,
            ['result.process.termination', result.process.termination] as const,
            ...(result.process.signal === null
              ? []
              : ([['result.process.signal', result.process.signal] as const] as const)),
          ] as const)),
    ]),
    ...(report.remote === undefined
      ? []
      : ([
          ['remote.provider', report.remote.provider] as const,
          ['remote.project', report.remote.project] as const,
          ['remote.definitionId', report.remote.definitionId] as const,
          ['remote.sourceSha', report.remote.sourceSha] as const,
          ['remote.pipelineId', report.remote.pipelineId] as const,
          ['remote.pipelineSha', report.remote.pipelineSha] as const,
          ['remote.rawStatus', report.remote.rawStatus] as const,
          ['remote.terminalState', report.remote.terminalState] as const,
          ['remote.observedAt', report.remote.observedAt] as const,
          ...report.remote.jobs.flatMap((job) => [
            ['remote.job.id', job.id] as const,
            ['remote.job.name', job.name] as const,
            ['remote.job.rawStatus', job.rawStatus] as const,
            ...(job.logIdentity === undefined
              ? []
              : ([['remote.job.logIdentity', job.logIdentity] as const] as const)),
          ]),
        ] as const)),
  ];
  if (!/^[0-9a-f]{40,64}$/.test(report.context.headSha)) {
    return 'context.headSha is not an exact Git object identity';
  }
  if (
    !/^sha256:[0-9a-f]{64}$/.test(report.context.rules.digest) ||
    !/^sha256:[0-9a-f]{64}$/.test(report.rules.digest)
  ) {
    return 'rules.digest is not a canonical sha256 identity';
  }
  for (const [field, value] of values) {
    const issue = persistedScalarIssue(value, field);
    if (issue !== null) return issue;
  }
  return null;
}

function exactGitDigest(root: string, args: readonly string[]): Buffer {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function withoutAttemptJournal(content: Buffer): Buffer {
  const marker = '\u0000SDD_VERIFY_ATTEMPT\u0000';
  const source = content.toString('utf8');
  const broad = [...source.matchAll(/<!--SDD_VERIFY_ATTEMPT:[\s\S]*?(?:-->|$)/g)];
  const exact = [...source.matchAll(/<!--SDD_VERIFY_ATTEMPT:([^:\n]+):(BEGIN|END)-->/g)];
  if (broad.length !== exact.length) {
    throw new Error('SDD_VERIFY_ATTEMPT_CORRUPT: malformed attempt marker');
  }
  const seen = new Set<string>();
  let cursor = 0;
  let normalized = '';
  for (let index = 0; index < exact.length; index += 2) {
    const begin = exact[index];
    const end = exact[index + 1];
    if (
      begin === undefined ||
      end === undefined ||
      begin[2] !== 'BEGIN' ||
      end[2] !== 'END' ||
      begin[1] !== end[1] ||
      seen.has(begin[1]!)
    ) {
      throw new Error('SDD_VERIFY_ATTEMPT_CORRUPT: mismatched or duplicate attempt markers');
    }
    seen.add(begin[1]!);
    normalized += source.slice(cursor, begin.index) + marker;
    cursor = end.index! + end[0].length;
  }
  normalized += source.slice(cursor);
  return Buffer.from(normalized.replace(new RegExp(`(?:\\n?${marker}\\n?)+`, 'g'), '\n'));
}

function worktreeDigest(root: string, ticketPath: string): string {
  const hash = createHash('sha256');
  hash.update('index\0');
  hash.update(exactGitDigest(root, ['ls-files', '--stage', '-z']));
  const tracked = exactGitDigest(root, ['ls-files', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const untracked = exactGitDigest(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const ticketRelative = path.relative(root, ticketPath).split(path.sep).join('/');
  for (const file of [...new Set([...tracked, ...untracked])].sort((left, right) =>
    left.localeCompare(right)
  )) {
    const absolute = path.join(root, file);
    let entry: fs.Stats;
    try {
      entry = fs.lstatSync(absolute);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      hash.update(`missing\0${file}\0`);
      continue;
    }
    hash.update(`path\0${file}\0${entry.mode}\0`);
    if (entry.isSymbolicLink()) hash.update(fs.readlinkSync(absolute));
    else if (entry.isFile()) {
      const content = fs.readFileSync(absolute);
      hash.update(file === ticketRelative ? withoutAttemptJournal(content) : content);
    } else hash.update('non-file');
  }
  return `sha256:${hash.digest('hex')}`;
}

function headSha(root: string): string {
  const value = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!/^[0-9a-f]{40,64}$/.test(value)) throw new Error('SDD_VERIFY_ATTEMPT_HEAD_INVALID');
  return value;
}

function terminalState(outcome: SddAttemptOutcome): AttemptState {
  if (outcome.exitCode === 130 || outcome.exitCode === 143) return 'CANCELLED';
  const verdict = outcome.report?.verdict;
  if (verdict === 'pass') return 'PASS';
  if (verdict === 'fail') return 'FAIL';
  if (verdict === 'blocked') return 'BLOCKED';
  if (verdict === 'env-fail') return 'ENV_FAIL';
  if (verdict === 'timeout') return 'TIMEOUT';
  if (verdict === 'violation') return 'VIOLATION';
  return 'BLOCKED';
}

function entryBlock(record: AttemptRecord): string {
  const tests =
    record.testStats.length === 0
      ? 'tests none'
      : record.testStats
          .map(
            (item) =>
              `tests ${item.stepId}=${item.executed}/${item.passed}/${item.failed}/${item.skipped}`
          )
          .join(' · ');
  const human = `- **Verify attempt:** \`${record.runId}\` · phase \`${record.sddPhase}\` · selector \`${record.selector ?? 'pending'}\` · **${record.state}** · steps ${record.steps.completed}/${record.steps.total} · ${tests} · ${record.durationMs ?? 0}ms`;
  const machine = Buffer.from(canonical(record)).toString('base64url');
  return [
    `<!--SDD_VERIFY_ATTEMPT:${record.runId}:BEGIN-->`,
    human,
    `<!--SDD_VERIFY_EVIDENCE:${machine}-->`,
    `<!--SDD_VERIFY_ATTEMPT:${record.runId}:END-->`,
  ].join('\n');
}

function parseRecords(ticket: string): readonly AttemptRecord[] {
  const values: AttemptRecord[] = [];
  for (const match of ticket.matchAll(/<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/g)) {
    try {
      const value = JSON.parse(
        Buffer.from(match[1]!, 'base64url').toString('utf8')
      ) as AttemptRecord;
      if (value.schema === ATTEMPT_SCHEMA && typeof value.runId === 'string') {
        const terminal = value.state !== 'RUNNING';
        const completeIdentity = Object.values(value.identity).every((item) => item !== null);
        const invalidTerminal =
          terminal &&
          ((value.reportState === 'complete' && !completeIdentity) ||
            (value.reportState === 'pre-report' && value.state === 'PASS') ||
            value.reportState === 'pending' ||
            (value.state === 'PASS' && (!value.trust.resolved || !completeIdentity)));
        if (invalidTerminal) {
          throw new Error(
            'SDD_VERIFY_ATTEMPT_CORRUPT: terminal attempt has incomplete report, freshness or trust identity'
          );
        }
        values.push(value);
      }
    } catch {
      throw new Error('SDD_VERIFY_ATTEMPT_CORRUPT: malformed execution evidence payload');
    }
  }
  return values;
}

function captureTicketIdentity(
  root: string,
  ticketPath: string
): { readonly file: RepoFileIdentity; readonly digest: string; readonly mode: number } {
  const relative = path.relative(root, ticketPath).split(path.sep).join('/');
  const proven = proveRepoFile(root, relative);
  if (!proven.ok || fs.realpathSync(ticketPath) !== proven.identity.absolute) {
    throw new Error(
      `SDD_VERIFY_ATTEMPT_UNSAFE: ${proven.ok ? 'ticket path identity changed' : proven.detail}`
    );
  }
  const read = readProvenRepoFile(proven.identity);
  if (!read.ok) throw new Error(`SDD_VERIFY_ATTEMPT_UNSAFE: ${read.detail}`);
  return {
    file: proven.identity,
    digest: sha256(read.content),
    mode: fs.lstatSync(ticketPath).mode,
  };
}

function writeTicketAtomically(
  root: string,
  ticketPath: string,
  content: string,
  beforeRename?: (ticketPath: string, temporaryPath: string) => void
): void {
  const captured = captureTicketIdentity(root, ticketPath);
  const temporary = createOwnedTemporary(ticketPath, 'verify-attempt', content, captured.mode);
  let renamed = false;
  try {
    beforeRename?.(ticketPath, temporary.absolute);
    const temporaryIssue = ownedTemporaryIssue(temporary);
    if (temporaryIssue !== null) {
      throw new Error(`SDD_VERIFY_ATTEMPT_UNSAFE: ${temporaryIssue}`);
    }
    const current = revalidateRepoFile(captured.file);
    if (!current.ok) throw new Error(`SDD_VERIFY_ATTEMPT_UNSAFE: ${current.detail}`);
    const read = readProvenRepoFile(captured.file);
    if (!read.ok || sha256(read.content) !== captured.digest) {
      throw new Error('SDD_VERIFY_ATTEMPT_UNSAFE: ticket bytes changed before atomic rename');
    }
    fs.renameSync(temporary.absolute, ticketPath);
    renamed = true;
    if (sha256(readOwnedInstalled(ticketPath, temporary)) !== sha256(content)) {
      throw new Error(
        'SDD_VERIFY_ATTEMPT_UNSAFE: installed ticket is not the owned temporary file'
      );
    }
    fsyncParent(ticketPath);
  } finally {
    if (!renamed) cleanupOwnedTemporary(temporary);
  }
}

function insertRecord(ticket: string, record: AttemptRecord): string {
  const close = '<!--/SECTION:EXECUTION_LOG-->';
  const index = ticket.indexOf(close);
  if (index === -1 || ticket.indexOf(close, index + close.length) !== -1) {
    throw new Error('SDD_VERIFY_ATTEMPT_TARGET_INVALID: ticket must contain one EXECUTION_LOG');
  }
  const prefix = ticket.slice(0, index).replace(/\s*$/, '\n');
  return `${prefix}${entryBlock(record)}\n${ticket.slice(index)}`;
}

function replaceRecord(ticket: string, record: AttemptRecord): string {
  const begin = `<!--SDD_VERIFY_ATTEMPT:${record.runId}:BEGIN-->`;
  const end = `<!--SDD_VERIFY_ATTEMPT:${record.runId}:END-->`;
  const start = ticket.indexOf(begin);
  const finish = ticket.indexOf(end, start);
  if (start === -1 || finish === -1 || ticket.indexOf(begin, start + begin.length) !== -1) {
    throw new Error(`SDD_VERIFY_ATTEMPT_TARGET_INVALID: attempt ${record.runId} is not unique`);
  }
  return `${ticket.slice(0, start)}${entryBlock(record)}${ticket.slice(finish + end.length)}`;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readOwner(ownerPath: string): LockOwner {
  const value = JSON.parse(fs.readFileSync(ownerPath, 'utf8')) as LockOwner;
  if (
    value.schema !== LOCK_SCHEMA ||
    typeof value.runId !== 'string' ||
    typeof value.token !== 'string' ||
    typeof value.hostname !== 'string' ||
    !Number.isInteger(value.pid) ||
    Number.isNaN(Date.parse(value.heartbeatAt))
  ) {
    throw new Error('SDD_VERIFY_ATTEMPT_LOCK_CORRUPT: invalid lock owner');
  }
  return value;
}

function acquireOwnerMutation(directory: string): () => void {
  const mutation = path.join(directory, '.owner-mutation');
  try {
    fs.mkdirSync(mutation);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('SDD_VERIFY_ATTEMPT_ACTIVE: lock owner is being updated');
    }
    throw cause;
  }
  const captured = fs.lstatSync(mutation);
  return () => {
    try {
      if (sameEntry(captured, fs.lstatSync(mutation))) {
        fs.rmSync(mutation, { recursive: true, force: true });
      }
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    }
  };
}

function writeOwnerAtomically(
  ownerPath: string,
  owner: LockOwner,
  expected: LockOwner,
  beforeOwnerRename?: (temporaryPath: string) => void
): void {
  const captured = fs.lstatSync(ownerPath);
  const temporary = createOwnedTemporary(
    ownerPath,
    'owner',
    `${canonical(owner)}\n`,
    captured.mode
  );
  let renamed = false;
  try {
    beforeOwnerRename?.(temporary.absolute);
    const temporaryIssue = ownedTemporaryIssue(temporary);
    if (temporaryIssue !== null) {
      throw new Error(`SDD_VERIFY_ATTEMPT_LOCK_LOST: ${temporaryIssue}`);
    }
    const currentEntry = fs.lstatSync(ownerPath);
    const current = readOwner(ownerPath);
    if (!sameEntry(captured, currentEntry) || canonical(current) !== canonical(expected)) {
      throw new Error('SDD_VERIFY_ATTEMPT_LOCK_LOST');
    }
    fs.renameSync(temporary.absolute, ownerPath);
    renamed = true;
    const installed = JSON.parse(readOwnedInstalled(ownerPath, temporary).toString('utf8'));
    if (canonical(installed) !== canonical(owner)) {
      throw new Error('SDD_VERIFY_ATTEMPT_LOCK_LOST: installed owner identity changed');
    }
    fsyncParent(ownerPath);
  } finally {
    if (!renamed) cleanupOwnedTemporary(temporary);
  }
}

function acquireLock(
  root: string,
  ticketPath: string,
  runId: string,
  beforeStaleOwnerRecheck?: () => void
): {
  readonly directory: string;
  readonly ownerPath: string;
  readonly owner: LockOwner;
} {
  const gitPath = execFileSync(
    'git',
    ['-C', root, 'rev-parse', '--git-path', 'gennady/sdd-attempts'],
    {
      encoding: 'utf8',
    }
  ).trim();
  const parent = path.resolve(root, gitPath);
  fs.mkdirSync(parent, { recursive: true });
  const directory = path.join(parent, sha256(path.relative(root, ticketPath)).slice(7));
  const ownerPath = path.join(directory, 'owner.json');
  try {
    fs.mkdirSync(directory);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    const captured = fs.lstatSync(directory);
    const releaseMutation = acquireOwnerMutation(directory);
    try {
      const ownerEntry = fs.lstatSync(ownerPath);
      const owner = readOwner(ownerPath);
      const age = Date.now() - Date.parse(owner.heartbeatAt);
      const live = owner.hostname === os.hostname() ? pidAlive(owner.pid) : age <= LOCK_STALE_MS;
      if (live)
        throw new Error(`SDD_VERIFY_ATTEMPT_ACTIVE: run ${owner.runId} still owns this ticket`);
      beforeStaleOwnerRecheck?.();
      const currentEntry = fs.lstatSync(ownerPath);
      const current = readOwner(ownerPath);
      const currentAge = Date.now() - Date.parse(current.heartbeatAt);
      const currentLive =
        current.hostname === os.hostname() ? pidAlive(current.pid) : currentAge <= LOCK_STALE_MS;
      if (
        !sameEntry(captured, fs.lstatSync(directory)) ||
        !sameEntry(ownerEntry, currentEntry) ||
        canonical(current) !== canonical(owner) ||
        currentLive
      ) {
        throw new Error('SDD_VERIFY_ATTEMPT_ACTIVE: lock identity changed during recovery');
      }
      fs.rmSync(directory, { recursive: true });
    } finally {
      releaseMutation();
    }
    fs.mkdirSync(directory);
  }
  const owner: LockOwner = {
    schema: LOCK_SCHEMA,
    runId,
    token: randomUUID(),
    hostname: os.hostname(),
    pid: process.pid,
    heartbeatAt: new Date().toISOString(),
  };
  const createdDirectory = fs.lstatSync(directory);
  try {
    fs.writeFileSync(ownerPath, `${canonical(owner)}\n`, { flag: 'wx' });
  } catch (cause) {
    try {
      if (sameEntry(createdDirectory, fs.lstatSync(directory))) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    } catch {
      // Never remove a substituted lock directory while cleaning an incomplete acquisition.
    }
    throw cause;
  }
  return { directory, ownerPath, owner };
}

function updateOwner(
  ownerPath: string,
  owner: LockOwner,
  beforeOwnerRename?: (temporaryPath: string) => void
): void {
  const releaseMutation = acquireOwnerMutation(path.dirname(ownerPath));
  try {
    const current = readOwner(ownerPath);
    if (current.token !== owner.token) throw new Error('SDD_VERIFY_ATTEMPT_LOCK_LOST');
    writeOwnerAtomically(
      ownerPath,
      { ...owner, heartbeatAt: new Date().toISOString() },
      current,
      beforeOwnerRename
    );
  } finally {
    releaseMutation();
  }
}

function terminalRecord(
  root: string,
  ticketPath: string,
  running: AttemptRecord,
  outcome: SddAttemptOutcome
): AttemptRecord {
  const report = outcome.report;
  let state = terminalState(outcome);
  const scalarIssue = report === undefined ? null : reportScalarIssue(report);
  if (scalarIssue !== null) state = 'VIOLATION';
  const results = scalarIssue === null ? (report?.results ?? []) : [];
  const latest = new Map<string, VerifyStepResult>();
  for (const result of results) latest.set(result.stepId, result);
  const ordered = (report?.plan.steps ?? [])
    .map((step) => latest.get(step.id))
    .filter((item): item is VerifyStepResult => item !== undefined);
  const policyByStep = new Map(
    (report?.plan.steps ?? []).map((step) => [step.id, step.testStats] as const)
  );
  const malformedStats = ordered.some((result) => {
    const stats = result.testStats;
    const policy = policyByStep.get(result.stepId);
    const malformed =
      stats !== undefined &&
      (!Number.isInteger(stats.executed) ||
        !Number.isInteger(stats.passed) ||
        !Number.isInteger(stats.failed) ||
        !Number.isInteger(stats.skipped) ||
        stats.executed < 0 ||
        stats.passed < 0 ||
        stats.failed < 0 ||
        stats.skipped < 0 ||
        stats.passed + stats.failed + stats.skipped !== stats.executed ||
        stats.protocol.trim() === '' ||
        stats.runner.trim() === '' ||
        stats.source.trim() === '' ||
        policy === undefined ||
        policy.policy === 'none' ||
        stats.policy !== policy.policy ||
        stats.protocol !== policy.protocol ||
        stats.runner !== policy.runner);
    return (
      (policy?.policy === 'required' && result.process !== undefined && stats === undefined) ||
      malformed
    );
  });
  if (malformedStats) state = 'VIOLATION';
  const allProcesses = ordered.flatMap((result) =>
    result.process === undefined
      ? []
      : [
          {
            stepId: result.stepId,
            status: result.status,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            ...result.process,
          },
        ]
  );
  if (allProcesses.length > MAX_RECORDED_PROCESSES) state = 'VIOLATION';
  const processes = allProcesses.slice(0, MAX_RECORDED_PROCESSES);
  const allTestStats = ordered.flatMap((result) =>
    result.testStats === undefined ? [] : [{ stepId: result.stepId, ...result.testStats }]
  );
  if (allTestStats.length > MAX_RECORDED_PROCESSES) state = 'VIOLATION';
  const identity: AttemptIdentity =
    report === undefined
      ? running.identity
      : {
          headSha: scalarIssue === null ? report.context.headSha : running.identity.headSha,
          worktreeDigest: worktreeDigest(root, ticketPath),
          scopeDigest: sha256(canonical(report.context.request.scope)),
          planDigest: sha256(canonical(report.plan)),
          configDigest: sha256(
            canonical({ plugins: report.context.plugins, readiness: report.readiness })
          ),
          rulesDigest: scalarIssue === null ? report.rules.digest : sha256(canonical(report.rules)),
        };
  if (
    report !== undefined &&
    running.identity.headSha !== null &&
    report.context.headSha !== running.identity.headSha
  ) {
    state = 'VIOLATION';
  }
  if (state === 'PASS' && Object.values(identity).some((value) => value === null)) {
    throw new Error('SDD_VERIFY_ATTEMPT_INCOMPLETE: PASS requires complete freshness identity');
  }
  const finishedAt = new Date();
  return {
    ...running,
    selector: scalarIssue === null ? (report?.plan.phase ?? running.selector) : running.selector,
    state,
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - Date.parse(running.startedAt)),
    steps: { completed: ordered.length, total: report?.plan.steps.length ?? 0 },
    testStats: allTestStats.slice(0, MAX_RECORDED_PROCESSES),
    processes,
    projection: {
      complete: scalarIssue === null && allProcesses.length <= MAX_RECORDED_PROCESSES,
      totalProcesses: allProcesses.length,
    },
    reportState: report === undefined ? 'pre-report' : 'complete',
    identity,
    trust:
      scalarIssue !== null
        ? { level: 'pending', source: 'unsafe-evidence-projection', resolved: false }
        : report === undefined
          ? { level: 'pending', source: 'pre-report', resolved: false }
          : report.plan.trust.level === 'local-runner'
            ? { level: 'local-runner', source: report.plan.trust.source, resolved: true }
            : report.remote !== undefined &&
                report.remote.sourceSha === report.context.headSha &&
                report.remote.pipelineSha === report.context.headSha &&
                report.remote.terminalState === 'REMOTE_SUCCESS'
              ? {
                  level: 'remote-provider',
                  source: report.plan.trust.source,
                  resolved: true,
                  provider: report.remote.provider,
                  exactSha: report.remote.sourceSha,
                  pipelineId: report.remote.pipelineId,
                }
              : { level: 'remote-provider', source: report.plan.trust.source, resolved: false },
  };
}

/**
 * @purpose Serialize one SDD-owned Verify attempt while leaving the universal engine persistence-free.
 * @param input Exact validated task/log identity and callback that invokes the shared Verify engine.
 * @returns The callback outcome after the same journal entry reaches a terminal state.
 */
export async function runWithSddAttemptJournal(input: {
  readonly root: string;
  readonly ticketPath: string;
  readonly sddPhase: string;
  readonly legacyOverlay?: { readonly enabled: true; readonly provenance: string };
  /** @internal Deterministic race seams used only by adversarial contract tests. */
  readonly runtime?: {
    readonly heartbeatMs?: number;
    readonly beforeStaleOwnerRecheck?: () => void;
    readonly beforeOwnerRename?: (temporaryPath: string) => void;
    readonly beforeTicketRename?: (ticketPath: string, temporaryPath: string) => void;
  };
  readonly run: () => Promise<SddAttemptOutcome>;
}): Promise<SddAttemptOutcome> {
  assertPersistedScalar(input.sddPhase, 'sddPhase');
  if (input.legacyOverlay !== undefined) {
    assertPersistedScalar(input.legacyOverlay.provenance, 'legacyOverlay.provenance');
  }
  const runId = randomUUID();
  const lock = acquireLock(
    input.root,
    input.ticketPath,
    runId,
    input.runtime?.beforeStaleOwnerRecheck
  );
  const startedAt = new Date().toISOString();
  const initialHeadSha = headSha(input.root);
  const initialWorktreeDigest = worktreeDigest(input.root, input.ticketPath);
  const running: AttemptRecord = {
    schema: ATTEMPT_SCHEMA,
    runId,
    sddPhase: input.sddPhase,
    selector: null,
    state: 'RUNNING',
    startedAt,
    finishedAt: null,
    durationMs: null,
    steps: { completed: 0, total: 0 },
    testStats: [],
    processes: [],
    projection: { complete: true, totalProcesses: 0 },
    reportState: 'pending',
    identity: {
      headSha: initialHeadSha,
      worktreeDigest: initialWorktreeDigest,
      scopeDigest: null,
      planDigest: null,
      configDigest: null,
      rulesDigest: null,
    },
    trust: { level: 'pending', source: 'planning', resolved: false },
    ...(input.legacyOverlay === undefined ? {} : { legacyOverlay: input.legacyOverlay }),
  };
  let heartbeatFailure: Error | undefined;
  const heartbeat = setInterval(() => {
    try {
      updateOwner(lock.ownerPath, lock.owner, input.runtime?.beforeOwnerRename);
    } catch (cause) {
      heartbeatFailure = cause instanceof Error ? cause : new Error(String(cause));
    }
  }, input.runtime?.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();
  try {
    let ticket = fs.readFileSync(input.ticketPath, 'utf8');
    const stale = parseRecords(ticket).filter((record) => record.state === 'RUNNING');
    for (const record of stale) {
      ticket = replaceRecord(ticket, {
        ...record,
        state: 'INTERRUPTED',
        finishedAt: startedAt,
        durationMs: Math.max(0, Date.parse(startedAt) - Date.parse(record.startedAt)),
        reportState: 'pre-report',
        trust: { level: 'pending', source: 'orphan-recovery', resolved: false },
      });
    }
    ticket = insertRecord(ticket, running);
    writeTicketAtomically(input.root, input.ticketPath, ticket, input.runtime?.beforeTicketRename);
    let outcome: SddAttemptOutcome;
    let runnerFailure: Error | undefined;
    try {
      outcome = await input.run();
    } catch (cause) {
      runnerFailure = cause instanceof Error ? cause : new Error(String(cause));
      outcome = {
        exitCode: 1,
        stdout: '',
        stderr: `[sdd-verify] ${runnerFailure.message}\n`,
      };
    }
    const finished = terminalRecord(input.root, input.ticketPath, running, outcome);
    const remoteTrustUnproven =
      outcome.report?.plan.trust.level === 'remote-provider' &&
      finished.state !== 'BLOCKED' &&
      !finished.trust.resolved;
    const terminal =
      heartbeatFailure === undefined && runnerFailure === undefined && !remoteTrustUnproven
        ? finished
        : {
            ...finished,
            state: 'VIOLATION' as const,
            trust: {
              level: 'pending' as const,
              source:
                heartbeatFailure?.message ??
                (remoteTrustUnproven
                  ? 'remote-provider exact-SHA pipeline proof is incomplete'
                  : 'runner-exception'),
              resolved: false,
            },
          };
    writeTicketAtomically(
      input.root,
      input.ticketPath,
      replaceRecord(fs.readFileSync(input.ticketPath, 'utf8'), terminal),
      input.runtime?.beforeTicketRename
    );
    if (terminal.state === 'VIOLATION' && outcome.exitCode === 0) {
      return {
        ...outcome,
        exitCode: 1,
        stderr: `${outcome.stderr}[sdd-verify] SDD_VERIFY_ATTEMPT_EVIDENCE_INVALID: required runner evidence is incomplete\n`,
      };
    }
    return outcome;
  } finally {
    clearInterval(heartbeat);
    try {
      const releaseMutation = acquireOwnerMutation(lock.directory);
      try {
        const current = readOwner(lock.ownerPath);
        if (current.token === lock.owner.token) fs.rmSync(lock.directory, { recursive: true });
      } finally {
        releaseMutation();
      }
    } catch {
      // A lost/corrupt lease is retained for fail-closed operator recovery.
    }
  }
}
