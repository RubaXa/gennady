// @file: Bounded task-quality probe corpus and deterministic output checks, not a full-flow oracle.
// @spec: AI-SKILLS
// @consumers: task-quality-live; task-quality-probes.test

export type TaskQualityProbeId = 'decomposition' | 'scenario-review' | 'related-read';

/** @purpose Frozen synthetic inputs shared verbatim between baseline and candidate. */
export const TASK_QUALITY_PROBES = [
  {
    id: 'decomposition',
    policy: 'ai/directives/sdd-v2/scaffold/steps/STEP_1_DERIVE.xml',
    brief: `Apply the supplied decomposition policy. This is a bounded reasoning probe, not actual ticket authoring. Return JSON only:
{"cohesiveTasks": number, "independentTasks": number, "rationale": string, "parallelSafe": boolean}.
Case A: one module supplies parsing, validation and persistence of a single import operation. All three co-edit src/import.ts and the same storage contract. The ordering of the internal steps is not yet established. It fits one phase worker context. Choose the number of tickets, not the number of phases.
Case B: two separate approved module specs, CSV export and avatar resizing, have disjoint targets and contracts, no dependency or shared writer, and each has independently verifiable acceptance. Both fit a worker context. Choose the total number of tickets for these two modules and whether parallel execution is safe. Explain the evidence for both choices; do not invent requirements.`,
    files: {},
  },
  {
    id: 'scenario-review',
    policy: 'ai/directives/sdd-v2/scaffold/steps/STEP_4_INDEPENDENT_TICKET_REVIEW.xml',
    brief: `Apply the supplied actual-ticket review policy to this bounded synthetic plan; no actual artifact approval is requested. Return JSON only:
{"findings":[{"requirement":string,"risk":string,"testLevel":"unit"|"integration"|"e2e","evidence":string}],"reuse":string,"metrics":string[],"timingBudget":number|null,"styleBlocking":boolean}.
Role: a support operator must reach a chosen email quickly and reliably in a long list.
Approved MAIL requirements:
MAIL-REQ-1: visibleRange(count, offset, viewport) clamps indexes and never includes items beyond the list, including empty lists and offset at the end.
MAIL-REQ-2: when rapid or scrollbar navigation issues multiple requests, a late old response must not replace the latest requested window.
MAIL-REQ-3: cancelled requests must not show an error banner or replace the current list.
MAIL-REQ-4: a failed load preserves visible messages and offers retry.
MAIL-REQ-5: a 100000-message list mounts only the window and documented overscan, and repeated navigation must not accumulate requests. No elapsed-time SLA is specified.
MAIL-REQ-6: dragging the real browser scrollbar reaches and displays the chosen viewport correctly.
Proposed ticket implements everything above but tests only one successful initial load through a heavy browser suite. It adds a second browser harness and new logger even though project helpers already provide unit tests, a controlled request adapter, browser fixtures, request correlation and render counters. A reviewer also suggests blocking because a local variable name is short.
Existing testing rules: assert observable behavior; use controlled collaborators for unit/component tests; real browser behavior requires actual browser evidence. Existing logging: function/method identity, state transitions, error context, and timing of meaningful operations, not every trivial function.
Review the omissions and test allocation, reuse and diagnostic/performance evidence. Do not implement anything.`,
    files: {},
  },
  {
    id: 'related-read',
    policy: 'ai/kit/axiom/process/ax-read-per-manifest.xml',
    brief: `Apply the supplied read-manifest policy. This is only the orientation step, not implementation, Verify or completion. Return JSON only:
{"answer":number|null,"status":"answered"|"needs-orchestrator","relatedReads":[{"path":string,"reason":string}]}.
Manifest: READ files: src/view.ts. Target Files for writing: src/view.ts. Start there and determine what visibleCount(12) returns. No writes are requested or permitted. The helper implementation was not supplied. Follow the policy for any missing context. Never inspect unrelated files, bundled tools or secrets. Stop when the question is answered.`,
    files: {
      'src/view.ts':
        "import { windowEnd } from './window.ts';\nexport function visibleCount(total: number) { return windowEnd(total) - 2; }\n",
      'src/window.ts': 'export function windowEnd(total: number) { return Math.min(total, 9); }\n',
      'unrelated/notes.txt': 'This unrelated file is not needed to answer the question.\n',
    },
  },
] as const;

