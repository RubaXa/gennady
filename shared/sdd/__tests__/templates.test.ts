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
  resolveNextSteps,
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
        'research',
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

  it('research: MADR-hybrid skeleton, path pattern carries the tool-supplied date + operator slug', () => {
    const tpl = TEMPLATES.research;
    assert.strictEqual(tpl.pathPattern, 'specs/<scope>/research/<yyyy-mm-dd>-<slug>.research.md');
    for (const anchor of [
      'STATUS',
      'PROBLEM',
      'CRITERIA',
      'OPTIONS',
      'DECISION',
      'CONSEQUENCES',
      'EVIDENCE',
      'RELATED',
    ]) {
      assert.match(tpl.skeleton, new RegExp(`<!--SECTION:${anchor}-->`), `missing ${anchor}`);
    }
    const required = new Set(tpl.sections.filter((s) => s.required).map((s) => s.name));
    assert.deepStrictEqual(
      required,
      new Set(['STATUS', 'PROBLEM', 'OPTIONS', 'DECISION', 'EVIDENCE'])
    );
  });

  it('every scope-type template + module carries an optional RESEARCH registry section', () => {
    for (const k of [...SCOPE_KINDS, 'module' as const]) {
      const tpl = TEMPLATES[k];
      const entry = tpl.sections.find((s) => s.name === 'RESEARCH');
      assert.ok(entry, `${k}: missing RESEARCH section manifest entry`);
      assert.strictEqual(entry?.required, false, `${k}: RESEARCH must be optional`);
      assert.match(
        tpl.skeleton,
        /<!--SECTION:RESEARCH-->/,
        `${k}: skeleton missing RESEARCH anchor`
      );
      assert.match(tpl.skeleton, /## Research/, `${k}: skeleton missing "## Research" heading`);
    }
  });

  it("scope-type templates link research relative to the scope spec's own directory (./research/)", () => {
    for (const k of SCOPE_KINDS) {
      assert.match(
        TEMPLATES[k].skeleton,
        /\]\(\.\/research\//,
        `${k}: expected a ./research/ link in the RESEARCH section`
      );
    }
  });

  it('module template links research one level above the module (../research/), noting depth honesty', () => {
    assert.match(TEMPLATES.module.skeleton, /\]\(\.\.\/research\//);
    assert.match(TEMPLATES.module.skeleton, /глубине/);
  });

  it('research kinds not carrying a RESEARCH section of their own (task/index/portal/research) are untouched', () => {
    for (const k of [
      'task',
      'module-index',
      'scope-index',
      'project-index',
      'portal',
      'research',
    ] as const) {
      assert.ok(
        !TEMPLATES[k].sections.some((s) => s.name === 'RESEARCH'),
        `${k}: unexpectedly carries a RESEARCH manifest entry`
      );
    }
  });
});

describe('nextSteps — "what happens after this skeleton exists"', () => {
  it('every kind resolves to at least one non-empty next-step line', () => {
    for (const kind of ARTIFACT_KINDS) {
      const steps = resolveNextSteps(kind, { path: 'irrelevant' });
      assert.ok(steps.length > 0, `${kind}: expected at least one next step`);
      for (const s of steps) assert.ok(s.trim().length > 0, `${kind}: empty next-step line`);
    }
  });

  it('research substitutes the concrete --scope into the scope-spec path it names', () => {
    const steps = resolveNextSteps('research', { path: 'irrelevant', scope: 'checkout' });
    assert.ok(
      steps.some((s) => s.includes('specs/checkout/checkout.spec.md')),
      `expected a step naming specs/checkout/checkout.spec.md, got: ${JSON.stringify(steps)}`
    );
    assert.ok(steps.some((s) => s.includes('## Research')));
  });

  it('research falls back to a <scope> placeholder when no scope is supplied', () => {
    const steps = resolveNextSteps('research', { path: 'irrelevant' });
    assert.ok(steps.some((s) => s.includes('<scope>')));
  });

  it('scope/infra/module kinds point onward at the /sdd flow', () => {
    for (const kind of [...SCOPE_KINDS, 'module' as const]) {
      const steps = resolveNextSteps(kind, { path: 'irrelevant' });
      assert.ok(
        steps.some((s) => s.includes('/sdd')),
        `${kind}: expected a /sdd next step`
      );
    }
  });

  it('task points at sdd-task', () => {
    const steps = resolveNextSteps('task', { path: 'irrelevant' });
    assert.ok(steps.some((s) => s.includes('sdd-task')));
  });

  it('task echoes the created --id, telling the agent to use exactly that ID going forward', () => {
    const steps = resolveNextSteps('task', { path: 'irrelevant', id: 'cli-foo' });
    assert.ok(
      steps.some((s) => s.includes('Task-ID: cli-foo')),
      `expected a step naming Task-ID: cli-foo, got: ${JSON.stringify(steps)}`
    );
  });

  it('task falls back to a placeholder when no --id is supplied (e.g. --out was used instead)', () => {
    const steps = resolveNextSteps('task', { path: 'irrelevant' });
    assert.ok(steps.some((s) => s.includes('Task-ID: <id>')));
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
    infrastructure: [
      'VISION',
      'REQUIREMENTS_AND_CONSTRAINTS',
      'TOOL_STACK',
      'VERIFICATION_COMMANDS',
      'DECISION_LOG',
    ],
    interface: [
      'VISION',
      'REQUIREMENTS_AND_CONSTRAINTS',
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
