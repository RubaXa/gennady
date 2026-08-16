// @file: Unit tests for the artifact template registry — derived-list parity with check.ts and skeleton integrity.
// @consumers: templates
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATES,
  ARTIFACT_KINDS,
  SCOPE_KINDS,
  loadBearingSections,
  foldSections,
} from '../templates.ts';
import { REQUIRED_SECTIONS, MODULE_REQUIRED_V2, FOLD_REQUIRED_V2 } from '../check.ts';
import { extractMermaidBlocks, validateMermaid } from '../../mermaid/mermaid.ts';

const sortedSet = (xs: string[]): string[] => Array.from(new Set(xs)).sort();

describe('templates registry', () => {
  it('carries every artifact kind', () => {
    assert.deepStrictEqual(
      new Set(ARTIFACT_KINDS),
      new Set([
        'product',
        'library',
        'infrastructure',
        'interface',
        'module',
        'task',
        'module-index',
        'scope-index',
        'project-index',
        'portal',
      ])
    );
  });

  it("every section anchor in each non-portal skeleton appears in that kind's manifest", () => {
    for (const kind of ARTIFACT_KINDS) {
      if (kind === 'portal') continue;
      const tpl = TEMPLATES[kind];
      const anchors = [...tpl.skeleton.matchAll(/<!--SECTION:([A-Z_<>0-9]+)-->/g)].map(
        (m) => m[1] as string
      );
      const manifestNames = new Set(tpl.sections.map((s) => s.name));
      for (const a of anchors) {
        // The task template repeats PHASE_P1/PHASE_P2 as illustrative rows for one manifest
        // entry ("PHASE_P<N>") — one anchored section per Phases Overview row, not a fixed set.
        const normalized = /^PHASE_P\d+$/.test(a) ? 'PHASE_P<N>' : a;
        assert.ok(manifestNames.has(normalized), `${kind}: anchor ${a} missing from manifest`);
      }
    }
  });

  it('module/scope skeletons keep anchors balanced (open count === close count per name)', () => {
    for (const kind of ARTIFACT_KINDS) {
      if (kind === 'portal') continue;
      const tpl = TEMPLATES[kind];
      const opens = [...tpl.skeleton.matchAll(/<!--SECTION:([A-Z_]+)-->/g)].map((m) => m[1]);
      const closes = [...tpl.skeleton.matchAll(/<!--\/SECTION:([A-Z_]+)-->/g)].map((m) => m[1]);
      assert.deepStrictEqual(opens.sort(), closes.sort(), `${kind}: unbalanced anchors`);
    }
  });

  it('task skeleton is anchored, and portal skeleton carries no SECTION anchors', () => {
    assert.ok(TEMPLATES.task.skeleton.includes('<!--SECTION:META-->'));
    assert.ok(!/<!--SECTION:/.test(TEMPLATES.portal.skeleton));
  });

  it('project-index skeleton carries no SECTION anchors and matches specs/3-tasks.md', () => {
    assert.ok(!/<!--SECTION:/.test(TEMPLATES['project-index'].skeleton));
    assert.strictEqual(TEMPLATES['project-index'].pathPattern, 'specs/3-tasks.md');
    assert.match(TEMPLATES['project-index'].skeleton, /## Entry Points/);
    assert.match(TEMPLATES['project-index'].skeleton, /## Project-Wide Conventions/);
    assert.match(TEMPLATES['project-index'].skeleton, /## Cross-Scope DAG/);
    assert.match(TEMPLATES['project-index'].skeleton, /## Scope Tracker/);
    assert.match(TEMPLATES['project-index'].skeleton, /## Decision Log/);
  });
});

describe('derived lists match check.ts (block L1 parity requirement)', () => {
  const EXPECTED_REQUIRED_SECTIONS: Record<string, string[]> = {
    product: [
      'VISION',
      'GOLDEN_DX',
      'USE_CASES',
      'REQUIREMENTS_AND_CONSTRAINTS',
      'ARCHITECTURE',
      'DECISION_LOG',
      'MODULE_MAP',
    ],
    library: [
      'VISION',
      'GOLDEN_DX',
      'REQUIREMENTS_AND_CONSTRAINTS',
      'PUBLIC_API_SURFACE',
      'DECISION_LOG',
    ],
    infrastructure: ['VISION', 'TOOL_STACK', 'VERIFICATION_COMMANDS', 'DECISION_LOG'],
    interface: [
      'VISION',
      'INTERFACE_DECLARATION',
      'VERSIONING_POLICY',
      'COMPATIBILITY_MATRIX',
      'DECISION_LOG',
    ],
  };
  const EXPECTED_MODULE_REQUIRED_V2 = [
    'MODULE_VISION',
    'MODULE_USAGE_EXAMPLE',
    'ENTITY_INVENTORY',
    'MODULE_CONTRACTS',
  ];
  const EXPECTED_FOLD_REQUIRED_V2 = [
    'ENTITY_SURFACES',
    'MODULE_CONTRACTS',
    'MODULE_DECISION_LOG',
    'DECISION_LOG',
    'BOOTSTRAP_REQUIREMENTS',
    'COMPATIBILITY_MATRIX',
    'EFFECTIVE_RULES',
  ];

  for (const k of SCOPE_KINDS) {
    it(`REQUIRED_SECTIONS.${k} unchanged`, () => {
      assert.deepStrictEqual(
        sortedSet(REQUIRED_SECTIONS[k]),
        sortedSet(EXPECTED_REQUIRED_SECTIONS[k])
      );
      assert.deepStrictEqual(
        sortedSet(loadBearingSections(k)),
        sortedSet(EXPECTED_REQUIRED_SECTIONS[k])
      );
    });
  }

  it('MODULE_REQUIRED_V2 unchanged', () => {
    assert.deepStrictEqual(sortedSet(MODULE_REQUIRED_V2), sortedSet(EXPECTED_MODULE_REQUIRED_V2));
    assert.deepStrictEqual(
      sortedSet(loadBearingSections('module')),
      sortedSet(EXPECTED_MODULE_REQUIRED_V2)
    );
  });

  it('FOLD_REQUIRED_V2 unchanged', () => {
    assert.deepStrictEqual(sortedSet(FOLD_REQUIRED_V2), sortedSet(EXPECTED_FOLD_REQUIRED_V2));
  });

  it('PUBLIC_OPTIONS is deliberately excluded from fold requirements', () => {
    assert.ok(!foldSections('module').includes('PUBLIC_OPTIONS'));
  });
});

describe('every mermaid block in every skeleton parses (real mermaid grammar)', () => {
  for (const kind of ARTIFACT_KINDS) {
    const blocks = extractMermaidBlocks(TEMPLATES[kind].skeleton);
    if (blocks.length === 0) continue;
    blocks.forEach((body, i) => {
      it(`${kind} mermaid block #${i} parses`, async () => {
        const err = await validateMermaid(body);
        assert.strictEqual(err, null, `${kind} block #${i} failed to parse: ${err}`);
      });
    });
  }
});
