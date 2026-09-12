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
  lintUncollectedAxiomFiles,
  formatUncollectedAxiomsReport,
  PENDING_IN_OPEN_PR,
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
  it('reads root-level and future-directory XML while excluding only generated sdd-v2/**', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'lint-axioms-static-'));
    try {
      writeFileSync(join(root, 'knowledge.xml'), '<Directive>per `AX_ROOT`</Directive>\n');
      mkdirSync(join(root, 'future-tree', 'nested'), { recursive: true });
      writeFileSync(join(root, 'future-tree', 'nested', 'future.xml'), '<Directive>per `AX_FUTURE`</Directive>\n');
      mkdirSync(join(root, 'sdd-v2', 'nested'), { recursive: true });
      writeFileSync(join(root, 'sdd-v2', 'router.directive.xml'), '<Directive>per `AX_GENERATED`</Directive>\n');
      writeFileSync(join(root, 'sdd-v2', 'nested', 'step.xml'), '<Directive>per `AX_GENERATED_NESTED`</Directive>\n');
      const { collectStaticDirectiveFiles } = await import('../lint-axioms.ts');
      const files = collectStaticDirectiveFiles(root);
      assert.deepEqual(
        files.map((f) => f.file),
        ['future-tree/nested/future.xml', 'knowledge.xml']
      );
      assert.deepEqual(
        lintUndefinedAxiomRefs(files).map((finding) => finding.id),
        ['AX_FUTURE', 'AX_ROOT']
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('tolerates a missing directives root', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'lint-axioms-static-empty-'));
    try {
      const { collectStaticDirectiveFiles } = await import('../lint-axioms.ts');
      assert.deepEqual(collectStaticDirectiveFiles(join(root, 'absent')), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('lintUncollectedAxiomFiles — every axiom is referenced or marked draft (T-B6-19, L-9)', () => {
  it('a connected axiom file (its partial id is in connectedPartials) is not a violation, draft or not', () => {
    const f = { file: 'audit/ax-foo.xml', text: '<Axiom id="AX_FOO">Body.</Axiom>\n' };
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set(['audit/ax-foo'])), []);
  });

  it('an unconnected axiom file marked status="draft" is not a violation', () => {
    const f = { file: 'audit/ax-foo.xml', text: '<Axiom id="AX_FOO" status="draft">Body.</Axiom>\n' };
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set()), []);
  });

  it('an unconnected axiom file with no draft marker is a violation', () => {
    const f = { file: 'audit/ax-foo.xml', text: '<Axiom id="AX_FOO">Body.</Axiom>\n' };
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set()), [
      { file: 'audit/ax-foo.xml', id: 'AX_FOO', reason: 'uncollected' },
    ]);
  });

  it('a file with no <Axiom id> tag at all is not this check\'s concern', () => {
    const f = { file: 'formats/f.xml', text: '<Format>A table.</Format>\n' };
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set()), []);
  });

  // V-BATCH-18 verifier F-2: the gate used to check "connected OR draft" and silently accept the
  // fourth state "connected AND draft" (reproduced in the verdict via ax-audit-hook.xml). A file's
  // draft label must be a lie the moment some directive actually collects it.
  it('a CONNECTED axiom file still marked status="draft" is a violation (F-2: draft label is now stale)', () => {
    const f = { file: 'audit/ax-foo.xml', text: '<Axiom id="AX_FOO" status="draft">Body.</Axiom>\n' };
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set(['audit/ax-foo'])), [
      { file: 'audit/ax-foo.xml', id: 'AX_FOO', reason: 'draft-but-connected' },
    ]);
  });

  // F-2's second half: PENDING_IN_OPEN_PR is a named, PR-scoped stand-in for draft — it must obey
  // the identical two rules as draft: accepted while NOT connected, a violation once it IS.
  it('an unconnected axiom file listed in a pendingInOpenPr map is not a violation', () => {
    const f = { file: 'critic/ax-bar.xml', text: '<Axiom id="AX_BAR">Body.</Axiom>\n' };
    const pending = new Map([['critic/ax-bar', 'PR #99 (some-open-branch)']]);
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set(), pending), []);
  });

  it('a CONNECTED axiom file still listed in pendingInOpenPr is a violation (its PR merged; entry is stale)', () => {
    const f = { file: 'critic/ax-bar.xml', text: '<Axiom id="AX_BAR">Body.</Axiom>\n' };
    const pending = new Map([['critic/ax-bar', 'PR #99 (some-open-branch)']]);
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set(['critic/ax-bar']), pending), [
      { file: 'critic/ax-bar.xml', id: 'AX_BAR', reason: 'pending-but-connected' },
    ]);
  });

  it('the module-level PENDING_IN_OPEN_PR is the default third argument', () => {
    const [firstKey] = PENDING_IN_OPEN_PR.keys();
    const f = { file: `${firstKey}.xml`, text: '<Axiom id="AX_WHATEVER">Body.</Axiom>\n' };
    // Not connected, not draft, but listed in the real default allowlist → accepted without passing it explicitly.
    assert.deepEqual(lintUncollectedAxiomFiles([f], new Set()), []);
  });
});

