// @file: Direct-argv local executor for one validated target Verify step.
// @spec: CLI-VERIFY
// @consumers: target verify runner (UV-10), executor contract tests

import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { compileEnvFailRules } from '../env-fail.ts';
import type {
  VerifyEvidence,
  VerifyMutation,
  VerifyRunReport,
  VerifyStepResult,
} from '../model/verify-report.type.ts';
import type { CapabilityMatrix } from '../model/verify-readiness.type.ts';
import type { PlannedVerifyStep, VerifyEnvironmentFailureRule } from '../model/verify-step.type.ts';
import type { WorkspaceGuard } from './workspace-guard.ts';

const DEFAULT_EVIDENCE_BYTES = 64 * 1024;
const DEFAULT_POLICY_OUTPUT_BYTES = 1024 * 1024;
const TERMINATION_GRACE_MS = 250;

type LocalExecutorProblemCode =
  | 'VERIFY_LOCAL_READINESS_BLOCKED'
  | 'VERIFY_LOCAL_COMMAND_MISSING'
  | 'VERIFY_LOCAL_COMMAND_INVALID'
  | 'VERIFY_LOCAL_STEP_WAIVED'
  | 'VERIFY_LOCAL_STEP_SKIPPED'
  | 'VERIFY_LOCAL_CWD_UNSAFE'
  | 'VERIFY_LOCAL_ENV_POLICY_INVALID'
  | 'VERIFY_LOCAL_ENVIRONMENT_FAILURE'
  | 'VERIFY_LOCAL_SPAWN_FAILED'
  | 'VERIFY_LOCAL_OUTPUT_LIMIT'
  | 'VERIFY_LOCAL_TIMEOUT'
  | 'VERIFY_LOCAL_CANCELLED'
  | 'VERIFY_LOCAL_WORKSPACE_VIOLATION';

type LocalExecutorProblem = {
  readonly code: LocalExecutorProblemCode | string;
  readonly message: string;
  readonly source?: string;
};

/** @purpose Return one terminal local-step product without pretending BLOCKED or cancellation passed. */
export type LocalStepExecution = {
  /** @purpose Accepted run verdict, plus typed local cancellation before a run verdict exists. */
  readonly verdict: VerifyRunReport['verdict'] | 'cancelled' | 'waived' | 'skipped';
  /** @purpose Terminal step result; null when readiness blocked execution before a process existed. */
  readonly result: VerifyStepResult | null;
  /** @purpose Mutations attributed by WorkspaceGuard in stable path order. */
  readonly mutations: readonly VerifyMutation[];
  /** @purpose Bounded command, stream, policy, and mutation evidence. */
  readonly evidence: readonly VerifyEvidence[];
  /** @purpose Typed actionable diagnostic for non-product terminal states. */
  readonly problem?: LocalExecutorProblem;
  /** @purpose POSIX cancellation identity returned after WorkspaceGuard restoration. */
  readonly cancellation?: {
    readonly signal: 'SIGINT' | 'SIGTERM';
    readonly exitCode: 130 | 143;
  };
};

type ProcessOutcome = {
  readonly exitCode: number | null;
  /** Bounded process streams used only for verdict predicates; never serialized as evidence. */
  readonly policyStdout: string;
  readonly policyStderr: string;
  readonly policyOutputExceeded: boolean;
  readonly stdoutHasNonWhitespace: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly spawnError?: Error;
  readonly termination: 'completed' | 'timeout' | 'cancelled';
};

class PolicyOutputCapture {
  readonly #maxBytes: number;
  readonly #streams: ReadonlySet<'stdout' | 'stderr'>;
  readonly #stdoutDecoder = new StringDecoder('utf8');
  readonly #stderrDecoder = new StringDecoder('utf8');
  #bytes = 0;
  #stdout = '';
  #stderr = '';
  #exceeded = false;

  constructor(maxBytes: number, streams: ReadonlySet<'stdout' | 'stderr'>) {
    this.#maxBytes = maxBytes;
    this.#streams = streams;
  }

