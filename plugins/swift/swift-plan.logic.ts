// @file: Read-only Swift gate planning; Xcode workspace/scheme/destination stay config-owned.
// @consumers: swift-plugin, Swift preset
// @tasks: V-11

import type { EnvFailPredicate, Gate, GatePlanOptions } from 'gennady/stack';
import { exitCodeMatches, outputMatches } from 'gennady/stack';
import type { SwiftProject } from './swift-detect.logic.ts';
import type { SwiftScope } from './swift-scope.logic.ts';

export type SwiftGateId = 'format' | 'build' | 'test' | 'lint';
export const SWIFT_GATE_ORDER: readonly SwiftGateId[] = ['format', 'build', 'test', 'lint'];

const XCODE_ENV_FAIL: readonly EnvFailPredicate[] = [
  outputMatches(
    /Unable to find a de(?:vice|stination) matching|no available devices matched|Cannot find simulator/i,
    'Install/select the configured simulator runtime and retry the exact Xcode gate'
  ),
  outputMatches(
    /Could not resolve package dependencies|failed to download|Internet connection appears to be offline/i,
    'Restore access to the configured Swift package mirrors and retry'
  ),
  outputMatches(
    /Unable to open workspace|cannot be opened because it does not exist|does not contain a scheme named/i,
    'Regenerate the project-owned workspace/scheme before verification'
  ),
  outputMatches(
    /unable to attach DB|Provisioning profile/i,
    'Repair the selected Xcode environment/signing state; do not edit product code for this failure'
  ),
];

const SWIFTLINT_ENV_FAIL: readonly EnvFailPredicate[] = [
  exitCodeMatches(
    ['!=0', '!=2'],
    'swiftlint did not return its code-finding exit 2; repair the pinned SwiftLint environment'
  ),
];

function skipped(project: SwiftProject, id: SwiftGateId, reason: string): Gate {
  return {
    id,
    stack: 'swift',
    label: `Swift ${id}`,
    argv: [],
    cwd: project.root,
    timeoutMs: id === 'build' || id === 'test' ? 90 * 60_000 : 10 * 60_000,
    outputMeansFailure: false,
    envFail: id === 'build' || id === 'test' ? XCODE_ENV_FAIL : undefined,
    skipped: reason,
  };
}

/**
 * @purpose Plan read-only Swift gates; explicit config overrides own Xcode-specific argv.
 * @invariant Package.swift defaults are emitted only for a root Swift package. Xcode/Tuist build
 *   and test never guess workspace, scheme, destination, or DerivedData paths.
 * @param project Detected Swift project.
 * @param scope Resolved Swift source scope.
 * @param _options Config is applied by the shared config engine after planning.
 * @returns Canonical format/build/test/lint gates in stable order.
 */
export function planSwiftGates(
  project: SwiftProject,
  scope: SwiftScope,
  _options: GatePlanOptions
): Gate[] {
  const swift = project.tools.swift.bin;
  const swiftformat = project.tools.swiftformat.bin;
  const swiftlint = project.tools.swiftlint.bin;
  const files = scope.details.files;
  const formatTargets = scope.details.repoWide ? ['.'] : files;
  const emptyScope = formatTargets.length === 0;

  const format: Gate = emptyScope
    ? skipped(project, 'format', 'no Swift file or build-definition change is in scope')
    : swiftformat
      ? {
          id: 'format',
          stack: 'swift',
          label: 'swiftformat --lint',
          argv: [swiftformat, '--lint', ...formatTargets],
          cwd: project.root,
          timeoutMs: 10 * 60_000,
          outputMeansFailure: false,
          fixer: {
            argv: [swiftformat, ...formatTargets],
            cwd: project.root,
            timeoutMs: 10 * 60_000,
          },
          skipped: null,
        }
      : swiftlint
        ? {
            id: 'format',
            stack: 'swift',
            label: 'swiftlint lint --strict',
            argv: [swiftlint, 'lint', '--strict', ...files],
            cwd: project.root,
            timeoutMs: 10 * 60_000,
            outputMeansFailure: false,
            envFail: SWIFTLINT_ENV_FAIL,
            fixer: {
              argv: [swiftlint, '--fix', ...files],
              cwd: project.root,
              timeoutMs: 10 * 60_000,
            },
            skipped: null,
          }
        : skipped(
            project,
            'format',
            'swiftformat/swiftlint not found; configure stack.swift.overrideGates.format'
          );

  const build =
    project.kind === 'package' && swift
      ? {
          id: 'build' as const,
          stack: 'swift' as const,
          label: 'swift build',
          argv: [swift, 'build'],
          cwd: project.root,
          timeoutMs: 90 * 60_000,
          outputMeansFailure: false,
          envFail: XCODE_ENV_FAIL,
          skipped: null,
        }
      : skipped(
          project,
          'build',
          project.kind === 'package'
            ? 'swift toolchain not found in PATH'
            : 'Xcode/Tuist build argv is project-owned; configure stack.swift.overrideGates.build'
        );

  const test =
    project.kind === 'package' && swift
      ? {
          id: 'test' as const,
          stack: 'swift' as const,
          label: 'swift test',
          argv: [swift, 'test'],
          cwd: project.root,
          timeoutMs: 90 * 60_000,
          outputMeansFailure: false,
          envFail: XCODE_ENV_FAIL,
          skipped: null,
        }
      : skipped(
          project,
          'test',
          project.kind === 'package'
            ? 'swift toolchain not found in PATH'
            : 'Xcode/Tuist test argv is project-owned; configure stack.swift.overrideGates.test'
        );

  const lint: Gate = emptyScope
    ? skipped(project, 'lint', 'no Swift file or build-definition change is in scope')
    : swiftlint
      ? {
          id: 'lint',
          stack: 'swift',
          label: 'swiftlint lint --strict',
          argv: [swiftlint, 'lint', '--strict', ...files],
          cwd: project.root,
          timeoutMs: 10 * 60_000,
          outputMeansFailure: false,
          envFail: SWIFTLINT_ENV_FAIL,
          skipped: null,
        }
      : skipped(project, 'lint', 'swiftlint not found; optional unless configured');

  return [format, build, test, lint];
}
