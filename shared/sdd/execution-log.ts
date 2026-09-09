// @file: Single home for Execution Log parsing — the token vocabulary (B2-03), the phase-block /
//   blocker-trail / handoff / post-close-integrity readers (B2-01, consolidating what used to be
//   duplicated across check.ts and sdd-log.types.ts), and the structural parseExecutionLog (B2-01).
// @consumers: check.ts (re-exports for its existing callers), sdd-log.cmd/types, sdd-task.cmd,
//   audit-group.ts, group-receipt.ts, templates.ts (scaffolded specs/3-tasks.md)
// @tasks: N/A

import { collectHeadings, extractHeadingSection, extractSection } from './section.ts';

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

/**
 * @purpose A phase-heading line (`#### P<N>`, optional `— re-run:` suffix); group 1 is the bare id.
 */
export const PHASE_HEADING_RE = /^#{2,6}\s+(P[0-9]+)\b/;

/** @purpose Existing schema marker that distinguishes current receipt-aware tickets from grandfathered V2 tickets. */
export const PHASE_RECEIPTS_SCHEMA_MARKER = '<!--PHASE_RECEIPTS:v1-->';

/**
 * @purpose Wrap a bare EXECUTION_LOG section body back into its own markers, so a caller holding
 *   only the extracted body can still feed `parseExecutionLog` (which extracts the section itself).
 * @param logBody Extracted EXECUTION_LOG section body.
 * @returns Minimal document content `parseExecutionLog` can read.
 */
function wrapAsExecutionLogDocument(logBody: string): string {
  return `<!--SECTION:EXECUTION_LOG-->\n${logBody}\n<!--/SECTION:EXECUTION_LOG-->`;
}

/**
 * @purpose Count exact phase blocks opened in the FIRST (earliest) Execution Log Round, strictly
 *   before that Round's own `#### Round close` heading (B2-16, finding C; B2-01: derived from
 *   `parseExecutionLog` — one traversal, not a second copy of the Round/phase-block boundary logic).
 * @invariant Only level-4 `P<N>` headings inside the FIRST level-3 `### Round <n>` heading count —
 *   whichever occurs first, regardless of its literal number; later rounds, anything at/after
 *   `#### Round close`, and fenced-code headings are excluded.
 * @param logBody Extracted EXECUTION_LOG section body.
 * @returns Phase id → block count, or null when no `### Round <n>` heading exists at all.
 */
