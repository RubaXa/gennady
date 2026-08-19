// @file: Stack e2e setup — per-suite artifact (build:publish → pack → install) + toolchain probe.
// @consumers: stack-e2e suites, scripts/stack-e2e.ts
// @tasks: TSK-95

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

/** Repository root — two levels above services/stack/__tests__/e2e. */
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../..');

/** Registry used for the artifact install; corporate registries answer 403 for public deps. */
const REGISTRY = process.env.STACK_E2E_REGISTRY ?? 'https://registry.npmjs.org/';

/**
 * Extra npm flags for the artifact install. `--prefer-offline` is the default because a
 * corporate proxy can 403 public transitive deps (`ink` here) even with an explicit registry;
 * the local npm cache then carries the run. Override with STACK_E2E_NPM_FLAGS when needed.
 */
const NPM_FLAGS = (process.env.STACK_E2E_NPM_FLAGS ?? '--prefer-offline')
  .split(' ')
  .filter((f) => f.length > 0);

/** Toolchain ids a fixture may name in `requires`; anything else is a fixture error. */
export const KNOWN_TOOLCHAINS = ['go', 'golangci-lint', 'npm', 'docker'] as const;

/** Toolchains a fixture may declare in `requires`. */
const TOOLCHAIN_PROBES: Readonly<Record<string, readonly string[]>> = {
  go: ['go', 'version'],
  'golangci-lint': ['golangci-lint', '--version'],
  npm: ['npm', '--version'],
  docker: ['docker', 'info'],
};

/**
 * @purpose An external tool a fixture may require, probed once per suite.
 * @consumer stack-e2e suites
 */
export type Toolchain = {
  /** @purpose Tool identifier used in `expect.requires`. */
  readonly id: string;
  /** @purpose Whether the probe succeeded. */
  readonly available: boolean;
  /** @purpose First line of the probe output, for the run header. */
  readonly version: string;
};

/**
 * @purpose Ready-to-use environment of one stack suite: installed artifact plus probed toolchains.
 * @consumer stack-e2e suites
 */
export type StackE2eContext = {
  /** @purpose Directory holding the installed package. */
  readonly runnerDir: string;
  /** @purpose Root of this suite's temp tree; fixtures are materialized under it. */
  readonly tmpRoot: string;
  /** @purpose Probe results keyed by toolchain id. */
  readonly toolchains: ReadonlyMap<string, Toolchain>;
  /** @purpose Run the installed gennady binary; returns captured streams and exit code. */
  spawn(args: readonly string[], cwd: string, timeoutMs?: number): SpawnOutcome;
  /** @purpose Remove the suite's temp tree unless STACK_E2E_KEEP is set. */
  cleanup(): void;
};

/**
 * @purpose Captured result of one CLI invocation.
 * @consumer fixture.ts
 */
export type SpawnOutcome = {
  /** @purpose Standard output. */
  readonly stdout: string;
  /** @purpose Standard error. */
  readonly stderr: string;
  /** @purpose Exit code, or null when the process was killed. */
  readonly exitCode: number | null;
};

/**
 * @purpose Probe the external tools a suite's fixtures may require — one call per tool.
 * @param ids Toolchain ids to probe; unknown ids are reported unavailable.
 * @returns Probe results keyed by id.
 * @sideEffect Process: runs one version probe per tool.
 */
export function probeToolchains(ids: readonly string[]): ReadonlyMap<string, Toolchain> {
  const result = new Map<string, Toolchain>();
  for (const id of ids) {
    const probe = TOOLCHAIN_PROBES[id];
    if (probe === undefined) {
      result.set(id, { id, available: false, version: '(unknown toolchain)' });
      continue;
    }
    const [bin, ...args] = probe;
    const proc = spawnSync(bin!, args, { encoding: 'utf-8', timeout: 30_000 });
    const ok = proc.error === undefined && proc.status === 0;
    result.set(id, {
      id,
      available: ok,
      version: ok ? (proc.stdout.split('\n')[0] ?? '').trim() : '(absent)',
    });
  }
  return result;
}

