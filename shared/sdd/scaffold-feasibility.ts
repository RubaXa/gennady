// @file: Deterministic scaffold feasibility over the complete materialized ticket graph.
// @consumers: sdd-check --scaffold-feasibility
// @tasks: N/A

import type { Finding } from './finding.ts';
import { extractSection } from './section.ts';
import {
  parseMetaInfo,
  parsePhaseDetail,
  parsePhasesOverview,
  parseTicketCoveragePolicy,
  parseVerificationTable,
  type TicketCoveragePolicy,
} from './ticket.ts';
import { matchingTestPhaseIds, parseTestCoverage } from './bdd-coverage.ts';
import {
  phaseProfileForKind,
  resolvePhaseVerificationPlan,
  verificationGateNames,
} from './phase-verification-plan.ts';
import type { TicketCorpusRef } from './ticket-resolve.ts';
import {
  DEFAULT_CAPABILITY_ADAPTER_REGISTRY,
  type CapabilityAdapter,
  type CapabilityAdapterRegistry,
} from './capability-adapter.ts';
import type { ScaffoldDraftPlanNode } from './project-feasibility.ts';

/** @purpose Clean-HEAD package facts against which planned dependency installation is evaluated. */
export type ScaffoldPackageBaseline = {
  /** @purpose Packages already declared before scaffold execution. */
  declaredPackages: ReadonlySet<string>;
  /** @purpose Existing root lockfiles that the dependency installer must own. */
  activeLockfiles: readonly string[];
  /** @purpose Exact npm script bodies declared at clean HEAD. */
  scripts?: Readonly<Record<string, string>>;
  /** @purpose Capability artifacts already materialized in the observed repository. */
  availableArtifacts?: ReadonlySet<string>;
};

/** @purpose One explicit boundary where the ticket schema cannot prove a mechanical fact. */
export type ScaffoldToolContractGap = {
  /** @purpose Stable discriminator consumed by critic protocol and regression tests. */
  type: 'TOOL_CONTRACT_MISSING';
  /** @purpose Ticket whose phase exposed the unavailable fact. */
  ticket: string;
  /** @purpose Phase needing the unavailable fact, or `(unresolved)` before ownership resolves. */
  phase: string;
  /** @purpose Stable missing-fact class. */
  fact: 'phase-profile';
  /** @purpose Human-readable reason the deterministic context cannot supply this fact. */
  detail: string;
};

/** @purpose Machine-produced mechanical input for the residual semantic scaffold critic. */
export type ScaffoldCriticContext = {
  /** @purpose Versioned parser contract for isolated critic consumers. */
  schema: 'sdd-scaffold-critic-context/v1';
  /** @purpose CLI source whose green result owns these mechanics. */
  authority: 'sdd-check --scaffold-feasibility';
  /** @purpose Complete materialized ticket paths and graph dependencies. */
  targetSet: Array<{
    ticket: string;
    path: string;
    dependencies: string[];
  }>;
  /** @purpose Package, lockfile, and npm-script baseline read from clean HEAD. */
  cleanHead: {
    declaredPackages: string[];
    activeLockfiles: string[];
    scripts: Record<string, string>;
  };
  /** @purpose Global future owner refs for the package manifest and active lockfile boundary. */
  packageOwners: string[];
  /** @purpose Per-phase executable plan derived from ticket structure. */
  phases: Array<{
    ticket: string;
    path: string;
    phase: string;
    kind: string;
    profile: 'setup' | 'code' | 'test' | 'unknown';
    ladder: string[];
    ticketDependencies: string[];
    phaseDependencies: string[];
    targetFiles: string[];
    bootstrap: {
      action: string | null;
      providesPackages: string[];
      requiresPackages: string[];
    };
    verification: Array<{ command: string; role: string; requiredBy: string[] }>;
  }>;
  /** @purpose Exact command-bearing BDD evidence and its owning test phase. */
  commandProofs: Array<{
    ticket: string;
    scenario: string;
    bddCommand: string;
    probeCommand: string | null;
    testFile: string | null;
    testPhase: string | null;
    verificationRole: 'probe' | null;
    cleanHeadScript: string | null;
  }>;
  /** @purpose Explicit coverage applicability, owner, and reader per ticket. */
  coverage: Array<
    | { ticket: string; policy: 'required'; ownerPhase: string; readerCommand: string }
    | { ticket: string; policy: 'not-applicable'; reason: string }
    | { ticket: string; policy: 'legacy' | 'invalid'; detail: string }
  >;
  /** @purpose Facts the ticket schema cannot prove, exposed without implementation guesses. */
  gaps: ScaffoldToolContractGap[];
};

