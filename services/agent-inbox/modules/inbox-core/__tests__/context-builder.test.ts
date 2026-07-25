// @file: Tests for context-builder — mrShape statanalysis (D-123) + track-scoped Context-section
//   injection (AI-40/D-119). Pure computeMrShape scenarios use hand-built changeset/diffText
//   fixtures; buildTrackContext scenarios need a real git worktree (no injection seam exists for
//   git itself — worktreePath IS the seam, so tests build real temp repos, per AX_MOCK_AS_LAST_RESORT).
// @consumers: node:test runner
// @tasks: TSK-134

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeMrShape, buildTrackContext } from '../context-builder.ts';

// #region START_GIT_FIXTURE_HELPERS — real git repo builder for buildTrackContext scenarios;
// mirrors the makeGitRepo/commitAll convention already used by inbox-review-plan.test.ts.

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'context-builder-'));
  execFileSync('git', ['-C', dir, 'init'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
  return dir;
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
}

function commitAll(dir: string, message: string): void {
  execFileSync('git', ['-C', dir, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'commit', '-m', message], { stdio: 'ignore' });
}

// #endregion END_GIT_FIXTURE_HELPERS

describe('computeMrShape', () => {
  it('computeMrShape rejects invalid changeset', () => {
    // contract: valid input returns exactly the 6 documented boolean fields; invalid
    // (non-array `files`) is a typed error, never a silently-undefined flag.
    const shape = computeMrShape(
      { files: [{ path: 'a.ts', status: 'M', plus: 1, minus: 0 }] },
      '+export const a = 1;\n'
    );
    assert.deepStrictEqual(
      Object.keys(shape).sort(),
      [
        'depManifest',
        'filterMapChain',
        'isTiny',
        'newSymbols',
        'nestedLoops',
        'securityHits',
      ].sort()
    );
    for (const value of Object.values(shape)) assert.strictEqual(typeof value, 'boolean');

    assert.throws(
      () => computeMrShape(null as unknown as { files: [] }, ''),
      /changeset\.files must be an array/
    );
    assert.throws(
      () => computeMrShape({ files: 'nope' } as unknown as { files: [] }, ''),
      /changeset\.files must be an array/
    );
  });

  it('newSymbols true on new export', () => {
    const diffText = '+export const newThing = 1;\n';
    const shape = computeMrShape(
      { files: [{ path: 'a.ts', status: 'M', plus: 1, minus: 0 }] },
      diffText
    );
    assert.strictEqual(shape.newSymbols, true);
  });

  it('isTiny true on single-line diff', () => {
    const shape = computeMrShape(
      { files: [{ path: 'a.ts', status: 'M', plus: 1, minus: 0 }] },
      '+x\n'
    );
    assert.strictEqual(shape.isTiny, true);
  });

  it('filterMapChain true on chain', () => {
    const diffText = '+const y = arr.filter(x => x > 0).map(x => x * 2);\n';
    const shape = computeMrShape(
      { files: [{ path: 'a.ts', status: 'M', plus: 1, minus: 0 }] },
      diffText
    );
    assert.strictEqual(shape.filterMapChain, true);
  });

  it('nestedLoops true on nested for', () => {
    const diffText = '+for (const i of a) {\n+  for (const j of b) {\n+    x();\n+  }\n+}\n';
    const shape = computeMrShape(
      { files: [{ path: 'a.ts', status: 'M', plus: 5, minus: 0 }] },
      diffText
    );
    assert.strictEqual(shape.nestedLoops, true);
  });

  it('securityHits and depManifest are depth modulators not selectors', () => {
    // non-goal: this test does not exercise track selection — that lens is unconditional
    // (NFC-SV-09), the modulators are consumed by TSK-113/inbox-roles, not by this ticket.
    const diffText = '+const secret = "abcd1234appsecret";\n';
    const changeset = { files: [{ path: 'package.json', status: 'M', plus: 1, minus: 0 }] };
    const shape = computeMrShape(changeset, diffText);
    assert.strictEqual(shape.depManifest, true);
    assert.strictEqual(shape.securityHits, true);
  });

  it('computeMrShape does not throw on binary or mode-only diff', () => {
    const diffText = [
      'diff --git a/image.png b/image.png',
      'index abc123..def456 100644',
      'Binary files a/image.png and b/image.png differ',
      'diff --git a/run.sh b/run.sh',
      'old mode 100644',
      'new mode 100755',
    ].join('\n');
    const changeset = {
      files: [
        { path: 'image.png', status: 'M', plus: 0, minus: 0 },
        { path: 'run.sh', status: 'M', plus: 0, minus: 0 },
      ],
    };

    let shape: ReturnType<typeof computeMrShape> | undefined;
    assert.doesNotThrow(() => {
      shape = computeMrShape(changeset, diffText);
    });
    for (const value of Object.values(shape!)) assert.strictEqual(typeof value, 'boolean');
  });
});

describe('buildTrackContext', () => {
  it('buildTrackContext bounds hunks to track files', async () => {
    const repo = makeGitRepo();
    try {
      writeFiles(repo, {
        'A.ts': 'export const a = 1;\n',
        'B.ts': 'export const b = 1;\n',
        'C.ts': 'export const c = 1;\n',
      });
      commitAll(repo, 'base');
      writeFiles(repo, {
        'A.ts': 'export const a = 2;\n',
        'B.ts': 'export const b = 2;\n',
        'C.ts': 'export const c = 2;\n',
      });
      commitAll(repo, 'change');

      // Caller-driven scoping (per buildTrackContext's invariant): logic track sees only
      // its own files, C.ts (another track's file) is excluded from this changeset.
      const scoped = {
        files: [
          { path: 'A.ts', status: 'M', plus: 1, minus: 1 },
          { path: 'B.ts', status: 'M', plus: 1, minus: 1 },
        ],
      };

      const { markdown } = await buildTrackContext('logic', scoped, 'HEAD~1', repo);
      assert.match(markdown, /### `A\.ts`/);
      assert.match(markdown, /### `B\.ts`/);
      assert.ok(!/### `C\.ts`/.test(markdown), 'C.ts must not appear — outside the track');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('buildTrackContext security gets full changeset', async () => {
    const repo = makeGitRepo();
    try {
      writeFiles(repo, {
        'A.ts': 'export const a = 1;\n',
        'B.ts': 'export const b = 1;\n',
        'C.ts': 'export const c = 1;\n',
      });
      commitAll(repo, 'base');
      writeFiles(repo, {
        'A.ts': 'export const a = 2;\n',
        'B.ts': 'export const b = 2;\n',
        'C.ts': 'export const c = 2;\n',
      });
      commitAll(repo, 'change');

      const fullChangeset = {
        files: [
          { path: 'A.ts', status: 'M', plus: 1, minus: 1 },
          { path: 'B.ts', status: 'M', plus: 1, minus: 1 },
          { path: 'C.ts', status: 'M', plus: 1, minus: 1 },
        ],
      };

      const { markdown } = await buildTrackContext('security', fullChangeset, 'HEAD~1', repo);
      assert.match(markdown, /### `A\.ts`/);
      assert.match(markdown, /### `B\.ts`/);
      assert.match(markdown, /### `C\.ts`/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('buildTrackContext marks attention on newSymbols', async () => {
    const repo = makeGitRepo();
    try {
      writeFiles(repo, { 'a.ts': '// filler\n' });
      commitAll(repo, 'base');
      writeFiles(repo, { 'a.ts': '// filler\nexport function bar() {}\n' });
      commitAll(repo, 'change');

      const changeset = { files: [{ path: 'a.ts', status: 'M', plus: 1, minus: 0 }] };
      const { markdown } = await buildTrackContext('logic', changeset, 'HEAD~1', repo);

      assert.match(markdown, /Разметка внимания/);
      assert.match(markdown, /Новый экспортируемый символ `bar`/);
      assert.match(markdown, /AI-44/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('buildTrackContext returns injectedEntities matching markdown', async () => {
    const repo = makeGitRepo();
    try {
      const filler = Array.from({ length: 11 }, (_, i) => `// line${i + 1}`).join('\n') + '\n';
      writeFiles(repo, {
        'A.ts': filler,
        'B.ts': 'const internal = 1;\nconsole.log(internal);\n',
      });
      commitAll(repo, 'base');
      writeFiles(repo, {
        'A.ts': filler + 'export function foo() {}\n',
        'B.ts': 'const internal = 2;\nconsole.log(internal);\n',
      });
      commitAll(repo, 'change');

      const changeset = {
        files: [
          { path: 'A.ts', status: 'M', plus: 1, minus: 0 },
          { path: 'B.ts', status: 'M', plus: 1, minus: 1 },
        ],
      };

      const { markdown, injectedEntities } = await buildTrackContext(
        'logic',
        changeset,
        'HEAD~1',
        repo
      );

      // observation focus: injectedEntities is a structured mirror of markdown, not an
      // independent recomputation — every entry must correspond to something markdown mentions.
      const aEntry = injectedEntities.find((e) => e.file === 'A.ts');
      const bEntry = injectedEntities.find((e) => e.file === 'B.ts');

      assert.deepStrictEqual(aEntry, { file: 'A.ts', line: 12, symbol: 'foo' });
      assert.deepStrictEqual(bEntry, { file: 'B.ts' });
      assert.match(markdown, /### `A\.ts`/);
      assert.match(markdown, /### `B\.ts`/);
      assert.match(markdown, /foo/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('buildTrackContext security track adds attention line on securityHits or depManifest', async () => {
    const repo = makeGitRepo();
    try {
      writeFiles(repo, { 'package.json': '{}\n', 'plain.ts': 'const a = 1;\n' });
      commitAll(repo, 'base');
      writeFiles(repo, { 'package.json': '{"x":1}\n', 'plain.ts': 'const a = 2;\n' });
      commitAll(repo, 'change');

      const fullChangeset = {
        files: [
          { path: 'package.json', status: 'M', plus: 1, minus: 1 },
          { path: 'plain.ts', status: 'M', plus: 1, minus: 1 },
        ],
      };
      const plainOnlyChangeset = { files: [{ path: 'plain.ts', status: 'M', plus: 1, minus: 1 }] };

      const withDepManifest = await buildTrackContext('security', fullChangeset, 'HEAD~1', repo);
      assert.match(withDepManifest.markdown, /Повышенный приоритет/);

      const withoutModulators = await buildTrackContext(
        'security',
        plainOnlyChangeset,
        'HEAD~1',
        repo
      );
      assert.ok(
        !/Повышенный приоритет/.test(withoutModulators.markdown),
        'no depManifest/securityHits → no depth-modulation attention line'
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
