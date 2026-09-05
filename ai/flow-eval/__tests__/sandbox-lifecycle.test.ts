// @file: Contract for artifact extraction + sandbox teardown (specs survive, sandboxes never leak).
// @consumers: ai/flow-eval/sandbox-lifecycle.ts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collectSpecFiles,
  persistRunArtifacts,
  teardownSandboxDirectories,
} from '../sandbox-lifecycle.ts';

function sandbox(): string {
  return mkdtempSync(join(tmpdir(), 'lifecycle-iso-'));
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
});
