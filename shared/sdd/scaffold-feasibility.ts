// @file: Deterministic scaffold feasibility over the complete materialized ticket graph.
// @consumers: sdd-check --scaffold-feasibility
// @tasks: N/A

import type { Finding } from './finding.ts';
import { extractSection } from './section.ts';
import {
  parseMetaInfo,
  parsePhaseDetail,
  parsePhasesOverview,
  parseVerificationTable,
} from './ticket.ts';
import { parseTestCoverage } from './bdd-coverage.ts';
import type { TicketCorpusRef } from './ticket-resolve.ts';

/** @purpose Clean-HEAD package facts against which planned dependency installation is evaluated. */
type ScaffoldPackageBaseline = {
  /** @purpose Packages already declared before scaffold execution. */
  declaredPackages: ReadonlySet<string>;
  /** @purpose Existing root lockfiles that the dependency installer must own. */
  activeLockfiles: readonly string[];
};

type PhaseNode = {
  ticketId: string;
  ticketFile: string;
  phaseId: string;
  dependencies: string[];
  phaseDependencies: string[];
  objective: string | null;
  targets: string[];
  action: string | null;
  provides: string[];
  requires: string[];
};

type CommandScenario = { name: string; command: string };

function finding(file: string, code: string, message: string): Finding {
  return { severity: 'error', code, file, message };
}

