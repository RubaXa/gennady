// @file: Contract for artifact extraction + sandbox teardown (specs survive, sandboxes never leak).
// @spec: AI-SKILLS
// @consumers: ai/flow-eval/sandbox-lifecycle.ts

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collectSpecFiles,
  persistRunArtifacts,
  pruneRetainedSandboxes,
  pruneTransientRunArtifacts,
  SddEvalSandboxLifecycle,
  teardownSandboxDirectories,
} from '../sandbox-lifecycle.ts';

const roots = new Set<string>();
const DAY_MS = 24 * 60 * 60 * 1000;
const DEBUG_SANDBOX_MAX_COUNT = 2;
const TRANSIENT_RESULT_MAX_COUNT = 10;

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-iso-'));
  roots.add(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function ownedSandbox(root: string): string {
  return mkdtempSync(join(root, 'sdd-flow-eval-'));
}

describe('sandbox lifecycle (extract artifacts, then tear down)', () => {
  it('collectSpecFiles finds worker specs and skips provisioned scaffolding', async () => {
    const dir = sandbox();
    mkdirSync(join(dir, 'specs', 'report'), { recursive: true });
    writeFileSync(join(dir, 'specs', 'report', 'report.spec.md'), '# spec\n');
    // Scaffolding that must be ignored: ai/, node_modules/, .claude/ also contain *.spec.md-like files.
    mkdirSync(join(dir, 'ai', 'skills'), { recursive: true });
    writeFileSync(join(dir, 'ai', 'skills', 'x.spec.md'), 'scaffold\n');
    mkdirSync(join(dir, 'node_modules', 'gennady'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'gennady', 'y.spec.md'), 'dep\n');

    const found = await collectSpecFiles(dir);
    assert.deepEqual(found, [join(dir, 'specs', 'report', 'report.spec.md')]);
  });

  it('collectSpecFiles returns [] for a missing directory (no throw)', async () => {
    assert.deepEqual(await collectSpecFiles(join(tmpdir(), 'does-not-exist-xyz')), []);
  });

  it('persistRunArtifacts copies specs + judge and writes summary.json (outside the sandbox)', async () => {
    const dir = sandbox();
    mkdirSync(join(dir, 'specs', 'report'), { recursive: true });
    const spec = join(dir, 'specs', 'report', 'report.spec.md');
    writeFileSync(spec, '# recovered spec\n');
    const judge = join(dir, '.sdd-eval-judge.rec.md');
    writeFileSync(judge, '# verdict\n');

    const artifactsRoot = sandbox();
    const runDir = await persistRunArtifacts(artifactsRoot, 'run-test', [
      {
        scenarioId: 'rec',
        verdict: 'pass',
        status: 'complete',
        usage: { total: 10562 },
        quality: { rule: 'R1', pass: true, detail: 'ok' },
        specFiles: [spec],
        judgeFile: judge,
        directory: dir,
      },
    ]);

    // The spec is copied preserving its in-sandbox relative path, and the judge rationale lands too.
    assert.ok(existsSync(join(runDir, 'rec', 'specs', 'report', 'report.spec.md')));
    assert.ok(existsSync(join(runDir, 'rec', 'judge.md')));
    const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
    assert.equal(summary.length, 1);
    assert.equal(summary[0].verdict, 'pass');
    assert.equal(summary[0].usage.total, 10562);
    assert.deepEqual(summary[0].specFiles, ['specs/report/report.spec.md']);
    assert.equal(summary[0].hasJudge, true);
  });

  it('teardownSandboxDirectories removes dirs and tolerates missing ones', async () => {
    const live = sandbox();
    mkdirSync(join(live, 'node_modules'), { recursive: true });
    const missing = join(tmpdir(), 'already-gone-xyz');
    const { removed } = await teardownSandboxDirectories([live, missing]);
    assert.ok(!existsSync(live), 'live sandbox removed');
    assert.equal(removed, 2, 'force:true makes a missing dir a successful no-op removal');
  });

  for (const reason of ['success', 'failure'] as const) {
    it(`compacts evidence before cleanup on ${reason}`, async () => {
      const root = sandbox();
      const artifactsRoot = join(root, 'artifacts');
      const owned = ownedSandbox(root);
      mkdirSync(join(owned, 'specs'), { recursive: true });
      writeFileSync(join(owned, 'specs/result.spec.md'), '# result\n');
      const lifecycle = new SddEvalSandboxLifecycle({
        sandboxRoot: root,
        artifactsRoot,
        runId: `run-${reason}`,
        keep: false,
      });
      lifecycle.registerOwnedDirectory('scenario', owned);
      const finalized = await lifecycle.finalize(reason);
      assert.equal(finalized.pending.length, 0);
      assert.equal(finalized.removed, 1);
      assert.equal(existsSync(owned), false);
      assert.ok(finalized.runDirectory);
      assert.equal(
        JSON.parse(readFileSync(join(finalized.runDirectory, 'lifecycle.json'), 'utf8')).reason,
        reason
      );
      assert.ok(existsSync(join(finalized.runDirectory, 'scenario/specs/result.spec.md')));
    });
  }

  it('keeps a failed cleanup pending and retries it without duplicating evidence', async () => {
    const root = sandbox();
    const owned = ownedSandbox(root);
    let attempts = 0;
    const lifecycle = new SddEvalSandboxLifecycle({
      sandboxRoot: root,
      artifactsRoot: join(root, 'artifacts'),
      runId: 'run-retry',
      keep: false,
      removeDirectory: async (path) => {
        attempts += 1;
        if (attempts === 1) throw new Error('injected cleanup failure');
        await rm(path, { recursive: true, force: true });
      },
    });
    lifecycle.registerOwnedDirectory('scenario', owned);
    const first = await lifecycle.finalize('failure');
    assert.deepEqual(first.pending, [owned]);
    assert.match(first.errors.join('\n'), /injected cleanup failure/);
    assert.equal(existsSync(owned), true);
    const second = await lifecycle.finalize('failure');
    assert.equal(second.runDirectory, first.runDirectory);
    assert.deepEqual(second.pending, []);
    assert.equal(second.removed, 1);
    assert.equal(existsSync(owned), false);
  });

  for (const keep of [false, true]) {
    it(`never cleans or retains before failed evidence compaction (keep=${keep})`, async () => {
      const root = sandbox();
      const owned = ownedSandbox(root);
      mkdirSync(join(owned, 'specs'), { recursive: true });
      writeFileSync(join(owned, 'specs/result.spec.md'), '# retry evidence\n');
      let attempts = 0;
      const lifecycle = new SddEvalSandboxLifecycle({
        sandboxRoot: root,
        artifactsRoot: join(root, 'artifacts'),
        runId: `run-compact-retry-${keep}`,
        keep,
        persistArtifacts: async (...args) => {
          attempts += 1;
          if (attempts === 1) throw new Error('injected compaction failure');
          return persistRunArtifacts(...args);
        },
      });
      lifecycle.registerOwnedDirectory('scenario', owned);

      const first = await lifecycle.finalize('failure');
      assert.equal(first.runDirectory, undefined);
      assert.equal(first.removed, 0);
      assert.equal(first.retained, 0);
      assert.deepEqual(first.pending, [owned]);
      assert.match(first.errors.join('\n'), /injected compaction failure/);
      assert.equal(existsSync(owned), true);
      assert.equal(existsSync(join(owned, '.sdd-eval-retained.json')), false);

      const second = await lifecycle.finalize('failure');
      assert.ok(second.runDirectory);
      assert.ok(existsSync(join(second.runDirectory, 'scenario/specs/result.spec.md')));
      if (keep) {
        assert.equal(second.retained, 1);
        assert.equal(existsSync(owned), true);
      } else {
        assert.equal(second.removed, 1);
        assert.equal(existsSync(owned), false);
      }
    });
  }

  it('bounds debug retention and removes overflow sandboxes', async () => {
    const root = sandbox();
    const lifecycle = new SddEvalSandboxLifecycle({
      sandboxRoot: root,
      artifactsRoot: join(root, 'artifacts'),
      runId: 'run-keep',
      keep: true,
      now: () => new Date('2026-09-24T12:00:00.000Z'),
    });
    const directories = Array.from({ length: DEBUG_SANDBOX_MAX_COUNT + 1 }, (_, index) => {
      const directory = ownedSandbox(root);
      lifecycle.registerOwnedDirectory(`scenario-${index}`, directory);
      return directory;
    });
    const finalized = await lifecycle.finalize('success');
    assert.equal(finalized.retained, DEBUG_SANDBOX_MAX_COUNT);
    assert.equal(finalized.removed, 1);
    assert.equal(directories.filter((directory) => existsSync(directory)).length, 2);
  });

  it('expires marker-owned debug sandboxes by age', async () => {
    const root = sandbox();
    const retained = ownedSandbox(root);
    const now = new Date('2026-09-24T12:00:00.000Z');
    writeFileSync(
      join(retained, '.sdd-eval-retained.json'),
      `${JSON.stringify({
        schema: 1,
        runId: 'run-old',
        retainedAt: new Date(now.getTime() - DAY_MS - 1).toISOString(),
        expiresAt: new Date(now.getTime() - 1).toISOString(),
      })}\n`
    );
    const removed = await pruneRetainedSandboxes(root, { nowMs: now.getTime() });
    assert.deepEqual(removed, [retained]);
    assert.equal(existsSync(retained), false);
  });

  it('bounds transient evidence by age and count without touching a protected run', async () => {
    const root = sandbox();
    const artifactsRoot = join(root, 'artifacts');
    mkdirSync(artifactsRoot);
    const now = new Date('2026-09-24T12:00:00.000Z');
    for (let index = 0; index < TRANSIENT_RESULT_MAX_COUNT + 3; index++) {
      const directory = join(artifactsRoot, `run-${String(index).padStart(2, '0')}`);
      mkdirSync(directory);
      const modified = new Date(now.getTime() - index * 60_000);
      utimesSync(directory, modified, modified);
    }
    const protectedRun = `run-${String(TRANSIENT_RESULT_MAX_COUNT + 2).padStart(2, '0')}`;
    const removed = await pruneTransientRunArtifacts(artifactsRoot, {
      nowMs: now.getTime(),
      protectRun: protectedRun,
    });
    assert.equal(removed.length, 3);
    assert.equal(existsSync(join(artifactsRoot, protectedRun)), true);
    assert.equal(readdirSync(artifactsRoot).length, TRANSIENT_RESULT_MAX_COUNT);
  });

  it('expires transient evidence by age even below the count boundary', async () => {
    const root = sandbox();
    const artifactsRoot = join(root, 'artifacts');
    mkdirSync(artifactsRoot);
    const now = new Date('2026-09-24T12:00:00.000Z');
    const oldRun = join(artifactsRoot, 'run-old');
    mkdirSync(oldRun);
    const old = new Date(now.getTime() - 7 * DAY_MS - 1);
    utimesSync(oldRun, old, old);
    assert.deepEqual(await pruneTransientRunArtifacts(artifactsRoot, { nowMs: now.getTime() }), [
      oldRun,
    ]);
    assert.equal(existsSync(oldRun), false);
  });

  it('rejects paths outside the exact owned sandbox boundary', () => {
    const root = sandbox();
    const lifecycle = new SddEvalSandboxLifecycle({
      sandboxRoot: root,
      artifactsRoot: join(root, 'artifacts'),
      runId: 'run-boundary',
      keep: false,
    });
    assert.throws(() => lifecycle.registerOwnedDirectory('outside', sandbox()), /non-owned/);
    assert.throws(
      () => lifecycle.registerOwnedDirectory('wrong-prefix', join(root, 'other')),
      /non-owned/
    );
    assert.throws(
      () => lifecycle.registerOwnedDirectory('missing', join(root, 'sdd-flow-eval-missing')),
      /existing ordinary directory/
    );
    const file = join(root, 'sdd-flow-eval-file');
    writeFileSync(file, 'not a directory\n');
    assert.throws(
      () => lifecycle.registerOwnedDirectory('file', file),
      /existing ordinary directory/
    );
  });

  it('refuses to place transient retention inside permanent results', () => {
    const root = sandbox();
    const permanent = join(root, 'ai/flow-eval/results');
    const createLifecycle = (artifactsRoot: string) =>
      new SddEvalSandboxLifecycle({
        sandboxRoot: root,
        artifactsRoot,
        protectedArtifactsRoot: permanent,
        runId: 'run-root-boundary',
        keep: false,
      });
    assert.throws(() => createLifecycle(permanent), /must be disjoint from permanent results/);
    assert.throws(
      () => createLifecycle(join(permanent, 'transient')),
      /must be disjoint from permanent results/
    );
    assert.throws(
      () => createLifecycle(join(root, 'ai/flow-eval')),
      /must be disjoint from permanent results/
    );
    assert.doesNotThrow(() => createLifecycle(join(root, 'ai/flow-eval/.results')));
    mkdirSync(permanent, { recursive: true });
    const alias = join(root, 'results-alias');
    symlinkSync(permanent, alias, 'dir');
    assert.throws(
      () => createLifecycle(join(alias, 'transient')),
      /must be disjoint from permanent results/
    );
  });
});
