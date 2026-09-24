// @file: One repo-wide stack detection — the single fact `sdd-state`/`sdd-task`/`sdd-verify` share
//   instead of each re-guessing "what stack is this?" on its own.
// @spec: SHARED
// @consumers: sdd-state.cmd, sdd-task.cmd, sdd-verify/phase-context

import { detectStacks, BUILTIN_STACK_PLUGINS } from './stack-registry.ts';
import type { StackConfig, StackDetection, StackId } from './verify.types.ts';

/**
 * @purpose One repository's resolved stack detection — the fact every caller on the same root must
 *   see identically (30-TRACK-VERIFY.md §4.4: sdd-state/sdd-task/sdd-verify share one StackDetection).
 */
export type RepoStackDetection = {
  /** @purpose Detected stack ids, in D-64 primary order (config intersection or default priority). */
  readonly stacks: readonly StackId[];
  /** @purpose Full detection payloads backing `stacks`, same order. */
  readonly detections: readonly StackDetection[];
  /** @purpose Rendered `STACK_SOURCE=` value: comma-joined `marker:<file>` entries, or `config:stack.use` when `use` narrowed the candidates. */
  readonly source: string;
};

/** D-64's stable default primary/tail order, including Swift before its detector arrives. */
export const DEFAULT_STACK_PRIORITY: readonly StackId[] = ['swift', 'golang', 'node', 'anystack'];

/**
 * @purpose Order an already detected set without ever adding a stack.
 * @invariant `stack.use` is an ordering/filtering instruction over the detected intersection, not
 *   an assignment mechanism; ids absent from `detected` never appear in the result (D-64).
 * @param detected Stack ids already recognized from repository evidence.
 * @param [use] Optional operator ordering and filter.
 * @returns Detected intersection in config or D-64 default order.
 */
export function orderDetectedStacks(
  detected: readonly StackId[],
  use?: readonly string[]
): StackId[] {
  const detectedSet = new Set(detected);
  const priority = use ?? DEFAULT_STACK_PRIORITY;
  return priority.filter((stack) => detectedSet.has(stack));
}

/**
 * @purpose Detect which stack(s) govern a repository — one function, no per-caller re-guessing.
 * @invariant `stack.use` only narrows. Without it, no concrete marker selects node bootstrap;
 *   marker-less `anystack` requires explicit opt-in (V-05b/L-24).
 * @param root Absolute repository root.
 * @param config Merged `stack` config section, or null for pure auto-detection (gennady.yaml
 *   wiring is V-07's job — this function accepts config so its narrowing behavior is testable today).
 * @returns The repo's resolved stack detection.
 */
export function detectRepoStack(root: string, config: StackConfig | null): RepoStackDetection {
  const active = detectStacks(root, config, BUILTIN_STACK_PLUGINS);
  const nonAnystack = active.filter((entry) => entry.plugin.id !== 'anystack');
  const anystack = active.find((entry) => entry.plugin.id === 'anystack');

  const matched: { detection: StackDetection; marker: string }[] = [
    ...nonAnystack.map((entry) => ({ detection: entry.detection, marker: entry.plugin.marker })),
  ];
  const bootstrapNode =
    matched.length === 0 && !config?.use
      ? {
          detection: {
            stack: 'node' as const,
            root,
            summary: ['fallback:   node bootstrap (no concrete stack marker)'],
            diagnostics: [],
            details: null,
          },
          marker: '',
        }
      : null;
  const chosen =
    matched.length > 0
      ? [
          ...matched,
          // Anystack is the default last-resort, but an explicit stack.use makes its always-match
          // detection participate at the operator-chosen position (D-64).
          ...(config?.use?.includes('anystack') && anystack
            ? [{ detection: anystack.detection, marker: anystack.plugin.marker }]
            : []),
        ]
      : bootstrapNode
        ? [bootstrapNode]
        : anystack
          ? [{ detection: anystack.detection, marker: anystack.plugin.marker }]
          : [];

  const byStack = new Map(chosen.map((entry) => [entry.detection.stack, entry]));
  const sorted = orderDetectedStacks([...byStack.keys()], config?.use).map(
    (stack) => byStack.get(stack)!
  );

  return {
    stacks: sorted.map((entry) => entry.detection.stack),
    detections: sorted.map((entry) => entry.detection),
    source: config?.use
      ? 'config:stack.use'
      : bootstrapNode
        ? 'fallback:node'
        : sorted.map((entry) => `marker:${entry.marker}`).join(','),
  };
}

/**
 * @purpose Select the shared primary stack from an ordered D-64 repository detection.
 * @invariant An empty configured intersection fails closed instead of assigning Node.
 * @param detection Repo-wide stack detection (V-05).
 * @returns The stack id every phase/readiness/gate-plan consumer on this root must share.
 */
export function primaryStackOf(detection: RepoStackDetection): StackId {
  const primary = detection.stacks[0];
  if (!primary) {
    throw new Error('SDD_VERIFY_NO_STACK_DETECTED: stack.use matched no detected repository stack');
  }
  return primary;
}
