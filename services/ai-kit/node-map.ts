// @file: Mapping from logical node IDs to AIKit directive names.
// @consumers: compile.ts (buildNodePrompt)
// @tasks: TSK-116, TSK-113

/**
 * @purpose Maps node identifiers used by the role engine to their directive file names.
 *   Each directive resolves to `ai/directives/agent-inbox/<name>.directive.xml`.
 * @invariant All directive names in this map correspond to existing files in `ai/directives/agent-inbox/`.
 */
export const NODE_DIRECTIVE_MAP: Readonly<Record<string, readonly string[]>> = {
  /** Scaffold node: architectural interrogation only (design-time check). */
  node_scaffold: ['arch-interrogation'],

  /** Review node: architecture + code interrogation (full review battery). */
  node_review: ['arch-interrogation', 'code-interrogation'],

  /** Enrich node: same full battery as review (deepen scaffold findings). */
  node_enrich: ['arch-interrogation', 'code-interrogation'],

  /** Sessions (fan-out) node: same full battery (track analysis). */
  node_sessions: ['arch-interrogation', 'code-interrogation'],

  /** Synthesize node: same full battery (unified report). Shared by reviewer + author graphs. */
  node_synthesize: ['arch-interrogation', 'code-interrogation'],

  /** Reviewer review-fanout: per-track battery (TSK-113 review_needed branch). */
  node_track_review: ['arch-interrogation', 'code-interrogation'],

  /** Reviewer review-fanout: security lens over the WHOLE changeset (NFC-SV-09). */
  node_security_lens: ['security-interrogation'],

  /** Reviewer review-fanout: code-review base..HEAD (diff-focused pass). */
  node_code_review: ['code-interrogation'],

  /** Reviewer reply_needed branch: thread-triage (annotate/verify fixes, no full battery). */
  node_thread_triage: ['change-interrogation', 'posting-rules'],

  /** Reviewer update-review branch: delta-only battery since last reviewed head. */
  node_delta_review: ['update-review', 'change-interrogation'],

  /** Reviewer update-review branch: synthesize the delta findings. */
  node_synthesize_delta: ['change-interrogation'],

  /** Author graph: self-review battery over own diff. */
  node_self_review: ['arch-interrogation', 'code-interrogation'],

  /** Author graph: classify reviewer feedback against the diff (fix/reply/agree). */
  node_analyze_feedback: ['change-interrogation'],
};
