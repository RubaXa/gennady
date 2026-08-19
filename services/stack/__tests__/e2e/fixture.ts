// @file: Stack e2e fixtures — closed expect.yaml schema, materialization into git, run and assert.
// @consumers: stack-e2e suites
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import type { StackE2eContext } from './setup.ts';

/** Every key `expect.yaml` may carry — unknown keys are a fixture error, not a silent pass. */
const EXPECT_KEYS = [
  'notes',
  'requires',
  'command',
  'argv',
  'dirty',
  'exitCode',
  'config',
  'gates',
  'diagnostics',
  'treeUnchanged',
  'timeoutMs',
] as const;

/** Every key a per-gate expectation may carry. */
const GATE_KEYS = ['status', 'outputIncludes', 'hintIncludes', 'describeIncludes'] as const;

/** Verdicts a gate expectation may name. */
const STATUSES = ['pass', 'fail', 'env-fail', 'violation', 'timeout', 'skipped'] as const;

/**
 * @purpose Expected verdict of one gate inside a fixture.
 * @consumer assertFixture
 */
export type GateExpectation = {
  /** @purpose Required verdict of this gate. */
  readonly status: (typeof STATUSES)[number];
  /** @purpose Substrings the gate output must contain. */
  readonly outputIncludes?: readonly string[];
  /** @purpose Substring of the matched env-fail hint. */
  readonly hintIncludes?: string;
  /** @purpose Substrings of rendered predicate descriptions in `--plan --json`. */
  readonly describeIncludes?: readonly string[];
};

/**
 * @purpose Declared expectation of one fixture — the test expressed as data (D-SE2E-002).
 * @consumer runFixture, assertFixture, suites
 */
export type FixtureExpectation = {
  /** @purpose What finding or contract this fixture protects; mandatory. */
  readonly notes: string;
  /** @purpose Toolchain ids the fixture needs. */
  readonly requires: readonly string[];
  /** @purpose Scenario: a single command or the verify→fix→verify loop. */
  readonly command: 'verify' | 'fix' | 'verify,fix,verify';
  /** @purpose CLI flags passed verbatim; empty means the full unnarrowed run. */
  readonly argv: readonly string[];
  /** @purpose Files written after the baseline commit, as uncommitted changes. */
  readonly dirty: Readonly<Record<string, string>>;
  /** @purpose Expected process exit code of the last invocation, when asserted. */
  readonly exitCode?: number;
  /** @purpose Expected config-error substring for invalid-config fixtures. */
  readonly config?: { readonly error: string };
  /** @purpose Expected verdicts keyed by `<stack>:<id>`. */
  readonly gates: Readonly<Record<string, GateExpectation>>;
  /** @purpose Diagnostic codes the report must carry. */
  readonly diagnostics: readonly string[];
  /** @purpose Whether the fixture tree must be byte-identical afterwards; default true. */
  readonly treeUnchanged: boolean;
  /** @purpose Per-fixture timeout override in milliseconds. */
  readonly timeoutMs?: number;
};

/**
 * @purpose Outcome of running one fixture.
 * @consumer assertFixture
 */
export type FixtureRun = {
  /** @purpose Fixture id (directory name). */
  readonly id: string;
  /** @purpose Materialized fixture directory. */
  readonly dir: string;
  /** @purpose Exit code of the asserted invocation. */
  readonly exitCode: number | null;
  /** @purpose Parsed `--json` payload of the asserted invocation. */
  readonly json: VerifyJson | null;
  /** @purpose Raw stdout+stderr, kept for diagnostics. */
  readonly output: string;
  /** @purpose Porcelain status of the fixture tree after the run. */
  readonly treeStatus: string;
};

/**
 * @purpose Shape of `verify --json` this harness relies on (stack.spec §8.5 stable fields).
 * @consumer assertFixture
 */
type VerifyJson = {
  readonly diagnostics?: readonly { readonly code: string }[];
  readonly runs?: readonly { readonly gates?: readonly unknown[] }[];
  readonly results?: readonly {
    readonly stack: string;
    readonly id: string;
    readonly status: string;
    readonly output?: string;
  }[];
};

