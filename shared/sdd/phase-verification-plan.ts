// @file: Canonical structural phase profile and verify-ladder selection shared by planning and execution.
// @consumers: sdd-verify phase context, sdd-verify ladder, scaffold critic context
// @tasks: N/A

import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { extractSection } from './section.ts';
import {
  parseMetaInfo,
  parsePhaseDetail,
  parsePhasesOverview,
  parseTicketCoveragePolicy,
} from './ticket.ts';
import type { TicketCorpusRef } from './ticket-resolve.ts';
import {
  isDeclaredArgumentForwardingRepairBrick,
  isVacuousScript,
  resolveProjectScriptName,
} from './readiness.ts';

/** @purpose One canonical verify profile; full belongs only to the project-level verdict. */
export type VerificationProfile = 'setup' | 'code' | 'test' | 'full';

/**
 * @purpose Derive the canonical phase verify profile from its ticket kind.
 * @param kind Exact Kind cell from Phases Overview.
 * @returns Phase-owned profile, or null for an unsupported kind.
 */
export function phaseProfileForKind(kind: string): Exclude<VerificationProfile, 'full'> | null {
  const normalized = kind.trim().toLowerCase();
  if (['bootstrap', 'config', 'doc'].includes(normalized)) return 'setup';
  if (normalized === 'test') return 'test';
  if (['impl', 'refactor', 'fix'].includes(normalized)) return 'code';
  return null;
}

/**
 * @purpose Select exact canonical gate names for one profile and coverage-owner state.
 * @param profile Structurally derived phase profile or explicit project-level full profile.
 * @param [producesCoverage] Whether this test phase owns the coverage producer.
 * @returns Gate names in execution order.
 */
export function verificationGateNames(
  profile: VerificationProfile,
  producesCoverage = profile === 'test'
): readonly string[] {
  if (profile === 'full') return ['type-check', 'test:coverage', 'lint', 'format', 'yagni'];
  if (profile === 'test' && producesCoverage) return ['fix', 'type-check', 'test:coverage'];
  return ['fix', 'type-check', 'test'];
}

/**
 * @purpose Select gates whose absence makes the selected ladder fail closed.
 * @param profile Structurally derived phase profile or explicit full profile.
 * @param [producesCoverage] Whether this test phase owns the coverage producer.
 * @returns Required gate names in canonical order.
 */
export function requiredVerificationGateNames(
  profile: VerificationProfile,
  producesCoverage = profile === 'test'
): readonly string[] {
  if (profile === 'setup') return [];
  return verificationGateNames(profile, producesCoverage);
}

/** @purpose Exact pre-run and post-run state of one canonical phase gate. */
export type PhaseVerificationGateState =
  | 'DECLARED'
  | 'PREREQUISITE_PENDING'
  | 'PREREQUISITE_MISSING'
  | 'COMMAND_MISSING'
  | 'CONFIGURED'
  | 'PROVEN';

/** @purpose One canonical gate plus its structural provider and next action. */
export type PhaseVerificationGatePlan = {
  /** @purpose Canonical gate id used by the verification ladder. */
  name: string;
  /** @purpose Current structural or proven state of this gate. */
  state: PhaseVerificationGateState;
  /** @purpose Whether unresolved state must stop this phase. */
  required: boolean;
  /** @purpose Exact runnable command, or null until the command exists. */
  command: string | null;
  /** @purpose Reserved compatibility field; runtime gates no longer use capability prerequisites. */
  prerequisites: string[];
  /** @purpose Reserved compatibility field; infrastructure order belongs to semantic review. */
  provider: string | null;
  /** @purpose Deterministic next action for the current state. */
  next: string;
};

/** @purpose Shared phase verification plan consumed unchanged by task, feasibility, and verify. */
export type PhaseVerificationPlan = {
  /** @purpose Task id whose phase is planned. */
  ticket: string;
  /** @purpose Exact phase id within the task. */
  phase: string;
  /** @purpose Canonical phase verification profile. */
  profile: Exclude<VerificationProfile, 'full'>;
  /** @purpose Whether this phase owns the coverage-producing test command. */
  producesCoverage: boolean;
  /** @purpose Canonically ordered gate plans for this phase. */
  gates: PhaseVerificationGatePlan[];
};

/** @purpose Complete deterministic inputs for phase gate-state resolution. */
type PhaseVerificationPlanInput = {
  refs: readonly TicketCorpusRef[];
  ticketFile: string;
  phaseId: string;
  scripts: Readonly<Record<string, string>>;
  /** @deprecated Runtime verification is based on runnable commands, not inferred artifacts. */
  availableArtifacts: ReadonlySet<string>;
  /** @deprecated Capability registries no longer participate in phase verification. */
  registry?: unknown;
  mode?: 'planning' | 'runtime';
  profileOverride?: Exclude<VerificationProfile, 'full'>;
};

