// @file: Extract the important artifacts out of eval sandboxes, then tear the sandboxes down.
// @spec: AI-SKILLS
// @consumers: ai/flow-eval/cli.ts (run lifecycle); ai/flow-eval/__tests__/sandbox-lifecycle.test.ts
//   A sandbox is a throwaway scenario checkout whose dependencies are shared by verified symlink.
//   Nothing durable may live only inside it: this module copies the specs/judge/summary into a
//   persistent artifacts root, and then removes the exact owned directories.

import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { countOpenDeviations } from '../../shared/sdd/deviation.ts';
import {
  releaseEvalDependencyLease,
  startEvalDependencyLeaseHeartbeat,
  type EvalDependencyLeaseHandle,
  type EvalDependencyLeaseHeartbeat,
} from './dependency-store.ts';
import { SDD_EVAL_RETENTION_POLICY } from './retention-policy.ts';

export type SddEvalLifecycleReason = 'success' | 'failure' | 'setup-failure' | 'SIGINT' | 'SIGTERM';

/** @purpose One scenario's durable outcome — everything worth keeping after its sandbox is gone. */
export type SddEvalRunArtifact = {
  scenarioId: string;
  verdict: string;
  status: string;
  /** @purpose E-17 non-statistical outcome; deterministic failures remain in `quality`. */
  outcome?: 'budget-exhausted';
  /** Typed observation boundary plus the unresolved-decision count it left visible. */
  budgetExhausted?: {
    kind: 'observation' | 'wall-clock';
    detail: string;
    pendingOperatorCount: number;
  };
  usage?: unknown;
  quality?: { rule: string; pass: boolean; detail: string };
  /** Absolute paths (inside the sandbox) of spec files the worker produced. */
  specFiles: string[];
  /** Absolute path (inside the sandbox) of the judge rationale file, when written. */
  judgeFile?: string;
  /** Absolute sandbox directory this outcome came from. */
  directory: string;
};

/**
 * @purpose Render the E-17 boundary as one stable observable line for CLI and tests.
 * @param boundary Typed budget cause plus unresolved operator-decision count.
 * @returns Human-readable detail preserving both budget kind and pending count.
 */
export function formatBudgetExhausted(
  boundary: NonNullable<SddEvalRunArtifact['budgetExhausted']>
): string {
  return `${boundary.kind} — ${boundary.detail}; pending-operator=${boundary.pendingOperatorCount}`;
}

/** @purpose Count unresolved deviation records in co-located V2 tickets without judging them. */
export async function countPendingOperatorDeviations(root: string): Promise<number> {
  const contents: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (NON_ARTIFACT_SEGMENTS.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile() && /\.task\.[^.]+\.md$/.test(entry.name)) {
        const content = await readFile(join(dir, entry.name), 'utf8').catch(() => null);
        if (content !== null) contents.push(content);
      }
    }
  }
  await walk(root);
  return countOpenDeviations(contents);
}

// Directory segments that are provisioned scaffolding, never worker-authored output.
const NON_ARTIFACT_SEGMENTS = new Set(['ai', 'node_modules', '.claude', '.git']);

/** @purpose Recursively collect worker-authored *.spec.md paths, skipping provisioned scaffolding. */
export async function collectSpecFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // a sandbox that failed to provision has nothing to collect
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (NON_ARTIFACT_SEGMENTS.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.spec.md')) {
        found.push(join(dir, entry.name));
      }
    }
  }
  await walk(root);
  return found.sort();
}

/**
 * @purpose Copy every run's durable artifacts into a persistent, sandbox-independent run directory.
 * @returns The absolute path of the created run directory (so the CLI can report it).
 */
