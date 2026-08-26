// @file: Single fan-out worker execution through the injected OpenCode production seam.
// @consumers: pipeline-runtime.ts
// @tasks: N/A

import { dirname } from 'node:path';
import type { TaskInstance } from '../../inbox-queue/task-registry.ts';
import type { OpenCodePort } from '../../inbox-opencode/opencode.port.ts';
import type { ModelResult } from '../synthesize.ts';
import type { PipelineWorkerSession } from './pipeline-runtime.types.ts';
import { normalizeTaskSuffix, appendToolTrace } from './artifact-io.ts';
import { parseFindings, parseDiagrams } from './worker-output-parser.ts';
import { renderWorkerReport } from './report-renderer.ts';
import { rememberWorkerSession } from './coverage-gate-runner.ts';

/** @purpose Shared worker-execution state: per-MR retained worker sessions and the AI seam. */
export type WorkerExecutorDeps = {
  /** @purpose Production AI seam used by fan-out workers; absent only for deterministic/unit runtimes. */
  opencode: OpenCodePort | undefined;
  /** @purpose Per-MR live worker sessions; coverage must continue one of these, never replace it. */
  sessions: Map<string, PipelineWorkerSession[]>;
};

/**
 * @purpose Execute a concrete fan-out node through the injected OpenCode production seam.
 * @invariant Production never fabricates an empty model result: a missing/invalid model turn
 * fails its queue task, while deterministic tests may supply explicit modelResults.
 * @param task Materialized track or lens queue instance.
 * @param reportDir Durable report directory used as the worker session root.
 * @param files Changed files assigned to this worker.
 * @param deps Injected AI seam and worker-session map.
 * @returns Validated model result with factual session identity.
 */
export async function runWorker(
  task: TaskInstance,
  reportDir: string,
  files: string[],
  deps: WorkerExecutorDeps
): Promise<ModelResult> {
  const seeded = Array.isArray(task.params.modelResults)
    ? (task.params.modelResults as ModelResult[]).find(
        (result) => normalizeTaskSuffix(result.track) === task.type.replace(/^(track_|lens_)/, '')
      )
    : undefined;
  if (!deps.opencode) {
    if (seeded) return seeded;
    throw new Error(`[PipelineRuntime#_runWorker] Missing OpenCode worker for ${task.type}`);
  }

  const title = `pipeline_${task.type}`;
  // Session root = MR root (parent of reportDir): the checked-out repo lives in ./worktree
  // and prior-step artifacts in ./report — rooting at reportDir alone left the sources
  // outside the session's allowed paths and workers narrated "no access" prose (NO_RESULT).
  const session = await deps.opencode.createSession({
    title,
    directory: dirname(reportDir),
    tools: { read: true, grep: true },
  });
  try {
    const result = await deps.opencode.prompt(session.sid, {
      system:
        'Review the assigned MR scope. Return ONLY one ```json fenced code block matching the schema — no prose before or after. The report field must contain the complete human-readable Markdown result of this worker session: scope, reasoning summary, findings with evidence, and conclusion. When the scope provides evidence for them, diagrams must carry operator-facing change-map, C4, behaviour/data-flow, or use-case views of the MR itself — never a map of agent tracks. When no issue is found, explain what was checked and why the scope is clear.',
      text: `Worker ${task.type}; MR ${String(task.params.mr)}; files: ${files.join(', ') || '(no changed files)'} — read sources under ./worktree/ (repo checkout), prior-step artifacts under ./report/`,
      format: {
        type: 'json_schema',
        schema: {
          title,
          type: 'object',
          required: ['findings', 'report'],
          properties: {
            findings: {
              type: 'array',
              items: {
                type: 'object',
                required: ['file', 'line', 'summary', 'severity'],
                properties: {
                  file: { type: 'string' },
                  line: { type: 'number' },
                  summary: { type: 'string' },
                  severity: { enum: ['error', 'warning', 'info'] },
                  diff: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['type', 'text'],
                      properties: {
                        type: { enum: ['context', 'add', 'remove'] },
                        num: { type: 'number' },
                        text: { type: 'string' },
                      },
                    },
                  },
                  factcheck: { enum: ['verified', 'pending', 'debunked'] },
                },
              },
            },
            report: { type: 'string' },
            diagrams: {
              type: 'array',
              items: {
                type: 'object',
                required: ['kind', 'title', 'caption', 'nodes', 'edges'],
                properties: {
                  kind: { enum: ['change-map', 'c4', 'behaviour', 'use-cases'] },
                  title: { type: 'string' },
                  caption: { type: 'string' },
                  nodes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['id', 'label'],
                      properties: {
                        id: { type: 'string' },
                        label: { type: 'string' },
                        detail: { type: 'string' },
                        tone: { type: 'string' },
                      },
                    },
                  },
                  edges: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['from', 'to'],
                      properties: {
                        from: { type: 'string' },
                        to: { type: 'string' },
                        label: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!result.ok)
      throw new Error(
        `[PipelineRuntime#_runWorker] ${result.error.class}: ${result.error.signal ?? ''}`
      );
    const findings = parseFindings(result.output.findings, task.type);
    const diagrams = parseDiagrams(result.output.diagrams, task.type);
    const sessionReport =
      typeof result.output.report === 'string' ? result.output.report.trim() : '';
    const report = sessionReport || renderWorkerReport(task.type, files, findings);
    const calls = await deps.opencode.toolCalls(session.sid);
    await appendToolTrace(reportDir, calls);
    rememberWorkerSession(
      String(task.params.mr),
      { sid: session.sid, taskType: task.type },
      deps.sessions
    );
    return {
      track: task.type,
      model: `opencode-${task.type}`,
      runId: session.sid,
      findings,
      report,
      diagrams,
    };
  } catch (cause) {
    await deps.opencode.close(session.sid);
    throw cause;
  }
}
