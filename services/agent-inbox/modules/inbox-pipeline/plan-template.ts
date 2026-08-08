// @file: PlanTemplate — deterministic DAG plan generation from changeset with 3-layer tracks (mandatory/triggered/proposed)
// @consumers: inbox-pipeline
// @tasks: TSK-161

import { logger } from '#logger';
import type { TriggerRegistry, TriggeredTrack } from './trigger-registry.ts';

/** @purpose Source origin for a review track — layer discriminant */
export type TrackSource = 'mandatory' | `triggered:${string}` | 'proposed';

/** @purpose A review track with its file coverage, focus, and lifecycle status */
export type TrackSpec = {
  /** @purpose Unique track identifier */
  id: string;
  /** @purpose Human-readable track name */
  name: string;
  /** @purpose Source classification (layer discriminant) */
  source: TrackSource;
  /** @purpose Files covered by this track */
  files: string[];
  /** @purpose Review focus description for the track */
  focus: string;
};

/** @purpose A stage in the review pipeline DAG */
export type PlanStage = {
  /** @purpose Stage name */
  name: string;
  /** @purpose Stage type: deterministic, flash model, or pro model */
  kind: 'deterministic' | 'flash' | 'pro' | 'mixed';
  /** @purpose Track ids associated with this stage */
  tracks: string[];
};

/** @purpose Complete review plan with stages, tracks, and metadata */
export type ReviewPlan = {
  /** @purpose MR reference (path!iid) */
  mr: string;
  /** @purpose Ordered pipeline stages (DAG) */
  stages: PlanStage[];
  /** @purpose All tracks — 3 layers: mandatory (1), triggered (2), proposed (3) */
  tracks: TrackSpec[];
};

/** @purpose A single entry in the changeset — one changed file with action */
export type ChangesetEntry = {
  /** @purpose File path relative to repo root */
  path: string;
  /** @purpose Change action */
  action: 'added' | 'modified' | 'deleted';
};

// #region START_TRACK_CLASSIFICATION — layer 1: file-to-track mapping via pattern rules
// purpose: mirrors buildReviewPlan TRACK_RULES v1 from cli/cmd/inbox-review-plan,
// adapted as a pure in-memory classifier for the pipeline module

