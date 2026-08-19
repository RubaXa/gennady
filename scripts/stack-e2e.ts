// @file: Runner for the stack e2e suites — derives plugin suites from the resolver, enforces STRICT.
// @consumers: package.json (test:stack-e2e, test:config-e2e), CI
// @tasks: TSK-96

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePlugins } from '../services/plugins/resolve-plugins.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');

/** Entry that runs one plugin's own fixtures, selected by STACK_E2E_SUITE. */
const PLUGIN_SUITE_ENTRY = 'services/stack/__tests__/e2e/plugin-suite.e2e.test.ts';

/**
 * Suites the repository owns rather than any plugin. `node` is still here because it has not
 * moved into plugins/ yet; `config` stays a repo suite for good — it tests the config scope.
 */
const REPO_SUITES: Readonly<
  Record<string, { readonly file: string; readonly byDefault: boolean }>
> = {
  node: { file: 'services/stack/__tests__/e2e/node.e2e.test.ts', byDefault: true },
  config: { file: 'services/stack/__tests__/e2e/config.e2e.test.ts', byDefault: false },
};

/**
 * Plugin suites that must be derived. Without this floor a resolver that finds nothing
 * would report a clean run over zero suites (plugins.spec §6.2).
 */
const FLOOR = ['golang'] as const;

const { plugins, errors } = resolvePlugins([path.join(projectRoot, 'plugins')], 'stack');
if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[stack-e2e] ${error.path}: ${error.message}`);
  }
  process.exit(4);
}

const pluginSuites = plugins.filter((plugin) => plugin.e2eFixtures !== null).map((p) => p.id);
const missing = FLOOR.filter((id) => !pluginSuites.includes(id));
if (missing.length > 0) {
  console.error(
    `[stack-e2e] plugin suite(s) missing: ${missing.join(', ')} — resolved: ${pluginSuites.join(', ') || 'none'}`
  );
  process.exit(4);
}

const known = new Set([...pluginSuites, ...Object.keys(REPO_SUITES)]);
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv
    .find((entry) => entry.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');

const requested = flag('suite')?.split(',') ?? [
  ...pluginSuites,
  ...Object.keys(REPO_SUITES).filter((id) => REPO_SUITES[id]!.byDefault),
];
const fixture = flag('fixture');
const unknown = requested.filter((id) => !known.has(id));
if (unknown.length > 0) {
  console.error(
    `[stack-e2e] unknown suite(s): ${unknown.join(', ')} — known: ${[...known].join(', ')}`
  );
  process.exit(4);
}

let failed = false;
for (const id of requested) {
  const repoSuite = REPO_SUITES[id];
  const file = repoSuite?.file ?? PLUGIN_SUITE_ENTRY;
  console.info(`\n[stack-e2e] suite: ${id}${repoSuite === undefined ? ' (plugin)' : ''}`);
  const proc = spawnSync('node', ['--import', 'tsx', '--test', '--test-reporter=spec', file], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      STACK_E2E: '1',
      STACK_E2E_SUITE: id,
      ...(fixture !== undefined ? { STACK_E2E_FIXTURE: fixture } : {}),
    },
  });
  if (proc.status !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
