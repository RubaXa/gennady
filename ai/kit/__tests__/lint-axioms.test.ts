// @file: Dangling-axiom lint tests — every BeliefState axiom must be anchored outside BeliefState.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lintDanglingAxioms,
  formatDanglingReport,
  parseDirective,
  lintUndefinedAxiomRefs,
  formatUndefinedRefsReport,
  collectStaticDirectiveFiles,
} from '../lint-axioms.ts';

/** Minimal directive builder: BeliefState with given axioms + an arbitrary body after it. */
function directive(opts: {
  file: string;
  deps?: string;
  axioms: { id: string; crossCutting?: boolean }[];
  body?: string;
}): { file: string; text: string } {
  const depsAttr = opts.deps !== undefined ? ` deps="${opts.deps}"` : '';
  const axiomTags = opts.axioms
    .map(
      (a) =>
        `    <Axiom id="${a.id}"${a.crossCutting ? ' cross-cutting="true"' : ''}>\n      Body of ${a.id}.\n    </Axiom>`
    )
    .join('\n');
  return {
    file: opts.file,
    text: [
      `<Directive type="directive" ver="2.0">`,
      `  <BeliefState${depsAttr}>`,
      axiomTags,
      `  </BeliefState>`,
      ``,
      opts.body ?? '',
      `</Directive>`,
      ``,
    ].join('\n'),
  };
}

describe('parseDirective', () => {
  it('extracts axiom ids, cross-cutting flag and deps; strips BeliefState from outside text', () => {
    const p = parseDirective(
      directive({
        file: 'x.xml',
        deps: 'AX_INHERITED_A, AX_INHERITED_B',
        axioms: [{ id: 'AX_OWN' }, { id: 'AX_STYLE', crossCutting: true }],
        body: `  <ExecutionPlan>\n    <Step id="STEP_1">Do it per \`AX_OWN\`.</Step>\n  </ExecutionPlan>`,
      })
    );
    assert.deepEqual(
      p.axioms,
      [
        { id: 'AX_OWN', crossCutting: false },
        { id: 'AX_STYLE', crossCutting: true },
      ],
      'axioms with flags'
    );
    assert.deepEqual([...p.deps].sort(), ['AX_INHERITED_A', 'AX_INHERITED_B']);
    assert.ok(!p.outside.includes('Body of AX_OWN'), 'BeliefState interior removed');
    assert.ok(p.outside.includes('per `AX_OWN`'), 'ExecutionPlan kept');
  });

  it('handles a directive without BeliefState (formats/guides)', () => {
    const p = parseDirective({ file: 'formats/f.xml', text: '<Format>\n  A table.\n</Format>\n' });
    assert.deepEqual(p.axioms, []);
    assert.equal(p.deps.size, 0);
  });
});

describe('lintDanglingAxioms — single directive', () => {
  it('axiom referenced by a step is not dangling', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_USED' }],
      body: `  <ExecutionPlan>\n    <Step id="STEP_1">Interview per \`AX_USED\`.</Step>\n  </ExecutionPlan>`,
    });
    assert.deepEqual(lintDanglingAxioms([d]), []);
  });

  it('axiom referenced only by a HaltCondition or LogicSwitch counts as used', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_HALT' }, { id: 'AX_ROUTE' }],
      body: [
        `  <HaltConditions>`,
        `    | \`H_X\` | per \`AX_HALT\` |`,
        `  </HaltConditions>`,
        `  <LogicSwitch>`,
        `    route per \`AX_ROUTE\``,
        `  </LogicSwitch>`,
      ].join('\n'),
    });
    assert.deepEqual(lintDanglingAxioms([d]), []);
  });

  it('unreferenced axiom is dangling', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_ORPHAN' }],
      body: '  <ExecutionPlan/>',
    });
    assert.deepEqual(lintDanglingAxioms([d]), [{ file: 'a.xml', id: 'AX_ORPHAN' }]);
  });

  it('mention only INSIDE BeliefState (axiom cross-referencing axiom) does not count', () => {
    const d = {
      file: 'a.xml',
      text: [
        `<D>`,
        `  <BeliefState>`,
        `    <Axiom id="AX_ONE">See \`AX_TWO\`.</Axiom>`,
        `    <Axiom id="AX_TWO">Body.</Axiom>`,
        `  </BeliefState>`,
        `  <ExecutionPlan>per \`AX_ONE\`</ExecutionPlan>`,
        `</D>`,
      ].join('\n'),
    };
    assert.deepEqual(lintDanglingAxioms([d]), [{ file: 'a.xml', id: 'AX_TWO' }]);
  });

  it('cross-cutting="true" exempts the axiom', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_STYLE', crossCutting: true }],
      body: '  <ExecutionPlan/>',
    });
    assert.deepEqual(lintDanglingAxioms([d]), []);
  });

  it('prefix ids do not false-match (AX_FOO vs AX_FOO_BAR)', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_FOO' }],
      body: '  <ExecutionPlan>per `AX_FOO_BAR`</ExecutionPlan>',
    });
    assert.deepEqual(lintDanglingAxioms([d]), [{ file: 'a.xml', id: 'AX_FOO' }]);
  });
});

