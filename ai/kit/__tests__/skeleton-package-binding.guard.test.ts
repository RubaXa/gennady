// @file: SkeletonPackageBindingGuard — for the three real lazy pilots (audit, scaffold,
//   phase-execution-protocol), proves every package path a skeleton prints resolves on disk, every
//   package's version fingerprint matches its skeleton header, and the lazy split loses or
//   duplicates nothing relative to the same directive's monolith render (DA-REQ-15's "no-loss"
//   invariant). Works entirely off files on disk plus the build plan (LazyDirectiveAssembler) —
//   never calls the deferred `sdd-step` CLI (DA-DL-15), per directive-assembly.spec.md's own
//   SkeletonPackageBindingGuard entity description.
// @consumers: CI (node:test runner)
// @tasks: DA-lazy-asm

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { createRenderer, walk, TEMPLATES, OUT_ROOT, KIT } from '../render.ts';
import { buildDeltaPlan, excludedPartialsFor, applyDelta, type PlanNodeInput } from '../delta-assembly.ts';
import {
  LazyDirectiveAssembler,
  resolveAssemblyMode,
  stampFingerprint,
  findVersionMismatches,
  type StepPackage,
  type DirectiveSkeleton,
} from '../lazy-assembly.ts';

const SKILLS_ROOT = join(KIT, '..', 'skills');
const PROJECT_ROOT = join(KIT, '..', '..');

/** The three DA-REQ-2 pilot directives, addressed by their manifest-relative key. */
const PILOT_KEYS = [
  'sdd-v2/audit.directive.xml',
  'sdd-v2/scaffold.directive.xml',
  'sdd-v2/phase-execution-protocol.directive.xml',
] as const;

type PilotFixture = {
  /** @purpose Manifest-relative key, e.g. 'sdd-v2/audit.directive.xml' */
  directiveKey: string;
  /** @purpose Bare directive folder name, e.g. 'audit' */
  directiveName: string;
  /** @purpose Delta-reduced render — the invariant's monolith-side reference, mirroring build-directives.ts pass 1+2 */
  monolithText: string;
};

type SkeletonBindingContext = {
  pilots: PilotFixture[];
  fingerprint: string;
};

/**
 * Renders every sdd-v2 directive template, computes the delta plan, and delta-reduces the three
 * pilots — the exact pass 1 + pass 2 build-directives.ts itself runs before assembly-mode
 * resolution. This is this file's single context factory (`AX_ONE_UNIFIED_CONTEXT_PER_FILE`); every
 * case below calls it and reads off the same shape.
 */
