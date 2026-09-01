// @file: Integration tests for SddSessionCommand#run — open idempotency, gitignore, set/log/workset/close, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

const TARGET_A = 'a'.repeat(64);
const TARGET_B = 'b'.repeat(64);

function feasibilityEvent(
  seq: number,
  event: string,
  payload: Record<string, unknown>,
  cycle = 'draft60-regression'
): string {
  return JSON.stringify({
    schema: 'sdd-scaffold-feasibility/v1',
    cycle,
    seq,
    event,
    payload,
  });
}

async function submitFeasibility(payload: string) {
  const relative = '.claude/tmp/sdd-scaffold-feasibility-event.json';
  writeFileSync(join(dir, relative), payload, 'utf-8');
  return mod.run(argv('feasibility', '--content-file', relative), CLOCK);
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
    assert.ok(existsSync(join(dir, '.claude', 'tmp')));
  });

  it('open fails closed when .claude is a symlink instead of creating a payload boundary through it', async () => {
    const target = join(dir, 'elsewhere');
    mkdirSync(target);
    symlinkSync(target, join(dir, '.claude'));
    const outcome = await mod.run(argv('open', '--intent', 'scope'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.strictEqual(outcome.exitCode, 1);
    assert.strictEqual(existsSync(sessionPath()), false);
    assert.strictEqual(existsSync(join(target, 'tmp')), false);
  });

  it('open rejects a symlinked specs directory and leaves the external victim untouched', async () => {
    const victim = mkdtempSync(join(tmpdir(), 'sdd-session-victim-'));
    try {
      writeFileSync(join(victim, '.sdd-session.md'), 'victim\n', 'utf-8');
      symlinkSync(victim, join(dir, 'specs'));
      const outcome = await mod.run(argv('open', '--intent', 'scope'), CLOCK);
      assert.strictEqual(outcome.ok, false);
      assert.strictEqual(readFileSync(join(victim, '.sdd-session.md'), 'utf-8'), 'victim\n');
    } finally {
      rmSync(victim, { recursive: true, force: true });
    }
  });

  it('open rejects a symlinked session file and never follows it outside the repository', async () => {
    const victim = join(dir, 'victim.md');
    mkdirSync(join(dir, 'specs'));
    writeFileSync(victim, 'victim\n', 'utf-8');
    symlinkSync(victim, sessionPath());
    const outcome = await mod.run(argv('open', '--intent', 'scope'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(readFileSync(victim, 'utf-8'), 'victim\n');
  });

  it('open carries a next: hint pointing at workset/log/term', async () => {
    const o = await mod.run(argv('open', '--intent', 'evolve-scope'), CLOCK);
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /next:/);
      assert.match(o.text, /sdd-session workset/);
      assert.match(o.text, /sdd-session log/);
      assert.match(o.text, /sdd-session term/);
    }
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

  it('open rejects a bare backticked placeholder but accepts angle brackets inside longer code', async () => {
    const rejected = await mod.run(argv('open', '--intent', '`<intent>`'), CLOCK);
    assert.strictEqual(rejected.ok, false);
    if (!rejected.ok) assert.strictEqual(rejected.exitCode, 2);

    const accepted = await mod.run(argv('open', '--intent', '`Promise<TodoStore>`'), CLOCK);
    assert.strictEqual(accepted.ok, true);
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

    it('set and close reject a session retargeted to an external symlink without touching the victim', async () => {
      const victim = join(dir, 'session-victim.md');
      writeFileSync(victim, 'victim\n', 'utf-8');
      rmSync(sessionPath());
      symlinkSync(victim, sessionPath());

      const set = await mod.run(argv('set', 'intent', 'mutate-victim'), CLOCK);
      const close = await mod.run(argv('close'), CLOCK);
      assert.strictEqual(set.ok, false);
      assert.strictEqual(close.ok, false);
      assert.strictEqual(readFileSync(victim, 'utf-8'), 'victim\n');
      assert.strictEqual(existsSync(sessionPath()), true);
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

    it('log accepts a complete inline-code path containing placeholder-shaped segments', async () => {
      const o = await mod.run(argv('log', 'loaded `steps/<step-id>.xml`'), CLOCK);
      assert.strictEqual(o.ok, true);
    });

    it('log/workset need content (exit 4)', async () => {
      const o = await mod.run(argv('log'), CLOCK);
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 4);
    });

    it('file-backed log preserves shell syntax/newline literally, executes nothing, and consumes exact file', async () => {
      mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
      const payloadPath = join(dir, '.claude', 'tmp', 'journal.txt');
      const pwnedPath = join(dir, '.claude', 'tmp', 'PWNED');
      const payload = 'quote "x" $(touch .claude/tmp/PWNED) `touch .claude/tmp/PWNED`\nsecond';
      writeFileSync(payloadPath, payload, 'utf-8');
      const outcome = await mod.run(
        argv('log', '--content-file', '.claude/tmp/journal.txt'),
        CLOCK
      );
      assert.strictEqual(outcome.ok, true);
      assert.ok(readFileSync(sessionPath(), 'utf-8').includes(payload));
      assert.strictEqual(existsSync(pwnedPath), false);
      assert.strictEqual(existsSync(payloadPath), false);
    });

    it('file-backed set/workset/term use the same one-shot contract', async () => {
      mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
      const cases = [
        ['set', 'open', 'operator says "continue"', 'open: operator says "continue"'],
        ['workset', '', 'specs/a b.md — open', 'specs/a b.md — open'],
        ['term', '', 'скоуп — scope with `$()` literal', 'скоуп — scope with `$()` literal'],
      ] as const;
      for (const [mode, field, payload, expected] of cases) {
        const rel = `.claude/tmp/${mode}.txt`;
        writeFileSync(join(dir, rel), payload, 'utf-8');
        const outcome = await mod.run(
          argv(mode, ...(field ? [field] : []), '--content-file', rel),
          CLOCK
        );
        assert.strictEqual(outcome.ok, true);
        assert.ok(readFileSync(sessionPath(), 'utf-8').includes(expected));
        assert.strictEqual(existsSync(join(dir, rel)), false);
      }
    });

    it('file-backed workset appends every non-empty line as one exact bullet in one call', async () => {
      mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
      const rel = '.claude/tmp/scaffold-workset.txt';
      writeFileSync(
        join(dir, rel),
        [
          'specs/app/app.spec.md — scaffold target — open',
          'specs/app/ui/ui.spec.md — scaffold target — open',
          'specs/shared/contracts.spec.md — dependency context — open',
        ].join('\n'),
        'utf-8'
      );
      const outcome = await mod.run(argv('workset', '--content-file', rel), CLOCK);
      assert.strictEqual(outcome.ok, true);
      const session = readFileSync(sessionPath(), 'utf-8');
      assert.match(session, /  - specs\/app\/app\.spec\.md — scaffold target — open/);
      assert.match(session, /  - specs\/app\/ui\/ui\.spec\.md — scaffold target — open/);
      assert.match(session, /  - specs\/shared\/contracts\.spec\.md — dependency context — open/);
    });

    it('records the draft.60 three-result lifecycle without losing worker identity', async () => {
      const targetsA = { 'specs/app/app.task.TA-a.md': TARGET_A };
      const targetsB = { 'specs/app/app.task.TA-a.md': TARGET_B };
      const events = [
        feasibilityEvent(1, 'opened', {
          targets: targetsA,
          fallbackUsed: false,
          resultCount: 0,
          activeCap: 5,
        }),
        feasibilityEvent(2, 'worker-state', {
          availability: 'alive',
          workerSession: 'critic-session-60',
          fallbackUsed: false,
        }),
        feasibilityEvent(3, 'sensor-result', {
          resultCount: 1,
          verdict: 'CHANGES',
          changes: ['repair first ticket set'],
          targets: targetsA,
        }),
        feasibilityEvent(4, 'target-refreshed', {
          targets: targetsB,
          changedTickets: ['specs/app/app.task.TA-a.md'],
        }),
        feasibilityEvent(5, 'sensor-result', {
          resultCount: 2,
          verdict: 'CHANGES',
          changes: ['repair second ticket set'],
          targets: targetsB,
        }),
        feasibilityEvent(6, 'target-refreshed', {
          targets: targetsA,
          changedTickets: ['specs/app/app.task.TA-a.md'],
        }),
        feasibilityEvent(7, 'sensor-result', {
          resultCount: 3,
          verdict: 'CLEAN',
          changes: [],
          targets: targetsA,
        }),
        feasibilityEvent(8, 'gate2-choice', {
          choices: ['approved test plan'],
          changedTickets: [],
        }),
        feasibilityEvent(9, 'closed', {}),
      ];
      const outcomes = [];
      for (const event of events) outcomes.push(await submitFeasibility(event));

      assert.ok(outcomes.every((outcome) => outcome.ok));
      const final = outcomes.at(-1);
      if (final?.ok) {
        assert.match(final.text, /^\[sdd-session\] feasibility event accepted/m);
        assert.match(
          final.text,
          /NEXT=CLOSE_SESSION.+resultCount=3.+workerSession=critic-session-60/
        );
      }
      const session = readFileSync(sessionPath(), 'utf-8');
      assert.strictEqual(session.match(/"event":"sensor-result"/g)?.length, 3);
      assert.match(session, /"workerSession":"critic-session-60"/);
      assert.match(session, /"resultCount":1/);
      assert.match(session, /"resultCount":2/);
      assert.match(session, /"resultCount":3/);
    });

    it('rejects a direct result #3 or omitted worker-state without mutating the session', async () => {
      const targets = { 'specs/app/app.task.TA-a.md': TARGET_A };
      const opened = await submitFeasibility(
        feasibilityEvent(1, 'opened', {
          targets,
          fallbackUsed: false,
          resultCount: 0,
          activeCap: 5,
        })
      );
      assert.strictEqual(opened.ok, true);
      const afterOpened = readFileSync(sessionPath(), 'utf-8');
      const missingWorker = await submitFeasibility(
        feasibilityEvent(2, 'sensor-result', {
          resultCount: 1,
          verdict: 'CHANGES',
          changes: ['x'],
          targets,
        })
      );
      assert.strictEqual(missingWorker.ok, false);
      assert.strictEqual(readFileSync(sessionPath(), 'utf-8'), afterOpened);

      const worker = await submitFeasibility(
        feasibilityEvent(2, 'worker-state', {
          availability: 'alive',
          workerSession: 'critic-session-60',
          fallbackUsed: false,
        })
      );
      assert.strictEqual(worker.ok, true);
      const beforeJump = readFileSync(sessionPath(), 'utf-8');
      const jump = await submitFeasibility(
        feasibilityEvent(3, 'sensor-result', {
          resultCount: 3,
          verdict: 'CLEAN',
          changes: [],
          targets,
        })
      );
      assert.strictEqual(jump.ok, false);
      if (!jump.ok) assert.match(jump.message, /resultCount must be 1/);
      assert.strictEqual(readFileSync(sessionPath(), 'utf-8'), beforeJump);
      assert.ok(existsSync(join(dir, '.claude/tmp/sdd-scaffold-feasibility-event.json')));
    });

    it('rejects outside/symlink/oversize payloads and unknown/repeated flags without session mutation', async () => {
      mkdirSync(join(dir, '.claude', 'tmp'), { recursive: true });
      const before = readFileSync(sessionPath(), 'utf-8');
      writeFileSync(join(dir, 'outside.txt'), 'outside', 'utf-8');
      writeFileSync(join(dir, '.claude', 'tmp', 'target.txt'), 'target', 'utf-8');
      symlinkSync('target.txt', join(dir, '.claude', 'tmp', 'link.txt'));
      writeFileSync(join(dir, '.claude', 'tmp', 'large.txt'), 'x'.repeat(32 * 1024 + 1));
      writeFileSync(join(dir, '.claude', 'tmp', 'valid.txt'), 'valid', 'utf-8');

      const outcomes = [
        await mod.run(argv('log', '--content-file', 'outside.txt'), CLOCK),
        await mod.run(argv('log', '--content-file', '.claude/tmp/link.txt'), CLOCK),
        await mod.run(argv('log', '--content-file', '.claude/tmp/large.txt'), CLOCK),
        await mod.run(argv('log', '--bogus', 'x'), CLOCK),
        await mod.run(
          argv(
            'log',
            '--content-file',
            '.claude/tmp/valid.txt',
            '--content-file',
            '.claude/tmp/valid.txt'
          ),
          CLOCK
        ),
      ];
      assert.ok(outcomes.every((outcome) => !outcome.ok));
      assert.strictEqual(readFileSync(sessionPath(), 'utf-8'), before);
      assert.ok(existsSync(join(dir, '.claude', 'tmp', 'valid.txt')));
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

    it('close carries a next: hint about the Decision Log', async () => {
      const o = await mod.run(argv('close'), CLOCK);
      assert.strictEqual(o.ok, true);
      if (o.ok) {
        assert.match(o.text, /next:/);
        assert.match(o.text, /Decision Log/);
      }
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
