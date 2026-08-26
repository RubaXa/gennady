// @file: Pure task-descriptor builders for the review and delta-review DAGs owned by PipelineRuntime.
//   Computes ordered {type, params, key?} descriptors only — no queue submission, no side effects.
// @consumers: PipelineRuntime (startReview → _materializeReview, startDeltaReview)
// @tasks: TSK-157, TSK-161

import { LensRegistry } from '../lens-registry.ts';
import { PlanTemplate } from '../plan-template.ts';
import { TriggerRegistry } from '../trigger-registry.ts';
import { normalizeTaskSuffix } from './artifact-io.ts';
import type { PipelineRole, ReviewStartOptions } from './pipeline-runtime.types.ts';

/** @purpose One queue-node materialization request in DAG-submission order. */
export type DagTaskDescriptor = Readonly<{
  /** @purpose Concrete task type registered in TaskRegistry. */
  type: string;
  /** @purpose Task parameters; may itself carry a `dependsOn` list of task ids consumed by TaskQueue. */
  params: Record<string, unknown>;
  /** @purpose Explicit stable dedup key; PipelineRuntime falls back to `pipeline:${mr}:${type}` when absent. */
  key?: string;
}>;

/** @purpose Ordered root-review descriptors plus the role/tracks PipelineRuntime logs after enqueue. */
export type ReviewMaterialization = Readonly<{
  /** @purpose Review role determining the terminal tail descriptor. */
  role: PipelineRole;
  /** @purpose Resolved track ids, including the injected `control` track when authorized. */
  tracks: string[];
  /** @purpose Task descriptors in exact materialization order. */
  descriptors: readonly DagTaskDescriptor[];
}>;

/**
 * @purpose Compute the authoritative root review DAG descriptors, in materialization order.
 * @param mr MR reference threaded into every task's params.
 * @param [options] Role and deterministic-plan track details.
 * @returns Role, resolved tracks and ordered task descriptors; PipelineRuntime enqueues each in turn.
 */
export function materializeReviewTasks(
  mr: string,
  options: ReviewStartOptions = {}
): ReviewMaterialization {
  const role = options.role ?? 'reviewer';
  const plan = new PlanTemplate(new TriggerRegistry()).generate(mr, options.changeset ?? []);
  const plannedTracks = options.tracks?.length
    ? options.tracks
    : plan.tracks.map((track) => track.id);
  const tracks = options.controlPlaneInput
    ? [...new Set([...plannedTracks, 'control'])]
    : plannedTracks;
  const pipelineParams = {
    mr,
    createdBy: 'pipeline',
    changeset: options.changeset ?? [],
    toolTrace: options.toolTrace ?? [],
    modelResults: options.modelResults ?? [],
    plan,
    controlPlaneAuthorized: options.controlPlaneInput !== undefined,
  };

  const descriptors: DagTaskDescriptor[] = [];

  for (const type of ['prepare_env', 'plan', 'enrich']) {
    descriptors.push({ type, params: pipelineParams });
  }

  for (const track of tracks) {
    descriptors.push({
      type: `track_${normalizeTaskSuffix(track)}`,
      params: { ...pipelineParams, layer: 'mandatory' },
    });
  }

  const lensResolution = new LensRegistry().resolveAll(tracks);
  for (const wave of lensResolution.mandatoryWaves)
    for (const lens of wave.lenses) {
      const dependsOn = lens.inputs.map(
        (input) => `lens_${normalizeTaskSuffix(input.replace(/^lens-/, ''))}`
      );
      descriptors.push({
        type: `lens_${normalizeTaskSuffix(lens.id.replace(/^lens-/, ''))}`,
        params: {
          ...pipelineParams,
          layer: 'mandatory',
          lens,
          // Instance edges preserve LensSpec.inputs after the declarative registry has been
          // expanded. The immutable registry only knows the common enrich prerequisite.
          dependsOn,
        },
      });
    }

  if (options.controlPlaneInput) {
    descriptors.push({
      type: 'lens_control',
      params: { ...pipelineParams, layer: 'mandatory' },
    });
  }

  for (const type of ['gate_coverage', 'synthesize', 'gate_verdict', `tail_${role}`]) {
    descriptors.push({ type, params: { ...pipelineParams, role } });
  }

  return { role, tracks, descriptors };
}

/**
 * @purpose Compute the delta-review mini-DAG descriptors for a new MR head SHA, in dependency order.
 * @param mr MR reference threaded into every task's params.
 * @param lastReviewedHeadSha Last reviewed commit SHA.
 * @param headSha New head commit SHA.
 * @returns Ordered task descriptors, each carrying its explicit `delta:${mr}:${type}` dedup key.
 */
export function materializeDeltaReviewTasks(
  mr: string,
  lastReviewedHeadSha: string,
  headSha: string
): readonly DagTaskDescriptor[] {
  const params = { mr, lastReviewedHeadSha, headSha, createdBy: 'pipeline' };
  const types = [
    'delta_review',
    'delta_prepare',
    'delta_changeset',
    'delta_tracks',
    'synthesize_delta',
    'gate_verdict_delta',
  ];
  return types.map((type) => ({ type, params, key: `delta:${mr}:${type}` }));
}
