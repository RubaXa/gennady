// @file: RepairAdapter registry — maps formatter/project/contract capabilities to exact target invocations.
// @consumers: SddVerifyCommand
// @tasks: N/A

import { extname } from 'node:path';
import { scriptReachesGennady } from '../../../shared/sdd/readiness.ts';
import { isGennadyLintTarget } from '../lint/lint-source-policy.ts';

/** @purpose One executable exact-target repair step. */
type RepairInvocation = {
  /** @purpose Discriminator for an adapter invocation that must run. */
  kind: 'run';
  /** @purpose Stable adapter capability name used in evidence. */
  name: string;
  /** @purpose Executable used for this exact-target repair step. */
  command: string;
  /** @purpose Exact invocation arguments, including only adapter-applicable targets. */
  args: string[];
};

/** @purpose Honest evidence that a selected adapter had no applicable exact targets. */
export type RepairSkip = {
  /** @purpose Discriminator for an adapter capability that is honestly skipped. */
  kind: 'skip';
  /** @purpose Stable adapter capability name used in evidence. */
  name: string;
  /** @purpose Human-readable reason why the adapter has no applicable targets. */
  reason: string;
};

/** @purpose Ordered formatter → project linter → contract linter repair action. */
export type RepairAction = RepairInvocation | RepairSkip;

type RepairContext = {
  scripts: Record<string, string>;
  targets: readonly string[];
  specPath?: string;
  gennadyCommand: { command: string; args: string[] };
};

type ProjectLinterAdapter = {
  name: string;
  matches: (scripts: Record<string, string>) => boolean;
  accepts: (target: string) => boolean;
  contractCapable: boolean;
};

const ESLINT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

function scriptNamesExecutable(body: string | undefined, executable: string): boolean {
  if (!body) return false;
  return body
    .trim()
    .split(/\s+/)
    .some((token) => new RegExp(`(?:^|/)${executable}(?:\\.[cm]?[jt]s)?$`).test(token));
}

const PROJECT_LINTER_ADAPTERS: readonly ProjectLinterAdapter[] = [
  {
    name: 'gennady-contract',
    matches: (scripts) => scriptReachesGennady(scripts, 'lint:fix'),
    accepts: isGennadyLintTarget,
    contractCapable: true,
  },
  {
    name: 'eslint-project',
    matches: (scripts) => scriptNamesExecutable(scripts['lint:fix'], 'eslint'),
    accepts: (target) => ESLINT_EXTENSIONS.has(extname(target).toLowerCase()),
    contractCapable: false,
  },
  {
    name: 'project-linter',
    matches: () => true,
    accepts: () => true,
    contractCapable: false,
  },
];

function safeTargets(targets: readonly string[]): string[] {
  return targets.map((target) => (target.startsWith('-') ? `./${target}` : target));
}

function namedSkip(name: string, reason: string): RepairSkip {
  return { kind: 'skip', name, reason };
}

/**
 * @purpose Build the ordered exact-target repair plan from explicit adapter capabilities.
 * @invariant Gennady-only flags are emitted only by a contract-capable adapter.
 * @invariant A Gennady project leaf satisfies project + contract roles in one invocation.
 * @param context Scripts, exact targets, owning spec, and Gennady executable for adapter planning.
 * @returns Ordered formatter, project-linter, and contract-linter run or named-skip actions.
 */
export function planTargetRepair(context: RepairContext): RepairAction[] {
  const actions: RepairAction[] = [
    {
      kind: 'run',
      name: 'formatter',
      command: 'npm',
      args: ['run', 'format:fix', '--', ...safeTargets(context.targets)],
    },
  ];
  const projectAdapter = PROJECT_LINTER_ADAPTERS.find((adapter) =>
    adapter.matches(context.scripts)
  ) as ProjectLinterAdapter;
  const projectTargets = context.targets.filter(projectAdapter.accepts);
  if (projectTargets.length === 0) {
    actions.push(
      namedSkip(
        projectAdapter.name,
        projectAdapter.contractCapable
          ? 'no applicable .ts/.tsx targets'
          : 'no applicable project-linter targets'
      )
    );
  } else {
    actions.push({
      kind: 'run',
      name: projectAdapter.name,
      command: 'npm',
      args: projectAdapter.contractCapable
        ? [
            'run',
            'lint:fix',
            '--',
            '--include-tests',
            ...(context.specPath ? [`--spec=${context.specPath}`] : []),
            '--',
            ...safeTargets(projectTargets),
          ]
        : ['run', 'lint:fix', '--', ...safeTargets(projectTargets)],
    });
  }

  if (!projectAdapter.contractCapable) {
    const contractTargets = context.targets.filter(isGennadyLintTarget);
    if (contractTargets.length === 0) {
      actions.push(namedSkip('gennady-contract', 'no applicable .ts/.tsx targets'));
    } else {
      actions.push({
        kind: 'run',
        name: 'gennady-contract',
        command: context.gennadyCommand.command,
        args: [
          ...context.gennadyCommand.args,
          '--autofix',
          '--include-tests',
          ...(context.specPath ? [`--spec=${context.specPath}`] : []),
          '--',
          ...safeTargets(contractTargets),
        ],
      });
    }
  }
  return actions;
}

/**
 * @purpose Render stable command/skip evidence for receipts and failure output.
 * @param action One planned adapter invocation or named skip.
 * @returns Stable command or skip evidence text.
 */
export function describeRepairAction(action: RepairAction): string {
  return action.kind === 'run'
    ? `${action.command} ${action.args.join(' ')}`
    : `${action.name}(skip: ${action.reason})`;
}
