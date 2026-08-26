// @file: workspace — create and tear down a disposable git repo the agent runs inside.
// @consumers: harness/core/harness
// @tasks: N/A (eval harness, not published)

import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @purpose A disposable repository the harness owns for one eval run. */
export type Workspace = {
  /** @purpose Absolute path to the repo root. */
  dir: string;
  /** @purpose Remove the whole workspace from disk — call in a finally. */
  cleanup: () => void;
};

/**
 * @purpose Create a fresh temp repo for one eval run — a new temp dir, `git init`, and (optionally)
 *   a seeded fixture copied in.
 * @param label Short scenario label, embedded in the temp dir name for legibility.
 * @param fixtureDir Optional directory whose contents are copied into the repo as the start state.
 * @returns The workspace handle (dir + cleanup).
 */
export function createWorkspace(label: string, fixtureDir?: string): Workspace {
  const base = mkdtempSync(join(tmpdir(), `sdd-harness-${label}-`));
  const dir = join(base, 'repo');
  mkdirSync(dir, { recursive: true });
  if (fixtureDir) {
    cpSync(fixtureDir, dir, { recursive: true });
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'harness@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'SDD Harness'], { cwd: dir });
  return {
    dir,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}