describe('formatUncollectedAxiomsReport', () => {
  it('empty findings → empty string', () => {
    assert.equal(formatUncollectedAxiomsReport([]), '');
  });

  it('reports the total count and each file:id with its reason', () => {
    const report = formatUncollectedAxiomsReport([
      { file: 'audit/ax-foo.xml', id: 'AX_FOO', reason: 'uncollected' },
      { file: 'process/ax-bar.xml', id: 'AX_BAR', reason: 'draft-but-connected' },
      { file: 'critic/ax-baz.xml', id: 'AX_BAZ', reason: 'pending-but-connected' },
    ]);
    assert.match(report, /^✗ 3 axiom file\(s\)/);
    assert.match(report, /audit\/ax-foo\.xml: AX_FOO — neither collected/);
    assert.match(report, /process\/ax-bar\.xml: AX_BAR — connected .* marked status="draft"/);
    assert.match(report, /critic\/ax-baz\.xml: AX_BAZ — connected .* PENDING_IN_OPEN_PR/);
  });
});

describe('every SDD-relevant axiom file is connected or draft, on the real tree (T-B6-19 lock)', () => {
  it('zero axiom files under the SDD-relevant dirs are neither connected nor marked draft', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const { join, relative, resolve, sep } = await import('node:path');
    const ROOT = resolve(import.meta.dirname, '../../..');
    const AXIOM_ROOT = join(ROOT, 'ai/kit/axiom');
    const TEMPLATES_ROOT = join(ROOT, 'ai/kit/templates/sdd-v2');
    const SDD_RELEVANT_DIRS = ['process', 'spec', 'audit', 'scaffold', 'boundary', 'critic', 'truth', 'interview'];

    function walk(dir: string, ext: string): string[] {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walk(p, ext));
        else if (p.endsWith(ext)) out.push(p);
      }
      return out;
    }

    let templateText = '';
    for (const p of walk(TEMPLATES_ROOT, '.hbs')) templateText += readFileSync(p, 'utf8') + '\n';
    const includeRe = /\{\{>\s*"axiom\/([^"]+)"\s*\}\}/g;
    const connectedPartials = new Set<string>();
    for (const m of templateText.matchAll(includeRe)) connectedPartials.add(m[1] as string);

    const axiomFiles = [];
    let total = 0;
    for (const dir of SDD_RELEVANT_DIRS) {
      for (const p of walk(join(AXIOM_ROOT, dir), '.xml')) {
        total++;
        axiomFiles.push({ file: relative(AXIOM_ROOT, p).split(sep).join('/'), text: readFileSync(p, 'utf8') });
      }
    }
    const violations = lintUncollectedAxiomFiles(axiomFiles, connectedPartials);
    assert.deepEqual(violations, [], `every SDD-relevant axiom file must be connected or draft; ${total} scanned`);
    assert.ok(total > 0, 'sanity: the walk actually found axiom files');
  });
});
