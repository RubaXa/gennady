// @file: Read-only Node project and package-manager fact detection for target Verify.
// @consumers: node-plugin, node-target.logic
// @spec: CLI-VERIFY

import fs from 'node:fs';
import path from 'node:path';

/** @purpose Keep command construction data-driven so npm is a default, not a core invariant. */
export type NodePackageManagerFacts = {
  /** @purpose Detected package-manager family. */
  readonly id: string;
  /** @purpose Direct executable token used without a shell. */
  readonly executable: string;
  /** @purpose Arguments inserted before the exact script name. */
  readonly runScriptPrefix: readonly string[];
  /** @purpose package.json, lockfile, or deterministic default that selected the manager. */
  readonly source: string;
  /** @purpose Whether the target plugin owns this manager's argv contract. */
  readonly supported: boolean;
};

/** @purpose Immutable facts gathered once from package.json and lockfile markers. */
export type NodeProjectFacts = {
  /** @purpose Absolute repository root. */
  readonly root: string;
  /** @purpose Absolute root package.json path. */
  readonly packageJsonPath: string;
  /** @purpose Whether package.json parsed as an object. */
  readonly packageJsonValid: boolean;
  /** @purpose Parse diagnostic retained for actionable readiness. */
  readonly packageJsonError?: string;
  /** @purpose Exact non-empty-or-empty string script bodies keyed by declared name. */
  readonly scripts: Readonly<Record<string, string>>;
  /** @purpose Explicit package-manager command facts. */
  readonly packageManager: NodePackageManagerFacts;
};

const KNOWN_MANAGERS: Readonly<Record<string, { executable: string; prefix: readonly string[] }>> =
  {
    npm: { executable: 'npm', prefix: ['run'] },
    pnpm: { executable: 'pnpm', prefix: ['run'] },
    yarn: { executable: 'yarn', prefix: ['run'] },
    bun: { executable: 'bun', prefix: ['run'] },
  };

/** @purpose Resolve an explicit/lockfile/default package-manager identity deterministically. */
function packageManager(root: string, authored: unknown): NodePackageManagerFacts {
  let id: string;
  let source: string;
  if (typeof authored === 'string' && authored.trim().length > 0) {
    id = authored.split('@')[0] || authored;
    source = 'package.json#packageManager';
  } else if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    id = 'pnpm';
    source = 'pnpm-lock.yaml';
  } else if (fs.existsSync(path.join(root, 'yarn.lock'))) {
    id = 'yarn';
    source = 'yarn.lock';
  } else if (
    fs.existsSync(path.join(root, 'bun.lock')) ||
    fs.existsSync(path.join(root, 'bun.lockb'))
  ) {
    id = 'bun';
    source = fs.existsSync(path.join(root, 'bun.lock')) ? 'bun.lock' : 'bun.lockb';
  } else {
    id = 'npm';
    source = fs.existsSync(path.join(root, 'package-lock.json'))
      ? 'package-lock.json'
      : 'default:npm';
  }
  const known = KNOWN_MANAGERS[id];
  return {
    id,
    executable: known?.executable ?? '',
    runScriptPrefix: known?.prefix ?? [],
    source,
    supported: known !== undefined,
  };
}

/**
 * @purpose Detect a Node project and parse the exact scripts used by target readiness.
 * @param root Absolute repository root.
 * @returns Null without a root package.json; malformed content remains a blocking fact, not a throw.
 */
export function detectNodeProject(root: string): NodeProjectFacts | null {
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('top level must be an object');
    }
    const document = parsed as Record<string, unknown>;
    const rawScripts = document['scripts'];
    const scripts =
      typeof rawScripts === 'object' && rawScripts !== null && !Array.isArray(rawScripts)
        ? Object.fromEntries(
            Object.entries(rawScripts)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          )
        : {};
    return {
      root,
      packageJsonPath,
      packageJsonValid: true,
      scripts,
      packageManager: packageManager(root, document['packageManager']),
    };
  } catch (cause) {
    return {
      root,
      packageJsonPath,
      packageJsonValid: false,
      packageJsonError: cause instanceof Error ? cause.message : String(cause),
      scripts: {},
      packageManager: packageManager(root, undefined),
    };
  }
}

/** @purpose Build a direct argv for one exact package script without shell interpretation. | @param facts Detected package-manager facts. | @param script Exact package script name. | @returns Direct executable argv. | @throws Error when the plugin has no argv adapter for the detected manager. */
export function nodeScriptArgv(facts: NodeProjectFacts, script: string): readonly string[] {
  if (!facts.packageManager.supported) {
    throw new Error(`package manager "${facts.packageManager.id}" has no target argv adapter`);
  }
  return [facts.packageManager.executable, ...facts.packageManager.runScriptPrefix, script];
}
