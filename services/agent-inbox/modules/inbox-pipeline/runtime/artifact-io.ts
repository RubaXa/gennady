// @file: Durable artifact I/O owned by PipelineRuntime — atomic JSON/byte writes, report path
//   normalization, tool-trace persistence, and worker-result recovery under one MR report root.
// @consumers: PipelineRuntime
// @tasks: TSK-157

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalMrRef } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { ToolTrace } from '../coverage-gate.ts';
import type { ToolCall } from '../../inbox-opencode/opencode.port.ts';
import type { ModelResult } from '../synthesize.ts';

/**
 * @purpose Persist one JSON artifact with a temp sibling so readers never observe partial JSON.
 * @param dir Existing artifact directory.
 * @param name Artifact file name relative to `dir`.
 * @param document JSON-compatible artifact document.
 * @returns Promise resolving after the atomic replacement completes.
 * @sideEffect Filesystem: writes one `${dir}/${name}` artifact via temp-write-then-rename.
 */
export async function writeArtifact(
  dir: string,
  name: string,
  document: Record<string, unknown>
): Promise<void> {
  const target = join(dir, name);
  const temp = `${target}.tmp`;
  await writeFile(temp, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(temp, target);
}

/**
 * @purpose Materialize exact immutable source bytes for a callback-observed read operation.
 * @param reportDir Review report root owning the control-plane source namespace.
 * @param target Relative canonical operation target.
 * @param content Exact captured source bytes.
 * @returns Promise resolved after the source is atomically replaced.
 * @sideEffect Filesystem: writes one profile-scoped immutable source projection.
 */
export async function writeArtifactBytes(
  reportDir: string,
  target: string,
  content: string
): Promise<void> {
  const path = join(reportDir, target);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}

/**
 * @purpose Normalize an API web URL to the report path's canonical `project!iid` identity.
 * @param mr Queue MR reference or GitLab web URL.
 * @returns Canonical report path identity.
 */
export function reportRef(mr: string): string {
  return canonicalMrRef(mr);
}

/**
 * @purpose Convert plan/lens identifiers to concrete queue task type suffixes.
 * @param value Plan or lens identifier.
 * @returns Queue-safe suffix.
 */
export function normalizeTaskSuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * @purpose Persist factual read telemetry from each worker for the later coverage gate.
 * @param reportDir Durable report root for this MR.
 * @param calls Factual tool calls returned by OpenCodePort.
 * @returns Promise resolving once telemetry is atomically persisted.
 * @sideEffect Filesystem: rewrites `${reportDir}/tool-trace.json` with the appended entries.
 */
export async function appendToolTrace(reportDir: string, calls: ToolCall[]): Promise<void> {
  const target = join(reportDir, 'tool-trace.json');
  const existing = await readFile(target, 'utf8')
    .then((raw) => {
      const document = JSON.parse(raw) as { entries?: ToolTrace[] };
      return Array.isArray(document.entries) ? document.entries : [];
    })
    .catch(() => [] as ToolTrace[]);
  const appended = [...existing, ...calls.map((call) => ({ tool: call.tool, file: call.path }))];
  await writeArtifact(reportDir, 'tool-trace.json', { entries: appended });
}

/**
 * @purpose Read persisted live tool telemetry without treating corrupt recovery data as coverage proof.
 * @param reportDir Durable report root for this MR.
 * @returns Valid factual tool trace entries, or an empty list when no valid artifact exists.
 */
export async function readToolTrace(reportDir: string): Promise<ToolTrace[]> {
  return readFile(join(reportDir, 'tool-trace.json'), 'utf8')
    .then((raw) => {
      const document = JSON.parse(raw) as { entries?: ToolTrace[] };
      return Array.isArray(document.entries) ? document.entries : [];
    })
    .catch(() => [] as ToolTrace[]);
}

/**
 * @purpose Read all named worker results so synthesis consumes durable live outputs after restart.
 * @param tasksDir Directory containing per-worker durable artifacts.
 * @returns Valid named model results.
 */
export async function readWorkerResults(tasksDir: string): Promise<ModelResult[]> {
  const names = await readdir(tasksDir).catch(() => [] as string[]);
  const results: ModelResult[] = [];
  for (const name of names.filter((entry) =>
    /^((track|lens)_.+)\.opencode-[^.]+\.result\.json$/.test(entry)
  )) {
    const candidate = JSON.parse(await readFile(join(tasksDir, name), 'utf8')) as ModelResult;
    if (candidate && Array.isArray(candidate.findings) && typeof candidate.track === 'string')
      results.push(candidate);
  }
  return results;
}
