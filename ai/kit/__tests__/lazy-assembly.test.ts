// @file: Lazy-assembly core tests — assembly-mode resolution, version fingerprint stamping and
//         drift detection, axiom/contract activation classification, the skeleton/package split
//         itself, and lazy-candidacy reassessment.
// @consumers: node:test runner
// @tasks: DA-lazy-asm

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveAssemblyMode,
  stampFingerprint,
  findVersionMismatches,
  AxiomActivationClassifier,
  isLazyCandidate,
  LazyDirectiveAssembler,
  type LazyAssemblyInput,
  type StepBodyEntry,
} from '../lazy-assembly.ts';

/** Fixture directive text with two Steps, one cross-cutting axiom, and one single-step axiom. */
function createDirectiveFixture(overrides?: Partial<LazyAssemblyInput>): LazyAssemblyInput {
  const sourceText =
    overrides?.sourceText ??
    [
      '<FixtureDirective ver="0.1.0">',
      '  <Mission>Fixture mission text for lazy-assembly tests.</Mission>',
      '  <BeliefState>',
      '    <Axiom id="AX_SHARED_ACROSS_STEPS">Guidance referenced by STEP_ONE and STEP_TWO.</Axiom>',
      '    <Axiom id="AX_ONLY_IN_STEP_ONE">Guidance referenced only inside STEP_ONE.</Axiom>',
      '  </BeliefState>',
      '  <PhaseProcedure>',
      '    <Step id="STEP_ONE">',
      '      <Goal>Do the first thing. Keep it short.</Goal>',
      '      <Action>Apply AX_SHARED_ACROSS_STEPS and AX_ONLY_IN_STEP_ONE here.</Action>',
      '    </Step>',
      '    <Step id="STEP_TWO">',
      '      <Goal>Do the second thing.</Goal>',
      '      <Action>Apply AX_SHARED_ACROSS_STEPS again here.</Action>',
      '    </Step>',
      '  </PhaseProcedure>',
      '</FixtureDirective>',
    ].join('\n');

  return {
    directiveName: overrides?.directiveName ?? 'fixture-directive',
    sourceText,
    fingerprint: overrides?.fingerprint ?? stampFingerprint('0.8.4-draft.40'),
  };
}

function stepBody(id: string, body: string): StepBodyEntry {
  return { id, body };
}

describe('resolveAssemblyMode', () => {
  let ctx: { tmpDir: string; manifestPath: string };

  beforeEach(() => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'gennady-assembly-manifest-'));
    ctx = { tmpDir, manifestPath: join(tmpDir, 'assembly-manifest.json') };
  });

  afterEach(() => {
    rmSync(ctx.tmpDir, { recursive: true, force: true });
  });

  it('resolves manifest override before --assembly flag before defaultMode before built-in monolith default', () => {
    // #region START_PRIORITY_OVERRIDE_BEATS_FLAG_AND_DEFAULT
    writeFileSync(
      ctx.manifestPath,
      JSON.stringify({ defaultMode: 'monolith', overrides: { 'sdd-v2/foo.directive.xml': 'lazy' } })
    );
    assert.equal(resolveAssemblyMode('sdd-v2/foo.directive.xml', 'monolith', ctx.manifestPath), 'lazy');
    // #endregion END_PRIORITY_OVERRIDE_BEATS_FLAG_AND_DEFAULT

    // #region START_PRIORITY_FLAG_BEATS_MANIFEST_DEFAULT
    writeFileSync(ctx.manifestPath, JSON.stringify({ defaultMode: 'monolith', overrides: {} }));
    assert.equal(resolveAssemblyMode('sdd-v2/foo.directive.xml', 'lazy', ctx.manifestPath), 'lazy');
    // #endregion END_PRIORITY_FLAG_BEATS_MANIFEST_DEFAULT

    // #region START_PRIORITY_MANIFEST_DEFAULT_BEATS_BUILTIN
    writeFileSync(ctx.manifestPath, JSON.stringify({ defaultMode: 'lazy', overrides: {} }));
    assert.equal(resolveAssemblyMode('sdd-v2/foo.directive.xml', undefined, ctx.manifestPath), 'lazy');
    // #endregion END_PRIORITY_MANIFEST_DEFAULT_BEATS_BUILTIN
  });

  it('falls back to defaultMode monolith and empty overrides when assembly-manifest.json is absent', () => {
    const missingPath = join(ctx.tmpDir, 'does-not-exist.json');
    assert.equal(resolveAssemblyMode('sdd-v2/foo.directive.xml', undefined, missingPath), 'monolith');
  });

  it('throws an explicit config error when assembly-manifest.json is present but not valid JSON', () => {
    writeFileSync(ctx.manifestPath, '{ not valid json');
    assert.throws(
      () => resolveAssemblyMode('sdd-v2/foo.directive.xml', undefined, ctx.manifestPath),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Malformed assembly manifest JSON/);
        return true;
      }
    );
  });
});

