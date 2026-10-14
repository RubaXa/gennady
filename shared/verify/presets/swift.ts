// @file: Swift preset — adapts the literal Swift plugin to phase ladders and receipt fingerprints.
// @spec: SHARED
// @consumers: presets/node, full-profile-plan, phase-receipt, readiness

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { swiftPlugin } from '../../../plugins/swift/swift-plugin.ts';
import {
  detectSwiftProject,
  discoverSwiftBuildDefinitions,
  probeSwiftToolchain,
} from '../../../plugins/swift/swift-detect.logic.ts';
import { applyStackConfig, gateInScope, pluginConfigOf } from '../stack-config.ts';
import type { Cmd, Gate, StackConfig } from '../verify.types.ts';
import type { StackPreset } from './node.ts';

const PHASE_GATES = ['fix', 'type-check', 'test'] as const;

const PHASE_GATE_IDS: Readonly<Record<string, string>> = {
  fix: 'format',
  'type-check': 'build',
  test: 'test',
  lint: 'lint',
};

function quoteToken(token: string): string {
  if (/^[A-Za-z0-9_.\-/:=]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

function renderCommand(root: string, command: Cmd): string {
  const environment = Object.entries(command.env ?? {});
  const invocation = [
    ...(environment.length > 0
      ? ['env', ...environment.map(([name, value]) => `${name}=${value}`)]
      : []),
    ...command.argv,
  ]
    .map(quoteToken)
    .join(' ');
  if (resolve(command.cwd) === resolve(root)) return invocation;
  const fromRoot = relative(resolve(root), resolve(command.cwd));
  const cwd = fromRoot.startsWith('..') ? resolve(command.cwd) : fromRoot || '.';
  return `cd ${quoteToken(cwd)} && ${invocation}`;
}

/**
 * @purpose Produce the literal configured Swift plugin plan for the whole repo or phase targets.
 * @param root Absolute repository root.
 * @param config Merged stack configuration.
 * @param [targets] Exact phase Target Files; empty is whole/full-profile scope, null is the
 *   readiness capability view that preserves scoped configured commands without executing them.
 * @returns Plugin-owned gates after the shared config transform.
 */
export function swiftPluginGates(
  root: string,
  config: StackConfig | null,
  targets: readonly string[] | null = []
): readonly Gate[] {
  const detection = swiftPlugin.detect(root);
  if (!detection) return [];
  const scope = swiftPlugin.verify.resolveScope(detection, {
    mode: targets !== null && targets.length > 0 ? 'files' : 'all',
    targets: targets ?? [],
  });
  const pluginConfig = pluginConfigOf(config, 'swift');
  const planned = swiftPlugin.verify.planGates(detection, scope, { pluginConfig });
  return applyStackConfig(planned, pluginConfig, 'swift', root, new Map(), undefined, targets);
}

function phaseCommand(
  root: string,
  config: StackConfig | null,
  name: string,
  targets: readonly string[]
): string | null {
  const gates = swiftPluginGates(root, config, targets);
  if (name === 'fix') {
    const command = gates.find((gate) => gate.id === 'format')?.fixer;
    return command ? renderCommand(root, command) : null;
  }
  const id = name === 'type-check' ? 'build' : name;
  const gate = gates.find((candidate) => candidate.id === id);
  return gate && gate.skipped === null ? renderCommand(root, gate) : null;
}

/**
 * @purpose Resolve Swift's phase ladder, literal full profile, and receipt source.
 * @param root Absolute repository root used by detection, scope, and commands.
 * @param [config] Merged stack config; Xcode/Tuist command argv remains project-owned here.
 * @returns Swift preset mapped to fix/build/test phase duties.
 */
export function resolveSwiftPreset(root: string, config: StackConfig | null = null): StackPreset {
  const pluginConfig = pluginConfigOf(config, 'swift');
  return {
    stack: 'swift',
    gateNames: (profile) =>
      profile === 'setup' ? [] : profile === 'full' ? swiftPlugin.gateIds : PHASE_GATES,
    requiredGateNames: (profile) =>
      profile === 'setup' ? [] : profile === 'full' ? ['format', 'build', 'test'] : PHASE_GATES,
    commandForGate: (name, _scripts, targets) => phaseCommand(root, config, name, targets),
    scopeReason: (name, targets) => {
      const gateId = PHASE_GATE_IDS[name];
      const when = gateId ? pluginConfig?.overrideGates?.[gateId]?.when : undefined;
      return when && !gateInScope(when, targets)
        ? `no Target File matches when: [${when.join(', ')}]`
        : null;
    },
    fullGates: () => swiftPluginGates(root, config),
    environmentStateSource: 'shared/verify/presets/swift.ts#swiftVerificationEnvironmentState',
  };
}

/**
 * @purpose Fingerprint D-SWIFT-ENV manifests/locks plus the selected toolchain versions.
 * @invariant Files are repo-relative and sorted; gate argv stays in planState, never this hash.
 * @param root Repository root.
 * @returns Stable sha256 state, or a fail-closed manifest/tool diagnostic.
 */
export function swiftVerificationEnvironmentState(
  root: string
): { ok: true; state: string } | { ok: false; issue: string } {
  try {
    const project = detectSwiftProject(root);
    if (!project) {
      return {
        ok: false,
        issue: 'cannot fingerprint Swift verification: no Swift/Xcode/Tuist marker was detected',
      };
    }
    const toolchain = probeSwiftToolchain(project);
    if (!toolchain.ok) {
      return {
        ok: false,
        issue: `cannot fingerprint Swift verification: ${toolchain.issues
          .map((issue) => `${issue.tool} ${issue.kind}: ${issue.detail}`)
          .join('; ')}`,
      };
    }

    const parts: (string | Buffer)[] = [
      'swift --version',
      toolchain.swiftVersion,
      'xcodebuild -version',
      toolchain.xcodebuildVersion,
    ];
    for (const relative of discoverSwiftBuildDefinitions(root)) {
      parts.push(relative, readFileSync(resolve(root, relative)));
    }
    const hash = createHash('sha256');
    for (const part of parts) {
      hash.update(part);
      hash.update('\0');
    }
    return { ok: true, state: `sha256:${hash.digest('hex')}` };
  } catch (cause) {
    return {
      ok: false,
      issue: `cannot fingerprint Swift verification environment: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    };
  }
}
