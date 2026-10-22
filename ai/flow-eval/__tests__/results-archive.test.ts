// @file: Contract for the durable per-scenario result archive (GAP-E-6, D-62) — summary.json/judge.md
//   always written under a real, never-gitignored directory (not the transient .results/), one
//   directory per (date, scenarioId), disambiguated with a -N suffix on a same-day re-run.
// @spec: AI-SKILLS
// @consumers: ai/flow-eval/results-archive.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
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
  resolveExperimentSource,
  type SddEvalDurableSummary,
} from '../results-archive.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'results-archive-'));
}

it('binds experiments to tracked, untracked, scenario and configuration inputs without following aliases', async () => {
  const root = tempDir();
  const external = tempDir();
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
  try {
    git('init');
    writeFileSync(join(root, 'source.ts'), 'initial');
    writeFileSync(join(root, 'scenario.json'), '[]');
    git('add', '.');
    git(
      '-c',
      'user.name=Eval Test',
      '-c',
      'user.email=eval@example.test',
      'commit',
      '-m',
      'fixture'
    );
    const capture = (config = { model: 'fixed' }) =>
      resolveExperimentSource(root, join(root, 'scenario.json'), config);
    const clean = await capture();
    assert.equal(clean.dirty, false);
    writeFileSync(join(root, 'source.ts'), 'modified');
    const tracked = await capture();
    assert.notEqual(tracked.worktreeSha256, clean.worktreeSha256);
    writeFileSync(join(root, 'new.ts'), 'new source');
    const untracked = await capture();
    assert.notEqual(untracked.worktreeSha256, tracked.worktreeSha256);
    symlinkSync(join(external, 'missing-secret'), join(root, 'alias'));
    const link = await capture();
    assert.notEqual(link.worktreeSha256, untracked.worktreeSha256);
    writeFileSync(join(external, 'missing-secret'), 'never read this');
    assert.equal((await capture()).worktreeSha256, link.worktreeSha256);
    assert.notEqual((await capture({ model: 'other' })).configSha256, link.configSha256);
    writeFileSync(join(root, 'scenario.json'), '[{}]');
    assert.notEqual((await capture()).scenarioSha256, clean.scenarioSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

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
  it('atomically reserves eight concurrent same-scenario results without mixing or overwriting evidence', async () => {
    const root = tempDir();
    const results = join(root, 'permanent');
    try {
      const writers = Array.from({ length: 8 }, (_, index) => {
        const source = join(root, 'source', String(index));
        mkdirSync(join(source, 'specs/app'), { recursive: true });
        const judgeFile = join(source, 'judge.md');
        const trajectoryFile = join(source, 'trajectory.json');
        const specFile = join(source, 'specs/app/app.spec.md');
        const spec = `# Writer ${index}\r\n`;
        writeFileSync(judgeFile, `judge:${index}\n`);
        writeFileSync(trajectoryFile, JSON.stringify({ writer: index }));
        writeFileSync(specFile, spec);
        return { index, source, judgeFile, trajectoryFile, specFile, spec };
      });
      const directories = await Promise.all(
        writers.map(({ index, source, judgeFile, trajectoryFile, specFile }) =>
          persistDurableResult(results, fakeSummary({ actions: index }), {
            judgeFile,
            trajectoryFile,
            specs: { root: source, files: [specFile] },
          })
        )
      );
      assert.equal(
        new Set(directories).size,
        8,
        'each writer must own an atomic directory reservation'
      );
      assert.equal((await readAllDurableSummaries(results)).length, 8);
      for (const [index, directory] of directories.entries()) {
        assert.equal(
          JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8')).actions,
          index
        );
        assert.equal(await readFile(join(directory, 'judge.md'), 'utf8'), `judge:${index}\n`);
        assert.equal(
          JSON.parse(await readFile(join(directory, 'trajectory.json'), 'utf8')).writer,
          index
        );
        assert.equal(
          await readFile(join(directory, 'specs/app/app.spec.md'), 'utf8'),
          writers[index].spec
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves incomplete reservations and propagates filesystem errors instead of retrying them', async () => {
    const root = tempDir();
    try {
      const results = join(root, 'permanent');
      await assert.rejects(
        persistDurableResult(results, fakeSummary(), { trajectoryFile: join(root, 'missing') })
      );
      const next = await persistDurableResult(results, fakeSummary());
      assert.equal(next, join(results, '2026-09-08-fibonacci-library-2'));
      assert.equal((await readAllDurableSummaries(results)).length, 1);
      const file = join(root, 'regular-file');
      writeFileSync(file, 'preserve');
      await assert.rejects(persistDurableResult(join(file, 'results'), fakeSummary()), {
        code: 'ENOTDIR',
      });
      assert.equal(await readFile(file, 'utf8'), 'preserve');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps exact authored specs after sandbox deletion and refuses alias snapshots', async () => {
    const root = tempDir();
    const sandbox = join(root, 'sandbox');
    const file = join(sandbox, 'specs/app/app.spec.md');
    mkdirSync(join(sandbox, 'specs/app'), { recursive: true });
    const bytes = '# Authored spec\r\n\r\nPending approval\r\n';
    writeFileSync(file, bytes);
    try {
      const dir = await persistDurableResult(join(root, 'results'), fakeSummary(), {
        specs: { root: sandbox, files: [file] },
      });
      rmSync(file);
      symlinkSync(join(dir, 'specs/app/app.spec.md'), file);
      await assert.rejects(
        persistDurableResult(join(root, 'results'), fakeSummary(), {
          specs: { root: sandbox, files: [file] },
        }),
        /unsafe/
      );
      rmSync(sandbox, { recursive: true, force: true });
      assert.equal(await readFile(join(dir, 'specs/app/app.spec.md'), 'utf8'), bytes);
      assert.deepEqual(JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8')).specFiles, [
        'specs/app/app.spec.md',
      ]);
      assert.equal((await readAllDurableSummaries(join(root, 'results'))).length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('persists trajectory outside the disposable source and rejects missing required evidence', async () => {
    const root = tempDir();
    const source = join(root, 'source-trajectory.json');
    writeFileSync(source, '{"scenario":"native","events":[]}\n');
    try {
      const dir = await persistDurableResult(join(root, 'results'), fakeSummary(), {
        trajectoryFile: source,
      });
      rmSync(source);
      assert.equal(
        await readFile(join(dir, 'trajectory.json'), 'utf8'),
        '{"scenario":"native","events":[]}\n'
      );
      await assert.rejects(
        persistDurableResult(join(root, 'results'), fakeSummary(), { trajectoryFile: source })
      );
      assert.equal(
        (await readAllDurableSummaries(join(root, 'results'))).length,
        1,
        'failed evidence copy must not publish a second successful record'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
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
