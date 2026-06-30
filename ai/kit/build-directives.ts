/**
 * Build ai/directives/*.xml from Handlebars templates under ai/kit/templates/.
 * Static build: each template rendered with empty data. Dynamic tools call render() with params.
 * Run: npm run build:directives
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createRenderer, walk, TEMPLATES, OUT_ROOT } from './render.ts';

const { render } = createRenderer();

let count = 0;
for (const t of walk(TEMPLATES, (p) => p.endsWith('.hbs'))) {
  const rel = relative(TEMPLATES, t).replace(/\.hbs$/, '.xml');
  const out = render(readFileSync(t, 'utf8'));
  const dest = join(OUT_ROOT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  console.log(`✓ ${rel}`);
  count++;
}
console.log(`\nGenerated ${count} directive(s).`);