/**
 * @purpose Build the publishable artifact and install it into a suite-private runner directory.
 * @invariant build:publish, never plain build — npm pack does not trigger prepublishOnly (D-IE2E-002).
 * @invariant Publish artifacts are cleaned afterwards; no tracked file of the repo is modified.
 * @param suiteId Suite name, used in temp directory names.
 * @returns Context with the installed runner, temp root and probed toolchains.
 * @sideEffect Process: npm build/pack/install; IO: writes under os.tmpdir(); dist/ and *.tgz are gitignored.
 */
export function setupStackSuite(suiteId: string, toolchainIds: readonly string[]): StackE2eContext {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `gennady-e2e-${suiteId}-`));
  const runnerDir = path.join(tmpRoot, 'runner');
  const homeDir = path.join(tmpRoot, 'home');
  fs.mkdirSync(runnerDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  const cleanup = (): void => {
    if (process.env.STACK_E2E_KEEP === '1') {
      console.info(`[${suiteId}] kept: ${tmpRoot}`);
      return;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  };

  let tgz = '';
  try {
    // #region START_ARTIFACT — invariant: the tarball equals the published package
    execFileSync('npm', ['run', 'build:publish'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    tgz = execFileSync('npm', ['pack'], { cwd: PROJECT_ROOT, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .pop()!;
    const freshRunner = (): void => {
      // A failed attempt leaves a lock file pinning registry URLs, which defeats --offline.
      fs.rmSync(runnerDir, { recursive: true, force: true });
      fs.mkdirSync(runnerDir, { recursive: true });
      fs.writeFileSync(
        path.join(runnerDir, 'package.json'),
        '{"name":"e2e-runner","private":true}\n'
      );
    };
    const install = (extra: readonly string[]): void => {
      execFileSync(
        'npm',
        [
          'install',
          '--no-audit',
          '--no-fund',
          `--registry=${REGISTRY}`,
          ...extra,
          path.join(PROJECT_ROOT, tgz),
        ],
        { cwd: runnerDir, stdio: 'pipe' }
      );
    };

    freshRunner();
    try {
      install(NPM_FLAGS);
    } catch (fromRegistry) {
      // A corporate proxy can 403 public transitive deps (`ink`) even with an explicit
      // registry, and --prefer-offline still revalidates metadata. A warm npm cache then
      // carries the run; CI with real network never reaches this branch.
      console.info(`[${suiteId}] registry install failed — retrying with --offline`);
      freshRunner();
      try {
        install(['--offline']);
      } catch (fromCache) {
        const first = (fromRegistry as { stderr?: Buffer }).stderr?.toString() ?? '';
        const second = (fromCache as { stderr?: Buffer }).stderr?.toString() ?? '';
        throw new Error(`registry: ${first.slice(0, 300)}\n  offline: ${second.slice(0, 300)}`);
      }
    }
    // #endregion END_ARTIFACT
  } catch (cause) {
    cleanup();
    const detail = (cause as { stderr?: Buffer }).stderr?.toString() ?? (cause as Error).message;
    throw new Error(
      `[${suiteId}] artifact setup failed: ${detail.slice(0, 800)}\n` +
        '  hint: a corporate registry/proxy can 403 public deps — set STACK_E2E_REGISTRY, or warm the ' +
        'npm cache with `npm ci` so the default --prefer-offline install can proceed'
    );
  } finally {
    // The guide's manual step, automated: publish artifacts never linger in the tree.
    try {
      execFileSync('node', ['--import', 'tsx', 'scripts/cleanup-publish-artifacts.ts'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });
    } catch {
      if (tgz.length > 0) {
        fs.rmSync(path.join(PROJECT_ROOT, tgz), { force: true });
      }
    }
  }

  const bin = path.join(runnerDir, 'node_modules', '.bin', 'gennady');

  return {
    runnerDir,
    tmpRoot,
    toolchains: probeToolchains(toolchainIds),
    spawn(args, cwd, timeoutMs = 120_000) {
      const proc = spawnSync(bin, [...args], {
        cwd,
        encoding: 'utf-8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: homeDir,
          GENNADY_NO_UPDATE_CHECK: '1',
          GOPROXY: 'off',
          GOFLAGS: '',
          GOCACHE: path.join(tmpRoot, 'gocache'),
        },
      });
      return {
        stdout: proc.stdout ?? '',
        stderr: proc.stderr ?? '',
        exitCode: proc.status,
      };
    },
    cleanup,
  };
}
