// @file: Swift target VerifyPreset, project-owned Xcode identity, config and readiness.
// @consumers: swift-plugin, swift-planner, UV-06 tests
// @spec: CLI-VERIFY

import fs from 'node:fs';
import path from 'node:path';
import { provenanceOf } from '../../services/config/config-loader.ts';
import type {
  DetectedVerifyConfigLayer,
  LegacyVerifyConfigAdapter,
  VerifyCommandConfig,
  VerifyConfigLoad,
  VerifyStepConfig,
  VerifyStepWaiver,
} from '../../shared/verify/config/verify-config.type.ts';
import { VerifyConfigError } from '../../shared/verify/config/verify-config.error.ts';
import type { VerifyPreset } from '../../shared/verify/model/verify-preset.type.ts';
import type {
  CapabilityMatrix,
  VerifyReadiness,
} from '../../shared/verify/model/verify-readiness.type.ts';
import type { VerifyPlan } from '../../shared/verify/model/verify-report.type.ts';
import type {
  Requirement,
  VerifyEnvironmentFailureRule,
  VerifyStep,
} from '../../shared/verify/model/verify-step.type.ts';
import type {
  StackConfig,
  StackDetection,
  StackPluginConfig,
} from '../../shared/verify/verify.types.ts';
import type { SwiftProject, SwiftToolId } from './swift-detect.logic.ts';

type SwiftTargetStepId =
  | 'build'
  | 'format-fix'
  | 'format'
  | 'lint'
  | 'test'
  | 'integration'
  | 'coverage';

type SwiftXcodeIdentity = NonNullable<StackPluginConfig['xcode']>;

const TIMEOUTS: Readonly<Record<SwiftTargetStepId, number>> = {
  build: 90 * 60_000,
  'format-fix': 10 * 60_000,
  format: 10 * 60_000,
  lint: 10 * 60_000,
  test: 90 * 60_000,
  integration: 90 * 60_000,
  coverage: 90 * 60_000,
};

const XCODE_ENV_FAIL: readonly VerifyEnvironmentFailureRule[] = [
  {
    outputMatches:
      'Unable to find a de(?:vice|stination) matching|no available devices matched|Cannot find simulator',
    caseInsensitive: true,
    hint: 'install or select the configured simulator runtime and retry the exact Xcode step',
    source: 'builtin:swift',
  },
  {
    outputMatches:
      'Could not resolve package dependencies|failed to download|Internet connection appears to be offline',
    caseInsensitive: true,
    hint: 'restore access to the configured Swift package mirrors and retry',
    source: 'builtin:swift',
  },
  {
    outputMatches:
      'Unable to open workspace|cannot be opened because it does not exist|does not contain a scheme named',
    caseInsensitive: true,
    hint: 'regenerate the project-owned workspace or scheme before verification',
    source: 'builtin:swift',
  },
  {
    outputMatches: 'unable to attach DB|Provisioning profile',
    caseInsensitive: true,
    hint: 'repair the selected Xcode environment or signing state; do not edit product code',
    source: 'builtin:swift',
  },
];

const SWIFTLINT_ENV_FAIL: readonly VerifyEnvironmentFailureRule[] = [
  {
    exitCodeMatches: ['!=0', '!=2'],
    hint: 'swiftlint did not return its code-finding exit 2; repair the pinned SwiftLint environment',
    source: 'builtin:swift',
  },
];

function factsOf(detection: StackDetection): SwiftProject {
  return detection.details as SwiftProject;
}

function command(
  argv: readonly string[] | null,
  cwd: string,
  timeoutMs: number
): VerifyStep['command'] | undefined {
  return argv === null ? undefined : { argv, cwd, timeoutMs };
}

function toolRequirement(
  stepId: SwiftTargetStepId,
  tool: SwiftToolId,
  required = true
): Requirement {
  return {
    id: `swift:tool:${tool}:${stepId}`,
    kind: 'command',
    description: `${tool} is available for swift:${stepId}`,
    required,
    fix:
      tool === 'swiftformat' || tool === 'swiftlint'
        ? `install the project-pinned ${tool} version and expose it on PATH`
        : `install/select the project-pinned Apple Swift toolchain so ${tool} is on PATH`,
  };
}

