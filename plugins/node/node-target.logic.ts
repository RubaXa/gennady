// @file: Node target VerifyPreset, config materialization, phase planning and readiness.
// @consumers: node-plugin, unified multistack planner
// @spec: CLI-VERIFY

import { provenanceOf } from '../../services/config/config-loader.ts';
import { VerifyConfigError } from '../../shared/verify/config/verify-config.error.ts';
import type {
  VerifyConfigLoad,
  VerifyStepConfig,
} from '../../shared/verify/config/verify-config.type.ts';
import type { StackDetection } from '../../shared/verify/verify.types.ts';
import {
  BUILTIN_SDD_KIND_SELECTORS,
  type VerifyPreset,
} from '../../shared/verify/model/verify-preset.type.ts';
import type {
  CapabilityMatrix,
  VerifyReadiness,
} from '../../shared/verify/model/verify-readiness.type.ts';
import { verifyPlanPolicyReadiness } from '../../shared/verify/test-stats.ts';
import type { Requirement, VerifyStep } from '../../shared/verify/model/verify-step.type.ts';
import type { VerifyPlan } from '../../shared/verify/model/verify-report.type.ts';
import { createRemoteCiStep, REMOTE_CI_SELECTOR } from '../../shared/verify/model/remote-step.ts';
import type {
  DetectedVerifyConfigLayer,
  VerifyStepWaiver,
} from '../../shared/verify/config/verify-config.type.ts';
import { nodeScriptArgv, type NodeProjectFacts } from './node-project.logic.ts';
import {
  nodeArgvInvokesGennadyLint,
  nodeArgvIsReadOnly,
  nodeArgvIsReadOnlyFormat,
  nodeGennadyLintRepairTargets,
  nodeRepairArgvIsSafePrefix,
  nodeRepairIsArgumentForwarding,
  nodeScriptIsReadOnly,
  nodeScriptReachesGennady,
} from './node-script.logic.ts';

const STEP_SCRIPTS = {
  'type-check': 'type-check',
  'lint-fix': 'lint:fix',
  lint: 'lint',
  'format-fix': 'format:fix',
  format: 'format',
  unit: 'test',
  integration: 'test:integration',
  coverage: 'test:coverage',
} as const;

type NodeStepId = keyof typeof STEP_SCRIPTS;

function nodeRepairTargets(
  facts: NodeProjectFacts,
  stepId: NodeStepId,
  script: string,
  targetFiles: readonly string[]
): readonly string[] {
  if (stepId !== 'lint-fix' || !nodeScriptReachesGennady(facts.scripts, script)) {
    return targetFiles;
  }
  const typescriptTargets = targetFiles.filter((file) => /\.tsx?$/i.test(file));
  return (
    nodeGennadyLintRepairTargets(facts.scripts, STEP_SCRIPTS.lint, typescriptTargets) ??
    typescriptTargets
  );
}

function factsOf(detection: StackDetection): NodeProjectFacts {
  return detection.details as NodeProjectFacts;
}

function packageScriptRequirement(stepId: NodeStepId, script: string): Requirement {
  return {
    id: `node:script:${script}`,
    kind: 'script',
    description: `package.json declares the exact script "${script}" for node:${stepId}`,
    required: true,
    fix: `add ${JSON.stringify({ scripts: { [script]: '<command>' } })} to package.json or override node:${stepId} with command.argv`,
  };
}

function repairScopeRequirement(stepId: NodeStepId, source: string): Requirement {
  return {
    id: `node:repair-scope:${source}`,
    kind: 'config',
    description: `node:${stepId} has explicit Target Files appended after --`,
    required: true,
    fix: 'select at least one existing Node source file, or disable/override this repair step for the phase',
  };
}