export async function persistRunArtifacts(
  artifactsRoot: string,
  runStamp: string,
  entries: SddEvalRunArtifact[],
  lifecycle?: { reason: SddEvalLifecycleReason; completedAt: string }
): Promise<string> {
  const runDir = join(artifactsRoot, runStamp);
  await mkdir(runDir, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const scenarioDir = join(runDir, entry.scenarioId);
    const savedSpecs: string[] = [];
    for (const spec of entry.specFiles) {
      // Preserve the spec's path relative to its sandbox (e.g. specs/<scope>/<module>/x.spec.md).
      const rel = relative(entry.directory, spec);
      const target = join(scenarioDir, rel);
      await mkdir(dirname(target), { recursive: true });
      await cp(spec, target).catch(() => undefined);
      savedSpecs.push(rel);
    }
    if (entry.judgeFile) {
      const target = join(scenarioDir, 'judge.md');
      await mkdir(scenarioDir, { recursive: true });
      await cp(entry.judgeFile, target).catch(() => undefined);
    }
    summary.push({
      scenarioId: entry.scenarioId,
      verdict: entry.verdict,
      status: entry.status,
      outcome: entry.outcome,
      budgetExhausted: entry.budgetExhausted,
      usage: entry.usage,
      quality: entry.quality,
      specFiles: savedSpecs,
      hasJudge: Boolean(entry.judgeFile),
    });
  }
  await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (lifecycle) {
    await writeFile(
      join(runDir, 'lifecycle.json'),
      `${JSON.stringify(lifecycle, null, 2)}\n`,
      'utf8'
    );
  }
  return runDir;
}

async function directoryEntries(root: string): Promise<Awaited<ReturnType<typeof readdir>>> {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** @purpose Bound gitignored `.results/run-*` evidence; permanent `results/` is never passed here. */
export async function pruneTransientRunArtifacts(
  artifactsRoot: string,
  options: { nowMs?: number; protectRun?: string } = {}
): Promise<string[]> {
  const nowMs = options.nowMs ?? Date.now();
  const runs: Array<{ name: string; path: string; mtimeMs: number }> = [];
  for (const entry of await directoryEntries(artifactsRoot)) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-')) continue;
    const path = join(artifactsRoot, entry.name);
    runs.push({ name: entry.name, path, mtimeMs: (await stat(path)).mtimeMs });
  }
  runs.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  const removed: string[] = [];
  let retained = runs.some((run) => run.name === options.protectRun) ? 1 : 0;
  for (const run of runs) {
    if (run.name === options.protectRun) {
      continue;
    }
    const expired = nowMs - run.mtimeMs > SDD_EVAL_RETENTION_POLICY.transientResult.maxAgeMs;
    if (!expired && retained < SDD_EVAL_RETENTION_POLICY.transientResult.maxEntries) {
      retained += 1;
      continue;
    }
    await rm(run.path, { recursive: true, force: true });
    removed.push(run.path);
  }
  return removed;
}

type RetainedSandboxMarker = {
  schema: 1;
  runId: string;
  retainedAt: string;
  expiresAt: string;
};

const RETAINED_MARKER = '.sdd-eval-retained.json';

/** @purpose Remove only marker-owned debug sandboxes, bounded by age and count. */
export async function pruneRetainedSandboxes(
  sandboxRoot: string,
  options: { nowMs?: number; protect?: ReadonlySet<string> } = {}
): Promise<string[]> {
  const nowMs = options.nowMs ?? Date.now();
  const retained: Array<{ path: string; retainedAtMs: number; expiresAtMs: number }> = [];
  for (const entry of await directoryEntries(sandboxRoot)) {
    if (!entry.isDirectory() || !entry.name.startsWith('sdd-flow-eval-')) continue;
    const path = join(sandboxRoot, entry.name);
    const markerPath = join(path, RETAINED_MARKER);
    if (!existsSync(markerPath)) continue;
    try {
      const marker = JSON.parse(await readFile(markerPath, 'utf8')) as RetainedSandboxMarker;
      if (marker.schema !== 1) continue;
      retained.push({
        path,
        retainedAtMs: Date.parse(marker.retainedAt),
        expiresAtMs: Date.parse(marker.expiresAt),
      });
    } catch {
      continue;
    }
  }
  retained.sort((a, b) => b.retainedAtMs - a.retainedAtMs || a.path.localeCompare(b.path));
  const removed: string[] = [];
  let kept = 0;
  for (const entry of retained) {
    if (options.protect?.has(resolve(entry.path))) {
      kept += 1;
      continue;
    }
    if (entry.expiresAtMs > nowMs && kept < SDD_EVAL_RETENTION_POLICY.debugSandbox.maxEntries) {
      kept += 1;
      continue;
    }
    const entryStat = await lstat(entry.path);
    if (entryStat.isSymbolicLink()) continue;
    await rm(entry.path, { recursive: true, force: true });
    removed.push(entry.path);
  }
  return removed;
}

