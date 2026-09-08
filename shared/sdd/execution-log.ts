// @file: Single-source canonical Execution Log token vocabulary — the one home for TOKEN_VOCABULARY.
// @consumers: templates.ts (scaffolded specs/3-tasks.md); future execution-log parser (B2-01/B2-04)
// @tasks: N/A

/** @purpose One legal first-word token of an Execution Log event line, plus its exact grammar. */
export type TokenVocabularyEntry = {
  /** @purpose The literal first word (case-sensitive) that opens a conforming event line. */
  token: string;
  /** @purpose The full line grammar, shown verbatim in scaffolded docs and diagnostics. */
  grammar: string;
};

// Single home for what used to be seven independently drifting copies of this list (issue #23):
// `ver`/`yagni`/`env-fix` are real tokens two audit documents required but the old collected
// table (`templates.ts:1581`) had dropped, and `correction` — the only legal way to fix a mistake
// already written to an append-only log — had no home at all. `ver` is decision L-1
// (`02-LEAD-DECISIONS.md`): a human-written note, but only a CLI-owned `SDD_PHASE_RECEIPT` —
// never a hand-written `ver` line alone — may close a phase. `fix` is a live corpus token (34
// event lines across 6 tickets, e.g. `agent-inbox.task-161.md`, `directive-assembly.task.DA-lazy-
// asm.md`) named on the task board alongside `ver`/`yagni`/`env-fix` — without it those 34
// pre-existing lines would read as `EXECUTION_LOG_INCOMPLETE` under the closed-vocabulary rule.
/** @purpose The complete, closed set of tokens an Execution Log event line may open with. */
export const TOKEN_VOCABULARY: readonly TokenVocabularyEntry[] = [
  { token: 'intro', grammar: 'intro <Entity> ← <reason>' },
  { token: 'decision', grammar: 'decision <key>=<value> ← <reason>' },
  { token: 'tried', grammar: 'tried <approach> → <result>' },
  { token: 'discovery', grammar: 'discovery <fact>' },
  { token: 'insight', grammar: 'insight <observation> → <spec-section>' },
  { token: 'verified', grammar: 'verified <tool>@<version> <summary>' },
  { token: 'SDD_PHASE_RECEIPT', grammar: 'CLI-owned SDD_PHASE_RECEIPT:<PhaseID>' },
  { token: 'BLOCKED', grammar: 'BLOCKED <cause>' },
  { token: 'DONE', grammar: 'DONE' },
  {
    token: 'ver',
    grammar: 'ver <cmd> → <result> — human note only, never closes a phase alone (L-1)',
  },
  { token: 'yagni', grammar: 'yagni <name> ← <reason>' },
  { token: 'fix', grammar: 'fix <target> ← <reason>' },
  {
    token: 'env-fix',
    grammar: 'env-fix <file> ← <operator decision ref> (AX_ENV_FIX_CHANNEL)',
  },
  {
    token: 'correction',
    grammar: 'correction[:] <round>/<phase> <field>: <old> → <new> ← <reason>',
  },
];

/** @purpose Literal token strings only, in declaration order — for membership checks. */
export const TOKEN_VOCABULARY_TOKENS: readonly string[] = TOKEN_VOCABULARY.map((e) => e.token);

/**
 * @purpose True when `word` opens a conforming Execution Log event line. `correction` alone is
 *   matched with or without its trailing colon (the live corpus writes `correction:`, per issue
 *   #23) — every other token matches exactly, case-sensitively.
 * @param word The first whitespace-delimited word of an event line's content (after the `- [x]
 *   \`<ts>\`` prefix has already been stripped by the caller).
 * @returns True when `word` is a known token (or the special-cased `correction:`).
 */
export function isVocabularyToken(word: string): boolean {
  if (word === 'correction:') return true;
  return TOKEN_VOCABULARY_TOKENS.includes(word);
}

/**
 * @purpose Render the vocabulary as the single middle-dot-joined markdown line used by every
 *   scaffolded doc and axiom that used to hand-author its own copy.
 * @returns Each entry's grammar, individually backtick-wrapped, joined by ` · `.
 */
export function formatTokenVocabulary(): string {
  return TOKEN_VOCABULARY.map((e) => `\`${e.grammar}\``).join(' · ');
}
