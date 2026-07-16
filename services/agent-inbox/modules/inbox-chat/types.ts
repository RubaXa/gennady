// @file: Shared Value Objects for inbox-chat — ChatTurn, ContextChip, MutationProposal, ReviewSnapshot (D-109: one file, no independent behavior yet).
// @consumers: ChatSession, ChatTranscript, ContextAssembler, MutationApplier (TSK-127)
// @tasks: TSK-126, TSK-132

/** @purpose Kind of context fragment attached to a chat turn — closed enum, rejects other values at compile time. */
export type ContextChipKind = 'selection' | 'mention' | 'candidate';

/** @purpose Structural anchor to where a chip's fragment came from — file:line, not bare text (D-115, Cursor `@path#L76-82` / Copilot `#file:FILE:RANGE` format). */
export type ContextChipOrigin = {
  /** @purpose Artifact the fragment came from — `README.md` | `PLAN.md` | `<track>.task.md` | `review.json` | code file path */
  artifact: string;
  /** @purpose 1-based first line of the fragment inside `artifact` */
  startLine: number;
  /** @purpose 1-based last line of the fragment inside `artifact` */
  endLine: number;
};

/** @purpose One prompt-attached fragment of context — selection highlight, @-mention, or inline candidate ask (CH-01/CH-04/CH-07). */
export type ContextChip = {
  /** @purpose Chip origin — selection highlight, @-mention, or candidate ask */
  kind: ContextChipKind;
  /** @purpose Quoted text shown on the chip pill */
  quote: string;
  /** @purpose Reference resolved by the chip — `review.json#<candidateId>`, a file path, or a diagram id */
  source: string;
  /** @purpose Structural file:line anchor reaching the model (D-115) | @invariant Required — never omitted, never erased by staleness (orthogonal to `source`) */
  origin: ContextChipOrigin;
  /** @purpose Set by `ContextAssembler#reresolveChips` when `source` no longer resolves against the current `review.json` | @invariant Marks staleness, never silently drops the chip (D-101) */
  stale?: boolean;
};

/** @purpose Provenance tag surfaced on a mutation whose input came from MR-authored text (D-98) — human-gate visibility before Apply. */
export type MutationProvenance = {
  /** @purpose Always true — presence of the field is itself the signal */
  groundedInMrText: true;
  /** @purpose Exact MR-text quote that grounded the proposed mutation */
  quote: string;
};

/** @purpose One assistant-proposed structural change to `review.json` — v1 ops only (D-90); `add`/`set-verdict` deferred. */
export type MutationProposal = {
  /** @purpose Mutation kind */
  op: 'edit' | 'remove' | 'set-severity';
  /** @purpose Candidate id in `review.json` the mutation targets */
  target: string;
  /** @purpose Field value(s) before the mutation */
  before: unknown;
  /** @purpose Field value(s) after the mutation */
  after: unknown;
  /** @purpose Present only for a downgrade/remove sourced from MR text (D-98) */
  provenance?: MutationProvenance;
};

/** @purpose One turn of the review chat — question, attached context, full answer, proposed mutations, revision at ask-time. */
export type ChatTurn = {
  /** @purpose Unique turn identifier */
  id: string;
  /** @purpose ISO timestamp the turn completed (or was stopped) */
  ts: string;
  /** @purpose Operator's question text for this turn */
  question: string;
  /** @purpose Context chips attached to this turn */
  chips: ContextChip[];
  /** @purpose Assistant's answer — full text, or streamed-so-far text when stopped */
  answer: string;
  /** @purpose Structural mutations proposed by the assistant, if any (D-90) */
  mutations?: MutationProposal[];
  /** @purpose `review.json` revision at the moment of this turn — CAS input for `MutationApplier` (D-99) */
  reviewRevision: number;
  /** @purpose True when the operator invoked `stop()` before the turn completed (D-95/CH-11) */
  stopped?: boolean;
};

/** @purpose Snapshot of `review.json` immediately before a mutation is applied — undo material (D-94). */
export type ReviewSnapshot = {
  /** @purpose Unique snapshot identifier */
  id: string;
  /** @purpose MR reference (`project!iid`) the snapshot belongs to */
  mrRef: string;
  /** @purpose ISO timestamp the snapshot was taken */
  ts: string;
  /** @purpose `review.json` revision captured by this snapshot */
  revision: number;
  /** @purpose Absolute path to the snapshot file under `reports/<mr>/snapshots/` */
  path: string;
};