type LifecycleOptions = {
  sandboxRoot: string;
  artifactsRoot: string;
  runId: string;
  keep: boolean;
  /** @purpose Permanent evidence root that transient compaction must never overlap. */
  protectedArtifactsRoot?: string;
  now?: () => Date;
  /** @purpose Deterministic failure injection for cleanup retry tests. */
  removeDirectory?: (path: string) => Promise<void>;
  /** @purpose Deterministic compaction failure injection without weakening production ordering. */
  persistArtifacts?: typeof persistRunArtifacts;
};

export type SddEvalFinalizationResult = {
  runDirectory?: string;
  removed: number;
  retained: number;
  pending: readonly string[];
  errors: readonly string[];
};

/** @purpose Exact owned-path lifecycle: compact evidence first, then retryable cleanup. */
export class SddEvalSandboxLifecycle {
  readonly #sandboxRoot: string;
  readonly #artifactsRoot: string;
  readonly #runId: string;
  readonly #keep: boolean;
  readonly #now: () => Date;
  readonly #removeDirectory: (path: string) => Promise<void>;
  readonly #persistArtifacts: typeof persistRunArtifacts;
  readonly #owned = new Map<string, string>();
  readonly #dependencyLeases = new Map<
    string,
    { readonly handle: EvalDependencyLeaseHandle; readonly heartbeat: EvalDependencyLeaseHeartbeat }
  >();
  #runDirectory: string | undefined;
  #activeFinalization: Promise<SddEvalFinalizationResult> | undefined;

  constructor(options: LifecycleOptions) {
    const resolvedSandboxRoot = resolve(options.sandboxRoot);
    this.#sandboxRoot = existsSync(resolvedSandboxRoot)
      ? realpathSync(resolvedSandboxRoot)
      : resolvedSandboxRoot;
    this.#artifactsRoot = resolve(options.artifactsRoot);
    if (options.protectedArtifactsRoot) {
      const canonicalize = (path: string): string => {
        let existing = resolve(path);
        const suffix: string[] = [];
        while (!existsSync(existing)) {
          const parent = dirname(existing);
          if (parent === existing) break;
          suffix.unshift(basename(existing));
          existing = parent;
        }
        const canonicalParent = existsSync(existing) ? realpathSync(existing) : existing;
        return resolve(canonicalParent, ...suffix);
      };
      const artifacts = canonicalize(this.#artifactsRoot);
      const protectedArtifacts = canonicalize(options.protectedArtifactsRoot);
      const overlaps = (relation: string): boolean => {
        const escapes = relation === '..' || relation.startsWith(`..${sep}`);
        return relation === '' || (!escapes && !isAbsolute(relation));
      };
      if (
        overlaps(relative(protectedArtifacts, artifacts)) ||
        overlaps(relative(artifacts, protectedArtifacts))
      ) {
        throw new Error(
          `transient artifacts directory must be disjoint from permanent results: ${options.artifactsRoot}`
        );
      }
    }
    this.#runId = options.runId;
    this.#keep = options.keep;
    this.#now = options.now ?? (() => new Date());
    this.#removeDirectory =
      options.removeDirectory ??
      (async (path) => {
        await rm(path, { recursive: true, force: true });
      });
    this.#persistArtifacts = options.persistArtifacts ?? persistRunArtifacts;
  }

  /** @purpose Register only a freshly-created direct child sandbox owned by this run. */
  registerOwnedDirectory(scenarioId: string, directory: string): void {
    const exact = resolve(directory);
    const parent = existsSync(dirname(exact)) ? realpathSync(dirname(exact)) : dirname(exact);
    const entry = existsSync(exact) ? lstatSync(exact) : undefined;
    if (
      parent !== this.#sandboxRoot ||
      entry?.isSymbolicLink() ||
      !basename(exact).startsWith('sdd-flow-eval-')
    ) {
      throw new Error(`refusing to track non-owned eval sandbox path: ${directory}`);
    }
    if (!entry?.isDirectory()) {
      throw new Error(`owned eval sandbox must be an existing ordinary directory: ${directory}`);
    }
    this.#owned.set(exact, scenarioId);
  }

  /** @purpose Retain the exact dependency-store lease until sandbox cleanup completes. */
  registerDependencyLease(lease: EvalDependencyLeaseHandle): void {
    const exact = resolve(lease.file);
    if (this.#dependencyLeases.has(exact)) return;
    const handle = { ...lease, file: exact };
    this.#dependencyLeases.set(exact, {
      handle,
      heartbeat: startEvalDependencyLeaseHeartbeat(handle),
    });
  }

