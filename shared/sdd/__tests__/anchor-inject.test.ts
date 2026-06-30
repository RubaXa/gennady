// @file: Unit tests for v1→v2 anchor injection.
// @consumers: anchor-inject
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { injectAnchors } from '../anchor-inject.ts';
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
