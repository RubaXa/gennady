// @file: Integration tests for SddSessionCommand#run — open idempotency, gitignore, set/log/workset/close, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type SessionModule = typeof import('../sdd-session.cmd.ts');

let mod: SessionModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origCwd: string;
let dir: string;

const CLOCK = new Date('2026-06-21T10:00:00.000Z');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-session', ...rest];
}

function sessionPath(): string {
  return join(dir, 'specs', '.sdd-session.md');
}

describe('SddSessionCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origCwd = process.cwd();
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-session'];
    mod = await import('../sdd-session.cmd.ts');
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-session-'));
    process.chdir(dir);
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    process.chdir(origCwd);
  });

  it('open creates specs/ and the skeleton file', async () => {
    const o = await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    assert.strictEqual(o.ok, true);
    assert.ok(existsSync(sessionPath()));
    const body = readFileSync(sessionPath(), 'utf-8');
    assert.match(body, /^# SDD session — 2026-06-21/);
    assert.match(body, /intent: evolve-scope/);
    assert.match(body, /scale: —/);
    assert.match(body, /^working set:$/m);
    assert.match(body, /^glossary:$/m);
    assert.match(body, /^journal:$/m);
    assert.match(body, /open: —/);
  });

  it('open accepts --scale', async () => {
    await mod.run(argv('open', '--intent', 'evolve-scope', '--scale', 'module'), CLOCK);
    const body = readFileSync(sessionPath(), 'utf-8');
    assert.match(body, /scale: module/);
  });

  it('open is idempotent — a second open does not overwrite', async () => {
    await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    writeFileSync(
      sessionPath(),
      readFileSync(sessionPath(), 'utf-8') + '  - custom edit\n',
      'utf-8'
    );
    const before = readFileSync(sessionPath(), 'utf-8');
    const o = await mod.run(argv('open', '--intent', 'project-setup'), CLOCK);
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /already open/);
    assert.strictEqual(readFileSync(sessionPath(), 'utf-8'), before);
  });

  it('open ensures .sdd-session.md is git-ignored, creating .gitignore if absent', async () => {
    await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.match(gi, /^\.sdd-session\.md$/m);
  });

  it('open appends the gitignore line without duplicating an existing one', async () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n.sdd-session.md\n', 'utf-8');
    await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.strictEqual(gi.match(/\.sdd-session\.md/g)?.length, 1);
  });

  it('open rejects a placeholder in --intent (exit 2)', async () => {
    const o = await mod.run(argv('open', '--intent', '<intent>'), CLOCK);
    assert.strictEqual(o.ok, false);
    if (!o.ok) assert.strictEqual(o.exitCode, 2);
    assert.ok(!existsSync(sessionPath()));
  });

  it('open exits 4 with no --intent', async () => {
    const o = await mod.run(argv('open'), CLOCK);
    assert.strictEqual(o.ok, false);
    if (!o.ok) assert.strictEqual(o.exitCode, 4);
  });

  describe('with an open session', () => {
    beforeEach(async () => {
      await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    });

    it('set intent replaces the field', async () => {
      const o = await mod.run(argv('set', 'intent', 'project-setup'), CLOCK);
      assert.strictEqual(o.ok, true);
      assert.match(readFileSync(sessionPath(), 'utf-8'), /^intent: project-setup$/m);
    });

    it('set scale replaces the field', async () => {
      await mod.run(argv('set', 'scale', 'library'), CLOCK);
      assert.match(readFileSync(sessionPath(), 'utf-8'), /^scale: library$/m);
    });

    it('set open replaces the field', async () => {
      await mod.run(argv('set', 'open', 'need operator decision on X'), CLOCK);
      assert.match(readFileSync(sessionPath(), 'utf-8'), /^open: need operator decision on X$/m);
    });

    it('set rejects an unknown field (exit 4)', async () => {
      const o = await mod.run(argv('set', 'bogus', 'x'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 4);
    });

    it('set rejects a placeholder value (exit 2)', async () => {
      const o = await mod.run(argv('set', 'intent', '<intent>'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 2);
    });

    it('log appends a bullet under journal:, not working set:', async () => {
      await mod.run(argv('log', 'loaded sdd-scope directive → produced spec draft'), CLOCK);
      const body = readFileSync(sessionPath(), 'utf-8');
      assert.match(body, /journal:\n {2}- loaded sdd-scope directive → produced spec draft\nopen:/);
    });

    it('workset appends a bullet under working set:, not journal:', async () => {
      await mod.run(argv('workset', 'specs/web/web.spec.md — add auth — open'), CLOCK);
      const body = readFileSync(sessionPath(), 'utf-8');
      assert.match(
        body,
        /working set:\n {2}- specs\/web\/web\.spec\.md — add auth — open\nglossary:\njournal:/
      );
    });

    it('log/workset reject a placeholder (exit 2)', async () => {
      const o = await mod.run(argv('log', 'step → <output>'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 2);
    });

    it('log/workset need content (exit 4)', async () => {
      const o = await mod.run(argv('log'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 4);
    });

    it('term appends a glossary entry between working set: and journal:', async () => {
      await mod.run(argv('term', 'скоуп — единица декомпозиции спек'), CLOCK);
      const body = readFileSync(sessionPath(), 'utf-8');
      assert.match(
        body,
        /working set:\nglossary:\n {2}- скоуп — единица декомпозиции спек\njournal:/
      );
    });

    it('term appends a second entry after the first, still before journal:', async () => {
      await mod.run(argv('term', 'скоуп — единица декомпозиции спек'), CLOCK);
      await mod.run(argv('term', 'тикет — единица исполнения'), CLOCK);
      const body = readFileSync(sessionPath(), 'utf-8');
      assert.match(
        body,
        /glossary:\n {2}- скоуп — единица декомпозиции спек\n {2}- тикет — единица исполнения\njournal:/
      );
    });

    it('term replaces the line for a duplicate term instead of appending a second one', async () => {
      await mod.run(argv('term', 'скоуп — единица декомпозиции спек'), CLOCK);
      await mod.run(argv('term', 'тикет — единица исполнения'), CLOCK);
      await mod.run(argv('term', 'скоуп — top-level unit of decomposition'), CLOCK);
      const body = readFileSync(sessionPath(), 'utf-8');
      const glossaryLines = body.match(/^ {2}- .+$/gm) ?? [];
      assert.strictEqual(glossaryLines.filter((l) => l.includes('скоуп')).length, 1);
      assert.match(body, /- скоуп — top-level unit of decomposition/);
      assert.ok(!body.includes('единица декомпозиции спек'));
      assert.match(body, /- тикет — единица исполнения/);
    });

    it('term rejects a payload missing the " — " separator (exit 4)', async () => {
      const o = await mod.run(argv('term', 'скоуп без разделителя'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 4);
    });

    it('term rejects a placeholder value (exit 2)', async () => {
      const o = await mod.run(argv('term', '<term> — <phrasing>'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 2);
    });

    it('term needs content (exit 4)', async () => {
      const o = await mod.run(argv('term'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 4);
    });

    it('close deletes the session file', async () => {
      const o = await mod.run(argv('close'), CLOCK);
      assert.strictEqual(o.ok, true);
      assert.ok(!existsSync(sessionPath()));
    });
  });

  it('term creates the glossary: section (at the right spot) in a session file that predates it', async () => {
    await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    // Simulate an old-format session file: no glossary: section.
    const oldBody = readFileSync(sessionPath(), 'utf-8').replace(/^glossary:\n/m, '');
    writeFileSync(sessionPath(), oldBody, 'utf-8');
    assert.ok(!oldBody.includes('glossary:'));

    const o = await mod.run(argv('term', 'скоуп — единица декомпозиции спек'), CLOCK);
    assert.strictEqual(o.ok, true);
    const body = readFileSync(sessionPath(), 'utf-8');
    assert.match(
      body,
      /working set:\nglossary:\n {2}- скоуп — единица декомпозиции спек\njournal:/
    );
  });

  it('set/log/workset/close exit 2 when there is no open session', async () => {
    const set = await mod.run(argv('set', 'intent', 'x'), CLOCK);
    assert.strictEqual(set.ok, false);
    if (!set.ok) assert.strictEqual(set.exitCode, 2);

    const log = await mod.run(argv('log', 'x'), CLOCK);
    assert.strictEqual(log.ok, false);
    if (!log.ok) assert.strictEqual(log.exitCode, 2);

    const workset = await mod.run(argv('workset', 'x'), CLOCK);
    assert.strictEqual(workset.ok, false);
    if (!workset.ok) assert.strictEqual(workset.exitCode, 2);

    const term = await mod.run(argv('term', 'x — y'), CLOCK);
    assert.strictEqual(term.ok, false);
    if (!term.ok) assert.strictEqual(term.exitCode, 2);

    const close = await mod.run(argv('close'), CLOCK);
    assert.strictEqual(close.ok, false);
    if (!close.ok) assert.strictEqual(close.exitCode, 2);
  });

  it('exits 4 on an unknown mode', async () => {
    const o = await mod.run(argv('frobnicate'), CLOCK);
    assert.strictEqual(o.ok, false);
    if (!o.ok) assert.strictEqual(o.exitCode, 4);
  });
});