function exactTargetsRequirement(stepId: 'format-fix' | 'format'): Requirement {
  return {
    id: `swift:exact-targets:${stepId}`,
    kind: 'file',
    description: `swift:${stepId} has exact normalized Swift Target Files`,
    required: true,
    fix: 'select existing non-symlink .swift Target Files; repository-wide repair is forbidden',
  };
}

function xcodeIdentityRequirement(stepId: 'build' | 'test'): Requirement {
  return {
    id: `swift:xcode-identity:${stepId}`,
    kind: 'config',
    description: `swift:${stepId} has project-owned workspace/project, scheme and destination`,
    required: true,
    fix: 'configure stack.swift.xcode with exactly one workspace/project plus scheme and destination',
  };
}

function explicitCommandRequirement(stepId: 'integration' | 'coverage'): Requirement {
  return {
    id: `swift:command:${stepId}`,
    kind: 'config',
    description: `swift:${stepId} has an explicit project-owned read-only command`,
    required: true,
    fix: `configure verify.presets.swift.steps.${stepId}.command; no universal Swift ${stepId} command is guessed`,
  };
}

function step(
  id: SwiftTargetStepId,
  tags: readonly string[],
  needs: readonly string[],
  effect: VerifyStep['effect'],
  argv: readonly string[] | null,
  project: SwiftProject,
  requires: readonly Requirement[],
  options: Pick<VerifyStep, 'writes' | 'invalidates' | 'outputMeansFailure' | 'envFail'> = {}
): VerifyStep {
  return {
    id,
    plugin: 'swift',
    tags,
    needs,
    executor: 'local',
    effect,
    ...(command(argv, project.root, TIMEOUTS[id]) === undefined
      ? {}
      : { command: command(argv, project.root, TIMEOUTS[id]) }),
    requires,
    ...options,
    timeoutMs: TIMEOUTS[id],
    onFailure: 'stop-phase',
  };
}

function formatter(project: SwiftProject): 'swiftformat' | 'swiftlint' | null {
  if (project.tools.swiftformat.bin !== null) return 'swiftformat';
  if (project.tools.swiftlint.bin !== null) return 'swiftlint';
  return null;
}

function formatArgv(
  project: SwiftProject,
  targets: readonly string[],
  repair: boolean
): readonly string[] | null {
  if (targets.length === 0) return null;
  const selected = formatter(project);
  if (selected === 'swiftformat') {
    return [project.tools.swiftformat.bin!, ...(repair ? [] : ['--lint']), ...targets];
  }
  if (selected === 'swiftlint') {
    return repair
      ? [project.tools.swiftlint.bin!, '--fix', ...targets]
      : [project.tools.swiftlint.bin!, 'lint', '--strict', ...targets];
  }
  return null;
}

/**
 * @purpose Build one Swift DAG without guessing Xcode identity or broad repair operands.
 * @param detection Swift plugin detection with immutable project facts.
 * @param [targetFiles] Exact normalized repo-relative Swift files eligible for repair.
 * @returns Complete immutable Swift target preset.
 */
