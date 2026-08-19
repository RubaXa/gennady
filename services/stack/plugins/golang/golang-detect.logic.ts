// @file: Go project detection — modules, workspace, vendoring, golangci config, make targets, tools.
// @consumers: golang-plugin, golang-plan.logic
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { StackDiagnostic } from 'gennady/stack';

/** Directories never worth descending into when hunting for `go.mod`. */
const SKIP_DIRS = new Set(['vendor', 'testdata', 'node_modules', '.git', '.idea', 'bin', 'dist']);

/** Depth limit for module discovery — monorepos nest modules shallowly in practice. */
const MAX_MODULE_DEPTH = 3;

/**
 * golangci-lint config names in discovery order.
 *
 * The dot-prefixed names are what golangci-lint finds by itself. The bare names
 * are NOT auto-discovered — real monorepos keep configs in a bare `golangci.yml`, so
 * without an explicit `-c` the linter silently runs with default settings.
 */
const GOLANGCI_CONFIG_NAMES: readonly string[] = [
  '.golangci.yml',
  '.golangci.yaml',
  '.golangci.toml',
  '.golangci.json',
  'golangci.yml',
  'golangci.yaml',
];

/** Make target names that plausibly represent a verification gate. */
const VERIFY_MAKE_TARGET_RE =
  /^(lint|full-lint|lint[_-][a-z0-9_-]+|test|test[_-][a-z0-9_-]+|vet|fmt|check)$/;

/**
 * Matches only values that actually name a golangci config.
 *
 * A looser `-c <path>` pattern is unusable here: Makefiles are full of unrelated
 * `-c` flags (cgo, `gcc -c`, linker paths), which produced nonsense diagnostics.
 */
const GOLANGCI_CONFIG_REFERENCE_RE = /[\w./-]*golangci[\w.-]*\.(?:ya?ml|toml|json)/g;

/** External tool the golang plugin shells out to. */
export type GoToolId = 'go' | 'golangci-lint' | 'gofmt';

/**
 * @purpose A resolved external tool: absolute path plus how it was found.
 * @consumer golang-plan.logic, golang-plugin
 */
export type GoTool = {
  /** @purpose Identifier of the tool this entry describes. */
  readonly id: GoToolId;
  /** @purpose Absolute path to the executable, or null when the tool is unavailable. */
  readonly bin: string | null;
  /** @purpose Where the binary came from — `repo-bin` wins over `path` so pinned versions are honoured. */
  readonly origin: 'repo-bin' | 'path' | 'missing';
  /** @purpose Go toolchain version the binary was built with, when the tool reports it. */
  readonly builtWithGo: string | null;
};

/**
 * @purpose One Go module discovered under the repository root.
 * @consumer golang-plan.logic, golang-plugin
 */
export type GoModule = {
  /** @purpose Absolute directory holding the `go.mod`. */
  readonly dir: string;
  /** @purpose Module path declared on the `module` line. */
  readonly path: string;
  /** @purpose Language version from the `go` directive, empty when unparseable. */
  readonly goVersion: string;
};

/**
 * @purpose Everything the gate planner needs to know about a Go repository.
 * @consumer golang-plan.logic, golang-scope.logic, golang-plugin
 */
export type GoProject = {
  /** @purpose Absolute repository root — the directory the plugin was pointed at. */
  readonly root: string;
  /** @purpose Modules found under root, nearest-first; empty when this is not a Go repository. */
  readonly modules: readonly GoModule[];
  /** @purpose Absolute path to `go.work`, or null. */
  readonly workspace: string | null;
  /** @purpose True when `vendor/modules.txt` exists next to the primary module. */
  readonly vendored: boolean;
  /** @purpose Absolute path to the golangci config, including non-dot names golangci-lint cannot auto-discover. */
  readonly golangciConfig: string | null;
  /** @purpose Config paths referenced by the Makefile but absent from disk. */
  readonly missingGolangciConfigs: readonly string[];
  /** @purpose Make targets present in a root `Makefile`, restricted to verification-shaped names. */
  readonly makeTargets: readonly string[];
  /** @purpose Resolved external tools, keyed by id. */
  readonly tools: Readonly<Record<GoToolId, GoTool>>;
  /** @purpose Environment problems detected before any gate runs. */
  readonly diagnostics: readonly StackDiagnostic[];
};

