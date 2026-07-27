// @file: ReviewProgress — pure deriver mapping a live RoleInstance's graph position + accumulated
//   artifacts + phase-telemetry timings into a human-facing progress informer (TSK-155): stage,
//   lens-track counter, and elapsed time. No I/O — callers (BoardProviderReal) supply already-read
//   state so this stays unit-testable with an injected clock (D-215 nowMs convention).
// @consumers: BoardProviderReal#getBoard
// @tasks: TSK-155

import type { PhaseTimingEntry } from './phase-telemetry.ts';

/** @purpose Human-facing review progress informer for one live `RoleInstance` (TSK-155). */
export type ReviewProgress = {
  /** @purpose Closed-set stage token driving the dashboard's icon/color choice. */
  stage: string;
  /** @purpose Human-readable (Russian) label for `stage`, ready to render as-is. */
  stageLabel: string;
  /** @purpose Lens tracks planned for the active branch (fixed at 3 for review_needed). */
  tracksPlanned: number;
  /** @purpose Lens tracks whose artifact is already present. */
  tracksDone: number;
  /** @purpose Human-readable labels of tracks not yet done. */
  tracksInProgress: string[];
  /** @purpose Short human-readable description of what is happening right now. */
  activity: string;
  /** @purpose Milliseconds elapsed since the review run started (0 when unknown). */
  elapsedMs: number;
  /** @purpose ISO timestamp the review run started at, or null when unknown. */
  startedAt: string | null;
};

/** @purpose The three fixed review-fanout lens node ids (review_needed branch, reviewer.role.ts). */
const LENS_NODE_IDS = ['node_track_review', 'node_security_lens', 'node_code_review'] as const;

/** @purpose Human (Russian) label per lens node id — used for `tracksInProgress`. */
const LENS_LABELS: Record<string, string> = {
  node_track_review: 'трек-ревью',
  node_security_lens: 'безопасность',
  node_code_review: 'код-ревью',
};

/** @purpose Closed-set stage token + Russian label per graph node id (reviewer + author + shared). */
const NODE_STAGE: Record<string, { stage: string; stageLabel: string }> = {
  // reviewer
  node_prepare: { stage: 'planning', stageLabel: 'Планирование' },
  node_enrich: { stage: 'planning', stageLabel: 'Обогащение контекста' },
  gate_enrich: { stage: 'planning', stageLabel: 'Проверка обогащения' },
  node_review_fanout: { stage: 'reviewing', stageLabel: 'Ревью' },
  node_track_review: { stage: 'reviewing', stageLabel: 'Ревью' },
  node_security_lens: { stage: 'reviewing', stageLabel: 'Ревью' },
  node_code_review: { stage: 'reviewing', stageLabel: 'Ревью' },
  gate_review_filled: { stage: 'reviewing', stageLabel: 'Ревью' },
  node_synthesize: { stage: 'synthesis', stageLabel: 'Синтез' },
  gate_review_synthesis: { stage: 'synthesis', stageLabel: 'Синтез' },
  node_ask: { stage: 'awaiting', stageLabel: 'Ожидает решения' },
  node_effect: { stage: 'applying', stageLabel: 'Применение' },
  done: { stage: 'done', stageLabel: 'Готово' },
  node_thread_triage: { stage: 'triage', stageLabel: 'Разбор тредов' },
  gate_triage: { stage: 'triage', stageLabel: 'Разбор тредов' },
  node_delta_review: { stage: 'delta', stageLabel: 'Дельта-ревью' },
  gate_delta: { stage: 'delta', stageLabel: 'Дельта-ревью' },
  node_synthesize_delta: { stage: 'delta', stageLabel: 'Дельта-ревью' },
  gate_delta_synthesis: { stage: 'delta', stageLabel: 'Дельта-ревью' },
  // author
  node_self_review: { stage: 'reviewing', stageLabel: 'Саморевью' },
  node_analyze_feedback: { stage: 'reviewing', stageLabel: 'Анализ фидбека' },
  gate_analysis: { stage: 'reviewing', stageLabel: 'Проверка анализа' },
  gate_synthesis: { stage: 'synthesis', stageLabel: 'Синтез' },
};

/** @purpose Fallback stage for a node id absent from `NODE_STAGE` (unknown/future graph node). */
const UNKNOWN_STAGE = { stage: 'unknown', stageLabel: 'Неизвестно' } as const;

