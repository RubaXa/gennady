// @file: One repo-wide stack detection — the single fact `sdd-state`/`sdd-task`/`sdd-verify` share
//   instead of each re-guessing "what stack is this?" on its own.
// @consumers: sdd-state.cmd, sdd-task.cmd, sdd-verify/phase-context
// @tasks: V-05, V-06b, V-08b

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectStacks, BUILTIN_STACK_PLUGINS } from './stack-registry.ts';
import type { StackConfig, StackDetection, StackId } from './verify.types.ts';

/** @purpose Root marker file that recognizes the (RC-native, non-plugin) node stack. */
const NODE_MARKER = 'package.json';

/**
 * @purpose Detect the RC-native node stack — not a `StackPlugin` (it keeps its own V-04
 *   preset), but still owed a place in the one shared `StackDetection` fact.
 * @param root Absolute repository root.
 * @param use `stack.use` restriction from config, or undefined for unrestricted auto-detection.
 * @returns Detection payload, or null when node is excluded by `use` or `package.json` is absent.
 */
function detectNode(root: string, use: readonly string[] | undefined): StackDetection | null {
  if (use && !use.includes('node')) return null;
  if (!existsSync(join(root, NODE_MARKER))) return null;
  return {
    stack: 'node',
    root,
    summary: [`marker:     ${NODE_MARKER}`],
    diagnostics: [],
    details: null,
  };
}

/**
 * @purpose One repository's resolved stack detection — the fact every caller on the same root must
 *   see identically (30-TRACK-VERIFY.md §4.4: sdd-state/sdd-task/sdd-verify share one StackDetection).
 */
export type RepoStackDetection = {
  /** @purpose Detected stack ids, in deterministic (alphabetical) order. */
  readonly stacks: readonly StackId[];
  /** @purpose Full detection payloads backing `stacks`, same order. */
  readonly detections: readonly StackDetection[];
  /** @purpose Rendered `STACK_SOURCE=` value: comma-joined `marker:<file>` entries, or `config:stack.use` when `use` narrowed the candidates. */
  readonly source: string;
};

/**
 * @purpose Detect which stack(s) govern a repository — one function, no per-caller re-guessing.
 * @invariant `stack.use` narrows candidates, never assigns an undetected stack. `anystack`
 *   (matches every repository) is a last resort, used only when nothing else matched — never
 *   "no stack detected", but node/go stay noise-free.
 * @param root Absolute repository root.
 * @param config Merged `stack` config section, or null for pure auto-detection (gennady.yaml
 *   wiring is V-07's job — this function accepts config so its narrowing behavior is testable today).
 * @returns The repo's resolved stack detection.
 */
export function detectRepoStack(root: string, config: StackConfig | null): RepoStackDetection {
  const node = detectNode(root, config?.use);
  const active = detectStacks(root, config, BUILTIN_STACK_PLUGINS);
  const nonAnystack = active.filter((entry) => entry.plugin.id !== 'anystack');
  const anystack = active.find((entry) => entry.plugin.id === 'anystack');

  const matched: { detection: StackDetection; marker: string }[] = [
    ...(node ? [{ detection: node, marker: NODE_MARKER }] : []),
    ...nonAnystack.map((entry) => ({ detection: entry.detection, marker: entry.plugin.marker })),
  ];
  const chosen =
    matched.length > 0
      ? matched
      : anystack
        ? [{ detection: anystack.detection, marker: anystack.plugin.marker }]
        : [];

  const sorted = [...chosen].sort((a, b) => a.detection.stack.localeCompare(b.detection.stack));

  return {
    stacks: sorted.map((entry) => entry.detection.stack),
    detections: sorted.map((entry) => entry.detection),
    source: config?.use
      ? 'config:stack.use'
      : sorted.map((entry) => `marker:${entry.marker}`).join(','),
  };
}

/**
 * @purpose Pick the one primary stack every readiness/gate-plan consumer on a root must share
 *   (V-06b): node wins when detected (byte-identical node behavior), else the first detected
 *   stack, else `'node'` (every caller's pre-existing default).
 * @param detection Repo-wide stack detection (V-05).
 * @returns The stack id every phase/readiness/gate-plan consumer on this root must share.
 */
export function primaryStackOf(detection: RepoStackDetection): StackId {
  return detection.stacks.includes('node') ? 'node' : (detection.stacks[0] ?? 'node');
}
