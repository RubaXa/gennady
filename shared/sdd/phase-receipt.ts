// @file: Structured CLI-owned phase verification receipts and deterministic state fingerprints.
// @consumers: sdd-verify, sdd-check
// @tasks: N/A

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { resolveProjectScriptName } from './readiness.ts';
import type {
  PhaseVerificationGateState,
  PhaseVerificationPlan,
} from './phase-verification-plan.ts';

/** @purpose One command proven by the phase verifier. */
export type PhaseReceiptCommand = {
  /** @purpose Logical rung or `verification` for a ticket-owned extra. */
  gate: string;
  /** @purpose Mechanical ownership category. */
  role: string;
  /** @purpose Exact command executed by the CLI. */
  command: string;
  /** @purpose Process exit status; a persisted receipt only accepts zero. */
  exitCode: number;
};

/** @purpose Stable inputs that define one phase's required mechanical verification. */
export type PhaseReceiptPlan = {
  /** @purpose Repo-relative canonical ticket path. */
  ticket: string;
  /** @purpose Exact phase id. */
  phase: string;
  /** @purpose Context-derived verification profile. */
  profile: 'setup' | 'code' | 'test';
  /** @purpose Why that profile was selected; preserves a completed bootstrap exemption. */
  profileBasis: 'phase-kind' | 'infra-queue-exemption';
  /** @purpose Exact phase Target Files in ticket order. */
  targets: string[];
  /** @purpose Exact tracked paths whose verified state is absence. */
  deletedFiles: string[];
  /** @purpose Applicable ticket Verification commands in execution order. */
  verification: { command: string; role: string }[];
  /** @purpose Schema-aware coverage producer owner; changes invalidate every bound phase plan. */
  coverageOwner?: string;
  /** @purpose Whether this phase executes the project coverage producer. */
  producesCoverage: boolean;
  /** @purpose Fingerprint of ladder/extra project script bodies reachable for this attempt. */
  environmentState: string;
};

/** @purpose Persisted evidence written only after the complete phase verification succeeds. */
export type PhaseReceipt = PhaseReceiptPlan & {
  /** @purpose Receipt schema version. */
  schema: 1;
  /** @purpose Hash of the plan fields above. */
  planState: string;
  /** @purpose Hash of exact current Target File paths and bytes. */
  targetState: string;
  /** @purpose Per-path evidence allowing a valid ordered writer to supersede only shared targets. */
  targetEvidence?: Record<string, string>;
  /** @purpose Commands actually executed successfully. */
  commands: PhaseReceiptCommand[];
  /** @purpose Canonical gate disposition; only a successfully executed command is PROVEN. */
  gateEvidence?: {
    name: string;
    state: PhaseVerificationGateState;
    command: string | null;
    provider: string | null;
  }[];
};

/** @purpose Parsed receipt collection or one fail-closed structural issue. */
type PhaseReceiptParseResult =
  | { ok: true; receipts: PhaseReceipt[] }
  | { ok: false; issue: string };

const OPEN = '<!--SDD_PHASE_RECEIPT:';
const RECEIPT_BLOCK =
  /^<!--SDD_PHASE_RECEIPT:(P[0-9]+)-->\n```json\n([\s\S]*?)\n```\n<!--\/SDD_PHASE_RECEIPT:\1-->$/gm;

