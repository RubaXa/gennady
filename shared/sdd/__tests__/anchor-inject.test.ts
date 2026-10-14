// @file: Unit tests for v1→v2 anchor injection.
// @spec: SHARED
// @consumers: anchor-inject

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPhasesWithoutOverview,
  injectAnchors,
  scaffoldExecutionLog,
  scaffoldFirstRound,
  upgradeVerificationTable,
} from '../anchor-inject.ts';
import { extractSection } from '../section.ts';

const V1 = [
  '# Task: TSK-1 — Demo',
  '## 1. Meta',
  '- **Task-ID:** TSK-1',
  '- **Status:** [x] DONE',
  '## 2. Phases Overview',
  '| ID | Kind | Deps | Status |',
  '|----|------|------|--------|',
  '| P1 | impl | — | [x] |',
  '## 3. Phases',
  '### P1 — impl',
  '- **Objective:** do it',
  '### P2 — test',
  '- **Objective:** test it',
  '## 4. Acceptance Criteria (BDD)',
  '**Scenario:** x [`unit`]',
  '## 5. Verification',
  '| Command | Required by |',
  '|---|---|',
  '| npm run typecheck | ts |',
  '## 6. Test Scenario Coverage',
  '- Scenario x → file::case',
  '## 7. Execution Log',
  '### Round 1 — 2026-01-01, initial',
  '- [x] DONE',
].join('\n');

