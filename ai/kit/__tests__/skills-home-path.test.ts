// @file: LOCK-2 contract test — the developer home path to skills never returns in ai/**.
// @spec: AI-SKILLS-DIRECTIVE-ASSEMBLY
// @consumers: release regression suite

// LOCK-2 (20-ISSUES-VERDICTS.md #11, ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1):
// v1 called `~/.claude/skills/sdd-execute/scripts/sdd` (the *user's home* directory) from eight
// directive/skill sites, while `sync-skills` installs skills into the *project's* `.claude/skills/`
// — a collision the moment a project didn't happen to be the author's own machine. v1 fixed most
// call sites in 90b123e9 (#14) by passing an explicit `<sdd-path>`, but never added a normalization
// rule (`SYNC_PATH_RULES` has no `RULE_SKILLS_TILDE`, unlike `SYNC_SKILLS_PATH_RULES`) and left two
// tails (`module-decomposition.directive.xml:661`, `discovery.directive.xml:614`).
// Every active SDD tool call remains project-owned `npx gennady sdd-*`. A provider reference can
// describe Claude's read-only JSONL transcript location; this is data storage, not an installed
// skill entry point. Only that exact labelled location is recognized below, never a file exemption.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function hasForbiddenSkillPath(content: string): boolean {
  const active = content.replace(
    /^Claude Code read-only transcript storage is `~\/\.claude\/projects\/<encoded-workspace>\/<session-id>\.jsonl`\./gm,
    'Claude Code read-only transcript storage is <provider-session-log>.'
  );
  return /~\/\.claude\//.test(active) || /\.claude\/skills\/sdd-execute\/scripts/.test(active);
}

describe('skills home-directory path never returns (LOCK-2)', () => {
  it('keeps active instructions free of home-hardcoded skill paths while recognizing labelled provider transcript storage', () => {
    const roots = ['ai/directives', 'ai/skills'];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkFiles(resolve(ROOT, root))) {
        const content = readFileSync(file, 'utf8');
        if (hasForbiddenSkillPath(content)) {
          offenders.push(file.replace(`${ROOT}/`, ''));
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('does not exempt active invocations in a provider document or unrelated home paths', () => {
    const storage = 'Claude Code read-only transcript storage is `~/.claude/projects/<encoded-workspace>/<session-id>.jsonl`.';
    assert.equal(hasForbiddenSkillPath(storage), false);
    for (const instruction of [
      'Run `~/.claude/skills/sdd-execute/scripts/sdd`.',
      'Run `.claude/skills/sdd-execute/scripts/sdd`.',
      'Read `~/.claude/projects/other/session.jsonl`.',
      'Run `~/.claude/commands/old-sdd`.',
    ]) assert.equal(hasForbiddenSkillPath(`${storage}\n${instruction}`), true, instruction);
    assert.equal(hasForbiddenSkillPath(storage.replace('/projects/', '/skills/')), true);
  });
});