function sha(parts: (string | Buffer)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

/** @purpose Fingerprint the exact structured verification plan without prose or receipt bytes. | @param plan Structured phase plan. | @returns Stable SHA-256 label. */
export function phaseReceiptPlanState(plan: PhaseReceiptPlan): string {
  return sha([JSON.stringify(plan)]);
}

const PACKAGE_MANAGER_BUILTINS: Readonly<Record<'npm' | 'pnpm' | 'yarn', ReadonlySet<string>>> = {
  npm: new Set([
    'access',
    'adduser',
    'audit',
    'bugs',
    'cache',
    'ci',
    'completion',
    'config',
    'dedupe',
    'deprecate',
    'diff',
    'dist-tag',
    'docs',
    'doctor',
    'edit',
    'exec',
    'explain',
    'explore',
    'find-dupes',
    'fund',
    'help',
    'hook',
    'init',
    'install',
    'install-ci-test',
    'install-test',
    'link',
    'll',
    'login',
    'logout',
    'ls',
    'org',
    'outdated',
    'owner',
    'pack',
    'ping',
    'pkg',
    'prefix',
    'profile',
    'prune',
    'publish',
    'query',
    'rebuild',
    'repo',
    'root',
    'search',
    'shrinkwrap',
    'star',
    'stars',
    'team',
    'token',
    'uninstall',
    'unpublish',
    'unstar',
    'update',
    'version',
    'view',
    'whoami',
  ]),
  pnpm: new Set([
    'add',
    'audit',
    'bin',
    'config',
    'create',
    'deploy',
    'dlx',
    'env',
    'exec',
    'fetch',
    'import',
    'init',
    'install',
    'link',
    'list',
    'outdated',
    'pack',
    'patch',
    'prune',
    'publish',
    'rebuild',
    'remove',
    'root',
    'run',
    'server',
    'setup',
    'store',
    'unlink',
    'unpublish',
    'update',
    'why',
  ]),
  yarn: new Set([
    'add',
    'bin',
    'cache',
    'config',
    'create',
    'dedupe',
    'dlx',
    'exec',
    'info',
    'init',
    'install',
    'link',
    'node',
    'npm',
    'pack',
    'patch',
    'plugin',
    'rebuild',
    'remove',
    'run',
    'set',
    'stage',
    'unlink',
    'unplug',
    'up',
    'version',
    'why',
    'workspace',
    'workspaces',
  ]),
};

type PackageManager = 'npm' | 'pnpm' | 'yarn';
type ScriptInvocation = {
  name: string;
  lifecycleHooks: boolean;
  manager: PackageManager;
};
type PackageManagerInvocation = {
  manager: PackageManager;
  invocation?: ScriptInvocation;
  forwardedArgv: string[];
  evidence: string;
};

const PACKAGE_MANAGER_ROOT_OPTION: Readonly<Record<PackageManager, ReadonlySet<string>>> = {
  npm: new Set(['--prefix', '-C']),
  pnpm: new Set(['--dir', '-C']),
  yarn: new Set(['--cwd']),
};

function packageManagerInvocation(
  segment: string,
  scripts: Readonly<Record<string, string>>
): PackageManagerInvocation | null {
  const argv = tokens(segment);
  while (argv.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0] as string)) argv.shift();
  const executable = argv.shift();
  if (!executable) return null;
  const manager = executable.split('/').at(-1) as PackageManager;
  if (manager !== 'npm' && manager !== 'pnpm' && manager !== 'yarn') return null;

  let index = 0;
  const consumeOptions = (): void => {
    while (index < argv.length) {
      const arg = argv[index] as string;
      const option = arg.split('=', 1)[0] as string;
      if (option === '--silent' || option === '-s') {
        index++;
        continue;
      }
      if (PACKAGE_MANAGER_ROOT_OPTION[manager].has(option)) {
        const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[index + 1];
        if (!value) throw new Error(`${manager} option has no value: ${option}`);
        if (value !== '.' && value !== './') {
          throw new Error(
            `${manager} ${option} selects ${value}; only the project-root package is supported`
          );
        }
        index += arg.includes('=') ? 1 : 2;
        continue;
      }
      if (arg.startsWith('-')) {
        throw new Error(`unsupported ${manager} option cannot be bound: ${arg}`);
      }
      break;
    }
  };

  consumeOptions();
  const command = argv[index++];
  if (!command) throw new Error(`${manager} command is missing`);
  const explicitRun = command === 'run' || (manager === 'npm' && command === 'run-script');
  if (explicitRun) {
    consumeOptions();
    const name = argv[index++];
    if (!name || name.startsWith('-')) throw new Error(`${manager} ${command} script is missing`);
    if (!/^[A-Za-z0-9:_-]+$/.test(name))
      throw new Error(`${manager} script name is unsupported: ${name}`);
    if (scripts[name] === undefined)
      throw new Error(`${manager} ${command} references missing project script: ${name}`);
    return {
      manager,
      invocation: { name, lifecycleHooks: true, manager },
      forwardedArgv: argv.slice(index).filter((arg) => arg !== '--'),
      evidence: `${manager}:${command}:${name}`,
    };
  }
  if (manager === 'npm' && /^(start|test|stop|restart)$/.test(command)) {
    return {
      manager,
      invocation: { name: command, lifecycleHooks: true, manager },
      forwardedArgv: argv.slice(index).filter((arg) => arg !== '--'),
      evidence: `npm:shortcut:${command}`,
    };
  }
  if (
    (manager === 'pnpm' || manager === 'yarn') &&
    scripts[command] !== undefined &&
    !PACKAGE_MANAGER_BUILTINS[manager].has(command)
  ) {
    return {
      manager,
      invocation: { name: command, lifecycleHooks: true, manager },
      forwardedArgv: argv.slice(index).filter((arg) => arg !== '--'),
      evidence: `${manager}:shortcut:${command}`,
    };
  }
  if (PACKAGE_MANAGER_BUILTINS[manager].has(command)) {
    if (index < argv.length) {
      throw new Error(
        `unsupported ${manager} builtin arguments cannot be bound: ${argv.slice(index).join(' ')}`
      );
    }
    return { manager, forwardedArgv: [], evidence: `${manager}:builtin:${command}` };
  }
  throw new Error(`unsupported ${manager} command cannot be bound: ${command}`);
}

