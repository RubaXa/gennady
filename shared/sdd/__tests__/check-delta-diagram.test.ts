// @file: Unit tests for checkDeltaDiagram — a spec in review-state with ✚ additions must mark the
// new node/step somewhere in a diagram.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeltaDiagram } from '../check.ts';

const SPEC_FILE = 'specs/inbox-core/inbox-core.spec.md';

const manifest = (body: string): string =>
  `<!--SECTION:CHANGE_MANIFEST-->\n## Change Manifest\n\nТИП ИЗМЕНЕНИЯ: refine\n\n${body}\n<!--/SECTION:CHANGE_MANIFEST-->`;

describe('checkDeltaDiagram', () => {
  it('master spec (no ✚ marks anywhere) → no findings', () => {
    assert.deepStrictEqual(checkDeltaDiagram(SPEC_FILE, '## Vision\nclean spec'), []);
  });

  it('✚ mark present but no CHANGE_MANIFEST section → silent (checkReviewState already owns that finding)', () => {
    assert.deepStrictEqual(
      checkDeltaDiagram(SPEC_FILE, '## Vision\n✚ IC-REQ-3 — new requirement'),
      []
    );
  });

  it('review-state with ✚ additions, no new-node mark in any diagram → SDD_DELTA_DIAGRAM_MISSING warn', () => {
    const content =
      manifest('✚ IC-REQ-3 — new requirement') + '\n```mermaid\nflowchart LR\n  A --> B\n```\n';
    const findings = checkDeltaDiagram(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DELTA_DIAGRAM_MISSING');
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('greenfield review-state never requires a delta diagram', () => {
    const content = manifest('✚ IC-REQ-3 — new requirement').replace(
      'ТИП ИЗМЕНЕНИЯ: refine',
      'ТИП ИЗМЕНЕНИЯ: greenfield'
    );
    assert.deepStrictEqual(checkDeltaDiagram(SPEC_FILE, content), []);
  });

  it('a diagram marks the new node with `:::new` → no findings', () => {
    const content =
      manifest('✚ IC-REQ-3 — new requirement') +
      '\n```mermaid\nflowchart LR\n  A --> B\n  B:::new --> C\n```\n';
    assert.deepStrictEqual(checkDeltaDiagram(SPEC_FILE, content), []);
  });

  it('a diagram marks the new node with the Russian «(добавлено)» tag → no findings', () => {
    const content =
      manifest('✚ IC-REQ-3 — new requirement') +
      '\n```mermaid\nflowchart LR\n  A --> B\n  B --> C[Новый узел (добавлено)]\n```\n';
    assert.deepStrictEqual(checkDeltaDiagram(SPEC_FILE, content), []);
  });

  it('a bare "NEW" word-boundary tag also counts', () => {
    const content =
      manifest('✚ IC-REQ-3 — new requirement') +
      '\n```mermaid\nflowchart LR\n  A --> B[C NEW]\n```\n';
    assert.deepStrictEqual(checkDeltaDiagram(SPEC_FILE, content), []);
  });

  it('an all-caps identifier merely containing NEW (e.g. NEWTASK) does not false-positive as the mark', () => {
    const content =
      manifest('✚ IC-REQ-3 — new requirement') +
      '\n```mermaid\nflowchart LR\n  A --> NEWTASK\n```\n';
    const findings = checkDeltaDiagram(SPEC_FILE, content);
    assert.strictEqual(findings[0]?.code, 'SDD_DELTA_DIAGRAM_MISSING');
  });
});