/** @purpose Short (Russian) activity description per node id — finer-grained than `stageLabel`. */
const NODE_ACTIVITY: Record<string, string> = {
  node_prepare: 'Подготовка контекста',
  node_enrich: 'Обогащение контекста задач',
  gate_enrich: 'Проверка обогащения',
  node_review_fanout: 'Ревью линз (параллельно)',
  node_track_review: 'Ревью: трек-ревью',
  node_security_lens: 'Ревью: безопасность',
  node_code_review: 'Ревью: код-ревью',
  gate_review_filled: 'Проверка готовности линз',
  node_synthesize: 'Синтез отчёта',
  gate_review_synthesis: 'Проверка синтеза',
  node_ask: 'Ожидает решения оператора',
  node_effect: 'Применение решения',
  done: 'Готово',
  node_thread_triage: 'Разбор тредов',
  gate_triage: 'Проверка разбора тредов',
  node_delta_review: 'Дельта-ревью',
  gate_delta: 'Проверка дельты',
  node_synthesize_delta: 'Синтез дельты',
  gate_delta_synthesis: 'Проверка синтеза дельты',
  node_self_review: 'Саморевью кода',
  node_analyze_feedback: 'Анализ отзывов ревьюеров',
  gate_analysis: 'Проверка анализа',
  gate_synthesis: 'Проверка синтеза',
};

/**
 * @purpose Whether an accumulated artifact represents a completed lens result — the disk-persisted
 *   shape is `{ findings: [...] }` (reviewer.role.ts `_lensArtifactSchema`).
 * @param artifact Value at `artifacts[lensNodeId]`, or undefined when the lens hasn't run yet.
 * @returns True when the lens produced a valid (array `findings`) result.
 */
function _isLensDone(artifact: unknown): boolean {
  return (
    !!artifact &&
    typeof artifact === 'object' &&
    Array.isArray((artifact as Record<string, unknown>)['findings'])
  );
}

/**
 * @purpose Earliest start across entries — `entry.ts` is a finish time, so start = ts − durationMs.
 * @param phaseEntries Phase-timing entries for the MR under review (any order).
 * @returns Earliest start in epoch ms, or null when `phaseEntries` is empty.
 */
function _earliestStartMs(phaseEntries: PhaseTimingEntry[]): number | null {
  let earliest: number | null = null;
  for (const entry of phaseEntries) {
    const finishMs = new Date(entry.ts).getTime();
    if (!Number.isFinite(finishMs)) continue;
    const startMs = finishMs - entry.durationMs;
    if (!Number.isFinite(startMs)) continue;
    if (earliest === null || startMs < earliest) earliest = startMs;
  }
  return earliest;
}

/**
 * @purpose Derive a `ReviewProgress` informer from a live instance's graph position, accumulated
 *   artifacts, and phase-telemetry entries. PURE — clock only via `nowMs` (mirrors D-215).
 * @param input `currentNode` (`RoleInstance.currentNode`), `artifacts`
 *   (`RoleInstance.getCheckpoint().artifacts`), `phaseEntries` (filtered to this MR), and optional
 *   `nowMs` (defaults to `Date.now()`, override in tests for deterministic `elapsedMs`).
 * @returns The derived `ReviewProgress`.
 */
export function deriveReviewProgress(input: {
  currentNode: string;
  artifacts: Record<string, unknown>;
  phaseEntries: PhaseTimingEntry[];
  nowMs?: number;
  /** @purpose Role name — drives lens-track counter (reviewer=3 lenses, author=0). */
  role?: string;
}): ReviewProgress {
  const { currentNode, artifacts, phaseEntries, nowMs = Date.now(), role } = input;

  const { stage, stageLabel } = NODE_STAGE[currentNode] ?? UNKNOWN_STAGE;
  const activity = NODE_ACTIVITY[currentNode] ?? stageLabel;

  const lensIds = role === 'author' ? [] : LENS_NODE_IDS;
  const tracksPlanned = lensIds.length;
  const doneIds = lensIds.filter((id) => _isLensDone(artifacts[id]));
  const tracksDone = doneIds.length;
  const tracksInProgress = lensIds.filter((id) => !doneIds.includes(id)).map(
    (id) => LENS_LABELS[id]!
  );

  const startMs = _earliestStartMs(phaseEntries);
  const startMsValid = startMs !== null && Number.isFinite(startMs);
  const elapsedMs = startMsValid ? Math.max(0, nowMs - startMs!) : 0;
  const startedAt = startMsValid ? new Date(startMs!).toISOString() : null;

  return {
    stage,
    stageLabel,
    tracksPlanned,
    tracksDone,
    tracksInProgress,
    activity,
    elapsedMs,
    startedAt,
  };
}