/** @purpose Resolve actual package-script invocations and whether npm will apply pre/post lifecycle hooks. */
function referencedScriptInvocations(
  command: string,
  scripts: Readonly<Record<string, string>>
): ScriptInvocation[] {
  const found = new Map<string, ScriptInvocation>();
  const remember = (invocation: ScriptInvocation): void => {
    const key = `${invocation.manager}:${invocation.name}`;
    found.set(key, invocation);
  };
  const split = commandSegments(command);
  if (!split.ok) throw new Error(split.issue);
  for (const segment of split.segments) {
    const parsed = packageManagerInvocation(segment, scripts);
    if (parsed?.invocation) {
      remember(parsed.invocation);
    }
  }
  return [...found.values()];
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function tokens(command: string): string[] {
  const argv: string[] = [];
  let token = '';
  let started = false;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const flush = (): void => {
    if (started) argv.push(token);
    token = '';
    started = false;
  };
  for (const char of command) {
    if (escaped) {
      token += char;
      started = true;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else token += char;
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    token += char;
    started = true;
  }
  if (quote) throw new Error('unterminated shell quote is unsupported');
  if (escaped) throw new Error('trailing shell escape is unsupported');
  flush();
  return argv;
}

const LOCAL_INPUT_POLICY = 'phase-receipt-local-inputs/v4';
const RUNNER_ADAPTER_POLICY = 'phase-receipt-runner-adapters/v3';

type CommandSegments = { ok: true; segments: string[] } | { ok: false; issue: string };

/** @purpose Split only the small supported shell-chain subset and reject dynamic shell semantics. */
function commandSegments(command: string): CommandSegments {
  const segments: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const flush = (): void => {
    if (current.trim()) segments.push(current.trim());
    current = '';
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index] as string;
    const next = command[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      if (quote !== "'" && (char === '`' || char === '$')) {
        return { ok: false, issue: 'dynamic shell expansion is unsupported' };
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '`' || char === '$') {
      return { ok: false, issue: 'dynamic shell expansion is unsupported' };
    }
    if (
      char === '\n' ||
      char === ';' ||
      (char === '&' && next === '&') ||
      (char === '|' && next === '|')
    ) {
      flush();
      if ((char === '&' || char === '|') && next === char) index++;
      continue;
    }
    if (char === '|' || char === '&' || char === '<' || char === '>') {
      return { ok: false, issue: `shell operator ${char} is unsupported` };
    }
    current += char;
  }
  if (quote) return { ok: false, issue: 'unterminated shell quote is unsupported' };
  if (escaped) return { ok: false, issue: 'trailing shell escape is unsupported' };
  flush();
  return { ok: true, segments };
}

const SCRIPT_RUNNERS = new Set([
  'node',
  'tsx',
  'ts-node',
  'deno',
  'bun',
  'bash',
  'sh',
  'zsh',
  'python',
  'python3',
  'ruby',
  'perl',
  'php',
]);

const INLINE_CODE_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  node: new Set(['-e', '--eval', '-p', '--print', '-pe', '-ep']),
  tsx: new Set(['-e', '--eval', '-p', '--print']),
  'ts-node': new Set(['-e', '--eval', '-p', '--print']),
  python: new Set(['-c', '-m']),
  python3: new Set(['-c', '-m']),
  bash: new Set(['-c']),
  sh: new Set(['-c']),
  zsh: new Set(['-c']),
  ruby: new Set(['-e']),
  perl: new Set(['-e']),
  php: new Set(['-r']),
};

const OPTION_VALUE_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  node: new Set([
    '--import',
    '--require',
    '--loader',
    '--experimental-loader',
    '--env-file',
    '--test-concurrency',
    '--test-name-pattern',
    '--test-reporter',
    '--test-reporter-destination',
    '--test-shard',
    '--test-timeout',
    '-r',
  ]),
  tsx: new Set(['--conditions', '--tsconfig', '--tsconfig-raw']),
  'ts-node': new Set(['--compiler', '--compiler-options', '--project', '--transpiler']),
  python: new Set(['-W', '-X', '--check-hash-based-pycs']),
  python3: new Set(['-W', '-X', '--check-hash-based-pycs']),
  ruby: new Set(['-I', '-r', '-E']),
  perl: new Set(['-I']),
  php: new Set(['-c', '-d']),
};

const LOCAL_INPUT_OPTION_FLAGS = new Set([
  '--import',
  '--require',
  '--loader',
  '--experimental-loader',
  '--config',
  '--env-file',
  '--project',
  '--spec',
  '--tsconfig',
  '--test-reporter-destination',
  '-r',
]);

const STRICT_LOCAL_INPUT_OPTION_FLAGS = new Set([
  '--config',
  '--env-file',
  '--project',
  '--spec',
  '--tsconfig',
  '--test-reporter-destination',
]);

const RUNNER_BOOLEAN_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  node: new Set([
    '--check',
    '--experimental-test-module-mocks',
    '--experimental-test-coverage',
    '--enable-source-maps',
    '--experimental-strip-types',
    '--experimental-transform-types',
    '--no-warnings',
    '--test',
    '--test-only',
    '--watch',
  ]),
  tsx: new Set(['--no-cache']),
  'ts-node': new Set(['--esm', '--files', '--swc', '--transpile-only']),
  deno: new Set(['run', 'test', '--allow-all', '-A']),
  bun: new Set(['run', 'test']),
  bash: new Set([]),
  sh: new Set([]),
  zsh: new Set([]),
  python: new Set(['-B', '-E', '-I', '-O', '-OO', '-P', '-q', '-s', '-S', '-u', '-v']),
  python3: new Set(['-B', '-E', '-I', '-O', '-OO', '-P', '-q', '-s', '-S', '-u', '-v']),
  ruby: new Set([]),
  perl: new Set([]),
  php: new Set([]),
};

const NODE_TEST_VALUE_FLAGS = new Set([
  '--test-concurrency',
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-timeout',
]);

const GO_VALUE_FLAGS = new Set([
  '-C',
  '-exec',
  '-mod',
  '-modfile',
  '-overlay',
  '-p',
  '-pgo',
  '-tags',
]);

const GO_LOCAL_INPUT_FLAGS = new Set(['-modfile', '-overlay']);
const GO_BOOLEAN_FLAGS = new Set(['-a', '-n', '-race', '-v', '-work', '-x']);

function looksLocalPath(value: string): boolean {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return false;
  return (
    value === '.' ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    isAbsolute(value) ||
    value.endsWith('/') ||
    /\.(?:[cm]?[jt]s|py|rb|php|sh|bash|zsh|go)$/.test(value)
  );
}

function existingRepoOperand(root: string, value: string): boolean {
  if (value.startsWith('-') || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return false;
  const absolute = resolve(root, value);
  return inside(root, absolute) && existsSync(absolute);
}

type LocalInputClassification =
  | { ok: true; inputs: string[]; evidence: string[] }
  | { ok: false; issue: string };

/** @purpose Bind exact forwarded package-script argv plus every explicit or existing repo-local operand. */
function classifyForwardedArgv(
  root: string,
  manager: PackageManager,
  argv: readonly string[]
): LocalInputClassification {
  const inputs: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    const optionName = arg.split('=', 1)[0] as string;
    if (LOCAL_INPUT_OPTION_FLAGS.has(optionName)) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++index];
      if (!value)
        return {
          ok: false,
          issue: `${manager} forwarded option has no value: ${optionName}`,
        };
      inputs.push(value);
      continue;
    }
    if (looksLocalPath(arg) || existingRepoOperand(root, arg)) inputs.push(arg);
  }
  return {
    ok: true,
    inputs: [...new Set(inputs)],
    evidence: [`forwarded:${manager}:${JSON.stringify(argv)}`],
  };
}

