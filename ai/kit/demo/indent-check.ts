/**
 * Stress-test indentation: for every kit brick, include it at indent depth 2 (4 spaces) and
 * assert each output line equals (4 spaces + normalized brick line). Surfaces any case where
 * the indentation or the post-render formatter corrupts a brick's interior (code fences,
 * markdown tables, nested lists, XML-like example content).
 * Run: npx tsx ai/kit/demo/indent-check.ts
 */
import { readFileSync } from 'node:fs';
import { createRenderer, walk, normalizeBrick, KIT, TEMPLATES } from '../render.ts';

const { render } = createRenderer();
const PAD = '    '; // include at depth 2

const bricks = walk(KIT, (p) => p.endsWith('.xml') && !p.startsWith(TEMPLATES + '/'));
let ok = 0;
const fails: { brick: string; line: number; exp: string; got: string }[] = [];

for (const f of bricks) {
  const rel = f.replace(KIT + '/', '').replace(/\.xml$/, '');
  const canonical = normalizeBrick(readFileSync(f, 'utf8')).split('\n');
  const expected = canonical.map((l) => (l === '' ? '' : PAD + l));

  // wrap so the include sits at depth 2; <Wrap> children are at depth 2
  const tpl = `<Root>\n  <Wrap>\n    {{> "${rel}"}}\n  </Wrap>\n</Root>\n`;
  const out = render(tpl).split('\n');
  // extract lines between <Wrap> and </Wrap>
  const start = out.findIndex((l) => l.trim() === '<Wrap>') + 1;
  const end = out.findIndex((l) => l.trim() === '</Wrap>');
  const got = out.slice(start, end);

  let matched = true;
  const n = Math.max(expected.length, got.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== got[i]) {
      matched = false;
      fails.push({
        brick: rel,
        line: i,
        exp: JSON.stringify(expected[i] ?? '∅'),
        got: JSON.stringify(got[i] ?? '∅'),
      });
      break;
    }
  }
  if (matched) ok++;
}

console.log(`Bricks checked: ${bricks.length}`);
console.log(`Exact indent round-trip: ${ok}`);
console.log(`Mismatches: ${fails.length}`);
for (const f of fails.slice(0, 40)) {
  console.log(`\n✗ ${f.brick}  (line ${f.line})`);
  console.log(`   exp: ${f.exp}`);
  console.log(`   got: ${f.got}`);
}
if (fails.length > 40) console.log(`\n… ${fails.length - 40} more`);