function scriptRequirements(
  facts: NodeProjectFacts,
  stepId: NodeStepId,
  script: string
): readonly Requirement[] {
  const requirements: Requirement[] = [packageScriptRequirement(stepId, script)];
  if (stepId === 'lint') {
    requirements.push(
      {
        id: `node:lint-reaches-gennady:${script}`,
        kind: 'config',
        description: `the "${script}" script reaches the Gennady contract linter`,
        required: true,
        fix: `make package.json script "${script}" invoke gennady lint directly or through an exact package-script hop`,
      },
      {
        id: `node:read-only:${script}`,
        kind: 'config',
        description: `the "${script}" script is read-only`,
        required: true,
        fix: `move write flags to "lint:fix" and keep "${script}" read-only`,
      }
    );
  }
  if (stepId === 'format') {
    requirements.push({
      id: `node:read-only:${script}`,
      kind: 'config',
      description: `the "${script}" script is read-only`,
      required: true,
      fix: `move write flags to "format:fix" and keep "${script}" read-only`,
    });
  }
  if (stepId === 'lint-fix' || stepId === 'format-fix') {
    requirements.push(
      {
        id: `node:repair-prefix:${script}`,
        kind: 'config',
        description: `the "${script}" repair script is an argument-forwarding command prefix`,
        required: true,
        fix: `make "${script}" end in its write flag without a baked target; Verify appends -- <Target Files>`,
      },
      repairScopeRequirement(stepId, script)
    );
  }
  if (stepId === 'lint-fix' && nodeScriptReachesGennady(facts.scripts, script)) {
    requirements.push({
      id: `node:lint-source-policy:${STEP_SCRIPTS.lint}`,
      kind: 'config',
      description: `the read-only "${STEP_SCRIPTS.lint}" script declares an exact Gennady lint source scope`,
      required: true,
      fix: `use repo-relative file/directory operands in the reachable gennady lint command; Verify applies that same source policy to lint repair`,
    });
  }
  return requirements;
}

function directCommandSafety(
  stepId: NodeStepId,
  argv: readonly string[]
): { readonly message: string; readonly hint: string } | null {
  if (stepId === 'lint-fix' || stepId === 'format-fix') {
    return nodeRepairArgvIsSafePrefix(argv)
      ? null
      : {
          message: `node:${stepId} direct argv is not a target-free repair prefix`,
          hint: 'remove operands and end the prefix in --fix, --write, or --autofix; Verify appends -- <Target Files>',
        };
  }
  if (stepId === 'lint') {
    if (!nodeArgvIsReadOnly(argv)) {
      return {
        message: 'node:lint direct argv contains a mutating switch',
        hint: 'move --fix/--write/--autofix to a repair step and keep lint read-only',
      };
    }
    if (!nodeArgvInvokesGennadyLint(argv)) {
      return {
        message: 'node:lint direct argv does not invoke the Gennady contract linter',
        hint: 'invoke gennady lint directly, or keep package-script resolution for checked script hops',
      };
    }
  }
  if (stepId === 'format' && !nodeArgvIsReadOnlyFormat(argv)) {
    return {
      message: 'node:format direct argv is not a proven read-only formatter check',
      hint: 'use prettier --check ... and keep --write in node:format-fix, or retain the checked package script',
    };
  }
  return null;
}

