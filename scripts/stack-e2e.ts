// @file: Runner for the stack e2e suites — selects suites, enforces STRICT, prints the skip summary.
// @consumers: package.json (test:stack-e2e, test:config-e2e), CI
// @tasks: TSK-95

import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Suites this runner knows, in run order. */
const SUITES: Readonly<Record<string, string>> = {
  golang: 'services/stack/__tests__/e2e/golang.e2e.test.ts',
  node: 'services/stack/__tests__/e2e/node.e2e.test.ts',
  config: 'services/stack/__tests__/e2e/config.e2e.test.ts',
};

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv
    .find((entry) => entry.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');

const requested = flag('suite')?.split(',') ?? ['golang', 'node'];
const fixture = flag('fixture');
const unknown = requested.filter((id) => SUITES[id] === undefined);
if (unknown.length > 0) {
  console.error(
    `[stack-e2e] unknown suite(s): ${unknown.join(', ')} — known: ${Object.keys(SUITES).join(', ')}`
  );
  process.exit(4);
}

const projectRoot = path.resolve(import.meta.dirname, '..');
let failed = false;

for (const id of requested) {
  const file = SUITES[id]!;
  console.info(`\n[stack-e2e] suite: ${id}`);
  const proc = spawnSync('node', ['--import', 'tsx', '--test', '--test-reporter=spec', file], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      STACK_E2E: '1',
      ...(fixture !== undefined ? { STACK_E2E_FIXTURE: fixture } : {}),
    },
  });
  if (proc.status !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
