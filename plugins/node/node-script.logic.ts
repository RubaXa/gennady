// @file: Pure package-script contract checks owned by the target Node plugin.
// @consumers: node-target.logic
// @spec: CLI-VERIFY

import { gennadyLintSourcePolicy } from '../../shared/common/gennady-lint-source-policy.ts';

function segments(body: string): readonly string[] {
  return body
    .replace(/(^|\s)#.*$/gm, '$1')
    .split(/&&|\|\||[;|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hop(command: string): string | null {
  const tokens = command.split(/\s+/);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]!)) tokens.shift();
  return /^(?:npm|pnpm|yarn|bun)$/.test(tokens[0] ?? '') &&
    tokens[1] === 'run' &&
    /^[A-Za-z0-9:_-]+$/.test(tokens[2] ?? '')
    ? tokens[2]!
    : null;
}

const COMMAND_WRAPPERS = new Set(['npx', 'pnpm', 'yarn', 'bunx', 'tsx', 'ts-node', 'node']);
const WRITE_SWITCH = /^--(?:write|fix|autofix)(?:=|$)/;
const REPAIR_WRITE_SWITCH = /^--(?:write|fix|autofix)$/;

/** @purpose Describe one exact repository source scope declared by a Gennady lint command. */
type NodeGennadyLintScope = {
  /** @purpose Repo-relative file or directory operands selected by the command. */
  readonly roots: readonly string[];
  /** @purpose Whether the command deliberately traverses `__tests__` directories. */
  readonly includeTests: boolean;
  /** @purpose Whether the command deliberately includes fixtures, mocks, and config files. */
  readonly includeAll: boolean;
  /** @purpose Repeated project-authored exclusions applied after root selection. */
  readonly exclude: readonly string[];
};

const LINT_BOOLEAN_OPTIONS = new Set(['--include-tests', '--include-all', '--verbose', '-v']);
const LINT_VALUE_OPTIONS = new Set([
  '--exclude',
  '--max-invariants',
  '--max-words',
  '--max-header-words',
  '--max-contract-words',
  '--max-region-comments',
  '--spec',
]);

function withoutEnvironment(argv: readonly string[]): readonly string[] {
  let offset = 0;
  while (offset < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[offset]!)) offset += 1;
  return argv.slice(offset);
}

function commandTokens(argv: readonly string[]): readonly string[] {
  const tokens = [...withoutEnvironment(argv)];
  while (tokens.length > 1 && COMMAND_WRAPPERS.has(tokens[0]!)) tokens.shift();
  return tokens;
}