function step(
  facts: NodeProjectFacts,
  id: NodeStepId,
  tags: readonly string[],
  needs: readonly NodeStepId[],
  effect: VerifyStep['effect'],
  options: Pick<VerifyStep, 'writes' | 'invalidates'> = {}
): VerifyStep {
  const script = STEP_SCRIPTS[id];
  const repair = id === 'lint-fix' || id === 'format-fix';
  const commandReady =
    facts.packageManager.supported &&
    (!repair || nodeRepairIsArgumentForwarding(facts.scripts, script));
  const testStep = id === 'unit' || id === 'integration';
  const scriptBody = facts.scripts[script] ?? '';
  const nodeTestProtocol = /(^|\s)--test(?=\s|$)/.test(scriptBody);
  const gennadyTopologyProtocol =
    scriptBody.trim() === 'node --import tsx scripts/test-topology.ts deterministic';
  const vitestProtocol =
    facts.packageNames.includes('vitest') &&
    (scriptBody.trim() === 'vitest' || scriptBody.trim() === 'vitest run');
  return {
    id,
    plugin: 'node',
    tags,
    needs,
    executor: 'local',
    effect,
    ...(commandReady
      ? {
          command: {
            argv: [
              ...nodeScriptArgv(facts, script),
              ...(testStep && vitestProtocol ? ['--', '--reporter=json'] : []),
            ],
            cwd: facts.root,
            timeoutMs: id === 'integration' || id === 'coverage' ? 20 * 60_000 : 10 * 60_000,
          },
        }
      : {}),
    requires: scriptRequirements(facts, id, script),
    ...(testStep
      ? {
          testStats: {
            policy: 'required' as const,
            ...(gennadyTopologyProtocol
              ? {
                  protocol: 'gennady-test-topology-v1' as const,
                  runner: 'gennady-test-topology' as const,
                }
              : nodeTestProtocol
                ? { protocol: 'node-test-summary-v1' as const, runner: 'node:test' as const }
                : vitestProtocol
                  ? { protocol: 'vitest-json-v1' as const, runner: 'vitest' as const }
                  : {}),
            source: gennadyTopologyProtocol
              ? 'detected:package.json#scripts.test+scripts/test-topology.ts'
              : vitestProtocol
                ? `detected:${facts.packageSources['vitest']}`
                : `builtin:node.steps.${id}.testStats`,
          },
        }
      : {}),
    ...options,
    timeoutMs: id === 'integration' || id === 'coverage' ? 20 * 60_000 : 10 * 60_000,
    onFailure: 'stop-phase',
  };
}

/** @purpose Build the complete Node DAG once; phases only select tags and dependency closure. | @param detection Node detection carrying package facts. | @returns Complete immutable Node target preset. */
export function createNodeVerifyPreset(detection: StackDetection): VerifyPreset {
  const facts = factsOf(detection);
  const sourceWrites = {
    root: facts.root,
    include: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
    exclude: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  } as const;
  const formatWrites = {
    root: facts.root,
    include: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,json,jsonc,md,mdx,yaml,yml,css,scss,html}'],
    exclude: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  } as const;
  return {
    plugin: 'node',
    steps: [
      step(facts, 'type-check', ['code'], [], 'observe'),
      step(facts, 'lint-fix', ['code'], ['type-check'], 'repair', {
        writes: sourceWrites,
        invalidates: ['type-check'],
      }),
      step(facts, 'lint', ['code'], ['lint-fix'], 'observe'),
      step(facts, 'format-fix', ['code'], ['lint'], 'repair', {
        writes: formatWrites,
        invalidates: ['type-check', 'lint'],
      }),
      step(facts, 'format', ['code'], ['format-fix'], 'observe'),
      step(facts, 'unit', ['unit'], ['format'], 'observe'),
      step(facts, 'integration', ['integration'], ['unit'], 'observe'),
      step(facts, 'coverage', ['coverage'], ['unit'], 'observe'),
      createRemoteCiStep('node'),
    ],
    phases: {
      code: { include: ['code'] },
      unit: { include: ['code', 'unit'] },
      integration: { include: ['code', 'unit', 'integration'] },
      coverage: { include: ['code', 'unit', 'coverage'] },
      full: { include: ['code', 'unit', 'integration', 'coverage'] },
      ci: REMOTE_CI_SELECTOR,
    },
    sddKinds: BUILTIN_SDD_KIND_SELECTORS,
    requirements: [
      {
        id: 'node:package-json',
        kind: 'config',
        description: 'root package.json is parseable',
        required: true,
        fix: 'repair package.json before running Node verification',
      },
      {
        id: 'node:package-manager',
        kind: 'runtime',
        description: 'detected package manager has a supported argv adapter',
        required: true,
        fix: 'use npm, pnpm, yarn, or bun, or provide an explicit command.argv override',
      },
    ],
    rules: [],
  };
}

