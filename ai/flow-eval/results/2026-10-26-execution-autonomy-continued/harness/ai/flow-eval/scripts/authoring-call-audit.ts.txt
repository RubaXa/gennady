// @file: Reproducible per-call ledger over the frozen baseline, without replaying commands or model calls.
// @spec: AI-SKILLS
// @consumers: authoring trajectory research report; offline freshness tests

import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { auditAuthoringCalls } from '../authoring-call-audit.ts';
import { getAuthoringCase } from '../authoring-benchmark.ts';
import type { AuthoringBaselineInput } from './authoring-baseline-report.ts';
import type { ToolEvent } from '../trajectory.ts';
import { summarizeAuthoringBaseline } from '../authoring-baseline-report.ts';

export function renderAuthoringCallAudit(input: AuthoringBaselineInput, sourceSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256) || !input.records.length || input.records.length > 100)
    throw new Error('[renderAuthoringCallAudit] Bounded nonempty authenticated input required');
  if (!summarizeAuthoringBaseline(input.plan, input.records, input.identity).complete)
    throw new Error('[renderAuthoringCallAudit] Incomplete or unbound baseline');
  const rows = input.records.map((record) => {
    const run = record.summary.authoringBenchmark!;
    const fixture = getAuthoringCase(run.caseId as Parameters<typeof getAuthoringCase>[0]);
    const sessionId = record.trajectory.events.find((event) => event.type === 'tool')?.sessionId;
    const directory = record.cleanup.sessions.find(
      (session) => session.id === sessionId
    )?.directory;
    if (!directory) throw new Error('[renderAuthoringCallAudit] Missing bound directory');
    const owner = /Read owner instructions: (\S+\.xml)\./.exec(fixture.brief)?.[1];
    return {
      id: record.summary.scenarioId,
      caseId: run.caseId,
      repetition: run.repetition,
      workerMs: run.durationMs,
      assistantMessages: record.summary.usage?.messages,
      audit: auditAuthoringCalls(record.trajectory, {
        caseId: run.caseId,
        target: fixture.target,
        directory,
        requiredContextPaths: ['inputs/brief.md', ...(owner ? [owner] : [])],
      }),
    };
  });
  const calls = rows.flatMap((row) => row.audit.calls);
  const pairs = rows.flatMap((row) => row.audit.batching);
  const count = (key: string) => calls.filter((call) => call.resultEvidence === key).length;
  let intervalUnionMs = 0;
  for (const row of rows) {
    let end = -Infinity;
    const record = input.records.find((record) => record.summary.scenarioId === row.id)!;
    const events = row.audit.calls
      .filter((call) => call.elapsedMs !== null)
      .map((call) => record.trajectory.events[call.order] as ToolEvent)
      .sort((left, right) => left.startedAt! - right.startedAt!);
    for (const event of events) {
      intervalUnionMs += Math.max(0, event.finishedAt! - Math.max(event.startedAt!, end));
      end = Math.max(end, event.finishedAt!);
    }
  }
  const total = (values: Array<number | undefined>) =>
    values.every((value) => typeof value === 'number' && Number.isFinite(value))
      ? values.reduce<number>((sum, value) => sum + value!, 0)
      : 'unknown';
  const cell = (value: unknown) =>
    String(value ?? 'unknown')
      .replace(/[\u0000-\u001f\u007f`]/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\|/g, '&#124;');
  const lines = [
    '# Authoring call audit',
    '',
    `Frozen source ${input.identity.sourceCommit}; input SHA-256 ${sourceSha256}.`,
    '',
    `Runs=${rows.length}; calls=${calls.length}; complete-timed=${calls.filter((call) => call.elapsedMs !== null).length}.`,
    `Result fingerprints=${count('public-output-fingerprint')}; failure diagnostics=${count('failure-diagnostic')}; terminal facts only=${count('terminal-facts-only')}.`,
    `Adjacent read pairs=${pairs.length}; already same message=${pairs.filter((pair) => pair.alreadySameMessage).length}; across messages=${pairs.filter((pair) => !pair.alreadySameMessage).length}. Overlapping candidates, not additive savings.`,
    '',
    `Worker wall sum ms=${total(rows.map((row) => row.workerMs))}; observed assistant messages=${total(rows.map((row) => row.assistantMessages))}; union of per-run tool intervals ms=${intervalUnionMs}.`,
    'Tool timestamps do not allocate remaining time to inference, queueing, network, capture or other overhead.',
    '',
    'No necessity/causality score is inferred. Read “contract-related” as justified operation class, not proof that every read or retry was needed.',
    'Returned content, hidden motives and shell subcommand outcomes are not reconstructed. Reflection remains separately archived self-report, not an explanation certified by this table.',
    '',
  ];
  for (const row of rows) {
    lines.push(
      `## ${row.caseId} repetition ${row.repetition}`,
      '',
      `Scenario: ${row.id}. Capture complete=${row.audit.complete}; omitted=${row.audit.omitted}.`,
      '',
      '| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |',
      '|---|---|---|---|---|---:|---|',
      ...row.audit.calls.map(
        (call) =>
          `| ${call.order} ${cell(call.callId)} | ${call.tool} | ${cell(call.purpose)} | ${call.assessment} | ${call.status}; exit=${cell(call.exitCode)}; ${call.resultEvidence} | ${cell(call.elapsedMs)} | ${cell(call.path ?? call.command)} |`
      ),
      '',
      `Read-pair candidates: ${row.audit.batching.map((pair) => `${pair.orders.join('+')} (${pair.alreadySameMessage ? 'already one message' : 'different messages'})`).join('; ') || 'none'}.`,
      ''
    );
  }
  lines.push(
    '## Interpretation boundaries',
    '',
    ...rows[0]!.audit.limitations.map((line) => `- ${line}`),
    '',
    'Next: annotate candidate usefulness against real results; test one removal or batching change at a time. No historical grade changes.',
    ''
  );
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || process.argv.length !== 4)
    throw new Error('[authoringCallAudit] usage: authoring-call-audit.ts INPUT.json NEW_REPORT.md');
  const stat = lstatSync(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
    throw new Error('[authoringCallAudit] Bounded regular input required');
  const bytes = readFileSync(inputPath);
  const input = JSON.parse(bytes.toString('utf8')) as AuthoringBaselineInput;
  if (!input.records.length || input.records.length > 100)
    throw new Error('[authoringCallAudit] Bounded nonempty records required');
  writeFileSync(
    outputPath,
    renderAuthoringCallAudit(input, createHash('sha256').update(bytes).digest('hex')),
    { flag: 'wx' }
  );
}
