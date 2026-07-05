/**
 * Build ai/directives/*.xml from Handlebars templates under ai/kit/templates/.
 * Static build: each template rendered with empty data. Dynamic tools call render() with params.
 * Run: npm run build:directives
 *
 * Flags:
 *   --check       render + lint only, write nothing (alias: --dry-run)
 *   --out=<dir>   write rendered files under <dir> instead of ai/directives
 *
 * After rendering, the dangling-axiom lint (lint-axioms.ts) runs over the whole output and
 * prints warnings (never fails the build) — see AUTHORING.md §7.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createRenderer, walk, TEMPLATES, OUT_ROOT } from './render.ts';
import { lintDanglingAxioms, formatDanglingReport, type RenderedDirective } from './lint-axioms.ts';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('--dry-run');
const outRoot = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? OUT_ROOT;

const { render } = createRenderer();

const rendered: RenderedDirective[] = [];
for (const t of walk(TEMPLATES, (p) => p.endsWith('.hbs'))) {
  const rel = relative(TEMPLATES, t).replace(/\.hbs$/, '.xml');
  const out = render(readFileSync(t, 'utf8'));
  rendered.push({ file: rel, text: out });
  if (!checkOnly) {
    const dest = join(outRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out);
  }
  console.log(`${checkOnly ? '·' : '✓'} ${rel}`);
}
console.log(`\n${checkOnly ? 'Checked' : 'Generated'} ${rendered.length} directive(s).`);

const report = formatDanglingReport(lintDanglingAxioms(rendered));
if (report) console.warn(`\n${report}`);