/** @purpose Express package-manager/script commands as the detected-facts overlay layer. | @param preset Node target preset. | @param facts Detected package facts. | @param [targetFiles] Explicit scope appended only to repair commands. | @returns Deterministic detected-facts config layer with provenance. */
export function nodeDetectedConfig(
  preset: VerifyPreset,
  facts: NodeProjectFacts,
  targetFiles: readonly string[] = []
): DetectedVerifyConfigLayer {
  const steps = Object.fromEntries(
    preset.steps.map((candidate) => {
      if (candidate.command === undefined) return [candidate.id, {}];
      const id = candidate.id as NodeStepId;
      const script = STEP_SCRIPTS[id];
      const repairTargets = nodeRepairTargets(facts, id, script, targetFiles);
      if (candidate.effect === 'repair' && targetFiles.length > 0 && repairTargets.length === 0) {
        return [
          candidate.id,
          {
            enabled: false,
            reason: 'no applicable .ts/.tsx Target Files for the Gennady contract repair',
          },
        ];
      }
      return [
        candidate.id,
        {
          command: {
            argv:
              candidate.effect === 'repair' && repairTargets.length > 0
                ? [...candidate.command.argv, '--', ...repairTargets]
                : candidate.command.argv,
            cwd: facts.root,
          },
          ...(candidate.effect === 'repair' && repairTargets.length > 0
            ? {
                writes: {
                  root: facts.root,
                  include: repairTargets,
                  exclude: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
                },
              }
            : {}),
          ...(candidate.testStats === undefined ? {} : { testStats: candidate.testStats }),
        },
      ];
    })
  );
  const provenance = new Map<string, string>();
  for (const candidate of preset.steps) {
    if (candidate.command === undefined) continue;
    const script = STEP_SCRIPTS[candidate.id as NodeStepId];
    provenance.set(
      `verify.presets.node.steps.${candidate.id}.command.argv`,
      `${facts.packageManager.source}+package.json#scripts.${script}`
    );
    provenance.set(`verify.presets.node.steps.${candidate.id}.command.cwd`, 'package.json#root');
    if (candidate.testStats !== undefined) {
      provenance.set(
        `verify.presets.node.steps.${candidate.id}.testStats`,
        candidate.testStats.source
      );
    }
  }
  return {
    source: 'node:package-facts',
    config: { presets: { node: { steps } } },
    provenance,
  };
}

