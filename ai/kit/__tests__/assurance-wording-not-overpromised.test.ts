// @file: T-B6-29 contract test — assurance wording never overpromises what the mechanism checks.
// @consumers: release regression suite
// @tasks: N/A

// T-B6-29 (ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1, 40-TRACK-DIRECTIVES-SKILLS.md,
// AUTHORING.md §13): `proof`/`proves`/`verified`/`100%` are reserved for a mechanism that actually
// checks what the word claims; where the mechanism only checks presence/shape/linkage (a section
// exists, an ID resolves, a command ran) or where a human/agent judgment produced the claim, the text
// must say so in the AUTHORING.md §13 vocabulary (`mechanically checked` / `agent-reviewed` /
// `test-observed` / `unknown`) instead of borrowing the stronger word. This is a regression lock for
// four specific over-promising phrases found and fixed in this batch — not a blanket ban on the words
// `proof`/`verified` (those remain legitimate in many contexts: the Execution-Log `verified
// <tool>@<version>` token, "future-proof", negations like "cannot prove", the `AX_*` canon id
// `AX_E2E_PROOF_SCREENSHOT_ALWAYS`), so this test enumerates exact promising-context phrases rather
// than the bare words.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

// Exact lowercase phrases that claimed more than the mechanism behind them delivers. Matching is
// case-insensitive on the phrase itself; none of them collide with the legitimate uses listed above
// (the `AX_E2E_PROOF_SCREENSHOT_ALWAYS` id uses an underscore, not a space, so "proof screenshot"
// cannot match it).
const BANNED_PHRASES = [
  'structural proof', // was: an AUTHORING_SCOPE fact is "a target-specific structural proof" —
  // it is a mechanically checked structural fact, not a proof of anything semantic.
  'one observable proof', // was: Requirements' Verification field asked authors for "one observable
  // proof" — a check can be observed; whether it holds is not thereby proven.
  'proves its requirement', // was: "whether each real Verification command proves its requirement" —
  // an independent agent review judges this; it is agent-reviewed, not mechanically proven.
  'proof screenshot', // was: e2e axioms called the render capture a "proof screenshot" — it is
  // evidence the flow rendered, not proof of pixel/behavioural correctness.
] as const;

function findOffenses(content: string): string[] {
  const lower = content.toLowerCase();
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase));
}

describe('assurance wording never overpromises (T-B6-29)', () => {
  it('keeps ai/kit/axiom/**, ai/kit/contract/**, and ai/directives/sdd-v2/** free of the fixed over-promising phrases', () => {
    const roots = ['ai/kit/axiom', 'ai/kit/contract', 'ai/directives/sdd-v2'];
    const offenders: Array<{ file: string; phrases: string[] }> = [];
    for (const root of roots) {
      const abs = resolve(ROOT, root);
      if (!statSync(abs, { throwIfNoEntry: false })) continue;
      for (const file of walkFiles(abs)) {
        const content = readFileSync(file, 'utf8');
        const offenses = findOffenses(content);
        if (offenses.length > 0) {
          offenders.push({ file: file.replace(`${ROOT}/`, ''), phrases: offenses });
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('keeps the AUTHORING.md §13 assurance vocabulary section in place', () => {
    const content = readFileSync(resolve(ROOT, 'ai/kit/AUTHORING.md'), 'utf8');
    assert.match(content, /mechanically checked/);
    assert.match(content, /agent-reviewed/);
    assert.match(content, /test-observed/);
    assert.match(content, /[Gg]olden доказывает неизменность поведения,?\s+а не его\s+корректность/);
  });
});