const CONFIG_FILE_NAMES: Readonly<Record<string, ReadonlySet<string>>> = {
  prettier: new Set([
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.json5',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.mjs',
    '.prettierrc.ts',
    '.prettierrc.cts',
    '.prettierrc.mts',
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs',
    'prettier.config.ts',
    'prettier.config.cts',
    'prettier.config.mts',
  ]),
  eslint: new Set([
    'eslint.config.js',
    'eslint.config.cjs',
    'eslint.config.mjs',
    'eslint.config.ts',
    'eslint.config.cts',
    'eslint.config.mts',
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc.js',
    '.eslintrc.cjs',
  ]),
  vitest: new Set([
    'vitest.config.js',
    'vitest.config.cjs',
    'vitest.config.mjs',
    'vitest.config.ts',
    'vitest.config.cts',
    'vitest.config.mts',
    'vite.config.js',
    'vite.config.cjs',
    'vite.config.mjs',
    'vite.config.ts',
    'vite.config.cts',
    'vite.config.mts',
  ]),
  c8: new Set(['.c8rc', '.c8rc.json', '.c8rc.json5', 'c8.config.js', 'c8.config.cjs']),
};

const CONFIG_DISCOVERY_EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'coverage', 'dist']);
const PACKAGE_CONFIG_KEYS: Readonly<Record<string, string>> = {
  prettier: 'prettier',
  eslint: 'eslintConfig',
  vitest: 'vitest',
  c8: 'c8',
};

/** @purpose Conservatively bind every repo config candidate a supported discovery runner could select. */
function discoveredConfigInputs(root: string, runner: keyof typeof CONFIG_FILE_NAMES): string[] {
  const names = CONFIG_FILE_NAMES[runner];
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      if (CONFIG_DISCOVERY_EXCLUDED_DIRS.has(name)) continue;
      const absolute = resolve(directory, name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        if (names.has(name)) found.push(relative(root, absolute).split(sep).join('/'));
        continue;
      }
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (stat.isFile() && names.has(name)) {
        found.push(relative(root, absolute).split(sep).join('/'));
        continue;
      }
      if (stat.isFile() && name === 'package.json') {
        try {
          const pkg = JSON.parse(readFileSync(absolute, 'utf-8')) as Record<string, unknown>;
          if (pkg[PACKAGE_CONFIG_KEYS[runner] as string] !== undefined)
            found.push(relative(root, absolute).split(sep).join('/'));
        } catch {
          // An invalid package manifest is rejected by the outer environment parser when it is root;
          // nested package manifests that cannot configure the runner are not evidence inputs.
        }
      }
    }
  };
  walk(root);
  return found;
}

/** @purpose Bind the exact TypeScript config selected by `tsc -p/--project` or root discovery. */
function classifyTsc(root: string, argv: readonly string[]): LocalInputClassification {
  const inputs: string[] = [];
  let project: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (arg === '-p' || arg === '--project') {
      if (project !== undefined)
        return { ok: false, issue: `tsc project option is repeated: ${arg}` };
      project = argv[++index];
      if (!project) return { ok: false, issue: `tsc project option has no value: ${arg}` };
      continue;
    }
    if (arg.startsWith('--project=')) {
      if (project !== undefined)
        return { ok: false, issue: 'tsc project option is repeated: --project' };
      project = arg.slice('--project='.length);
      if (!project) return { ok: false, issue: 'tsc project option has no value: --project' };
      continue;
    }
    if (arg === '-b' || arg === '--build' || arg.startsWith('--build=')) {
      return {
        ok: false,
        issue: 'tsc build mode is unsupported because project-reference inputs are not bound',
      };
    }
    if (!arg.startsWith('-') && looksLocalPath(arg)) inputs.push(arg);
  }
  if (project !== undefined) {
    const absolute = resolve(root, project);
    try {
      if (lstatSync(absolute).isDirectory()) project = resolve(absolute, 'tsconfig.json');
    } catch {
      // The shared repo-path validator below emits the canonical missing/unreadable diagnostic.
    }
    inputs.push(project);
    return { ok: true, inputs, evidence: [`adapter:tsc/v1:project:${project}`] };
  }
  if (inputs.length === 0) {
    const implicit = 'tsconfig.json';
    if (!existsSync(resolve(root, implicit))) {
      return { ok: true, inputs: [], evidence: ['adapter:tsc/v1:implicit:absent'] };
    }
    inputs.push(implicit);
    return { ok: true, inputs, evidence: [`adapter:tsc/v1:implicit:${implicit}`] };
  }
  return { ok: true, inputs, evidence: [`adapter:tsc/v1:sources:${inputs.join(',')}`] };
}

