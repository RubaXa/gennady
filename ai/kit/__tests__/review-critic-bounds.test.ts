// @file: Guards Пачка 20 ("Ревью и критик ограничены и читают владельца тикета"): the STEP_2⇄
//   STEP_3 review⇄reconcile cycle is bounded by AX_CAP_5 with an explicit operator disposition
//   instead of running forever (T-B6-03), and STEP_3_RECONCILE classifies each returned finding
//   ACCEPT/REJECT per AX_DEFAULT_ACCEPT — the v1 d37d5910 redaction ("uncertainty alone is NOT a
//   blocking finding"), restored after V-BATCH-20 B-2 found the axiom had instead collected v1's own
//   PRE-REFORM text ("Uncertain → ACCEPT"), the one v1 commit d6065c36 replaced because it kept the
//   loop from converging; activated in review-lifecycle (the orchestrator, where ACCEPT/REJECT are
//   defined), not in the read-only critic-protocol worker. critic-protocol separately activates
//   AX_POLISH_MODE, and review-lifecycle's STEP_2 dispatch now carries an explicit `Polish: <on|off>`
//   field (V-BATCH-20 N-2) — both existed in the axiom library (ax-default-accept.xml,
//   ax-polish-mode.xml) but were never connected to any template (40-TRACK-DIRECTIVES-SKILLS.md
//   §1.3, D3.5/D3.6).
//   Also guards ISS-10: the critic reads two sections when its target is a task ticket — the
//   project-wide conventions from `specs/3-tasks.md` and the owning tasks-index's own Decision Log,
//   by the level-qualified heading anchor each tasks-index format actually uses (project / scope /
//   module) — through sdd-extract's heading-anchor form, bounded to exactly those two documents and
//   measured (extracted line count recorded in STEP_3_REPORT), per issue #21 /
//   20-ISSUES-VERDICTS.md #21. V-BATCH-20 B-1 found the first redaction of this fix named anchors
//   (`## Conventions` / `## Decision Log`) that exist in none of the three real tasks-index formats
//   — this suite now extracts the anchors straight out of the rendered directive and proves each
//   one actually resolves, on a synthetic fixture of every format level, to real content rather than
//   an error or a one-line pointer (V-BATCH-20 N-4 adds the STEP_3_REPORT accounting-line lock).
//   Also guards T-B6-05: reconcile activates AX_DISPATCH_VIA_BATCH so a task-reopen dispatches
//   through execute as one batch, with execute remaining the sole owner of audit/code-review.
// @consumers: node:test runner
// @tasks: T-B6-03, ISS-10, T-B6-05

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OUT_ROOT } from '../render.ts';

function readDirective(name: string): string {
  return readFileSync(join(OUT_ROOT, 'sdd-v2', name), 'utf8');
}