export function createSwiftVerifyPreset(
  detection: StackDetection,
  targetFiles: readonly string[] = []
): VerifyPreset {
  const project = factsOf(detection);
  const swift = project.tools.swift.bin;
  const selectedFormatter = formatter(project);
  const formatterRequirements = (id: 'format-fix' | 'format') => [
    toolRequirement(id, selectedFormatter ?? 'swiftformat'),
    exactTargetsRequirement(id),
  ];
  const buildArgv = project.kind === 'package' && swift !== null ? [swift, 'build'] : null;
  const testArgv = project.kind === 'package' && swift !== null ? [swift, 'test'] : null;
  const buildRequirements =
    project.kind === 'package'
      ? [toolRequirement('build', 'swift')]
      : [toolRequirement('build', 'xcodebuild'), xcodeIdentityRequirement('build')];
  const testRequirements =
    project.kind === 'package'
      ? [toolRequirement('test', 'swift')]
      : [toolRequirement('test', 'xcodebuild'), xcodeIdentityRequirement('test')];
  const exactWrites = {
    root: project.root,
    include: [...targetFiles],
    exclude: ['.build/**', 'DerivedData/**', '**/*.xcresult/**'],
  } as const;

  return {
    plugin: 'swift',
    steps: [
      step('build', ['code'], [], 'observe', buildArgv, project, buildRequirements, {
        envFail: XCODE_ENV_FAIL,
      }),
      step(
        'format-fix',
        ['code'],
        ['build'],
        'repair',
        formatArgv(project, targetFiles, true),
        project,
        formatterRequirements('format-fix'),
        {
          writes: exactWrites,
          invalidates: ['build'],
          ...(selectedFormatter === 'swiftlint' ? { envFail: SWIFTLINT_ENV_FAIL } : {}),
        }
      ),
      step(
        'format',
        ['code'],
        ['format-fix'],
        'observe',
        formatArgv(project, targetFiles, false),
        project,
        formatterRequirements('format'),
        selectedFormatter === 'swiftlint' ? { envFail: SWIFTLINT_ENV_FAIL } : {}
      ),
      step(
        'lint',
        ['code'],
        ['format'],
        'observe',
        project.tools.swiftlint.bin === null || targetFiles.length === 0
          ? null
          : [project.tools.swiftlint.bin, 'lint', '--strict', ...targetFiles],
        project,
        [toolRequirement('lint', 'swiftlint', false)],
        { envFail: SWIFTLINT_ENV_FAIL }
      ),
      step('test', ['unit'], ['lint'], 'observe', testArgv, project, testRequirements, {
        envFail: XCODE_ENV_FAIL,
      }),
      step('integration', ['integration'], ['test'], 'observe', null, project, [
        explicitCommandRequirement('integration'),
      ]),
      step('coverage', ['coverage'], ['test'], 'observe', null, project, [
        explicitCommandRequirement('coverage'),
      ]),
    ],
    phases: {
      code: { include: ['code'] },
      unit: { include: ['code', 'unit'] },
      integration: { include: ['code', 'unit', 'integration'] },
      coverage: { include: ['code', 'unit', 'coverage'] },
      full: { include: ['code', 'unit', 'integration', 'coverage'] },
    },
    requirements: [
      {
        id: 'swift:project-marker',
        kind: 'file',
        description: 'a root SwiftPM or Xcode/Tuist project marker is present',
        required: true,
        fix: 'add a root Package.swift or checked-in Xcode/Tuist project definition',
      },
    ],
    rules: [],
  };
}

/**
 * @purpose Attribute tool/scope-derived Swift commands to detected facts before config overlays.
 * @param preset Scope-materialized Swift target preset.
 * @param targetFiles Exact Target Files that produced repair argv and write boundaries.
 * @returns Detected-facts overlay with leaf provenance.
 */
export function swiftDetectedConfig(
  preset: VerifyPreset,
  targetFiles: readonly string[]
): DetectedVerifyConfigLayer {
  const steps = Object.fromEntries(
    preset.steps.map((candidate) => [
      candidate.id,
      {
        ...(candidate.command === undefined ? {} : { command: candidate.command }),
        ...(candidate.writes === undefined ? {} : { writes: candidate.writes }),
      },
    ])
  );
  const provenance = new Map<string, string>();
  for (const candidate of preset.steps) {
    if (candidate.command !== undefined) {
      provenance.set(
        `verify.presets.swift.steps.${candidate.id}.command.argv`,
        'swift-project:detected-tools'
      );
      provenance.set(
        `verify.presets.swift.steps.${candidate.id}.command.cwd`,
        'swift-project:root'
      );
    }
    if (candidate.writes !== undefined) {
      provenance.set(
        `verify.presets.swift.steps.${candidate.id}.writes.include`,
        `swift-target-files:${targetFiles.length}`
      );
    }
  }
  return {
    source: 'swift:project-facts',
    config: { presets: { swift: { steps } } },
    provenance,
  };
}

function basename(value: string): string {
  return path.basename(value);
}

