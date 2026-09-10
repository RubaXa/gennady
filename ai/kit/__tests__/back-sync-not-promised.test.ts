// @file: T-B6-28 contract test — `back-sync` never returns as a promised reconcile mechanism.
// @consumers: release regression suite
// @tasks: N/A

// T-B6-28 (ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1, 40-TRACK-DIRECTIVES-SKILLS.md):
// `sdd-sync` is mechanically tracker-status/rollup only — it never rewrites code from the spec. v1's
// `reconcile.directive.hbs` keywords (`sync-from-code`, `back-sync`) and `AUTHORING.md`'s jargon-keep
// list promised a "back-sync" mechanism that reconcile does not implement: the real mode is named
// `from-code` in the directive body, and remediation always goes through ordinary authoring/execute,
// never an automatic code→spec sync. This is the regression lock: `back-sync` may only appear as an
// explicit negation ("нет обратной синхронизации"), never as a bare keyword/promise.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const NEGATION = 'нет обратной синхронизации';
const WINDOW = 200;

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function findUnguardedOccurrences(content: string): number[] {
  const hits: number[] = [];
  const re = /back-sync/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const start = Math.max(0, match.index - WINDOW);
    const end = Math.min(content.length, match.index + WINDOW);
    const nearby = content.slice(start, end);
    if (!nearby.includes(NEGATION)) {
      hits.push(match.index);
    }
  }
  return hits;
}

describe('back-sync is never a promised mechanism (T-B6-28)', () => {
  it('keeps ai/kit/** and ai/directives/sdd-v2/** free of unguarded `back-sync` promises', () => {
    const roots = ['ai/kit', 'ai/directives/sdd-v2', 'ai/skills'];
    const offenders: string[] = [];
    for (const root of roots) {
      const abs = resolve(ROOT, root);
      if (!statSync(abs, { throwIfNoEntry: false })) continue;
      for (const file of walkFiles(abs)) {
        if (file.includes(`${resolve(ROOT)}/ai/kit/__tests__/`)) continue;
        const content = readFileSync(file, 'utf8');
        if (findUnguardedOccurrences(content).length > 0) {
          offenders.push(file.replace(`${ROOT}/`, ''));
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('AUTHORING.md keeps the one allowed mention as an explicit negation', () => {
    const content = readFileSync(resolve(ROOT, 'ai/kit/AUTHORING.md'), 'utf8');
    const occurrences = (content.match(/back-sync/gi) ?? []).length;
    assert.equal(occurrences, 1, 'exactly one guarded mention of `back-sync` is expected');
    assert.equal(findUnguardedOccurrences(content).length, 0);
  });
});
