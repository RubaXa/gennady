// @file: T-B6-29 contract test — assurance wording never overpromises what the mechanism checks.
// @consumers: release regression suite
// @tasks: N/A

// T-B6-29 (ai/drafts/research/sdd-v1-to-v2-transfer/61-TASK-BOARD.md §1, 40-TRACK-DIRECTIVES-SKILLS.md,
// AUTHORING.md §13): `proof`/`proves`/`proven`/`verified`/`100%` (and the Russian `доказан*`/
// `доказывает`/`проверено`) are reserved for a mechanism that actually checks what the word claims;
// where the mechanism only checks presence/shape/linkage (a section exists, an ID resolves, a
// command ran) or where a human/agent judgment produced the claim, the text must say so in the
// AUTHORING.md §13 vocabulary (`mechanically checked` / `agent-reviewed` / `test-observed` /
// `unknown`) instead of borrowing the stronger word.
//
// V-BATCH-21 B2: the prior version of this lock enumerated exactly four fixed phrases — a
// "regression lock" that could not see a NEW over-promising sentence written in different words, nor
// three pre-existing offenders that happened to sit inside its own scan roots
// (`shared/sdd/templates.ts` → `scaffold.directive.xml` / `formats/task-ticket-structure.xml` /
// `formats/infrastructure-spec-structure.xml`, `reconcile.directive.hbs`). This version scans the
// WORDS themselves — a true dictionary lock — across every root AUTHORING.md §13 governs, with an
// explicit allow-list of legitimate uses (canon-ID/kebab-tag prose, `future-proof`, the
// `verified <tool>@<version>` / `@<verified-stable-version>` mechanism tokens, negations, and a
// closed set of pre-existing idioms verified — by reading each one — to name a real mechanism or
// state an epistemic negation rather than an unearned claim). Each allow entry is an exact
// string/regex with its own "why legitimate" comment; there is no blanket per-file exemption.
//
// Mutation-proof: inserting "…proves the requirement is verified and gives 100% confidence; this is
// proof the spec holds." into any axiom, or "…доказывает требование на 100%: проверено." into any
// contract, fails this lock via the bare `proves`/`доказывает` scan — no phrase-list update needed.

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

// The word list AUTHORING.md §13 names. Latin words are bare (`\b`-bounded, so a canon ID or
// kebab-tag that glues the word to neighbours with `_`/no-delimiter — `AX_E2E_PROOF_SCREENSHOT_ALWAYS`,
// `PROOF_SCREENSHOT` — never matches: `\b` needs a word/non-word transition, and `_` is a word
// character). Cyrillic forms are plain substrings (JS `\b` does not reliably bound Cyrillic).
const BANNED_WORDS: RegExp[] = [
  /\b(?:proof|proofs|proves|proven)\b/gi,
  /\bverified\b/gi,
  /100%/g,
  /доказан|доказывает|проверено/gi,
];

