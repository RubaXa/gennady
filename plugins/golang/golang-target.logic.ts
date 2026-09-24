// @file: Go target VerifyPreset, config materialization and selected-slice readiness.
// @consumers: golang-plugin, golang-planner, UV-05 tests
// @spec: CLI-VERIFY

import path from 'node:path';
import { provenanceOf } from '../../services/config/config-loader.ts';
import type {
  DetectedVerifyConfigLayer,
  LegacyVerifyConfigAdapter,
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
import type { Requirement, VerifyStep } from '../../shared/verify/model/verify-step.type.ts';
import type { StackDetection } from '../../shared/verify/verify.types.ts';
import type { GoProject, GoToolId } from './golang-detect.logic.ts';
import { scopeHasGoGenerate } from './golang-plan.logic.ts';
import { moduleFlags, resolveGoScope, type GoScope } from './golang-scope.logic.ts';

type GoTargetStepId =
  | 'generate'
  | 'build'
  | 'vet'
  | 'lint-fix'
  | 'lint'
  | 'format-fix'
  | 'fmt'
  | 'test'
  | 'integration'
  | 'coverage';

const TIMEOUTS = {
  generate: 5 * 60_000,
  build: 5 * 60_000,
  vet: 5 * 60_000,
  'lint-fix': 5 * 60_000,
  lint: 5 * 60_000,
  'format-fix': 60_000,
  fmt: 60_000,
  test: 10 * 60_000,
  integration: 20 * 60_000,
  coverage: 20 * 60_000,
} as const;

function factsOf(detection: StackDetection): GoProject {
  return detection.details as GoProject;
}

function toolRequirement(stepId: GoTargetStepId, tool: GoToolId, project: GoProject): Requirement {
  const goVersion = project.modules[0]?.goVersion || '<go.mod-version>';
  const fix =
    tool === 'golangci-lint'
      ? `install a pinned compatible linter: go install github.com/golangci/golangci-lint/cmd/golangci-lint@<version-compatible-with-go-${goVersion}>`
      : `install the Go ${goVersion} toolchain from https://go.dev/dl/ so ${tool} is on PATH`;
  return {
    id: `golang:tool:${tool}:${stepId}`,
    kind: 'command',
    description: `${tool} is available for golang:${stepId}`,
    required: true,
    fix,
  };
}

function packagesRequirement(stepId: GoTargetStepId): Requirement {
  return {
    id: `golang:packages:${stepId}`,
    kind: 'config',
    description: `golang:${stepId} has at least one package in the selected scope`,
    required: true,
    fix: 'select an existing .go Target File or run the whole-repository scope',
  };
}

function formatTargetsRequirement(stepId: 'format-fix' | 'fmt', exact: boolean): Requirement {
  return {
    id: `golang:${exact ? 'exact-targets' : 'format-targets'}:${stepId}`,
    kind: 'config',
    description: exact
      ? 'golang:format-fix has explicit exact .go Target Files'
      : 'golang:fmt has at least one Go formatting target in scope',
    required: true,
    fix: exact
      ? 'provide explicit .go targetFiles; automatic scope materialization arrives in UV-07'
      : 'select an existing .go Target File or a repository containing Go source',
  };
}

function lintConfigRequirement(stepId: 'lint-fix' | 'lint', missing: string): Requirement {
  return {
    id: `golang:lint-config:${stepId}:${missing}`,
    kind: 'file',
    description: `golang:${stepId} referenced linter config ${JSON.stringify(missing)} exists`,
    required: true,
    fix: `restore ${missing} or remove the stale Makefile reference before running the linter`,
  };
}

function explicitCommandRequirement(stepId: 'integration' | 'coverage'): Requirement {
  return {
    id: `golang:command:${stepId}`,
    kind: 'config',
    description: `golang:${stepId} has an explicit project-owned argv contract`,
    required: true,
    fix: `set verify.presets.golang.steps.${stepId}.command.argv and .cwd; Go has no universal ${stepId} command`,
  };
}

function command(
  argv: readonly string[] | null,
  cwd: string,
  timeoutMs: number
): VerifyStep['command'] {
  return argv === null ? undefined : { argv, cwd, timeoutMs };
}

function step(
  id: GoTargetStepId,
  tags: readonly string[],
  needs: readonly GoTargetStepId[],
  effect: VerifyStep['effect'],
  argv: readonly string[] | null,
  project: GoProject,
  requires: readonly Requirement[],
  options: Pick<VerifyStep, 'writes' | 'invalidates'> = {}
): VerifyStep {
  return {
    id,
    plugin: 'golang',
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

function goArgv(project: GoProject, verb: string, scope: GoScope): readonly string[] | null {
  const go = project.tools.go.bin;
  if (go === null || scope.packages.length === 0) return null;
  return [go, verb, ...moduleFlags(project), ...scope.packages];
}

function lintArgv(project: GoProject, scope: GoScope, repair: boolean): readonly string[] | null {
  const linter = project.tools['golangci-lint'].bin;
  if (linter === null || scope.packages.length === 0) return null;
  return [
    linter,
    'run',
    ...(project.golangciConfig === null ? [] : ['-c', project.golangciConfig]),
    ...(repair ? ['--fix'] : []),
    ...scope.packages,
  ];
}

function goTestArgv(project: GoProject, scope: GoScope): readonly string[] | null {
  const go = project.tools.go.bin;
  if (go === null || scope.packages.length === 0) return null;
  return [go, 'test', '-timeout=540s', ...moduleFlags(project), ...scope.packages];
}

function packageWritePatterns(scope: GoScope): readonly string[] {
  const patterns = new Set<string>();
  for (const packagePattern of scope.packages) {
    if (packagePattern === './...') {
      patterns.add('**/*.go');
    } else if (packagePattern === '.') {
      patterns.add('*.go');
    } else {
      const relative = packagePattern.replace(/^\.\//, '');
      patterns.add(
        relative.endsWith('/...')
          ? `${relative.slice(0, -'/...'.length)}/**/*.go`
          : `${relative}/*.go`
      );
    }
  }
  return [...patterns].sort();
}

/**
 * @purpose Build one Go DAG; phase names select tags and dependency closure only.
 * @param detection Go plugin detection with immutable project facts.
 * @param [scope] Exact package/file scope; defaults to the whole repository for the target facet.
 * @returns Complete immutable Go target preset.
 */
export function createGolangVerifyPreset(
  detection: StackDetection,
  scope: GoScope = resolveGoScope(factsOf(detection), { mode: 'all', targets: [] })
): VerifyPreset {
  const project = factsOf(detection);
  const go = project.tools.go.bin;
  const gofmt = project.tools.gofmt.bin;
  const flags = moduleFlags(project);
  const packages = scope.packages;
  const hasGenerate = scopeHasGoGenerate(project, scope);
  const exactFormatTargets = scope.mode === 'files' ? scope.fmtTargets : [];
  const goRequirements = (id: GoTargetStepId) => [
    toolRequirement(id, 'go', project),
    packagesRequirement(id),
  ];
  const lintRequirements = (id: 'lint-fix' | 'lint') => [
    toolRequirement(id, 'golangci-lint', project),
    packagesRequirement(id),
    ...project.missingGolangciConfigs.map((missing) => lintConfigRequirement(id, missing)),
  ];
  const sourceWrites = {
    root: project.root,
    include: packageWritePatterns(scope),
    exclude: ['vendor/**', '**/testdata/**', 'node_modules/**'],
  } as const;
  const exactWrites = {
    root: project.root,
    include: exactFormatTargets,
    exclude: ['vendor/**', '**/testdata/**', 'node_modules/**'],
  } as const;

  return {
    plugin: 'golang',
    steps: [
      step(
        'generate',
        ['code'],
        [],
        'drift-signal',
        !hasGenerate || go === null || packages.length === 0
          ? null
          : [go, 'generate', ...flags, ...packages],
        project,
        hasGenerate ? goRequirements('generate') : []
      ),
      step(
        'build',
        ['code'],
        ['generate'],
        'observe',
        go === null || packages.length === 0
          ? null
          : [go, 'build', '-o', '/dev/null', ...flags, ...packages],
        project,
        [...goRequirements('build')]
      ),
      step('vet', ['code'], ['build'], 'observe', goArgv(project, 'vet', scope), project, [
        ...goRequirements('vet'),
      ]),
      step(
        'lint-fix',
        ['code'],
        ['vet'],
        'repair',
        lintArgv(project, scope, true),
        project,
        lintRequirements('lint-fix'),
        { writes: sourceWrites, invalidates: ['generate', 'build', 'vet'] }
      ),
      step(
        'lint',
        ['code'],
        ['lint-fix'],
        'observe',
        lintArgv(project, scope, false),
        project,
        lintRequirements('lint')
      ),
      step(
        'format-fix',
        ['code'],
        ['lint'],
        'repair',
        gofmt === null || exactFormatTargets.length === 0
          ? null
          : [gofmt, '-w', ...exactFormatTargets],
        project,
        [
          toolRequirement('format-fix', 'gofmt', project),
          formatTargetsRequirement('format-fix', true),
        ],
        { writes: exactWrites, invalidates: ['generate', 'build', 'vet', 'lint'] }
      ),
      step(
        'fmt',
        ['code'],
        ['format-fix'],
        'observe',
        gofmt === null || scope.fmtTargets.length === 0 ? null : [gofmt, '-l', ...scope.fmtTargets],
        project,
        [toolRequirement('fmt', 'gofmt', project), formatTargetsRequirement('fmt', false)]
      ),
      step('test', ['unit'], ['fmt'], 'observe', goTestArgv(project, scope), project, [
        ...goRequirements('test'),
      ]),
      step('integration', ['integration'], ['test'], 'observe', null, project, [
        explicitCommandRequirement('integration'),
      ]),
      step('coverage', ['coverage'], ['integration'], 'observe', null, project, [
        explicitCommandRequirement('coverage'),
      ]),
    ],
    phases: {
      code: { include: ['code'] },
      unit: { include: ['code', 'unit'] },
      integration: { include: ['code', 'unit', 'integration'] },
      coverage: { include: ['code', 'unit', 'integration', 'coverage'] },
      full: { include: ['code', 'unit', 'integration', 'coverage'] },
    },
    requirements: [
      {
        id: 'golang:go-mod',
        kind: 'file',
        description: 'root go.mod is present and detected',
        required: true,
        fix: 'add a root go.mod or select another detected stack plugin',
      },
    ],
    rules: [],
  };
}

/**
 * @purpose Attribute scope/tool-derived Go commands to detected facts before file overlays.
 * @param preset Scope-materialized Go target preset.
 * @param scope Scope that produced each direct argv and write boundary.
 * @returns Detected-facts overlay with leaf provenance.
 */
export function golangDetectedConfig(
  preset: VerifyPreset,
  scope: GoScope
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
        `verify.presets.golang.steps.${candidate.id}.command.argv`,
        `go-project:${scope.note}`
      );
      provenance.set(`verify.presets.golang.steps.${candidate.id}.command.cwd`, 'go-project:root');
    }
    if (candidate.writes !== undefined) {
      provenance.set(
        `verify.presets.golang.steps.${candidate.id}.writes.include`,
        `go-scope:${scope.note}`
      );
    }
  }
  return {
    source: 'golang:project-facts',
    config: { presets: { golang: { steps } } },
    provenance,
  };
}

function basename(value: string): string {
  return path.basename(value);
}

function safeFormatRepairPrefix(argv: readonly string[]): boolean {
  const switches = argv.slice(1);
  return (
    argv.length >= 2 &&
    basename(argv[0] ?? '') === 'gofmt' &&
    switches.every((token) => token === '-w' || token === '-s') &&
    switches.includes('-w')
  );
}

function safeLintRepairPrefix(argv: readonly string[]): boolean {
  if (basename(argv[0] ?? '') !== 'golangci-lint' || argv[1] !== 'run') return false;
  let sawFix = false;
  for (let index = 2; index < argv.length; index++) {
    const token = argv[index]!;
    if (token === '--fix') sawFix = true;
    if (token === '-c' || token === '--config') {
      if (argv[index + 1] === undefined || argv[index + 1]!.startsWith('-')) return false;
      index++;
      continue;
    }
    if (!token.startsWith('-')) return false;
  }
  return sawFix;
}

function unsafeDirectCommand(
  stepId: string,
  argv: readonly string[]
): { readonly message: string; readonly hint: string } | null {
  if (stepId === 'format-fix' && !safeFormatRepairPrefix(argv)) {
    return {
      message: 'golang:format-fix direct argv is not a target-free gofmt -w prefix',
      hint: 'use [gofmt, -w] with flags only; Verify appends exact .go Target Files',
    };
  }
  if (stepId === 'lint-fix' && !safeLintRepairPrefix(argv)) {
    return {
      message: 'golang:lint-fix direct argv is not a target-free golangci-lint run --fix prefix',
      hint: 'remove package operands; Verify appends the selected Go package patterns',
    };
  }
  if (stepId === 'fmt' && argv.includes('-w')) {
    return {
      message: 'golang:fmt direct argv mutates files',
      hint: 'use gofmt -l for the observe step and keep -w in golang:format-fix',
    };
  }
  if (stepId === 'lint' && argv.some((token) => token === '--fix' || token === '--fix-only')) {
    return {
      message: 'golang:lint direct argv mutates files',
      hint: 'move fix flags to golang:lint-fix and keep golang:lint read-only',
    };
  }
  return null;
}

/**
 * @purpose Make generic direct Go overrides honest about replaced tools and repair scope.
 * @param loaded Strict target config load before plugin-owned command materialization.
 * @param scope Exact package/file scope appended to safe repair prefixes.
 * @returns All-or-nothing materialized Go target config.
 */
export function materializeGolangVerifyConfig(
  loaded: VerifyConfigLoad,
  scope: GoScope
): VerifyConfigLoad {
  if (loaded.config === null || loaded.errors.length > 0) return loaded;
  const plugin = loaded.config.presets.golang;
  if (plugin === undefined) return loaded;
  const errors = [...loaded.errors];
  const provenance = new Map(loaded.provenance);
  const steps: Record<string, VerifyStepConfig> = {};
  for (const [stepId, authored] of Object.entries(plugin.steps)) {
    const { command: authoredCommand, ...rest } = authored;
    if (authoredCommand?.npmScript !== undefined) {
      const keyPath = `verify.presets.golang.steps.${stepId}.command.npmScript`;
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED',
          keyPath,
          'npmScript is owned by the Node plugin and cannot configure a Go step',
          'use command.argv and command.cwd for an explicit Go project command',
          provenanceOf(provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    const direct = authoredCommand?.argv;
    const unsafe = direct === undefined ? null : unsafeDirectCommand(stepId, direct);
    if (unsafe !== null) {
      const keyPath = `verify.presets.golang.steps.${stepId}.command.argv`;
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          unsafe.message,
          unsafe.hint,
          provenanceOf(provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    const exactFormatScope = scope.mode === 'files' && scope.fmtTargets.length > 0;
    const scopedArgv =
      direct === undefined
        ? undefined
        : stepId === 'format-fix'
          ? exactFormatScope
            ? [...direct, ...scope.fmtTargets]
            : undefined
          : stepId === 'lint-fix'
            ? scope.packages.length > 0
              ? [...direct, ...scope.packages]
              : undefined
            : direct;
    const intrinsic =
      direct === undefined
        ? undefined
        : stepId === 'format-fix'
          ? [formatTargetsRequirement('format-fix', true)]
          : stepId === 'lint-fix'
            ? [packagesRequirement('lint-fix')]
            : [];
    steps[stepId] = {
      ...rest,
      ...(authoredCommand === undefined || (direct !== undefined && scopedArgv === undefined)
        ? {}
        : {
            command: {
              ...authoredCommand,
              ...(scopedArgv === undefined ? {} : { argv: scopedArgv }),
            },
          }),
      ...(intrinsic === undefined
        ? {}
        : { requires: [...intrinsic, ...(authored.requires ?? [])] }),
    };
  }
  return {
    ...loaded,
    config:
      errors.length === 0 ? { presets: { ...loaded.config.presets, golang: { steps } } } : null,
    errors,
    provenance,
  };
}

/**
 * @purpose A lossless legacy direct argv replaces target tool readiness for that same gate.
 * @param adapter Lossless shared legacy translation.
 * @returns Translation whose direct Go argv no longer requires the replaced built-in tool.
 */
export function materializeLegacyGolangCommands(
  adapter: LegacyVerifyConfigAdapter
): LegacyVerifyConfigAdapter {
  if (adapter.config === null) return adapter;
  const plugin = adapter.config.presets.golang;
  if (plugin === undefined) return adapter;
  const steps: Record<string, VerifyStepConfig> = { ...plugin.steps };
  const provenance = new Map(adapter.provenance);
  const diagnostics = [...adapter.diagnostics];
  const fmt = steps['fmt'];
  if (fmt?.command?.argv !== undefined) {
    const targetPath = 'verify.presets.golang.steps.fmt.command.argv';
    const migration = diagnostics.find((candidate) => candidate.targetPath === targetPath);
    const error = new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      migration?.path ?? 'stack.golang.overrideGates.fmt.argv',
      'legacy golang fmt argv cannot be mapped losslessly to target format-fix plus read-only fmt',
      'remove the legacy fmt argv override and configure verify.presets.golang.steps.format-fix and .fmt explicitly',
      migration?.source ?? provenanceOf(provenance, targetPath)
    );
    return { ...adapter, config: null, errors: [...adapter.errors, error] };
  }

  const mirrorWaiver = (
    observeId: 'fmt' | 'lint',
    repairId: 'format-fix' | 'lint-fix',
    reason: string,
    sourceField: 'enabled' | 'command.argv'
  ): void => {
    steps[repairId] = {
      ...(steps[repairId] ?? {}),
      enabled: false,
      reason,
    };
    const observePath = `verify.presets.golang.steps.${observeId}.${sourceField}`;
    const repairPath = `verify.presets.golang.steps.${repairId}`;
    const source = provenanceOf(provenance, observePath) ?? 'legacy:stack config';
    provenance.set(`${repairPath}.enabled`, source);
    provenance.set(`${repairPath}.reason`, source);
    const migration = diagnostics.find((candidate) => candidate.targetPath === observePath);
    if (migration !== undefined) {
      diagnostics.push({
        path: migration.path,
        source: migration.source,
        targetPath: `${repairPath}.enabled`,
        message: `legacy ${observeId} semantics also require an explicit target waiver for ${repairId}`,
      });
    }
  };

  if (fmt?.enabled === false) {
    mirrorWaiver(
      'fmt',
      'format-fix',
      'legacy skipGates fmt also waives target format-fix; migrate both decisions explicitly',
      'enabled'
    );
  }
  const lint = steps['lint'];
  if (lint?.enabled === false) {
    mirrorWaiver(
      'lint',
      'lint-fix',
      'legacy skipGates lint also waives target lint-fix; migrate both decisions explicitly',
      'enabled'
    );
  } else if (lint?.command?.argv !== undefined) {
    mirrorWaiver(
      'lint',
      'lint-fix',
      'legacy lint argv overrides only the observe gate; target lint-fix is waived because no lossless repair mapping exists',
      'command.argv'
    );
  }

  for (const [stepId, config] of Object.entries(steps)) {
    if (config.command?.argv !== undefined) steps[stepId] = { ...config, requires: [] };
  }
  return {
    ...adapter,
    diagnostics,
    provenance,
    config: {
      presets: {
        ...adapter.config.presets,
        golang: {
          steps,
        },
      },
    },
  };
}

function readinessEntry(
  phase: string,
  requirement: Requirement,
  ready: boolean,
  message?: string
): VerifyReadiness {
  return {
    plugin: 'golang',
    phase,
    requirementId: requirement.id,
    status: ready ? 'READY' : requirement.required ? 'BLOCKED' : 'DEGRADED',
    message: message ?? (ready ? `${requirement.description}: ready` : requirement.description),
    ...(ready ? {} : { fix: requirement.fix }),
  };
}

/**
 * @purpose Evaluate only capabilities belonging to the selected non-waived Go slice.
 * @param detection Go project/tool facts.
 * @param preset Fully composed Go target preset.
 * @param plan Exact selected dependency-closed phase slice.
 * @param waivers Explicit disabled-step facts retained by the composer.
 * @returns Selected-slice readiness matrix.
 */
export function evaluateGolangReadiness(
  detection: StackDetection,
  preset: VerifyPreset,
  plan: VerifyPlan,
  waivers: readonly VerifyStepWaiver[]
): CapabilityMatrix {
  const project = factsOf(detection);
  const entries: VerifyReadiness[] = preset.requirements.map((requirement) =>
    readinessEntry(plan.phase, requirement, project.modules.length > 0)
  );
  const waiverByStep = new Map(waivers.map((waiver) => [waiver.stepId, waiver]));
  const stepById = new Map(preset.steps.map((candidate) => [`golang:${candidate.id}`, candidate]));
  for (const planned of plan.steps.filter((candidate) => candidate.plugin === 'golang')) {
    const waiver = waiverByStep.get(planned.id);
    if (waiver !== undefined) {
      entries.push({
        plugin: 'golang',
        phase: plan.phase,
        requirementId: `golang:waiver:${planned.id}`,
        status: 'WAIVED',
        message: `${planned.id} disabled by ${waiver.source}: ${waiver.reason}`,
      });
      continue;
    }
    const authored = stepById.get(planned.id);
    if (
      planned.id === 'golang:generate' &&
      authored !== undefined &&
      authored.command === undefined &&
      authored.requires.length === 0
    ) {
      entries.push({
        plugin: 'golang',
        phase: plan.phase,
        requirementId: 'golang:generate:not-applicable',
        status: 'READY',
        message: 'golang:generate is not applicable: no //go:generate directives in scope',
      });
    }
    for (const requirement of authored?.requires ?? []) {
      const parts = requirement.id.split(':');
      const tool = parts[1] === 'tool' ? (parts[2] as GoToolId) : null;
      const ready =
        tool !== null
          ? project.tools[tool].bin !== null
          : requirement.id.startsWith('golang:lint-config:')
            ? false
            : requirement.id.startsWith('golang:command:')
              ? authored?.command !== undefined
              : requirement.id.startsWith('golang:exact-targets:')
                ? (authored?.command?.argv.indexOf('-w') ?? -1) >= 0 &&
                  (authored?.command?.argv.length ?? 0) >
                    (authored?.command?.argv.indexOf('-w') ?? -1) + 1
                : requirement.id.startsWith('golang:packages:') ||
                    requirement.id.startsWith('golang:format-targets:')
                  ? authored?.command !== undefined
                  : false;
      entries.push(readinessEntry(plan.phase, requirement, ready));
    }
  }

  const status = entries.some((entry) => entry.status === 'BLOCKED')
    ? 'BLOCKED'
    : entries.some((entry) => entry.status === 'DEGRADED' || entry.status === 'WAIVED')
      ? 'DEGRADED'
      : 'READY';
  return { status, entries };
}