type PhaseNode = {
  ticketId: string;
  ticketFile: string;
  scope: string;
  phaseId: string;
  kind: string;
  dependencies: string[];
  phaseDependencies: string[];
  objective: string | null;
  targets: string[];
  action: string | null;
  provides: string[];
  requires: string[];
  rules: string[];
  capabilityAdapter: string | null;
  providesCapabilities: string[];
  requiresCapabilities: string[];
  bootstrapRequirementIds: string[];
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
          scope: meta.scope ?? '(unknown)',
          phaseId: phase.id,
          kind: phase.kind,
          dependencies: meta.dependencies,
          phaseDependencies: phase.deps,
          objective: detail.objective,
          targets: detail.targetFiles,
          action: detail.bootstrapAction,
          provides: detail.providesPackages,
          requires: detail.requiresPackages,
          rules: detail.rules,
          capabilityAdapter: detail.capabilityAdapter,
          providesCapabilities: detail.providesCapabilities,
          requiresCapabilities: detail.requiresCapabilities,
          bootstrapRequirementIds: detail.bootstrapRequirementIds,
        },
      ];
    });
  });
}

/**
 * @purpose Normalize materialized ticket phases to the same node contract approved before Gate 1.
 * @param refs Complete ticket corpus after STEP_3 authoring.
 * @returns Exact comparable phase nodes with ticket dependencies bound to predecessor terminal phases.
 */
export function materializedScaffoldPlanNodes(
  refs: readonly TicketCorpusRef[]
): ScaffoldDraftPlanNode[] {
  const nodes = phaseNodes(refs);
  const terminalPhaseByTicket = new Map<string, string>();
  for (const ref of refs) {
    const meta = extractSection(ref.content, 'META');
    const overview = extractSection(ref.content, 'PHASES_OVERVIEW');
    if (meta.status !== 'ok' || overview.status !== 'ok') continue;
    const taskId = parseMetaInfo(meta.content).taskId;
    const terminal = parsePhasesOverview(overview.content).at(-1)?.id;
    if (taskId && terminal) terminalPhaseByTicket.set(taskId, terminal);
  }
  return nodes.map((node) => ({
    id: `${node.ticketId}/${node.phaseId}`,
    scope: node.scope,
    dependencies: [
      ...node.phaseDependencies.map((phase) => `${node.ticketId}/${phase}`),
      ...node.dependencies.flatMap((ticket) => {
        const terminal = terminalPhaseByTicket.get(ticket);
        return terminal ? [`${ticket}/${terminal}`] : [];
      }),
    ],
    requirementIds: [...node.bootstrapRequirementIds],
    adapter: node.capabilityAdapter ?? '',
    action: node.action === 'dependency-install' ? 'dependency-install' : null,
    targets: [...node.targets],
    provides: [...node.providesCapabilities],
    requires: [...node.requiresCapabilities],
  }));
}

function ruleAliases(rule: string): string[] {
  const slash = rule.replace(/\\/g, '/').split('/').pop() ?? rule;
  return [rule, slash.replace(/\.xml$/i, '')];
}

/**
 * @purpose Preserve every deterministic scaffold fact as authoritative critic input.
 * @invariant Missing future implementation mechanics are typed gaps; no package implementation is inferred.
 * @param refs Complete materialized ticket corpus.
 * @param baseline Clean-HEAD package and script facts used by the feasibility gate.
 * @param [pathFor] Stable display path for one ticket file.
 * @returns Compact serializable context for one semantic critic session.
 */
