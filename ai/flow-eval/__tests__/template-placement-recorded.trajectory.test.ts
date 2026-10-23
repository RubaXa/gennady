// @file: Offline replay of immutable placement24 plus separate Gen2 bytes, counters and source-owned artifact checks.
// @spec: AI-SKILLS
// @consumers: template placement evidence archive; deterministic authoring regression suite
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import {
  buildAuthoringFixture,
  checkAuthoringBenchmark,
  getAuthoringCase,
} from '../authoring-benchmark.ts';
import {
  compareAuthoringExperiments,
  measureAuthoringPath,
  type AuthoringObservation,
} from '../authoring-metrics.ts';
import type { Trajectory } from '../trajectory.ts';
import { deriveSpecAcronym } from '../../../shared/sdd/requirement-id.ts';

// Repository-relative immutable archive; this test has no external temp-path dependency.
const results = realpathSync(fileURLToPath(new URL('../results/', import.meta.url)));
const campaign = 'authoring-campaigns/template-placement-oct22';
const manifest = JSON.parse(
  readFileSync(join(results, campaign, 'evidence-manifest.json'), 'utf8')
) as {
  schema: string;
  files: Record<string, string>;
};
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function verifyBytes(path: string, bytes: Buffer): Buffer {
  assert.match(manifest.files[path] ?? '', /^[a-f0-9]{64}$/, `unbound archive file: ${path}`);
  assert.equal(sha(bytes), manifest.files[path], `immutable byte hash: ${path}`);
  return bytes;
}
function read(path: string): Buffer {
  assert.ok(!path.startsWith('/') && !path.split('/').some((p) => !p || p === '.' || p === '..'));
  let file = results;
  for (const part of path.split('/')) {
    file = join(file, part);
    assert.equal(lstatSync(file).isSymbolicLink(), false);
  }
  assert.ok(realpathSync(file).startsWith(results + sep));
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= 16 * 1024 * 1024);
  return verifyBytes(path, readFileSync(file));
}
const json = (path: string) => JSON.parse(read(path).toString('utf8'));