function classifyRunnerSegment(
  root: string,
  segment: string,
  scripts: Readonly<Record<string, string>>
): LocalInputClassification {
  const found: string[] = [];
  let argv: string[];
  try {
    argv = tokens(segment);
  } catch (cause) {
    return { ok: false, issue: cause instanceof Error ? cause.message : String(cause) };
  }
  while (argv.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0] as string)) argv.shift();
  const executable = argv.shift();
  if (!executable) return { ok: true, inputs: [], evidence: ['empty'] };
  if (executable.startsWith('./') || executable.startsWith('../')) {
    return { ok: true, inputs: [executable], evidence: [`direct:${executable}`] };
  }
  const base = executable.split('/').at(-1) ?? executable;
  if (base === 'eval') {
    return { ok: false, issue: 'shell eval execution is unsupported' };
  }
  if (base === 'echo' || base === 'true' || base === ':' || base === 'exit') {
    return { ok: true, inputs: [], evidence: [`adapter:shell-builtin/v1:${base}`] };
  }
  if (base === 'tsc') return classifyTsc(root, argv);
  if (base === 'npm' || base === 'pnpm' || base === 'yarn') {
    let parsed: PackageManagerInvocation;
    try {
      parsed = packageManagerInvocation(segment, scripts) as PackageManagerInvocation;
    } catch (cause) {
      return { ok: false, issue: cause instanceof Error ? cause.message : String(cause) };
    }
    const forwarded = classifyForwardedArgv(root, parsed.manager, parsed.forwardedArgv);
    if (!forwarded.ok) return forwarded;
    return {
      ok: true,
      inputs: forwarded.inputs,
      evidence: [`adapter:package-script-hop/v3:${parsed.evidence}`, ...forwarded.evidence],
    };
  }
  if (base === 'npx') {
    let commandIndex = 0;
    while (commandIndex < argv.length) {
      const arg = argv[commandIndex] as string;
      if (['--no-install', '--yes', '-y', '--quiet', '--ignore-existing'].includes(arg)) {
        commandIndex++;
        continue;
      }
      if (arg === '--package' || arg === '-p') {
        commandIndex += 2;
        continue;
      }
      if (arg.startsWith('--package=')) {
        commandIndex++;
        continue;
      }
      if (arg.startsWith('-'))
        return { ok: false, issue: `unsupported npx option cannot be bound: ${arg}` };
      break;
    }
    if (commandIndex >= argv.length)
      return { ok: false, issue: 'npx command has no explicit child runner' };
    if (/^(npm|pnpm|yarn)$/.test(argv[commandIndex] as string)) {
      return {
        ok: false,
        issue: 'a package-manager hop nested under npx is unsupported and cannot be expanded',
      };
    }
    const child = classifyRunnerSegment(
      root,
      argv
        .slice(commandIndex)
        .map((arg) => JSON.stringify(arg))
        .join(' '),
      scripts
    );
    if (!child.ok) return child;
    return {
      ok: true,
      inputs: child.inputs,
      evidence: ['adapter:npx/v1', ...child.evidence],
    };
  }
  if (base === 'gennady') {
    const inputs: string[] = [];
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index] as string;
      const optionName = arg.split('=', 1)[0] as string;
      if (LOCAL_INPUT_OPTION_FLAGS.has(optionName)) {
        const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++index];
        if (!value) return { ok: false, issue: `gennady option has no value: ${optionName}` };
        inputs.push(value);
        continue;
      }
      if (looksLocalPath(arg) || existingRepoOperand(root, arg)) inputs.push(arg);
    }
    return { ok: true, inputs, evidence: [`adapter:gennady/v1:${inputs.join(',')}`] };
  }
  if (base === 'c8') {
    const configInputs = discoveredConfigInputs(root, 'c8');
    const booleanFlags = new Set([
      '--all',
      '--clean',
      '--check-coverage',
      '--exclude-after-remap',
      '--skip-full',
      '--per-file',
      '--allowExternal',
      '--exclude-node-modules',
      '--merge-async',
    ]);
    let commandIndex = 0;
    while (commandIndex < argv.length && (argv[commandIndex] as string).startsWith('-')) {
      const option = argv[commandIndex] as string;
      if (!option.includes('=') && !booleanFlags.has(option)) {
        return {
          ok: false,
          issue: `unsupported c8 option must use an unambiguous --name=value form: ${option}`,
        };
      }
      commandIndex++;
    }
    if (commandIndex >= argv.length)
      return { ok: false, issue: 'c8 command is unsupported without an explicit child runner' };
    if (/^(npm|pnpm|yarn)$/.test(argv[commandIndex] as string)) {
      return {
        ok: false,
        issue: 'a package-manager hop nested under c8 is unsupported and cannot be expanded',
      };
    }
    const child = classifyRunnerSegment(root, argv.slice(commandIndex).join(' '), scripts);
    if (!child.ok) return child;
    return {
      ok: true,
      inputs: [...configInputs, ...child.inputs],
      evidence: [`adapter:c8/v1:configs:${configInputs.join(',')}`, ...child.evidence],
    };
  }
  if (base === 'prettier' || base === 'eslint' || base === 'vitest') {
    const inputs = discoveredConfigInputs(root, base);
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index] as string;
      const optionName = arg.split('=', 1)[0] as string;
      if (optionName === '--config' || (base === 'eslint' && optionName === '-c')) {
        const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++index];
        if (!value) return { ok: false, issue: `${base} config option has no value` };
        inputs.push(value);
        continue;
      }
      if (looksLocalPath(arg) || existingRepoOperand(root, arg)) inputs.push(arg);
    }
    return {
      ok: true,
      inputs: [...new Set(inputs)],
      evidence: [`adapter:${base}/v1:configs:${inputs.join(',')}`],
    };
  }
  if (base === 'go') {
    if (argv.shift() !== 'run') {
      const local = argv.find(looksLocalPath);
      return local
        ? { ok: false, issue: `unsupported go form has an unbound local operand: ${local}` }
        : { ok: true, inputs: [], evidence: ['external:go'] };
    }
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index] as string;
      if (arg === '--') break;
      const optionName = arg.split('=', 1)[0] as string;
      if (arg.startsWith('-')) {
        if (GO_BOOLEAN_FLAGS.has(optionName)) continue;
        if (!GO_VALUE_FLAGS.has(optionName)) {
          return { ok: false, issue: `unsupported go run option cannot be bound: ${optionName}` };
        }
        const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++index];
        if (!value) return { ok: false, issue: `go run option has no value: ${optionName}` };
        if (GO_LOCAL_INPUT_FLAGS.has(optionName)) found.push(value);
        continue;
      }
      if (looksLocalPath(arg)) found.push(arg);
    }
    return { ok: true, inputs: found, evidence: [`go-run:${found.join(',')}`] };
  }
  if (!SCRIPT_RUNNERS.has(base)) {
    return { ok: false, issue: `runner ${base} has no receipt input adapter` };
  }

  const inlineFlags = INLINE_CODE_FLAGS[base] ?? new Set<string>();
  const valueFlags = OPTION_VALUE_FLAGS[base] ?? new Set<string>();
  const booleanFlags = RUNNER_BOOLEAN_FLAGS[base] ?? new Set<string>();
  let nodeTest = false;
  let programBound = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (arg === '--') {
      if (nodeTest) {
        for (const operand of argv.slice(index + 1)) found.push(operand);
      }
      break;
    }
    const optionName = arg.split('=', 1)[0] as string;
    if (inlineFlags.has(optionName)) {
      const inlineValue = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++index];
      if (inlineValue === undefined)
        return { ok: false, issue: `${base} inline/module option has no value: ${optionName}` };
      return {
        ok: false,
        issue: `${base} inline/module execution is unsupported because local reads can be hidden in code`,
      };
    }
    if (base === 'node' && optionName === '--test') nodeTest = true;
    const takesValue =
      valueFlags.has(optionName) ||
      LOCAL_INPUT_OPTION_FLAGS.has(optionName) ||
      (nodeTest && NODE_TEST_VALUE_FLAGS.has(optionName));
    if (takesValue) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++index];
      if (!value) return { ok: false, issue: `${base} option has no value: ${optionName}` };
      if (
        STRICT_LOCAL_INPUT_OPTION_FLAGS.has(optionName) ||
        (LOCAL_INPUT_OPTION_FLAGS.has(optionName) && looksLocalPath(value))
      )
        found.push(value);
      continue;
    }
    if (arg.startsWith('-')) {
      if (arg.includes('=') || booleanFlags.has(optionName)) continue;
      if (programBound) continue;
      if (nodeTest && (index === argv.length - 1 || argv[index + 1]?.startsWith('-'))) continue;
      return { ok: false, issue: `unsupported ${base} option cannot be bound: ${optionName}` };
    }
    if (nodeTest) {
      found.push(arg);
      continue;
    }
    if (!programBound) {
      found.push(arg);
      programBound = true;
    }
  }
  return {
    ok: true,
    inputs: found,
    evidence: [`${nodeTest ? 'node-test' : `runner:${base}`}:${found.join(',')}`],
  };
}