/**
 * @purpose Read a UTF-8 file, returning null instead of throwing on any I/O failure.
 * @param filePath Absolute path to read.
 * @returns File contents, or null when unreadable.
 */
function readTextOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * @purpose Test whether a path exists and is a regular file.
 * @param filePath Absolute path to test.
 * @returns True when the path is an existing regular file.
 */
function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * @purpose Parse `module` and `go` directives out of a go.mod file.
 * @param goModPath Absolute path to the go.mod.
 * @returns Module descriptor, or null when the file cannot be read.
 */
function parseGoMod(goModPath: string): GoModule | null {
  const text = readTextOrNull(goModPath);
  if (text === null) {
    return null;
  }

  const modulePath = /^\s*module\s+(\S+)/m.exec(text)?.[1] ?? '';
  const goVersion = /^\s*go\s+(\d[\w.]*)/m.exec(text)?.[1] ?? '';

  return { dir: path.dirname(goModPath), path: modulePath, goVersion };
}

/**
 * @purpose Walk the tree under root collecting every non-vendored go.mod, nearest-first.
 * @param root Absolute repository root.
 * @returns Discovered modules ordered by path depth then name.
 */
function findModules(root: string): GoModule[] {
  const found: GoModule[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  // #region START_MODULE_BFS — invariant: never descends into SKIP_DIRS or past MAX_MODULE_DEPTH
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;

    const goModPath = path.join(dir, 'go.mod');
    if (isFile(goModPath)) {
      const mod = parseGoMod(goModPath);
      if (mod !== null) {
        found.push(mod);
      }
    }

    if (depth >= MAX_MODULE_DEPTH) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  // #endregion END_MODULE_BFS

  found.sort(
    (a, b) =>
      a.dir.split(path.sep).length - b.dir.split(path.sep).length || a.dir.localeCompare(b.dir)
  );
  return found;
}

/**
 * @purpose Locate the golangci-lint config, preferring conventional names at the module root.
 * @param root Absolute directory to search.
 * @returns Absolute config path, or null when none of the known names exist.
 */
function findGolangciConfig(root: string): string | null {
  for (const name of GOLANGCI_CONFIG_NAMES) {
    const candidate = path.join(root, name);
    if (isFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * @purpose Collect golangci config paths a Makefile references but which are absent from disk.
 * @param root Absolute repository root.
 * @param makefile Makefile contents, or null when there is no Makefile.
 * @returns Repo-relative paths that the Makefile expects but that do not exist.
 */
function findMissingGolangciConfigs(root: string, makefile: string | null): string[] {
  if (makefile === null) {
    return [];
  }

  const missing = new Set<string>();

  for (const match of makefile.matchAll(GOLANGCI_CONFIG_REFERENCE_RE)) {
    const raw = match[0];
    // Skip make variable expansions — they cannot be resolved without running make.
    if (raw.includes('$')) {
      continue;
    }
    if (!isFile(path.resolve(root, raw))) {
      missing.add(raw);
    }
  }

  return [...missing].sort();
}

/**
 * @purpose Extract verification-shaped target names from a Makefile.
 * @param makefile Makefile contents, or null when absent.
 * @returns Sorted unique target names matching the verification naming shape.
 */
function findMakeTargets(makefile: string | null): string[] {
  if (makefile === null) {
    return [];
  }

  const targets = new Set<string>();
  for (const match of makefile.matchAll(/^([a-zA-Z0-9_.-]+)\s*::?(?!=)/gm)) {
    const name = match[1]!;
    if (VERIFY_MAKE_TARGET_RE.test(name)) {
      targets.add(name);
    }
  }

  return [...targets].sort();
}

/**
 * @purpose Read the Go toolchain version a linter binary was compiled against.
 * @param id Tool identifier; only golangci-lint reports this.
 * @param bin Absolute path to the executable.
 * @returns Dotted Go version such as `1.25.5`, or null when unavailable.
 * @sideEffect Process: runs `<bin> version` with a short timeout (detect-time probe).
 */
function readBuiltWithGo(id: GoToolId, bin: string): string | null {
  if (id !== 'golangci-lint') {
    return null;
  }

  const proc = spawnSync(bin, ['version'], { encoding: 'utf-8', timeout: 10_000 });
  const text = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
  return /built with go(\d[\w.]*)/.exec(text)?.[1] ?? null;
}

/**
 * @purpose Resolve an executable, preferring a repo-pinned binary over whatever PATH offers.
 * @param id Tool identifier used for both the binary name and the report.
 * @param root Absolute repository root, searched for a pinned `bin/<id>`.
 * @returns Resolved tool with its origin; `bin` is null when the tool is unavailable.
 */
function resolveTool(id: GoToolId, root: string): GoTool {
  // #region START_REPO_BIN — invariant: a repo-pinned binary always wins over PATH
  const pinned = path.join(root, 'bin', id);
  try {
    fs.accessSync(pinned, fs.constants.X_OK);
    return { id, bin: pinned, origin: 'repo-bin', builtWithGo: readBuiltWithGo(id, pinned) };
  } catch {
    // Fall through to PATH lookup.
  }
  // #endregion END_REPO_BIN

  const pathEntries = (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, id);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return { id, bin: candidate, origin: 'path', builtWithGo: readBuiltWithGo(id, candidate) };
    } catch {
      continue;
    }
  }

  return { id, bin: null, origin: 'missing', builtWithGo: null };
}

/**
 * @purpose Compare two dotted version strings numerically, segment by segment.
 * @param left First version.
 * @param right Second version.
 * @returns Negative when left is older, positive when newer, zero when equal.
 */
function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);

  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const diff = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * @purpose Flag environment problems that would make gate output misleading if left unexplained.
 * @param modules Discovered modules, whose first entry supplies the required language version.
 * @param golangci Resolved golangci-lint tool.
 * @param missingConfigs Config paths the Makefile expects but that are absent.
 * @returns Diagnostics describing each problem and how to resolve it.
 */
function collectDiagnostics(
  modules: readonly GoModule[],
  golangci: GoTool,
  missingConfigs: readonly string[]
): StackDiagnostic[] {
  const diagnostics: StackDiagnostic[] = [];
  const required = modules[0]?.goVersion ?? '';

  // #region START_LINTER_GO_SKEW — golangci-lint panics outright on packages newer than its own Go
  if (required.length > 0 && golangci.builtWithGo !== null) {
    if (compareVersions(golangci.builtWithGo, required) < 0) {
      diagnostics.push({
        code: 'GOLANGCI_GO_TOO_OLD',
        message:
          `golangci-lint was built with go${golangci.builtWithGo} but this module requires go${required} — ` +
          'the linter will panic instead of reporting issues.',
        fix: `Install a golangci-lint built with go${required}+, or skip via gennady.yaml: stack.golang.skipGates: [lint].`,
      });
    }
  }
  // #endregion END_LINTER_GO_SKEW

  if (missingConfigs.length > 0) {
    diagnostics.push({
      code: 'GOLANGCI_CONFIG_MISSING',
      message: `Makefile references golangci config(s) absent from the checkout: ${missingConfigs.join(', ')}`,
      fix: 'Restore the config, or rely on the config the plugin discovered (shown as `config:` in --plan).',
    });
  }

  if (modules.length > 1) {
    diagnostics.push({
      code: 'NESTED_MODULES',
      message: `${modules.length - 1} nested module(s) found — \`./...\` does not cross module boundaries.`,
      fix: 'Verify each nested module separately with --root=<module-dir>.',
    });
  }

  return diagnostics;
}

/**
 * @purpose Inspect a repository and describe everything the gate planner needs to know about it.
 * @param root Absolute repository root to inspect.
 * @returns Project description; `modules` is empty when root is not a Go repository.
 */
export function detectGoProject(root: string): GoProject {
  const modules = findModules(root);
  const primary = modules[0]?.dir ?? root;
  const makefile = readTextOrNull(path.join(root, 'Makefile'));
  const workspace = isFile(path.join(root, 'go.work')) ? path.join(root, 'go.work') : null;

  const tools: Record<GoToolId, GoTool> = {
    go: resolveTool('go', root),
    'golangci-lint': resolveTool('golangci-lint', root),
    gofmt: resolveTool('gofmt', root),
  };
  const missingGolangciConfigs = findMissingGolangciConfigs(root, makefile);

  return {
    root,
    modules,
    workspace,
    vendored: isFile(path.join(primary, 'vendor', 'modules.txt')),
    golangciConfig: findGolangciConfig(primary) ?? findGolangciConfig(root),
    missingGolangciConfigs,
    makeTargets: findMakeTargets(makefile),
    tools,
    diagnostics: collectDiagnostics(modules, tools['golangci-lint'], missingGolangciConfigs),
  };
}
