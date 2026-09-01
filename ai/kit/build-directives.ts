/**
 * Build ai/directives/*.xml from Handlebars templates under ai/kit/templates/.
 * Static build: each template rendered with empty data. Dynamic tools call render() with params.
 * Run: npm run build:directives
 *
 * Flags:
 *   --check              render + lint only, write nothing (alias: --dry-run)
 *   --out=<dir>          write rendered files under <dir> instead of ai/directives
 *   --assembly=<mode>    'monolith' or 'lazy' — applies only to a directive with no per-directive
 *                        override in ai/kit/assembly-manifest.json; priority is manifest override >
 *                        this flag > manifest defaultMode > built-in 'monolith' (DA-REQ-1). A
 *                        directive with zero <Step> blocks is never ELIGIBLE for lazy through this
 *                        flag or the manifest defaultMode alone — LazyDirectiveAssembler.assemble
 *                        requires at least one Step (DA-REQ-3), and a blanket flag meant to run
 *                        safely over the WHOLE template set must not throw on every Step-less
 *                        directive it happens to sweep in; such a directive silently stays
 *                        monolith and is named in a skip summary at the end of the run instead. An
 *                        EXPLICIT per-directive manifest override of 'lazy' on a Step-less
 *                        directive is a different signal — a deliberate choice about that one
 *                        directive, not a blanket default — and is left to fail the build loudly,
 *                        naming the directive, exactly as DA-REQ-3 requires.
 *
 * Two passes (delta-assembly — see ai/kit/delta-assembly.ts for the algorithm):
 *   1. Render every template as-is, in memory. This is also the source the READ_AND_USE_DIRECTIVE
 *      graph is extracted from — a reference can live inside a partial (e.g.
 *      `contract/process/readiness-preflight-gate` routes into migration-v1-v2 / readiness from
 *      5 different loading directives), so the graph must come from rendered text, not templates.
 *   2. For every `*.directive.xml` node, re-render with the partials guaranteed already in its
 *      loading directive's context (ctx(n), computed once over the whole graph) subtracted —
 *      a one-line "Inherited from…" note takes their place. Nodes with nothing to subtract
 *      (class 1 entry points, class 3 subagent worlds, cycle participants, or simply zero
 *      overlap) render byte-identical to pass 1.
 *
 * Assembly mode (ai/kit/lazy-assembly.ts) applies AFTER pass 2's delta subtraction, never before
 * and never in parallel with it (DA-REQ-10) — a directive resolved to 'lazy' is split from the
 * already delta-reduced text into one slim skeleton (written at the directive's normal path) plus
 * one step package per `<Step>` under `ai/directives/sdd-v2/<name>/steps/<id>.xml`. A directive
 * resolved to 'monolith' (the default, and every directive today) writes the same single file it
 * always has — this pass is a no-op for it, byte-identical to before this mode existed. Every lazy
 * directive is measured against StepBudgetGate before anything is written, and every package path
 * the skeleton prints is confirmed present on disk right after writing — either failure fails the
 * whole build, naming the directive (and step, where applicable) rather than writing quietly
 * (DA-REQ-12/14).
 *
 * After rendering, the dangling-axiom lint (lint-axioms.ts) runs over the FINAL (post-delta)
 * output and prints warnings (never fails the build) — see AUTHORING.md §7.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative, sep } from 'node:path';
import { createRenderer, walk, TEMPLATES, OUT_ROOT, KIT } from './render.ts';
import { lintDanglingAxioms, formatDanglingReport, type RenderedDirective } from './lint-axioms.ts';
import { buildDeltaPlan, excludedPartialsFor, applyDelta, type PlanNodeInput } from './delta-assembly.ts';
import { resolveAssemblyMode, stampFingerprint, LazyDirectiveAssembler, type AssemblyMode } from './lazy-assembly.ts';
import { check as checkStepBudgets } from './step-budget-gate.ts';
import {
  DIRECTIVE_ASSEMBLY_MARKER_FILE,
  serializeDirectiveAssemblyMarker,
} from './directive-assembly-marker.ts';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('--dry-run');
const outRoot = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? OUT_ROOT;
const SKILLS_ROOT = join(KIT, '..', 'skills');
const ASSEMBLY_XML_ROOT_PREFIX = 'ai/directives/';

const assemblyFlagRaw = args.find((a) => a.startsWith('--assembly='))?.slice('--assembly='.length);
// #region START_VALIDATE_ASSEMBLY_FLAG — invariant: an unrecognized --assembly value must fail loudly, never silently fall through to a default mode
if (assemblyFlagRaw !== undefined && assemblyFlagRaw !== 'monolith' && assemblyFlagRaw !== 'lazy') {
  console.error(`✗ [build-directives] Invalid --assembly value '${assemblyFlagRaw}' — expected 'monolith' or 'lazy'`);
  process.exit(1);
}
// #endregion END_VALIDATE_ASSEMBLY_FLAG
const assemblyFlag: AssemblyMode | undefined = assemblyFlagRaw;

// Human-readable build fingerprint (DA-REQ-7) — this package's own version, read the same way
// cli/gennady.ts resolves its own `--version` output, never a hex hash.
const buildFingerprint = stampFingerprint(
  (JSON.parse(readFileSync(join(KIT, '..', '..', 'package.json'), 'utf8')) as { version: string }).version
);

const { render } = createRenderer();

// Pass 1 — render every template as-is; this text also seeds the READ_AND_USE_DIRECTIVE graph.
interface Pass1Entry {
  rel: string; // e.g. "sdd-v2/router.directive.xml" (posix)
  hbsSource: string;
  renderedFull: string;
}
const pass1: Pass1Entry[] = [];
for (const t of walk(TEMPLATES, (p) => p.endsWith('.hbs'))) {
  const rel = relative(TEMPLATES, t).split(sep).join('/').replace(/\.hbs$/, '.xml');
  const hbsSource = readFileSync(t, 'utf8');
  pass1.push({ rel, hbsSource, renderedFull: render(hbsSource) });
}

const planNodes: PlanNodeInput[] = pass1
  .filter((e) => e.rel.endsWith('.directive.xml'))
  .map((e) => ({ id: 'ai/directives/' + e.rel, hbsSource: e.hbsSource, renderedFull: e.renderedFull }));
const plan = buildDeltaPlan(planNodes, SKILLS_ROOT);

// Pass 2 — re-render directive nodes with their computed context subtracted; everything else
// (formats/*, agent-inbox/*) is not part of the delta graph and keeps its pass-1 render.
const rendered: RenderedDirective[] = [];
const buildFailures: string[] = [];
const skippedLazyNoSteps: string[] = [];
for (const e of pass1) {
  const id = 'ai/directives/' + e.rel;
  const isDirective = e.rel.endsWith('.directive.xml');
  const excluded = isDirective ? excludedPartialsFor(plan, id) : [];
  const assembled =
    excluded.length === 0 ? e.renderedFull : render(applyDelta(e.hbsSource, excluded).source);
  // Delta-elided standalone partials can leave their indentation behind on an otherwise empty
  // line. Generated XML is canonical source output, so never emit whitespace-only diff noise.
  const out = assembled.replace(/[ \t]+$/gm, '');
  rendered.push({ file: e.rel, text: out });

  const resolvedMode: AssemblyMode = isDirective ? resolveAssemblyMode(e.rel, assemblyFlag) : 'monolith';
  const deltaSuffix = excluded.length ? ` (delta: -${excluded.length})` : '';

  // #region START_GATE_LAZY_BY_STEP_ELIGIBILITY — invariant (DA-REQ-3, DA-lazy-asm-D-8): a flag-
  // or defaultMode-driven 'lazy' (never an explicit per-directive override) downgrades to
  // 'monolith' for a Step-less directive instead of reaching assemble's own zero-Step throw.
  let mode: AssemblyMode = resolvedMode;
  if (mode === 'lazy' && isDirective) {
    const isExplicitOverride = resolveAssemblyMode(e.rel, 'monolith') === 'lazy';
    if (!isExplicitOverride && !/<Step[\s>]/.test(out)) {
      mode = 'monolith';
      skippedLazyNoSteps.push(e.rel);
    }
  }
  // #endregion END_GATE_LAZY_BY_STEP_ELIGIBILITY

  if (mode === 'lazy') {
    writeLazyDirective(e.rel, out, deltaSuffix, buildFailures);
    continue;
  }

  if (!checkOnly) {
    const dest = join(outRoot, e.rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out);
  }
  console.log(`${checkOnly ? '·' : '✓'} ${e.rel}${deltaSuffix}`);
}
console.log(`\n${checkOnly ? 'Checked' : 'Generated'} ${rendered.length} directive(s).`);

if (skippedLazyNoSteps.length > 0) {
  console.log(
    `${skippedLazyNoSteps.length} directive(s) skipped --assembly=lazy (zero <Step> blocks, stayed monolith): ${skippedLazyNoSteps.join(', ')}`
  );
}

const report = formatDanglingReport(lintDanglingAxioms(rendered));
if (report) console.warn(`\n${report}`);

// #region START_FAIL_ON_LAZY_BUILD_FAILURES — invariant: a budget overage or a missing package file never ships silently (DA-REQ-12/14); every accumulated failure is printed before the process exits non-zero
if (buildFailures.length > 0) {
  console.error(`\n✗ ${buildFailures.length} lazy-assembly failure(s):`);
  for (const failure of buildFailures) console.error(`  - ${failure}`);
  process.exit(1);
}
// #endregion END_FAIL_ON_LAZY_BUILD_FAILURES

if (!checkOnly) {
  writeFileSync(
    join(outRoot, DIRECTIVE_ASSEMBLY_MARKER_FILE),
    serializeDirectiveAssemblyMarker(assemblyFlag ?? 'manifest')
  );
}

/**
 * Splits one delta-reduced directive into a skeleton + step packages (DA-REQ-3/4/10), measures the
 * result against `StepBudgetGate` (DA-REQ-6/14), and — only when within budget — writes the
 * skeleton at the directive's normal path plus one package per Step, then confirms every package
 * path the skeleton just printed actually exists on disk (DA-REQ-12). Every failure is appended to
 * `failures` rather than thrown, so one over-budget or malformed directive does not hide the
 * diagnostics for the rest of this build run; `--check` renders and measures but writes nothing.
 */