it('recorded placement24: exact hashes, independent seeds, raw counters and separate supplementary authority', () => {
  assert.equal(manifest.schema, 'gennady.authoring-evidence-manifest.1');
  for (const path of Object.keys(manifest.files)) read(path);
  const frozenPath = `${campaign}/evidence/supplemental-v3/frozen-inputs.json`;
  const protocolPath = `${campaign}/evidence/supplemental-v3/protocol.json`;
  const frozen = json(frozenPath);
  const protocol = json(protocolPath);
  const batch = json(`${campaign}/evidence/supplemental-v3/batch-result.json`);
  assert.equal(frozen.protocolSha256, sha(read(protocolPath)));
  assert.equal(protocol.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(protocol.concurrency, 3);
  assert.equal(protocol.deadlineMs, 180000);
  assert.equal(batch.frozenInputsSha256, sha(read(frozenPath)));
  const expected = new Set<string>();
  for (const variant of ['baseline', 'template-rich', 'owner-rich', 'concise-both'])
    for (const caseId of ['module-flat', 'module-nested'])
      for (const repetition of [1, 2, 3])
        expected.add(
          `2026-10-23-authoring-template-placement-oct22-${caseId}-${variant}-r${repetition}`
        );
  assert.equal(frozen.inputs.length, 24);
  assert.equal(batch.states.length, 24);
  const seen = new Set<string>();
  const records: AuthoringObservation[] = [];
  for (const input of frozen.inputs) {
    assert.ok(expected.has(input.directory) && !seen.has(input.directory));
    seen.add(input.directory);
    const prefix = input.directory;
    const s = json(`${prefix}/summary.json`);
    const t = json(`${prefix}/trajectory.json`) as Trajectory;
    const reflection = json(`${prefix}/reflection.json`);
    const receipt = json(`${campaign}/evidence/public-tools/${prefix}.json`);
    const definition = getAuthoringCase(input.caseId, 'frozen-oct22');
    const declared = protocol.expected.find(
      (row: { blindId: string }) => row.blindId === input.blindId
    );
    assert.equal(declared?.directory, input.directory);
    assert.equal(declared?.scenarioId, input.scenarioId);
    assert.equal(s.scenarioId, input.scenarioId);
    assert.equal(s.sha, input.primarySourceSha);
    assert.equal(s.source.dirty, false);
    assert.equal(s.authoringBenchmark.dirty, false);
    assert.equal(s.authoringBenchmark.modelVerified, true);
    assert.deepEqual(s.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(s.usage.complete, true);
    assert.equal(sha(read(`${prefix}/summary.json`)), input.summarySha256);
    assert.equal(sha(read(`${prefix}/trajectory.json`)), input.trajectorySha256);
    if (input.originalJudgeSha256 === null) {
      assert.equal(s.hasJudge, false);
      assert.equal(existsSync(join(results, prefix, 'judge.md')), false);
    } else assert.equal(sha(read(`${prefix}/judge.md`)), input.originalJudgeSha256);
    assert.equal(receipt.summarySha256, input.summarySha256);
    assert.equal(receipt.trajectorySha256, input.trajectorySha256);
    assert.equal(receipt.sourceCommit, s.sha);
    assert.equal(receipt.complete, true);
    assert.equal(receipt.modelCalls, 0);
    assert.ok(receipt.diagnosticBytes <= 1024);
    for (const call of receipt.calls) {
      const event = t.events.find((row) => row.type === 'tool' && row.callId === call.callId);
      assert.ok(event && event.type === 'tool');
      assert.equal(call.sessionId, event.sessionId);
      assert.equal(call.startedAt, event.startedAt);
      assert.equal(call.finishedAt, event.finishedAt);
      assert.equal(call.model, 'llm-proxy/deepseek-v4-flash');
      assert.equal(
        Buffer.byteLength(call.diagnosticExcerpt ?? ''),
        call.diagnosticExcerptBytes ?? 0
      );
    }
    const directory = receipt.sessions[0].directory;
    const replay = measureAuthoringPath(
      t,
      definition.target,
      directory,
      true,
      definition.createArgs
    );
    assert.deepEqual(replay.metrics, s.authoringBenchmark.metrics);
    assert.equal(replay.pass, s.trajectory.pass); // FALSE is preserved, not waived.
    assert.equal(s.authoringBenchmark.trajectoryPass, replay.pass);
    assert.equal(s.authoringBenchmark.nonCacheTokens, s.usage.total);
    assert.equal(s.authoringBenchmark.durationMs, s.usage.wallClockMs);
    assert.equal(reflection.diffUnchanged, true);
    assert.equal(reflection.newToolCalls, 0);
    assert.ok(Date.parse(reflection.startedAt) >= Date.parse(s.timestamp));
    assert.equal(reflection.sessionId, receipt.sessions[0].sessionId);
    // Citation mistakes remain raw diagnostics, not a reason to edit/drop the observation.
    const fixture = buildAuthoringFixture(input.caseId, 'frozen-oct22');
    for (const [path, text] of Object.entries(fixture))
      if (path.endsWith('.spec.md')) assert.equal(read(`${prefix}/${path}`).toString('utf8'), text);
    const artifact = read(`${prefix}/${definition.target}`);
    assert.equal(sha(artifact), input.artifactSha256);
    const root = mkdtempSync(join(tmpdir(), 'placement24-replay-'));
    try {
      for (const [path, text] of Object.entries(fixture)) {
        const file = resolve(root, path);
        assert.ok(file.startsWith(root + sep));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
      mkdirSync(dirname(join(root, definition.target)), { recursive: true });
      writeFileSync(join(root, definition.target), artifact);
      const oracle = checkAuthoringBenchmark(root, input.caseId, 'frozen-oct22');
      assert.equal(oracle.pass, s.quality.pass); // Original RED remains RED under this frozen oracle.
      assert.deepEqual(oracle.checks, s.quality.checks);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    const promptPath = `${campaign}/evidence/supplemental-v3/${input.promptName}`;
    assert.equal(sha(read(promptPath)), input.promptSha256);
    const state = batch.states.find((row: { blindId: string }) => row.blindId === input.blindId);
    assert.ok(state);
    const suffix =
      state.status === 'not-attempted'
        ? `${input.blindId}.not-attempted.json`
        : `${input.blindId}/${state.status === 'failed' ? 'failure.json' : 'result.json'}`;
    const secondary = json(`${campaign}/evidence/supplemental-v3/${suffix}`);
    assert.equal(secondary.blindId, input.blindId);
    assert.equal(secondary.frozenInputsSha256, sha(read(frozenPath)));
    if (state.status !== 'recorded') assert.equal(secondary.verdict, 'inconclusive');
    else {
      assert.equal(secondary.artifactSha256, input.artifactSha256);
      assert.equal(secondary.promptSha256, input.promptSha256);
      assert.equal(secondary.originalResultsReplaced, false);
      const trusted =
        !secondary.error &&
        !secondary.batchAborted &&
        secondary.usage?.complete === true &&
        secondary.coverage?.complete === true &&
        secondary.tools?.length === 0 &&
        JSON.stringify(secondary.usage.models) === JSON.stringify(['llm-proxy/deepseek-v4-flash']);
      const firstLine = String(secondary.publicText ?? '')
        .trim()
        .split(/\r?\n/, 1)[0];
      const explicit = /^VERDICT: (pass|fail|inconclusive)$/.exec(firstLine)?.[1];
      assert.equal(secondary.verdict, trusted && explicit ? explicit : 'inconclusive');
    }
    // Supplementary semantics never replace the primary observation used below.
    records.push(s.authoringBenchmark);
  }
  assert.deepEqual(seen, expected);
  for (const variant of ['template-rich', 'owner-rich', 'concise-both']) {
    const selected = records.filter((r) => ['baseline', variant].includes(r.variant));
    assert.deepEqual(
      compareAuthoringExperiments(
        selected,
        'baseline',
        variant,
        ['module-flat', 'module-nested'],
        3
      ),
      json(`${campaign}/evidence/${variant}-comparison.json`)
    );
  }
  // Real-data negative controls: byte tampering and cherry-picking do not become success.
  const one = [...expected][0]!;
  const summaryPath = `${one}/summary.json`;
  assert.throws(
    () => verifyBytes(summaryPath, Buffer.concat([read(summaryPath), Buffer.from(' ')])),
    /immutable byte hash/
  );
  const pair = records.filter((r) => ['baseline', 'template-rich'].includes(r.variant));
  assert.equal(
    compareAuthoringExperiments(
      pair.slice(1),
      'baseline',
      'template-rich',
      ['module-flat', 'module-nested'],
      3
    ).comparable,
    false
  );
});

it('recorded concise-acronym six: identical secondary rubric/seeds, local correction fact, unchanged rejection', () => {
  const prefix = `${campaign}/evidence/supplemental-gen2`;
  const frozenPath = `${prefix}/frozen-inputs.json`;
  const protocolPath = `${prefix}/protocol.json`;
  const frozen = json(frozenPath);
  const protocol = json(protocolPath);
  const originalProtocolPath = `${campaign}/evidence/supplemental-v3/protocol.json`;
  const original = json(originalProtocolPath);
  const originalInputs = json(`${campaign}/evidence/supplemental-v3/frozen-inputs.json`);
  const batch = json(`${prefix}/batch-result.json`);
  assert.equal(frozen.protocolSha256, sha(read(protocolPath)));
  assert.equal(protocol.priorProtocolSha256, sha(read(originalProtocolPath)));
  assert.equal(protocol.rubricSha256, original.rubricSha256);
  assert.equal(sha(protocol.rubric), original.rubricSha256);
  assert.equal(sha(JSON.stringify(protocol.cases)), sha(JSON.stringify(original.cases)));
  assert.equal(protocol.sourceOwnedSeedsSha256, sha(JSON.stringify(original.cases)));
  assert.equal(protocol.gen2PrimarySource, 'adf42274df08e89355c781994317e20658d9c487');
  assert.equal(protocol.baseUrl, original.baseUrl);
  assert.equal(protocol.model, original.model);
  assert.equal(protocol.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(protocol.concurrency, 3);
  assert.equal(protocol.deadlineMs, 180000);
  assert.equal(protocol.maximumModelCalls, 6);
  assert.equal(frozen.inputs.length, 6);
  assert.equal(batch.states.length, 6);
  assert.equal(batch.frozenInputsSha256, sha(read(frozenPath)));
  const expected = new Set<string>();
  for (const id of ['module-flat', 'module-nested'])
    for (const r of [1, 2, 3])
      expected.add(`2026-10-23-authoring-template-placement-oct22-${id}-concise-acronym-r${r}`);
  const seen = new Set<string>();
  const candidate: AuthoringObservation[] = [];
  let localAcronymCases = 0,
    delegatedCases = 0;
  for (const input of frozen.inputs) {
    assert.ok(expected.has(input.directory) && !seen.has(input.directory));
    seen.add(input.directory);
    const declared = protocol.expected.find(
      (row: { blindId: string }) => row.blindId === input.blindId
    );
    assert.equal(declared?.directory, input.directory);
    const s = json(`${input.directory}/summary.json`);
    const t = json(`${input.directory}/trajectory.json`) as Trajectory;
    const reflection = json(`${input.directory}/reflection.json`);
    const receipt = json(`${campaign}/evidence/public-tools-gen2/${input.directory}.json`);
    const definition = getAuthoringCase(input.caseId, 'frozen-oct22');
    const artifact = read(`${input.directory}/${definition.target}`);
    assert.equal(s.sha, protocol.gen2PrimarySource);
    assert.equal(s.sha, input.primarySourceSha);
    assert.equal(s.authoringBenchmark.sourceCommit, s.sha);
    assert.equal(s.source.dirty, false);
    assert.equal(s.authoringBenchmark.dirty, false);
    assert.equal(s.authoringBenchmark.modelVerified, true);
    assert.equal(s.authoringBenchmark.model, 'llm-proxy/deepseek-v4-flash');
    assert.deepEqual(s.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(s.usage.complete, true);
    assert.equal(sha(read(`${input.directory}/summary.json`)), input.summarySha256);
    assert.equal(sha(read(`${input.directory}/trajectory.json`)), input.trajectorySha256);
    assert.equal(sha(artifact), input.artifactSha256);
    if (input.originalJudgeSha256 === null) {
      assert.equal(s.hasJudge, false);
      assert.equal(existsSync(join(results, input.directory, 'judge.md')), false);
    } else assert.equal(sha(read(`${input.directory}/judge.md`)), input.originalJudgeSha256);
    assert.equal(receipt.sourceCommit, s.sha);
    assert.equal(receipt.summarySha256, input.summarySha256);
    assert.equal(receipt.trajectorySha256, input.trajectorySha256);
    assert.equal(receipt.complete, true);
    assert.equal(receipt.modelCalls, 0);
    assert.deepEqual(receipt.missing, []);
    const writes = [],
      checks = [];
    for (const call of receipt.calls) {
      const event = t.events.find((row) => row.type === 'tool' && row.callId === call.callId);
      assert.ok(event && event.type === 'tool');
      assert.equal(call.sessionId, event.sessionId);
      assert.equal(call.startedAt, event.startedAt);
      assert.equal(call.finishedAt, event.finishedAt);
      assert.equal(call.model, 'llm-proxy/deepseek-v4-flash');
      if (call.classification === 'target-write-input') writes.push(call);
      if (call.diagnosticEligible) checks.push(call);
      assert.notEqual(call.classification, 'opaque-command-output-not-read');
    }
    assert.equal(writes.length, 1);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].classification, 'direct');
    assert.equal(checks[0].exit, 0);
    assert.deepEqual(checks[0].diagnosticCodes, []);
    const acr = deriveSpecAcronym(definition.target);
    if (writes[0].requirementIds.length) {
      assert.deepEqual(writes[0].requirementIds, [`${acr}-REQ-1`, `${acr}-REQ-2`]);
      localAcronymCases++;
    } else {
      assert.match(
        artifact.toString('utf8'),
        /No module-specific requirements\. Implements parent requirements:\s*TOK-REQ-1,\s*TOK-REQ-2\./
      );
      delegatedCases++;
    }
    const replay = measureAuthoringPath(
      t,
      definition.target,
      receipt.sessions[0].directory,
      true,
      definition.createArgs
    );
    assert.deepEqual(replay.metrics, s.authoringBenchmark.metrics);
    assert.equal(replay.pass, false); // Local correction success is NOT global path proof.
    assert.equal(s.trajectory.pass, false);
    assert.equal(s.authoringBenchmark.trajectoryPass, false);
    assert.equal(s.authoringBenchmark.nonCacheTokens, s.usage.total);
    assert.equal(s.authoringBenchmark.durationMs, s.usage.wallClockMs);
    assert.equal(reflection.diffUnchanged, true);
    assert.equal(reflection.newToolCalls, 0);
    assert.ok(Date.parse(reflection.startedAt) >= Date.parse(s.timestamp));
    const fixture = buildAuthoringFixture(input.caseId, 'frozen-oct22');
    const root = mkdtempSync(join(tmpdir(), 'placement-gen2-replay-'));
    try {
      for (const [path, text] of Object.entries(fixture)) {
        if (path.endsWith('.spec.md'))
          assert.equal(read(`${input.directory}/${path}`).toString('utf8'), text);
        const file = resolve(root, path);
        assert.ok(file.startsWith(root + sep));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
      mkdirSync(dirname(join(root, definition.target)), { recursive: true });
      writeFileSync(join(root, definition.target), artifact);
      const oracle = checkAuthoringBenchmark(root, input.caseId, 'frozen-oct22');
      assert.equal(oracle.pass, s.quality.pass);
      assert.deepEqual(oracle.checks, s.quality.checks); // Preserve both pending-literal REDs.
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    assert.equal(sha(read(`${prefix}/${input.promptName}`)), input.promptSha256);
    const state = batch.states.find((row: { blindId: string }) => row.blindId === input.blindId);
    assert.ok(state);
    const suffix =
      state.status === 'not-attempted'
        ? `${input.blindId}.not-attempted.json`
        : `${input.blindId}/${state.status === 'failed' ? 'failure.json' : 'result.json'}`;
    const secondary = json(`${prefix}/${suffix}`);
    assert.equal(secondary.frozenInputsSha256, sha(read(frozenPath)));
    if (state.status !== 'recorded') assert.equal(secondary.verdict, 'inconclusive');
    else {
      assert.equal(secondary.artifactSha256, input.artifactSha256);
      assert.equal(secondary.promptSha256, input.promptSha256);
      assert.equal(secondary.originalResultsReplaced, false);
      const trusted =
        !secondary.error &&
        !secondary.batchAborted &&
        secondary.usage?.complete === true &&
        secondary.coverage?.complete === true &&
        secondary.tools?.length === 0 &&
        JSON.stringify(secondary.usage.models) === JSON.stringify(['llm-proxy/deepseek-v4-flash']);
      const explicit = /^VERDICT: (pass|fail|inconclusive)$/.exec(
        String(secondary.publicText ?? '')
          .trim()
          .split(/\r?\n/, 1)[0]
      )?.[1];
      assert.equal(secondary.verdict, trusted && explicit ? explicit : 'inconclusive');
    }
    candidate.push(s.authoringBenchmark);
  }
  assert.deepEqual(seen, expected);
  assert.equal(localAcronymCases, 5);
  assert.equal(delegatedCases, 1);
  const baseline: AuthoringObservation[] = [];
  for (const input of originalInputs.inputs)
    if (input.variant === 'baseline')
      baseline.push(json(`${input.directory}/summary.json`).authoringBenchmark);
  assert.equal(baseline.length, 6);
  const compared = compareAuthoringExperiments(
    [...baseline, ...candidate],
    'baseline',
    'concise-acronym',
    ['module-flat', 'module-nested'],
    3
  );
  assert.deepEqual(compared, json(`${campaign}/evidence/concise-acronym-comparison.json`));
  assert.equal(compared.comparable, true);
  assert.equal(compared.recommendation, 'reject');
});
