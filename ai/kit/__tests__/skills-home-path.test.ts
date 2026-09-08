// @file: LOCK-2 contract test — the developer home path to skills never returns in ai/**.
// @consumers: release regression suite
// @tasks: N/A

// LOCK-2 (20-ISSUES-VERDICTS.md #11, ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1):
// v1 called `~/.claude/skills/sdd-execute/scripts/sdd` (the *user's home* directory) from eight
// directive/skill sites, while `sync-skills` installs skills into the *project's* `.claude/skills/`
// — a collision the moment a project didn't happen to be the author's own machine. v1 fixed most
// call sites in 90b123e9 (#14) by passing an explicit `<sdd-path>`, but never added a normalization
// rule (`SYNC_PATH_RULES` has no `RULE_SKILLS_TILDE`, unlike `SYNC_SKILLS_PATH_RULES`) and left two
// tails (`module-decomposition.directive.xml:661`, `discovery.directive.xml:614`).
// v2 has no home-relative skills path anywhere: every tool call is `npx gennady sdd-*`, and the
// literal skills-in-home-directory phrase does not exist in source. This is the regression lock:
// any future directive/skill text that reintroduces `~/.claude/...` or hardcodes the (v1-specific)
// `.claude/skills/sdd-execute/scripts` invocation path fails here.

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

describe('skills home-directory path never returns (LOCK-2)', () => {
  it('keeps ai/directives/** and ai/skills/** free of ~/.claude/ and the v1 hardcoded skills-scripts path', () => {
    const roots = ['ai/directives', 'ai/skills'];
    const homeTilde = /~\/\.claude\//;
    const v1SkillsScriptsPath = /\.claude\/skills\/sdd-execute\/scripts/;
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkFiles(resolve(ROOT, root))) {
        const content = readFileSync(file, 'utf8');
        if (homeTilde.test(content) || v1SkillsScriptsPath.test(content)) {
          offenders.push(file.replace(`${ROOT}/`, ''));
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