function step(text: string, id: string): string {
  const match = new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`).exec(text);
  assert.ok(match, `${id} not found`);
  return match![1]!;
}

describe('review-lifecycle: STEP_2⇄STEP_3 is bounded by AX_CAP_5 (T-B6-03)', () => {
  const review = readDirective('review-lifecycle.directive.xml');

  it('defines AX_CAP_5 in BeliefState', () => {
    assert.match(review, /<Axiom id="AX_CAP_5">/);
  });

  it('activates AX_CAP_5 inside STEP_3_RECONCILE, counting the review⇄reconcile cycle', () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /AX_CAP_5/);
    assert.match(reconcile, /bounded, not open-ended/i);
    assert.match(reconcile, /fifth result/i);
  });

  it('names the three explicit dispositions at the cap — CLEAN / CONTINUE / RESTART', () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /`CLEAN`/);
    assert.match(reconcile, /CONTINUE THROUGH ROUND N/);
    assert.match(reconcile, /RESTART: reason/);
  });

  it("the reviewer's verdict never authorizes continuation past the cap by itself", () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /never\s+authorizes continuation past the cap/i);
  });

  it('STEP_2 dispatch carries an explicit Polish field, not just an internal default (N-2)', () => {
    const independentReview = step(review, 'STEP_2_INDEPENDENT_REVIEW');
    assert.match(independentReview, /`Polish: <on\|off>`/);
  });

  it("STEP_2's 'no bookkeeping' ban does not contradict AX_CAP_5's own round count (N-3)", () => {
    const independentReview = step(review, 'STEP_2_INDEPENDENT_REVIEW');
    assert.match(independentReview, /beyond the bare `AX_CAP_5` count STEP_3_RECONCILE keeps/i);
  });
});

describe('review-lifecycle: AX_DEFAULT_ACCEPT is activated in the orchestrator, not the worker (T-B6-03 / V-BATCH-20 B-2)', () => {
  const review = readDirective('review-lifecycle.directive.xml');
  const critic = readDirective('critic-protocol.directive.xml');

  it('review-lifecycle defines AX_DEFAULT_ACCEPT in BeliefState with the canonical v1 (post-d6065c36) text', () => {
    assert.match(review, /<Axiom id="AX_DEFAULT_ACCEPT">/);
    assert.match(review, /Uncertainty alone is NOT a blocking finding/);
    // The pre-reform text d6065c36 replaced must not have come back.
    assert.doesNotMatch(review, /Uncertain\s*→\s*ACCEPT\./);
  });

  it('activates AX_DEFAULT_ACCEPT inside STEP_3_RECONCILE as an ACCEPT/REJECT classification of findings', () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /AX_DEFAULT_ACCEPT/);
    assert.match(reconcile, /ACCEPT only an\s+artifact gap backed by concrete evidence/i);
    assert.match(reconcile, /REJECT a\s+preference, alternative design, missing local convention, or unevidenced question/i);
  });

  it('critic-protocol (the read-only worker) no longer declares or activates AX_DEFAULT_ACCEPT', () => {
    assert.doesNotMatch(critic, /AX_DEFAULT_ACCEPT/);
  });
});

describe('critic-protocol: AX_POLISH_MODE is connected (T-B6-03)', () => {
  const critic = readDirective('critic-protocol.directive.xml');

  it('defines AX_POLISH_MODE in BeliefState', () => {
    assert.match(critic, /<Axiom id="AX_POLISH_MODE">/);
  });

  it('activates AX_POLISH_MODE in STEP_3_REPORT: polish off by default, MINOR/INFO never drive the verdict', () => {
    const report = step(critic, 'STEP_3_REPORT');
    assert.match(report, /AX_POLISH_MODE/);
    assert.match(report, /polish: off/);
    assert.match(report, /MINOR\/INFO never drive the verdict/i);
  });
});

describe('critic-protocol: STEP_3_REPORT carries a measured read-set accounting line (ISS-10 / V-BATCH-20 N-4)', () => {
  const critic = readDirective('critic-protocol.directive.xml');

  it("requires one 'read-set: <file>#<anchor> — N lines' line per extracted section", () => {
    const report = step(critic, 'STEP_3_REPORT');
    assert.match(report, /`read-set: <file>#<anchor> — N lines`/);
  });
});

