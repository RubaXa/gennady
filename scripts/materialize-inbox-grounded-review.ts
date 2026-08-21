// @file: Materialize an evidence-backed acceptance review into an explicit local inbox report.
// @consumers: operator-only UI acceptance on real MR data; never writes to GitLab.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { EventJournal } from '../services/agent-inbox/modules/inbox-core/event-journal.js';

type DiffLine = {
  type: 'context' | 'add' | 'remove';
  num?: number;
  text: string;
};

type EvidenceFinding = {
  id: string;
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  summary: string;
  factcheck: 'verified' | 'pending' | 'debunked';
  diff: DiffLine[];
};

type Evidence = {
  evidenceId: string;
  mr: string;
  source: string;
  track: string;
  finding: EvidenceFinding;
  diagrams?: Array<Record<string, unknown>>;
};

async function main(): Promise<void> {
  const [reportArgument, journalArgument, evidenceArgument] = process.argv.slice(2);
  if (!reportArgument || !journalArgument || !evidenceArgument) {
    throw new Error(
      'Usage: materialize-inbox-grounded-review.ts <absolute-report-dir> <absolute-events-jsonl> <absolute-evidence-json>'
    );
  }

  const reportDir = resolve(reportArgument);
  const journalPath = resolve(journalArgument);
  const evidencePath = resolve(evidenceArgument);
  if (basename(reportDir) !== 'report')
    throw new Error('Target must be an explicit report directory');
  if (basename(journalPath) !== 'events.jsonl')
    throw new Error('Target must be an explicit events.jsonl');
  if (!existsSync(join(reportDir, 'review.json'))) throw new Error(`Missing report: ${reportDir}`);

  const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Evidence;
  if (!evidence.evidenceId || !evidence.mr || !evidence.track || !evidence.finding?.diff?.length) {
    throw new Error('Evidence must identify the MR, track, finding, and referenced diff');
  }

  const taskPath = join(reportDir, 'tasks', `${evidence.track}.result.json`);
  const task = JSON.parse(await readFile(taskPath, 'utf8')) as Record<string, unknown>;
  const finding = {
    ...evidence.finding,
    source: evidence.source,
    evidenceId: evidence.evidenceId,
  };
  await writeFile(
    taskPath,
    `${JSON.stringify({ ...task, findings: [finding] }, null, 2)}\n`,
    'utf8'
  );

  const reviewPath = join(reportDir, 'review.json');
  const review = JSON.parse(await readFile(reviewPath, 'utf8')) as Record<string, unknown>;
  await writeFile(
    reviewPath,
    `${JSON.stringify(
      { ...review, verdict: 'COMMENT', findings: [finding], diagrams: evidence.diagrams ?? [] },
      null,
      2
    )}\n`,
    'utf8'
  );

  const journal = new EventJournal(journalPath);
  const alreadyPresent = journal
    .read()
    .some((entry) => entry.mr === evidence.mr && entry.payload?.evidenceId === evidence.evidenceId);
  if (!alreadyPresent) {
    await journal.append({
      ts: new Date().toISOString(),
      mr: evidence.mr,
      kind: 'widget_bump',
      actor: 'acceptance-grounded-mock',
      payload: {
        evidenceId: evidence.evidenceId,
        verdict: 'COMMENT',
        revision: Number(review.revision ?? 1),
        items: [{ ...finding, state: 'open' }],
      },
    });
  }

  process.stdout.write(
    `Materialized ${evidence.finding.id} from ${evidence.source}; GitLab was not modified\n`
  );
}

await main();