export function firstRoundPhaseBlockCounts(logBody: string): Map<string, number> | null {
  const parsed = parseExecutionLog(wrapAsExecutionLogDocument(logBody));
  const round = parsed?.rounds[0];
  if (!round) return null;
  const counts = new Map<string, number>();
  for (const phase of round.phases) {
    counts.set(phase.id, (counts.get(phase.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * @purpose Every checked event line whose first-word token is outside the closed vocabulary
 *   (issue #23) — phase blocks, Round close, and trailing content all count; a marker line never does.
 * @param logBody Extracted EXECUTION_LOG section body.
 * @returns Each offending line's raw text, in document order across every Round.
 */
export function unknownTokenLines(logBody: string): string[] {
  const parsed = parseExecutionLog(wrapAsExecutionLogDocument(logBody));
  if (!parsed) return [];
  // A checked marker line (`- [x] \`ts\` ✅ RESOLVED: …`, the pre-B2-19 inline shape) parses its
  // own marker emoji as `token` — real vocabulary violations never carry a marker, so excluding
  // marker !== null here is what keeps legacy 🛑/✅ lines from misreading as unknown tokens.
  const bad = (e: LogEvent): boolean => e.token !== null && !e.known && e.marker === null;
  const out: string[] = [];
  for (const round of parsed.rounds) {
    for (const phase of round.phases) {
      for (const e of phase.events) if (bad(e)) out.push(e.raw);
    }
    for (const e of round.close?.extra ?? []) if (bad(e)) out.push(e.raw);
    if (round.close?.done && bad(round.close.done)) out.push(round.close.done.raw);
    for (const e of round.trailing) if (bad(e)) out.push(e.raw);
  }
  return out;
}

/** @purpose Pull the `P<N>` phase id out of a Blocker Trail `✅ RESOLVED (Round <N> / P<M>): …` back-reference line. */
const TRAIL_PHASE_RE = /\(Round\s+\d+\s*\/\s*(P[0-9]+)\)/;

/**
 * @purpose Scan an Execution Log for 🛑 BLOCKED / ✅ RESOLVED pairs, paired per phase — shared by
 *   checkTicket and sdd-task's [BLOCKERS].
 * @invariant FIFO within one phase's own pool — a `— re-run:` block shares it; only 🛑/✅ counts,
 *   not the bare word. A `## Blocker Trail` `RESOLVED (Round <N> / P<M>)` line (D-20, B2-19) shifts
 *   that same pool like an inline ✅ would.
 * @param logBody The EXECUTION_LOG section body.
 * @param [blockerTrailBody] The `## Blocker Trail` heading body, when the ticket has one.
 * @returns Unresolved 🛑 BLOCKED lines, oldest first across every phase's pool; empty when each has
 *   a later ✅ RESOLVED (inline or in Blocker Trail) in its own pool.
 */
export function scanBlockerTrail(logBody: string, blockerTrailBody?: string): string[] {
  // One pool per phase id, keyed by PHASE_HEADING_RE's capture — a `— re-run:` heading shares the
  // SAME key as the phase's earlier block, so a resolution logged there still closes an earlier
  // blocker. Pools never mix: a resolution can only shift its own phase's pool, never an older,
  // unrelated phase's — the fix for the old global-FIFO scan's cross-phase mispairing.
  const pools = new Map<string, { line: string; pos: number }[]>();
  let phase = '';
  const lines = logBody.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    const heading = PHASE_HEADING_RE.exec(line);
    if (heading) phase = heading[1] as string;
    if (line.includes('🛑')) {
      const pool = pools.get(phase) ?? [];
      pool.push({ line, pos: i });
      pools.set(phase, pool);
    } else if (line.includes('✅')) {
      pools.get(phase)?.shift();
    }
  }
  for (const rawLine of (blockerTrailBody ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line.includes('✅')) continue;
    const targetPhase = TRAIL_PHASE_RE.exec(line)?.[1];
    if (targetPhase) pools.get(targetPhase)?.shift();
  }
  return [...pools.values()]
    .flat()
    .sort((a, b) => a.pos - b.pos)
    .map((entry) => entry.line);
}

/**
 * @purpose Find the oldest Execution Round whose `phaseId` block still carries an unresolved 🛑
 *   BLOCKED — the round `sdd-log resolved` cites in its Blocker Trail back-reference (D-20, B2-19).
 * @invariant Round-aware FIFO, line-based like `scanBlockerTrail`; a Blocker Trail resolution
 *   already on file discounts one match too — a phase blocked more than once cites the right one.
 * @param content Full ticket markdown.
 * @param blockerTrailBody The `## Blocker Trail` heading body (empty string when absent).
 * @param phaseId Phase id (e.g. `P3`).
 * @returns The oldest unresolved occurrence's Round number, or null when `phaseId` has none.
 */
export function oldestActiveBlockerRound(
  content: string,
  blockerTrailBody: string,
  phaseId: string
): number | null {
  const logSection = extractSection(content, 'EXECUTION_LOG');
  if (logSection.status !== 'ok') return null;
  // Line-based, same style as scanBlockerTrail — deliberately NOT `parseExecutionLog`-based: a
  // phase block with no enclosing `### Round <n>` heading yet (a fresh ticket mid-scaffold, or a
  // minimal fixture) still has a real citable round number of 0, not "no blocker found at all".
  const queue: number[] = [];
  let phase = '';
  let round = 0;
  for (const rawLine of logSection.content.split('\n')) {
    const line = rawLine.trim();
    const roundHeading = /^#{1,6}\s+Round\s+(\d+)\b/i.exec(line);
    if (roundHeading?.[1]) round = Number(roundHeading[1]);
    const phaseHeading = PHASE_HEADING_RE.exec(line);
    if (phaseHeading) phase = phaseHeading[1] as string;
    if (phase !== phaseId) continue;
    if (line.includes('🛑')) queue.push(round);
    else if (line.includes('✅')) queue.shift();
  }
  const trailResolutionCount = blockerTrailBody
    .split('\n')
    .filter((l) => l.includes('✅') && TRAIL_PHASE_RE.exec(l)?.[1] === phaseId).length;
  for (let i = 0; i < trailResolutionCount; i++) queue.shift();
  return queue[0] ?? null;
}

/**
 * @purpose Detect whether the Execution Log ends in an unresolved BLOCKED state.
 * @param logBody The EXECUTION_LOG section body.
 * @param [blockerTrailBody] The `## Blocker Trail` heading body, when present (B2-19).
 * @returns True when a 🛑 BLOCKED entry has no later ✅ RESOLVED (inline or in Blocker Trail).
 */
export function hasActiveBlocker(logBody: string, blockerTrailBody?: string): boolean {
  return scanBlockerTrail(logBody, blockerTrailBody).length > 0;
}

/**
 * @purpose Matches the skeleton's unfilled Handoff line (`templates.ts`'s Round 1 block) — every
 *   field still holds the literal placeholder ellipsis, never real content.
 * @invariant A real Handoff line never contains a bracketed `...` — empty fields use `none`/`n/a`/
 *   `—` instead, so this can't misfire on genuine empty fields.
 */
const HANDOFF_PLACEHOLDER_RE = /\[\.\.\.\]/;

/**
 * @purpose Parse each phase's verbatim Handoff line from the Execution Log — the compact context
 * `sdd-task --phase` hands a worker.
 * @invariant One line per phase — the LAST non-placeholder Handoff, so a later Round overrides an
 *   earlier skeleton placeholder or a fix-repeat's earlier close.
 * @param logBody The EXECUTION_LOG section body.
 * @returns Phase id → its verbatim Handoff line (trimmed), for every phase with a real
 *   (non-placeholder) Handoff recorded; a never-closed phase carries no entry.
 */
export function parsePhaseHandoffs(logBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  for (const rawLine of logBody.split('\n')) {
    const line = rawLine.trim();
    const heading = PHASE_HEADING_RE.exec(line);
    if (heading) {
      current = heading[1] as string;
      continue;
    }
    if (current && /^\*\*Handoff\s*→\*\*/.test(line) && !HANDOFF_PLACEHOLDER_RE.test(line)) {
      out[current] = line;
    }
  }
  return out;
}

// V-BATCH-14 nonblocking #5: exported — `sdd-log.types.ts` used to carry a byte-for-byte duplicate
// (`CLOSE_MARKED_DONE_LINE_RE`, whose own JSDoc admitted "Mirrors check.ts's own copy"); that
// caller now imports this one instead. The other 10 independent Execution Log traversals this
// module's readers replaced check.ts/sdd-log.types.ts copies of are NOT deduplicated here — full
// derivation onto `parseExecutionLog` is B2-01b, out of this batch's scope.
/**
 * @purpose One checked `- [x] \`<ts>\` DONE` event line, verbatim (no other content on the line).
 * @invariant Exactly this pattern everywhere it is used — this module is its only home now.
 */
export const MARKED_DONE_LINE_RE = /^-\s*\[x\]\s*`[^`]+`\s*DONE\s*$/;

/**
 * @purpose Every phase id whose Execution Log block carries a checked `DONE` event line — a bare
 *   `sdd-log line "DONE" --phase P<N>` bypasses `sdd-log complete` (B2-07).
 * @invariant Any heading (Round, Round close, another phase) resets attribution — a checked DONE
 *   line inside `#### Round close` itself is never misattributed to the last-seen phase.
 * @param logBody Extracted EXECUTION_LOG section body.
 * @returns Phase ids with ≥1 checked DONE line in their own block, across every Round.
 */
export function phaseIdsWithMarkedDone(logBody: string): Set<string> {
  const ids = new Set<string>();
  let phase: string | null = null;
  for (const rawLine of logBody.split('\n')) {
    const line = rawLine.trim();
    const heading = PHASE_HEADING_RE.exec(line);
    if (heading) {
      phase = heading[1] as string;
      continue;
    }
    if (/^#{1,6}\s+\S/.test(line)) {
      phase = null;
      continue;
    }
    if (phase && MARKED_DONE_LINE_RE.test(line)) ids.add(phase);
  }
  return ids;
}

/**
 * @purpose Compare two timestamps by real instant when both parse (so `T09:00Z` and `T09:00:00Z`
 *   are equal, not "later" — v1's rule), else fall back to an equal-length lexicographic compare.
 * @param a First timestamp.
 * @param b Second timestamp.
 * @returns Negative/zero/positive per `a` being earlier/equal/later than `b`.
 */
function compareTimestamps(a: string, b: string): number {
  const ma = Date.parse(a);
  const mb = Date.parse(b);
  if (!Number.isNaN(ma) && !Number.isNaN(mb)) return ma === mb ? 0 : ma < mb ? -1 : 1;
  const len = Math.min(a.length, b.length);
  const ta = a.slice(0, len);
  const tb = b.slice(0, len);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/** @purpose One Round's post-close integrity analysis (B2-04). */
export type RoundCloseAnalysis = {
  /** @purpose The Round heading's verbatim text (e.g. `Round 2 — 2026-08-22, …`). */
  roundLabel: string;
  /** @purpose Checked event lines found AFTER this Round's own `#### Round close` block — append-after-close. */
  trailingCount: number;
  /** @purpose Checked event lines inside the close block itself, other than the one DONE line. */
  closeExtraCount: number;
  /** @purpose Checked, timestamped lines inside the round (before close) whose timestamp is later than the close DONE timestamp. */
  laterThanClose: string[];
  /** @purpose This Round has ≥1 checked phase-block line but no closed (checked DONE) `#### Round close`. */
  unclosed: boolean;
};

/**
 * @purpose Walk every Round and diagnose its close integrity (B2-04: `entry-after-close` /
 *   `extra-close-entry` / `bad-round-close` / `unclosed-round`). B2-01: derived from
 *   `parseExecutionLog`, one traversal instead of a parallel copy of the same boundary logic.
 * @invariant `#### Round close` is itself a level-4 heading; anything at/after its own DONE line is
 *   trailing content — never the preceding phase block.
 * @param logBody Extracted EXECUTION_LOG section body.
 * @returns One analysis per Round heading found, in document order.
 */
export function analyzeRoundClosures(logBody: string): RoundCloseAnalysis[] {
  const parsed = parseExecutionLog(wrapAsExecutionLogDocument(logBody));
  const out: RoundCloseAnalysis[] = [];
  for (const round of parsed?.rounds ?? []) {
    const anyCheckedInPhases = round.phases.some((p) => p.events.some((e) => e.checked));
    const closeExtraCount = round.close?.extra.length ?? 0;
    const trailingCount = round.trailing.filter((e) => e.checked).length;

    const laterThanClose: string[] = [];
    const closeTs = round.close?.done?.ts;
    if (closeTs) {
      for (const phase of round.phases) {
        for (const event of phase.events) {
          if (event.checked && event.ts && compareTimestamps(event.ts, closeTs) > 0) {
            laterThanClose.push(event.raw);
          }
        }
      }
    }

    out.push({
      roundLabel: round.label,
      trailingCount,
      closeExtraCount,
      laterThanClose,
      unclosed: !round.close?.done && anyCheckedInPhases,
    });
  }
  return out;
}

/**
 * @purpose Extract the `artifacts: [...]` file list from one verbatim Handoff line.
 * @invariant `none` / `n/a` / `—` inside the brackets means no real artifact — returns empty, same
 *   placeholder convention as Meta Dependencies.
 * @param handoffLine One verbatim `**Handoff →**` line (`parsePhaseHandoffs`'s output).
 * @returns Artifact paths in declared order (possibly empty).
 */
export function parseHandoffArtifacts(handoffLine: string): string[] {
  const inner = /artifacts:\s*\[([^\]]*)\]/.exec(handoffLine)?.[1]?.trim();
  if (!inner || /^(none|n\/a|[—-])$/i.test(inner)) return [];
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @purpose The highest `### Round N` heading number in `body`, or null when there is none. */
function maxRoundNumber(body: string): number | null {
  const matches = [...body.matchAll(/^#{3}\s+Round\s+(\d+)/gm)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => Number(m[1])));
}

// V-BATCH-14 blocking #1: a malformed ticket's `<!--/SECTION:EXECUTION_LOG-->` can be anchored too
// early — right after the section's own heading, before its actual `### Round N` content (real
// corpus artifact: `cli-sync-skills.task-57.md`). The primary section extract then reads as `ok`
// and empty, and the old count-based return re-emitted an already-existing Round heading. When the
// primary extract carries no Round heading, fall back to scanning the raw document from the close
// marker onward, stopping at the next real level-1/2 heading — a following `## Critic Rounds`
// section is NOT part of this Execution Log and must stay excluded either way.
/**
 * @purpose Compute the next round number from `### Round` headers in the EXECUTION_LOG section
 *   only (B2-02) — a legacy `## Critic Rounds` section can carry its own, unrelated ones.
 * @invariant Always one past the highest existing `### Round N` heading — never a re-emitted one.
 * @param fileContent Full ticket markdown.
 * @returns One past the highest existing Round number (1 when there is none at all).
 */
export function nextRoundNumber(fileContent: string): number {
  const log = extractSection(fileContent, 'EXECUTION_LOG');
  const primaryBody = log.status === 'ok' ? log.content : fileContent;
  const primaryMax = maxRoundNumber(primaryBody);
  if (primaryMax !== null) return primaryMax + 1;

  const closeMarker = '<!--/SECTION:EXECUTION_LOG-->';
  const closeIdx = fileContent.indexOf(closeMarker);
  const scanStart = closeIdx === -1 ? 0 : closeIdx + closeMarker.length;
  const rest = fileContent.slice(scanStart);
  const nextTopHeading = rest.match(/^#{1,2}\s+\S/m);
  const scanBody = nextTopHeading?.index !== undefined ? rest.slice(0, nextTopHeading.index) : rest;
  const fallbackMax = maxRoundNumber(scanBody);
  return (fallbackMax ?? 0) + 1;
}

// #region START_PARSE_EXECUTION_LOG — invariant: the one structural parser (B2-01); every focused reader above derives from it.

/** @purpose One event-list line's parsed shape: checked state, timestamp, first-word token, marker. */
export type LogEvent = {
  /** @purpose The trimmed line, verbatim. */
  raw: string;
  /** @purpose `[x]` vs `[ ]` — absent entirely for a bare marker line (`- 🛑 ...`). */
  checked: boolean;
  /** @purpose The backtick-quoted timestamp, verbatim as written (or null). */
  ts: string | null;
  /** @purpose The first whitespace-delimited word after the timestamp (or null). */
  token: string | null;
  /** @purpose Whether `token` is in `TOKEN_VOCABULARY` (always false when `token` is null). */
  known: boolean;
  /** @purpose `🛑` / `✅` when the line carries one of those markers, else null. */
  marker: '🛑' | '✅' | null;
};

/** @purpose One phase block's parsed shape within a Round, strictly before that Round's own close. */
export type PhaseBlock = {
  /** @purpose The phase id (e.g. `P1`). */
  id: string;
  /** @purpose The verbatim `— re-run: …` suffix, or null for the first (non-re-run) block. */
  rerun: string | null;
  /** @purpose Every event line in this block, in document order. */
  events: LogEvent[];
  /** @purpose The checked `DONE` event line, if any. */
  done: LogEvent | null;
};

/** @purpose One Round's `#### Round close` block: its DONE line, plus any other checked line in it. */
export type RoundClose = {
  /** @purpose The checked `DONE` closing line, or null while still a skeleton. */
  done: LogEvent | null;
  /** @purpose Every OTHER checked line inside the close block — should always be empty. */
  extra: LogEvent[];
};

/** @purpose One `### Round <n>` block: its phases, its close, and anything appended after that close. */
export type Round = {
  /** @purpose The heading's literal round number, or null if unparseable. */
  n: number | null;
  /** @purpose The heading's full verbatim text (e.g. `Round 2 — 2026-08-22, …`). */
  label: string;
  /** @purpose Phase blocks opened strictly before this Round's own close (or all of them, if unclosed). */
  phases: PhaseBlock[];
  /** @purpose This Round's own `#### Round close`, or null when the Round has none yet. */
  close: RoundClose | null;
  /** @purpose Every event line appended after a real close — the append-after-close signal (B2-04). */
  trailing: LogEvent[];
};

/** @purpose The full parsed Execution Log: every Round, in document order. */
export type ExecutionLog = {
  /** @purpose Every `### Round <n>` parsed, in document order. */
  rounds: Round[];
};

/** @purpose Matches any `- [ |x] ["<ts>"] <rest>` list-item line, checked or not, timestamped or not. */
const LOG_EVENT_LINE_RE = /^-\s*\[( |x)\]\s*(?:`([^`]+)`\s*)?(.*)$/;

/** @purpose Parse one trimmed line as a LogEvent — a checkbox item, or a bare marker line (`- 🛑 …`). */
function parseLogEvent(rawLine: string): LogEvent | null {
  const line = rawLine.trim();
  const marker = line.includes('🛑') ? '🛑' : line.includes('✅') ? '✅' : null;
  const m = LOG_EVENT_LINE_RE.exec(line);
  if (!m)
    return marker
      ? { raw: line, checked: false, ts: null, token: null, known: false, marker }
      : null;
  const checked = m[1] === 'x';
  const ts = m[2] ?? null;
  const token = (m[3] ?? '').trim().split(/\s+/)[0] || null;
  const known = token !== null && isVocabularyToken(token);
  return { raw: line, checked, ts, token, known, marker };
}

/**
 * @purpose Parse the whole EXECUTION_LOG section into every Round's phases, close, and trailing
 *   content — the one structural parser this module's focused readers derive from (B2-01).
 * @invariant A phase heading positioned at/after the Round's own close belongs to `trailing`, never
 *   to `phases`.
 * @param content Full ticket markdown.
 * @returns The parsed log, or null when EXECUTION_LOG is not a single clean section.
 */
export function parseExecutionLog(content: string): ExecutionLog | null {
  const log = extractSection(content, 'EXECUTION_LOG');
  if (log.status !== 'ok') return null;
  const logBody = log.content;
  const headings = collectHeadings(logBody);
  const roundHeadings = headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => heading.level === 3 && /^Round\s+\d+(?:\s|—|$)/i.test(heading.text));

  const rounds: Round[] = [];
  for (const { heading: round, index: roundIndex } of roundHeadings) {
    const nextTop = headings.slice(roundIndex + 1).find((h) => h.level <= round.level);
    const roundEnd = nextTop?.start ?? logBody.length;
    const roundBody = logBody.slice(round.lineEnd, roundEnd);
    const roundBodyHeadings = collectHeadings(roundBody);
    const nMatch = /^Round\s+(\d+)/i.exec(round.text);
    const n = nMatch?.[1] ? Number(nMatch[1]) : null;

    const closeHeading = roundBodyHeadings.find(
      (h) => h.level === 4 && /^Round\s+close\b/i.test(h.text)
    );
    const beforeCloseEnd = closeHeading ? closeHeading.start : roundBody.length;
    const phaseHeadings = roundBodyHeadings.filter(
      (h) => h.level === 4 && /^P[0-9]+(?:\s|—|$)/.test(h.text)
    );

    const phases: PhaseBlock[] = [];
    for (let i = 0; i < phaseHeadings.length; i++) {
      const h = phaseHeadings[i] as (typeof phaseHeadings)[number];
      if (h.start >= beforeCloseEnd) continue; // reopened after close → trailing, never a phase block
      const next = phaseHeadings[i + 1];
      const blockEnd = next && next.start < beforeCloseEnd ? next.start : beforeCloseEnd;
      const idMatch = /^(P[0-9]+)(?:\s+—\s+re-run:\s*(.*))?/.exec(h.text);
      const events = roundBody
        .slice(h.lineEnd, blockEnd)
        .split('\n')
        .map(parseLogEvent)
        .filter((e): e is LogEvent => e !== null);
      phases.push({
        id: (idMatch?.[1] ?? h.text) as string,
        rerun: idMatch?.[2]?.trim() || null,
        events,
        done: events.find((e) => e.checked && e.token === 'DONE') ?? null,
      });
    }

    let close: RoundClose | null = null;
    let trailing: LogEvent[] = [];
    if (closeHeading) {
      // Split point: the close's own DONE line, NOT the next heading (a bare appended checked line
      // with no new heading is still append-after-close, B2-04) — a later heading is only skipped.
      const parsedLines = roundBody
        .slice(closeHeading.lineEnd, roundEnd)
        .split('\n')
        .map(parseLogEvent);
      const doneIndex = parsedLines.findIndex((e) => e !== null && e.checked && e.token === 'DONE');
      if (doneIndex === -1) {
        const extra = parsedLines.filter((e): e is LogEvent => e !== null && e.checked);
        close = { done: null, extra };
      } else {
        const before = parsedLines
          .slice(0, doneIndex)
          .filter((e): e is LogEvent => e !== null && e.checked);
        close = { done: parsedLines[doneIndex] as LogEvent, extra: before };
        trailing = parsedLines.slice(doneIndex + 1).filter((e): e is LogEvent => e !== null);
      }
    }

    rounds.push({ n, label: round.text, phases, close, trailing });
  }

  return { rounds };
}
// #endregion END_PARSE_EXECUTION_LOG

// #region START_REOPEN_BY_CAUSE — invariant: Meta Reopens is causally honest (issue #13, D-20, B2-06)

/**
 * @purpose True when `reason` matches the closed round-reason vocabulary (D-20 / issue #13) — free
 *   text is no longer accepted for a reopen's cause.
 * @param reason The verbatim `sdd-log <ticket> round "<reason>"` payload.
 * @returns Whether `reason` (trimmed) matches the closed vocabulary.
 */
export function isValidRoundReason(reason: string): boolean {
  return /^(?:initial|resume|new-audit-session|fix:\s*F-\d+)$/.test(reason.trim());
}

/** @purpose One parsed `### Audit Round <N>` entry from a ticket's `## Audit Rounds` heading (TICKET_AUDIT_ROUND_FORMAT). */
export type AuditRoundRecord = {
  /** @purpose The heading's own Audit Round number (monotonic across the ticket's lifetime). */
  n: number;
  /** @purpose The Execution Round this audit ran after (`after-exec-round=<M>`), or 0 when unparseable. */
  afterExecRound: number;
  /** @purpose The Execution Round number this audit declared a reopen into (`triggered-reopen=Round-<M+1>`), or null for `triggered-reopen=none`. */
  triggeredReopen: number | null;
  /** @purpose The `@audit` line's `status=` value (`FAIL` / `PASS_RISK`), or empty when unparseable. */
  verdict: string;
};

/** @purpose Matches the fenced `@audit …` inline-grammar line inside one Audit Round block. */
const AUDIT_LINE_RE = /^@audit\s+(.*)$/m;

/** @purpose Extract one `key=value` field's value from an `@audit` line, or undefined. */
function auditField(line: string, name: string): string | undefined {
  return new RegExp(`\\b${name}=(\\S+)`).exec(line)?.[1];
}

/**
 * @purpose Parse every `### Audit Round <N>` entry from a ticket's bare `## Audit Rounds` heading
 *   section (not a `<!--SECTION-->`-anchored block — `TICKET_AUDIT_ROUND_FORMAT`).
 * @invariant Reads only inside that heading's own body — `## Critic Rounds`, the EXECUTION_LOG
 *   section, and `## Decision Log` are invisible by construction.
 * @param content Full ticket markdown.
 * @returns Every Audit Round entry found, in document order (empty when the heading is absent).
 */
export function parseAuditRounds(content: string): AuditRoundRecord[] {
  const section = extractHeadingSection(content, 'audit-rounds');
  if (section.status !== 'ok') return [];
  const body = section.content;
  const headings = collectHeadings(body);
  const roundHeadings = headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => heading.level === 3 && /^Audit\s+Round\s+\d+\b/i.test(heading.text));

  const out: AuditRoundRecord[] = [];
  for (const { heading, index } of roundHeadings) {
    const nextTop = headings.slice(index + 1).find((h) => h.level <= heading.level);
    const blockEnd = nextTop?.start ?? body.length;
    const block = body.slice(heading.lineEnd, blockEnd);
    const nMatch = /^Audit\s+Round\s+(\d+)/i.exec(heading.text);
    const auditLine = AUDIT_LINE_RE.exec(block)?.[1];
    if (!nMatch?.[1] || auditLine === undefined) continue;

    const afterExecRound = Number(auditField(auditLine, 'after-exec-round') ?? '0');
    const reopenRaw = auditField(auditLine, 'triggered-reopen');
    const reopenMatch = reopenRaw ? /^Round-(\d+)$/.exec(reopenRaw) : null;

    out.push({
      n: Number(nMatch[1]),
      afterExecRound: Number.isNaN(afterExecRound) ? 0 : afterExecRound,
      triggeredReopen: reopenMatch?.[1] ? Number(reopenMatch[1]) : null,
      verdict: auditField(auditLine, 'status') ?? '',
    });
  }
  return out;
}

/** @purpose Matches the Meta `**Reopens:** <count>` field (omitted entirely from the skeleton when 0). */
export const META_REOPENS_RE = /\*\*Reopens:\*\*\s*(\d+)/;
// #endregion END_REOPEN_BY_CAUSE
