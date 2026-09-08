// @file: SO-14 — the four `*sync*`-shaped names and the three `*orient*`-shaped names each read
//   as one distinct subject, in both surfaces a user actually reads: the master `help.cmd.ts`
//   listing (`npx gennady help`) and the `cli` scope's own module map (`specs/cli/cli.spec.md`
//   §9.1). A grep-shaped regression lock, not a behavior test.
// @consumers: release regression suite
// @tasks: N/A

// SO-14 (ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1, 61-TASK-BOARD.md
//   §1): `sync` / `sync-skills` / `sdd-sync` / `sdd-migrate` all contain "sync"; `orient` /
//   `sdd-orient` / `agents-rules` (pending T-10's rename to `agents-orient`, not in this batch) all
//   revolve around "orient" — eight names total once the deferred `sdd-rules` slot is counted, seven
//   concrete today. Confusing any two makes `sdd-sync` (tracker rollup) read as though it were the
//   package-sync mechanism it explicitly is not (T-B6-28). The board's own stop condition: no help
//   line for the not-yet-built `sdd-rules` — writing one would promise a command that does not
//   exist.
//
// This lock does not re-litigate the *wording*; `sync/help.ts`, `sdd-sync/help.ts`,
// `sdd-migrate/help.ts`, and `orient/help.ts` already cross-reference their look-alikes in prose.
// It locks the two structural properties a wording review cannot: (1) each of the seven names is
// listed, in both surfaces, described by exactly one line whose description text is not a
// duplicate of any other listed name's; (2) `sdd-rules` is listed in neither.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');

const NAMES = [
  'sync',
  'sync-skills',
  'sdd-sync',
  'sdd-migrate',
  'orient',
  'sdd-orient',
  'agents-rules',
] as const;

const DEFERRED_NAME = 'sdd-rules';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @purpose Extract, for each of NAMES, the single description line naming it in `help.cmd.ts`'s
 *   `console.info('  <name>   <description>')` command table.
 * @param content Raw source of `cli/cmd/help/help.cmd.ts`.
 * @returns Map of name → description text (undefined if not found).
 */
function extractMasterHelpLines(content: string): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  for (const name of NAMES) {
    const re = new RegExp(`'\\s{2}${escapeRegExp(name)}\\s+([^']+)'`);
    result.set(name, re.exec(content)?.[1]?.trim());
  }
  return result;
}

/**
 * @purpose Extract, for each of NAMES, the single `- [<name>](...) — <description>` bullet in
 *   `cli.spec.md` §9.1's module map.
 * @param content Raw source of `specs/cli/cli.spec.md`.
 * @returns Map of name → description text (undefined if not found).
 */
function extractModuleMapLines(content: string): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  for (const name of NAMES) {
    const re = new RegExp(`^- \\[${escapeRegExp(name)}\\]\\([^)]+\\)\\s*—\\s*(.+)$`, 'm');
    result.set(name, re.exec(content)?.[1]?.trim());
  }
  return result;
}

function assertOneDistinctSubjectPerName(
  lines: Map<string, string | undefined>,
  surface: string
): void {
  const missing = [...lines].filter(([, desc]) => desc === undefined).map(([name]) => name);
  assert.deepEqual(
    missing,
    [],
    `${surface}: missing a description line for: ${missing.join(', ')}`
  );

  const byDescription = new Map<string, string[]>();
  for (const [name, desc] of lines) {
    const key = desc as string;
    byDescription.set(key, [...(byDescription.get(key) ?? []), name]);
  }
  const overlaps = [...byDescription.values()].filter((names) => names.length > 1);
  assert.deepEqual(
    overlaps,
    [],
    `${surface}: two names share one description (not disambiguated): ${JSON.stringify(overlaps)}`
  );
}

describe('command name disambiguation (SO-14)', () => {
  it('describes each of the four *sync*-shaped and three *orient*-shaped names as one distinct subject in `npx gennady help`', () => {
    const content = readFileSync(resolve(ROOT, 'cli/cmd/help/help.cmd.ts'), 'utf-8');
    assertOneDistinctSubjectPerName(extractMasterHelpLines(content), 'help.cmd.ts');
    assert.doesNotMatch(
      content,
      new RegExp(`'\\s{2}${escapeRegExp(DEFERRED_NAME)}\\s`),
      'sdd-rules is a deferred command (§3.1) — no help line until it is actually built'
    );
  });

  it('describes each of the same seven names as one distinct subject in the cli module map', () => {
    const content = readFileSync(resolve(ROOT, 'specs/cli/cli.spec.md'), 'utf-8');
    assertOneDistinctSubjectPerName(extractModuleMapLines(content), 'cli.spec.md §9.1');
    assert.doesNotMatch(
      content,
      new RegExp(`^- \\[${escapeRegExp(DEFERRED_NAME)}\\]`, 'm'),
      'sdd-rules is a deferred command (§3.1) — no module-map entry until it is actually built'
    );
  });
});