describe('injectAnchors', () => {
  it('anchors every canonical section of a v1 ticket', () => {
    const { injected } = injectAnchors(V1);
    assert.deepStrictEqual(
      [...injected].sort(),
      [
        'BDD',
        'EXECUTION_LOG',
        'META',
        'PHASES_OVERVIEW',
        'PHASE_P1',
        'PHASE_P2',
        'TEST_COVERAGE',
        'VERIFICATION',
      ].sort()
    );
  });

  it('every anchored section then extracts cleanly', () => {
    const { text } = injectAnchors(V1);
    const meta = extractSection(text, 'META');
    assert.strictEqual(meta.status, 'ok');
    if (meta.status === 'ok') assert.match(meta.content, /Task-ID:\*\* TSK-1/);

    const p1 = extractSection(text, 'PHASE_P1');
    assert.strictEqual(p1.status, 'ok');
    if (p1.status === 'ok') assert.match(p1.content, /do it/);

    const log = extractSection(text, 'EXECUTION_LOG');
    assert.strictEqual(log.status, 'ok');
    if (log.status === 'ok') assert.match(log.content, /Round 1/);
  });

  it('does NOT anchor the `## 3. Phases` container', () => {
    const { text } = injectAnchors(V1);
    assert.doesNotMatch(text, /SECTION:PHASES--/);
    assert.match(text, /<!--\/SECTION:PHASES_OVERVIEW-->\n## 3\. Phases\n<!--SECTION:PHASE_P1-->/);
  });

  it('is idempotent — a second run injects nothing and changes nothing', () => {
    const once = injectAnchors(V1).text;
    const twice = injectAnchors(once);
    assert.deepStrictEqual(twice.injected, []);
    assert.strictEqual(twice.text, once);
  });

  // B2-10: the real corpus (e.g. tasks/cli/lint/cli-lint.task-14.md, tasks/cli/alt-opinion/*) spells
  // phase headers "### Phase P1 — …", not just "### P1 — …" — both must anchor to PHASE_P<N>.
  it('B2-10: recognizes "### Phase P1 — …" (word "Phase" prefix), not just "### P1"', () => {
    const v1WithPhaseWord = V1.replace('### P1 — impl', '### Phase P1 — impl').replace(
      '### P2 — test',
      '### Phase P2 — test'
    );
    const { injected, text } = injectAnchors(v1WithPhaseWord);
    assert.ok(injected.includes('PHASE_P1'), 'PHASE_P1 must be injected for "Phase P1"');
    assert.ok(injected.includes('PHASE_P2'), 'PHASE_P2 must be injected for "Phase P2"');
    const p1 = extractSection(text, 'PHASE_P1');
    assert.strictEqual(p1.status, 'ok');
    if (p1.status === 'ok') assert.match(p1.content, /do it/);
  });

  it('B2-10: "Phase P1_FIX" still carries the _FIX suffix', () => {
    const withFix = V1.replace('### P1 — impl', '### Phase P1_FIX — hotfix');
    const { injected } = injectAnchors(withFix);
    assert.ok(injected.includes('PHASE_P1_FIX'));
  });

  it('B2-10: "### Phases Overview" at the ### level is also recognized (defensive — v1 authoring is inconsistent)', () => {
    const content = [
      '# Task: TSK-3 — Nested overview',
      '## 1. Meta',
      '- **Task-ID:** TSK-3',
      '## 2. Phases',
      '### Phases Overview',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [x] |',
      '### P1 — impl',
      '- **Objective:** do it',
    ].join('\n');
    const { injected, text } = injectAnchors(content);
    assert.ok(injected.includes('PHASES_OVERVIEW'));
    const overview = extractSection(text, 'PHASES_OVERVIEW');
    assert.strictEqual(overview.status, 'ok');
    if (overview.status === 'ok') assert.match(overview.content, /\| P1 \| impl/);
  });

  // Patch invariant (06 §5.2 п.36 / D-38): anchoring only inserts marker lines — every original
  // line survives byte-for-byte outside the inserted markers. Proven by reconstruction: stripping
  // every inserted `<!--SECTION...-->`/`<!--/SECTION...-->` line from the output must reproduce the
  // exact original content, not merely "look similar".
  it('PATCH invariant: stripping the inserted anchor lines reconstructs the original byte-for-byte', () => {
    const { text, injected } = injectAnchors(V1);
    assert.ok(injected.length > 0, 'sanity: this fixture must actually inject anchors');
    const reconstructed = text
      .split('\n')
      .filter((line) => !/^<!--\/?SECTION:[A-Z0-9_]+-->$/.test(line))
      .join('\n');
    assert.strictEqual(reconstructed, V1);
  });
});

describe('hasPhasesWithoutOverview (B2-10)', () => {
  it('phase anchors present, no Phases Overview anchor → true (explicit warning case)', () => {
    const content = [
      '<!--SECTION:META-->',
      '## Meta',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASE_P1-->',
      '### Phase P1 — implementation',
      '<!--/SECTION:PHASE_P1-->',
    ].join('\n');
    assert.strictEqual(hasPhasesWithoutOverview(content), true);
  });

  it('phase anchors + Phases Overview anchor both present → false', () => {
    const content = [
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '### P1 — impl',
      '<!--/SECTION:PHASE_P1-->',
    ].join('\n');
    assert.strictEqual(hasPhasesWithoutOverview(content), false);
  });

  it('no phase anchors at all (a ticket that genuinely has no Phases, e.g. dbc-linter.task-08 shape) → false', () => {
    const content = [
      '<!--SECTION:META-->',
      '## Meta',
      '<!--/SECTION:META-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by |',
      '<!--/SECTION:VERIFICATION-->',
    ].join('\n');
    assert.strictEqual(hasPhasesWithoutOverview(content), false);
  });

  it('real end-to-end: injectAnchors on a ticket with "### Phase P1" but no Phases Overview header flags true', () => {
    const content = [
      '# Task: LIN-anchors — AnchorCheck',
      '## 1. Meta',
      '- **Task-ID:** LIN-anchors',
      '## 2. Acceptance Criteria (BDD)',
      '**Scenario:** x [`unit`]',
      '## 3. Phases',
      '### Phase P1 — implementation',
      '- **Objective:** do it',
    ].join('\n');
    const { text } = injectAnchors(content);
    assert.strictEqual(hasPhasesWithoutOverview(text), true);
  });
});

const V1_META_ONLY = ['# Task: TSK-2 — No Log', '## 1. Meta', '- **Task-ID:** TSK-2'].join('\n');

describe('scaffoldExecutionLog', () => {
  it('scaffolds a section for a v1 ticket with a Meta header/anchor but no Execution Log at all', () => {
    const { text: anchored } = injectAnchors(V1_META_ONLY);
    const { text, scaffolded } = scaffoldExecutionLog(anchored, '2026-08-12');
    assert.strictEqual(scaffolded, true);
    assert.match(text, /<!--SECTION:EXECUTION_LOG-->/);
    assert.match(text, /<!--\/SECTION:EXECUTION_LOG-->/);
    assert.match(text, /## Execution Log/);
    assert.match(text, /2026-08-12 migrated from v1 — no rounds\/phases recorded in v1 format/);

    const log = extractSection(text, 'EXECUTION_LOG');
    assert.strictEqual(log.status, 'ok');
  });

  it('does nothing when there is no Meta header/anchor at all', () => {
    const noMeta = '# Just a doc\nSome text, no ticket structure.';
    const { text, scaffolded } = scaffoldExecutionLog(noMeta, '2026-08-12');
    assert.strictEqual(scaffolded, false);
    assert.strictEqual(text, noMeta);
  });

  it('does nothing when an Execution Log section already exists (real content preserved)', () => {
    const { text: anchored } = injectAnchors(V1);
    const { text, scaffolded } = scaffoldExecutionLog(anchored, '2026-08-12');
    assert.strictEqual(scaffolded, false);
    assert.strictEqual(text, anchored);
  });

  it('is idempotent — scaffolding twice does not duplicate the section', () => {
    const { text: anchored } = injectAnchors(V1_META_ONLY);
    const once = scaffoldExecutionLog(anchored, '2026-08-12').text;
    const twice = scaffoldExecutionLog(once, '2026-08-12');
    assert.strictEqual(twice.scaffolded, false);
    assert.strictEqual(twice.text, once);
    const occurrences = once.split('<!--SECTION:EXECUTION_LOG-->').length - 1;
    assert.strictEqual(occurrences, 1);
  });
});

// V-BATCH-22 verdict B-1/B-8: `scaffoldFirstRound` must PATCH (append), never REWRITE, the Execution
// Log — the same "real content preserved" invariant `scaffoldExecutionLog` already holds
// (`does nothing when an Execution Log section already exists`, above), but for the sibling function
// that runs right after it in the same `anchors --write` pass (`cli/cmd/sdd-migrate/sdd-migrate.cmd.ts`).
const PHASE_RECEIPTS_MARKER_LITERAL = '<!--PHASE_RECEIPTS:v1-->';

function ticketWithExecutionLogBody(body: string): string {
  return [
    '<!--SECTION:META-->',
    '## Meta',
    '- **Task-ID:** TSK-HIST',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|----|------|------|--------|',
    '| P1 | impl | — | [x] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:VERIFICATION-->',
    PHASE_RECEIPTS_MARKER_LITERAL,
    '',
    '| Command | Required by | Role |',
    '|---------|-------------|------|',
    '| npm test | this ticket | probe |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:EXECUTION_LOG-->',
    body,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

describe('scaffoldFirstRound (V-BATCH-22 B-1: patch, not rewrite)', () => {
  it('REGRESSION — real v1 Execution Log history survives byte-for-byte when Round 1 is scaffolded', () => {
    // The exact reproduction shape from the V-BATCH-22 verifier report: a real, non-placeholder v1
    // history — author handles, a bug note, a decision — that a prior version of this function
    // silently discarded (`nextLines` spliced out `lines.slice(startIdx + 1, endIdx)` entirely).
    const HISTORY = [
      '- 2026-01-01 @alice implemented the initial pass',
      '- 2026-01-02 @bob found an off-by-one in the boundary check',
      '- DECISION: keep sync API (no async needed for this size)',
    ].join('\n');
    const content = ticketWithExecutionLogBody(HISTORY);

    const { text, scaffolded } = scaffoldFirstRound(content, ['P1'], '2026-09-10');
    assert.strictEqual(scaffolded, true);

    const log = extractSection(text, 'EXECUTION_LOG');
    assert.strictEqual(log.status, 'ok');
    const body = log.status === 'ok' ? log.content : '';

    // Every history line survives verbatim — this is the "history … survived: false" repro from the
    // verifier report, now proven true.
    assert.match(body, /@alice implemented the initial pass/);
    assert.match(body, /@bob found an off-by-one in the boundary check/);
    assert.match(body, /DECISION: keep sync API \(no async needed for this size\)/);
    // The Round-1 scaffold is APPENDED after the history, not instead of it.
    assert.match(body, /### Round 1 — 2026-09-10, initial/);
    assert.ok(
      body.indexOf('DECISION: keep sync API') < body.indexOf('### Round 1'),
      'history must precede the appended Round-1 scaffold, not be replaced by it'
    );
  });

  it('an EMPTY (placeholder) Execution Log still gets the Round-1 scaffold (unchanged from before the fix)', () => {
    const content = ticketWithExecutionLogBody('');
    const { text, scaffolded } = scaffoldFirstRound(content, ['P1'], '2026-09-10');
    assert.strictEqual(scaffolded, true);
    assert.match(text, /### Round 1 — 2026-09-10, initial/);
    assert.match(text, /#### P1/);
    assert.match(text, /#### Round close/);
  });

  it('is idempotent — a body that already has a `### Round N` heading is left untouched (real history included)', () => {
    const HISTORY =
      '- 2026-01-01 @alice implemented the initial pass\n### Round 1 — 2026-01-05, initial\n- [x] `2026-01-06T00:00:00Z` DONE';
    const content = ticketWithExecutionLogBody(HISTORY);
    const { text, scaffolded } = scaffoldFirstRound(content, ['P1'], '2026-09-10');
    assert.strictEqual(scaffolded, false);
    assert.strictEqual(text, content);
  });

  it('does nothing without the PHASE_RECEIPTS:v1 marker (companion change never fired)', () => {
    const content = ticketWithExecutionLogBody('- 2026-01-01 @alice did the thing').replace(
      `${PHASE_RECEIPTS_MARKER_LITERAL}\n\n`,
      ''
    );
    const { text, scaffolded } = scaffoldFirstRound(content, ['P1'], '2026-09-10');
    assert.strictEqual(scaffolded, false);
    assert.strictEqual(text, content);
  });
});

// V-BATCH-22 B-8: `upgradeVerificationTable` had no dedicated unit tests at all (only exercised
// end-to-end via fixture-detmig.test.ts / sdd-migrate.cmd.test.ts) — these cover it directly,
// including the `coverage-policy` branch neither of those touches.
describe('upgradeVerificationTable (V-BATCH-22 B-8)', () => {
  const TWO_COL = [
    '<!--SECTION:VERIFICATION-->',
    '| Command | Required by |',
    '|---------|-------------|',
    '| npm run typecheck | ts |',
    '<!--/SECTION:VERIFICATION-->',
  ].join('\n');

  it('upgrades a 2-column table to 3-column (Role added) and adds the PHASE_RECEIPTS:v1 marker', () => {
    const { text, changed } = upgradeVerificationTable(TWO_COL);
    assert.deepStrictEqual(changed, ['table', 'phase-receipts']);
    assert.match(text, /\| Command \| Required by \| Role \|/);
    assert.match(text, /\| npm run typecheck \| ts \| extra \|/);
    assert.match(text, /<!--PHASE_RECEIPTS:v1-->/);
  });

  it('is idempotent — an already 3-column table is left untouched (no `table` change reported)', () => {
    const once = upgradeVerificationTable(TWO_COL).text;
    const { text, changed } = upgradeVerificationTable(once);
    assert.strictEqual(text, once);
    assert.deepStrictEqual(changed, []);
  });

  it('coverage-policy branch: exactly one coverage row + exactly one test-kind phase → COVERAGE_POLICY:v1 with the real owner phase', () => {
    const content = [
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [x] |',
      '| P2 | test | P1 | [x] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by |',
      '|---------|-------------|',
      '| npm run test:coverage | P2 |',
      '<!--/SECTION:VERIFICATION-->',
    ].join('\n');
    const { text, changed } = upgradeVerificationTable(content);
    assert.deepStrictEqual(changed, ['table', 'phase-receipts', 'coverage-policy']);
    assert.match(text, /\| npm run test:coverage \| P2 \| coverage \|/);
    assert.match(text, /<!--COVERAGE_POLICY:v1-->/);
    assert.match(text, /\*\*Coverage Policy:\*\* required/);
    assert.match(text, /\*\*Coverage Owner Phase:\*\* P2/);
  });

  it('never invents an owner phase — two coverage rows (ambiguous) skip the coverage-policy marker', () => {
    const content = [
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | test | — | [x] |',
      '| P2 | test | P1 | [x] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by |',
      '|---------|-------------|',
      '| npm run test:coverage | P1 |',
      '| npm run --coverage | P2 |',
      '<!--/SECTION:VERIFICATION-->',
    ].join('\n');
    const { text, changed } = upgradeVerificationTable(content);
    assert.deepStrictEqual(changed, ['table', 'phase-receipts']);
    assert.doesNotMatch(text, /COVERAGE_POLICY:v1/);
  });

  it('not anchored yet (no VERIFICATION section) — returns content unchanged', () => {
    const content = '# not a ticket\nSome text.';
    const { text, changed } = upgradeVerificationTable(content);
    assert.strictEqual(text, content);
    assert.deepStrictEqual(changed, []);
  });
});
