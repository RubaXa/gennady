// @file: Replay and authenticate all30 fresh Flash attempts without an old temp directory or proxy.
// @spec: AI-SKILLS
// @consumers: bounded baseline corpus, trajectory report, regression protection

import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const archivePrefix = relative(repository, fileURLToPath(root)).split('\\').join('/');
const resultsPrefix = 'ai/flow-eval/results';
const placementManifest = JSON.parse(
  readFileSync(
    new URL(
      '../results/authoring-campaigns/template-placement-oct22/evidence-manifest.json',
      import.meta.url
    ),
    'utf8'
  )
) as { files: Record<string, string> };
const evidenceEntries = [
  ...manifest.files.map((entry) => ({ ...entry, path: `${archivePrefix}/${entry.path}` })),
  ...Object.entries(placementManifest.files).map(([path, sha256]) => ({
    path: `${resultsPrefix}/${path}`,
    sha256,
  })),
];
const evidencePaths = evidenceEntries.map((entry) => entry.path);

function missingEvidenceFiles(tracked: ReadonlySet<string>): string[] {
  return evidencePaths.filter((path) => !tracked.has(path));
}

it('requires both frozen manifests in the Git index, not merely the local ignored tree', () => {
  const env = { ...process.env };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_COMMON_DIR',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ])
    delete env[key];
  const output = execFileSync('git', ['ls-files', '--stage', '-z', '--', resultsPrefix], {
    cwd: repository,
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const tracked = new Map(
    output
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const match = /^100(?:644|755) ([0-9a-f]{40,64}) 0\t(.+)$/.exec(entry);
        assert.ok(match, 'Only resolved stage-0 primary files qualify');
        return [match[2]!, match[1]!] as const;
      })
  );
  assert.deepEqual(
    missingEvidenceFiles(new Set(tracked.keys())),
    [],
    'Manifest files must survive a clean checkout'
  );
  // Authenticate INDEX bytes too: unchanged local files cannot hide a different staged blob.
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repository,
    env,
    input: evidencePaths.map((path) => tracked.get(path)!).join('\n') + '\n',
    maxBuffer: 64 * 1024 * 1024,
  });
  let cursor = 0;
  for (const entry of evidenceEntries) {
    const end = blobs.indexOf(10, cursor);
    assert.ok(end >= cursor, `Missing Git blob header: ${entry.path}`);
    const header = /^([0-9a-f]{40,64}) blob ([0-9]+)$/.exec(
      blobs.subarray(cursor, end).toString('utf8')
    );
    assert.ok(header, `Invalid Git blob header: ${entry.path}`);
    assert.equal(header[1], tracked.get(entry.path));
    const size = Number(header[2]);
    cursor = end + 1;
    assert.ok(Number.isSafeInteger(size) && size >= 0 && cursor + size < blobs.length);
    assert.equal(hash(blobs.subarray(cursor, cursor + size)), entry.sha256, entry.path);
    cursor += size;
    assert.equal(blobs[cursor++], 10, `Missing Git blob delimiter: ${entry.path}`);
  }
  assert.equal(cursor, blobs.length);
});

it('detects an omitted log from either frozen campaign when all other evidence is tracked', () => {
  for (const omitted of [
    `${archivePrefix}/raw/0/cli.log`,
    `${resultsPrefix}/authoring-campaigns/template-placement-oct22/evidence/preflight/gennady-authoring-gen2-commit.log`,
  ]) {
    const tracked = new Set(evidencePaths);
    assert.ok(tracked.delete(omitted));
    assert.deepEqual(missingEvidenceFiles(tracked), [omitted]);
  }
});

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