  get ownedDirectories(): readonly string[] {
    return [...this.#owned.keys()];
  }

  /** @purpose Install the process signal boundary before provisioning creates its first sandbox. */
  installSignalHandlers(controller: AbortController): {
    received: () => 'SIGINT' | 'SIGTERM' | undefined;
    dispose: () => void;
  } {
    let received: 'SIGINT' | 'SIGTERM' | undefined;
    const handlers = new Map<'SIGINT' | 'SIGTERM', () => void>();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = (): void => {
        if (received) process.exit(signal === 'SIGINT' ? 130 : 143);
        received = signal;
        controller.abort(new Error(`flow-eval interrupted by ${signal}`));
      };
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    return {
      received: () => received,
      dispose: () => {
        for (const [signal, handler] of handlers) process.off(signal, handler);
      },
    };
  }

  async #partialArtifacts(
    reason: SddEvalLifecycleReason,
    completed: readonly SddEvalRunArtifact[]
  ): Promise<SddEvalRunArtifact[]> {
    const artifacts = [...completed];
    const completeDirectories = new Set(completed.map((entry) => resolve(entry.directory)));
    for (const [directory, scenarioId] of this.#owned) {
      if (completeDirectories.has(directory)) continue;
      const rootFiles = await directoryEntries(directory);
      const judge = rootFiles.find(
        (entry) => entry.isFile() && entry.name === `.sdd-eval-judge.${scenarioId}.md`
      );
      artifacts.push({
        scenarioId,
        verdict: reason === 'SIGINT' || reason === 'SIGTERM' ? 'interrupted' : 'worker-error',
        status: reason,
        specFiles: await collectSpecFiles(directory),
        ...(judge ? { judgeFile: join(directory, judge.name) } : {}),
        directory,
      });
    }
    return artifacts;
  }

