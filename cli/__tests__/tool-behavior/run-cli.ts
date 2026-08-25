// @file: Real-CLI runner for tool-behavior tests — spawns `node --import <tsx-loader> cli/gennady.ts
//   <args>` against a fixture root, exactly like directive-tool-contract.test.ts's own runCli.
// @consumers: tool-behavior/*.test.ts
// @tasks: N/A

import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
// Absolute loader path, not the bare `tsx` specifier — `--import tsx` resolves a bare specifier from
// the CHILD PROCESS's cwd (the fixture dir, which has no node_modules/tsx of its own), not from this
// repo, so the loader must be named explicitly.
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

/** @purpose Outcome of one real CLI invocation. */
export type CliResult = { stdout: string; stderr: string; exitCode: number };

/**
 * @purpose Run the real `cli/gennady.ts` entry point against a fixture, with GIT_* and NODE_TEST_*
 *   scrubbed from the child's env. GIT_* would redirect a git-scoped tool call into the real repo
 *   instead of the fixture (see scripts/git-hooks/pre-commit's own comment on this failure mode);
 *   NODE_TEST_CONTEXT leaks in when this helper runs under `node --test` and would flip any
 *   `node --test` a gate itself spawns into silent child-reporter mode, swallowing its non-zero exit.
 * @param args CLI arguments (after the command name is not special — pass e.g. `['sdd-verify', '--profile', 'setup']`).
 * @param cwd Fixture root to run from.
 * @returns Combined stdout/stderr and exit code (1 when the process could not even be spawned).
 */
export function runCli(args: string[], cwd: string): CliResult {
  const env: NodeJS.ProcessEnv = { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') || key.startsWith('NODE_TEST')) delete env[key];
  }
  const res = spawnSync(process.execPath, ['--import', TSX_LOADER, GENNADY_ENTRY, ...args], {
    cwd,
    encoding: 'utf-8',
    env,
    timeout: 30_000,
  });
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    exitCode: res.status ?? (res.error ? 1 : 0),
  };
}
