// @file: Deterministic prepare/clean of eval sandbox roots via node fs — no manual rm/mktemp in shell.
// @spec: AI-SKILLS
// @consumers: eval runs (prepare a root), post-run cleanup (clean leftover roots).
//   Run with tsx, e.g.:
//     node --import tsx ai/flow-eval/scripts/sandbox.ts prepare        -> prints a fresh sandbox root path
//     node --import tsx ai/flow-eval/scripts/sandbox.ts clean          -> removes leftover eval sandbox roots
//     node --import tsx ai/flow-eval/scripts/sandbox.ts clean --dry    -> lists what clean would remove
//     node --import tsx ai/flow-eval/scripts/sandbox.ts clean --root D -> restrict the sweep to root D (repeatable)
//     node --import tsx ai/flow-eval/scripts/sandbox.ts dependencies --dry --root D
//       -> reports stale/orphan dependency leases and bounded-store GC without deleting active leases
//   The runner now tears its own sandboxes down (cli.ts, finally + signal handlers); this `clean` is the
//   belt-and-suspenders sweep for strays a crashed or externally-killed run could still leave behind.

import { realpathSync, rmSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gcEvalDependencyStores } from '../dependency-store.ts';

const TMP = process.env.TMPDIR || tmpdir();
// Every sandbox root this harness creates starts with one of these prefixes; nothing else is touched.
// `gen-` covers hand-created experiment roots; `sdd-flow-eval-*` the runner's own mkdtemp sandboxes.
const PREFIXES = [
  'sdd-flow-eval-root.',
  'sdd-flow-eval-',
  'sdd-flow-eval-test-',
  'diag-recover.',
  'diag-',
  'gen-',
];

/** @purpose The temp roots a sweep scans by default: $TMPDIR plus the shared temp dirs, deduped. */
function defaultRoots(): string[] {
  const candidates = [TMP, '/private/tmp', '/tmp'];
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    let real = candidate;
    try {
      real = realpathSync(candidate);
    } catch {
      // keep the literal path if it cannot be resolved
    }
    if (seen.has(real)) continue;
    seen.add(real);
    roots.push(candidate);
  }
  return roots;
}

/** @purpose Whether a temp entry name is one of this harness's sandbox roots (prefix-guarded). */
function isSandbox(name: string): boolean {
  return PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** @purpose Remove (or, with dry, list) every eval sandbox root under the given roots; never touches other dirs. */
function clean(dry: boolean, roots: string[]): void {
  let removed = 0;
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = readdirSync(root);
    } catch (error) {
      console.error(`clean: cannot read ${root}: ${(error as Error).message}`);
      continue;
    }
    for (const name of entries) {
      if (!isSandbox(name)) continue;
      const full = join(root, name);
      if (dry) {
        console.log(`would remove ${full}`);
        removed += 1;
        continue;
      }
      try {
        rmSync(full, { recursive: true, force: true });
        removed += 1;
      } catch (error) {
        console.error(`skip ${full}: ${(error as Error).message}`);
      }
    }
  }
  console.log(
    `clean: ${dry ? 'would remove' : 'removed'} ${removed} sandbox dir(s) under ${roots.join(', ')}`
  );
}

/** @purpose Create and print a fresh, uniquely-named sandbox root under TMPDIR. */
function prepare(): void {
  process.stdout.write(mkdtempSync(join(TMP, 'sdd-flow-eval-root.')) + '\n');
}

async function dependencies(dry: boolean, cleanInactive: boolean, roots: string[]): Promise<void> {
  for (const root of roots) {
    const storeRoot = join(root, '.sdd-flow-eval-dependencies');
    const report = await gcEvalDependencyStores(storeRoot, {
      dryRun: dry || !cleanInactive,
      removeAllInactive: cleanInactive,
    });
    for (const entry of report.entries) {
      console.log(`${entry.action} ${entry.kind} ${entry.path} — ${entry.reason}`);
    }
    console.log(`dependencies: ${report.entries.length} decision(s) under ${storeRoot}`);
  }
}

/** @purpose Collect repeated `--root DIR` values from the argv tail. */
function parseRoots(argv: string[]): string[] {
  const roots: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--root' && argv[index + 1]) roots.push(argv[++index]);
  }
  return roots;
}

const cmd = process.argv[2];
if (cmd === 'prepare') {
  prepare();
} else if (cmd === 'clean') {
  const overrides = parseRoots(process.argv.slice(3));
  clean(process.argv.includes('--dry'), overrides.length > 0 ? overrides : defaultRoots());
} else if (cmd === 'dependencies') {
  const overrides = parseRoots(process.argv.slice(3));
  if (overrides.length === 0) {
    throw new Error('dependencies requires at least one explicit --root DIR sandbox root');
  }
  await dependencies(process.argv.includes('--dry'), process.argv.includes('--clean'), overrides);
} else {
  console.error(
    'usage: sandbox.ts <prepare|clean [--dry] [--root DIR]...|dependencies [--dry] [--clean] --root DIR [--root DIR]...>'
  );
  process.exit(2);
}
