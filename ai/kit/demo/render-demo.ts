/**
 * Demo: render the same template with different params to show dynamic directives.
 * Run: npx tsx ai/kit/demo/render-demo.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderer } from '../render.ts';

const { render } = createRenderer();
const tpl = readFileSync(join(import.meta.dirname, 'sdd-mini.hbs'), 'utf8');
const today = new Date().toISOString().slice(0, 10);

const A = { generatedAt: today, scope: 'backend', stack: { svelte: false }, rules: [] };
const B = {
  generatedAt: today,
  scope: 'web-ui',
  stack: { svelte: true },
  rules: [{ brick: 'axiom/testing/ax-mock-as-last-resort' }],
};

console.log(
  '==================== PARAMS A (backend, no svelte, no extra rules) ====================\n'
);
console.log(render(tpl, A));
console.log('\n==================== PARAMS B (web-ui, svelte on, +1 rule) ====================\n');
console.log(render(tpl, B));