function safeFormatRepairPrefix(argv: readonly string[]): boolean {
  return (
    (argv.length === 1 && basename(argv[0] ?? '') === 'swiftformat') ||
    (argv.length === 2 && basename(argv[0] ?? '') === 'swiftlint' && argv[1] === '--fix')
  );
}

function mutates(argv: readonly string[]): boolean {
  return argv.some((token) => ['--fix', '--autocorrect', '--write', '-w'].includes(token));
}

/**
 * @purpose Make direct Swift overrides honest about Xcode ownership and exact repair scope.
 * @param loaded Strict target config load before plugin-owned command materialization.
 * @param project Detected Swift project and tool facts.
 * @param targetFiles Exact normalized Swift repair operands.
 * @returns All-or-nothing materialized Swift target config.
 */
export function materializeSwiftVerifyConfig(
  loaded: VerifyConfigLoad,
  project: SwiftProject,
  targetFiles: readonly string[]
): VerifyConfigLoad {
  if (loaded.config === null || loaded.errors.length > 0) return loaded;
  const plugin = loaded.config.presets.swift;
  if (plugin === undefined) return loaded;
  const errors = [...loaded.errors];
  const steps: Record<string, VerifyStepConfig> = {};
  for (const [stepId, authored] of Object.entries(plugin.steps)) {
    const { command: authoredCommand, ...rest } = authored;
    const direct = authoredCommand?.argv;
    const keyPath = `verify.presets.swift.steps.${stepId}.command.argv`;
    if (
      project.kind === 'xcode' &&
      (stepId === 'build' || stepId === 'test') &&
      authoredCommand !== undefined
    ) {
      const authoredPath = direct === undefined ? `${keyPath.slice(0, -'.argv'.length)}` : keyPath;
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED',
          authoredPath,
          `Xcode ${stepId} accepts project identity, not a target command override`,
          'configure stack.swift.xcode workspace/project, scheme and destination; legacy overrideGates remains compatibility-only',
          provenanceOf(loaded.provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    if (stepId === 'format-fix' && direct !== undefined && !safeFormatRepairPrefix(direct)) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          'swift:format-fix argv is not a target-free SwiftFormat/SwiftLint repair prefix',
          'use [swiftformat] or [swiftlint, --fix]; Verify appends exact .swift Target Files',
          provenanceOf(loaded.provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    if ((stepId === 'format' || stepId === 'lint') && direct !== undefined && mutates(direct)) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          `swift:${stepId} observe argv contains a mutation flag`,
          'move mutation to format-fix and keep observe commands read-only',
          provenanceOf(loaded.provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    const scopedRepair =
      stepId === 'format-fix' && direct !== undefined
        ? targetFiles.length > 0
          ? [...direct, ...targetFiles]
          : undefined
        : direct;
    const repairRequirements =
      stepId === 'format-fix' && direct !== undefined
        ? [
            toolRequirement(
              'format-fix',
              basename(direct[0] ?? '') === 'swiftlint' ? 'swiftlint' : 'swiftformat'
            ),
            exactTargetsRequirement('format-fix'),
            ...(authored.requires ?? []),
          ]
        : undefined;
    const xcodeRequirements =
      project.kind === 'xcode' && (stepId === 'build' || stepId === 'test')
        ? [
            toolRequirement(stepId, 'xcodebuild'),
            xcodeIdentityRequirement(stepId),
            ...(authored.requires ?? []),
          ]
        : undefined;
    steps[stepId] = {
      ...rest,
      ...(authoredCommand === undefined || (direct !== undefined && scopedRepair === undefined)
        ? {}
        : {
            command: {
              ...authoredCommand,
              ...(scopedRepair === undefined ? {} : { argv: scopedRepair }),
            },
          }),
      ...(repairRequirements === undefined ? {} : { requires: repairRequirements }),
      ...(xcodeRequirements === undefined ? {} : { requires: xcodeRequirements }),
    };
  }
  return {
    ...loaded,
    config:
      errors.length === 0
        ? { presets: { ...loaded.config.presets, swift: { ...plugin, steps } } }
        : null,
    errors,
  };
}

function relativeIdentityPath(root: string, value: string, keyPath: string): string {
  const normalizedRoot = path.resolve(root);
  const realRoot = fs.realpathSync(normalizedRoot);
  const absolute = path.resolve(normalizedRoot, value);
  const relative = path.relative(normalizedRoot, absolute);
  if (
    value !== value.trim() ||
    value.includes('\\') ||
    value.includes('\0') ||
    /[*?\[\]{}]/.test(value) ||
    value.endsWith('/') ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_INVALID_TYPE',
      keyPath,
      `Xcode identity path ${JSON.stringify(value)} is not repo-relative`,
      'use a workspace/project path contained by the repository root'
    );
  }

  let current = normalizedRoot;
  const segments = relative.split(path.sep);
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let metadata: fs.Stats;
    try {
      metadata = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Xcode identity path ${JSON.stringify(value)} traverses a symlink`,
        'use a checked-in workspace/project path whose repository-relative components are not symlinks'
      );
    }
    if (index < segments.length - 1 && !metadata.isDirectory()) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Xcode identity path ${JSON.stringify(value)} traverses a non-directory component`,
        'use a checked-in workspace/project directory contained by the repository root'
      );
    }
  }

  if (fs.existsSync(absolute)) {
    const resolved = fs.realpathSync(absolute);
    const realRelative = path.relative(realRoot, resolved);
    if (
      realRelative.length === 0 ||
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Xcode identity path ${JSON.stringify(value)} resolves outside the repository root`,
        'use a checked-in workspace/project path physically contained by the repository root'
      );
    }
  }
  return relative.split(path.sep).join('/');
}

function xcodeCommand(
  project: SwiftProject,
  identity: SwiftXcodeIdentity,
  verb: 'build' | 'test'
): (VerifyCommandConfig & { readonly argv: readonly string[]; readonly cwd: string }) | undefined {
  const kind = identity.workspace === undefined ? '-project' : '-workspace';
  const authoredPath = identity.workspace ?? identity.project!;
  const projectPath = relativeIdentityPath(
    project.root,
    authoredPath,
    `stack.swift.xcode.${kind.slice(1)}`
  );
  const executable = project.tools.xcodebuild.bin;
  if (executable === null) return undefined;
  return {
    argv: [
      executable,
      kind,
      projectPath,
      '-scheme',
      identity.scheme,
      '-destination',
      identity.destination,
      ...(verb === 'test' && identity.testPlan !== undefined
        ? ['-testPlan', identity.testPlan]
        : []),
      verb,
    ],
    cwd: project.root,
  };
}

/**
 * @purpose Preserve legacy gate compatibility and materialize approved stack.swift.xcode identity.
 * @param adapter Shared lossless legacy translation.
 * @param project Detected Swift project and tool facts.
 * @param stackConfig Validated stack config carrying optional Xcode identity.
 * @param stackProvenance Per-key legacy config provenance.
 * @returns Translation with compatibility commands and identity-derived Xcode commands.
 */
export function materializeLegacySwiftCommands(
  adapter: LegacyVerifyConfigAdapter,
  project: SwiftProject,
  stackConfig: StackConfig | null,
  stackProvenance: ReadonlyMap<string, string>
): LegacyVerifyConfigAdapter {
  if (adapter.config === null) return adapter;
  const plugin = adapter.config.presets.swift;
  const stackPlugin = stackConfig?.swift as StackPluginConfig | undefined;
  const identity = stackPlugin?.xcode;
  const steps: Record<string, VerifyStepConfig> = { ...(plugin?.steps ?? {}) };
  const provenance = new Map(adapter.provenance);
  const diagnostics = [...adapter.diagnostics];

  const format = steps['format'];
  if (format?.command?.argv !== undefined) {
    const migration = diagnostics.find(
      (candidate) => candidate.targetPath === 'verify.presets.swift.steps.format.command.argv'
    );
    return {
      ...adapter,
      config: null,
      errors: [
        ...adapter.errors,
        new VerifyConfigError(
          'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
          migration?.path ?? 'stack.swift.overrideGates.format.argv',
          'legacy Swift format argv cannot map losslessly to target repair plus observe steps',
          'configure verify.presets.swift.steps.format-fix and .format explicitly',
          migration?.source ?? 'stack config'
        ),
      ],
    };
  }
  if (format?.enabled === false) {
    const source =
      provenanceOf(provenance, 'verify.presets.swift.steps.format.enabled') ??
      'legacy:stack config';
    steps['format-fix'] = {
      ...(steps['format-fix'] ?? {}),
      enabled: false,
      reason:
        'legacy skipGates format also waives target format-fix; migrate both decisions explicitly',
    };
    provenance.set('verify.presets.swift.steps.format-fix.enabled', source);
    provenance.set('verify.presets.swift.steps.format-fix.reason', source);
    const migration = diagnostics.find(
      (candidate) => candidate.targetPath === 'verify.presets.swift.steps.format.enabled'
    );
    if (migration !== undefined) {
      diagnostics.push({
        path: migration.path,
        source: migration.source,
        targetPath: 'verify.presets.swift.steps.format-fix.enabled',
        message: 'legacy format skip also requires an explicit target format-fix waiver',
      });
    }
  }

  if (identity !== undefined) {
    if (project.kind !== 'xcode') {
      return {
        ...adapter,
        config: null,
        errors: [
          ...adapter.errors,
          new VerifyConfigError(
            'VERIFY_CONFIG_INVALID_TYPE',
            'stack.swift.xcode',
            'Xcode identity was configured for a root SwiftPM-only project',
            'remove stack.swift.xcode or add a checked-in Xcode/Tuist project marker'
          ),
        ],
      };
    }
    for (const stepId of ['build', 'test'] as const) {
      if (steps[stepId]?.command?.argv !== undefined) {
        return {
          ...adapter,
          config: null,
          errors: [
            ...adapter.errors,
            new VerifyConfigError(
              'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
              `stack.swift.overrideGates.${stepId}.argv`,
              `both stack.swift.xcode and legacy ${stepId} argv are configured`,
              `remove overrideGates.${stepId}; project identity owns target Xcode argv`
            ),
          ],
        };
      }
      const materialized = xcodeCommand(project, identity, stepId);
      const existing = steps[stepId]?.command;
      const contextualized =
        materialized === undefined
          ? undefined
          : (() => {
              const cwd = existing?.cwd ?? materialized.cwd;
              const argv = [...materialized.argv];
              const identityIndex = argv.findIndex(
                (value) => value === '-workspace' || value === '-project'
              );
              if (existing?.cwd !== undefined && identityIndex >= 0) {
                argv[identityIndex + 1] = path
                  .relative(cwd, path.resolve(project.root, argv[identityIndex + 1]!))
                  .split(path.sep)
                  .join('/');
              }
              return {
                ...materialized,
                argv,
                cwd,
                ...(existing?.env === undefined ? {} : { env: existing.env }),
              };
            })();
      steps[stepId] = {
        ...(steps[stepId] ?? {}),
        ...(contextualized === undefined ? {} : { command: contextualized }),
      };
      if (materialized !== undefined) {
        const identityPath = identity.workspace === undefined ? 'project' : 'workspace';
        const source =
          provenanceOf(stackProvenance, `swift.xcode.${identityPath}`) ?? 'stack config';
        provenance.set(`verify.presets.swift.steps.${stepId}.command.argv`, source);
        if (existing?.cwd === undefined) {
          provenance.set(`verify.presets.swift.steps.${stepId}.command.cwd`, source);
        }
      }
    }
  }

  for (const [stepId, config] of Object.entries(steps)) {
    if (
      config.command?.argv !== undefined &&
      (identity === undefined || (stepId !== 'build' && stepId !== 'test'))
    ) {
      steps[stepId] = {
        ...config,
        command: { ...config.command, cwd: config.command.cwd ?? project.root },
        requires: [],
      };
    }
  }
  return {
    ...adapter,
    diagnostics,
    provenance,
    config: {
      presets: {
        ...adapter.config.presets,
        ...(Object.keys(steps).length === 0 ? {} : { swift: { steps } }),
      },
    },
  };
}

function readinessEntry(
  phase: string,
  requirement: Requirement,
  ready: boolean,
  message?: string,
  stepId?: `${string}:${string}`,
  disposition?: VerifyReadiness['disposition']
): VerifyReadiness {
  return {
    plugin: 'swift',
    phase,
    requirementId: requirement.id,
    ...(stepId === undefined ? {} : { stepId }),
    ...(disposition === undefined ? {} : { disposition }),
    status: ready ? 'READY' : requirement.required ? 'BLOCKED' : 'DEGRADED',
    message: message ?? (ready ? `${requirement.description}: ready` : requirement.description),
    ...(ready ? {} : { fix: requirement.fix }),
  };
}

function xcodeIdentityReady(step: VerifyStep | undefined): boolean {
  const argv = step?.command?.argv;
  if (argv === undefined) return false;
  const flagIndex = argv.findIndex((value) => value === '-workspace' || value === '-project');
  if (flagIndex < 0 || argv[flagIndex + 1] === undefined || step?.command === undefined)
    return false;
  try {
    const metadata = fs.lstatSync(path.resolve(step.command.cwd, argv[flagIndex + 1]!));
    return metadata.isDirectory() && !metadata.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * @purpose Evaluate only capabilities belonging to the selected non-waived Swift slice.
 * @param detection Swift project/tool facts.
 * @param preset Fully composed Swift target preset.
 * @param plan Exact selected dependency-closed phase slice.
 * @param waivers Explicit disabled-step facts retained by the composer.
 * @returns Selected-slice readiness matrix.
 */
export function evaluateSwiftReadiness(
  detection: StackDetection,
  preset: VerifyPreset,
  plan: VerifyPlan,
  waivers: readonly VerifyStepWaiver[]
): CapabilityMatrix {
  const project = factsOf(detection);
  const entries: VerifyReadiness[] = preset.requirements.map((requirement) =>
    readinessEntry(plan.phase, requirement, project.markers.length > 0)
  );
  const waiverByStep = new Map(waivers.map((waiver) => [waiver.stepId, waiver]));
  const stepById = new Map(preset.steps.map((candidate) => [`swift:${candidate.id}`, candidate]));
  for (const planned of plan.steps.filter((candidate) => candidate.plugin === 'swift')) {
    const waiver = waiverByStep.get(planned.id);
    if (waiver !== undefined) {
      entries.push({
        plugin: 'swift',
        phase: plan.phase,
        requirementId: `swift:waiver:${planned.id}`,
        stepId: planned.id,
        disposition: 'waived',
        status: 'WAIVED',
        message: `${planned.id} disabled by ${waiver.source}: ${waiver.reason}`,
        blocking: false,
        policyReason: waiver.reason,
        policySource: waiver.source,
      });
      continue;
    }
    const authored = stepById.get(planned.id);
    for (const requirement of authored?.requires ?? []) {
      const parts = requirement.id.split(':');
      const tool = parts[1] === 'tool' ? (parts[2] as SwiftToolId) : null;
      const ready =
        tool !== null
          ? project.tools[tool].bin !== null
          : requirement.id === 'swift:exact-targets:format-fix'
            ? (authored?.writes?.include.length ?? 0) > 0 && authored?.command !== undefined
            : requirement.id === 'swift:exact-targets:format'
              ? authored?.command !== undefined
              : requirement.id.startsWith('swift:xcode-identity:')
                ? xcodeIdentityReady(authored)
                : requirement.id.startsWith('swift:command:')
                  ? authored?.command !== undefined
                  : false;
      entries.push(
        readinessEntry(
          plan.phase,
          requirement,
          ready,
          undefined,
          planned.id,
          !ready && !requirement.required && authored?.command === undefined
            ? 'optional-unavailable'
            : undefined
        )
      );
    }
  }
  const status = entries.some((entry) => entry.status === 'BLOCKED')
    ? 'BLOCKED'
    : entries.some((entry) => entry.status === 'DEGRADED' || entry.status === 'WAIVED')
      ? 'DEGRADED'
      : 'READY';
  return { status, entries };
}
