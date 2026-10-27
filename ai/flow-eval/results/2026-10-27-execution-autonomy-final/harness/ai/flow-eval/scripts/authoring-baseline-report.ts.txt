// @file: Replay archived authoring baseline inputs without OpenCode, temporary fixtures or model calls.
// @spec: AI-SKILLS
// @consumers: operator baseline audit; recorded trajectory tests

import { readFile, writeFile, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  summarizeAuthoringBaseline,
  type AuthoringBaselineRecord,
} from '../authoring-baseline-report.ts';
import type { SddEvalScenario } from '../types.ts';

export type AuthoringBaselineInput = {
  identity: { sourceCommit: string; model: string };
  plan: SddEvalScenario[];
  records: AuthoringBaselineRecord[];
};

/** @purpose Produce a per-case table and every saved tool attempt, not just a flattering summary. */
export function renderAuthoringBaselineReport(
  report: ReturnType<typeof summarizeAuthoringBaseline>
): string {
  const cell = (value: unknown) =>
    String(value ?? 'unknown').replace(/[\u0000-\u001f\u007f|`]/g, ' ');
  const lines = [
    '# Authoring trajectory baseline',
    '',
    `Source: ${report.sourceCommit}; model: ${report.model}. Recorded ${report.recorded}/${report.planned}.`,
    '',
    'Baseline only — no prompt, speed or quality improvement is claimed.',
    '',
    '| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...report.cases.map(
      (row) =>
        `| ${row.caseId} | ${row.recorded}/${row.planned} | ${row.artifactPass} | ${row.semanticPass} | ${row.jointQualityPass} | ${row.pathPass} | ${cell(row.tools.median)} | ${cell(row.readAttempts.median)} | ${cell(row.writeAttempts.median)} | ${cell(row.bashAttempts.median)} | ${cell(row.repeatedReadAttempts.median)} | ${cell(row.workerNonCacheTokens.median)} (${row.workerNonCacheTokens.samples}/${row.planned}) | ${cell(row.workerMessages.median)} | ${row.workerMs.median === null ? 'unknown' : (row.workerMs.median / 1000).toFixed(1)} |`
    ),
    '',
    '*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.',
    '',
    ...report.limitations.map((line) => `- ${line}`),
    '',
  ];
  for (const run of report.runs) {
    lines.push(`## ${run.scenarioId}`, '');
    if (run.missing) {
      lines.push('MISSING — not silently excluded.', '');
      continue;
    }
    lines.push(
      `Artifact=${cell(run.artifactPass)}; semantic=${cell(run.semanticVerdict)}; path=${cell(run.pathPass)}; status=${cell(run.status)}.`,
      '',
      `Failed artifact checks: ${run.failedArtifactChecks.join(', ') || 'none'}. Path detail: ${cell(run.pathDetail)}.`,
      '',
      `Binding/capture/cleanup issues: ${run.issues.join(', ') || 'none'}. SDK REST measurement requests (including polling): ${cell(run.sdkRequests)}.`,
      '',
      'Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.',
      '',
      '| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |',
      '|---:|---|---|---|---|---|---:|---|',
      ...run.profile.calls.map(
        (call) =>
          `| ${call.order} | ${cell(call.tool)} | ${observableRole(call)} | ${call.category} | ${cell(call.path ?? call.command ?? (call.commandWithheld ? '[shell payload withheld]' : undefined))} | ${cell(call.status)} | ${cell(call.exitCode)} | ${call.issues.join(', ')} |`
      ),
      '',
      `Read attempts: ${run.profile.readTargets.map((group) => `${cell(group.path)} ×${group.orders.length}`).join('; ') || 'none'}.`,
      '',
      `Temporal batching candidates: ${run.profile.possibleBatchingCandidates.map((group) => group.orders.join('+')).join(', ') || 'none proven eligible'}. These are hypotheses, not guaranteed savings.`,
      '',
      `Reflection: ${cell(run.reflectionStatus)}; actual self-report is archived separately and is not a causal verdict.`,
      ''
    );
  }
  return lines.join('\n');
}

function observableRole(call: { tool: string; path?: string; category: string }) {
  if (call.tool === 'write') return 'Whole-file write attempt';
  if (call.tool === 'edit') return 'Partial edit attempt';
  if (call.tool === 'read') {
    if (call.path === 'inputs/brief.md') return 'Load declared task facts';
    if (call.category === 'directive') return 'Load workflow/instruction source';
    if (call.category === 'format') return 'Load format/contract source';
    if (call.category === 'target') return 'Read current target (skeleton or result)';
    return 'Read reference context; necessity not proven';
  }
  if (call.category === 'create') return 'Invoke canonical creation';
  if (call.category === 'check') return 'Invoke validation; exit remains separate';
  if (call.category === 'manifest') return 'Request section manifest';
  if (call.category === 'discovery') return 'Inspect available paths/state';
  return 'Unclassified; see safe command/raw trace';
}

async function main(args: string[]) {
  if (
    args.length < 2 ||
    args[0] !== '--input' ||
    (args.length !== 2 && (args.length !== 4 || args[2] !== '--out'))
  )
    throw new Error(
      'usage: authoring-baseline-report.ts --input ARCHIVED_INPUT.json [--out REPORT.json]'
    );
  const inputPath = args[1]!;
  const stat = await lstat(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
    throw new Error('bounded regular baseline input required');
  const input = JSON.parse(await readFile(inputPath, 'utf8')) as AuthoringBaselineInput;
  const report = summarizeAuthoringBaseline(input.plan, input.records, input.identity);
  if (args[3]) await writeFile(args[3], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  else console.log(renderAuthoringBaselineReport(report));
  if (!report.complete) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(() => {
    console.error(
      'Baseline replay failed: invalid/incomplete archived input; no success inferred.'
    );
    process.exitCode = 2;
  });
