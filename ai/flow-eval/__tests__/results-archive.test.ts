// @file: Contract for the durable per-scenario result archive (GAP-E-6, D-62) — summary.json/judge.md
//   always written under a real, never-gitignored directory (not the transient .results/), one
//   directory per (date, scenarioId), disambiguated with a -N suffix on a same-day re-run.
// @consumers: ai/flow-eval/results-archive.ts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  appendExperimentLogStub,
  persistDurableResult,
  readAllDurableSummaries,
  relativeResultDir,
  resolveGitSha,
  type SddEvalDurableSummary,
} from '../results-archive.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'results-archive-'));
}

function fakeSummary(overrides: Partial<SddEvalDurableSummary> = {}): SddEvalDurableSummary {
  return {
    scenarioId: 'fibonacci-library',
    date: '2026-09-08',
    timestamp: '2026-09-08T10:00:00.000Z',
    sha: 'deadbeef',
    model: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
    judgeModel: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
    budget: {
      concurrency: 1,
      maxObservations: 40,
      observeEveryMs: 90000,
      stuckAfter: 4,
      tailLimit: 8,
    },
    verdict: 'pass',
    status: 'completed',
    outcome: 'pass',
    actions: 74,
    durationMs: 15 * 60_000,
    usage: { total: 191000 },
    quality: { rule: 'R1', pass: true, detail: 'ok' },
    hasJudge: true,
    specFiles: ['specs/fibonacci/fibonacci.spec.md'],
    ...overrides,
  };
}

