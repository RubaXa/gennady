// @file: eval-fixture.ts — recorded-shape fallback data for reviewer-eval.spec.ts's fast/CI path.
//   Mirrors mock-data.ts's pattern (board/detail/artifact fixtures) for a distinct MR, plus an
//   `eval-report.md` artifact entry rendered through the exact production `serializeEvalReportMarkdown`
//   (eval-report.ts, TSK-118) so the fixture's gate table never drifts from the real report format.
// @consumers: e2e/inbox-serve/reviewer-eval.spec.ts
// @tasks: TSK-120

import type {
  BoardData,
  MrCard,
  MrDetail,
  ArtifactRef,
  ArtifactContent,
} from '../../../services/agent-inbox/modules/inbox-api/types.ts';
import type { AuditEntry } from '../../../services/agent-inbox/modules/inbox-core/audit-log.ts';
import {
  composeEvalReport,
  serializeEvalReportMarkdown,
} from '../../../services/agent-inbox/modules/inbox-eval/eval-report.ts';
import type { GateResult } from '../../../services/agent-inbox/modules/inbox-eval/gates.ts';

/** @purpose Fixture MR web URL — same project/iid shape as the real default eval MR (spec §5), on the offline `gitlab.example.com` host used by every other e2e fixture. */
export const EVAL_FIXTURE_MR_URL =
  'https://gitlab.example.com/vk-workspace/superapp/-/merge_requests/571';

/**
 * @purpose Board data with the eval fixture MR sitting in the reviewer role's inbox lane.
 * @returns BoardData fixture.
 */
export function evalFixtureBoardData(): BoardData {
  const mr: MrCard = {
    project: 'vk-workspace/superapp',
    iid: 571,
    webUrl: EVAL_FIXTURE_MR_URL,
    title: 'feat: reviewer-eval fixture MR',
    description: '',
    author: 'j.doe',
    reviewers: ['k.lebedev'],
    approvedBy: [],
    updatedAt: new Date().toISOString(),
    draft: false,
    state: 'opened',
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
    stage: 'review_needed',
    sourceBranch: 'feature/eval-fixture',
    targetBranch: 'main',
  } as MrCard;

  return {
    roles: [
      {
        name: 'reviewer',
        active: true,
        lanes: { inbox: [mr], inProgress: [], awaitingMe: [], done: [] },
      },
    ],
    unassigned: [],
  };
}

/**
 * @purpose MR detail for the eval fixture MR — candidates (findings, per D-86 rename) the
 *   04-actionpanel screenshot exercises.
 * @returns MrDetail fixture.
 */
export function evalFixtureMrDetail(): MrDetail {
  const now = new Date().toISOString();
  const audit: AuditEntry[] = [
    {
      ts: now,
      mr: 'vk-workspace/superapp!571',
      role: 'system',
      event: 'seeded',
      detail: 'eval fixture seeded',
    },
    {
      ts: now,
      mr: 'vk-workspace/superapp!571',
      role: 'reviewer',
      event: 'assigned',
      detail: 'Assigned to role reviewer',
    },
  ];

  return {
    mr: evalFixtureBoardData().roles[0]!.lanes.inbox[0]!,
    findings: [
      {
        severity: 'warning',
        file: 'src/auth/session.ts',
        line: 88,
        message: 'Session token logged in plaintext',
      },
      {
        severity: 'info',
        file: 'src/auth/session.ts',
        line: 120,
        message: 'Consider extracting refresh-token helper',
      },
    ],
    verdict: 'commented',
    audit,
  };
}

/**
 * @purpose Artifact list for the eval fixture MR — PLAN.md, REPORT.md (real mermaid), one fan-out
 *   track, and eval-report.md (the eval harness's own machine/human report as one more artifact).
 * @returns ArtifactRef[] fixture.
 */
export function evalFixtureArtifactRefs(): ArtifactRef[] {
  return [
    { name: 'REPORT.md', path: 'REPORT.md', kind: 'md' },
    { name: 'PLAN.md', path: 'PLAN.md', kind: 'md' },
    { name: 'auth.md', path: 'tracks/auth.md', kind: 'md' },
    { name: 'eval-report.md', path: 'eval-report.md', kind: 'md' },
  ];
}

/**
 * @purpose Build the eval-report.md fixture content via the real `composeEvalReport` +
 *   `serializeEvalReportMarkdown` (eval-report.ts) so the fixture's status/gate-table format is
 *   never hand-maintained separately from production output.
 * @returns Markdown document — status PASS, S0..S11 all done, G1..G10 all passing.
 */
function buildEvalReportMarkdown(): string {
  const gates: GateResult[] = (
    ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'] as const
  ).map((gate) => ({ gate, pass: true, evidence: 'fixture: recorded pass' }));

  const stages = (
    ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11'] as const
  ).map((stage) => ({ stage, done: true, detail: 'fixture: recorded pass' }));

  const report = composeEvalReport({
    mr: EVAL_FIXTURE_MR_URL,
    startedAt: '2026-07-14T10:00:00.000Z',
    finishedAt: '2026-07-14T10:05:00.000Z',
    stages,
    gates,
  });

  return serializeEvalReportMarkdown(report);
}

/**
 * @purpose Artifact content for each path in {@link evalFixtureArtifactRefs}.
 * @invariant REPORT.md includes a multi-node/edge fenced `mermaid` block — exercises the same real
 *   drawn-diagram path `wait-render.ts` asserts against, just with recorded (not live) content.
 * @returns Record of artifact path → content fixture.
 */
export function evalFixtureArtifactContents(): Record<string, ArtifactContent> {
  return {
    'REPORT.md': {
      kind: 'md',
      content:
        '# Report\n\nSummary of findings for vk-workspace/superapp!571.\n\n' +
        '- src/auth/session.ts:88 — Session token logged in plaintext\n' +
        '- src/auth/session.ts:120 — Consider extracting refresh-token helper\n\n' +
        '```mermaid\ngraph TD;\n  Context-->Scaffold;\n  Scaffold-->Enrich;\n  Enrich-->FanOut;\n  FanOut-->Synthesize;\n  Synthesize-->Report;\n```\n',
    },
    'PLAN.md': {
      kind: 'md',
      content:
        '# Plan\n\n## Дорожки\n\n1. auth — track/auth.md\n\n## Шаги\n\n1. context\n2. scaffold\n3. fan-out\n4. synthesize\n',
    },
    'tracks/auth.md': {
      kind: 'md',
      content:
        '# Track: auth\n\nНаходки:\n- src/auth/session.ts:88 — Session token logged in plaintext\n\nВердикт: commented\n',
    },
    'eval-report.md': {
      kind: 'md',
      content: buildEvalReportMarkdown(),
    },
  };
}
