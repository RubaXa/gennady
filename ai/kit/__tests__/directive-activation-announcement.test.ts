// @file: LOCK-3 contract test — SKILL.md and rendered ai/directives/sdd-v2/** dispatch templates
//   never ask the agent to announce DIRECTIVE ACTIVATED.
// @consumers: release regression suite
// @tasks: N/A

// LOCK-3 (20-ISSUES-VERDICTS.md #16, ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1):
// v1 shipped nine skills whose `SKILL.md` instructed `Announce: 🔒 DIRECTIVE ACTIVATED: Sdd…`, while
// `AX_NO_PROCESS_NARRATION` names that exact phrase as its first example of forbidden narration —
// every dispatched phase agent hit the contradiction fresh. v1 never fixed the seven skills that
// carry the banner (only sdd-execute/sdd-execute-batch were rewritten by #14).
// v2 skills are thin directive-loaders and carry no announce banner at all (the phrase exists only
// as the axiom's own forbidden-example definition, never as an instruction skills must follow).
// This is the regression lock: any future SKILL.md that reintroduces the announcement fails here.
//
// The verbatim requirement (20-ISSUES-VERDICTS.md:272) is wider than SKILL.md alone: "Contract-тест
// по ai/skills/**/SKILL.md И rendered ai/directives/sdd-v2/**: doesNotMatch(/DIRECTIVE ACTIVATED/)
// в скиллах и dispatch-шаблонах." The second half was missing from the first cut of this lock (a
// regression could have reintroduced an `Announce: ... DIRECTIVE ACTIVATED` instruction inside a
// rendered `*.directive.xml` dispatch template and this test would have stayed green). This scans
// every file under `ai/directives/sdd-v2/**` too — with one allow-listed exception:
// `router.directive.xml:130` carries `AX_NO_PROCESS_NARRATION`'s own definition, which cites the
// phrase verbatim as ITS forbidden-example ("No «DIRECTIVE ACTIVATED», no mode-detection
// narration...") — that is the axiom banning the announcement, not an instruction to make one. Any
// occurrence of the marker beyond that one exact, allow-listed citation still fails.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SKILLS_ROOT = resolve(ROOT, 'ai/skills');
const SDD_V2_DIRECTIVES_ROOT = resolve(ROOT, 'ai/directives/sdd-v2');

function walkFiles(dir: string, fileFilter: (name: string) => boolean): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && fileFilter(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1;
}

// AX_NO_PROCESS_NARRATION's own rendered citation of the banned phrase — the axiom's forbidden-
// example, not an instruction. Keyed by path relative to ROOT; value is the exact substring that is
// allowed to contain the marker. Any occurrence of the bare marker beyond however many times this
// exact substring itself appears is a real regression.
const ALLOWED_CITATIONS: ReadonlyMap<string, string> = new Map([
  ['ai/directives/sdd-v2/router.directive.xml', 'No «DIRECTIVE ACTIVATED»'],
]);

/**
 * @purpose Find every file under `files` whose marker occurrences exceed its allow-listed count
 *   (zero, for files with no entry in `allowed`).
 */
function findOffenders(files: readonly string[], allowed: ReadonlyMap<string, string>): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const relPath = file.replace(`${ROOT}/`, '');
    const content = readFileSync(file, 'utf8');
    const total = countOccurrences(content, 'DIRECTIVE ACTIVATED');
    const citation = allowed.get(relPath);
    const allowedCount = citation ? countOccurrences(content, citation) : 0;
    if (total > allowedCount) offenders.push(relPath);
  }
  return offenders;
}

describe('DIRECTIVE ACTIVATED announcement never returns to a skill or dispatch template (LOCK-3)', () => {
  it('keeps every ai/skills/**/SKILL.md free of the forbidden activation announcement', () => {
    const files = walkFiles(SKILLS_ROOT, (name) => name === 'SKILL.md');
    assert.deepEqual(findOffenders(files, new Map()), []);
  });

  it("keeps every rendered ai/directives/sdd-v2/** file free of it too, except the axiom's own citation", () => {
    const files = walkFiles(SDD_V2_DIRECTIVES_ROOT, () => true);
    assert.ok(files.length > 0, 'expected at least one file under ai/directives/sdd-v2/**');
    assert.deepEqual(findOffenders(files, ALLOWED_CITATIONS), []);
  });
});
