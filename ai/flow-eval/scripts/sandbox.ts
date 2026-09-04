// @file: Deterministic prepare/clean of eval sandbox roots via node fs — no manual rm/mktemp in shell.
// @consumers: eval runs (prepare a root), post-run cleanup (clean leftover roots).
// Run with tsx, e.g.:
//   node --import tsx ai/flow-eval/scripts/sandbox.ts prepare     -> prints a fresh sandbox root path
//   node --import tsx ai/flow-eval/scripts/sandbox.ts clean       -> removes leftover eval sandbox roots
//   node --import tsx ai/flow-eval/scripts/sandbox.ts clean --dry -> lists what clean would remove

import { rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = process.env.TMPDIR || tmpdir();
// Every sandbox root this harness creates starts with one of these prefixes; nothing else is touched.
const PREFIXES = ['sdd-flow-eval-root.', 'sdd-flow-eval-test-', 'diag-recover.', 'diag-'];

/** @purpose Whether a temp entry name is one of this harness's sandbox roots (prefix-guarded). */
function isSandbox(name: string): boolean {
  return PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** @purpose Remove (or, with dry, list) every eval sandbox root under TMPDIR; never touches other dirs. */
function clean(dry: boolean): void {
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(TMP);
  } catch (error) {
    console.error(`clean: cannot read ${TMP}: ${(error as Error).message}`);
    process.exit(1);
  }
  for (const name of entries) {
    if (!isSandbox(name)) continue;
    const full = join(TMP, name);
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
  console.log(`clean: ${dry ? 'would remove' : 'removed'} ${removed} sandbox dir(s) under ${TMP}`);
}

/** @purpose Create and print a fresh, uniquely-named sandbox root under TMPDIR. */
function prepare(): void {
  process.stdout.write(mkdtempSync(join(TMP, 'sdd-flow-eval-root.')) + '\n');
}

const cmd = process.argv[2];
if (cmd === 'prepare') {
  prepare();
} else if (cmd === 'clean') {
  clean(process.argv.includes('--dry'));
} else {
  console.error('usage: sandbox.ts <prepare|clean [--dry]>');
  process.exit(2);
}