describe('critic-protocol: reads the owning ticket Conventions/Decision Log by extraction (ISS-10 / V-BATCH-20 B-1)', () => {
  const critic = readDirective('critic-protocol.directive.xml');
  const read = () => step(critic, 'STEP_1_READ');

  it('names the real project-wide-conventions anchor in specs/3-tasks.md — not a generic ## Conventions/## Decision Log that exists in no format', () => {
    const text = read();
    assert.match(text, /specs\/3-tasks\.md#project-wide-conventions-declared-once-inherited/);
    assert.match(text, /nothing else of either document/i);
  });

  it('names the three level-qualified Decision Log anchors — module / scope / project — matching each real tasks-index format', () => {
    const text = read();
    assert.match(text, /#decision-log-module-task-level/);
    assert.match(text, /#decision-log-scope-task-level/);
    assert.match(text, /#decision-log-project-task-level/);
  });

  it('the module-level ## Conventions heading is documented as a pointer stub, never an extraction target', () => {
    const text = read();
    assert.match(text, /never itself an extraction target/i);
  });

  it('extracts via sdd-extract heading-anchor form, one call per section', () => {
    const text = read();
    assert.match(text, /npx gennady sdd-extract <file>#<heading-anchor>/);
    assert.match(text, /one call per section/i);
  });

  it('is bounded and measured: records the extracted line count, does not reopen a settled decision', () => {
    const text = read();
    assert.match(text, /record the extracted line count/i);
    assert.match(text, /bounded and measured/i);
    assert.match(text, /already settled is not reopened/i);
  });

  describe('executable proof: every anchor the directive names actually resolves on a real tasks-index of its level', () => {
    // Extract the literal `#<anchor>` tokens straight out of the rendered directive's own prose —
    // this suite tracks whatever STEP_1_READ actually says, not a hand-copied list that could drift
    // from it silently (the failure mode V-BATCH-20 B-1 found: the first redaction named anchors
    // that exist in no real format, and the prior test only compared prose to itself).
    const anchors = [...new Set([...read().matchAll(/#([a-z][a-z0-9-]+)/g)].map((m) => m[1]!))];

    const PROJECT_LEVEL = [
      '# Project Tasks',
      '',
      '## Project-Wide Conventions (declared once, inherited)',
      '- Fixture convention: file-header owned by the coding rule.',
      '- Fixture convention: baseline completion rule.',
      '',
      '## Decision Log (project task level)',
      '- PROJ-DL-1 — fixture cross-scope decision, recorded for this test only.',
    ].join('\n');

    const SCOPE_LEVEL = [
      '# Tasks: fixture-scope',
      '',
      '## Decision Log (scope task level)',
      '- SCOPE-DL-1 — fixture scope-level decomposition decision, recorded for this test only.',
    ].join('\n');

    const MODULE_LEVEL = [
      '# fixture-module — Tasks',
      '',
      '## Decision Log (module-task level)',
      '- MOD-DL-1 — fixture module-level decision, recorded for this test only.',
      '',
      '## Conventions',
      'Project-wide conventions are declared once in `specs/3-tasks.md` and inherited here — not repeated.',
    ].join('\n');

    // Maps each anchor literally named in the directive to the fixture level whose real format
    // (ai/directives/sdd-v2/formats/{project,scope,module}-tasks-index.xml) actually defines it.
    const LEVEL_BY_ANCHOR: Record<string, { file: string; label: string }> = {
      'project-wide-conventions-declared-once-inherited': { file: 'project.3-tasks.md', label: PROJECT_LEVEL },
      'decision-log-project-task-level': { file: 'project.3-tasks.md', label: PROJECT_LEVEL },
      'decision-log-scope-task-level': { file: 'scope.3-tasks.md', label: SCOPE_LEVEL },
      'decision-log-module-task-level': { file: 'module.3-tasks.md', label: MODULE_LEVEL },
    };

    it('the directive names exactly the four anchors this suite knows how to fixture', () => {
      assert.deepEqual([...anchors].sort(), Object.keys(LEVEL_BY_ANCHOR).sort());
    });

    let tmpDir: string;
    const paths: Record<string, string> = {};
    // SddExtractCommand#run's own module (sdd-extract.cmd.ts) self-executes against the real
    // `process.argv`/`process.exit` at import time (its last two lines: `const outcome = await
    // run(process.argv); ...; process.exit(...)`) — the exact reason its own dedicated test file
    // (cli/cmd/sdd-extract/__tests__/sdd-extract.cmd.test.ts) neuters both before the one dynamic
    // import it performs. Do the same here: mock before the import (module init runs once, on
    // first import, and is cached for every call below), restore after.
    let mod: typeof import('../../../cli/cmd/sdd-extract/sdd-extract.cmd.ts');
    let origExit: typeof process.exit;
    let origArgv: string[];

    it('sets up one synthetic tasks-index fixture per level, and loads sdd-extract with argv/exit neutered', async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'iss-10-read-set-'));
      paths['project.3-tasks.md'] = join(tmpDir, 'project.3-tasks.md');
      paths['scope.3-tasks.md'] = join(tmpDir, 'scope.3-tasks.md');
      paths['module.3-tasks.md'] = join(tmpDir, 'module.3-tasks.md');
      writeFileSync(paths['project.3-tasks.md']!, PROJECT_LEVEL, 'utf8');
      writeFileSync(paths['scope.3-tasks.md']!, SCOPE_LEVEL, 'utf8');
      writeFileSync(paths['module.3-tasks.md']!, MODULE_LEVEL, 'utf8');

      origExit = process.exit;
      origArgv = process.argv;
      process.exit = ((_code?: number) => undefined) as typeof process.exit;
      process.argv = ['node', 'gennady', 'sdd-extract'];
      mod = await import('../../../cli/cmd/sdd-extract/sdd-extract.cmd.ts');
      process.exit = origExit;
      process.argv = origArgv;
    });

    for (const anchor of Object.keys(LEVEL_BY_ANCHOR)) {
      it(`sdd-extract <fixture>#${anchor} returns a real section, not an error or a one-line pointer`, async () => {
        const { file } = LEVEL_BY_ANCHOR[anchor]!;
        const outcome = await mod.run(['node', 'gennady', 'sdd-extract', `${paths[file]}#${anchor}`]);
        assert.equal(outcome.ok, true, `expected ok for #${anchor}, got: ${JSON.stringify(outcome)}`);
        if (outcome.ok) {
          assert.ok(
            outcome.content.length > 30,
            `#${anchor} returned only ${outcome.content.length} chars — looks like a one-line pointer, not real content: ${outcome.content}`
          );
          assert.match(outcome.content, /fixture/i);
        }
      });
    }

    it('tears down the fixture directory', () => {
      rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

describe('reconcile: task-reopen dispatches as one execute batch (T-B6-05)', () => {
  const reconcile = readDirective('reconcile.directive.xml');

  it('defines AX_DISPATCH_VIA_BATCH in BeliefState', () => {
    assert.match(reconcile, /<Axiom id="AX_DISPATCH_VIA_BATCH">/);
  });

  it('activates it in the task-reopen branch of STEP_5_APPLY: one BATCH, execute is the sole audit/code-review owner', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    assert.match(apply, /AX_DISPATCH_VIA_BATCH/);
    assert.match(apply, /as one BATCH/);
    assert.match(apply, /sole owner of each affected group's audit\s+and code-review/i);
    assert.match(apply, /never dispatches a\s+second review/i);
  });

  it('there is no reconcile-only audit flag', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    assert.match(apply, /no\s+reconcile-only audit flag/i);
  });
});

describe('AX_DISPATCH_VIA_BATCH cites the reconcile step that actually exists (V-BATCH-20 N-5)', () => {
  it("the axiom brick's own body says STEP_6_VERIFY, not the nonexistent STEP_7", () => {
    const brick = readFileSync(
      join(OUT_ROOT, '..', 'kit', 'axiom', 'process', 'ax-dispatch-via-batch.xml'),
      'utf8'
    );
    assert.match(brick, /checks them at STEP_6_VERIFY/);
    assert.doesNotMatch(brick, /\bSTEP_7\b/);
  });

  it('the assembled reconcile directive actually has a STEP_6_VERIFY step (the axiom names a real anchor)', () => {
    const reconcile = readDirective('reconcile.directive.xml');
    assert.match(reconcile, /<Step id="STEP_6_VERIFY">/);
  });
});
