// @file: Two bounded counterexamples for structural review and project-owned CLI reads.
// @spec: AI-SKILLS
// @consumers: task-quality-live boundary mode; offline boundary controls

import { gradeTaskQualityReads } from './task-quality-probes.ts';

export type TaskQualityBoundaryId = 'structural-review' | 'cli-related-read';
export const TASK_QUALITY_BOUNDARY_PROBES = [
  {
    id: 'structural-review',
    files: {},
    brief: `Review the supplied synthetic ticket plan under the supplied actual-ticket policy. Return JSON only:
{"findings":[{"id":"COLLISION"|"ORDER","evidence":string[],"consequence":string,"fix":"serialize"|"add-dependency","testAction":"none"|"add","testReason":string}]}.
Approved outcomes and all runtime behavior tests are already covered, including applicable negative scenarios. No product behavior or diagnostic is changed by this plan correction. Evaluate these two scheduling defects; do not implement code or approve tickets.
COLLISION: independent tickets A (CSV export) and B (avatar resize) are marked parallel but both declare package.json in Target Files. Their source targets are otherwise disjoint. The package manifest cannot have concurrent writers.
ORDER: ticket C installs the required test harness through package.json. Ticket D invokes that harness in its first phase but declares no dependency on C, so D can run before the harness exists.
Identify concrete evidence, the user consequence, the minimal scheduling correction and whether any additional runtime test or diagnostic is needed to demonstrate this structural defect.`,
  },
  {
    id: 'cli-related-read',
    files: {
      'cli/main.ts':
        "import { windowEnd } from './helper.ts';\nexport function visibleCount(total: number) { return windowEnd(total) - 2; }\n",
      'cli/helper.ts': 'export function windowEnd(total: number) { return Math.min(total, 9); }\n',
      'unrelated/notes.txt': 'Not relevant to the phase question.\n',
    },
    brief: `Apply the supplied phase read policy and literal worker contract. This is orientation only, not implementation or Verify. Return JSON only:
{"answer":number|null,"status":"answered"|"needs-orchestrator","relatedReads":[{"path":string,"reason":string}]}.
The consumer project is a CLI application. Manifest READ files and write Target Files: cli/main.ts. That is this project's own source, not an installed dependency or the implementation of the Gennady tool. Determine visibleCount(12). Begin with the manifest file; follow the supplied policies for any missing context. No writes, shell commands, bundled-tool investigation or unrelated reads are permitted. Stop when answered.`,
  },
] as const;

export function isTaskQualityBoundaryId(id: string): id is TaskQualityBoundaryId {
  return id === 'structural-review' || id === 'cli-related-read';
}

/** @purpose Use actual policy bytes, including the formatter's literal prohibition, not a rewritten explanation. */
export function taskQualityBoundaryPolicy(
  id: TaskQualityBoundaryId,
  read: (path: string) => string
): { policy: string; policyPaths: string[] } {
  if (id === 'structural-review') {
    const path = 'ai/directives/sdd-v2/scaffold/steps/STEP_4_INDEPENDENT_TICKET_REVIEW.xml';
    return { policy: read(path), policyPaths: [path] };
  }
  const policyPaths = [
    'ai/kit/axiom/process/ax-read-per-manifest.xml',
    'cli/cmd/sdd-task/sdd-task.types.ts',
  ];
  const source = read(policyPaths[1]);
  const contract = source.match(/'  NEVER READ: ([^'\n]+)'/);
  if (!contract) throw new Error('[taskQualityBoundaryPolicy] Literal worker prohibition missing');
  return {
    policy: `${read(policyPaths[0])}\nWorker contract (literal tool output):\nNEVER READ: ${contract[1]}\n`,
    policyPaths,
  };
}

/** @purpose Check explicit answers; neither this checker nor a passing label proves general semantic quality. */
export function gradeTaskQualityBoundary(
  id: TaskQualityBoundaryId,
  answer: Record<string, unknown>
): string[] {
  if (id === 'cli-related-read') {
    const reads = Array.isArray(answer.relatedReads) ? answer.relatedReads : [];
    return [
      ...(answer.answer === 7 && answer.status === 'answered'
        ? []
        : ['project-cli-context-unresolved']),
      ...(reads.some(
        (r) => r?.path === 'cli/helper.ts' && typeof r.reason === 'string' && r.reason.trim()
      )
        ? []
        : ['helper-read-unexplained']),
    ];
  }
  const findings = Array.isArray(answer.findings) ? answer.findings : [];
  return ['COLLISION', 'ORDER'].flatMap((expected) => {
    const finding = findings.find((f) => f?.id === expected);
    if (!finding) return [`missing-structural-finding:${expected}`];
    const issues: string[] = [];
    if (finding.fix !== (expected === 'COLLISION' ? 'serialize' : 'add-dependency'))
      issues.push(`wrong-correction:${expected}`);
    if (finding.testAction !== 'none') issues.push(`unnecessary-runtime-test:${expected}`);
    if (
      !Array.isArray(finding.evidence) ||
      !finding.evidence.some((e: unknown) => typeof e === 'string' && e.includes('package.json'))
    )
      issues.push(`missing-structural-evidence:${expected}`);
    for (const field of ['consequence', 'testReason'])
      if (typeof finding[field] !== 'string' || finding[field].trim().length < 15)
        issues.push(`missing-${field}:${expected}`);
    return issues;
  });
}

/** @purpose Preserve the real native read path checks while changing only the synthetic project paths. */
export function gradeTaskQualityBoundaryReads(
  calls: readonly { tool: string; status: string; inputSummary?: string }[],
  complete: boolean
): string[] {
  return gradeTaskQualityReads(
    calls.map((call) => ({
      ...call,
      inputSummary: call.inputSummary
        ?.replaceAll('cli/main.ts', 'src/view.ts')
        .replaceAll('cli/helper.ts', 'src/window.ts'),
    })),
    complete
  );
}