/**
 * @purpose Run git in a fixture without touching the developer's global config.
 * @param dir Fixture directory.
 * @param args Git arguments.
 * @returns Trimmed stdout.
 */
function git(dir: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', dir, '-c', 'user.email=e2e@gennady', '-c', 'user.name=gennady-e2e', ...args],
    { encoding: 'utf-8' }
  ).trim();
}

/**
 * @purpose Parse and validate a fixture's `expect.yaml` against the closed schema.
 * @param file Absolute path of the expectation file.
 * @returns Normalized expectation with defaults applied.
 * @throws {Error} On an unknown key, a missing `notes`, or an unknown verdict.
 */
export function readExpectation(file: string): FixtureExpectation {
  const raw = parseYaml(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`FIXTURE_INVALID: ${file} is not a mapping`);
  }
  for (const key of Object.keys(raw)) {
    if (!(EXPECT_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `FIXTURE_INVALID: ${file}: unknown key "${key}" — known: ${EXPECT_KEYS.join(', ')}`
      );
    }
  }
  if (typeof raw['notes'] !== 'string' || raw['notes'].length === 0) {
    throw new Error(
      `FIXTURE_INVALID: ${file}: "notes" is required — say what this fixture protects`
    );
  }

  const gates: Record<string, GateExpectation> = {};
  for (const [name, value] of Object.entries((raw['gates'] ?? {}) as Record<string, unknown>)) {
    const spec = value as Record<string, unknown>;
    for (const key of Object.keys(spec)) {
      if (!(GATE_KEYS as readonly string[]).includes(key)) {
        throw new Error(`FIXTURE_INVALID: ${file}: gates."${name}": unknown key "${key}"`);
      }
    }
    if (!(STATUSES as readonly string[]).includes(spec['status'] as string)) {
      throw new Error(
        `FIXTURE_INVALID: ${file}: gates."${name}".status must be one of ${STATUSES.join(' | ')}`
      );
    }
    gates[name] = spec as unknown as GateExpectation;
  }

  return {
    notes: raw['notes'],
    requires: (raw['requires'] ?? []) as readonly string[],
    command: (raw['command'] ?? 'verify') as FixtureExpectation['command'],
    argv: (raw['argv'] ?? []) as readonly string[],
    dirty: (raw['dirty'] ?? {}) as Readonly<Record<string, string>>,
    exitCode: raw['exitCode'] as number | undefined,
    config: raw['config'] as { error: string } | undefined,
    gates,
    diagnostics: (raw['diagnostics'] ?? []) as readonly string[],
    treeUnchanged: (raw['treeUnchanged'] ?? true) as boolean,
    timeoutMs: raw['timeoutMs'] as number | undefined,
  };
}

/**
 * @purpose Copy a fixture template into a temp git repository, baselined and optionally dirtied.
 * @invariant The template in the repository is never modified; `dirty` is applied AFTER the commit.
 * @param ctx Suite context providing the temp root.
 * @param template Absolute path of the fixture template directory.
 * @param expectation Parsed expectation (its `dirty` map is applied here).
 * @returns Absolute path of the materialized fixture.
 * @sideEffect IO: writes under the suite temp root; Process: git init/add/commit.
 */
