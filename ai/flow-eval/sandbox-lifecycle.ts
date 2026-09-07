// @file: Extract the important artifacts out of eval sandboxes, then tear the sandboxes down.
// @consumers: ai/flow-eval/cli.ts (run lifecycle); ai/flow-eval/__tests__/sandbox-lifecycle.test.ts
// A sandbox is a throwaway ~500MB copy (dist + node_modules) per scenario. Nothing durable may live
// only inside it: this module copies the specs/judge/summary a run produces into a persistent
// artifacts root, and then removes the sandbox directories so they can never accumulate on disk.

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

/** @purpose One scenario's durable outcome — everything worth keeping after its sandbox is gone. */
export type SddEvalRunArtifact = {
  scenarioId: string;
  verdict: string;
  status: string;
  usage?: unknown;
  quality?: { rule: string; pass: boolean; detail: string };
  /** Absolute paths (inside the sandbox) of spec files the worker produced. */
  specFiles: string[];
  /** Absolute path (inside the sandbox) of the judge rationale file, when written. */
  judgeFile?: string;
  /** Absolute sandbox directory this outcome came from. */
  directory: string;
};

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
  entries: SddEvalRunArtifact[]
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
      usage: entry.usage,
      quality: entry.quality,
      specFiles: savedSpecs,
      hasJudge: Boolean(entry.judgeFile),
    });
  }
  await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return runDir;
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