/** @purpose Parse one public JSON response without accepting prose that merely mentions an answer. */
export function parseTaskQualityAnswer(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*\n/, '')
      .replace(/\n```$/, '')
  );
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[parseTaskQualityAnswer] Expected one JSON object');
  }
  return value as Record<string, unknown>;
}

/** @purpose Check declared semantic facets; live read/immutability evidence is checked separately. */
export function gradeTaskQualityAnswer(
  id: TaskQualityProbeId,
  answer: Record<string, unknown>
): string[] {
  const issues: string[] = [];
  if (id === 'decomposition') {
    if (answer.cohesiveTasks !== 1) issues.push('uncertain-shared-work-fragmented');
    if (answer.independentTasks !== 2 || answer.parallelSafe !== true)
      issues.push('independent-modules-lost');
    if (typeof answer.rationale !== 'string' || answer.rationale.trim().length < 30)
      issues.push('missing-split-evidence');
  } else if (id === 'scenario-review') {
    const findings = Array.isArray(answer.findings) ? answer.findings : [];
    for (const [requirement, levels] of [
      ['MAIL-REQ-1', ['unit']],
      ['MAIL-REQ-2', ['unit', 'integration']],
      ['MAIL-REQ-3', ['unit', 'integration']],
      ['MAIL-REQ-4', ['unit', 'integration']],
      ['MAIL-REQ-6', ['e2e']],
    ]) {
      if (
        !findings.some(
          (f) =>
            f &&
            typeof f.requirement === 'string' &&
            new RegExp(`^${requirement}\\b`).test(f.requirement) &&
            levels.includes(f.testLevel) &&
            typeof f.risk === 'string' &&
            f.risk.trim() &&
            typeof f.evidence === 'string' &&
            f.evidence.trim()
        )
      ) {
        issues.push(`missing-risk-evidence:${requirement}`);
      }
    }
    if (
      !findings.some(
        (f) => typeof f?.requirement === 'string' && /^MAIL-REQ-5\b/.test(f.requirement)
      )
    )
      issues.push('missing-performance-risk');
    if (typeof answer.reuse !== 'string' || answer.reuse.trim().length < 20)
      issues.push('missing-infrastructure-reuse');
    if (
      !Array.isArray(answer.metrics) ||
      answer.metrics.length < 2 ||
      !answer.metrics.every((metric) => typeof metric === 'string' && metric.trim())
    )
      issues.push('missing-diagnostic-metrics');
    if (answer.timingBudget !== null) issues.push('invented-time-budget');
    if (answer.styleBlocking !== false) issues.push('style-displaced-user-risk');
  } else {
    if (answer.answer !== 7 || answer.status !== 'answered') issues.push('context-gap-unresolved');
    if (
      !Array.isArray(answer.relatedReads) ||
      !answer.relatedReads.some(
        (read) =>
          read?.path === 'src/window.ts' && typeof read.reason === 'string' && read.reason.trim()
      )
    ) {
      issues.push('related-read-not-explained');
    }
  }
  return issues;
}

/** @purpose Require real bounded native reads; authored relatedReads prose is not execution evidence. */
export function gradeTaskQualityReads(
  calls: readonly { tool: string; status: string; inputSummary?: string }[],
  complete: boolean
): string[] {
  const issues: string[] = [];
  if (!complete) issues.push('incomplete-read-trajectory');
  const reads = calls.filter((call) => call.tool === 'read' && call.status === 'completed');
  const paths = reads.map((call) => {
    try {
      const input = JSON.parse(call.inputSummary ?? '{}') as { filePath?: unknown; path?: unknown };
      const path = input.filePath ?? input.path;
      return typeof path === 'string' ? path.replace(/^\.\//, '') : '';
    } catch {
      return '';
    }
  });
  const view = paths.indexOf('src/view.ts');
  const helper = paths.indexOf('src/window.ts');
  if (view < 0 || helper <= view) issues.push('required-target-to-helper-path-missing');
  if (calls.some((call) => call.tool !== 'read')) issues.push('unexpected-tool');
  if (paths.some((path) => path !== 'src/view.ts' && path !== 'src/window.ts')) {
    issues.push('unrelated-read');
  }
  return issues;
}