export function deriveScaffoldCriticContext(
  refs: readonly TicketCorpusRef[],
  baseline: ScaffoldPackageBaseline,
  pathFor: (file: string) => string = (file) => file
): ScaffoldCriticContext {
  const nodes = phaseNodes(refs);
  const packages = [...baseline.declaredPackages].sort();
  const scripts = Object.fromEntries(
    Object.entries(baseline.scripts ?? {}).sort(([left], [right]) => left.localeCompare(right))
  );
  const packageOwners = nodes
    .filter((node) => node.targets.includes('package.json'))
    .map((node) => `${node.ticketId}/${node.phaseId}`);
  const gaps: ScaffoldToolContractGap[] = [];
  const coverageByTicket = new Map<string, ReturnType<typeof parseTicketCoveragePolicy>>();
  const coverage = refs.map((ref): ScaffoldCriticContext['coverage'][number] => {
    const meta = extractSection(ref.content, 'META');
    const ticket =
      meta.status === 'ok' ? (parseMetaInfo(meta.content).taskId ?? '(unknown)') : '(unknown)';
    const verification = extractSection(ref.content, 'VERIFICATION');
    const policy: TicketCoveragePolicy =
      verification.status === 'ok'
        ? parseTicketCoveragePolicy(verification.content)
        : { status: 'invalid', issues: ['VERIFICATION section is unavailable'] };
    coverageByTicket.set(ref.file, policy);
    if (policy.status === 'required')
      return {
        ticket,
        policy: 'required',
        ownerPhase: policy.ownerPhase,
        readerCommand: policy.command,
      };
    if (policy.status === 'not-applicable')
      return { ticket, policy: 'not-applicable', reason: policy.reason };
    return {
      ticket,
      policy: policy.status,
      detail: policy.status === 'invalid' ? policy.issues.join('; ') : 'pre-COVERAGE_POLICY ticket',
    };
  });

  const phases = nodes.map((node): ScaffoldCriticContext['phases'][number] => {
    const derivedProfile = phaseProfileForKind(node.kind);
    const profile = derivedProfile ?? 'unknown';
    const policy = coverageByTicket.get(node.ticketFile);
    const producesCoverage =
      profile === 'test' &&
      (policy?.status === 'legacy' ||
        (policy?.status === 'required' && policy.ownerPhase === node.phaseId));
    const ref = refs.find((candidate) => candidate.file === node.ticketFile);
    const verification = ref
      ? extractSection(ref.content, 'VERIFICATION')
      : { status: 'missing' as const };
    const parsed =
      verification.status === 'ok'
        ? parseVerificationTable(verification.content)
        : ({ ok: false } as const);
    const coverageSection = ref
      ? extractSection(ref.content, 'TEST_COVERAGE')
      : ({ status: 'missing' } as const);
    const coverageEntries =
      coverageSection.status === 'ok' ? parseTestCoverage(coverageSection.content) : [];
    const testPhases = nodes
      .filter(
        (candidate) =>
          candidate.ticketFile === node.ticketFile && candidate.kind.trim().toLowerCase() === 'test'
      )
      .map((candidate) => ({ phaseId: candidate.phaseId, targets: candidate.targets }));
    const phaseSection = ref
      ? extractSection(ref.content, `PHASE_${node.phaseId}`)
      : ({ status: 'missing' } as const);
    const aliases = new Set(
      phaseSection.status === 'ok'
        ? parsePhaseDetail(phaseSection.content).rules.flatMap(ruleAliases)
        : []
    );
    const applicable = parsed.ok
      ? parsed.gates.filter((gate) => {
          if (gate.command === '—') return false;
          if (gate.role === 'coverage')
            return policy?.status === 'required' && policy.ownerPhase === node.phaseId;
          if (gate.role === 'probe')
            return coverageEntries.some(
              (entry) =>
                entry.deferred === null &&
                entry.probeCommand === gate.command &&
                matchingTestPhaseIds(entry.testFile, testPhases).includes(node.phaseId)
            );
          return gate.requiredBy.some((required) => aliases.has(required));
        })
      : [];
    if (profile === 'unknown') {
      gaps.push({
        type: 'TOOL_CONTRACT_MISSING',
        ticket: node.ticketId,
        phase: node.phaseId,
        fact: 'phase-profile',
        detail: `phase kind '${node.kind}' has no structural verify profile`,
      });
    }
    return {
      ticket: node.ticketId,
      path: pathFor(node.ticketFile),
      phase: node.phaseId,
      kind: node.kind,
      profile,
      ladder: derivedProfile ? [...verificationGateNames(derivedProfile, producesCoverage)] : [],
      ticketDependencies: [...node.dependencies],
      phaseDependencies: [...node.phaseDependencies],
      targetFiles: [...node.targets],
      bootstrap: {
        action: node.action,
        providesPackages: [...node.provides],
        requiresPackages: [...node.requires],
      },
      verification: applicable.map((gate) => ({
        command: gate.command,
        role: gate.role ?? 'extra',
        requiredBy: [...gate.requiredBy],
      })),
    };
  });

  const commandProofs = refs.flatMap((ref) => {
    const meta = extractSection(ref.content, 'META');
    const ticket =
      meta.status === 'ok' ? (parseMetaInfo(meta.content).taskId ?? '(unknown)') : '(unknown)';
    const coverageSection = extractSection(ref.content, 'TEST_COVERAGE');
    const entries =
      coverageSection.status === 'ok' ? parseTestCoverage(coverageSection.content) : [];
    const verification = extractSection(ref.content, 'VERIFICATION');
    const gates =
      verification.status === 'ok' ? parseVerificationTable(verification.content) : null;
    const testPhases = nodes
      .filter((node) => node.ticketFile === ref.file && node.kind.trim().toLowerCase() === 'test')
      .map((node) => ({ phaseId: node.phaseId, targets: node.targets }));
    return commandScenarios(ref.content).map(
      (scenario): ScaffoldCriticContext['commandProofs'][number] => {
        const mapping = entries.find(
          (entry) => entry.deferred === null && entry.scenario === scenario.name
        );
        const owners = mapping ? matchingTestPhaseIds(mapping.testFile, testPhases) : [];
        const scriptName = /^npm run ([A-Za-z0-9:_-]+)$/.exec(scenario.command)?.[1] ?? null;
        const cleanHeadScript = scriptName ? (scripts[scriptName] ?? null) : null;
        return {
          ticket,
          scenario: scenario.name,
          bddCommand: scenario.command,
          probeCommand: mapping?.probeCommand ?? null,
          testFile: mapping?.testFile ?? null,
          testPhase: owners.length === 1 ? (owners[0] as string) : null,
          verificationRole:
            gates?.ok &&
            mapping?.probeCommand &&
            gates.gates.some(
              (gate) => gate.role === 'probe' && gate.command === mapping.probeCommand
            )
              ? 'probe'
              : null,
          cleanHeadScript,
        };
      }
    );
  });

  return {
    schema: 'sdd-scaffold-critic-context/v1',
    authority: 'sdd-check --scaffold-feasibility',
    targetSet: refs.map((ref) => {
      const meta = extractSection(ref.content, 'META');
      const parsed = meta.status === 'ok' ? parseMetaInfo(meta.content) : null;
      return {
        ticket: parsed?.taskId ?? '(unknown)',
        path: pathFor(ref.file),
        dependencies: parsed?.dependencies ?? [],
      };
    }),
    cleanHead: {
      declaredPackages: packages,
      activeLockfiles: [...baseline.activeLockfiles].sort(),
      scripts,
    },
    packageOwners,
    phases,
    commandProofs,
    coverage,
    gaps,
  };
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

function nodeKey(node: PhaseNode): string {
  return `${node.ticketId}/${node.phaseId}`;
}

function phaseReaches(
  nodes: readonly PhaseNode[],
  dependenciesByTicket: ReadonlyMap<string, readonly string[]>,
  from: PhaseNode,
  target: PhaseNode
): boolean {
  if (nodeKey(from) === nodeKey(target)) return true;
  if (from.ticketId !== target.ticketId) {
    return reaches(dependenciesByTicket, from.ticketId, target.ticketId);
  }
  const byId = new Map(
    nodes
      .filter((node) => node.ticketId === from.ticketId)
      .map((node) => [node.phaseId, node] as const)
  );
  const seen = new Set<string>();
  const queue = [...from.phaseDependencies];
  while (queue.length > 0) {
    const phaseId = queue.shift();
    if (!phaseId || seen.has(phaseId)) continue;
    if (phaseId === target.phaseId) return true;
    seen.add(phaseId);
    queue.push(...(byId.get(phaseId)?.phaseDependencies ?? []));
  }
  return false;
}

function strictlyOrdered(
  nodes: readonly PhaseNode[],
  dependenciesByTicket: ReadonlyMap<string, readonly string[]>,
  left: PhaseNode,
  right: PhaseNode
): boolean {
  return (
    phaseReaches(nodes, dependenciesByTicket, left, right) !==
    phaseReaches(nodes, dependenciesByTicket, right, left)
  );
}

function currentReachableProviders(
  nodes: readonly PhaseNode[],
  dependenciesByTicket: ReadonlyMap<string, readonly string[]>,
  consumer: PhaseNode,
  providers: readonly PhaseNode[]
): PhaseNode[] {
  const reachable = providers.filter((provider) =>
    phaseReaches(nodes, dependenciesByTicket, consumer, provider)
  );
  return reachable.filter(
    (candidate) =>
      !reachable.some(
        (other) =>
          nodeKey(other) !== nodeKey(candidate) &&
          phaseReaches(nodes, dependenciesByTicket, other, candidate)
      )
  );
}

function hasSetupRule(node: PhaseNode, rulePath: string): boolean {
  const expected = rulePath.replace(/\\/g, '/');
  return node.rules.some((rule) => {
    const normalized = rule.replace(/\\/g, '/');
    return normalized === expected || normalized.endsWith(`/${expected}`);
  });
}

function capabilityOwnerRef(node: PhaseNode): string {
  return `${node.ticketId}/${node.phaseId}`;
}

function capabilityLayer(
  registry: CapabilityAdapterRegistry,
  capability: string
): { adapter: CapabilityAdapter; requires: readonly string[] } | null {
  for (const adapter of Object.values(registry)) {
    const layer = adapter.layers.find((candidate) => candidate.capability === capability);
    if (layer) return { adapter, requires: layer.requires };
  }
  return null;
}

function capabilityFindings(
  nodes: readonly PhaseNode[],
  dependenciesByTicket: ReadonlyMap<string, readonly string[]>,
  registry: CapabilityAdapterRegistry
): Finding[] {
  const findings: Finding[] = [];
  const providers = new Map<string, PhaseNode[]>();
  for (const node of nodes) {
    for (const capability of node.providesCapabilities) {
      const owners = providers.get(capability) ?? [];
      owners.push(node);
      providers.set(capability, owners);
    }
  }

  for (const node of nodes) {
    const adapterId = node.capabilityAdapter;
    if (!adapterId) {
      if (
        node.action === 'dependency-install' ||
        node.providesCapabilities.length > 0 ||
        node.requiresCapabilities.length > 0
      ) {
        findings.push(
          finding(
            node.ticketFile,
            'SDD_SCAFFOLD_CAPABILITY_ADAPTER_MISSING',
            `${capabilityOwnerRef(node)} declares dependency-install or capability facts without Capability Adapter. Expected: one adapter id from ${Object.keys(registry).sort().join(', ') || '(registry empty)'}. Next: set the phase's Capability Adapter field, then rerun scaffold feasibility.`
          )
        );
      }
      continue;
    }
    const adapter = registry[adapterId];
    if (!adapter) {
      findings.push(
        finding(
          node.ticketFile,
          'SDD_SCAFFOLD_CAPABILITY_ADAPTER_UNKNOWN',
          `${capabilityOwnerRef(node)} names unknown Capability Adapter '${adapterId}'. Expected: one of ${Object.keys(registry).sort().join(', ') || '(registry empty)'}. Next: correct the field or register that platform adapter, then rerun scaffold feasibility.`
        )
      );
      continue;
    }
    const allowedProvides = [
      ...new Set([
        ...adapter.artifacts.map((artifact) => artifact.id),
        ...adapter.layers.map((layer) => layer.capability),
      ]),
    ];
    const knownCapabilities = new Set(allowedProvides);
    for (const capability of node.providesCapabilities) {
      if (knownCapabilities.has(capability)) continue;
      findings.push(
        finding(
          node.ticketFile,
          'SDD_SCAFFOLD_CAPABILITY_NOT_DECLARED_BY_ADAPTER',
          `${capabilityOwnerRef(node)} claims capability '${capability}', but adapter '${adapter.id}' does not declare it. Expected: one of ${allowedProvides.join(', ') || '(this adapter declares no provides ids)'}. Next: replace the claim in Provides Capabilities with only the requirement-selected ids above, then rerun scaffold feasibility.`
        )
      );
    }
    const ownsAdapterCapability = node.providesCapabilities.some((capability) =>
      knownCapabilities.has(capability)
    );
    if (node.action === 'dependency-install' || ownsAdapterCapability) {
      const requiredRulePaths = [
        ...new Set(
          adapter.requiredRules
            .filter(
              (requirement) =>
                (node.action !== null && requirement.actions.includes(node.action)) ||
                node.providesCapabilities.some((capability) =>
                  requirement.capabilities.includes(capability)
                )
            )
            .map((requirement) => requirement.rulePath)
        ),
      ];
      for (const rulePath of requiredRulePaths) {
        if (hasSetupRule(node, rulePath)) continue;
        findings.push(
          finding(
            node.ticketFile,
            'SDD_SCAFFOLD_PLATFORM_RULE_CASCADE_MISSING',
            `${capabilityOwnerRef(node)} activates '${adapter.id}' action/capability mechanics without '${rulePath}'. Expected: this exact platform rule is active for the declared action or capability. Next: add '${rulePath}' to PHASE_${node.phaseId} Rules and rerun scaffold feasibility.`
          )
        );
      }
    }
    for (const capability of node.providesCapabilities) {
      const artifact = adapter.artifacts.find((candidate) => candidate.id === capability);
      if (!artifact || node.targets.includes(artifact.location.path)) continue;
      const location =
        artifact.location.kind === 'field'
          ? `${artifact.location.path} field '${artifact.location.field}'`
          : artifact.location.path;
      findings.push(
        finding(
          node.ticketFile,
          'SDD_SCAFFOLD_CAPABILITY_ARTIFACT_TARGET_MISSING',
          `${capabilityOwnerRef(node)} claims '${capability}' without Target File '${artifact.location.path}'. Expected: capability '${capability}' materializes ${location}. Next: add '${artifact.location.path}' to this phase's Target Files or move the capability claim to its actual owner.`
        )
      );
    }
  }

  for (const [capability, owners] of providers) {
    const unorderedPairs: string[] = [];
    for (let left = 0; left < owners.length; left += 1) {
      for (let right = left + 1; right < owners.length; right += 1) {
        const a = owners[left] as PhaseNode;
        const b = owners[right] as PhaseNode;
        if (!strictlyOrdered(nodes, dependenciesByTicket, a, b)) {
          unorderedPairs.push(`${capabilityOwnerRef(a)} ↔ ${capabilityOwnerRef(b)}`);
        }
      }
    }
    if (unorderedPairs.length > 0) {
      findings.push(
        finding(
          owners[0]?.ticketFile ?? '(scaffold graph)',
          'SDD_SCAFFOLD_CAPABILITY_PROVIDER_DUPLICATE',
          `Capability '${capability}' has unordered providers ${unorderedPairs.join(', ')}. Expected: one provider or providers strictly serialized by the phase/task DAG. Next: add the missing dependency edge or remove the duplicate Provides Capabilities claim.`
        )
      );
    }
  }

  for (const consumer of nodes) {
    for (const provided of consumer.providesCapabilities) {
      const layer = capabilityLayer(registry, provided);
      if (!layer) continue;
      for (const required of layer.requires) {
        if (!consumer.requiresCapabilities.includes(required)) {
          findings.push(
            finding(
              consumer.ticketFile,
              'SDD_SCAFFOLD_CAPABILITY_LAYER_ORDER',
              `${capabilityOwnerRef(consumer)} provides '${provided}' without declaring prerequisite '${required}'. Expected: ${layer.adapter.id} layer '${provided}' requires '${required}'. Next: add '${required}' to Requires Capabilities and a DAG edge to its provider.`
            )
          );
        }
      }
    }

    for (const required of consumer.requiresCapabilities) {
      const owners = providers.get(required) ?? [];
      if (owners.length === 0) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_CAPABILITY_PROVIDER_MISSING',
            `${capabilityOwnerRef(consumer)} requires capability '${required}', but no phase provides it. Expected: one reachable Provides Capabilities owner. Next: add the provider phase or correct the capability id, then rerun scaffold feasibility.`
          )
        );
        continue;
      }
      const currentProviders = currentReachableProviders(
        nodes,
        dependenciesByTicket,
        consumer,
        owners
      );
      if (currentProviders.length === 0) {
        const layer = capabilityLayer(registry, required);
        findings.push(
          finding(
            consumer.ticketFile,
            layer
              ? 'SDD_SCAFFOLD_CAPABILITY_LAYER_ORDER'
              : 'SDD_SCAFFOLD_CAPABILITY_PREREQUISITE_ORDER',
            `${capabilityOwnerRef(consumer)} requires '${required}', but none of its providers (${owners.map(capabilityOwnerRef).join(', ')}) precedes it. Expected: the consumer reaches a provider through phase/task dependencies. Next: add the missing DAG dependency before execute.`
          )
        );
      } else if (currentProviders.length > 1) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_CAPABILITY_PROVIDER_AMBIGUOUS',
            `${capabilityOwnerRef(consumer)} requires '${required}', but has multiple current reachable providers: ${currentProviders.map(capabilityOwnerRef).join(', ')}. Expected: exactly one current/upstream provider after DAG serialization. Next: order or consolidate the providers, then rerun scaffold feasibility.`
          )
        );
      }
    }
  }

  for (const install of nodes) {
    const adapterId = install.capabilityAdapter;
    const adapter = adapterId ? registry[adapterId] : undefined;
    const boundary = adapter?.dependencyBoundary;
    if (!adapter || !boundary) continue;
    if (
      install.action !== 'dependency-install' &&
      !install.providesCapabilities.includes(boundary.capability)
    ) {
      continue;
    }
    const dependencyArtifact = adapter.artifacts.find(
      (artifact) => artifact.id === boundary.capability
    );
    if (!dependencyArtifact) continue;
    const unavailable = adapter.artifacts
      .filter((artifact) => artifact.order < dependencyArtifact.order)
      .filter((artifact) => {
        const owners = providers.get(artifact.id) ?? [];
        return !owners.some((owner) => phaseReaches(nodes, dependenciesByTicket, install, owner));
      });
    if (unavailable.length > 0) {
      findings.push(
        finding(
          install.ticketFile,
          'SDD_SCAFFOLD_CAPABILITY_ARTIFACT_ORDER',
          `${capabilityOwnerRef(install)} installs '${boundary.capability}' before ${unavailable.map((artifact) => artifact.id).join(', ')}. Expected: every lower-order ${adapter.id} artifact capability is provided by this phase or a reachable predecessor. Next: move those owners earlier or add the missing DAG dependencies.`
        )
      );
    }
  }

  return findings;
}

