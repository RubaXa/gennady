// @file: Dangling-axiom lint tests — every BeliefState axiom must be anchored outside BeliefState.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lintDanglingAxioms, formatDanglingReport, parseDirective } from '../lint-axioms.ts';

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