function scenarioName(raw: string): string {
  return raw
    .replace(/`?\[[^\]]+\]`?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @purpose Parse only structurally obvious npm-script invocations from BDD When lines. */
function commandScenarios(content: string): CommandScenario[] {
  const bdd = extractSection(content, 'BDD');
  if (bdd.status !== 'ok') return [];
  const lines = bdd.content.split('\n');
  const out: CommandScenario[] = [];
  for (let index = 0; index < lines.length; index++) {
    const scenario = /^\s*\*\*Scenario:\*\*\s*(.+)$/.exec(lines[index] ?? '');
    if (!scenario?.[1]) continue;
    const name = scenarioName(scenario[1]);
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (/^\s*\*\*Scenario:\*\*/.test(lines[cursor] ?? '')) break;
      const when = /^\s*-\s*\*\*When\*\*\s*(.+)$/.exec(lines[cursor] ?? '');
      if (!when?.[1]) continue;
      const command = /`(npm run [A-Za-z0-9:_-]+)`/.exec(when[1])?.[1];
      if (command) out.push({ name, command });
      break;
    }
  }
  return out;
}

function phaseNodes(refs: readonly TicketCorpusRef[]): PhaseNode[] {
  return refs.flatMap((ref) => {
    const metaSection = extractSection(ref.content, 'META');
    const overviewSection = extractSection(ref.content, 'PHASES_OVERVIEW');
    if (metaSection.status !== 'ok' || overviewSection.status !== 'ok') return [];
    const meta = parseMetaInfo(metaSection.content);
    if (!meta.taskId) return [];
    return parsePhasesOverview(overviewSection.content).flatMap((phase) => {
      const section = extractSection(ref.content, `PHASE_${phase.id}`);
      if (section.status !== 'ok') return [];
      const detail = parsePhaseDetail(section.content);
      return [
        {
          ticketId: meta.taskId as string,
          ticketFile: ref.file,
          phaseId: phase.id,
          dependencies: meta.dependencies,
          phaseDependencies: phase.deps,
          objective: detail.objective,
          targets: detail.targetFiles,
          action: detail.bootstrapAction,
          provides: detail.providesPackages,
          requires: detail.requiresPackages,
        },
      ];
    });
  });
}

function reaches(
  dependenciesByTicket: ReadonlyMap<string, readonly string[]>,
  from: string,
  target: string
): boolean {
  const seen = new Set<string>();
  const queue = [...(dependenciesByTicket.get(from) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (current === target) return true;
    seen.add(current);
    queue.push(...(dependenciesByTicket.get(current) ?? []));
  }
  return false;
}

/**
 * @purpose Reject scaffold graphs that cannot execute from their clean package baseline.
 * @invariant Uses only explicit phase package facts, exact targets/dependencies, and exact BDD command evidence.
 * @param refs Complete resolved ticket corpus whose phase graph is checked.
 * @param baseline Clean-HEAD package declarations and active root lockfiles.
 * @returns Deduplicated causal findings; an empty list means the scaffold is executable.
 */
export function checkScaffoldFeasibility(
  refs: readonly TicketCorpusRef[],
  baseline: ScaffoldPackageBaseline
): Finding[] {
  const findings: Finding[] = [];
  const nodes = phaseNodes(refs);
  const dependenciesByTicket = new Map(
    refs.flatMap((ref) => {
      const meta = extractSection(ref.content, 'META');
      if (meta.status !== 'ok') return [];
      const parsed = parseMetaInfo(meta.content);
      return parsed.taskId ? [[parsed.taskId, parsed.dependencies] as const] : [];
    })
  );
  const neededPackages = new Set(
    nodes.flatMap((node) => node.requires).filter((pkg) => !baseline.declaredPackages.has(pkg))
  );

  if (neededPackages.size > 0) {
    const sharedArtifacts = ['package.json', ...baseline.activeLockfiles];
    const ownersByArtifact = new Map(
      sharedArtifacts.map((artifact) => [
        artifact,
        nodes.filter((node) => node.targets.includes(artifact)),
      ])
    );
    for (const [artifact, owners] of ownersByArtifact) {
      if (owners.length === 0) {
        findings.push(
          finding(
            '(scaffold graph)',
            'SDD_SCAFFOLD_SHARED_ARTIFACT_OWNER_MISSING',
            `${artifact} has no exact bootstrap phase owner although packages are required from clean HEAD.`
          )
        );
      } else if (owners.length > 1) {
        findings.push(
          finding(
            '(scaffold graph)',
            'SDD_SCAFFOLD_SHARED_ARTIFACT_OWNER_AMBIGUOUS',
            `${artifact} has multiple phase owners: ${owners.map((owner) => `${owner.ticketId}/${owner.phaseId}`).join(', ')}. Keep package.json and the active lockfile under one dependency-install phase.`
          )
        );
      }
    }
    const exactOwners = sharedArtifacts
      .map((artifact) => ownersByArtifact.get(artifact) ?? [])
      .filter((owners) => owners.length === 1)
      .map((owners) => `${owners[0]?.ticketId}/${owners[0]?.phaseId}`);
    if (new Set(exactOwners).size > 1) {
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_SHARED_ARTIFACT_OWNER_SPLIT',
          `package.json and active lockfile ownership is split across ${[...new Set(exactOwners)].join(', ')}; one dependency-install phase must own both.`
        )
      );
    }
  }

  const providersByPackage = new Map<string, PhaseNode[]>();
  for (const node of nodes) {
    if (node.provides.length > 0 && node.action !== 'dependency-install') {
      findings.push(
        finding(
          node.ticketFile,
          'SDD_SCAFFOLD_PACKAGE_PROVIDER_ACTION_INVALID',
          `${node.ticketId}/${node.phaseId} Provides Packages but Bootstrap Action is not dependency-install.`
        )
      );
    }
    if (node.action === 'dependency-install') {
      const missingTargets = ['package.json', ...baseline.activeLockfiles].filter(
        (artifact) => !node.targets.includes(artifact)
      );
      if (missingTargets.length > 0) {
        findings.push(
          finding(
            node.ticketFile,
            'SDD_SCAFFOLD_PACKAGE_PROVIDER_TARGETS_INCOMPLETE',
            `${node.ticketId}/${node.phaseId} is dependency-install but does not own ${missingTargets.join(', ')}.`
          )
        );
      }
    }
    for (const pkg of node.provides) {
      const providers = providersByPackage.get(pkg) ?? [];
      providers.push(node);
      providersByPackage.set(pkg, providers);
    }
  }

  for (const consumer of nodes) {
    for (const pkg of consumer.requires) {
      if (baseline.declaredPackages.has(pkg)) continue;
      const providers = providersByPackage.get(pkg) ?? [];
      if (providers.length === 0) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_PACKAGE_PROVIDER_MISSING',
            `${consumer.ticketId}/${consumer.phaseId} requires package '${pkg}', but no dependency-install phase Provides Packages for it.`
          )
        );
        continue;
      }
      if (providers.length > 1) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_PACKAGE_PROVIDER_AMBIGUOUS',
            `${consumer.ticketId}/${consumer.phaseId} requires package '${pkg}', provided by ${providers.map((provider) => `${provider.ticketId}/${provider.phaseId}`).join(', ')}.`
          )
        );
        continue;
      }
      const provider = providers[0] as PhaseNode;
      if (provider.ticketId === consumer.ticketId) {
        if (!consumer.phaseDependencies.includes(provider.phaseId)) {
          findings.push(
            finding(
              consumer.ticketFile,
              'SDD_SCAFFOLD_TOOLCHAIN_PREREQ_MISSING',
              `${consumer.ticketId}/${consumer.phaseId} requires '${pkg}' from its own ${provider.phaseId} but has no phase dependency on it.`
            )
          );
        }
        continue;
      }
      if (!reaches(dependenciesByTicket, consumer.ticketId, provider.ticketId)) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_TOOLCHAIN_PREREQ_MISSING',
            `${consumer.ticketId}/${consumer.phaseId} requires '${pkg}' from ${provider.ticketId}/${provider.phaseId}, but ${consumer.ticketId} does not depend on ${provider.ticketId}.`
          )
        );
      }
      if (reaches(dependenciesByTicket, provider.ticketId, consumer.ticketId)) {
        findings.push(
          finding(
            provider.ticketFile,
            'SDD_SCAFFOLD_BOOTSTRAP_REVERSE_DEP',
            `${provider.ticketId} installs '${pkg}' but depends on consumer ${consumer.ticketId}; reverse bootstrap ordering cannot execute from clean HEAD.`
          )
        );
      }
    }
  }

  for (const ref of refs) {
    const coverage = extractSection(ref.content, 'TEST_COVERAGE');
    const verification = extractSection(ref.content, 'VERIFICATION');
    const entries = coverage.status === 'ok' ? parseTestCoverage(coverage.content) : [];
    const gates =
      verification.status === 'ok'
        ? parseVerificationTable(verification.content)
        : ({ ok: false } as const);
    for (const scenario of commandScenarios(ref.content)) {
      const mapping = entries.find(
        (entry) => entry.deferred === null && entry.scenario === scenario.name
      );
      if (!mapping?.probeCommand) {
        findings.push(
          finding(
            ref.file,
            'SDD_SCAFFOLD_BDD_COMMAND_PROBE_MISSING',
            `Scenario '${scenario.name}' invokes '${scenario.command}' but its Test Scenario Coverage row has no exact :: command probe.`
          )
        );
        continue;
      }
      if (mapping.probeCommand !== scenario.command) {
        findings.push(
          finding(
            ref.file,
            'SDD_SCAFFOLD_BDD_COMMAND_PROBE_MISMATCH',
            `Scenario '${scenario.name}' invokes '${scenario.command}' but claims '${mapping.probeCommand}'.`
          )
        );
        continue;
      }
      const exactProbe = gates.ok
        ? gates.gates.some((gate) => gate.role === 'probe' && gate.command === mapping.probeCommand)
        : false;
      if (!exactProbe) {
        findings.push(
          finding(
            ref.file,
            'SDD_SCAFFOLD_BDD_COMMAND_VERIFICATION_MISSING',
            `Scenario '${scenario.name}' command '${mapping.probeCommand}' needs one exact Verification row with Role=probe.`
          )
        );
      }
    }
  }

  // Avoid one package producing the same causal message five times for the same consumer/provider edge.
  return [
    ...new Map(
      findings.map((item) => [
        `${item.code}:${item.file}:${item.message.replace(/requires '[^']+'/g, "requires '<package>'").replace(/installs '[^']+'/g, "installs '<package>'")}`,
        item,
      ])
    ).values(),
  ];
}