function createSkeletonBindingContext(): SkeletonBindingContext {
  const { render } = createRenderer();
  const pass1: Array<{ rel: string; hbsSource: string; renderedFull: string }> = [];
  for (const t of walk(TEMPLATES, (p) => p.endsWith('.hbs'))) {
    const rel = relative(TEMPLATES, t).split(sep).join('/').replace(/\.hbs$/, '.xml');
    if (!rel.endsWith('.directive.xml')) continue;
    const hbsSource = readFileSync(t, 'utf8');
    pass1.push({ rel, hbsSource, renderedFull: render(hbsSource) });
  }

  const nodes: PlanNodeInput[] = pass1.map((e) => ({
    id: 'ai/directives/' + e.rel,
    hbsSource: e.hbsSource,
    renderedFull: e.renderedFull,
  }));
  const plan = buildDeltaPlan(nodes, SKILLS_ROOT);

  const fingerprint = stampFingerprint(
    (JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8')) as { version: string }).version
  );

  const pilots: PilotFixture[] = PILOT_KEYS.map((directiveKey) => {
    const entry = pass1.find((e) => e.rel === directiveKey);
    assert.ok(entry, `pilot template not found among rendered sdd-v2 directives: ${directiveKey}`);
    const id = 'ai/directives/' + entry!.rel;
    const excluded = excludedPartialsFor(plan, id);
    const monolithText = excluded.length === 0 ? entry!.renderedFull : render(applyDelta(entry!.hbsSource, excluded).source);
    return { directiveKey, directiveName: basename(directiveKey, '.directive.xml'), monolithText };
  });

  return { pilots, fingerprint };
}

/** Every runtime `READ_AND_USE_DIRECTIVE("<path>")` package path a skeleton prints, in listed order. */
function extractPackagePaths(skeletonText: string): string[] {
  const pattern = /Before executing this step, READ_AND_USE_DIRECTIVE\("([^"]+)"\)\./g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(skeletonText))) paths.push(match[1]!);
  return paths;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One matched top-level `<TagName id="...">...</TagName>` block — regex-based, deliberately NOT
 *  the balanced-tag scanner `../lazy-assembly.ts` uses internally, so this guard cannot share a
 *  scanning bug with the code it checks. Correct for real directive content: Step/Axiom/Contract
 *  never nest a same-named tag in these templates (Axiom/Contract partials render inside
 *  `<BeliefState>`/`<OutputContracts>`, never inside a `<Step>` body). */
type NamedBlock = { id: string; fullMatch: string; start: number; end: number };

function extractNamedBlocks(source: string, tagName: string): NamedBlock[] {
  const pattern = new RegExp(`<${tagName}\\s+id="([^"]+)"[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'g');
  const blocks: NamedBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    blocks.push({ id: match[1]!, fullMatch: match[0], start: match.index, end: match.index + match[0].length });
  }
  return blocks;
}

function countPackagesContaining(packages: readonly StepPackage[], needle: string): number {
  return packages.filter((pkg) => pkg.text.includes(needle)).length;
}

/** Removes each listed substring's first (only expected) occurrence from `text`, in order. */
function removeAllOnce(text: string, substrings: readonly string[]): string {
  let result = text;
  for (const substring of substrings) {
    const index = result.indexOf(substring);
    assert.ok(index !== -1, `expected substring not found while building the residual (length ${substring.length})`);
    result = result.slice(0, index) + result.slice(index + substring.length);
  }
  return result;
}

/** Strips the skeleton's fingerprint + rebuild-hint header, returning everything after the blank-line separator (DA-REQ-7/13 header shape). */
function extractSkeletonBody(skeletonText: string, fingerprint: string): string {
  assert.ok(
    skeletonText.startsWith(fingerprint + '\n'),
    'skeleton must open with the build fingerprint on its own line (DA-REQ-7)'
  );
  const separatorIndex = skeletonText.indexOf('\n\n');
  assert.ok(separatorIndex !== -1, 'skeleton header must be followed by a blank-line separator before the body');
  return skeletonText.slice(separatorIndex + 2);
}

/** Locates one Step's exact step-list-entry substring inside the skeleton body (DA-REQ-5 shape). */
function extractStepListEntry(skeletonBody: string, pkg: StepPackage): string {
  const pattern = new RegExp(
    '- \\*\\*' +
      escapeRegExp(pkg.stepId) +
      '\\*\\* — [^\\n]*?Before executing this step, READ_AND_USE_DIRECTIVE\\("' +
      escapeRegExp(pkg.relativePath) +
      '"\\)\\.'
  );
  const match = pattern.exec(skeletonBody);
  assert.ok(match, `${pkg.stepId}: step-list entry not found in skeleton body`);
  return match![0];
}

describe('SkeletonPackageBindingGuard', () => {
  it('every path a pilot skeleton prints exists on disk after a real build', () => {
    const ctx = createSkeletonBindingContext();
    for (const pilot of ctx.pilots) {
      // DA-REQ-2: the three heavyweights must carry an explicit lazy override in the real manifest.
      assert.equal(
        resolveAssemblyMode(pilot.directiveKey),
        'lazy',
        `${pilot.directiveKey}: expected an explicit 'lazy' override in ai/kit/assembly-manifest.json`
      );

      const skeletonText = readFileSync(join(OUT_ROOT, pilot.directiveKey), 'utf8');
      const packagePaths = extractPackagePaths(skeletonText);
      assert.ok(packagePaths.length > 0, `${pilot.directiveKey}: skeleton lists zero step packages`);

      // DA-REQ-12: every path the skeleton prints must resolve on disk — a dangling reference never ships.
      for (const relativePath of packagePaths) {
        const absolutePath = join(PROJECT_ROOT, relativePath);
        assert.ok(
          existsSync(absolutePath),
          `${pilot.directiveKey}: package path printed by the skeleton does not exist on disk: ${relativePath}`
        );
      }
    }
  });

  it("each pilot directive's skeleton header version matches every package first line", () => {
    const ctx = createSkeletonBindingContext();
    for (const pilot of ctx.pilots) {
      const skeletonText = readFileSync(join(OUT_ROOT, pilot.directiveKey), 'utf8');
      const skeletonFingerprint = skeletonText.split('\n', 1)[0]!;
      const packagePaths = extractPackagePaths(skeletonText);
      assert.ok(packagePaths.length > 0, `${pilot.directiveKey}: skeleton lists zero step packages`);

      const skeleton: DirectiveSkeleton = {
        directiveName: pilot.directiveName,
        fingerprint: skeletonFingerprint,
        text: skeletonText,
      };
      const packages: StepPackage[] = packagePaths.map((relativePath) => {
        const text = readFileSync(join(PROJECT_ROOT, relativePath), 'utf8');
        return {
          stepId: basename(relativePath, '.xml'),
          relativePath,
          fingerprint: text.split('\n', 1)[0]!,
          text,
        };
      });

      // DA-REQ-8: post-facto version parity — the same fingerprint everywhere, or a named mismatch.
      const mismatches = findVersionMismatches(skeleton, packages);
      assert.deepEqual(
        mismatches,
        [],
        `${pilot.directiveKey}: version mismatches found: ${JSON.stringify(mismatches)}`
      );
    }
  });

  it(
    "each pilot directive's monolith and lazy renders are equivalent modulo step-list housekeeping and package version headers",
    () => {
      const ctx = createSkeletonBindingContext();
      for (const pilot of ctx.pilots) {
        const { skeleton, packages } = LazyDirectiveAssembler.assemble({
          directiveName: pilot.directiveName,
          sourceText: pilot.monolithText,
          fingerprint: ctx.fingerprint,
        });

        const steps = extractNamedBlocks(pilot.monolithText, 'Step');
        const stepRanges = steps.map((s) => ({ start: s.start, end: s.end }));
        const isWithinAnyStep = (position: number) => stepRanges.some((r) => position >= r.start && position < r.end);
        const axiomsAndContracts = [
          ...extractNamedBlocks(pilot.monolithText, 'Axiom'),
          ...extractNamedBlocks(pilot.monolithText, 'Contract'),
        ].filter((block) => !isWithinAnyStep(block.start));

        assert.equal(
          packages.length,
          steps.length,
          `${pilot.directiveName}: assembled ${packages.length} package(s) but the monolith render has ${steps.length} <Step> block(s)`
        );

        // #region START_NO_LOSS_STEPS — every monolith Step body lands in exactly one package, verbatim, never in the skeleton
        for (const step of steps) {
          const owner = packages.find((pkg) => pkg.text.includes(step.fullMatch));
          assert.ok(owner, `${pilot.directiveName}: Step ${step.id} body missing from every package — lost`);
          assert.equal(
            owner!.stepId,
            step.id,
            `${pilot.directiveName}: Step ${step.id} body landed in package ${owner!.stepId}'s file instead of its own`
          );
          const totalOccurrences =
            (skeleton.text.includes(step.fullMatch) ? 1 : 0) + countPackagesContaining(packages, step.fullMatch);
          assert.equal(
            totalOccurrences,
            1,
            `${pilot.directiveName}: Step ${step.id} body appears ${totalOccurrences} time(s) across skeleton+packages (want exactly 1)`
          );
        }
        // #endregion END_NO_LOSS_STEPS

        // #region START_NO_LOSS_AXIOMS_CONTRACTS — every top-level Axiom/Contract survives exactly once — skeleton (cross-cutting) or one package (single-step), never both, never zero
        for (const block of axiomsAndContracts) {
          const totalOccurrences =
            (skeleton.text.includes(block.fullMatch) ? 1 : 0) + countPackagesContaining(packages, block.fullMatch);
          assert.equal(
            totalOccurrences,
            1,
            `${pilot.directiveName}: block ${block.id} appears ${totalOccurrences} time(s) across skeleton+packages (0 = lost, 2+ = duplicated)`
          );
        }
        // #endregion END_NO_LOSS_AXIOMS_CONTRACTS

        // #region START_WRAPPER_RESIDUAL_MATCH — scaffolding left over once Steps + single-step Axiom/Contract blocks are removed is byte-identical on both sides — proves DA-REQ-11: content is relocated, never rewritten
        const singleStepBlocks = axiomsAndContracts.filter(
          (block) => countPackagesContaining(packages, block.fullMatch) === 1
        );
        const monolithResidual = removeAllOnce(pilot.monolithText, [
          ...steps.map((s) => s.fullMatch),
          ...singleStepBlocks.map((b) => b.fullMatch),
        ]);

        const skeletonBody = extractSkeletonBody(skeleton.text, ctx.fingerprint);
        const stepListEntries = packages.map((pkg) => extractStepListEntry(skeletonBody, pkg));
        const skeletonResidual = removeAllOnce(skeletonBody, stepListEntries);

        assert.equal(
          skeletonResidual,
          monolithResidual,
          `${pilot.directiveName}: skeleton wrapper text (minus step-list housekeeping) diverges from the monolith render (minus Steps and single-step Axiom/Contract blocks)`
        );
        // #endregion END_WRAPPER_RESIDUAL_MATCH
      }
    }
  );
});
