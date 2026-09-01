// @file: Project bootstrap proof shared by spec approval and scaffold draft planning.
// @consumers: sdd-check, sdd-state, scaffold directives, tests
// @tasks: N/A

import type { Finding } from './finding.ts';
import { createHash } from 'node:crypto';
import {
  DEFAULT_CAPABILITY_ADAPTER_REGISTRY,
  type CapabilityAdapter,
  type CapabilityAdapterRegistry,
} from './capability-adapter.ts';
import { lexMarkdownTableRow, unescapeMarkdownTablePipes } from './markdown-table.ts';
import { extractSection } from './section.ts';
import { BOOTSTRAP_REQUIREMENTS_COLUMNS } from './spec-schema.ts';

/** @purpose Causal columns required before a Bootstrap Requirements table can be approved. */
export const PROJECT_BOOTSTRAP_COLUMNS = BOOTSTRAP_REQUIREMENTS_COLUMNS;

/** @purpose One scope spec and its already-approved project-graph dependencies. */
export type ProjectSpecRef = {
  /** @purpose Repo-relative spec path used in diagnostics and digest binding. */
  file: string;
  /** @purpose Portal scope that owns this spec. */
  scope: string;
  /** @purpose Direct upstream portal dependencies visible to this scope. */
  dependencies: string[];
  /** @purpose Exact spec bytes checked by the project barrier. */
  content: string;
};

/** @purpose One pre-Gate-1 node with exact requirement coverage and executable capability facts. */
export type ScaffoldDraftPlanNode = {
  /** @purpose Globally unique planned phase identity `<Task-ID>/<Phase-ID>`. */
  id: string;
  /** @purpose Scope that owns the planned phase. */
  scope: string;
  /** @purpose Exact predecessor node identities. */
  dependencies: string[];
  /** @purpose Approved Bootstrap Requirement IDs materialized by this node. */
  requirementIds: string[];
  /** @purpose Registered capability adapter copied from the requirements. */
  adapter: string;
  /** @purpose Machine action required at this phase boundary. */
  action: 'dependency-install' | null;
  /** @purpose Exact repo-relative files or structured artifact paths written by the node. */
  targets: string[];
  /** @purpose Capability IDs produced by the node. */
  provides: string[];
  /** @purpose Capability IDs that must precede the node. */
  requires: string[];
};

/** @purpose Machine-readable scaffold plan checked before the operator sees Gate 1. */
export type ScaffoldDraftPlan = {
  /** @purpose Versioned wire schema for the pre-Gate-1 proof artifact. */
  schema: 'sdd-scaffold-plan/v1';
  /** @purpose Exact checked spec roster and content digests. */
  specs: Array<{ path: string; digest: string }>;
  /** @purpose Complete proposed phase graph shown at Gate 1. */
  nodes: ScaffoldDraftPlanNode[];
};

/** @purpose Frozen spec evidence and requirement roster consumed by scaffold plan authoring. */
type ProjectFeasibilityContext = {
  schema: 'sdd-project-feasibility/v1';
  specs: Array<{ path: string; digest: string }>;
  requirements: Array<{
    id: string;
    scope: string;
    owner: string;
    adapter: string;
    provides: string[];
    requires: string[];
    artifacts: string[];
  }>;
};

/** @purpose Parsed causal Bootstrap Requirements row. */
type ProjectBootstrapRequirement = {
  file: string;
  scope: string;
  dependencies: string[];
  id: string;
  requirement: string;
  kind: string;
  owner: string;
  adapter: string;
  provides: string[];
  requires: string[];
  artifacts: string[];
};

type ParsedSpec =
  | { ok: true; requirements: ProjectBootstrapRequirement[] }
  | { ok: false; finding: Finding };

function finding(file: string, code: string, message: string): Finding {
  return { severity: 'error', code, file, message };
}