describe('GAP-E-6: persistDurableResult writes a real, permanent per-scenario directory', () => {
  it('writes summary.json (pretty JSON) and judge.md into <date>-<scenarioId>/', async () => {
    const root = tempDir();
    const judgeSrc = join(root, 'judge-source.md');
    writeFileSync(judgeSrc, '# verdict rationale\n');
    try {
      const dir = await persistDurableResult(root, fakeSummary(), { judgeFile: judgeSrc });
      assert.equal(dir, join(root, '2026-09-08-fibonacci-library'));
      assert.ok(existsSync(join(dir, 'summary.json')));
      assert.ok(existsSync(join(dir, 'judge.md')));
      const written = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'));
      assert.equal(written.scenarioId, 'fibonacci-library');
      assert.equal(written.outcome, 'pass');
      assert.equal(written.actions, 74);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a same-day same-scenario re-run gets a -2 suffix, never overwrites the first', async () => {
    const root = tempDir();
    try {
      const first = await persistDurableResult(root, fakeSummary({ actions: 74 }));
      const second = await persistDurableResult(root, fakeSummary({ actions: 90 }));
      assert.equal(first, join(root, '2026-09-08-fibonacci-library'));
      assert.equal(second, join(root, '2026-09-08-fibonacci-library-2'));
      const firstSummary = JSON.parse(await readFile(join(first, 'summary.json'), 'utf8'));
      const secondSummary = JSON.parse(await readFile(join(second, 'summary.json'), 'utf8'));
      assert.equal(firstSummary.actions, 74, 'the first run is untouched by the second');
      assert.equal(secondSummary.actions, 90);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('works without a judgeFile (task-phase scenarios have no judge)', async () => {
    const root = tempDir();
    try {
      const dir = await persistDurableResult(root, fakeSummary({ hasJudge: false }));
      assert.ok(existsSync(join(dir, 'summary.json')));
      assert.ok(!existsSync(join(dir, 'judge.md')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('GAP-E-6: readAllDurableSummaries', () => {
  it('reads every summary.json under the results root, sorted by directory name', async () => {
    const root = tempDir();
    try {
      await persistDurableResult(root, fakeSummary({ scenarioId: 'b-scenario' }));
      await persistDurableResult(root, fakeSummary({ scenarioId: 'a-scenario' }));
      const all = await readAllDurableSummaries(root);
      assert.deepEqual(
        all.map((entry) => entry.summary.scenarioId),
        ['a-scenario', 'b-scenario']
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns [] for a missing results root (no throw)', async () => {
    assert.deepEqual(await readAllDurableSummaries(join(tmpdir(), 'does-not-exist-xyz')), []);
  });

  it('skips a malformed summary.json instead of failing the whole read', async () => {
    const root = tempDir();
    try {
      await persistDurableResult(root, fakeSummary({ scenarioId: 'good' }));
      mkdirSync(join(root, '2026-09-08-bad'));
      writeFileSync(join(root, '2026-09-08-bad', 'summary.json'), '{ not json');
      const all = await readAllDurableSummaries(root);
      assert.deepEqual(
        all.map((entry) => entry.summary.scenarioId),
        ['good']
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('GAP-E-6: resolveGitSha', () => {
  it('resolves the real HEAD sha for this checkout', async () => {
    const repoRoot = new URL('../../..', import.meta.url).pathname;
    const expected = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    assert.equal(await resolveGitSha(repoRoot), expected);
  });

  it('returns undefined (never throws) outside a git checkout', async () => {
    const dir = tempDir();
    try {
      assert.equal(await resolveGitSha(dir), undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('GAP-E-6: appendExperimentLogStub (one append-only stub per run)', () => {
  it('appends a stub block with mechanical numbers filled in and prose placeholders left blank', async () => {
    const root = tempDir();
    const logPath = join(root, 'EXPERIMENTS-LOG.md');
    writeFileSync(logPath, '# Журнал экспериментов\n\nexisting content\n');
    try {
      // resultDir here is REPO-RELATIVE (`ai/flow-eval/results/...`), matching what cli.ts actually
      // passes in production (relativeResultDir() applied to the absolute persistDurableResult()
      // return value) — SO-5: an absolute `/Users/<name>/...` path must never land in this committed
      // doc, so the fixture must not cement that shape as normal (see relativeResultDir tests below).
      const block = await appendExperimentLogStub(
        logPath,
        fakeSummary(),
        'ai/flow-eval/results/2026-09-08-x'
      );
      assert.ok(block);
      assert.match(block!, /## 2026-09-08 — `fibonacci-library` \(pass\/pass\)/);
      assert.match(block!, /действий=74/);
      assert.match(block!, /токены=191000/);
      assert.match(block!, /- \*\*Гипотеза\/зачем:\*\* _\(заполнить\)_/);
      assert.match(block!, /- \*\*Итог:\*\* _\(заполнить\)_/);
      assert.match(block!, /- \*\*Сырые данные:\*\* `ai\/flow-eval\/results\/2026-09-08-x`/);
      assert.doesNotMatch(block!, /\/Users\//, 'never an absolute home-directory path (SO-5)');
      const written = await readFile(logPath, 'utf8');
      assert.match(written, /existing content/, 'append-only: prior content is preserved');
      assert.match(written, /## 2026-09-08 — `fibonacci-library`/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('two runs append two separate blocks, in order, never overwriting the first', async () => {
    const root = tempDir();
    const logPath = join(root, 'EXPERIMENTS-LOG.md');
    writeFileSync(logPath, '# log\n');
    try {
      await appendExperimentLogStub(
        logPath,
        fakeSummary({ actions: 74 }),
        'ai/flow-eval/results/1'
      );
      await appendExperimentLogStub(
        logPath,
        fakeSummary({ actions: 90 }),
        'ai/flow-eval/results/2'
      );
      const written = await readFile(logPath, 'utf8');
      const firstIndex = written.indexOf('действий=74');
      const secondIndex = written.indexOf('действий=90');
      assert.ok(
        firstIndex >= 0 && secondIndex > firstIndex,
        'both entries present, in append order'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns undefined (never throws) when the log file does not exist', async () => {
    const missing = join(tmpdir(), 'does-not-exist-experiments-log.md');
    assert.equal(
      await appendExperimentLogStub(missing, fakeSummary(), 'ai/flow-eval/results/x'),
      undefined
    );
  });
});

describe('GAP-E-6/SO-5: relativeResultDir (never leak the operator home-directory path)', () => {
  it('turns an absolute result dir into a path relative to gennadyRoot', () => {
    assert.equal(
      relativeResultDir(
        '/Users/alice/dev/gennady',
        '/Users/alice/dev/gennady/ai/flow-eval/results/2026-09-08-fibonacci-library'
      ),
      'ai/flow-eval/results/2026-09-08-fibonacci-library'
    );
  });

  it('matches what cli.ts actually does end to end: persistDurableResult + relativize', async () => {
    const root = tempDir();
    try {
      const dir = await persistDurableResult(join(root, 'ai/flow-eval/results'), fakeSummary());
      const forLog = relativeResultDir(root, dir);
      assert.equal(forLog, 'ai/flow-eval/results/2026-09-08-fibonacci-library');
      assert.doesNotMatch(forLog, /^\//, 'never absolute');
      assert.doesNotMatch(forLog, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