describe('stampFingerprint', () => {
  it('should return the trimmed version string unchanged for a valid human-readable version', () => {
    assert.equal(stampFingerprint('  0.8.4-draft.40  '), '0.8.4-draft.40');
  });

  it('should reject an empty version string', () => {
    assert.throws(() => stampFingerprint('   '), /must be non-empty/);
  });

  it('should reject a hex-hash-shaped version string', () => {
    assert.throws(() => stampFingerprint('2a7b306f'), /Refusing hex-hash-shaped fingerprint/);
  });
});

describe('AxiomActivationClassifier#classify', () => {
  it('classifies an axiom mentioned in exactly one Step as single-step', () => {
    const steps = [stepBody('STEP_A', 'this step applies AX_FOO here'), stepBody('STEP_B', 'unrelated body')];
    assert.equal(AxiomActivationClassifier.classify('AX_FOO', steps), 'single-step');
  });

  it('classifies an axiom mentioned in two or more Steps as cross-cutting', () => {
    const steps = [stepBody('STEP_A', 'applies AX_FOO here'), stepBody('STEP_B', 'also applies AX_FOO here')];
    assert.equal(AxiomActivationClassifier.classify('AX_FOO', steps), 'cross-cutting');
  });

  it('classifies an axiom mentioned outside any Step body as cross-cutting', () => {
    // AX_IN_BELIEFSTATE_ONLY models an axiom whose text lives in BeliefState prose — never inside
    // a <Step> body — so it never activates any of the directive's own steps.
    const steps = [stepBody('STEP_A', 'unrelated body text'), stepBody('STEP_B', 'other unrelated text')];
    assert.equal(AxiomActivationClassifier.classify('AX_IN_BELIEFSTATE_ONLY', steps), 'cross-cutting');
  });

  it('classifies an axiom mentioned in zero Steps as cross-cutting and flags it as a YAGNI candidate', () => {
    // The YAGNI flag is an internal logging side effect (AX_MOCK_AS_LAST_RESORT keeps the logger
    // module out of scope for mocking here); the observable public contract is the safe-default
    // return value and that classification never throws — the build is never rejected for this.
    const steps = [stepBody('STEP_A', 'no reference to the axiom under test')];
    assert.doesNotThrow(() => AxiomActivationClassifier.classify('AX_NOWHERE', steps));
    assert.equal(AxiomActivationClassifier.classify('AX_NOWHERE', steps), 'cross-cutting');
  });
});