export function materializeFixture(
  ctx: StackE2eContext,
  template: string,
  expectation: FixtureExpectation
): string {
  const id = path.basename(template);
  const dir = path.join(ctx.tmpRoot, id);
  fs.cpSync(template, dir, { recursive: true });
  fs.rmSync(path.join(dir, 'expect.yaml'), { force: true });

  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--no-verify', '-m', 'fixture baseline');

  for (const [relative, content] of Object.entries(expectation.dirty)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

/**
 * @purpose Run the fixture's scenario and capture the asserted invocation's machine output.
 * @param ctx Suite context.
 * @param dir Materialized fixture directory.
 * @param expectation Parsed expectation.
 * @returns Captured run.
 * @sideEffect Process: spawns the installed gennady binary once per scenario step.
 */
export function runFixture(
  ctx: StackE2eContext,
  dir: string,
  expectation: FixtureExpectation
): FixtureRun {
  const id = path.basename(dir);
  const steps =
    expectation.command === 'verify,fix,verify'
      ? (['verify', 'fix', 'verify'] as const)
      : ([expectation.command] as const);

  let last = { stdout: '', stderr: '', exitCode: null as number | null };
  for (const step of steps) {
    const args =
      step === 'verify'
        ? ['verify', ...expectation.argv, '--json']
        : ['fix', ...expectation.argv.filter((flag) => !flag.startsWith('--only'))];
    last = ctx.spawn(args, dir, expectation.timeoutMs ?? 120_000);
  }

  let json: VerifyJson | null = null;
  const trimmed = last.stdout.trim();
  if (trimmed.startsWith('{')) {
    try {
      json = JSON.parse(trimmed) as VerifyJson;
    } catch {
      json = null;
    }
  }

  return {
    id,
    dir,
    exitCode: last.exitCode,
    json,
    output: `${last.stdout}${last.stderr}`,
    treeStatus: git(dir, 'status', '--porcelain'),
  };
}

/**
 * @purpose Compare a fixture run against its declaration; a mismatch throws with a full diff.
 * @invariant A gate named in `gates` but absent from the result is an error — a typo must not pass.
 * @param run Captured run.
 * @param expectation Parsed expectation.
 * @throws {Error} On any mismatch, naming fixture, gate, expectation and actual value.
 */
export function assertFixture(run: FixtureRun, expectation: FixtureExpectation): void {
  const fail = (message: string): never => {
    const kept =
      process.env.STACK_E2E_KEEP === '1'
        ? `\n  fixture kept: ${run.dir}`
        : '\n  (STACK_E2E_KEEP=1 keeps the tree)';
    throw new Error(
      `[${run.id}] ${message}${kept}\n  --- output ---\n${run.output.slice(0, 4000)}`
    );
  };

  if (expectation.config !== undefined) {
    if (!run.output.includes('CONFIG_ERROR')) {
      fail('expected CONFIG_ERROR, got none');
    }
    if (!run.output.includes(expectation.config.error)) {
      fail(`config error missing substring ${JSON.stringify(expectation.config.error)}`);
    }
  }

  if (Object.keys(expectation.gates).length > 0 && run.json === null) {
    fail('expected --json output, got unparseable stdout');
  }

  for (const [name, want] of Object.entries(expectation.gates)) {
    const [stack, id] = name.split(':');
    const actual = run.json?.results?.find((r) => r.stack === stack && r.id === id);
    if (actual === undefined) {
      const seen =
        (run.json?.results ?? []).map((r) => `${r.stack}:${r.id}`).join(', ') || '(none)';
      fail(`gate "${name}" is not in the result — present: ${seen}`);
      continue;
    }
    if (actual.status !== want.status) {
      fail(`gate "${name}": expected status ${want.status}, got ${actual.status}`);
    }
    for (const needle of want.outputIncludes ?? []) {
      if (!(actual.output ?? '').includes(needle)) {
        fail(`gate "${name}": output missing ${JSON.stringify(needle)}`);
      }
    }
    if (want.hintIncludes !== undefined && !(actual.output ?? '').includes(want.hintIncludes)) {
      fail(`gate "${name}": hint missing ${JSON.stringify(want.hintIncludes)}`);
    }
  }

  for (const code of expectation.diagnostics) {
    if (!(run.json?.diagnostics ?? []).some((d) => d.code === code)) {
      fail(`diagnostic ${code} not reported`);
    }
  }

  if (expectation.exitCode !== undefined && run.exitCode !== expectation.exitCode) {
    fail(`expected exit ${expectation.exitCode}, got ${run.exitCode}`);
  }

  if (expectation.treeUnchanged && run.treeStatus.length > 0) {
    fail(`fixture tree was modified:\n${run.treeStatus}`);
  }
}