/**
 * @purpose Compatibility shim for callers that used to probe capability artifacts.
 * @returns Empty because real phase verification resolves runnable commands directly.
 */
export function phaseVerificationArtifactPaths(): string[] {
  return [];
}

type PlanNode = {
  ticket: string;
  file: string;
  ticketDependencies: string[];
  phase: string;
  kind: string;
  phaseDependencies: string[];
  readinessGates: string[];
  targets: string[];
  content: string;
};

function sameFile(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function planNodes(refs: readonly TicketCorpusRef[]): PlanNode[] {
  return refs.flatMap((ref) => {
    const metaSection = extractSection(ref.content, 'META');
    const overview = extractSection(ref.content, 'PHASES_OVERVIEW');
    if (overview.status !== 'ok') return [];
    const meta = metaSection.status === 'ok' ? parseMetaInfo(metaSection.content) : null;
    const ticket = meta?.taskId ?? ref.taskId ?? ref.file;
    const ticketDependencies = meta?.dependencies ?? ref.dependencies;
    return parsePhasesOverview(overview.content).flatMap((phase) => {
      const section = extractSection(ref.content, `PHASE_${phase.id}`);
      if (section.status !== 'ok') return [];
      const detail = parsePhaseDetail(section.content);
      return [
        {
          ticket,
          file: ref.file,
          ticketDependencies,
          phase: phase.id,
          kind: phase.kind,
          phaseDependencies: phase.deps,
          readinessGates: detail.readinessGates,
          targets: detail.targetFiles,
          content: ref.content,
        },
      ];
    });
  });
}

function ownedVerificationGateNames(current: PlanNode): string[] {
  const gateOrder = [
    ...new Set([
      ...verificationGateNames('code'),
      ...verificationGateNames('test', true),
      ...verificationGateNames('test', false),
      ...verificationGateNames('full'),
    ]),
  ];
  const direct = current.readinessGates.flatMap((gate) => {
    if (['fix', 'format:fix', 'lint:fix'].includes(gate)) return ['fix'];
    return gateOrder.includes(gate) ? [gate] : [];
  });
  const owned = new Set(direct);
  return gateOrder.filter((gate) => owned.has(gate));
}

function ticketReaches(nodes: readonly PlanNode[], from: string, target: string): boolean {
  if (from === target) return true;
  const dependencies = new Map(
    nodes.map((node) => [node.ticket, node.ticketDependencies] as const)
  );
  const seen = new Set<string>();
  const queue = [...(dependencies.get(from) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    if (next === target) return true;
    seen.add(next);
    queue.push(...(dependencies.get(next) ?? []));
  }
  return false;
}

function nodeReaches(nodes: readonly PlanNode[], from: PlanNode, target: PlanNode): boolean {
  if (from.ticket !== target.ticket) return ticketReaches(nodes, from.ticket, target.ticket);
  if (from.phase === target.phase) return true;
  const byPhase = new Map(
    nodes.filter((node) => node.ticket === from.ticket).map((node) => [node.phase, node] as const)
  );
  const seen = new Set<string>();
  const queue = [...from.phaseDependencies];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    if (next === target.phase) return true;
    seen.add(next);
    queue.push(...(byPhase.get(next)?.phaseDependencies ?? []));
  }
  return false;
}

/**
 * @purpose Prove one concrete ticket phase is ordered after another across the combined ticket/phase DAG.
 * @param refs Complete task corpus containing both phase nodes.
 * @param from Consumer phase whose dependency closure is traversed.
 * @param target Candidate provider phase expected in that closure.
 * @returns True when `from` reaches `target` through phase or ticket dependencies.
 */
export function phaseVerificationNodeReaches(
  refs: readonly TicketCorpusRef[],
  from: { ticketFile: string; phaseId: string },
  target: { ticketFile: string; phaseId: string }
): boolean {
  const nodes = planNodes(refs);
  const fromNode = nodes.find(
    (node) => sameFile(node.file, from.ticketFile) && node.phase === from.phaseId
  );
  const targetNode = nodes.find(
    (node) => sameFile(node.file, target.ticketFile) && node.phase === target.phaseId
  );
  return Boolean(fromNode && targetNode && nodeReaches(nodes, fromNode, targetNode));
}

function commandForGate(
  name: string,
  scripts: Readonly<Record<string, string>>,
  targets: readonly string[]
): string | null {
  if (name === 'fix') {
    if (targets.length === 0) return null;
    const leaves = ['format:fix', 'lint:fix'];
    return leaves.every(
      (leaf) =>
        scripts[leaf] !== undefined &&
        !isVacuousScript(scripts, leaf) &&
        isDeclaredArgumentForwardingRepairBrick(scripts, leaf)
    )
      ? 'target-repair'
      : null;
  }
  const script = resolveProjectScriptName(scripts as Record<string, string>, name);
  return script ? `npm run ${script}` : null;
}

function coverageProducer(current: PlanNode, profile: PhaseVerificationPlan['profile']): boolean {
  if (profile !== 'test') return false;
  const verification = extractSection(current.content, 'VERIFICATION');
  const policy =
    verification.status === 'ok'
      ? parseTicketCoveragePolicy(verification.content)
      : ({ status: 'legacy' } as const);
  if (policy.status === 'required') return policy.ownerPhase === current.phase;
  return policy.status === 'legacy';
}

type ReadinessOwnerRelation = 'current' | 'upstream' | 'downstream' | 'unordered';

function readinessOwnerRelation(
  nodes: readonly PlanNode[],
  current: PlanNode,
  owner: PlanNode
): ReadinessOwnerRelation {
  if (current.ticket === owner.ticket && current.phase === owner.phase) return 'current';
  if (nodeReaches(nodes, current, owner)) return 'upstream';
  if (nodeReaches(nodes, owner, current)) return 'downstream';
  return 'unordered';
}

function selectReadinessOwner(
  nodes: readonly PlanNode[],
  current: PlanNode,
  gate: string
): { node: PlanNode; relation: ReadinessOwnerRelation } | null {
  const owners = nodes
    .filter((node) => ownedVerificationGateNames(node).includes(gate))
    .map((node) => ({ node, relation: readinessOwnerRelation(nodes, current, node) }));
  return (
    owners.find((candidate) => candidate.relation === 'current') ??
    owners.find((candidate) => candidate.relation === 'upstream') ??
    owners.find(
      (candidate) => candidate.relation === 'downstream' && candidate.node.ticket === current.ticket
    ) ??
    null
  );
}

/**
 * @purpose Resolve canonical gate states from ticket shape and actually runnable project scripts.
 * @param input Ticket corpus, selected phase, and current project scripts.
 * @returns Exact plan, or null when the requested ticket/phase cannot be structurally resolved.
 */
export function resolvePhaseVerificationPlan(
  input: PhaseVerificationPlanInput
): PhaseVerificationPlan | null {
  const nodes = planNodes(input.refs);
  const current = nodes.find(
    (node) => sameFile(node.file, input.ticketFile) && node.phase === input.phaseId
  );
  if (!current) return null;
  const profile = input.profileOverride ?? phaseProfileForKind(current.kind);
  if (!profile) return null;
  const producesCoverage = coverageProducer(current, profile);
  const ownedNames = ownedVerificationGateNames(current);
  const requiredNames = new Set([
    ...requiredVerificationGateNames(profile, producesCoverage),
    ...ownedNames,
  ]);
  const gateNames = [
    ...new Set([...verificationGateNames(profile, producesCoverage), ...ownedNames]),
  ];
  const gates = gateNames.map((name): PhaseVerificationGatePlan => {
    const command = commandForGate(name, input.scripts, current.targets);
    const planning = (input.mode ?? 'runtime') === 'planning';
    const owner = selectReadinessOwner(nodes, current, name);
    const waitsForOwner = owner?.relation === 'downstream';
    const state: PhaseVerificationGateState = waitsForOwner
      ? 'PREREQUISITE_PENDING'
      : command
        ? 'CONFIGURED'
        : planning
          ? 'DECLARED'
          : 'COMMAND_MISSING';
    const provider = owner ? `${owner.node.ticket}/${owner.node.phase}` : null;
    const next = waitsForOwner
      ? `complete readiness owner ${provider} before running '${name}'`
      : command
        ? `run ${command}`
        : `declare a real '${name}' script before this gate becomes required`;
    return {
      name,
      state,
      required: requiredNames.has(name),
      command,
      prerequisites: [],
      provider,
      next,
    };
  });
  return { ticket: current.ticket, phase: current.phase, profile, producesCoverage, gates };
}

/**
 * @purpose Render one byte-stable gate-state line shared by task and verify.
 * @param gate Gate plan to render.
 * @returns Deterministic single-line gate state and next action.
 */
export function formatPhaseVerificationGatePlan(gate: PhaseVerificationGatePlan): string {
  return `gate-state: ${gate.name} ${gate.state} provider=${gate.provider ?? 'none'} next=${gate.next}`;
}

/**
 * @purpose Promote configured gates only after their real commands passed.
 * @param plan Canonical pre-run phase plan.
 * @param proven Gate ids whose real commands exited successfully.
 * @returns Copy of the plan with only executed configured gates promoted to PROVEN.
 */
export function markPhaseVerificationProven(
  plan: PhaseVerificationPlan,
  proven: ReadonlySet<string>
): PhaseVerificationPlan {
  return {
    ...plan,
    gates: plan.gates.map((gate) =>
      proven.has(gate.name) && gate.state === 'CONFIGURED' ? { ...gate, state: 'PROVEN' } : gate
    ),
  };
}