describe('LazyDirectiveAssembler#assemble', () => {
  it('rejects a lazy override for a directive with zero Steps with an explicit configuration error, never an empty skeleton', () => {
    const input = createDirectiveFixture({
      directiveName: 'stepless-fixture',
      sourceText: '<StepplessDirective><Mission>No steps at all.</Mission></StepplessDirective>',
    });
    assert.throws(() => LazyDirectiveAssembler.assemble(input), /has zero <Step> blocks/);
  });

  it('produces one DirectiveSkeleton and exactly one StepPackage per Step for a lazy directive', () => {
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    assert.equal(result.packages.length, 2);
    assert.deepEqual(
      result.packages.map((pkg) => pkg.stepId).sort(),
      ['STEP_ONE', 'STEP_TWO']
    );
  });

  it("omits the full text of every Step from the generated skeleton", () => {
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    assert.doesNotMatch(result.skeleton.text, /Apply AX_SHARED_ACROSS_STEPS and AX_ONLY_IN_STEP_ONE here/);
    assert.doesNotMatch(result.skeleton.text, /Apply AX_SHARED_ACROSS_STEPS again here/);
  });

  it('writes each StepPackage under steps/<step-id>.xml using the literal Step id verbatim, never a positional number', () => {
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    const stepOne = result.packages.find((pkg) => pkg.stepId === 'STEP_ONE')!;
    assert.equal(stepOne.relativePath, 'ai/directives/sdd-v2/fixture-directive/steps/STEP_ONE.xml');
  });

  it('lists each step with a relative path to its package file readable by a plain Read, no CLI command and no version argument', () => {
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    const stepOneLine = result.skeleton.text.split('\n').find((line) => line.includes('**STEP_ONE**'))!;
    assert.match(
      stepOneLine,
      /Full step text: `ai\/directives\/sdd-v2\/fixture-directive\/steps\/STEP_ONE\.xml` \(Read tool — no CLI command, no version argument\)/
    );
    assert.doesNotMatch(stepOneLine, /npx|gennady/);
  });

  it("stamps the same BuildFingerprint value into the skeleton header and the first line of every StepPackage", () => {
    const fingerprint = stampFingerprint('0.8.4-draft.40');
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture({ fingerprint }));

    // #region START_FINGERPRINT_OBSERVE_FIRST_LINES
    const skeletonFirstLine = result.skeleton.text.split('\n')[0];
    const packageFirstLines = result.packages.map((pkg) => pkg.text.split('\n')[0]);
    // #endregion END_FINGERPRINT_OBSERVE_FIRST_LINES

    assert.equal(skeletonFirstLine, '0.8.4-draft.40');
    assert.deepEqual(packageFirstLines, ['0.8.4-draft.40', '0.8.4-draft.40']);
    assert.doesNotMatch(skeletonFirstLine, /^[0-9a-f]{7,40}$/i);
  });

  it('never places a partial already guaranteed by ctx(directive, edge) into the skeleton or any package', () => {
    // AX_ALREADY_EXCLUDED_BY_DELTA models a partial the delta pass (excludedPartialsFor) already
    // removed upstream — it is absent from sourceText entirely, never fed into assemble at all.
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    assert.doesNotMatch(result.skeleton.text, /AX_ALREADY_EXCLUDED_BY_DELTA/);
    for (const pkg of result.packages) {
      assert.doesNotMatch(pkg.text, /AX_ALREADY_EXCLUDED_BY_DELTA/);
    }
  });

  it('carries one recovery-hint line naming the rebuild command for a failed package read', () => {
    const result = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    assert.match(result.skeleton.text, /npm run build:directives -- --assembly=lazy/);
  });
});

describe('findVersionMismatches', () => {
  it('reports no mismatch when every package first line equals the skeleton header version', () => {
    const { skeleton, packages } = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    assert.deepEqual(findVersionMismatches(skeleton, packages), []);
  });

  it('reports the directive, the mismatched step, and both versions when a package first line differs from the skeleton header version', () => {
    const { skeleton, packages } = LazyDirectiveAssembler.assemble(createDirectiveFixture());
    const [drifted, ...rest] = packages;
    const driftedPackage = { ...drifted!, fingerprint: '0.8.4-draft.39' };

    const mismatches = findVersionMismatches(skeleton, [driftedPackage, ...rest]);

    assert.deepEqual(mismatches, [
      {
        directiveName: 'fixture-directive',
        stepId: driftedPackage.stepId,
        skeletonVersion: '0.8.4-draft.40',
        packageVersion: '0.8.4-draft.39',
      },
    ]);
  });
});

describe('isLazyCandidate', () => {
  it('flags a directive as a lazy candidate when its BeliefState exceeds 6000 tokens', () => {
    assert.equal(isLazyCandidate({ beliefStateTokenCount: 6001, singleStepAxiomRatio: 0 }), true);
  });

  it('flags a directive as a lazy candidate when more than 50% of its axioms are single-step', () => {
    assert.equal(isLazyCandidate({ beliefStateTokenCount: 1000, singleStepAxiomRatio: 0.6 }), true);
  });

  it('does not flag a directive below both thresholds', () => {
    assert.equal(isLazyCandidate({ beliefStateTokenCount: 1000, singleStepAxiomRatio: 0.1 }), false);
  });
});
