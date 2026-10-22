// @file: T-B6-07 contract test — retired v1 skill names live only as triggers in an existing v2
//   skill's `description`, never as a new skill, wrapper, or alias command.
// @spec: AI-SKILLS-DIRECTIVE-ASSEMBLY
// @consumers: release regression suite

// T-B6-07 (ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1, 40-TRACK-DIRECTIVES-SKILLS.md,
// D-27 variant (a)): v1 had `/sdd-setup`, `/sdd-discover`, `/sdd-continue`, `/sdd-infra`,
// `/sdd-module-decomposition` (all folded into the stateless `sdd` router), `/sdd-fix` (folded into
// `sdd-reconcile`), and `/sdd-execute-batch` (folded into `sdd-execute`). D-27 rejected building
// wrapper skills or alias commands for any of them (variant (c), doc40 Q5(c)) — the only allowed move
// is naming the retired command in the description of the v2 skill that now owns the intent, so the
// router's own classifier still recognizes operators who type the old name. This is the regression
// lock: every one of these seven names must appear as a trigger in EXACTLY one skill's description,
// and the SDD skill namespace must not grow through wrappers/aliases. Independent non-SDD skills
// can be added, but their descriptions remain subject to the same retired-trigger ownership checks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SKILLS_DIR = resolve(ROOT, 'ai/skills');

const SDD_SKILL_NAMES = ['sdd', 'sdd-audit', 'sdd-check', 'sdd-code-review', 'sdd-critic', 'sdd-execute', 'sdd-reconcile', 'sdd-scaffold'];

function sddNamespace(dirs: readonly string[]): string[] {
  return dirs.filter((dir) => dir === 'sdd' || dir.startsWith('sdd-')).sort();
}

function triggerOwners(skills: readonly { dir: string; description: string }[], trigger: string): string[] {
  return skills.filter((skill) => skill.description.includes(trigger)).map((skill) => skill.dir);
}

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
  const skills = skillDirs.map((dir) => ({ dir, description: descriptionOf(dir) }));

  it('keeps the SDD namespace closed to wrapper/alias skills without limiting independent non-SDD tools', () => {
    assert.deepEqual(sddNamespace(skillDirs), [...SDD_SKILL_NAMES].sort());
    assert.deepEqual(sddNamespace([...skillDirs, 'independent-session-tool']), [...SDD_SKILL_NAMES].sort());
    for (const name of RETIRED_V1_NAMES)
      assert.notDeepEqual(sddNamespace([...skillDirs, name.slice(1)]), [...SDD_SKILL_NAMES].sort(), name);
  });

  it('still rejects a retired trigger claimed by a wrapper outside the SDD directory namespace', () => {
    const independent = { dir: 'independent-session-tool', description: 'Locate and audit a session' };
    for (const name of RETIRED_V1_NAMES) {
      const owners = triggerOwners(skills, name);
      assert.deepEqual(triggerOwners([...skills, independent], name), owners);
      assert.notDeepEqual(triggerOwners([...skills, { ...independent, description: `Alias for ${name}` }], name), owners);
    }
  });

  for (const name of RETIRED_V1_NAMES) {
    it(`"${name}" is a trigger in exactly one skill description`, () => {
      const owners = triggerOwners(skills, name);
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