const TRACK_RULES: Record<string, { patterns: RegExp[]; focus: string }> = {
  tests: {
    patterns: [/\.(test|spec)\.(ts|tsx|js|jsx)$/, /__tests__\//],
    focus: 'TEST probe',
  },
  docs: {
    patterns: [/\.(md|mdx|xml)$/, /^docs\//, /^specs\//, /^ai\/(directives|skills)\//],
    focus: 'docs — skip probes, только структура',
  },
  config: {
    patterns: [/\.(json|yaml|yml|toml)$/, /^\./, /Dockerfile/, /Makefile/],
    focus: 'config — DEP+GLOBAL probes',
  },
  ui: {
    patterns: [/\.(svelte|vue|tsx|jsx|css|scss|less)$/],
    focus: 'NAT+IDIOM+LIT probes',
  },
  assets: {
    patterns: [
      /\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/,
      /\.(woff2?|ttf|eot|otf)$/,
      /\.(pdf|xlsx?|docx?)$/,
    ],
    focus: 'assets — skip review',
  },
};

const DEFAULT_TRACK = 'logic';
const DEFAULT_FOCUS = 'NAT+IDIOM+LIT+DEP+GLOBAL+BIZ+TYPO probes';

/**
 * @purpose Classify a single file path into its layer-1 track name.
 * @param path File path relative to repo root.
 * @returns Track name string.
 */
function classifyFileTrack(path: string): string {
  for (const [track, rules] of Object.entries(TRACK_RULES)) {
    if (rules.patterns.some((r) => r.test(path))) return track;
  }
  return DEFAULT_TRACK;
}

/**
 * @purpose Retrieve the focus description for a layer-1 track.
 * @param track Track name.
 * @returns Focus description string.
 */
function getTrackFocus(track: string): string {
  return TRACK_RULES[track]?.focus ?? DEFAULT_FOCUS;
}

// #endregion END_TRACK_CLASSIFICATION

/**
 * @purpose Generate a deterministic review plan from a changeset, using TriggerRegistry for layer-2 tracks.
 * @invariant Deterministic: same changeset always produces the same track ordering and stage structure.
 * @invariant Layer 1 (mandatory) covers 100% of files, Layer 2 (triggered) adds glob-matched tracks, Layer 3 (proposed) is reserved for enrich.
 */
export class PlanTemplate {
  /** @purpose Trigger registry for layer-2 track resolution */
  protected _triggerRegistry: TriggerRegistry;

  /**
   * @purpose Create a PlanTemplate bound to a trigger registry.
   * @param triggerRegistry TriggerRegistry instance for layer-2 resolution.
   */
  constructor(triggerRegistry: TriggerRegistry) {
    this._triggerRegistry = triggerRegistry;
    logger.debug('[PlanTemplate#constructor] [init → ready]');
  }

  /**
   * @purpose Generate a review plan with 3-layer tracks and DAG stages for an MR.
   * @param mr MR reference (path!iid).
   * @param changeset Changed files in the MR.
   * @returns Deterministic ReviewPlan with stages and tracks.
   */
  generate(mr: string, changeset: ChangesetEntry[]): ReviewPlan {
    logger.debug(`[PlanTemplate#generate] [idle → generating] ${mr}`, {
      fileCount: changeset.length,
    });

    // #region START_LAYER1_MANDATORY — classify every file into mandatory tracks, 100% coverage
    const mandatoryTrackMap = new Map<string, ChangesetEntry[]>();
    for (const entry of changeset) {
      const track = classifyFileTrack(entry.path);
      const list = mandatoryTrackMap.get(track) ?? [];
      list.push(entry);
      mandatoryTrackMap.set(track, list);
    }

    const allFilePaths = changeset.map((e) => e.path);
    const mandatoryTracks: TrackSpec[] = [...mandatoryTrackMap.entries()].map(([track, files]) => ({
      id: track,
      name: track,
      source: 'mandatory' as TrackSource,
      files: files.map((f) => f.path),
      focus: getTrackFocus(track),
    }));
    // #endregion END_LAYER1_MANDATORY

    // #region START_LAYER2_TRIGGERED — resolve glob-triggered tracks from the registry
    const triggered: TriggeredTrack[] = this._triggerRegistry.resolve(allFilePaths);
    const triggeredTracks: TrackSpec[] = triggered.map((t) => ({
      id: t.trackId,
      name: t.trackName,
      source: `triggered:${t.ruleId}` as TrackSource,
      files: t.matchedFiles,
      focus: t.focus,
    }));
    // #endregion END_LAYER2_TRIGGERED

    // purpose: layer 3 (proposed) is reserved for enrich stage — empty in plan generation
    const proposedTracks: TrackSpec[] = [];

    const allTracks: TrackSpec[] = [...mandatoryTracks, ...triggeredTracks, ...proposedTracks];

    // #region START_STAGE_ORDERING — deterministic DAG: prepare → plan → enrich → fan-out → gate_coverage → synthesize → gate_verdict → tails
    const trackIds = allTracks.map((t) => t.id);
    const stages: PlanStage[] = [
      { name: 'prepare_env', kind: 'deterministic', tracks: [] },
      { name: 'plan', kind: 'deterministic', tracks: [] },
      { name: 'enrich', kind: 'flash', tracks: [] },
      { name: 'fan_out', kind: 'pro', tracks: trackIds },
      { name: 'gate_coverage', kind: 'deterministic', tracks: [] },
      { name: 'synthesize', kind: 'pro', tracks: [] },
      { name: 'gate_verdict', kind: 'deterministic', tracks: [] },
      { name: 'tails', kind: 'mixed', tracks: [] },
    ];
    // #endregion END_STAGE_ORDERING

    logger.info(`[PlanTemplate#generate] [generating → done] ${mr}`, {
      mandatory: mandatoryTracks.length,
      triggered: triggeredTracks.length,
      totalTracks: allTracks.length,
    });

    return { mr, stages, tracks: allTracks };
  }
}
