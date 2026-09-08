// @file: LOCK-3 contract test — SKILL.md never asks the agent to announce DIRECTIVE ACTIVATED.
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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SKILLS_ROOT = resolve(ROOT, 'ai/skills');

function walkSkillMdFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'SKILL.md')
    .map((entry) => resolve(entry.parentPath, entry.name));
}

describe('DIRECTIVE ACTIVATED announcement never returns to a skill (LOCK-3)', () => {
  it('keeps every ai/skills/**/SKILL.md free of the forbidden activation announcement', () => {
    const marker = /DIRECTIVE ACTIVATED/;
    const offenders: string[] = [];
    for (const file of walkSkillMdFiles(SKILLS_ROOT)) {
      const content = readFileSync(file, 'utf8');
      if (marker.test(content)) offenders.push(file.replace(`${ROOT}/`, ''));
    }
    assert.deepEqual(offenders, []);
  });
});
