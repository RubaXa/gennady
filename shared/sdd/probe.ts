// @file: Coarse code/infra heuristics for a repo — only run behind `sdd-state --probe` (minimal-knowledge default).
// @consumers: sdd-state.cmd
// @tasks: N/A

import { readdirSync, existsSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

/** @purpose Directory names never descended into when probing for code. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);

/** @purpose Source-file extensions recognised as code (Node-only support today). */
const CODE_EXT = /\.(js|jsx|ts|tsx)$/;

/** @purpose Tool-config files at the repo root that signal a real toolchain (infra to reverse-engineer). */
const CONFIG_FILES = [
  'tsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'prettier.config.js',
  'prettier.config.cjs',
  '.prettierrc',
  '.prettierrc.json',
  'vitest.config.ts',
  'vitest.config.js',
  'vite.config.ts',
  'vite.config.js',
  'jest.config.js',
  'jest.config.ts',
];

/**
 * @purpose Coarse signal of whether a repo already holds code and tooling — for the root flow to branch greenfield vs from-code.
 * @invariant Heuristic only — `node_modules`, `.git`, hidden, and build dirs are never counted; the file count is a signal, not an inventory.
 */
export type RepoProbe = {
  /** @purpose True when at least one source file exists outside the skipped dirs. */
  codePresent: boolean;
  /** @purpose Count of `.js/.jsx/.ts/.tsx` files found outside the skipped dirs. */
  codeFileCount: number;
  /** @purpose Top-level path segments that contain source (e.g. `src`, `cli`; `.` = repo root). */
  codeDirs: string[];
  /** @purpose True when at least one recognised tool-config file exists at the repo root. */
  infraPresent: boolean;
  /** @purpose The recognised tool-config files found at the repo root. */
  configFiles: string[];
};

/**
 * @purpose Walk a directory tree counting source files and the top-level segment each lives under.
 * @param dir Directory currently being walked.
 * @param root The probe root (for computing the top-level segment).
 * @param acc Mutable accumulator: running count and the set of top-level segments.
 * @returns Nothing — mutates `acc`.
 */
function walkCode(dir: string, root: string, acc: { count: number; dirs: Set<string> }): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      walkCode(join(dir, name), root, acc);
    } else if (CODE_EXT.test(name)) {
      acc.count++;
      const rel = join(dir, name).slice(root.length + 1);
      acc.dirs.add(rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '.');
    }
  }
}

/**
 * @purpose Probe a repo for the presence of code and tooling, with coarse, deterministic heuristics.
 * @invariant Read-only; never descends into `node_modules`/`.git`/hidden/build dirs; Node extensions only.
 * @param root Absolute project root to probe.
 * @returns A RepoProbe: code presence + count + top-level dirs, and infra presence + the config files found.
 */
export function probeRepo(root: string): RepoProbe {
  const acc = { count: 0, dirs: new Set<string>() };
  walkCode(root, root, acc);
  const configFiles = CONFIG_FILES.filter((f) => existsSync(join(root, f)));
  return {
    codePresent: acc.count > 0,
    codeFileCount: acc.count,
    codeDirs: [...acc.dirs].sort(),
    infraPresent: configFiles.length > 0,
    configFiles,
  };
}
