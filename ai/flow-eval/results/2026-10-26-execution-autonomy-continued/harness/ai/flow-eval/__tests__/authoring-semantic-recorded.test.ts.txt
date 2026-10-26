// @file: Offline authentication of calibration13/14 and its separate diagnostic, never an upgraded14/14.
// @spec: AI-SKILLS
// @consumers: semantic qualification evidence; deterministic clean-checkout replay

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import { parseVerdict } from '../judge.ts';

const prefix = 'ai/flow-eval/results/authoring-campaigns/semantic-qualification-oct23';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const root = new URL(
  '../results/authoring-campaigns/semantic-qualification-oct23/',
  import.meta.url
);
const read = (path: string) => readFileSync(new URL(path, root));
const json = (path: string) => JSON.parse(read(path).toString('utf8'));
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

it('authenticates every calibration primary file in Git and retains the inconclusive attempt', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.schema, 'gennady.authoring-semantic-archive.1');
  assert.equal(manifest.files.length, 20);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z', '--', prefix], {
      cwd: repository,
      env,
      encoding: 'utf8',
    }).split('\0')
  );
  const seen = new Set();
  for (const file of manifest.files) {
    assert.match(file.path, /^(?:[a-z-]+\.json|attempts\/[a-z-]+-r[12]\.json)$/);
    assert.ok(!seen.has(file.path));
    seen.add(file.path);
    assert.ok(tracked.has(`${prefix}/${file.path}`), `Evidence missing from Git: ${file.path}`);
    if (file.path.startsWith('attempts/'))
      assert.ok(!lstatSync(new URL('attempts/', root)).isSymbolicLink());
    const stat = lstatSync(new URL(file.path, root));
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size < 1024 * 1024
    );
    const bytes = read(file.path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha(bytes), file.sha256);
  }
  const protocol = json('protocol.json'),
    result = json('results.json'),
    summary = json('summary.json');
  assert.equal(protocol.sourceCommit, '07ca6d92d57c0d16e13069d5059a7d6b77b4c9c3');
  assert.equal(manifest.sourceCommit, protocol.sourceCommit);
  assert.equal(sha(read('protocol.json')), result.protocolSha256);
  assert.equal(sha(JSON.stringify(protocol.controls)), protocol.controlsSha256);
  assert.equal(protocol.labelsHidden, true);
  assert.equal(protocol.hostOracleHidden, true);
  assert.equal(protocol.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(protocol.controls.length, 7);
  assert.equal(result.planned, 14);
  assert.equal(result.recorded, 14);
  assert.equal(result.complete, true);
  assert.equal(result.interrupted, false);
  const labels = new Map(
    protocol.controls.map(
      (row: { id: string; expected: string; artifact: string; artifactSha256: string }) => {
        assert.equal(sha(row.artifact), row.artifactSha256);
        return [row.id, row] as const;
      }
    )
  );
  const attempts = new Set();
  for (const row of result.rows) {
    const control = labels.get(row.id) as { expected: string; artifactSha256: string } | undefined;
    assert.ok(control);
    assert.ok([1, 2].includes(row.repetition));
    const id = `${row.id}-r${row.repetition}`;
    assert.ok(!attempts.has(id));
    attempts.add(id);
    assert.equal(row.artifactSha256, control.artifactSha256);
    assert.equal(row.expected, control.expected);
    assert.deepEqual(json(`attempts/${id}.json`), row);
    assert.equal(parseVerdict(row.rationale), row.verdict);
    assert.equal(row.status, 'recorded');
    assert.equal(row.captureComplete, true);
    assert.equal(row.tools, 0);
    assert.equal(row.usage.complete, true);
    assert.equal(row.usage.sessions, 1);
    assert.deepEqual(row.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(row.usage.total, row.usage.input + row.usage.output + row.usage.reasoning);
    assert.equal(row.matched, row.verdict === row.expected);
    assert.deepEqual(row.cleanup.errors, []);
    assert.equal(row.cleanup.temporaryDirectoryRemoved, true);
    assert.deepEqual(row.cleanup.sessions, [row.sessionId]);
  }
  assert.equal(attempts.size, 14);
  const unmatched = result.rows.filter((row: { matched: boolean }) => !row.matched);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].id, 'library-nonempty-overlap');
  assert.equal(unmatched[0].repetition, 2);
  assert.equal(unmatched[0].verdict, 'inconclusive');
  assert.equal(unmatched[0].rationale, '');
  assert.equal(unmatched[0].usage.total, 0);
  assert.equal(summary.main.matched, 13);
  assert.equal(summary.main.inconclusive, 1);
  for (const name of ['cleanup.json', 'supplementary-cleanup.json']) {
    const cleanup = json(name);
    assert.equal(cleanup.serverStopped, true);
    assert.equal(cleanup.runtimeRemoved, true);
    assert.equal(cleanup.recoveredTemporaryDirectories, 0);
    assert.equal(cleanup.globalConfigurationChanged, false);
  }
  const supplementary = json('supplementary-diagnostic.json');
  assert.equal(supplementary.artifactSha256, unmatched[0].artifactSha256);
  assert.equal(supplementary.verdict, 'fail');
  assert.equal(parseVerdict(supplementary.rationale), 'fail');
  assert.equal(supplementary.publicTerminalMetadata.assistantError, null);
  assert.deepEqual(supplementary.usage.models, ['llm-proxy/deepseek-v4-flash']);
  assert.equal(supplementary.tools, 0);
  assert.deepEqual(supplementary.cleanup.errors, []);
  assert.equal(summary.supplementary.attempts, 1);
  assert.equal(summary.supplementary.verdict, 'fail');
  assert.equal(summary.dollarCost, null);
  assert.equal(summary.providerHttpAttempts, null);
});
