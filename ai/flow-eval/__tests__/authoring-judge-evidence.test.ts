// @file: Causal controls for exact artifact judge evidence and separate semantic authority.
// @spec: AI-SKILLS
// @consumers: authoring-judge-evidence, SddEvalJudge

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { captureAuthoringJudgeEvidence } from '../authoring-judge-evidence.ts';
import { buildAuthoringFixture, getAuthoringCase } from '../authoring-benchmark.ts';
import { referenceSpec } from '../authoring-benchmark-fixtures.ts';
import { SddEvalJudge } from '../judge.ts';
import { SddEvalRunner } from '../runner.ts';
import { createAuthoringMatrix } from '../scripts/authoring-experiment.ts';
import type { SddEvalJudgeInput, SddEvalRuntime } from '../types.ts';

const model = { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'authoring-judge-'));
  const item = getAuthoringCase('module-flat');
  for (const [path, content] of Object.entries(buildAuthoringFixture('module-flat'))) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const content = referenceSpec('module', item.target, { parent: 'specs/token/token.spec.md' });
  const put = (text: string) => {
    mkdirSync(dirname(join(root, item.target)), { recursive: true });
    writeFileSync(join(root, item.target), text);
  };
  return {
    root,
    item,
    content,
    put,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
it('captures the complete artifact and source-owned oracle, not a truncated diff or narration', () => {
  const env = fixture();
  try {
    env.put(env.content);
    const captured = captureAuthoringJudgeEvidence(env.root, 'module-flat');
    assert.equal(captured.complete, true);
    assert.equal(captured.content, env.content);
    assert.equal(captured.sha256, createHash('sha256').update(env.content).digest('hex'));
    assert.equal(captured.oracle?.pass, true);
    env.put('# Broken artifact\n');
    assert.equal(captureAuthoringJudgeEvidence(env.root, 'module-flat').oracle?.pass, false);
  } finally {
    env.cleanup();
  }
});
it('runner supplies source-owned authoring evidence before judging, independently of its diff', async () => {
  const env = fixture();
  try {
    env.put(env.content);
    let prompt = '';
    const runtime: SddEvalRuntime = {
      createSession: async () => ({ id: 'worker' }),
      prompt: async () => {},
      judge: async (input) => {
        prompt = input.prompt;
        return 'VERDICT: pass\nSemantics only.';
      },
    };
    const result = await new SddEvalRunner(
      runtime,
      {
        readTail: async () => [],
        readEvents: async () => [],
        readStatus: async () => 'completed',
        readDiff: async () => 'TRUNCATED_DIFF',
      },
      { concurrency: 1, observeEveryMs: 0, maxObservations: 1 }
    ).runScenario({
      ...createAuthoringMatrix('test', 'baseline', 1, ['module-flat'])[0]!,
      directory: env.root,
    });
    assert.equal(result.judge?.verdict, 'pass');
    assert.match(prompt, /COMPLETE_ARTIFACT/);
    assert.match(prompt, /"pass":true/);
    assert.doesNotMatch(prompt, /TRUNCATED_DIFF/);
  } finally {
    env.cleanup();
  }
});
it('missing, symlinked, hardlinked and oversized artifacts cannot become complete judge evidence', () => {
  const env = fixture();
  try {
    assert.equal(captureAuthoringJudgeEvidence(env.root, 'module-flat').complete, false);
    env.put('x'.repeat(65 * 1024));
    assert.equal(captureAuthoringJudgeEvidence(env.root, 'module-flat').complete, false);
    const file = join(env.root, env.item.target);
    rmSync(file);
    const seed = join(env.root, 'brief.md');
    writeFileSync(seed, env.content);
    symlinkSync(seed, file);
    assert.equal(captureAuthoringJudgeEvidence(env.root, 'module-flat').complete, false);
    rmSync(file);
    linkSync(seed, file);
    assert.equal(captureAuthoringJudgeEvidence(env.root, 'module-flat').complete, false);
  } finally {
    env.cleanup();
  }
});
it('authoring semantic review excludes worker claims and cannot override deterministic path gates', async () => {
  let prompt = '';
  const runtime = {
    judge: async (input: { prompt: string }) => {
      prompt = input.prompt;
      return 'VERDICT: pass\nSemantics reviewed.';
    },
  } as SddEvalRuntime;
  const input: SddEvalJudgeInput = {
    intent: 'Specify normalization',
    acceptance: 'Bounded domain facts and exact CLI path',
    state: { status: 'completed', stuck: false, waiting: false, errors: [] },
    diff: 'TRUNCATED_UNTRUSTED_DIFF',
    events: [],
    tail: [{ role: 'assistant', text: 'UNTRUSTED_WORKER_CLAIM' }],
    authoring: { version: 1, target: 'specs/x.md', complete: true, content: 'FULL_EXACT_ARTIFACT' },
  };
  const judge = new SddEvalJudge(runtime, model);
  assert.equal((await judge.evaluate('case', '/fixture', input)).verdict, 'pass');
  assert.match(prompt, /FULL_EXACT_ARTIFACT/);
  assert.match(prompt, /independent deterministic gates/);
  assert.match(prompt, /Your pass cannot override/);
  assert.doesNotMatch(prompt, /TRUNCATED_UNTRUSTED_DIFF|UNTRUSTED_WORKER_CLAIM/);
  prompt = '';
  assert.equal(
    (
      await judge.evaluate('case', '/fixture', {
        ...input,
        authoring: { version: 1, target: 'specs/x.md', complete: false },
      })
    ).verdict,
    'inconclusive'
  );
  assert.equal(prompt, '', 'no model called when artifact evidence is unavailable');
  await judge.evaluate('full-flow', '/fixture', { ...input, authoring: undefined });
  assert.match(prompt, /TRUNCATED_UNTRUSTED_DIFF/);
  assert.match(prompt, /UNTRUSTED_WORKER_CLAIM/);
  assert.match(prompt, /red required gate/);
});