  write(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    if (!this.#streams.has(stream) || this.#exceeded) return;
    const remaining = this.#maxBytes - this.#bytes;
    const accepted = chunk.subarray(0, Math.max(0, remaining));
    this.#bytes += accepted.length;
    if (stream === 'stdout') this.#stdout += this.#stdoutDecoder.write(accepted);
    else this.#stderr += this.#stderrDecoder.write(accepted);
    if (accepted.length < chunk.length) this.#exceeded = true;
  }

  finish(): { readonly stdout: string; readonly stderr: string; readonly exceeded: boolean } {
    if (!this.#exceeded) {
      this.#stdout += this.#stdoutDecoder.end();
      this.#stderr += this.#stderrDecoder.end();
    }
    return { stdout: this.#stdout, stderr: this.#stderr, exceeded: this.#exceeded };
  }
}

class NonWhitespaceStdoutDetector {
  readonly #decoder = new StringDecoder('utf8');
  #found = false;

  write(chunk: Buffer): void {
    if (!this.#found && this.#decoder.write(chunk).trim() !== '') this.#found = true;
  }

  finish(): boolean {
    if (!this.#found && this.#decoder.end().trim() !== '') this.#found = true;
    return this.#found;
  }
}

class BoundedUtf8Capture {
  readonly #decoder = new StringDecoder('utf8');
  readonly #maxBytes: number;
  #prefix = '';
  #prefixBytes = 0;
  #totalBytes = 0;
  #full = false;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  write(chunk: Buffer): void {
    this.#totalBytes += chunk.length;
    const decoded = this.#decoder.write(chunk);
    const remaining = this.#maxBytes - this.#prefixBytes;
    if (remaining <= 0 || this.#full) {
      this.#full = true;
      return;
    }
    const addition = utf8Prefix(decoded, remaining);
    this.#prefix += addition;
    this.#prefixBytes += Buffer.byteLength(addition);
    if (addition !== decoded) this.#full = true;
  }

  finish(): string {
    const tail = this.#decoder.end();
    if (tail !== '' && this.#prefixBytes < this.#maxBytes) {
      const addition = utf8Prefix(tail, this.#maxBytes - this.#prefixBytes);
      this.#prefix += addition;
      this.#prefixBytes += Buffer.byteLength(addition);
    }
    if (this.#totalBytes <= this.#maxBytes) return this.#prefix;

    let content = this.#prefix;
    let omitted = this.#totalBytes - Buffer.byteLength(content);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const marker = `\n[truncated ${omitted} byte(s)]`;
      content = utf8Prefix(this.#prefix, Math.max(0, this.#maxBytes - Buffer.byteLength(marker)));
      omitted = this.#totalBytes - Buffer.byteLength(content);
    }
    const marker = `\n[truncated ${omitted} byte(s)]`;
    return `${content}${marker}`;
  }
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function boundedText(value: string, maxBytes: number): string {
  const capture = new BoundedUtf8Capture(maxBytes);
  capture.write(Buffer.from(value));
  return capture.finish();
}

function boundedJoin(parts: Iterable<string>, separator: string, maxBytes: number): string {
  const capture = new BoundedUtf8Capture(maxBytes);
  let first = true;
  for (const part of parts) {
    if (!first) capture.write(Buffer.from(separator));
    capture.write(Buffer.from(part));
    first = false;
  }
  return capture.finish();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function safeCwd(root: string, candidate: string): string | LocalExecutorProblem {
  if (!path.isAbsolute(candidate) || path.resolve(candidate) !== candidate) {
    return {
      code: 'VERIFY_LOCAL_CWD_UNSAFE',
      message: `command cwd must be a normalized absolute path inside ${root}: ${candidate}`,
    };
  }
  if (!isInside(root, candidate)) {
    return {
      code: 'VERIFY_LOCAL_CWD_UNSAFE',
      message: `command cwd escapes workspace root ${root}: ${candidate}`,
    };
  }
  const relative = path.relative(root, candidate);
  let current = root;
  try {
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      if (fs.lstatSync(current).isSymbolicLink()) {
        return {
          code: 'VERIFY_LOCAL_CWD_UNSAFE',
          message: `command cwd traverses symlink ${path.relative(root, current)}`,
        };
      }
    }
    const real = fs.realpathSync(candidate);
    if (!isInside(root, real) || !fs.statSync(real).isDirectory()) {
      return {
        code: 'VERIFY_LOCAL_CWD_UNSAFE',
        message: `command cwd is not a real directory inside workspace root: ${candidate}`,
      };
    }
    return real;
  } catch (error) {
    return {
      code: 'VERIFY_LOCAL_CWD_UNSAFE',
      message: `command cwd is unavailable: ${candidate}: ${String(error)}`,
    };
  }
}

function readinessBlock(
  step: PlannedVerifyStep,
  readiness: CapabilityMatrix | undefined
): LocalExecutorProblem | null {
  const pluginBlock = readiness?.entries.find(
    (entry) =>
      entry.plugin === step.plugin &&
      entry.stepId === undefined &&
      entry.status === 'BLOCKED' &&
      entry.blocking !== false
  );
  if (pluginBlock !== undefined) {
    return {
      code: 'VERIFY_LOCAL_READINESS_BLOCKED',
      message: `${pluginBlock.message}; ${pluginBlock.fix ?? 'repair plugin readiness before execution'}`,
      ...(pluginBlock.policySource === undefined ? {} : { source: pluginBlock.policySource }),
    };
  }
  const required = step.requires.filter((requirement) => requirement.required);
  if (required.length === 0) return null;
  if (readiness === undefined) {
    return {
      code: 'VERIFY_LOCAL_READINESS_BLOCKED',
      message: `required readiness is missing for ${step.id}: ${required.map((entry) => entry.id).join(', ')}`,
    };
  }
  for (const requirement of required) {
    const entry = readiness.entries.find(
      (candidate) =>
        candidate.plugin === step.plugin &&
        candidate.stepId === step.id &&
        candidate.requirementId === requirement.id
    );
    if (entry === undefined) {
      return {
        code: 'VERIFY_LOCAL_READINESS_BLOCKED',
        message: `readiness omitted required capability ${requirement.id} for ${step.id}; ${requirement.fix}`,
      };
    }
    if (entry.status === 'BLOCKED' && entry.blocking !== false) {
      return {
        code: 'VERIFY_LOCAL_READINESS_BLOCKED',
        message: `${entry.message}; ${entry.fix ?? requirement.fix}`,
        ...(entry.policySource === undefined ? {} : { source: entry.policySource }),
      };
    }
  }
  return null;
}

function compileEnvironmentRules(step: PlannedVerifyStep):
  | {
      readonly predicates: ReadonlyArray<
        ReturnType<typeof compileEnvFailRules>['predicates'][number]
      >;
      readonly rules: readonly VerifyEnvironmentFailureRule[];
      readonly streams: ReadonlySet<'stdout' | 'stderr'>;
    }
  | { readonly problem: LocalExecutorProblem } {
  const predicates: ReturnType<typeof compileEnvFailRules>['predicates'] = [];
  const rules: VerifyEnvironmentFailureRule[] = [];
  const streams = new Set<'stdout' | 'stderr'>();
  for (const [index, rule] of (step.envFail ?? []).entries()) {
    const { source, ...serializable } = rule;
    const compiled = compileEnvFailRules(
      [serializable],
      `verify.steps.${step.id}.envFail[${index}]`,
      source
    );
    if (compiled.errors[0] !== undefined) {
      return {
        problem: {
          code: 'VERIFY_LOCAL_ENV_POLICY_INVALID',
          message: `${compiled.errors[0].path}: ${compiled.errors[0].message}`,
          ...(source === undefined ? {} : { source }),
        },
      };
    }
    predicates.push(compiled.predicates[0]!);
    rules.push(rule);
    if (rule.stdoutMatches !== undefined || rule.outputMatches !== undefined) streams.add('stdout');
    if (rule.stderrMatches !== undefined || rule.outputMatches !== undefined) streams.add('stderr');
  }
  return { predicates, rules, streams };
}

async function killProcessTree(child: ChildProcess, force: boolean): Promise<void> {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        'taskkill',
        ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])],
        {
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      let settled = false;
      const finish = (fallback: boolean) => {
        if (settled) return;
        settled = true;
        if (fallback) child.kill(force ? 'SIGKILL' : 'SIGTERM');
        resolve();
      };
      killer.once('error', () => finish(true));
      killer.once('close', (exitCode) => finish(exitCode !== 0));
    });
    return;
  }
  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      child.kill(force ? 'SIGKILL' : 'SIGTERM');
    }
  }
}

