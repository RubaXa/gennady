// @file: Classify package.json npm scripts into gate classes (typecheck/lint/test/format/gennady) — ported from classify-scripts.ts.
// @consumers: sdd-state.cmd
// @tasks: N/A

/** @purpose Every class a script can be tagged with; `umbrella`/`unknown` are never selectable gates. */
export type ScriptClass =
  | 'typecheck'
  | 'gennady'
  | 'lint'
  | 'test'
  | 'format'
  | 'umbrella'
  | 'unknown';

/** @purpose The selectable gate classes — the subset a verify gate actually runs. */
export type GateClass = Exclude<ScriptClass, 'umbrella' | 'unknown'>;

/** @purpose Selected script name per gate class — absent key means no script of that class is declared. */
export type Gates = Partial<Record<GateClass, string>>;

const GATE_CLASSES: readonly GateClass[] = ['typecheck', 'gennady', 'lint', 'test', 'format'];

const CATEGORY_PATTERNS: Record<string, RegExp> = {
  tsc: /\b(tsc|tsgo)\b/,
  lint: /\b(eslint|mail-core-lint\b|biome check\b|standard\b)\b/,
  test: /\b(jest|vitest|playwright test|mocha\b|--test\b)\b/,
  format: /\b(prettier|biome format)\b/,
};

const PRIORITY: Record<GateClass, Record<string, number>> = {
  typecheck: { 'type-check': 10, typecheck: 10, tsc: 5 },
  gennady: { 'lint:contracts': 10 },
  lint: { lint: 10, eslint: 7, 'lint:all': 5, 'lint-check': 5, 'mc:eslint': 3 },
  test: { test: 10, 'test:unit': 7, 'mc:test': 5, 'mc:jest': 3, jest: 3 },
  format: { 'format:check': 10, format: 5 },
};

function hasCategory(body: string, category: string): boolean {
  return CATEGORY_PATTERNS[category]?.test(body) ?? false;
}

/**
 * @purpose Classify one npm script (by name + body) into zero or more gate classes.
 * @param name Script name as it appears in package.json `scripts`.
 * @param body Script command body.
 * @returns The matched classes; `['umbrella']` for composite gates, `['unknown']` when nothing matches.
 */
export function classifyScript(name: string, body: string): ScriptClass[] {
  const isUmbrellaName = /^(check|ci-check|check:all|verify)$/.test(name);
  if (isUmbrellaName && body.length > 0) return ['umbrella'];

  const tscCount = hasCategory(body, 'tsc') ? 1 : 0;
  const lintCount = hasCategory(body, 'lint') ? 1 : 0;
  const testCount = hasCategory(body, 'test') ? 1 : 0;
  const hasGennady = /\bgennady\b/.test(body) || /lint:contracts/.test(body);
  const hasChain = body.includes('&&');
  const hasParallel = /[&]/.test(body) && /;\s*wait/.test(body);

  if (tscCount + lintCount + testCount >= 2 && (hasChain || hasParallel)) return ['umbrella'];
  if (hasGennady && hasChain) return ['umbrella'];

  const classes: ScriptClass[] = [];
  if (hasGennady) classes.push('gennady');

  const typecheckName = /^(type-?check|typecheck|typecheck:|tsc)$/.test(name);
  const typecheckBody = /\b(tsc|tsgo)\b/.test(body) && /--noEmit/.test(body);
  if (
    (typecheckName || typecheckBody || name === 'lint:ts') &&
    !name.startsWith('build:') &&
    !name.startsWith('prepublish')
  )
    classes.push('typecheck');

  const lintName = /^(lint|lint:all|lint-check|eslint|mc:eslint|stylist:lint|stylelint)$/.test(
    name
  );
  const lintBody = hasCategory(body, 'lint');
  if (
    (lintName || lintBody) &&
    !name.startsWith('lint:fix') &&
    !name.startsWith('lint:contracts') &&
    !name.startsWith('lint:ts') &&
    !hasGennady
  )
    classes.push('lint');

  const testName = /^(test|test:|mc:test|mc:jest|jest)$/.test(name);
  const testBody = hasCategory(body, 'test') || /\bnode\b.*--test\b/.test(body);
  if (testName || (testBody && !name.startsWith('build:') && !name.startsWith('prepublish')))
    classes.push('test');

  const formatName = /^format(:?check)?$/.test(name);
  const formatBody = hasCategory(body, 'format');
  if (formatName || formatBody) classes.push('format');

  return classes.length > 0 ? classes : ['unknown'];
}

/**
 * @purpose Pick the single best-named script per gate class from a package.json scripts map.
 * @param scripts The `scripts` object from package.json (name → command body).
 * @returns A Gates map with the highest-priority script name for each declared class.
 */
export function selectGates(scripts: Record<string, string>): Gates {
  const entries = Object.entries(scripts).map(([name, body]) => ({
    name,
    classes: classifyScript(name, body),
  }));

  const gates: Gates = {};
  for (const cls of GATE_CLASSES) {
    const candidates = entries.filter((e) => e.classes.includes(cls));
    if (candidates.length === 0) continue;
    const ranks = PRIORITY[cls] ?? {};
    candidates.sort((a, b) => (ranks[b.name] ?? 1) - (ranks[a.name] ?? 1));
    const best = candidates[0]?.name;
    if (best) gates[cls] = best;
  }
  return gates;
}