  async #compact(
    reason: SddEvalLifecycleReason,
    completed: readonly SddEvalRunArtifact[]
  ): Promise<string> {
    if (this.#runDirectory) return this.#runDirectory;
    await pruneTransientRunArtifacts(this.#artifactsRoot);
    const entries = await this.#partialArtifacts(reason, completed);
    this.#runDirectory = await this.#persistArtifacts(this.#artifactsRoot, this.#runId, entries, {
      reason,
      completedAt: this.#now().toISOString(),
    });
    await pruneTransientRunArtifacts(this.#artifactsRoot, { protectRun: this.#runId });
    return this.#runDirectory;
  }

  async #markRetained(): Promise<number> {
    const now = this.#now();
    const retainedDirectories = [...this.#owned.keys()]
      .sort()
      .slice(0, SDD_EVAL_RETENTION_POLICY.debugSandbox.maxEntries);
    for (const directory of retainedDirectories) {
      const marker: RetainedSandboxMarker = {
        schema: 1,
        runId: this.#runId,
        retainedAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + SDD_EVAL_RETENTION_POLICY.debugSandbox.maxAgeMs
        ).toISOString(),
      };
      await writeFile(join(directory, RETAINED_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
      this.#owned.delete(directory);
    }
    await pruneRetainedSandboxes(this.#sandboxRoot, {
      nowMs: now.getTime(),
      protect: new Set(retainedDirectories),
    });
    return retainedDirectories.length;
  }

  async #cleanup(): Promise<{ removed: number; errors: string[] }> {
    let removed = 0;
    const errors: string[] = [];
    for (const directory of [...this.#owned.keys()]) {
      try {
        const entry = await lstat(directory).catch(() => undefined);
        if (entry?.isSymbolicLink()) throw new Error('owned sandbox path became a symlink');
        await this.#removeDirectory(directory);
        if (existsSync(directory)) throw new Error('directory still exists after cleanup');
        this.#owned.delete(directory);
        removed += 1;
      } catch (cause) {
        errors.push(`${directory}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    if (this.#owned.size === 0) {
      for (const [leaseFile, { handle, heartbeat }] of this.#dependencyLeases) {
        await heartbeat.stop();
        const heartbeatError = heartbeat.error();
        if (heartbeatError)
          errors.push(`${leaseFile}: heartbeat failed: ${heartbeatError.message}`);
        try {
          await releaseEvalDependencyLease(handle);
          this.#dependencyLeases.delete(leaseFile);
        } catch (cause) {
          errors.push(`${leaseFile}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
    }
    return { removed, errors };
  }

  /** @purpose Persist compact evidence, then cleanup or bounded-retain; concurrent calls coalesce. */
  finalize(
    reason: SddEvalLifecycleReason,
    completed: readonly SddEvalRunArtifact[] = []
  ): Promise<SddEvalFinalizationResult> {
    if (this.#activeFinalization) return this.#activeFinalization;
    this.#activeFinalization = (async () => {
      const errors: string[] = [];
      let runDirectory: string | undefined;
      try {
        runDirectory = await this.#compact(reason, completed);
      } catch (cause) {
        errors.push(`compact evidence: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (!runDirectory) {
        return {
          removed: 0,
          retained: 0,
          pending: [...this.#owned.keys()],
          errors,
        };
      }
      let removed = 0;
      let retained = 0;
      if (this.#keep) {
        try {
          retained = await this.#markRetained();
          const cleanup = await this.#cleanup();
          removed += cleanup.removed;
          errors.push(...cleanup.errors);
        } catch (cause) {
          errors.push(`retain sandbox: ${cause instanceof Error ? cause.message : String(cause)}`);
          const cleanup = await this.#cleanup();
          removed += cleanup.removed;
          errors.push(...cleanup.errors);
        }
      } else {
        const cleanup = await this.#cleanup();
        removed += cleanup.removed;
        errors.push(...cleanup.errors);
      }
      return {
        ...(runDirectory ? { runDirectory } : {}),
        removed,
        retained,
        pending: [...this.#owned.keys()],
        errors,
      };
    })().finally(() => {
      this.#activeFinalization = undefined;
    });
    return this.#activeFinalization;
  }
}

/**
 * @purpose Remove throwaway sandbox directories; force+recursive and never throws (best-effort teardown
 * must run in a finally, so a single bad path cannot mask the real result or crash the run).
 */
export async function teardownSandboxDirectories(
  directories: Iterable<string>
): Promise<{ removed: number }> {
  let removed = 0;
  for (const dir of directories) {
    try {
      await rm(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      // best-effort: a missing or already-removed dir is fine; leave others to the manual `clean`.
    }
  }
  return { removed };
}