function splitList(value: string): string[] {
  const normalized = value.replace(/`/g, '').trim();
  if (!normalized || normalized === '—' || /^none$/i.test(normalized)) return [];
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function tableRows(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => lexMarkdownTableRow(line))
    .flatMap((row) => (row.ok ? [row.cells.map(unescapeMarkdownTablePipes)] : []))
    .filter((cells) => cells.length > 0);
}

function sameColumns(actual: readonly string[]): boolean {
  return (
    actual.length === PROJECT_BOOTSTRAP_COLUMNS.length &&
    actual.every((value, index) => value === PROJECT_BOOTSTRAP_COLUMNS[index])
  );
}

function isSeparator(cells: readonly string[]): boolean {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

function parseSpec(ref: ProjectSpecRef): ParsedSpec {
  const section = extractSection(ref.content, 'BOOTSTRAP_REQUIREMENTS');
  if (section.status !== 'ok') {
    return {
      ok: false,
      finding: finding(
        ref.file,
        'SDD_PROJECT_BOOTSTRAP_SECTION_MISSING',
        `Scope '${ref.scope}' has no single readable BOOTSTRAP_REQUIREMENTS section. Expected: a causal Bootstrap Requirements table before spec approval.`
      ),
    };
  }
  const rows = tableRows(section.content);
  const headerIndex = rows.findIndex((cells) => cells.includes('Requirement'));
  const header = headerIndex >= 0 ? rows[headerIndex] : undefined;
  if (!header || !sameColumns(header)) {
    const actual = header?.join(', ') ?? '(no table header)';
    return {
      ok: false,
      finding: finding(
        ref.file,
        'SDD_PROJECT_BOOTSTRAP_FACTS_MISSING',
        `Scope '${ref.scope}' Bootstrap Requirements columns [${actual}] cannot prove causal order. Expected: ${PROJECT_BOOTSTRAP_COLUMNS.join(', ')} before spec approval. Next: run evolve-scope from the external-dependencies audit and declare stable IDs plus adapter/provider/requirement facts.`
      ),
    };
  }
  const index = Object.fromEntries(header.map((name, position) => [name, position])) as Record<
    (typeof PROJECT_BOOTSTRAP_COLUMNS)[number],
    number
  >;
  const requirements: ProjectBootstrapRequirement[] = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    if (isSeparator(cells)) continue;
    const id = cells[index.ID]?.replace(/`/g, '').trim() ?? '';
    const requirement = cells[index.Requirement]?.trim() ?? '';
    if (!id && !requirement) continue;
    requirements.push({
      file: ref.file,
      scope: ref.scope,
      dependencies: [...ref.dependencies],
      id,
      requirement,
      kind: cells[index.Kind]?.replace(/`/g, '').trim() ?? '',
      owner: cells[index.Owner]?.replace(/`/g, '').trim() ?? '',
      adapter: cells[index['Capability Adapter']]?.replace(/`/g, '').trim() ?? '',
      provides: splitList(cells[index['Provides Capabilities']] ?? ''),
      requires: splitList(cells[index['Requires Capabilities']] ?? ''),
      artifacts: splitList(cells[index['Gate Artifacts']] ?? ''),
    });
  }
  return { ok: true, requirements };
}

function reachesScope(
  dependencies: ReadonlyMap<string, readonly string[]>,
  consumer: string,
  provider: string
): boolean {
  if (consumer === provider) return true;
  const seen = new Set<string>();
  const queue = [...(dependencies.get(consumer) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (current === provider) return true;
    seen.add(current);
    queue.push(...(dependencies.get(current) ?? []));
  }
  return false;
}

function adapterCapabilityIds(adapter: CapabilityAdapter): Set<string> {
  return new Set([
    ...adapter.artifacts.map((artifact) => artifact.id),
    ...adapter.layers.map((layer) => layer.capability),
  ]);
}

function requirementRef(requirement: ProjectBootstrapRequirement): string {
  return `${requirement.scope}/${requirement.id || '(missing ID)'}`;
}

/**
 * @purpose Stable digest binding one plan to the exact spec bytes it decomposes.
 * @param content Exact spec bytes.
 * @returns SHA-256 digest with its algorithm prefix.
 */
export function projectSpecDigest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function parseProject(refs: readonly ProjectSpecRef[]): {
  findings: Finding[];
  requirements: ProjectBootstrapRequirement[];
} {
  const findings: Finding[] = [];
  const requirements: ProjectBootstrapRequirement[] = [];
  for (const ref of refs) {
    const parsed = parseSpec(ref);
    if (!parsed.ok) findings.push(parsed.finding);
    else requirements.push(...parsed.requirements);
  }
  return { findings, requirements };
}

function declaredFactsFindings(
  requirements: readonly ProjectBootstrapRequirement[],
  registry: CapabilityAdapterRegistry
): Finding[] {
  const findings: Finding[] = [];
  const ids = new Map<string, ProjectBootstrapRequirement[]>();
  for (const requirement of requirements) {
    const idOwners = ids.get(requirement.id) ?? [];
    idOwners.push(requirement);
    ids.set(requirement.id, idOwners);
    if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(requirement.id)) {
      findings.push(
        finding(
          requirement.file,
          'SDD_PROJECT_BOOTSTRAP_ID_INVALID',
          `${requirementRef(requirement)} needs a stable project-unique ID such as INFRA-NODE-RUNTIME.`
        )
      );
    }
    const adapterId = requirement.adapter === '—' ? '' : requirement.adapter;
    const hasCapabilityFacts = requirement.provides.length > 0 || requirement.requires.length > 0;
    if (!adapterId && !hasCapabilityFacts) continue;
    const adapter = registry[adapterId];
    if (!adapter) {
      findings.push(
        finding(
          requirement.file,
          'SDD_PROJECT_CAPABILITY_ADAPTER_UNKNOWN',
          `${requirementRef(requirement)} names Capability Adapter '${requirement.adapter || '(empty)'}'. Expected: ${Object.keys(registry).sort().join(', ')}, or — only when Provides/Requires Capabilities are both —.`
        )
      );
      continue;
    }
    const known = adapterCapabilityIds(adapter);
    if (
      requirement.owner === 'this-scope-task' &&
      requirement.kind === 'package' &&
      adapter.dependencyBoundary &&
      !requirement.provides.includes(adapter.dependencyBoundary.capability)
    ) {
      findings.push(
        finding(
          requirement.file,
          'SDD_PROJECT_PACKAGE_CAPABILITY_MISSING',
          `${requirementRef(requirement)} installs packages but does not provide '${adapter.dependencyBoundary.capability}'. Expected: declare the adapter dependency boundary so scaffold creates a dependency-install node.`
        )
      );
    }
    for (const capability of [...requirement.provides, ...requirement.requires]) {
      if (known.has(capability)) continue;
      findings.push(
        finding(
          requirement.file,
          'SDD_PROJECT_CAPABILITY_NOT_DECLARED_BY_ADAPTER',
          `${requirementRef(requirement)} uses '${capability}', which adapter '${adapter.id}' does not declare.`
        )
      );
    }
    for (const capability of requirement.provides) {
      const artifact = adapter.artifacts.find((candidate) => candidate.id === capability);
      if (!artifact || requirement.artifacts.includes(artifact.location.path)) continue;
      findings.push(
        finding(
          requirement.file,
          'SDD_PROJECT_CAPABILITY_ARTIFACT_MISSING',
          `${requirementRef(requirement)} provides '${capability}' but Gate Artifacts omits '${artifact.location.path}'.`
        )
      );
    }
    for (const artifactPath of requirement.artifacts) {
      const matching = adapter.artifacts.filter(
        (artifact) => artifact.location.path === artifactPath
      );
      for (const artifact of matching) {
        if (
          requirement.provides.includes(artifact.id) ||
          requirement.requires.includes(artifact.id)
        )
          continue;
        findings.push(
          finding(
            requirement.file,
            'SDD_PROJECT_CAPABILITY_ARTIFACT_UNBOUND',
            `${requirementRef(requirement)} names Gate Artifact '${artifactPath}' but neither Provides nor Requires '${artifact.id}'. Expected: bind every recognized adapter artifact to its causal role.`
          )
        );
      }
    }
    for (const layer of adapter.layers.filter((candidate) =>
      requirement.provides.includes(candidate.capability)
    )) {
      for (const prerequisite of layer.requires) {
        if (
          requirement.provides.includes(prerequisite) ||
          requirement.requires.includes(prerequisite)
        )
          continue;
        findings.push(
          finding(
            requirement.file,
            'SDD_PROJECT_CAPABILITY_LAYER_REQUIREMENT_MISSING',
            `${requirementRef(requirement)} provides '${layer.capability}' without Requires Capabilities '${prerequisite}'.`
          )
        );
      }
    }
    const boundary = adapter.dependencyBoundary;
    if (boundary && requirement.provides.includes(boundary.capability)) {
      const dependencyArtifact = adapter.artifacts.find(
        (artifact) => artifact.id === boundary.capability
      );
      for (const prerequisite of adapter.artifacts.filter(
        (artifact) => dependencyArtifact && artifact.order < dependencyArtifact.order
      )) {
        if (
          requirement.provides.includes(prerequisite.id) ||
          requirement.requires.includes(prerequisite.id)
        )
          continue;
        findings.push(
          finding(
            requirement.file,
            'SDD_PROJECT_CAPABILITY_ARTIFACT_REQUIREMENT_MISSING',
            `${requirementRef(requirement)} materializes '${boundary.capability}' without declaring earlier artifact '${prerequisite.id}' in Provides or Requires Capabilities.`
          )
        );
      }
    }
  }
  for (const [id, owners] of ids) {
    if (!id || owners.length < 2) continue;
    findings.push(
      finding(
        owners[0]?.file ?? '(project specs)',
        'SDD_PROJECT_BOOTSTRAP_ID_DUPLICATE',
        `Bootstrap requirement ID '${id}' is declared by ${owners.map(requirementRef).join(', ')}. Expected: one project-wide owner.`
      )
    );
  }
  return findings;
}

/**
 * @purpose Reject scope specs whose combined bootstrap contract cannot be ordered project-wide.
 * @invariant A consumer sees providers only in its own scope or a transitive portal dependency.
 * @param refs Complete approved/draft scope-spec set with portal dependencies.
 * @param [registry] Platform adapter registry shared with scaffold feasibility.
 * @returns Causal findings; empty proves the spec set can be decomposed mechanically.
 */
export function checkProjectFeasibility(
  refs: readonly ProjectSpecRef[],
  registry: CapabilityAdapterRegistry = DEFAULT_CAPABILITY_ADAPTER_REGISTRY
): Finding[] {
  const parsed = parseProject(refs);
  if (parsed.findings.length > 0) return parsed.findings;
  const findings = declaredFactsFindings(parsed.requirements, registry);
  const dependencies = new Map(refs.map((ref) => [ref.scope, ref.dependencies] as const));
  const providers = new Map<string, ProjectBootstrapRequirement[]>();
  for (const requirement of parsed.requirements) {
    for (const capability of requirement.provides) {
      const current = providers.get(capability) ?? [];
      current.push(requirement);
      providers.set(capability, current);
    }
  }
  for (const consumer of parsed.requirements) {
    for (const capability of consumer.requires) {
      const owners = providers.get(capability) ?? [];
      const reachable = owners.filter((provider) =>
        reachesScope(dependencies, consumer.scope, provider.scope)
      );
      if (reachable.length > 0) continue;
      findings.push(
        finding(
          consumer.file,
          owners.length > 0
            ? 'SDD_PROJECT_CAPABILITY_PREREQUISITE_ORDER'
            : 'SDD_PROJECT_CAPABILITY_PROVIDER_MISSING',
          owners.length > 0
            ? `${requirementRef(consumer)} requires '${capability}', but providers ${owners.map(requirementRef).join(', ')} are downstream. Expected: provider must be in the same scope or an upstream dependency before spec approval.`
            : `${requirementRef(consumer)} requires '${capability}', but no Bootstrap Requirement provides it. Expected: one same-scope or upstream provider before spec approval.`
        )
      );
    }
  }
  return findings;
}

/**
 * @purpose Freeze the exact checked spec bytes and normalized causal rows for scaffold planning.
 * @param refs Same complete spec set passed to checkProjectFeasibility.
 * @returns Serializable proof context; callers emit it only after a clean check.
 */
export function deriveProjectFeasibilityContext(
  refs: readonly ProjectSpecRef[]
): ProjectFeasibilityContext {
  const project = parseProject(refs);
  return {
    schema: 'sdd-project-feasibility/v1',
    specs: refs
      .map((ref) => ({ path: ref.file, digest: projectSpecDigest(ref.content) }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    requirements: project.requirements
      .map((requirement) => ({
        id: requirement.id,
        scope: requirement.scope,
        owner: requirement.owner,
        adapter: requirement.adapter,
        provides: [...requirement.provides],
        requires: [...requirement.requires],
        artifacts: [...requirement.artifacts],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function reachesPlanNode(
  nodes: ReadonlyMap<string, ScaffoldDraftPlanNode>,
  consumer: ScaffoldDraftPlanNode,
  provider: ScaffoldDraftPlanNode
): boolean {
  if (consumer.id === provider.id) return true;
  const seen = new Set<string>();
  const queue = [...consumer.dependencies];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (current === provider.id) return true;
    seen.add(current);
    queue.push(...(nodes.get(current)?.dependencies ?? []));
  }
  return false;
}

/**
 * @purpose Prove the proposed pre-Gate-1 task/phase graph preserves every approved requirement once.
 * @invariant Requirement coverage and capability ordering are checked before ticket files exist.
 * @param refs Project specs already accepted by project feasibility.
 * @param plan Machine-readable proposed scaffold plan.
 * @param [registry] Same capability registry used by project and materialized-ticket checks.
 * @returns Mapping/order findings; empty authorizes presenting Gate 1.
 */
export function checkScaffoldDraftPlan(
  refs: readonly ProjectSpecRef[],
  plan: ScaffoldDraftPlan,
  registry: CapabilityAdapterRegistry = DEFAULT_CAPABILITY_ADAPTER_REGISTRY
): Finding[] {
  const project = parseProject(refs);
  if (project.findings.length > 0) return project.findings;
  const findings = [...declaredFactsFindings(project.requirements, registry)];
  const expectedSpecs = new Map(
    refs.map((ref) => [ref.file, projectSpecDigest(ref.content)] as const)
  );
  const observedSpecs = new Map(plan.specs.map((spec) => [spec.path, spec.digest] as const));
  for (const [path, digest] of expectedSpecs) {
    const observed = observedSpecs.get(path);
    if (observed === digest) continue;
    findings.push(
      finding(
        path,
        observed === undefined ? 'SDD_SCAFFOLD_PLAN_SPEC_MISSING' : 'SDD_SCAFFOLD_PLAN_SPEC_STALE',
        observed === undefined
          ? `The proposed plan omits checked spec '${path}'. Expected: copy the exact project-context spec roster before Gate 1.`
          : `The proposed plan digest for '${path}' is '${observed}', expected '${digest}'. Next: rerun project feasibility and rebuild the plan from fresh bytes.`
      )
    );
  }
  for (const path of observedSpecs.keys()) {
    if (expectedSpecs.has(path)) continue;
    findings.push(
      finding(
        '(scaffold plan)',
        'SDD_SCAFFOLD_PLAN_SPEC_UNKNOWN',
        `The proposed plan includes unchecked spec '${path}'. Expected: only paths from project-context.`
      )
    );
  }
  const ownedRequirements = project.requirements.filter(
    (requirement) => requirement.owner === 'this-scope-task'
  );
  const mappings = new Map<string, ScaffoldDraftPlanNode[]>();
  for (const node of plan.nodes) {
    for (const id of node.requirementIds) {
      const owners = mappings.get(id) ?? [];
      owners.push(node);
      mappings.set(id, owners);
    }
  }
  for (const requirement of ownedRequirements) {
    const nodes = mappings.get(requirement.id) ?? [];
    if (nodes.length === 0) {
      findings.push(
        finding(
          requirement.file,
          'SDD_SCAFFOLD_PLAN_REQUIREMENT_MISSING',
          `${requirementRef(requirement)} is approved for this-scope-task but absent from the proposed scaffold plan. Expected: map it to exactly one pre-Gate-1 node.`
        )
      );
    } else if (nodes.length > 1) {
      findings.push(
        finding(
          requirement.file,
          'SDD_SCAFFOLD_PLAN_REQUIREMENT_DUPLICATE',
          `${requirementRef(requirement)} is mapped by ${nodes.map((node) => node.id).join(', ')}. Expected: exactly one pre-Gate-1 owner.`
        )
      );
    }
  }
  const requirementById = new Map(
    project.requirements.map((requirement) => [requirement.id, requirement])
  );
  for (const node of plan.nodes) {
    const mapped = node.requirementIds.flatMap((id) => {
      const requirement = requirementById.get(id);
      return requirement ? [requirement] : [];
    });
    for (const id of node.requirementIds) {
      const requirement = requirementById.get(id);
      if (!requirement) {
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_REQUIREMENT_UNKNOWN',
            `${node.id} maps unknown Bootstrap Requirement '${id}'. Expected: only IDs from the checked spec set.`
          )
        );
        continue;
      }
      if (requirement.owner !== 'this-scope-task') {
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_REQUIREMENT_NOT_TASK_OWNED',
            `${node.id} maps '${id}' owned by '${requirement.owner}'. Expected: scaffold only this-scope-task requirements.`
          )
        );
      }
      if (requirement.scope !== node.scope) {
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_SCOPE_DRIFT',
            `${node.id} maps ${requirementRef(requirement)} into scope '${node.scope}'. Expected: keep the approved requirement in scope '${requirement.scope}'.`
          )
        );
      }
      if (requirement.adapter !== node.adapter) {
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_ADAPTER_DRIFT',
            `${node.id} maps ${requirementRef(requirement)} with adapter '${node.adapter || '(empty)'}', expected '${requirement.adapter || '(empty)'}'.`
          )
        );
      }
    }
    const expectedProvides = new Set(mapped.flatMap((requirement) => requirement.provides));
    const expectedRequires = new Set(mapped.flatMap((requirement) => requirement.requires));
    for (const capability of expectedProvides) {
      if (node.provides.includes(capability)) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_PROVIDES_DRIFT',
          `${node.id} maps approved requirements but drops provided capability '${capability}'.`
        )
      );
    }
    for (const capability of expectedRequires) {
      if (node.requires.includes(capability) || node.provides.includes(capability)) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_REQUIRES_DRIFT',
          `${node.id} maps approved requirements but drops required capability '${capability}'.`
        )
      );
    }
    for (const capability of node.provides) {
      if (expectedProvides.has(capability)) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_PROVIDES_UNAPPROVED',
          `${node.id} adds provided capability '${capability}' absent from its mapped requirements.`
        )
      );
    }
    for (const capability of node.requires) {
      if (expectedRequires.has(capability)) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_REQUIRES_UNAPPROVED',
          `${node.id} adds required capability '${capability}' absent from its mapped requirements.`
        )
      );
    }
    const expectsDependencyInstall = mapped.some((requirement) => {
      const adapter = registry[requirement.adapter];
      return requirement.kind === 'package' && adapter?.dependencyBoundary !== undefined;
    });
    if ((node.action === 'dependency-install') !== expectsDependencyInstall) {
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_ACTION_DRIFT',
          `${node.id} action is '${node.action ?? 'null'}'; mapped package boundary requires ${expectsDependencyInstall ? "'dependency-install'" : 'null'}.`
        )
      );
    }
  }
  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  if (nodesById.size !== plan.nodes.length) {
    findings.push(
      finding(
        '(scaffold plan)',
        'SDD_SCAFFOLD_PLAN_NODE_DUPLICATE',
        'The proposed plan has duplicate node IDs. Expected: one globally unique <Task-ID>/<Phase-ID> per node.'
      )
    );
  }
  for (const node of plan.nodes) {
    for (const dependency of node.dependencies) {
      if (nodesById.has(dependency)) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_DEPENDENCY_UNKNOWN',
          `${node.id} depends on unknown node '${dependency}'. Expected: an exact node ID from this plan.`
        )
      );
    }
  }
  for (const node of plan.nodes) {
    const cycle = node.dependencies.some((dependency) => {
      const predecessor = nodesById.get(dependency);
      return predecessor ? reachesPlanNode(nodesById, predecessor, node) : false;
    });
    if (!cycle) continue;
    findings.push(
      finding(
        '(scaffold plan)',
        'SDD_SCAFFOLD_PLAN_CYCLE',
        `${node.id} participates in a dependency cycle. Expected: an acyclic provider-to-consumer plan before Gate 1.`
      )
    );
  }
  const providers = new Map<string, ScaffoldDraftPlanNode[]>();
  for (const node of plan.nodes) {
    const hasCapabilityFacts =
      node.action !== null || node.provides.length > 0 || node.requires.length > 0;
    if (!node.adapter && !hasCapabilityFacts) continue;
    const adapter = registry[node.adapter];
    if (!adapter) {
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_ADAPTER_UNKNOWN',
          `${node.id} names adapter '${node.adapter || '(empty)'}'. Expected: ${Object.keys(registry).sort().join(', ')}.`
        )
      );
      continue;
    }
    for (const capability of node.provides) {
      const owners = providers.get(capability) ?? [];
      owners.push(node);
      providers.set(capability, owners);
      const artifact = adapter.artifacts.find((candidate) => candidate.id === capability);
      if (artifact && !node.targets.includes(artifact.location.path)) {
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_CAPABILITY_ARTIFACT_MISSING',
            `${node.id} provides '${capability}' but omits Target File '${artifact.location.path}'.`
          )
        );
      }
    }
  }
  for (const consumer of plan.nodes) {
    for (const capability of consumer.requires) {
      if (consumer.provides.includes(capability)) continue;
      const owners = providers.get(capability) ?? [];
      const reachable = owners.filter((provider) => reachesPlanNode(nodesById, consumer, provider));
      const current = reachable.filter(
        (candidate) =>
          !reachable.some(
            (other) => other.id !== candidate.id && reachesPlanNode(nodesById, other, candidate)
          )
      );
      if (current.length === 1) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          current.length === 0
            ? 'SDD_SCAFFOLD_PLAN_CAPABILITY_PREREQUISITE_ORDER'
            : 'SDD_SCAFFOLD_PLAN_CAPABILITY_PROVIDER_AMBIGUOUS',
          current.length === 0
            ? `${consumer.id} requires '${capability}', but providers ${owners.map((owner) => owner.id).join(', ') || '(none)'} do not precede it. Expected: add an explicit node dependency before Gate 1.`
            : `${consumer.id} requires '${capability}' from multiple current providers ${current.map((owner) => owner.id).join(', ')}. Expected: one current provider before Gate 1.`
        )
      );
    }
  }
  const writers = new Map<string, ScaffoldDraftPlanNode[]>();
  for (const node of plan.nodes) {
    for (const target of node.targets) {
      const owners = writers.get(target) ?? [];
      owners.push(node);
      writers.set(target, owners);
    }
  }
  for (const [target, owners] of writers) {
    const unordered: string[] = [];
    for (let left = 0; left < owners.length; left += 1) {
      for (let right = left + 1; right < owners.length; right += 1) {
        const a = owners[left] as ScaffoldDraftPlanNode;
        const b = owners[right] as ScaffoldDraftPlanNode;
        if (!reachesPlanNode(nodesById, a, b) && !reachesPlanNode(nodesById, b, a))
          unordered.push(`${a.id} ↔ ${b.id}`);
      }
    }
    if (unordered.length === 0) continue;
    findings.push(
      finding(
        '(scaffold plan)',
        'SDD_SCAFFOLD_PLAN_SHARED_WRITER_OVERLAP',
        `Target '${target}' has unordered writers ${unordered.join(', ')}. Expected: serialize every shared writer before Gate 1.`
      )
    );
  }
  return findings;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

/**
 * @purpose Prove materialized ticket phases are byte-independent semantic copies of the approved plan.
 * @invariant Ticket authoring may add prose/BDD, never alter plan ownership, edges, targets, or capabilities.
 * @param plan Exact pre-Gate-1 plan approved by the operator.
 * @param materialized Nodes parsed from the complete ticket corpus.
 * @returns Drift findings; empty binds the materialized graph to the approved plan.
 */
export function checkScaffoldPlanMaterialization(
  plan: ScaffoldDraftPlan,
  materialized: readonly ScaffoldDraftPlanNode[]
): Finding[] {
  const findings: Finding[] = [];
  const expected = new Map(plan.nodes.map((node) => [node.id, node] as const));
  const observed = new Map(materialized.map((node) => [node.id, node] as const));
  for (const [id, planned] of expected) {
    const actual = observed.get(id);
    if (!actual) {
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_PLAN_NODE_NOT_MATERIALIZED',
          `Approved plan node '${id}' has no materialized ticket phase.`
        )
      );
      continue;
    }
    const drift: string[] = [];
    if (planned.scope !== actual.scope) drift.push('scope');
    if (planned.adapter !== actual.adapter) drift.push('adapter');
    if (planned.action !== actual.action) drift.push('action');
    for (const [name, left, right] of [
      ['dependencies', planned.dependencies, actual.dependencies],
      ['requirementIds', planned.requirementIds, actual.requirementIds],
      ['targets', planned.targets, actual.targets],
      ['provides', planned.provides, actual.provides],
      ['requires', planned.requires, actual.requires],
    ] as const) {
      if (!sameStringSet(left, right)) drift.push(name);
    }
    if (drift.length > 0) {
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_PLAN_MATERIALIZATION_DRIFT',
          `${id} differs from the approved pre-Gate-1 plan in ${drift.join(', ')}. Expected: repair ticket authoring to match the plan; architecture changes require a new Gate 1 plan/digest.`
        )
      );
    }
  }
  for (const id of observed.keys()) {
    if (expected.has(id)) continue;
    findings.push(
      finding(
        '(scaffold graph)',
        'SDD_SCAFFOLD_PLAN_NODE_UNAPPROVED',
        `Materialized ticket phase '${id}' was not present in the approved pre-Gate-1 plan.`
      )
    );
  }
  return findings;
}
