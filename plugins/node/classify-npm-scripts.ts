// @file: Heuristic npm script classifier — maps package.json scripts to verification classes.
// @consumers: node-plugin
// @tasks: TSK-95

/** Verification class an npm script may belong to. */
export type NpmScriptClass = 'typecheck' | 'gennady' | 'lint' | 'test' | 'format';

/** Ordered list of classes; also the gate order of the node plugin. */
export const NPM_SCRIPT_CLASSES: readonly NpmScriptClass[] = [
  'typecheck',
  'gennady',
  'lint',
  'test',
  'format',
];

/**
 * @purpose Test whether a script is watch-like and therefore unusable as a one-shot gate.
 * @param name Script name.
 * @param body Script command body.
 * @returns True when the script would never exit on its own.
 */
function isWatchLike(name: string, body: string): boolean {
  if (/(^|:|-)watch($|:|-)/i.test(name)) {
    return true;
  }
  return [
    /(^|\s)--watch(?:[=\s]|$)/i,
    /(^|\s)--watchall(?:[=\s]|$)/i,
    /(^|\s)watch(?:\s|$)/i,
    /(^|\s)nodemon(?:\s|$)/i,
  ].some((pattern) => pattern.test(body));
}

/**
 * @purpose Classify one npm script into verification classes, or none for umbrella/unknown scripts.
 * @invariant Umbrella scripts (chained `&&` multi-class commands, `check`-style names) are excluded —
 *   running them alongside their parts would execute the same gates twice.
 * @param name Script name.
 * @param body Script command body.
 * @returns Classes the script belongs to; empty for umbrella, watch-like or unknown scripts.
 */
export function classifyNpmScript(name: string, body: string): NpmScriptClass[] {
  if (isWatchLike(name, body) || /^(check|ci-check|check:all|verify)$/.test(name)) {
    return [];
  }

  const hasTsc = /\b(tsc|tsgo)\b/.test(body);
  const hasLint = /\b(eslint|mail-core-lint|biome check|standard)\b/.test(body);
  const hasTest = /\b(jest|vitest|playwright test|mocha)\b/.test(body) || /--test\b/.test(body);
  const hasFormat = /\b(prettier|biome format)\b/.test(body);
  const hasGennady = /\bgennady\b/.test(body) || /lint:contracts/.test(name);
  // Every shell separator, not just `&&`: `tsc & eslint . & wait` and `tsc; eslint .` are
  // umbrellas too, and screening only `&&` let them through as a single gate. Redirections are
  // stripped first, because `2>&1` and `>&2` contain an ampersand without chaining anything.
  const chainable = body.replace(/\d?>&\d?|&>/g, ' ');
  const hasChain = /&&|\|\||;|(^|\s)&(\s|$)|\bwait\b/.test(chainable);

  // invariant: multi-class chained scripts are umbrellas, not gates
  const classCount = [hasTsc, hasLint, hasTest].filter(Boolean).length;
  if ((classCount >= 2 && hasChain) || (hasGennady && hasChain)) {
    return [];
  }

  const classes: NpmScriptClass[] = [];
  if (hasGennady) {
    classes.push('gennady');
  }

  const typecheckName = /^(type-?check|typecheck|tsc|lint:ts)$/.test(name);
  const typecheckBody = hasTsc && /--noEmit/.test(body);
  if (
    (typecheckName || typecheckBody) &&
    !name.startsWith('build:') &&
    !name.startsWith('prepublish')
  ) {
    classes.push('typecheck');
  }

  const lintName = /^(lint|lint:all|lint-check|eslint|mc:eslint|stylelint)$/.test(name);
  if (
    (lintName || hasLint) &&
    !name.startsWith('lint:fix') &&
    !name.startsWith('lint:contracts') &&
    !name.startsWith('lint:ts') &&
    !hasGennady
  ) {
    classes.push('lint');
  }

  const testName = /^(test|test:|mc:test|mc:jest|jest)$/.test(name);
  if (testName || (hasTest && !name.startsWith('build:') && !name.startsWith('prepublish'))) {
    classes.push('test');
  }

  if (/^format(:check)?$/.test(name) || hasFormat) {
    classes.push('format');
  }

  return classes;
}

/**
 * @purpose Pick the best script per class from a package.json scripts map.
 * @param scripts Scripts map from package.json.
 * @returns Selected script name per class; classes with no candidate are absent.
 */
export function classifyNpmScripts(
  scripts: Readonly<Record<string, string>>
): Partial<Record<NpmScriptClass, string>> {
  const priority: Readonly<Record<NpmScriptClass, Readonly<Record<string, number>>>> = {
    typecheck: { 'type-check': 10, typecheck: 10, tsc: 5 },
    gennady: { 'lint:contracts': 10 },
    lint: { lint: 10, eslint: 7, 'lint:all': 5, 'lint-check': 5, 'mc:eslint': 3 },
    test: { test: 10, 'test:unit': 7, 'mc:test': 5, 'mc:jest': 3, jest: 3 },
    format: { 'format:check': 10, format: 5 },
  };

  const entries = Object.entries(scripts).map(([name, body]) => ({
    name,
    classes: classifyNpmScript(name, body),
  }));

  const selected: Partial<Record<NpmScriptClass, string>> = {};
  for (const cls of NPM_SCRIPT_CLASSES) {
    const candidates = entries.filter((entry) => entry.classes.includes(cls));
    if (candidates.length === 0) {
      continue;
    }
    candidates.sort((a, b) => (priority[cls][b.name] ?? 1) - (priority[cls][a.name] ?? 1));
    selected[cls] = candidates[0]!.name;
  }

  return selected;
}
