/**
 * Build ai/directives/*.xml from Handlebars templates under ai/kit/templates/.
 * Static build: each template rendered with empty data. Dynamic tools call render() with params.
 * Run: npm run build:directives
 *
 * Flags:
 *   --check       render + lint only, write nothing (alias: --dry-run)
 *   --out=<dir>   write rendered files under <dir> instead of ai/directives
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
 * After rendering, the dangling-axiom lint (lint-axioms.ts) runs over the FINAL (post-delta)
 * output and prints warnings (never fails the build) — see AUTHORING.md §7.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { createRenderer, walk, TEMPLATES, OUT_ROOT, KIT } from './render.ts';
import { lintDanglingAxioms, formatDanglingReport, type RenderedDirective } from './lint-axioms.ts';
import { buildDeltaPlan, excludedPartialsFor, applyDelta, type PlanNodeInput } from './delta-assembly.ts';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('--dry-run');
const outRoot = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? OUT_ROOT;
const SKILLS_ROOT = join(KIT, '..', 'skills');

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
for (const e of pass1) {
  const id = 'ai/directives/' + e.rel;
  const excluded = e.rel.endsWith('.directive.xml') ? excludedPartialsFor(plan, id) : [];
  const out = excluded.length === 0 ? e.renderedFull : render(applyDelta(e.hbsSource, excluded).source);
  rendered.push({ file: e.rel, text: out });
  if (!checkOnly) {
    const dest = join(outRoot, e.rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out);
  }
  console.log(`${checkOnly ? '·' : '✓'} ${e.rel}${excluded.length ? ` (delta: -${excluded.length})` : ''}`);
}
console.log(`\n${checkOnly ? 'Checked' : 'Generated'} ${rendered.length} directive(s).`);

const report = formatDanglingReport(lintDanglingAxioms(rendered));
if (report) console.warn(`\n${report}`);
