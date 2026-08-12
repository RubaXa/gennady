// @file: Unit tests for v1→v2 anchor injection.
// @consumers: anchor-inject
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { injectAnchors, scaffoldExecutionLog } from '../anchor-inject.ts';
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