function obviousLocalInputs(
  root: string,
  command: string,
  scripts: Readonly<Record<string, string>>
): LocalInputClassification {
  const split = commandSegments(command);
  if (!split.ok) return split;
  const found: string[] = [];
  const evidence: string[] = [];
  for (const segment of split.segments) {
    const classified = classifyRunnerSegment(root, segment, scripts);
    if (!classified.ok) return classified;
    found.push(...classified.inputs);
    evidence.push(...classified.evidence);
  }
  return { ok: true, inputs: [...new Set(found)], evidence };
}

function localInputEntries(
  root: string,
  commands: readonly string[],
  scripts: Readonly<Record<string, string>>
): { ok: true; entries: string[][]; classifier: string[] } | { ok: false; issue: string } {
  const canonicalRoot = realpathSync(root);
  const entries: string[][] = [];
  const classifier: string[] = [LOCAL_INPUT_POLICY, RUNNER_ADAPTER_POLICY];
  const seen = new Set<string>();
  const visit = (absolute: string, operand: string): void => {
    const canonical = relative(canonicalRoot, realpathSync(absolute)).split(sep).join('/');
    const lexical = relative(canonicalRoot, absolute).split(sep).join('/');
    const key = `${operand}\0${lexical}\0${canonical}`;
    if (seen.has(key)) return;
    seen.add(key);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`${lexical} is a symlink; verification evidence must use regular paths`);
    }
    if (stat.isDirectory()) {
      entries.push([operand, lexical, canonical, 'directory', '-']);
      for (const child of readdirSync(absolute).sort()) visit(resolve(absolute, child), operand);
      return;
    }
    if (!stat.isFile()) throw new Error(`${lexical} is not a regular file`);
    entries.push([
      operand,
      lexical,
      canonical,
      'file',
      createHash('sha256').update(readFileSync(absolute)).digest('hex'),
    ]);
  };
  try {
    for (const command of commands) {
      const classified = obviousLocalInputs(canonicalRoot, command, scripts);
      if (!classified.ok) throw new Error(`${command}: ${classified.issue}`);
      classifier.push(...classified.evidence.map((item) => `${command}\0${item}`));
      for (const input of classified.inputs) {
        let repoInput = input;
        if (isAbsolute(input)) {
          if (!inside(canonicalRoot, input)) {
            classifier.push(`${command}\0external-absolute:${input}`);
            continue;
          }
          repoInput = relative(canonicalRoot, input).split(sep).join('/');
        }
        const inspected = inspectRepoPath(canonicalRoot, repoInput, 'potential');
        if (!inspected.ok) throw new Error(`${input}: ${inspected.detail}`);
        const absolute = inspected.absolute;
        if (!inside(canonicalRoot, absolute)) {
          throw new Error(`${input} escapes project`);
        }
        try {
          visit(absolute, input);
        } catch (cause) {
          throw new Error(`${input}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
    }
    entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    classifier.sort();
    return { ok: true, entries, classifier };
  } catch (cause) {
    return {
      ok: false,
      issue: `cannot fingerprint an explicit repo-local verification input: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

/** @purpose Fingerprint the exact project script definitions reachable from this phase's mechanical plan. | @param root Project root. | @param profile Derived phase profile. | @param producesCoverage Coverage producer choice. | @param verification Ticket-owned extra commands. | @param [hasRepairTargets] Whether repair script bodies belong to this plan. | @returns Stable environment state or a manifest error. */
function phaseVerificationEnvironmentFromScripts(
  root: string,
  rootScripts: readonly string[],
  verification: readonly { command: string }[]
): { ok: true; state: string } | { ok: false; issue: string } {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    const roots = rootScripts.map(
      (name): ScriptInvocation => ({ name, lifecycleHooks: true, manager: 'npm' })
    );
    const referenced = verification.flatMap((gate) =>
      referencedScriptInvocations(gate.command, scripts)
    );
    const queue: ScriptInvocation[] = [...roots, ...referenced];
    const expanded = new Set<string>();
    const entryBodies = new Map<string, string | null>();
    while (queue.length > 0) {
      const invocation = queue.shift() as ScriptInvocation;
      const expansionKey = `${invocation.manager}:${invocation.name}`;
      if (expanded.has(expansionKey)) continue;
      expanded.add(expansionKey);

      const lifecycleNames = invocation.lifecycleHooks
        ? [`pre${invocation.name}`, invocation.name, `post${invocation.name}`]
        : [invocation.name];
      for (const name of lifecycleNames) {
        let body = scripts[name] ?? null;
        // npm start has one documented implicit script. It is executed code and therefore belongs
        // to the receipt environment even when package.json has no explicit `start` entry.
        if (name === 'start' && body === null && existsSync(resolve(root, 'server.js')))
          body = 'node server.js';
        if (!entryBodies.has(name)) entryBodies.set(name, body);
        if (body !== null) queue.push(...referencedScriptInvocations(body, scripts));
      }
      // npm restart falls back to the stop/start lifecycles when no restart body is declared.
      if (
        invocation.manager === 'npm' &&
        invocation.name === 'restart' &&
        scripts.restart === undefined
      ) {
        queue.push(
          { name: 'stop', lifecycleHooks: true, manager: 'npm' },
          { name: 'start', lifecycleHooks: true, manager: 'npm' }
        );
      }
    }
    const entries = [...entryBodies.entries()].sort(([a], [b]) => a.localeCompare(b));
    const local = localInputEntries(
      root,
      [
        ...entries.flatMap(([, body]) => (body === null ? [] : [body])),
        ...verification.map((gate) => gate.command),
      ],
      scripts
    );
    if (!local.ok) return local;
    return {
      ok: true,
      state: sha([
        JSON.stringify(entries),
        JSON.stringify(local.classifier),
        JSON.stringify(local.entries),
      ]),
    };
  } catch (cause) {
    return {
      ok: false,
      issue: `cannot fingerprint project verification scripts: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

/** @purpose Fingerprint the exact project script definitions reachable from this phase's mechanical plan. | @param root Project root. | @param profile Derived phase profile. | @param producesCoverage Coverage producer choice. | @param verification Ticket-owned extra commands. | @param [hasRepairTargets] Whether repair script bodies belong to this plan. | @returns Stable environment state or a manifest error. */
export function phaseVerificationEnvironmentState(
  root: string,
  profile: PhaseReceiptPlan['profile'],
  producesCoverage: boolean,
  verification: readonly { command: string }[],
  hasRepairTargets = true
): { ok: true; state: string } | { ok: false; issue: string } {
  let scripts: Record<string, string> = {};
  try {
    scripts =
      (
        JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
          scripts?: Record<string, string>;
        }
      ).scripts ?? {};
  } catch {
    // The shared environment helper below owns the teaching parse error.
  }
  return phaseVerificationEnvironmentFromScripts(
    root,
    [
      ...(hasRepairTargets ? ['format:fix', 'lint:fix'] : []),
      resolveProjectScriptName(scripts, 'type-check') ?? 'type-check',
      resolveProjectScriptName(
        scripts,
        profile === 'test' && producesCoverage ? 'test:coverage' : 'test'
      ) ?? (profile === 'test' && producesCoverage ? 'test:coverage' : 'test'),
    ],
    verification
  );
}

/**
 * @purpose Fingerprint only commands that the canonical applicable phase plan can actually run.
 * @param root Project root containing package scripts and command dependencies.
 * @param plan Canonical applicable gate plan.
 * @param verification Exact additional verification commands.
 * @returns Stable environment state, or a fail-closed fingerprint issue.
 */
export function phaseVerificationPlanEnvironmentState(
  root: string,
  plan: PhaseVerificationPlan,
  verification: readonly { command: string }[]
): { ok: true; state: string } | { ok: false; issue: string } {
  const roots = plan.gates.flatMap((gate) => {
    if (!['CONFIGURED', 'PROVEN'].includes(gate.state) || gate.command === null) return [];
    if (gate.name === 'fix') return ['format:fix', 'lint:fix'];
    const npm = /^npm run (\S+)$/.exec(gate.command)?.[1];
    return npm ? [npm] : [];
  });
  return phaseVerificationEnvironmentFromScripts(root, roots, verification);
}

/** @purpose Fingerprint exact target paths and bytes after every command has passed. | @param root Project root. | @param targets Exact project-relative Target Files. | @param [deletedFiles] Exact project-relative tombstones whose absence is verified. | @returns Stable state or a read failure. */
export function phaseReceiptTargetState(
  root: string,
  targets: readonly string[],
  deletedFiles: readonly string[] = []
): { ok: true; state: string } | { ok: false; issue: string } {
  const parts: (string | Buffer)[] = [];
  try {
    for (const target of targets) {
      const inspected = inspectRepoPath(root, target, 'file');
      if (!inspected.ok) throw new Error(`Target File ${inspected.detail}: ${target}`);
      parts.push(
        target,
        relative(resolve(root), inspected.absolute),
        readFileSync(inspected.absolute)
      );
    }
    for (const deleted of deletedFiles) {
      const inspected = inspectRepoPath(root, deleted, 'missing');
      if (!inspected.ok) throw new Error(`Deleted File ${inspected.detail}: ${deleted}`);
      parts.push(`deleted:${deleted}`, 'absent');
    }
  } catch (cause) {
    return {
      ok: false,
      issue: `cannot read every Target File: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
  return { ok: true, state: sha(parts) };
}

/**
 * @purpose Fingerprint each exact target independently so ordered shared writers do not hide unrelated drift.
 * @param root Project root containing the target paths.
 * @param targets Exact project-relative files expected to exist.
 * @param [deletedFiles] Exact project-relative tombstones expected to remain absent.
 * @returns Per-target evidence, or a fail-closed path/read issue.
 */
export function phaseReceiptTargetEvidence(
  root: string,
  targets: readonly string[],
  deletedFiles: readonly string[] = []
): { ok: true; evidence: Record<string, string> } | { ok: false; issue: string } {
  const evidence: Record<string, string> = {};
  try {
    for (const target of targets) {
      const inspected = inspectRepoPath(root, target, 'file');
      if (!inspected.ok) throw new Error(`Target File ${inspected.detail}: ${target}`);
      evidence[target] = sha([
        target,
        relative(resolve(root), inspected.absolute),
        readFileSync(inspected.absolute),
      ]);
    }
    for (const deleted of deletedFiles) {
      const inspected = inspectRepoPath(root, deleted, 'missing');
      if (!inspected.ok) throw new Error(`Deleted File ${inspected.detail}: ${deleted}`);
      evidence[deleted] = sha([`deleted:${deleted}`, 'absent']);
    }
  } catch (cause) {
    return {
      ok: false,
      issue: `cannot read every Target File: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
  return { ok: true, evidence };
}

function isReceipt(value: unknown, phase: string): value is PhaseReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<PhaseReceipt>;
  return (
    receipt.schema === 1 &&
    receipt.phase === phase &&
    typeof receipt.ticket === 'string' &&
    /^(setup|code|test)$/.test(receipt.profile ?? '') &&
    /^(phase-kind|infra-queue-exemption)$/.test(receipt.profileBasis ?? '') &&
    Array.isArray(receipt.targets) &&
    receipt.targets.every((target) => typeof target === 'string') &&
    Array.isArray(receipt.deletedFiles) &&
    receipt.deletedFiles.every((target) => typeof target === 'string') &&
    Array.isArray(receipt.verification) &&
    receipt.verification.every(
      (gate) =>
        typeof gate?.command === 'string' &&
        gate.command.length > 0 &&
        typeof gate.role === 'string' &&
        gate.role.length > 0
    ) &&
    (receipt.coverageOwner === undefined || /^P[0-9]+$/.test(receipt.coverageOwner)) &&
    typeof receipt.producesCoverage === 'boolean' &&
    /^sha256:[0-9a-f]{64}$/.test(receipt.environmentState ?? '') &&
    /^sha256:[0-9a-f]{64}$/.test(receipt.planState ?? '') &&
    /^sha256:[0-9a-f]{64}$/.test(receipt.targetState ?? '') &&
    (receipt.targetEvidence === undefined ||
      (typeof receipt.targetEvidence === 'object' &&
        receipt.targetEvidence !== null &&
        JSON.stringify(Object.keys(receipt.targetEvidence).sort()) ===
          JSON.stringify([...(receipt.targets ?? []), ...(receipt.deletedFiles ?? [])].sort()) &&
        Object.values(receipt.targetEvidence).every((value) =>
          /^sha256:[0-9a-f]{64}$/.test(value)
        ))) &&
    Array.isArray(receipt.commands) &&
    receipt.commands.every(
      (command) =>
        typeof command?.gate === 'string' &&
        command.gate.length > 0 &&
        typeof command.role === 'string' &&
        command.role.length > 0 &&
        typeof command.command === 'string' &&
        command.command.length > 0 &&
        command.exitCode === 0
    ) &&
    (receipt.gateEvidence === undefined ||
      (Array.isArray(receipt.gateEvidence) &&
        receipt.gateEvidence.every(
          (gate) =>
            typeof gate === 'object' &&
            gate !== null &&
            typeof gate.name === 'string' &&
            /^(DECLARED|PREREQUISITE_PENDING|PREREQUISITE_MISSING|COMMAND_MISSING|CONFIGURED|PROVEN)$/.test(
              gate.state ?? ''
            ) &&
            (gate.command === null || typeof gate.command === 'string') &&
            (gate.provider === null || typeof gate.provider === 'string')
        )))
  );
}

/** @purpose Parse every paired receipt block; any malformed/duplicate marker fails closed. | @param content Full ticket content. | @returns Receipts or one structural issue. */
export function parsePhaseReceipts(content: string): PhaseReceiptParseResult {
  const receipts: PhaseReceipt[] = [];
  const consumed: string[] = [];
  for (const match of content.matchAll(RECEIPT_BLOCK)) {
    const phase = match[1] as string;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[2] as string);
    } catch {
      return { ok: false, issue: `receipt ${phase} contains invalid JSON` };
    }
    if (!isReceipt(parsed, phase))
      return { ok: false, issue: `receipt ${phase} does not match SDD_PHASE_RECEIPT:v1` };
    receipts.push(parsed);
    consumed.push(match[0]);
  }
  const openCount = content.split(OPEN).length - 1;
  const closeCount = content.split('<!--/SDD_PHASE_RECEIPT:').length - 1;
  if (openCount !== consumed.length || closeCount !== consumed.length)
    return { ok: false, issue: 'unpaired or malformed SDD_PHASE_RECEIPT marker' };
  const phases = receipts.map((receipt) => receipt.phase);
  if (new Set(phases).size !== phases.length)
    return { ok: false, issue: 'more than one receipt exists for the same phase' };
  return { ok: true, receipts };
}

/** @purpose Render one readable paired receipt block for atomic insertion into Execution Log. | @param receipt Complete successful phase evidence. | @returns Paired HTML-like block with JSON body. */
export function formatPhaseReceipt(receipt: PhaseReceipt): string {
  return [
    `<!--SDD_PHASE_RECEIPT:${receipt.phase}-->`,
    '```json',
    JSON.stringify(receipt, null, 2),
    '```',
    `<!--/SDD_PHASE_RECEIPT:${receipt.phase}-->`,
  ].join('\n');
}
