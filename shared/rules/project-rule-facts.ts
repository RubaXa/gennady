// @file: Deterministic repository metadata projected into rule-selection PhaseFacts.
// @consumers: SDD rule snapshot composition
// @spec: CLI-RULES

import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { isSddTestFile } from '../sdd/source-extensions.ts';

type ProjectRuleArtifact = {
  readonly path: string;
  readonly frameworks: readonly string[];
};

/** @purpose Safe deterministic project metadata consumed by the PhaseFacts classifier. */
type ProjectRuleFacts = {
  /** @purpose Per-scope artifact framework facts derived from paths and project capabilities. */
  readonly artifacts: readonly ProjectRuleArtifact[];
  /** @purpose Available tool identities inferred without executing project code. */
  readonly tools: readonly string[];
  /** @purpose Open project facts retained in the immutable snapshot digest. */
  readonly project: Readonly<Record<string, readonly string[]>>;
};

const CONFIG_MARKERS = Object.freeze({
  vitest: [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mts',
    'vitest.config.mjs',
    'vitest.config.cts',
    'vitest.config.cjs',
  ],
  playwright: [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mts',
    'playwright.config.mjs',
    'playwright.config.cts',
    'playwright.config.cjs',
  ],
  svelte: ['svelte.config.ts', 'svelte.config.js', 'svelte.config.mjs', 'svelte.config.cjs'],
  storybook: [
    '.storybook/main.ts',
    '.storybook/main.js',
    '.storybook/main.mts',
    '.storybook/main.mjs',
    '.storybook/main.cts',
    '.storybook/main.cjs',
  ],
} as const);

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function stringRecord(value: unknown, field: string): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({});
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('RULE_PROJECT_FACTS_MALFORMED', `${field} must be an object`);
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      fail('RULE_PROJECT_FACTS_MALFORMED', `${field}.${key} must be a string`);
    }
    result[key.toLowerCase()] = entry;
  }
  return Object.freeze(result);
}

function packageFacts(root: string): {
  readonly dependencies: readonly string[];
  readonly scripts: Readonly<Record<string, string>>;
} {
  if (!existsSync(`${root}/package.json`)) return { dependencies: [], scripts: {} };
  const inspected = inspectRepoPath(root, 'package.json', 'file');
  if (!inspected.ok) fail('RULE_PROJECT_FACTS_UNSAFE', `package.json: ${inspected.detail}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inspected.absolute, 'utf8'));
  } catch (cause) {
    fail(
      'RULE_PROJECT_FACTS_MALFORMED',
      `package.json: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('RULE_PROJECT_FACTS_MALFORMED', 'package.json root must be an object');
  }
  const record = parsed as Record<string, unknown>;
  const dependencyMaps = [
    stringRecord(record.dependencies, 'dependencies'),
    stringRecord(record.devDependencies, 'devDependencies'),
    stringRecord(record.peerDependencies, 'peerDependencies'),
    stringRecord(record.optionalDependencies, 'optionalDependencies'),
  ];
  return {
    dependencies: Object.freeze(
      [...new Set(dependencyMaps.flatMap((entries) => Object.keys(entries)))].sort()
    ),
    scripts: stringRecord(record.scripts, 'scripts'),
  };
}

function marker(root: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => {
    if (!existsSync(`${root}/${candidate}`)) return false;
    const inspected = inspectRepoPath(root, candidate, 'file');
    if (!inspected.ok) fail('RULE_PROJECT_FACTS_UNSAFE', `${candidate}: ${inspected.detail}`);
    return true;
  });
}

function detectedFrameworks(
  root: string,
  dependencies: ReadonlySet<string>,
  scripts: Readonly<Record<string, string>>
): readonly string[] {
  const scriptBodies = Object.values(scripts).join('\n');
  const frameworks = new Set<string>();
  if (
    dependencies.has('vitest') ||
    /(?:^|\s)vitest(?:\s|$)/m.test(scriptBodies) ||
    marker(root, CONFIG_MARKERS.vitest)
  ) {
    frameworks.add('vitest');
  }
  if (
    dependencies.has('@playwright/test') ||
    dependencies.has('playwright') ||
    /playwright\s+test/.test(scriptBodies) ||
    marker(root, CONFIG_MARKERS.playwright)
  ) {
    frameworks.add('playwright');
  }
  if (
    dependencies.has('svelte') ||
    dependencies.has('@sveltejs/kit') ||
    marker(root, CONFIG_MARKERS.svelte)
  ) {
    frameworks.add('svelte');
  }
  if (dependencies.has('@sveltejs/kit')) frameworks.add('sveltekit');
  if (
    [...dependencies].some(
      (dependency) => dependency === 'storybook' || dependency.startsWith('@storybook/')
    ) ||
    /(?:^|\s)storybook(?:\s|$)/m.test(scriptBodies) ||
    marker(root, CONFIG_MARKERS.storybook)
  ) {
    frameworks.add('storybook');
  }
  if (/(?:^|\s)node(?:\s+[^\n]*)?\s--test(?:\s|$)/m.test(scriptBodies)) {
    frameworks.add('node-test');
  }
  return Object.freeze([...frameworks].sort());
}

function frameworksForPath(path: string, available: ReadonlySet<string>): readonly string[] {
  const result = new Set<string>();
  const lower = path.toLowerCase();
  const test = isSddTestFile(path);
  if (available.has('vitest') && test) result.add('vitest');
  if (available.has('node-test') && test) result.add('node-test');
  if (
    available.has('playwright') &&
    test &&
    (/playwright|(?:^|\/)e2e(?:\/|$)/.test(lower) ||
      (!available.has('vitest') && !available.has('node-test')))
  ) {
    result.add('playwright');
  }
  if (available.has('svelte') && (/\.svelte(?:\.|$)/.test(lower) || extname(lower) === '.svelte')) {
    result.add('svelte');
  }
  if (
    available.has('sveltekit') &&
    /(?:^|\/)(?:\+layout|\+page|\+server|hooks\.server)(?:\.|$)/.test(lower)
  ) {
    result.add('sveltekit');
  }
  if (available.has('storybook') && /\.stories\.[^/]+$/.test(lower)) result.add('storybook');
  return Object.freeze([...result].sort());
}

/**
 * @purpose Detect project framework/tool facts from inert files without executing project code.
 * @param root Exact repository root.
 * @param artifactPaths Exact phase target/planned/tombstone identities receiving per-file facts.
 * @returns Deterministic facts independent of filesystem enumeration order.
 */
export function detectProjectRuleFacts(
  root: string,
  artifactPaths: readonly string[]
): ProjectRuleFacts {
  const pkg = packageFacts(root);
  const dependencies = new Set(pkg.dependencies);
  const frameworks = detectedFrameworks(root, dependencies, pkg.scripts);
  const available = new Set(frameworks);
  const tools = new Set<string>();
  if (available.has('storybook')) tools.add('storybook');
  if (dependencies.has('eslint')) tools.add('eslint');
  const artifacts = [...new Set(artifactPaths)]
    .sort()
    .map((path) => Object.freeze({ path, frameworks: frameworksForPath(path, available) }));
  return Object.freeze({
    artifacts: Object.freeze(artifacts),
    tools: Object.freeze([...tools].sort()),
    project: Object.freeze({
      dependencies: pkg.dependencies,
      frameworks,
      scripts: Object.freeze(Object.keys(pkg.scripts).sort()),
    }),
  });
}
