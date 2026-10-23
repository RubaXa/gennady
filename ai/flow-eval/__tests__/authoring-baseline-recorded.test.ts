// @file: Replay and authenticate all30 fresh Flash attempts without an old temp directory or proxy.
// @spec: AI-SKILLS
// @consumers: bounded baseline corpus, trajectory report, regression protection

import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { it } from 'node:test';
import { summarizeAuthoringBaseline } from '../authoring-baseline-report.ts';
import {
  renderAuthoringBaselineReport,
  type AuthoringBaselineInput,
} from '../scripts/authoring-baseline-report.ts';

const root = new URL('../results/authoring-campaigns/spec-trajectory-oct23/', import.meta.url);
const load = (name: string) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const input = load('input.json') as AuthoringBaselineInput;
const manifest = load('primary-manifest.json') as {
  files: Array<{ path: string; bytes: number; sha256: string }>;
};
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

it('hash-binds all primary records, frozen protocol, plan and collector without following external paths', () => {
  const seen = new Set<string>();
  for (const entry of manifest.files) {
    assert.match(entry.path, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
    assert.ok(!entry.path.split('/').some((part) => part === '..' || part === ''));
    assert.ok(!seen.has(entry.path));
    seen.add(entry.path);
    const file = new URL(entry.path, root);
    const owned = relative(realpathSync(root), realpathSync(file));
    assert.ok(owned && owned !== '..' && !owned.startsWith('../') && !isAbsolute(owned));
    const parents = entry.path.split('/').slice(0, -1);
    for (let i = 1; i <= parents.length; i++)
      assert.equal(
        lstatSync(new URL(parents.slice(0, i).join('/') + '/', root)).isSymbolicLink(),
        false
      );
    const stat = lstatSync(file);
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
    assert.equal(stat.nlink, 1);
    const bytes = readFileSync(file);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(hash(bytes), entry.sha256, entry.path);
  }
  const protocol = load('protocol.json');
  assert.equal(hash(readFileSync(new URL('plan.json', root))), protocol.planSha256);
  assert.equal(hash(readFileSync(new URL('collector.mjs.txt', root))), protocol.collectorSha256);
  assert.deepEqual(load('plan.json'), input.plan);
  for (let i = 0; i < 30; i++)
    for (const name of ['summary.json', 'trajectory.json', 'collection.json'])
      assert.ok(seen.has(`raw/${i}/${name}`));
});

it('reproduces both reports over the exact30 attempts and refuses to promote their raw quality/path outcomes', () => {
  assert.equal(input.plan.length, 30);
  assert.equal(input.records.length, 30);
  assert.equal(input.identity.sourceCommit, '056870393ea2138a9470b7ef6188a01dc7885f81');
  assert.equal(input.identity.model, 'llm-proxy/deepseek-v4-flash');
  const report = summarizeAuthoringBaseline(input.plan, input.records, input.identity);
  assert.equal(report.complete, true);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), load('report.json'));
  assert.equal(
    renderAuthoringBaselineReport(report),
    readFileSync(new URL('TRAJECTORIES.md', root), 'utf8')
  );
  assert.equal(report.cases.length, 10);
  for (const row of report.cases) {
    assert.equal(row.planned, 3);
    assert.equal(row.recorded, 3);
  }
  for (const [i, record] of input.records.entries()) {
    assert.deepEqual(record.summary, load(`raw/${i}/summary.json`));
    assert.deepEqual(record.trajectory, load(`raw/${i}/trajectory.json`));
    assert.deepEqual(record.cleanup, load(`raw/${i}/collection.json`));
    const row = report.runs[i]!;
    assert.ok(!row.missing);
    assert.equal(row.artifactPass, record.summary.quality?.pass);
    assert.equal(row.pathPass, record.summary.trajectory?.pass);
    assert.equal(row.semanticVerdict, record.summary.verdict);
    assert.equal(
      row.profile.totalToolEvents,
      record.trajectory.events.filter((event) => event.type === 'tool').length
    );
  }
});