function writeLazyDirective(rel: string, deltaReducedText: string, deltaSuffix: string, failures: string[]): void {
  const directiveName = basename(rel, '.directive.xml');

  let assembled: ReturnType<typeof LazyDirectiveAssembler.assemble>;
  // #region START_ASSEMBLE_LAZY_SPLIT — invariant: a directive with zero <Step> blocks or a Step missing its id attribute is a build misconfiguration (DA-REQ-3), reported per-directive rather than crashing the whole run
  try {
    assembled = LazyDirectiveAssembler.assemble({
      directiveName,
      sourceText: deltaReducedText,
      fingerprint: buildFingerprint,
      loadTopology: directiveName === 'scaffold' ? 'chain' : 'index',
    });
  } catch (cause) {
    failures.push(`${rel}: lazy split failed — ${cause instanceof Error ? cause.message : String(cause)}`);
    return;
  }
  // #endregion END_ASSEMBLE_LAZY_SPLIT

  const { skeleton, packages } = assembled;
  const budgetFindings = checkStepBudgets(
    skeleton.text,
    packages.map((pkg) => ({ stepId: pkg.stepId, text: pkg.text }))
  );
  // A 'warning' finding is the soft skeleton-token target (DA-REQ-6, DA-DL-18): reported, never
  // blocks the write. Only an 'error' finding (any of the three hard ceilings) stops the build —
  // same distinction the check:directive-budgets CLI in step-budget-gate.ts already makes.
  const budgetErrors = budgetFindings.filter((finding) => finding.severity === 'error');
  for (const finding of budgetFindings) {
    if (finding.severity === 'warning') {
      console.warn(
        `⚠ ${rel} (${finding.artifact}): ${finding.limitKind} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — soft target, build continues`
      );
    }
  }
  if (budgetErrors.length > 0) {
    for (const finding of budgetErrors) {
      failures.push(
        `${rel} (${finding.artifact}): ${finding.limitKind} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage}`
      );
    }
    console.log(`${checkOnly ? '·' : '✗'} ${rel}${deltaSuffix} (lazy: over budget, not written)`);
    return;
  }

  console.log(
    `${checkOnly ? '·' : '✓'} ${rel}${deltaSuffix} (lazy: ${packages.length} step package${packages.length === 1 ? '' : 's'})`
  );
  if (checkOnly) return;

  // #region START_WRITE_PACKAGES_BEFORE_SKELETON — invariant (DA-REQ-12, DA-lazy-asm-D-9): the
  // skeleton promises every package path it prints, so every package is written and confirmed
  // FIRST — an interruption can then only ever leave the skeleton un-written, never dangling.
  const packageFailures: string[] = [];
  for (const pkg of packages) {
    const packageDest = join(outRoot, pkg.relativePath.slice(ASSEMBLY_XML_ROOT_PREFIX.length));
    mkdirSync(dirname(packageDest), { recursive: true });
    writeFileSync(packageDest, pkg.text.replace(/[ \t]+$/gm, ''));
    if (!existsSync(packageDest)) {
      packageFailures.push(`${rel} (step ${pkg.stepId}): package file missing after write — ${packageDest}`);
    }
  }
  if (packageFailures.length > 0) {
    failures.push(...packageFailures);
    return; // never write a skeleton unless every path it would print was already confirmed present
  }

  const dest = join(outRoot, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, skeleton.text.replace(/[ \t]+$/gm, ''));
  // #endregion END_WRITE_PACKAGES_BEFORE_SKELETON
}