describe('lintDanglingAxioms — deps inheritance across directives', () => {
  const router = directive({
    file: 'router.xml',
    axioms: [{ id: 'AX_CORE' }],
    body: '  <ExecutionPlan/>',
  });

  it('axiom used by an heir that declares it in deps is not dangling', () => {
    const branch = directive({
      file: 'branch.xml',
      deps: 'AX_CORE',
      axioms: [],
      body: '  <ExecutionPlan>Interview per `AX_CORE`.</ExecutionPlan>',
    });
    assert.deepEqual(lintDanglingAxioms([router, branch]), []);
  });

  it('heir declaring the dep but never mentioning it does not rescue the axiom', () => {
    const branch = directive({
      file: 'branch.xml',
      deps: 'AX_CORE',
      axioms: [],
      body: '  <ExecutionPlan/>',
    });
    assert.deepEqual(lintDanglingAxioms([router, branch]), [{ file: 'router.xml', id: 'AX_CORE' }]);
  });

  it('mention in a file that does NOT declare the dep does not count', () => {
    const stranger = directive({
      file: 'stranger.xml',
      axioms: [],
      body: '  <ExecutionPlan>per `AX_CORE`</ExecutionPlan>',
    });
    assert.deepEqual(lintDanglingAxioms([router, stranger]), [
      { file: 'router.xml', id: 'AX_CORE' },
    ]);
  });
});

describe('formatDanglingReport', () => {
  it('empty findings → empty string', () => {
    assert.equal(formatDanglingReport([]), '');
  });

  it('groups by file and reports the total count', () => {
    const report = formatDanglingReport([
      { file: 'a.xml', id: 'AX_ONE' },
      { file: 'a.xml', id: 'AX_TWO' },
      { file: 'b.xml', id: 'AX_THREE' },
    ]);
    assert.match(report, /3 dangling axiom/);
    assert.match(report, /a\.xml: AX_ONE, AX_TWO/);
    assert.match(report, /b\.xml: AX_THREE/);
  });
});