function lintRoot(token: string): string | null {
  if (
    token.length === 0 ||
    token.startsWith('/') ||
    token.includes('\\') ||
    /[`$;&|<>*?\[\]{}'\"]/.test(token)
  ) {
    return null;
  }
  const segments = token.split('/').filter((part) => part.length > 0 && part !== '.');
  if (segments.includes('..')) return null;
  return segments.join('/');
}

function gennadyLintScope(command: string): NodeGennadyLintScope | null {
  const tokens = commandTokens(command.split(/\s+/));
  if (!nodeArgvInvokesGennadyLint(tokens)) return null;
  const roots: string[] = [];
  const exclude: string[] = [];
  let includeTests = false;
  let includeAll = false;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === '--') continue;
    if (token === '--include-tests') {
      includeTests = true;
      continue;
    }
    if (token === '--include-all') {
      includeAll = true;
      includeTests = true;
      continue;
    }
    if (LINT_BOOLEAN_OPTIONS.has(token)) continue;
    const equals = token.indexOf('=');
    const option = equals < 0 ? token : token.slice(0, equals);
    if (LINT_VALUE_OPTIONS.has(option)) {
      const value = equals < 0 ? tokens[++index] : token.slice(equals + 1);
      if (value === undefined || value.length === 0 || /[\u0000-\u001f\u007f'\"]/.test(value)) {
        return null;
      }
      if (option === '--exclude') exclude.push(value);
      continue;
    }
    if (token.startsWith('-')) return null;
    const root = lintRoot(token);
    if (root === null) return null;
    roots.push(root);
  }
  if (roots.length === 0) return null;
  return {
    roots: [...new Set(roots)].sort(),
    includeTests,
    includeAll,
    exclude: [...new Set(exclude)].sort(),
  };
}

/** @purpose Recognize the Gennady contract linter in direct command position. | @param argv Direct command vector. | @returns Whether the command invokes `gennady lint`. */
export function nodeArgvInvokesGennadyLint(argv: readonly string[]): boolean {
  const tokens = commandTokens(argv);
  return /(?:^|\/)gennady(?:\.[jt]s)?$/.test(tokens[0] ?? '') && tokens[1] === 'lint';
}

/** @purpose Reject known mutating switches from a direct observation command. | @param argv Direct command vector. | @returns Whether the command carries no known write switch. */
export function nodeArgvIsReadOnly(argv: readonly string[]): boolean {
  return !argv.some((token) => WRITE_SWITCH.test(token));
}

/** @purpose Accept a known formatter in its explicit read-only checking mode. | @param argv Direct formatter command vector. | @returns Whether the command is a non-mutating Prettier check. */
export function nodeArgvIsReadOnlyFormat(argv: readonly string[]): boolean {
  const tokens = commandTokens(argv);
  return (
    /(?:^|\/)prettier(?:\.[cm]?js)?$/.test(tokens[0] ?? '') &&
    tokens.includes('--check') &&
    nodeArgvIsReadOnly(argv)
  );
}

/** @purpose Accept a conservative target-free repair argv prefix. | @param argv Direct command vector before Target Files are appended. | @returns Whether only option switches precede one final write switch. */
export function nodeRepairArgvIsSafePrefix(argv: readonly string[]): boolean {
  const tokens = commandTokens(argv);
  if (tokens.length < 2 || !REPAIR_WRITE_SWITCH.test(tokens.at(-1) ?? '')) return false;
  if (tokens[0]!.startsWith('-') || /\s/.test(tokens[0]!) || /[`$;&|<>]/.test(tokens[0]!)) {
    return false;
  }
  const executable = tokens[0]!;
  const commandPrefix = /(?:^|\/)gennady(?:\.[jt]s)?$/.test(executable)
    ? tokens[1] === 'lint'
      ? 2
      : -1
    : /(?:^|\/)eslint(?:\.[cm]?js)?$/.test(executable) ||
        /(?:^|\/)prettier(?:\.[cm]?js)?$/.test(executable)
      ? 1
      : -1;
  if (commandPrefix < 0) return false;
  const beforeWrite = tokens.slice(commandPrefix, -1);
  return beforeWrite.every(
    (token) =>
      token.startsWith('-') &&
      token !== '--' &&
      !/[`$;&|<>]/.test(token) &&
      !/[*?\[\]{}]/.test(token)
  );
}

/** @purpose Traverse exact package-script hops and find Gennady in command position. | @param scripts Declared package scripts. | @param entry Exact starting script. | @returns Whether a command-position Gennady invocation is reachable. */
export function nodeScriptReachesGennady(
  scripts: Readonly<Record<string, string>>,
  entry: string
): boolean {
  const queue = [entry];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const command of segments(scripts[name] ?? '')) {
      if (nodeArgvInvokesGennadyLint(command.split(/\s+/))) return true;
      const next = hop(command);
      if (next !== null && scripts[next] !== undefined) queue.push(next);
    }
  }
  return false;
}

/**
 * @purpose Resolve the exact source operands declared by every reachable Gennady lint command.
 * @param scripts Declared package scripts.
 * @param entry Exact read-only lint script whose source policy owns repair applicability.
 * @returns Deterministic command scopes, or null when a reachable invocation cannot be modeled.
 */
function nodeGennadyLintScopes(
  scripts: Readonly<Record<string, string>>,
  entry: string
): readonly NodeGennadyLintScope[] | null {
  const queue = [entry];
  const seen = new Set<string>();
  const scopes: NodeGennadyLintScope[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const command of segments(scripts[name] ?? '')) {
      if (nodeArgvInvokesGennadyLint(command.split(/\s+/))) {
        const scope = gennadyLintScope(command);
        if (scope === null) return null;
        scopes.push(scope);
      }
      const next = hop(command);
      if (next !== null && scripts[next] !== undefined) queue.push(next);
    }
  }
  return scopes.length === 0
    ? null
    : scopes.sort((left, right) =>
        JSON.stringify(left) < JSON.stringify(right)
          ? -1
          : JSON.stringify(left) > JSON.stringify(right)
            ? 1
            : 0
      );
}

function withinLintRoot(file: string, root: string): boolean {
  return root.length === 0 || file === root || file.startsWith(`${root}/`);
}

/**
 * @purpose Apply the same declared-root and default-exclusion policy as `gennady lint` to one file.
 * @param file Normalized repo-relative exact Target File.
 * @param scopes Parsed read-only lint command scopes.
 * @returns Whether contract repair may receive this file as an exact operand.
 */
function nodeFileMatchesGennadyLintScopes(
  file: string,
  scopes: readonly NodeGennadyLintScope[]
): boolean {
  return scopes.some((scope) => {
    if (!scope.roots.some((root) => withinLintRoot(file, root))) return false;
    return gennadyLintSourcePolicy({
      includeAll: scope.includeAll,
      includeTests: scope.includeTests,
      exclude: scope.exclude,
    }).includes(file);
  });
}

/**
 * @purpose Intersect exact Node Target Files with the source policy of a reachable Gennady lint script.
 * @param scripts Declared package scripts.
 * @param entry Exact read-only lint script whose source policy owns repair applicability.
 * @param files Normalized repo-relative exact Target Files.
 * @returns Filtered repair operands, or null when the source policy cannot be modeled.
 */
export function nodeGennadyLintRepairTargets(
  scripts: Readonly<Record<string, string>>,
  entry: string,
  files: readonly string[]
): readonly string[] | null {
  const scopes = nodeGennadyLintScopes(scripts, entry);
  return scopes === null
    ? null
    : files.filter((file) => nodeFileMatchesGennadyLintScopes(file, scopes));
}

/** @purpose Prove the selected check script graph carries no known write switch. | @param scripts Declared package scripts. | @param entry Exact starting script. | @returns Whether every reachable command is free of known write switches. */
export function nodeScriptIsReadOnly(
  scripts: Readonly<Record<string, string>>,
  entry: string
): boolean {
  if (scripts[entry] === undefined) return false;
  const queue = [entry];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const command of segments(scripts[name] ?? '')) {
      if (!nodeArgvIsReadOnly(command.split(/\s+/))) return false;
      const next = hop(command);
      if (next !== null && scripts[next] !== undefined) queue.push(next);
    }
  }
  return true;
}

/** @purpose Accept only a single target-free repair prefix to which Verify may append files. | @param scripts Declared package scripts. | @param entry Exact repair script. | @returns Whether Verify may safely append `-- <Target Files>`. */
export function nodeRepairIsArgumentForwarding(
  scripts: Readonly<Record<string, string>>,
  entry: string
): boolean {
  const commands = segments(scripts[entry] ?? '');
  if (commands.length !== 1 || hop(commands[0]!) !== null) return false;
  return nodeRepairArgvIsSafePrefix(commands[0]!.split(/\s+/));
}
