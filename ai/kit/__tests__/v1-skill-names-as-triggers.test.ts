// @file: T-B6-07 contract test — retired v1 skill names live only as triggers in an existing v2
// skill's `description`, never as a new skill, wrapper, or alias command.
// @consumers: release regression suite
// @tasks: N/A

// T-B6-07 (ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1, 40-TRACK-DIRECTIVES-SKILLS.md,
// D-27 variant (a)): v1 had `/sdd-setup`, `/sdd-discover`, `/sdd-continue`, `/sdd-infra`,
// `/sdd-module-decomposition` (all folded into the stateless `sdd` router), `/sdd-fix` (folded into
// `sdd-reconcile`), and `/sdd-execute-batch` (folded into `sdd-execute`). D-27 rejected building
// wrapper skills or alias commands for any of them (variant (c), doc40 Q5(c)) — the only allowed move
// is naming the retired command in the description of the v2 skill that now owns the intent, so the
// router's own classifier still recognizes operators who type the old name. This is the regression
// lock: every one of these seven names must appear as a trigger in EXACTLY one skill's description,
// and the total skill count must not grow past today's baseline (no new skill was created to host
// them).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SKILLS_DIR = resolve(ROOT, 'ai/skills');

// Baseline skill count at the time this lock was written (T-B6-07, batch 21). v1 names are retired
// as triggers, never as new skills — this number must not grow because of that retirement.
const BASELINE_SKILL_COUNT = 12;

// The seven retired v1 skill/command names and the description text expected to carry each trigger.
const RETIRED_V1_NAMES = [
  '/sdd-setup',
  '/sdd-discover',
  '/sdd-continue',
  '/sdd-infra',
  '/sdd-module-decomposition',
  '/sdd-fix',
  '/sdd-execute-batch',
] as const;

function listSkillDirs(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function descriptionOf(skillDir: string): string {
  const content = readFileSync(resolve(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf8');
  const match = content.match(/^description:\s*(.*)$/m);
  assert.ok(match, `${skillDir}/SKILL.md has no \`description:\` frontmatter field`);
  return match![1] ?? '';
}

describe('retired v1 skill names live only as triggers (T-B6-07)', () => {
  const skillDirs = listSkillDirs();

  it('does not exceed the pre-retirement skill count — no wrapper/alias skill was created', () => {
    assert.ok(
      skillDirs.length <= BASELINE_SKILL_COUNT,
      `expected at most ${BASELINE_SKILL_COUNT} skills, found ${skillDirs.length}: ${skillDirs.join(', ')}`
    );
  });

  for (const name of RETIRED_V1_NAMES) {
    it(`"${name}" is a trigger in exactly one skill description`, () => {
      const owners = skillDirs.filter((dir) => descriptionOf(dir).includes(name));
      assert.equal(owners.length, 1, `expected exactly one owner for ${name}, found: ${owners.join(', ') || '(none)'}`);
    });
  }

  it('routes every retired v1 name to its documented v2 owner', () => {
    const expectedOwner: Record<(typeof RETIRED_V1_NAMES)[number], string> = {
      '/sdd-setup': 'sdd',
      '/sdd-discover': 'sdd',
      '/sdd-continue': 'sdd',
      '/sdd-infra': 'sdd',
      '/sdd-module-decomposition': 'sdd',
      '/sdd-fix': 'sdd-reconcile',
      '/sdd-execute-batch': 'sdd-execute',
    };
    for (const [name, owner] of Object.entries(expectedOwner)) {
      assert.match(descriptionOf(owner), new RegExp(escapeRegExp(name)));
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