async function runProcess(
  argv: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> | undefined,
  timeoutMs: number,
  maxEvidenceBytes: number,
  maxPolicyOutputBytes: number,
  policyStreams: ReadonlySet<'stdout' | 'stderr'>,
  detectStdoutContent: boolean,
  signal: AbortSignal | undefined
): Promise<ProcessOutcome> {
  const stdout = new BoundedUtf8Capture(maxEvidenceBytes);
  const stderr = new BoundedUtf8Capture(maxEvidenceBytes);
  const policy = new PolicyOutputCapture(maxPolicyOutputBytes, policyStreams);
  const stdoutContent = new NonWhitespaceStdoutDetector();
  let spawnError: Error | undefined;
  let termination: ProcessOutcome['termination'] = 'completed';

  return await new Promise<ProcessOutcome>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(argv[0]!, [...argv.slice(1)], {
        cwd,
        env: env === undefined ? process.env : { ...process.env, ...env },
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (cause) {
      resolve({
        exitCode: null,
        policyStdout: '',
        policyStderr: '',
        policyOutputExceeded: false,
        stdoutHasNonWhitespace: false,
        stdout: '',
        stderr: '',
        spawnError: cause instanceof Error ? cause : new Error(String(cause)),
        termination,
      });
      return;
    }
    let forceTimer: NodeJS.Timeout | undefined;
    let terminationTask = Promise.resolve();
    const terminate = (reason: 'timeout' | 'cancelled') => {
      if (termination !== 'completed') return;
      termination = reason;
      terminationTask = killProcessTree(child, false);
      forceTimer = setTimeout(() => {
        terminationTask = terminationTask.then(() => killProcessTree(child, true));
      }, TERMINATION_GRACE_MS);
      forceTimer.unref();
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout.write(chunk);
      if (detectStdoutContent) stdoutContent.write(chunk);
      policy.write('stdout', chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.write(chunk);
      policy.write('stderr', chunk);
    });
    child.on('error', (error) => {
      spawnError = error;
    });
    const timeout = setTimeout(() => terminate('timeout'), timeoutMs);
    timeout.unref();
    const abort = () => terminate('cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted === true) abort();

    child.once('close', async (exitCode) => {
      clearTimeout(timeout);
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      await terminationTask;
      if (termination !== 'completed') await killProcessTree(child, true);
      signal?.removeEventListener('abort', abort);
      const policyOutput = policy.finish();
      resolve({
        exitCode,
        policyStdout: policyOutput.stdout,
        policyStderr: policyOutput.stderr,
        policyOutputExceeded: policyOutput.exceeded,
        stdoutHasNonWhitespace: detectStdoutContent ? stdoutContent.finish() : false,
        stdout: stdout.finish(),
        stderr: stderr.finish(),
        ...(spawnError === undefined ? {} : { spawnError }),
        termination,
      });
    });
  });
}

function evidenceFor(
  step: PlannedVerifyStep,
  cwd: string,
  outcome: ProcessOutcome,
  mutations: readonly VerifyMutation[],
  status: VerifyStepResult['status'],
  maxEvidenceBytes: number,
  environment?: { readonly hint?: string; readonly source?: string }
): readonly VerifyEvidence[] {
  const item = (
    kind: VerifyEvidence['kind'],
    identity: string,
    summary: string
  ): VerifyEvidence => ({ kind, identity, summary: boundedText(summary, maxEvidenceBytes) });
  const commandIdentity = sha256(JSON.stringify([step.command?.argv, cwd]));
  const evidence: VerifyEvidence[] = [
    item(
      'command',
      `local:${step.id}:command:${commandIdentity}`,
      `direct command with ${Math.max(0, (step.command?.argv.length ?? 1) - 1)} argument(s); cwd bound to workspace; status ${status}`
    ),
  ];
  if (status !== 'pass' && outcome.stdout !== '') {
    evidence.push(item('log', `local:${step.id}:stdout`, outcome.stdout));
  }
  if (status !== 'pass' && outcome.stderr !== '') {
    evidence.push(item('log', `local:${step.id}:stderr`, outcome.stderr));
  }
  if (environment !== undefined) {
    evidence.push(
      item(
        'log',
        `local:${step.id}:environment`,
        boundedJoin(
          [environment.source, environment.hint].filter(
            (part): part is string => part !== undefined
          ),
          ': ',
          maxEvidenceBytes
        )
      )
    );
  }
  if (mutations.length > 0) {
    const lines = function* () {
      for (const mutation of mutations) {
        yield `${mutation.kind}:${mutation.path}:${mutation.allowed ? 'allowed' : 'denied'}`;
      }
    };
    evidence.push(
      item('diff', `local:${step.id}:mutations`, boundedJoin(lines(), '\n', maxEvidenceBytes))
    );
  }
  return evidence;
}

function blocked(problem: LocalExecutorProblem): LocalStepExecution {
  return { verdict: 'blocked', result: null, mutations: [], evidence: [], problem };
}

function waived(
  step: PlannedVerifyStep,
  entry: CapabilityMatrix['entries'][number],
  startedAt: number,
  maxEvidenceBytes: number
): LocalStepExecution {
  const source = entry.policySource ?? 'unknown source';
  const reason = entry.policyReason ?? entry.message;
  const message = boundedJoin([step.id, ' waived by ', source, ': ', reason], '', maxEvidenceBytes);
  return {
    verdict: 'waived',
    result: {
      stepId: step.id,
      plugin: step.plugin,
      status: 'waived',
      exitCode: null,
      durationMs: Date.now() - startedAt,
      output: message,
    },
    mutations: [],
    evidence: [
      {
        kind: 'log',
        identity: `local:${step.id}:waiver`,
        summary: message,
      },
    ],
    problem: { code: 'VERIFY_LOCAL_STEP_WAIVED', message, source },
  };
}

function skipped(
  step: PlannedVerifyStep,
  entry: CapabilityMatrix['entries'][number],
  startedAt: number,
  maxEvidenceBytes: number
): LocalStepExecution {
  const message = boundedJoin([step.id, ' skipped: ', entry.message], '', maxEvidenceBytes);
  return {
    verdict: 'skipped',
    result: {
      stepId: step.id,
      plugin: step.plugin,
      status: 'skipped',
      exitCode: null,
      durationMs: Date.now() - startedAt,
      output: message,
    },
    mutations: [],
    evidence: [
      {
        kind: 'log',
        identity: `local:${step.id}:disposition`,
        summary: message,
      },
    ],
    problem: { code: 'VERIFY_LOCAL_STEP_SKIPPED', message },
  };
}

/**
 * @purpose Execute one validated local step with bounded evidence and WorkspaceGuard attribution.
 * @param step Qualified selected DAG node.
 * @param guard Live dirty-safe workspace transaction for the same repository.
 * @param [options] Readiness, cancellation, and evidence bounds supplied by the target runner.
 * @returns One typed terminal local-step product; never an implicit pass.
 */
export async function executeLocalStep(
  step: PlannedVerifyStep,
  guard: WorkspaceGuard,
  options: {
    readonly readiness?: CapabilityMatrix;
    readonly signal?: AbortSignal;
    readonly cancellationSignal?: 'SIGINT' | 'SIGTERM';
    readonly maxEvidenceBytes?: number;
    readonly maxPolicyOutputBytes?: number;
  } = {}
): Promise<LocalStepExecution> {
  const startedAt = Date.now();
  const maxEvidenceBytes = options.maxEvidenceBytes ?? DEFAULT_EVIDENCE_BYTES;
  const maxPolicyOutputBytes = options.maxPolicyOutputBytes ?? DEFAULT_POLICY_OUTPUT_BYTES;
  if (
    !Number.isInteger(maxEvidenceBytes) ||
    maxEvidenceBytes < 128 ||
    maxEvidenceBytes > DEFAULT_EVIDENCE_BYTES
  ) {
    return blocked({
      code: 'VERIFY_LOCAL_COMMAND_INVALID',
      message: `maxEvidenceBytes must be an integer between 128 and ${DEFAULT_EVIDENCE_BYTES}`,
    });
  }
  if (
    !Number.isInteger(maxPolicyOutputBytes) ||
    maxPolicyOutputBytes < 128 ||
    maxPolicyOutputBytes > DEFAULT_POLICY_OUTPUT_BYTES
  ) {
    return blocked({
      code: 'VERIFY_LOCAL_COMMAND_INVALID',
      message: `maxPolicyOutputBytes must be an integer between 128 and ${DEFAULT_POLICY_OUTPUT_BYTES}`,
    });
  }
  const dispositions = options.readiness?.entries.filter(
    (entry) =>
      entry.plugin === step.plugin && entry.stepId === step.id && entry.disposition !== undefined
  );
  const waiver = dispositions?.find((entry) => entry.disposition === 'waived');
  if (waiver !== undefined) {
    return waived(step, waiver, startedAt, maxEvidenceBytes);
  }
  const readinessProblem = readinessBlock(step, options.readiness);
  if (readinessProblem !== null) return blocked(readinessProblem);
  const skippedDisposition = dispositions?.find(
    (entry) =>
      entry.disposition === 'not-applicable' || entry.disposition === 'optional-unavailable'
  );
  if (skippedDisposition !== undefined) {
    return skipped(step, skippedDisposition, startedAt, maxEvidenceBytes);
  }
  if (step.executor !== 'local') {
    return blocked({
      code: 'VERIFY_LOCAL_COMMAND_INVALID',
      message: `local executor cannot run ${step.executor} step ${step.id}`,
    });
  }
  if (step.command === undefined) {
    return blocked({
      code: 'VERIFY_LOCAL_COMMAND_MISSING',
      message: `selected local step ${step.id} has no materialized command`,
    });
  }
  if (
    step.command.argv.length === 0 ||
    step.command.argv[0]?.trim() === '' ||
    !Number.isInteger(step.command.timeoutMs) ||
    step.command.timeoutMs <= 0 ||
    !Number.isInteger(step.timeoutMs) ||
    step.timeoutMs <= 0
  ) {
    return blocked({
      code: 'VERIFY_LOCAL_COMMAND_INVALID',
      message: `selected local step ${step.id} has invalid argv or timeout`,
    });
  }
  const cwd = safeCwd(guard.toplevel, step.command.cwd);
  if (typeof cwd !== 'string') {
    return {
      verdict: 'violation',
      result: {
        stepId: step.id,
        plugin: step.plugin,
        status: 'violation',
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: cwd.message,
      },
      mutations: [],
      evidence: [],
      problem: cwd,
    };
  }
  const environment = compileEnvironmentRules(step);
  if ('problem' in environment) return blocked(environment.problem);

  const cancellationSignal = options.cancellationSignal ?? 'SIGINT';
  if (options.signal?.aborted === true) {
    const cancelled = guard.cancel(cancellationSignal);
    if (cancelled.kind === 'error') {
      const problem = {
        code: 'VERIFY_LOCAL_WORKSPACE_VIOLATION',
        message: cancelled.error.message,
      };
      return {
        verdict: 'violation',
        result: {
          stepId: step.id,
          plugin: step.plugin,
          status: 'violation',
          exitCode: null,
          durationMs: Date.now() - startedAt,
          output: problem.message,
        },
        mutations: [],
        evidence: [],
        problem,
      };
    }
    return {
      verdict: 'cancelled',
      result: {
        stepId: step.id,
        plugin: step.plugin,
        status: 'cancelled',
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: `cancelled by ${cancellationSignal}`,
      },
      mutations: [],
      evidence: [],
      problem: {
        code: 'VERIFY_LOCAL_CANCELLED',
        message: `step ${step.id} cancelled before spawn by ${cancellationSignal}`,
      },
      cancellation: { signal: cancellationSignal, exitCode: cancelled.exitCode },
    };
  }

  const armed = guard.beginStep(step);
  if (armed.kind === 'error') {
    const problem = { code: armed.error.code, message: armed.error.message };
    return {
      verdict: 'violation',
      result: {
        stepId: step.id,
        plugin: step.plugin,
        status: 'violation',
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: problem.message,
      },
      mutations: [],
      evidence: [],
      problem,
    };
  }

  const processOutcome = await runProcess(
    step.command.argv,
    cwd,
    step.command.env,
    Math.min(step.timeoutMs, step.command.timeoutMs),
    maxEvidenceBytes,
    maxPolicyOutputBytes,
    environment.streams,
    step.outputMeansFailure === true,
    options.signal
  );
  const combined = boundedText(
    [processOutcome.stdout, processOutcome.stderr].filter(Boolean).join('\n'),
    maxEvidenceBytes
  );
  let status: VerifyStepResult['status'];
  let verdict: LocalStepExecution['verdict'];
  let problem: LocalExecutorProblem | undefined;
  let matchedEnvironment: { readonly hint?: string; readonly source?: string } | undefined;

  if (processOutcome.termination === 'timeout') {
    status = 'timeout';
    verdict = 'timeout';
    problem = {
      code: 'VERIFY_LOCAL_TIMEOUT',
      message: `step ${step.id} exceeded ${Math.min(step.timeoutMs, step.command.timeoutMs)}ms`,
    };
  } else if (processOutcome.termination === 'cancelled') {
    status = 'cancelled';
    verdict = 'cancelled';
    problem = {
      code: 'VERIFY_LOCAL_CANCELLED',
      message: `step ${step.id} cancelled by ${cancellationSignal}`,
    };
  } else if (processOutcome.spawnError !== undefined) {
    status = 'env-fail';
    verdict = 'env-fail';
    problem = {
      code: 'VERIFY_LOCAL_SPAWN_FAILED',
      message: `cannot spawn ${step.id}: ${processOutcome.spawnError.message}`,
    };
  } else {
    status = processOutcome.exitCode === 0 ? 'pass' : 'fail';
    if (
      status === 'pass' &&
      step.outputMeansFailure === true &&
      processOutcome.stdoutHasNonWhitespace
    ) {
      status = 'fail';
    }
    const outcome = {
      exitCode: processOutcome.exitCode,
      timedOut: false,
      stdout: processOutcome.policyStdout,
      stderr: processOutcome.policyStderr,
      output: `${processOutcome.policyStdout}${processOutcome.policyStderr}`,
    };
    const environmentIndex = environment.predicates.findIndex((predicate) => predicate(outcome));
    if (environmentIndex !== -1) {
      status = 'env-fail';
      const rule = environment.rules[environmentIndex]!;
      matchedEnvironment = {
        hint: rule.hint,
        ...(rule.source === undefined ? {} : { source: rule.source }),
      };
      problem = {
        code: 'VERIFY_LOCAL_ENVIRONMENT_FAILURE',
        message: rule.hint,
        ...(rule.source === undefined ? {} : { source: rule.source }),
      };
    } else if (
      processOutcome.exitCode !== 0 &&
      processOutcome.policyOutputExceeded &&
      environment.streams.size > 0
    ) {
      status = 'violation';
      problem = {
        code: 'VERIFY_LOCAL_OUTPUT_LIMIT',
        message: `cannot classify nonzero step ${step.id}: regex policy output exceeded ${maxPolicyOutputBytes} bytes before any environment rule matched`,
      };
    }
    verdict =
      status === 'pass'
        ? 'pass'
        : status === 'env-fail'
          ? 'env-fail'
          : status === 'violation'
            ? 'violation'
            : 'fail';
  }

  let mutations: readonly VerifyMutation[] = [];
  let cancellation: LocalStepExecution['cancellation'];
  if (status === 'cancelled') {
    const cancelled = guard.cancel(cancellationSignal);
    if (cancelled.kind === 'error') {
      status = 'violation';
      verdict = 'violation';
      problem = {
        code: cancelled.error.code,
        message: cancelled.error.message,
      };
    } else {
      cancellation = { signal: cancellationSignal, exitCode: cancelled.exitCode };
    }
  } else {
    const workspace = guard.finishStep(step.id, { succeeded: status === 'pass' });
    mutations = workspace.mutations;
    if (workspace.kind === 'violation' || workspace.kind === 'error') {
      status = 'violation';
      verdict = 'violation';
      problem = {
        code: workspace.error.code,
        message: workspace.error.message,
      };
    }
  }

  const output = boundedText(
    [problem?.message, combined, matchedEnvironment?.source, matchedEnvironment?.hint]
      .filter(Boolean)
      .join('\n'),
    maxEvidenceBytes
  );
  const evidence = evidenceFor(
    step,
    cwd,
    processOutcome,
    mutations,
    status,
    maxEvidenceBytes,
    matchedEnvironment
  );
  return {
    verdict,
    result: {
      stepId: step.id,
      plugin: step.plugin,
      status,
      exitCode: processOutcome.exitCode,
      durationMs: Date.now() - startedAt,
      output: status === 'pass' ? '' : output,
    },
    mutations,
    evidence,
    ...(problem === undefined ? {} : { problem }),
    ...(cancellation === undefined ? {} : { cancellation }),
  };
}