describe('lintUndefinedAxiomRefs — referenced-but-undefined (T-B6-08)', () => {
  it('a reference with no <Axiom id> defined anywhere in the render set is dangling', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [],
      body: '  <ExecutionPlan>per `AX_GHOST`</ExecutionPlan>',
    });
    assert.deepEqual(lintUndefinedAxiomRefs([d]), [{ file: 'a.xml', id: 'AX_GHOST' }]);
  });

  it('a reference satisfied by its OWN file defining the axiom is not dangling', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_LOCAL' }],
      body: '  <ExecutionPlan>per `AX_LOCAL`</ExecutionPlan>',
    });
    assert.deepEqual(lintUndefinedAxiomRefs([d]), []);
  });

  it('a reference satisfied by a DIFFERENT file in the same render set is not dangling (the check is corpus-wide, not per-file)', () => {
    const definer = directive({ file: 'axiom-home.xml', axioms: [{ id: 'AX_SHARED' }], body: '  <ExecutionPlan/>' });
    const user = directive({ file: 'consumer.xml', axioms: [], body: '  <ExecutionPlan>per `AX_SHARED`</ExecutionPlan>' });
    assert.deepEqual(lintUndefinedAxiomRefs([definer, user]), []);
  });

  it('allowlisted `${file}::${id}` pairs stay accepted (temporary, shrinking KNOWN_DANGLING allowlist — L-10)', () => {
    const d = directive({
      file: 'legacy.xml',
      axioms: [],
      body: '  <ExecutionPlan>per `AX_NOT_YET_CONNECTED`</ExecutionPlan>',
    });
    assert.deepEqual(
      lintUndefinedAxiomRefs([d], { allowlist: new Set(['legacy.xml::AX_NOT_YET_CONNECTED']) }),
      []
    );
    // an allowlist entry for a DIFFERENT file does not rescue this one
    assert.deepEqual(
      lintUndefinedAxiomRefs([d], { allowlist: new Set(['other.xml::AX_NOT_YET_CONNECTED']) }),
      [{ file: 'legacy.xml', id: 'AX_NOT_YET_CONNECTED' }]
    );
  });

  it('prefix ids do not false-match (defining AX_FOO does not satisfy a reference to AX_FOO_BAR, or vice-versa)', () => {
    const d = directive({
      file: 'a.xml',
      axioms: [{ id: 'AX_FOO' }],
      body: '  <ExecutionPlan>per `AX_FOO` and per `AX_FOO_BAR`</ExecutionPlan>',
    });
    assert.deepEqual(lintUndefinedAxiomRefs([d]), [{ file: 'a.xml', id: 'AX_FOO_BAR' }]);
  });

  it('the `id="…"` attribute of an Axiom tag is a definition, not itself counted as a dangling reference', () => {
    const d = { file: 'a.xml', text: '<Directive>\n  <BeliefState>\n    <Axiom id="AX_ONLY_DEFINED">Body.</Axiom>\n  </BeliefState>\n</Directive>\n' };
    assert.deepEqual(lintUndefinedAxiomRefs([d]), []);
  });
});

describe('formatUndefinedRefsReport', () => {
  it('empty findings → empty string', () => {
    assert.equal(formatUndefinedRefsReport([]), '');
  });

  it('groups by file, reports the total count, and reads as an error (not a warning)', () => {
    const report = formatUndefinedRefsReport([
      { file: 'a.xml', id: 'AX_ONE' },
      { file: 'a.xml', id: 'AX_TWO' },
      { file: 'b.xml', id: 'AX_THREE' },
    ]);
    assert.match(report, /^✗ 3 undefined axiom reference/);
    assert.match(report, /a\.xml: AX_ONE, AX_TWO/);
    assert.match(report, /b\.xml: AX_THREE/);
  });
});

describe('collectStaticDirectiveFiles — T-B6-24 scope widening', () => {
  it('reads .xml files under the static (non-templated) dirs, relative to the given root, without an sdd-v2/ prefix', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'lint-axioms-static-'));
    try {
      mkdirSync(join(root, 'infra'), { recursive: true });
      writeFileSync(join(root, 'infra', 'git-setup.xml'), '<Directive>per `AX_SOMETHING`</Directive>\n');
      mkdirSync(join(root, 'sdd-v2'), { recursive: true }); // must NOT be picked up — templated tree
      writeFileSync(join(root, 'sdd-v2', 'router.directive.xml'), '<Directive/>\n');
      const { collectStaticDirectiveFiles } = await import('../lint-axioms.ts');
      const files = collectStaticDirectiveFiles(root);
      assert.deepEqual(
        files.map((f) => f.file),
        ['infra/git-setup.xml']
      );
      assert.match(files[0]!.text, /AX_SOMETHING/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('tolerates a missing static dir (fresh checkout without e.g. testing/)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'lint-axioms-static-empty-'));
    try {
      const { collectStaticDirectiveFiles } = await import('../lint-axioms.ts');
      assert.deepEqual(collectStaticDirectiveFiles(root), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
