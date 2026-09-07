// @file: Real-CLI runner for tool-behavior tests — spawns `node --import <tsx-loader> cli/gennady.ts
//   <args>` against a fixture root, exactly like directive-tool-contract.test.ts's own runCli.
// @consumers: tool-behavior/*.test.ts
// @tasks: N/A

import { spawn, spawnSync } from 'node:child_process';
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
 * @purpose Isolate black-box fixture subprocesses from the parent test runner's control plane.
 *   In particular, c8's `NODE_V8_COVERAGE` belongs to the root test process: inheriting it makes
 *   every real-CLI fixture (and every npm/node process it starts) emit another raw V8 profile.
 *   The black-box behavior still runs unchanged; source coverage is owned by the direct command
 *   tests in the root c8 process rather than multiplied by subprocess topology.
 * @param source Parent environment to sanitize.
 * @returns A detached environment without git/test-runner/coverage control variables.
 */
export function cleanTestChildEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Deleting NODE_V8_COVERAGE is insufficient while the parent itself is instrumented: Node
  // re-injects its active coverage directory into spawned Node processes. The explicit empty
  // sentinel is the supported child-boundary opt-out (the same contract as testcov producers).
  const env: NodeJS.ProcessEnv = {
    ...source,
    GENNADY_NO_UPDATE_CHECK: '1',
    NODE_V8_COVERAGE: '',
  };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') || key.startsWith('NODE_TEST')) delete env[key];
  }
  return env;
}

/**
 * @purpose Run the real `cli/gennady.ts` entry point against a fixture, with GIT_*, NODE_TEST_*,
 *   and NODE_V8_COVERAGE disabled in the child's env. GIT_* would redirect a git-scoped tool call into the real repo
 *   instead of the fixture (see scripts/git-hooks/pre-commit's own comment on this failure mode);
 *   NODE_TEST_CONTEXT leaks in when this helper runs under `node --test` and would flip any
 *   `node --test` a gate itself spawns into silent child-reporter mode, swallowing its non-zero exit.
 *   NODE_V8_COVERAGE belongs to the root c8 owner; forwarding it multiplies raw profiles without
 *   changing the black-box assertion.
 * @param args CLI arguments (after the command name is not special — pass e.g. `['sdd-verify', '--profile', 'setup']`).
 * @param cwd Fixture root to run from.
 * @returns Combined stdout/stderr and exit code (1 when the process could not even be spawned).
 */
export function runCli(args: string[], cwd: string): CliResult {
  const env = cleanTestChildEnv(process.env);
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

/**
 * @purpose Run the same isolated real CLI without blocking the test worker's event loop, allowing
 *   a bounded concurrent suite to overlap independent fixture subprocesses.
 * @param args CLI arguments passed after the entry point.
 * @param cwd Fixture root owned by the calling test.
 * @returns The same captured result contract as runCli after exit, spawn failure, or timeout.
 */
export function runCliAsync(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, GENNADY_ENTRY, ...args], {
      cwd,
      env: cleanTestChildEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.once('error', (error) => {
      stderr += error.message;
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.once('close', (exitCode) => {
      clearTimeout(timeout);
      resolveResult({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}