/**
 * @purpose Reject scaffold graphs that cannot execute from their clean package baseline.
 * @invariant Uses only explicit phase package facts, exact targets/dependencies, and exact BDD command evidence.
 * @param refs Complete resolved ticket corpus whose phase graph is checked.
 * @param baseline Clean-HEAD package declarations and active root lockfiles.
 * @param [registry] Platform adapter registry; injectable for non-Node platforms and tests.
 * @returns Deduplicated causal findings; an empty list means the scaffold is executable.
 */
export function checkScaffoldFeasibility(
  refs: readonly TicketCorpusRef[],
  baseline: ScaffoldPackageBaseline,
  registry: CapabilityAdapterRegistry = DEFAULT_CAPABILITY_ADAPTER_REGISTRY
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
  findings.push(...capabilityFindings(nodes, dependenciesByTicket, registry));
  for (const node of nodes) {
    const plan = resolvePhaseVerificationPlan({
      refs,
      ticketFile: node.ticketFile,
      phaseId: node.phaseId,
      scripts: baseline.scripts ?? {},
      availableArtifacts: baseline.availableArtifacts ?? new Set(),
      registry,
      mode: 'planning',
    });
    if (!plan) continue;
    for (const gate of plan.gates.filter(
      (candidate) =>
        candidate.required &&
        ['PREREQUISITE_PENDING', 'PREREQUISITE_MISSING', 'COMMAND_MISSING'].includes(
          candidate.state
        )
    )) {
      const code =
        gate.state === 'PREREQUISITE_PENDING'
          ? 'SDD_SCAFFOLD_PHASE_GATE_PREREQUISITE_FUTURE'
          : gate.state === 'COMMAND_MISSING'
            ? 'SDD_SCAFFOLD_PHASE_GATE_COMMAND_MISSING'
            : 'SDD_SCAFFOLD_PHASE_GATE_PREREQUISITE_MISSING';
      findings.push(
        finding(
          node.ticketFile,
          code,
          `${capabilityOwnerRef(node)} canonical gate '${gate.name}' is ${gate.state}${gate.prerequisites.length ? ` for ${gate.prerequisites.join(', ')}` : ''}. Expected: every required gate is CONFIGURED before execute. Next: ${gate.next}.`
        )
      );
    }
  }

  const adaptersInUse = [
    ...new Set(
      nodes.map((node) => node.capabilityAdapter).filter((id): id is string => Boolean(id))
    ),
  ].flatMap((id) => (registry[id] ? [registry[id]] : []));
  const dependencyBoundaries = adaptersInUse.flatMap((adapter) =>
    adapter.dependencyBoundary ? [adapter.dependencyBoundary] : []
  );
  const dependencyInstallPlanned = nodes.some((node) => node.action === 'dependency-install');
  const sharedArtifacts = [
    ...new Set([
      ...(dependencyBoundaries.length > 0
        ? dependencyBoundaries.flatMap((boundary) => [boundary.manifestPath, boundary.lockfilePath])
        : neededPackages.size > 0
          ? ['package.json']
          : []),
      ...baseline.activeLockfiles,
    ]),
  ];
  const ownersByArtifact = new Map(
    sharedArtifacts.map((artifact) => [
      artifact,
      nodes.filter((node) => node.targets.includes(artifact)),
    ])
  );
  for (const [artifact, owners] of ownersByArtifact) {
    if (owners.length === 0) {
      if (neededPackages.size > 0 || dependencyInstallPlanned) {
        findings.push(
          finding(
            '(scaffold graph)',
            'SDD_SCAFFOLD_SHARED_ARTIFACT_OWNER_MISSING',
            `${artifact} has no exact bootstrap phase owner although dependency materialization is planned. Expected: the manifest and future/active lockfile have an exact DAG owner. Next: add the artifact to the dependency-install phase Target Files.`
          )
        );
      }
      continue;
    }
    const unorderedPairs: string[] = [];
    for (let left = 0; left < owners.length; left += 1) {
      for (let right = left + 1; right < owners.length; right += 1) {
        const a = owners[left] as PhaseNode;
        const b = owners[right] as PhaseNode;
        if (!strictlyOrdered(nodes, dependenciesByTicket, a, b)) {
          unorderedPairs.push(`${capabilityOwnerRef(a)} ↔ ${capabilityOwnerRef(b)}`);
        }
      }
    }
    if (unorderedPairs.length > 0) {
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_SHARED_ARTIFACT_WRITER_OVERLAP',
          `${artifact} has unordered writers ${unorderedPairs.join(', ')}. Expected: every writer pair is strictly serialized by the phase/task DAG. Next: add the missing dependency edge before execute.`
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
          `${node.ticketId}/${node.phaseId} Provides Packages but Bootstrap Action is not dependency-install. Expected: every package mutation declares Bootstrap Action: dependency-install. Next: add the action or remove the package ownership claim.`
        )
      );
    }
    if (node.action === 'dependency-install') {
      const adapter = node.capabilityAdapter ? registry[node.capabilityAdapter] : undefined;
      const boundary = adapter?.dependencyBoundary;
      if (!boundary) continue;
      const requiredTargets = [
        boundary.manifestPath,
        boundary.lockfilePath,
        ...baseline.activeLockfiles,
      ];
      const missingTargets = [...new Set(requiredTargets)].filter(
        (artifact) => !node.targets.includes(artifact)
      );
      if (missingTargets.length > 0) {
        findings.push(
          finding(
            node.ticketFile,
            'SDD_SCAFFOLD_PACKAGE_PROVIDER_TARGETS_INCOMPLETE',
            `${node.ticketId}/${node.phaseId} is dependency-install but does not own ${missingTargets.join(', ')}. Expected: the selected adapter's manifest and future/active lockfile are Target Files of every dependency writer. Next: add the missing paths to this phase and rerun scaffold feasibility.`
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
            `${consumer.ticketId}/${consumer.phaseId} requires package '${pkg}', but no dependency-install phase Provides Packages for it. Expected: one DAG-reachable dependency-install provider. Next: add ${pkg} to Provides Packages on the phase that writes the adapter manifest+lock, serialize that writer before this consumer, then rerun scaffold feasibility.`
          )
        );
        continue;
      }
      const currentProviders = currentReachableProviders(
        nodes,
        dependenciesByTicket,
        consumer,
        providers
      );
      if (currentProviders.length > 1) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_PACKAGE_PROVIDER_AMBIGUOUS',
            `${consumer.ticketId}/${consumer.phaseId} requires package '${pkg}', but has multiple current reachable providers: ${currentProviders.map(capabilityOwnerRef).join(', ')}. Expected: exactly one current dependency writer. Next: serialize or consolidate the package providers, then rerun scaffold feasibility.`
          )
        );
        continue;
      }
      const provider = currentProviders[0];
      if (!provider) {
        findings.push(
          finding(
            consumer.ticketFile,
            'SDD_SCAFFOLD_TOOLCHAIN_PREREQ_MISSING',
            `${consumer.ticketId}/${consumer.phaseId} requires '${pkg}', but its declared providers (${providers.map(capabilityOwnerRef).join(', ')}) are not current/upstream in the phase/task DAG. Expected: the consumer reaches exactly one provider. Next: add the missing phase or ticket dependency before execute.`
          )
        );
        if (
          providers.some(
            (candidate) =>
              candidate.ticketId !== consumer.ticketId &&
              reaches(dependenciesByTicket, candidate.ticketId, consumer.ticketId)
          )
        )
          findings.push(
            finding(
              providers[0]?.ticketFile ?? consumer.ticketFile,
              'SDD_SCAFFOLD_BOOTSTRAP_REVERSE_DEP',
              `A provider of '${pkg}' depends on consumer ${consumer.ticketId}; reverse bootstrap ordering cannot execute from clean HEAD. Expected: provider → consumer order. Next: reverse the dependency edge and rerun scaffold feasibility.`
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
    const ticketTestPhases = nodes
      .filter((node) => node.ticketFile === ref.file && node.kind.trim().toLowerCase() === 'test')
      .map((node) => ({ phaseId: node.phaseId, targets: node.targets }));
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
      const owners = matchingTestPhaseIds(mapping.testFile, ticketTestPhases);
      if (owners.length === 0) {
        findings.push(
          finding(
            ref.file,
            'SDD_SCAFFOLD_BDD_COMMAND_TEST_PHASE_MISSING',
            `Scenario '${scenario.name}' maps command '${mapping.probeCommand}' to '${mapping.testFile}', but no test phase owns that future CREATE test file.`
          )
        );
        continue;
      }
      if (owners.length > 1) {
        findings.push(
          finding(
            ref.file,
            'SDD_SCAFFOLD_BDD_COMMAND_TEST_PHASE_AMBIGUOUS',
            `Scenario '${scenario.name}' maps command '${mapping.probeCommand}' to '${mapping.testFile}', owned by multiple test phases: ${owners.join(', ')}.`
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