// Exact strings/regexes covering a legitimate use already present in the corpus, each with the
// mechanism/reasoning that makes the word earned rather than borrowed. A banned-word match is
// dropped only when it falls fully inside one of these spans — this is not a per-file exemption.
const ALLOWED: Array<{ re: RegExp; why: string }> = [
  // --- Latin: proof / proves / proven ---
  { re: /future-proof(?:ing)?/gi, why: 'idiom ("future-proofing code"), not an assurance claim' },
  {
    re: /proven in the Button PoC/g,
    why: 'ax-data-attrs-not-host.xml: cites a completed prior investigation (the PoC), not a tool claim',
  },
  {
    re: /the proven alternative/g,
    why: 'uikit-component-svelte.xml: same PoC-grounded claim as above, restated in the anti-pattern Why',
  },
  {
    re: /states proven impossible by types/g,
    why: 'ax-minimal-error-surface.xml / typescript-rules.xml: the TS compiler mechanically proves this — a genuine mechanism match',
  },
  {
    re: /alone NEVER proves/gi,
    why: 'ax-confusion-bug.xml and its generated copies: negation — says the signal does NOT establish the claim, the opposite of over-promising',
  },
  {
    re: /\buntil (?:dis)?proven\b/gi,
    why: '"unjustified until proven/disproven": adversarial-default burden-of-proof idiom (innocent-until-proven-guilty), not a mechanism self-claim',
  },
  {
    re: /existence(?: is)? proven\b|Proven, not speculative/gi,
    why: 'track-review/arch-interrogation adversarial-review vocabulary: a verdict category name, not a tool claim',
  },
  {
    re: /the atomic proven-file primitive/g,
    why: 'ax-group-audit-leaves-a-receipt.xml: names a real code mechanism (cli/cmd/sdd-log/sdd-log.types.ts), verified by reading it',
  },
  {
    re: /proven spec-goal conflict/g,
    why: 'return-summary-format.xml: descriptive escalation-eligibility gate, not a tool self-claim',
  },
  {
    re: /proven editorial/g,
    why: 'direct-verification-receipt.xml: classification label for the bounded-direct target-set, gated by its own DIRECT_VERIFICATION_RECEIPT check',
  },
  {
    re: /the probe proves a/g,
    why: 'reconcile.directive.hbs Mission: "presumed right until the probe proves a spec defect" — burden-of-proof idiom for AX_PROBLEM_PROBES_SPEC\'s default stance',
  },
  {
    re: /missing proof is `H_SPEC_REVIEW_NOT_APPROVED`|that proof may implementation move/g,
    why: 'reconcile.directive.hbs STEP_5: "proof" names a concrete checkable evidence artifact (review verdict + approval marker), not a semantic-correctness claim',
  },
  // --- Latin: verified ---
  {
    re: /verified <tool>@<version>|`verified`/g,
    why: 'Execution-Log event-token vocabulary (AX_EXECUTION_LOG_VERIFICATION and its consumers): a defined token name, not a promise',
  },
  {
    re: /@<verified-stable-version>|verified version\b/gi,
    why: 'ax-dependency-addition-checklist.xml / ax-permitted-bash-commands.xml: npm pinning placeholder — the resolved version is mechanically checkable',
  },
  {
    re: /not-verified/g,
    why: 'ax-third-party-tool-current-api.xml: `stale-tool-api-not-verified` is a kebab RULES_COMPLIANCE_VIOLATION tag, not prose',
  },
  {
    re: /the verified installed tool/g,
    why: 'ax-third-party-tool-current-api.xml: ordinary adjective for an already-checked tool, immediately followed by the actual check',
  },
  {
    re: /contract method being verified/g,
    why: 'ax-no-falsification-via-mocks.xml / common.xml: "verified" as "under test", standard test-writing vocabulary',
  },
  { re: /scenario verified/g, why: 'ax-live-log.xml: naming an Execution-Log event-token example, not a claim' },
  {
    re: /Facts already verified collapse to one line/g,
    why: 'ax-progressive-disclosure.xml boilerplate reused by every directive: presents facts confirmed via a separate, already-logged mechanism',
  },
  {
    re: /written and verified/g,
    why: '"Render after the current artifact is written and verified": the write + verify step precedes this line, already logged',
  },
  {
    re: /cannot be verified/gi,
    why: 'H_NO_REPO_ACCESS row: negation — says verification is NOT possible, the opposite of over-promising',
  },
  {
    re: /verified\s+mechanically\s+\(`plan --verify`\)/g,
    why: 'migration-v1-v2: names the exact mechanism (`plan --verify`) — textbook AUTHORING §13 "mechanically checked" usage',
  },
  {
    re: /the verified layer/g,
    why: 'migration-v1-v2 STEP_4_ACK: names a specific artifact layer (measured facts vs. proposals, AX_EVIDENCE_HYGIENE), not a claim',
  },
  {
    re: /against a verified\s+plan/g,
    why: 'migration-v1-v2: refers back to the plan already confirmed via `plan --verify` above',
  },
  {
    re: /compatibility verified/g,
    why: 'nodejs-npm-setup.xml checklist: a real manual/mechanical check the operator performs before adding a package',
  },
  {
    re: /present and verified/g,
    why: 'storybook-setup.xml: describes the accepted completion state of a checklist, not a tool self-claim',
  },
  {
    re: /verified end-to-end/gi,
    why: 'ax-sb-verify-before-handoff.xml / storybook-setup.xml: names the actual e2e verification step performed',
  },
  {
    re: /committed and verified/g,
    why: 'git-setup.xml: `.gitignore` state that is actually inspected before the next instruction',
  },
  // --- 100% ---
  { re: /100% coverage/g, why: 'eslint-setup.xml: coverage percentage is mechanically measured by the coverage tool' },
  { re: /100%-логика/g, why: 'AUTHORING.md §12: describes a step as unconditional/deterministic — a different sense than an assurance claim' },
  { re: /100% массива/g, why: 'ax-early-exit.xml: "100% of the array" — an ordinary quantifier (the whole array), not an assurance claim' },
  // --- AUTHORING.md §13's own defining prose, which necessarily quotes the banned words ---
  { re: /`proof`\/`proves`\/`verified`\/`100%`/g, why: 'AUTHORING.md §13: the rule naming its own reserved words' },
  { re: /«доказано»\/«проверено»\/«100%»/g, why: 'AUTHORING.md §13: Russian equivalents of the same self-reference' },
  { re: /«доказано» у смежного/g, why: 'AUTHORING.md §13: same self-reference, second mention' },
  { re: /Golden доказывает неизменность поведения/g, why: 'AUTHORING.md §13: the test-observed example sentence, required verbatim by the second `it()` below' },
  { re: /случайного «проверено»/g, why: 'AUTHORING.md §13: the `unknown`-level example, warning against exactly this kind of accidental claim' },
];

function allowedSpans(content: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const { re } of ALLOWED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return spans;
}

function isAllowed(start: number, end: number, spans: Array<[number, number]>): boolean {
  return spans.some(([s, e]) => start >= s && end <= e);
}

function findOffenses(content: string): string[] {
  const spans = allowedSpans(content);
  const offenses: string[] = [];
  for (const wordRe of BANNED_WORDS) {
    wordRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(content)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!isAllowed(start, end, spans)) {
        offenses.push(m[0]);
      }
      if (m[0].length === 0) wordRe.lastIndex++;
    }
  }
  return offenses;
}

describe('assurance wording never overpromises (T-B6-29)', () => {
  it('keeps ai/kit/{axiom,contract,templates,AUTHORING.md}, ai/directives/**, ai/skills/**, and shared/sdd/templates.ts free of unearned assurance words', () => {
    const roots = [
      'ai/kit/axiom',
      'ai/kit/contract',
      'ai/kit/templates',
      'ai/kit/AUTHORING.md',
      'ai/directives',
      'ai/skills',
      'shared/sdd/templates.ts',
    ];
    const offenders: Array<{ file: string; words: string[] }> = [];
    for (const root of roots) {
      const abs = resolve(ROOT, root);
      const st = statSync(abs, { throwIfNoEntry: false });
      if (!st) continue;
      const files = st.isDirectory() ? walkFiles(abs) : [abs];
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        const offenses = findOffenses(content);
        if (offenses.length > 0) {
          offenders.push({ file: file.replace(`${ROOT}/`, ''), words: offenses });
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
