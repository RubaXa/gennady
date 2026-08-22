#!/usr/bin/env node
/**
 * Freshness gate for ai/directives/** (AUTHORING.md — build-directives is the only writer of that
 * tree).
 *
 * ai/directives/*.xml is a BUILD OUTPUT of `ai/kit/build-directives.ts`, rendered from the
 * templates under `ai/kit/templates/`. Nothing used to compare the checked-in output against what
 * the build actually produces, so two failure modes went undetected:
 *
 *   1. A generated file under ai/directives/ gets hand-edited directly (it happened once — an
 *      agent edited ai/directives/ instead of the ai/kit/ source; the next real build silently
 *      reverted the edit, and the checker/generated pair had already drifted before that).
 *   2. A source template under ai/kit/ changes but the build never re-runs, so the checked-in
 *      output stops matching its own source.
 *
 * Both are the same observable symptom: a fresh rebuild does not match ai/directives/ as checked
 * in. This script rebuilds into a throwaway scratch directory (the real ai/directives/ on disk is
 * never touched by this check) and diffs it against the real ai/directives/ with
 * `git diff --no-index`, which reports content differences AND files present on only one side
 * (a hand-added file the build doesn't produce, or a generated file nobody regenerated) through
 * one exit code — `--no-index` works on two arbitrary directories regardless of git tracking
 * state, so an untracked stray file in ai/directives/ shows up exactly like a modified one.
 *
 * ai/directives/ also holds files build-directives.ts does NOT manage at all — not just whole
 * sibling directories (agent-inbox/, architecture/, infra/, testing/, knowledge.xml — no
 * corresponding source under ai/kit/templates/) but individual hand-authored files SITTING INSIDE
 * a build-managed root too (e.g. ai/directives/coding/README.md and svelte5-runes.xml live next to
 * generated coding rule files, from a different source). Comparing whole directories against a
 * scratch rebuild would flag every one of those as spuriously "missing". So the comparison walks
 * the scratch rebuild's own file list (exactly what build-directives.ts actually wrote — nothing
 * else lands in a fresh scratch dir) and mirrors only those exact relative paths from the real
 * tree, file by file, before diffing the two.
 *
 * Run: npm run check:directives-fresh
 */
import { mkdtempSync, rmSync, cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export interface FreshnessResult {
  fresh: boolean;
  /** `git diff --no-index` output; empty when fresh. */
  diff: string;
}

/** All file paths under `dir`, relative to `dir`, posix-joined, recursing into subdirectories. */
function listFilesRelative(dir: string, base: string = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? listFilesRelative(full, base)
      : [full.slice(base.length + 1)];
  });
}

/**
 * Rebuild ai/kit's templates into a scratch dir, then diff ONLY the exact relative file paths the
 * build actually produced against their counterparts (if any) under `directivesDir`.
 * `directivesDir` defaults to the real ai/directives/ under `rootDir`; tests pass a fixture copy
 * instead so they never touch (or depend on the cleanliness of) the real tree.
 */
export function checkDirectivesFresh(
  rootDir: string,
  directivesDir: string = join(rootDir, 'ai/directives'),
): FreshnessResult {
  const scratch = mkdtempSync(join(tmpdir(), 'gennady-directives-scratch-'));
  const mirror = mkdtempSync(join(tmpdir(), 'gennady-directives-mirror-'));
  try {
    const build = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(rootDir, 'ai/kit/build-directives.ts'), `--out=${scratch}`],
      { cwd: rootDir, encoding: 'utf8' },
    );
    if (build.status !== 0) {
      throw new Error(`build-directives.ts failed (exit ${build.status}):\n${build.stdout}\n${build.stderr}`);
    }

    // Mirror ONLY the exact relative paths the build produced, so a hand-authored file sitting
    // next to generated ones (ai/directives/coding/README.md) never enters the comparison, while
    // a hand-EDITED generated file, or one missing/untracked in the real tree, still does.
    for (const rel of listFilesRelative(scratch)) {
      const src = join(directivesDir, rel);
      if (existsSync(src)) {
        mkdirSync(dirname(join(mirror, rel)), { recursive: true });
        cpSync(src, join(mirror, rel));
      }
    }

    const diff = spawnSync('git', ['diff', '--no-index', '--exit-code', '--', mirror, scratch], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    if (diff.status !== 0 && diff.status !== 1) {
      throw new Error(`git diff --no-index failed (exit ${diff.status}):\n${diff.stdout}\n${diff.stderr}`);
    }
    return { fresh: diff.status === 0, diff: diff.stdout };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(mirror, { recursive: true, force: true });
  }
}

function isMain(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const { fresh, diff } = checkDirectivesFresh(ROOT);
  if (fresh) {
    console.log('✓ ai/directives/** matches a fresh rebuild.');
    process.exit(0);
  }
  console.error(diff);
  console.error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ ai/directives/** is STALE — it does not match a fresh rebuild.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ai/directives/*.xml is generated by ai/kit/build-directives.ts from templates under
ai/kit/templates/. It never gets edited by hand. The diff above means one of two things happened:

  1. A generated file under ai/directives/ was hand-edited. Undo that — edit the source template
     under ai/kit/templates/ (or the relevant ai/kit/ helper) instead, then rebuild.
  2. A source template changed but the build was never re-run, so the checked-in output no longer
     reflects its own source.

Fix: run \`npm run build:directives\`, review what changed, then \`git add ai/directives\` and
commit the rebuilt output together with your source change.
`);
  process.exit(1);
}