/** @purpose Resolve Node-owned npmScript shorthands before the generic composer sees them. | @param loaded Strict target config load. | @param facts Detected package-manager facts. | @param [targetFiles] Explicit scope appended to repair shorthand. | @returns All-or-nothing materialized target config load. */
export function materializeNodeVerifyConfig(
  loaded: VerifyConfigLoad,
  facts: NodeProjectFacts,
  targetFiles: readonly string[] = []
): VerifyConfigLoad {
  if (loaded.config === null || loaded.errors.length > 0) return loaded;
  const plugin = loaded.config.presets.node;
  if (plugin === undefined) return loaded;
  const errors = [...loaded.errors];
  const provenance = new Map(loaded.provenance);
  const steps: Record<string, VerifyStepConfig> = {};
  for (const [stepId, authored] of Object.entries(plugin.steps)) {
    const id = stepId as NodeStepId;
    const { command, ...authoredWithoutCommand } = authored;
    if (command?.npmScript !== undefined && command.argv !== undefined) {
      const keyPath = `verify.presets.node.steps.${stepId}.command`;
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          'npmScript and argv are mutually exclusive command selectors',
          'keep npmScript for package-manager resolution or argv for a generic direct command',
          provenanceOf(provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    if (command?.argv !== undefined) {
      const unsafe = directCommandSafety(id, command.argv);
      if (unsafe !== null) {
        const keyPath = `verify.presets.node.steps.${stepId}.command.argv`;
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
    }
    const selectedScript = command?.npmScript ?? STEP_SCRIPTS[id];
    const repairTargets =
      selectedScript === undefined
        ? targetFiles
        : nodeRepairTargets(facts, id, selectedScript, targetFiles);
    const directArgv = command?.argv !== undefined;
    const intrinsic = directArgv
      ? id === 'lint-fix' || id === 'format-fix'
        ? [repairScopeRequirement(id, 'command.argv')]
        : []
      : selectedScript === undefined
        ? []
        : scriptRequirements(facts, id, selectedScript);
    const shouldWriteRequirements =
      command?.npmScript !== undefined || directArgv || authored.requires !== undefined;
    const repairScriptSafe =
      id !== 'lint-fix' && id !== 'format-fix'
        ? true
        : selectedScript !== undefined &&
          nodeRepairIsArgumentForwarding(facts.scripts, selectedScript);
    if (command?.npmScript !== undefined && facts.packageManager.supported && !repairScriptSafe) {
      const keyPath = `verify.presets.node.steps.${stepId}.command.npmScript`;
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          `script "${command.npmScript}" is not a target-free repair prefix`,
          'remove operands and end the script in --fix, --write, or --autofix; Verify appends -- <Target Files>',
          provenanceOf(provenance, keyPath.replace(/^verify\./, ''))
        )
      );
      continue;
    }
    const materializedArgv =
      command?.npmScript === undefined || !facts.packageManager.supported || !repairScriptSafe
        ? undefined
        : [
            ...nodeScriptArgv(facts, command.npmScript),
            ...((id === 'lint-fix' || id === 'format-fix') && repairTargets.length > 0
              ? ['--', ...repairTargets]
              : []),
          ];
    const materializedDirectArgv =
      command?.argv !== undefined &&
      (id === 'lint-fix' || id === 'format-fix') &&
      repairTargets.length > 0
        ? [...command.argv, '--', ...repairTargets]
        : command?.argv;
    const nextCommand =
      command?.npmScript === undefined
        ? command === undefined
          ? undefined
          : materializedDirectArgv === undefined
            ? command
            : { ...command, argv: materializedDirectArgv }
        : materializedArgv === undefined
          ? undefined
          : {
              argv: materializedArgv,
              ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
              ...(command.env === undefined ? {} : { env: command.env }),
            };
    steps[stepId] = {
      ...authoredWithoutCommand,
      ...(nextCommand === undefined ? {} : { command: nextCommand }),
      ...(shouldWriteRequirements
        ? { requires: [...intrinsic, ...(authored.requires ?? [])] }
        : {}),
    };
    if (command?.npmScript !== undefined) {
      const relative = `presets.node.steps.${stepId}.command.npmScript`;
      const source = provenanceOf(provenance, relative) ?? loaded.sources[0] ?? 'verify config';
      if (materializedArgv !== undefined) {
        provenance.set(`presets.node.steps.${stepId}.command.argv`, source);
      }
      provenance.set(`presets.node.steps.${stepId}.requires`, source);
    }
  }
  return {
    ...loaded,
    config:
      errors.length === 0
        ? {
            ...loaded.config,
            presets: {
              ...loaded.config.presets,
              node: { ...plugin, steps },
            },
          }
        : null,
    errors,
    provenance,
  };
}

function readinessEntry(
  phase: string,
  requirement: Requirement,
  status: VerifyReadiness['status'],
  message: string,
  stepId?: `${string}:${string}`,
  disposition?: VerifyReadiness['disposition']
): VerifyReadiness {
  return {
    plugin: 'node',
    phase,
    requirementId: requirement.id,
    ...(stepId === undefined ? {} : { stepId }),
    ...(disposition === undefined ? {} : { disposition }),
    status,
    message,
    ...(status === 'READY' ? {} : { fix: requirement.fix }),
  };
}

/** @purpose Evaluate only the exact scripts and contracts in the selected Node slice. | @param detection Node detection carrying package facts. | @param preset Composed Node preset. | @param plan Selected Node phase slice. | @param waivers Explicit disabled-step facts. | @returns Selected-slice readiness matrix. */
export function evaluateNodeReadiness(
  detection: StackDetection,
  preset: VerifyPreset,
  plan: VerifyPlan,
  waivers: readonly VerifyStepWaiver[]
): CapabilityMatrix {
  const facts = factsOf(detection);
  const entries: VerifyReadiness[] = [];
  const waiverByStep = new Map(waivers.map((waiver) => [waiver.stepId, waiver]));
  const plannedIds = new Set(
    plan.steps.filter((candidate) => candidate.plugin === 'node').map((candidate) => candidate.id)
  );
  const packageManagerNeeded = preset.steps.some(
    (candidate) =>
      plannedIds.has(`node:${candidate.id}`) &&
      !waiverByStep.has(`node:${candidate.id}`) &&
      candidate.requires.some((requirement) => requirement.id.startsWith('node:script:'))
  );
  for (const requirement of preset.requirements) {
    const ready =
      requirement.id === 'node:package-json'
        ? facts.packageJsonValid
        : requirement.id === 'node:package-manager'
          ? facts.packageManager.supported || !packageManagerNeeded
          : false;
    entries.push(
      readinessEntry(
        plan.phase,
        requirement,
        ready ? 'READY' : 'BLOCKED',
        ready
          ? `${requirement.description}: ready`
          : requirement.id === 'node:package-json'
            ? `package.json is invalid: ${facts.packageJsonError ?? 'unknown parse error'}`
            : `package manager "${facts.packageManager.id}" has no target argv adapter`
      )
    );
  }

  const stepById = new Map(preset.steps.map((candidate) => [`node:${candidate.id}`, candidate]));
  for (const planned of plan.steps.filter((candidate) => candidate.plugin === 'node')) {
    const waiver = waiverByStep.get(planned.id);
    if (waiver !== undefined) {
      entries.push({
        plugin: 'node',
        phase: plan.phase,
        requirementId: `node:waiver:${planned.id}`,
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
      const scriptPrefix = 'node:script:';
      const lintPrefix = 'node:lint-reaches-gennady:';
      const readOnlyPrefix = 'node:read-only:';
      const repairPrefix = 'node:repair-prefix:';
      const repairScopePrefix = 'node:repair-scope:';
      const lintSourcePolicyPrefix = 'node:lint-source-policy:';
      let ready = false;
      if (requirement.id.startsWith(scriptPrefix)) {
        const script = requirement.id.slice(scriptPrefix.length);
        ready = (facts.scripts[script]?.trim().length ?? 0) > 0;
      } else if (requirement.id.startsWith(lintPrefix)) {
        ready = nodeScriptReachesGennady(facts.scripts, requirement.id.slice(lintPrefix.length));
      } else if (requirement.id.startsWith(readOnlyPrefix)) {
        ready = nodeScriptIsReadOnly(facts.scripts, requirement.id.slice(readOnlyPrefix.length));
      } else if (requirement.id.startsWith(repairPrefix)) {
        ready = nodeRepairIsArgumentForwarding(
          facts.scripts,
          requirement.id.slice(repairPrefix.length)
        );
      } else if (requirement.id.startsWith(repairScopePrefix)) {
        const separator = authored?.command?.argv.indexOf('--') ?? -1;
        ready = separator >= 0 && separator < (authored?.command?.argv.length ?? 0) - 1;
      } else if (requirement.id.startsWith(lintSourcePolicyPrefix)) {
        ready =
          nodeGennadyLintRepairTargets(
            facts.scripts,
            requirement.id.slice(lintSourcePolicyPrefix.length),
            []
          ) !== null;
      }
      entries.push(
        readinessEntry(
          plan.phase,
          requirement,
          ready ? 'READY' : requirement.required ? 'BLOCKED' : 'DEGRADED',
          ready ? `${requirement.description}: ready` : requirement.description,
          planned.id,
          !ready && !requirement.required && authored?.command === undefined
            ? 'optional-unavailable'
            : undefined
        )
      );
    }
  }
  entries.push(...verifyPlanPolicyReadiness(plan).filter((entry) => entry.plugin === 'node'));

  const status = entries.some((entry) => entry.status === 'BLOCKED')
    ? 'BLOCKED'
    : entries.some((entry) => entry.status === 'DEGRADED' || entry.status === 'WAIVED')
      ? 'DEGRADED'
      : 'READY';
  return { status, entries };
}
