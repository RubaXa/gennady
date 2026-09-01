// @file: Project bootstrap proof derived from the existing V2 spec format.
// @consumers: sdd-check, sdd-state, scaffold directives, tests
// @tasks: N/A

import { createHash } from 'node:crypto';
import type { Finding } from './finding.ts';
import { lexMarkdownTableRow, unescapeMarkdownTablePipes } from './markdown-table.ts';
import { extractSection } from './section.ts';
import { BOOTSTRAP_REQUIREMENTS_COLUMNS } from './spec-schema.ts';

/** @purpose Canonical V2 columns used by project bootstrap proof. */
export const PROJECT_BOOTSTRAP_COLUMNS = BOOTSTRAP_REQUIREMENTS_COLUMNS;

/** @purpose One portal scope spec and its direct upstream dependency set. */
export type ProjectSpecRef = {
  /** @purpose Repo-relative spec path used in diagnostics and digest binding. */
  file: string;
  /** @purpose Portal scope that owns the spec. */
  scope: string;
  /** @purpose Direct upstream portal scopes. */
  dependencies: string[];
  /** @purpose Exact spec bytes checked by the proof. */
  content: string;
};

/** @purpose One task phase proposed and checked before scaffold Gate 1. */
export type ScaffoldDraftPlanNode = {
  /** @purpose Unique planned phase identity `<Task-ID>/<Phase-ID>`. */
  id: string;
  /** @purpose Scope that owns this phase. */
  scope: string;
  /** @purpose Exact predecessor node identities. */
  dependencies: string[];
  /** @purpose Stable derived row references; they are not stored in specs. */
  requirementRefs: string[];
  /** @purpose Adapter derived from mapped V2 rows. */
  adapter: string;
  /** @purpose Dependency installation boundary, or null for other work. */
  action: 'dependency-install' | null;
  /** @purpose Exact repo-relative artifacts written by the node. */
  targets: string[];
  /** @purpose Derived capabilities materialized by the node. */
  provides: string[];
  /** @purpose Derived capabilities that must precede the node. */
  requires: string[];
};

/** @purpose Machine-readable pre-Gate-1 plan bound to exact spec bytes. */
export type ScaffoldDraftPlan = {
  /** @purpose Closed wire-schema discriminator. */
  schema: 'sdd-scaffold-plan/v1';
  /** @purpose Exact checked spec roster and content digests. */
  specs: Array<{ path: string; digest: string }>;
  /** @purpose Complete proposed phase graph. */
  nodes: ScaffoldDraftPlanNode[];
};

type ProjectFeasibilityContext = {
  schema: 'sdd-project-feasibility/v1';
  specs: Array<{ path: string; digest: string }>;
  requirements: Array<{
    ref: string;
    scope: string;
    owner: string;
    adapter: string;
    action: 'dependency-install' | null;
    provides: string[];
    requires: string[];
    artifacts: string[];
  }>;
};

type ProjectBootstrapRequirement = {
  file: string;
  scope: string;
  dependencies: string[];
  ref: string;
  requirement: string;
  kind: string;
  owner: string;
  resolution: string;
  gates: string[];
  artifacts: string[];
  adapter: string;
  action: 'dependency-install' | null;
  provides: string[];
  requires: string[];
};

type ParsedSpec =
  | { ok: true; requirements: ProjectBootstrapRequirement[] }
  | { ok: false; finding: Finding };

const NODE_PREREQUISITE_ARTIFACTS = [
  'node.runtime-version',
  'node.manifest-engine',
  'node.manifest-module-kind',
  'node.registry-config',
] as const;

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

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
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

/** @purpose Stable reference to one row without adding an ID column to the V2 spec. */
function requirementRef(
  file: string,
  scope: string,
  ordinal: number,
  cells: readonly string[]
): string {
  const digest = createHash('sha256')
    .update(`${file}\n${cells.join('\u001f')}`)
    .digest('hex')
    .slice(0, 12);
  return `${scope}:R${ordinal}:${digest}`;
}

function rowText(requirement: string, gates: readonly string[]): string {
  return `${requirement} ${gates.join(' ')}`.toLowerCase();
}

function qualityCapabilities(text: string): string[] {
  const capabilities: string[] = [];
  if (/\b(?:test|vitest|playwright|coverage)\b|тест|покрыт/.test(text))
    capabilities.push('typescript.test-tooling');
  if (/\b(?:lint|eslint)\b|линт/.test(text)) capabilities.push('typescript.eslint-lint-tooling');
  if (/\b(?:format|prettier)\b|формат/.test(text)) capabilities.push('typescript.format-tooling');
  return capabilities;
}

function deriveFacts(input: {
  requirement: string;
  kind: string;
  owner: string;
  gates: string[];
  artifacts: string[];
}): Pick<ProjectBootstrapRequirement, 'adapter' | 'action' | 'provides' | 'requires'> {
  const text = rowText(input.requirement, input.gates);
  const owned = input.owner === 'this-scope-task';
  const external = input.owner === 'external-prereq-scope';
  const give = (capabilities: readonly string[]) => (owned ? [...capabilities] : []);
  const need = (capabilities: readonly string[]) => (external ? [...capabilities] : []);

  if (input.kind.toLowerCase() === 'package' && owned)
    return {
      adapter: 'node',
      action: 'dependency-install',
      provides: ['node.dependencies'],
      requires: [...NODE_PREREQUISITE_ARTIFACTS, 'node.package-manager'],
    };

  const nodeArtifacts: string[] = [];
  if (input.artifacts.includes('.nvmrc')) nodeArtifacts.push('node.runtime-version');
  if (input.artifacts.includes('.npmrc')) nodeArtifacts.push('node.registry-config');
  if (
    input.artifacts.includes('package.json') &&
    /\b(?:node|npm|runtime|engine|module)\b|рантайм|движок|модул/.test(text)
  )
    nodeArtifacts.push('node.manifest-engine', 'node.manifest-module-kind');
  if (nodeArtifacts.length > 0) {
    const layerCapabilities = /\b(?:node|npm|runtime)\b|рантайм/.test(text)
      ? ['node.runtime', 'node.package-manager']
      : [];
    return {
      adapter: 'node',
      action: null,
      provides: unique([...give(nodeArtifacts), ...give(layerCapabilities)]),
      requires: unique([...need(nodeArtifacts), ...need(layerCapabilities)]),
    };
  }

  if (
    input.artifacts.includes('tsconfig.json') ||
    /\btypescript compiler\b|компилятор typescript/.test(text)
  )
    return {
      adapter: 'typescript',
      action: null,
      provides: give(['typescript.compiler']),
      requires: unique([
        ...need(['typescript.compiler']),
        ...(owned ? ['node.package-manager', 'node.dependencies'] : []),
      ]),
    };

  const quality = qualityCapabilities(text);
  if (quality.length > 0)
    return {
      adapter: 'typescript-quality',
      action: null,
      provides: give(quality),
      requires: unique([
        ...need(quality),
        ...(owned ? ['typescript.compiler', 'node.dependencies'] : []),
      ]),
    };

  return { adapter: '', action: null, provides: [], requires: [] };
}

function parseSpec(ref: ProjectSpecRef): ParsedSpec {
  const section = extractSection(ref.content, 'BOOTSTRAP_REQUIREMENTS');
  if (section.status !== 'ok')
    return {
      ok: false,
      finding: finding(
        ref.file,
        'SDD_PROJECT_BOOTSTRAP_SECTION_MISSING',
        `Scope '${ref.scope}' has no single readable BOOTSTRAP_REQUIREMENTS section.`
      ),
    };
  const rows = tableRows(section.content);
  const headerIndex = rows.findIndex((cells) => cells.includes('Requirement'));
  const header = headerIndex >= 0 ? rows[headerIndex] : undefined;
  if (!header || !sameColumns(header))
    return {
      ok: false,
      finding: finding(
        ref.file,
        'SDD_PROJECT_BOOTSTRAP_FACTS_MISSING',
        `Scope '${ref.scope}' uses unsupported V2 Bootstrap Requirements columns [${header?.join(', ') ?? '(no table header)'}]. Expected: ${PROJECT_BOOTSTRAP_COLUMNS.join(', ')}. Repair it in the owning scope/infra authoring step; scaffold never migrates specs.`
      ),
    };
  const index = Object.fromEntries(header.map((name, position) => [name, position])) as Record<
    (typeof PROJECT_BOOTSTRAP_COLUMNS)[number],
    number
  >;
  const requirements: ProjectBootstrapRequirement[] = [];
  let ordinal = 0;
  for (const cells of rows.slice(headerIndex + 1)) {
    if (isSeparator(cells)) continue;
    const requirement = cells[index.Requirement]?.trim() ?? '';
    if (!requirement) continue;
    ordinal += 1;
    const kind = cells[index.Kind]?.replace(/`/g, '').trim() ?? '';
    const owner = cells[index.Owner]?.replace(/`/g, '').trim() ?? '';
    const resolution = cells[index.Resolution]?.replace(/`/g, '').trim() ?? '';
    const gates = splitList(cells[index['Readiness Gates']] ?? '');
    const artifacts = splitList(cells[index['Gate Artifacts']] ?? '');
    const facts = deriveFacts({ requirement, kind, owner, gates, artifacts });
    requirements.push({
      file: ref.file,
      scope: ref.scope,
      dependencies: [...ref.dependencies],
      ref: requirementRef(ref.file, ref.scope, ordinal, cells),
      requirement,
      kind,
      owner,
      resolution,
      gates,
      artifacts,
      ...facts,
    });
  }
  return { ok: true, requirements };
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

function reaches(
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

function label(requirement: ProjectBootstrapRequirement): string {
  return `${requirement.scope}/${requirement.ref}`;
}

/**
 * @purpose Bind scaffold planning to exact spec bytes.
 * @param content Exact spec content.
 * @returns SHA-256 digest with an algorithm prefix.
 */
export function projectSpecDigest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function declaredFindings(requirements: readonly ProjectBootstrapRequirement[]): Finding[] {
  const findings: Finding[] = [];
  const allowedOwners = new Set(['this-scope-task', 'external-prereq-scope', 'operator-action']);
  for (const item of requirements) {
    if (!item.kind || !item.resolution || !allowedOwners.has(item.owner))
      findings.push(
        finding(
          item.file,
          'SDD_PROJECT_BOOTSTRAP_ROW_INCOMPLETE',
          `${label(item)} must name Kind, a supported Owner, and Resolution.`
        )
      );
    if (item.owner === 'this-scope-task' && item.kind.toLowerCase() === 'package') {
      const missing = ['package.json', 'package-lock.json'].filter(
        (artifact) => !item.artifacts.includes(artifact)
      );
      if (missing.length > 0)
        findings.push(
          finding(
            item.file,
            'SDD_PROJECT_PACKAGE_ARTIFACTS_MISSING',
            `${label(item)} installs packages but omits ${missing.join(', ')} from Gate Artifacts. Both manifest and lockfile are required so writers can be ordered before Gate 1.`
          )
        );
    }
  }
  return findings;
}

/**
 * @purpose Prove current-format V2 specs have reachable prerequisites and orderable writers.
 * @param refs Complete portal scope-spec set and dependency edges.
 * @returns Blocking causal findings; empty means the project can enter scaffold planning.
 */
export function checkProjectFeasibility(refs: readonly ProjectSpecRef[]): Finding[] {
  const parsed = parseProject(refs);
  if (parsed.findings.length > 0) return parsed.findings;
  const findings = declaredFindings(parsed.requirements);
  const dependencies = new Map(refs.map((ref) => [ref.scope, ref.dependencies] as const));
  const capabilityProviders = new Map<string, ProjectBootstrapRequirement[]>();
  const artifactProviders = new Map<string, ProjectBootstrapRequirement[]>();
  for (const item of parsed.requirements.filter((row) => row.owner === 'this-scope-task')) {
    for (const capability of item.provides)
      capabilityProviders.set(capability, [...(capabilityProviders.get(capability) ?? []), item]);
    for (const artifact of item.artifacts)
      artifactProviders.set(artifact, [...(artifactProviders.get(artifact) ?? []), item]);
  }
  for (const consumer of parsed.requirements) {
    for (const capability of consumer.requires) {
      const providers = capabilityProviders.get(capability) ?? [];
      if (providers.some((provider) => reaches(dependencies, consumer.scope, provider.scope)))
        continue;
      findings.push(
        finding(
          consumer.file,
          providers.length > 0
            ? 'SDD_PROJECT_CAPABILITY_PREREQUISITE_ORDER'
            : 'SDD_PROJECT_CAPABILITY_PROVIDER_MISSING',
          `${label(consumer)} requires '${capability}', but no same-scope or upstream Bootstrap Requirement provides it. ${providers.length > 0 ? `Known providers are downstream: ${providers.map(label).join(', ')}.` : ''}`
        )
      );
    }
    if (consumer.owner !== 'external-prereq-scope') continue;
    for (const artifact of consumer.artifacts) {
      const providers = artifactProviders.get(artifact) ?? [];
      if (providers.some((provider) => reaches(dependencies, consumer.scope, provider.scope)))
        continue;
      findings.push(
        finding(
          consumer.file,
          'SDD_PROJECT_EXTERNAL_ARTIFACT_PROVIDER_MISSING',
          `${label(consumer)} delegates '${artifact}' to an external prerequisite scope, but no upstream this-scope-task row owns that artifact.`
        )
      );
    }
  }
  for (const [artifact, providers] of artifactProviders) {
    for (let left = 0; left < providers.length; left += 1)
      for (let right = left + 1; right < providers.length; right += 1) {
        const a = providers[left] as ProjectBootstrapRequirement;
        const b = providers[right] as ProjectBootstrapRequirement;
        if (reaches(dependencies, a.scope, b.scope) || reaches(dependencies, b.scope, a.scope))
          continue;
        findings.push(
          finding(
            a.file,
            'SDD_PROJECT_SHARED_WRITER_UNORDERED',
            `Gate Artifact '${artifact}' has unordered owners ${label(a)} and ${label(b)}. Add a scope dependency or consolidate ownership before approval.`
          )
        );
      }
  }
  return findings;
}

/**
 * @purpose Freeze checked spec bytes and derived row facts for scaffold planning.
 * @param refs Same complete scope-spec set passed to project feasibility.
 * @returns Serializable proof context emitted only after a clean check.
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
      .map((item) => ({
        ref: item.ref,
        scope: item.scope,
        owner: item.owner,
        adapter: item.adapter,
        action: item.action,
        provides: [...item.provides],
        requires: [...item.requires],
        artifacts: [...item.artifacts],
      }))
      .sort((left, right) => left.ref.localeCompare(right.ref)),
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

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * @purpose Prove the complete proposed DAG before Gate 1 and before ticket creation.
 * @param refs Exact scope-spec set used to derive the plan.
 * @param plan Proposed machine-readable phase graph.
 * @returns Coverage, freshness, order, cycle, and writer findings.
 */
export function checkScaffoldDraftPlan(
  refs: readonly ProjectSpecRef[],
  plan: ScaffoldDraftPlan
): Finding[] {
  const project = parseProject(refs);
  if (project.findings.length > 0) return project.findings;
  const findings = [...declaredFindings(project.requirements)];
  const expectedSpecs = new Map(refs.map((ref) => [ref.file, projectSpecDigest(ref.content)]));
  const observedSpecs = new Map(plan.specs.map((spec) => [spec.path, spec.digest]));
  for (const [path, digest] of expectedSpecs) {
    const observed = observedSpecs.get(path);
    if (observed === digest) continue;
    findings.push(
      finding(
        path,
        observed === undefined ? 'SDD_SCAFFOLD_PLAN_SPEC_MISSING' : 'SDD_SCAFFOLD_PLAN_SPEC_STALE',
        observed === undefined
          ? `The proposed plan omits checked spec '${path}'.`
          : `The proposed plan uses stale bytes for '${path}'. Rerun project-feasibility and rebuild the plan.`
      )
    );
  }
  for (const path of observedSpecs.keys())
    if (!expectedSpecs.has(path))
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_SPEC_UNKNOWN',
          `Unchecked spec '${path}' is present in the plan.`
        )
      );

  const owned = project.requirements.filter((item) => item.owner === 'this-scope-task');
  const byRef = new Map(project.requirements.map((item) => [item.ref, item]));
  const mappings = new Map<string, ScaffoldDraftPlanNode[]>();
  for (const node of plan.nodes)
    for (const ref of node.requirementRefs) mappings.set(ref, [...(mappings.get(ref) ?? []), node]);
  for (const item of owned) {
    const nodes = mappings.get(item.ref) ?? [];
    if (nodes.length !== 1)
      findings.push(
        finding(
          item.file,
          nodes.length === 0
            ? 'SDD_SCAFFOLD_PLAN_REQUIREMENT_MISSING'
            : 'SDD_SCAFFOLD_PLAN_REQUIREMENT_DUPLICATE',
          `${label(item)} must map to exactly one plan node; observed ${nodes.length}.`
        )
      );
  }

  for (const node of plan.nodes) {
    const mapped = node.requirementRefs.flatMap((ref) => {
      const item = byRef.get(ref);
      return item ? [item] : [];
    });
    for (const ref of node.requirementRefs) {
      const item = byRef.get(ref);
      if (!item) {
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_REQUIREMENT_UNKNOWN',
            `${node.id} maps unknown row '${ref}'.`
          )
        );
        continue;
      }
      if (item.owner !== 'this-scope-task')
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_REQUIREMENT_NOT_TASK_OWNED',
            `${node.id} maps '${ref}' owned by '${item.owner}'.`
          )
        );
      if (item.scope !== node.scope)
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_SCOPE_DRIFT',
            `${node.id} moves '${ref}' from '${item.scope}' to '${node.scope}'.`
          )
        );
    }
    const adapters = unique(mapped.map((item) => item.adapter).filter(Boolean));
    const expectedAdapter = adapters.length === 1 ? adapters[0] : '';
    if (adapters.length > 1)
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_ADAPTER_AMBIGUOUS',
          `${node.id} combines rows from adapters ${adapters.join(', ')}. Split the node.`
        )
      );
    else if (node.adapter !== expectedAdapter)
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_ADAPTER_DRIFT',
          `${node.id} adapter is '${node.adapter || '(empty)'}', expected '${expectedAdapter || '(empty)'}.`
        )
      );
    const expectedTargets = unique(mapped.flatMap((item) => item.artifacts));
    const expectedProvides = unique(mapped.flatMap((item) => item.provides));
    const expectedRequires = unique(mapped.flatMap((item) => item.requires));
    for (const [field, expected, actual] of [
      ['targets', expectedTargets, node.targets],
      ['provides', expectedProvides, node.provides],
      ['requires', expectedRequires, node.requires],
    ] as const)
      if (!sameSet(expected, actual))
        findings.push(
          finding(
            '(scaffold plan)',
            `SDD_SCAFFOLD_PLAN_${field.toUpperCase()}_DRIFT`,
            `${node.id} ${field} differ from its checked requirement rows.`
          )
        );
    const expectedAction = mapped.some((item) => item.action === 'dependency-install')
      ? 'dependency-install'
      : null;
    if (node.action !== expectedAction)
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_ACTION_DRIFT',
          `${node.id} action is '${node.action ?? 'null'}', expected '${expectedAction ?? 'null'}'.`
        )
      );
  }

  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  if (nodes.size !== plan.nodes.length)
    findings.push(
      finding(
        '(scaffold plan)',
        'SDD_SCAFFOLD_PLAN_NODE_DUPLICATE',
        'Plan node IDs must be unique.'
      )
    );
  for (const node of plan.nodes)
    for (const dependency of node.dependencies)
      if (!nodes.has(dependency))
        findings.push(
          finding(
            '(scaffold plan)',
            'SDD_SCAFFOLD_PLAN_DEPENDENCY_UNKNOWN',
            `${node.id} depends on unknown node '${dependency}'.`
          )
        );
  for (const node of plan.nodes) {
    const cyclic = node.dependencies.some((dependency) => {
      const predecessor = nodes.get(dependency);
      return predecessor ? reachesPlanNode(nodes, predecessor, node) : false;
    });
    if (cyclic)
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_CYCLE',
          `${node.id} participates in a dependency cycle.`
        )
      );
  }

  const capabilityProviders = new Map<string, ScaffoldDraftPlanNode[]>();
  const writers = new Map<string, ScaffoldDraftPlanNode[]>();
  for (const node of plan.nodes) {
    for (const capability of node.provides)
      capabilityProviders.set(capability, [...(capabilityProviders.get(capability) ?? []), node]);
    for (const target of node.targets) writers.set(target, [...(writers.get(target) ?? []), node]);
  }
  for (const consumer of plan.nodes)
    for (const capability of consumer.requires) {
      const providers = (capabilityProviders.get(capability) ?? []).filter((provider) =>
        reachesPlanNode(nodes, consumer, provider)
      );
      if (providers.length > 0) continue;
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_CAPABILITY_PREREQUISITE_ORDER',
          `${consumer.id} requires '${capability}', but no provider precedes it.`
        )
      );
    }
  for (const [target, owners] of writers) {
    const unordered: string[] = [];
    for (let left = 0; left < owners.length; left += 1)
      for (let right = left + 1; right < owners.length; right += 1) {
        const a = owners[left] as ScaffoldDraftPlanNode;
        const b = owners[right] as ScaffoldDraftPlanNode;
        if (!reachesPlanNode(nodes, a, b) && !reachesPlanNode(nodes, b, a))
          unordered.push(`${a.id} ↔ ${b.id}`);
      }
    if (unordered.length > 0)
      findings.push(
        finding(
          '(scaffold plan)',
          'SDD_SCAFFOLD_PLAN_SHARED_WRITER_OVERLAP',
          `Target '${target}' has unordered writers ${unordered.join(', ')}.`
        )
      );
  }
  return findings;
}

/**
 * @purpose Prove created ticket phases still match the approved technical plan.
 * @param plan Exact plan approved at Gate 1.
 * @param materialized Phase nodes parsed from created tickets.
 * @returns Drift findings; empty preserves the approved technical graph.
 */
export function checkScaffoldPlanMaterialization(
  plan: ScaffoldDraftPlan,
  materialized: readonly ScaffoldDraftPlanNode[]
): Finding[] {
  const findings: Finding[] = [];
  const expected = new Map(plan.nodes.map((node) => [node.id, node]));
  const observed = new Map(materialized.map((node) => [node.id, node]));
  for (const [id, planned] of expected) {
    const actual = observed.get(id);
    if (!actual) {
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_PLAN_NODE_NOT_MATERIALIZED',
          `Approved node '${id}' has no ticket phase.`
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
      ['targets', planned.targets, actual.targets],
      ['provides', planned.provides, actual.provides],
      ['requires', planned.requires, actual.requires],
    ] as const)
      if (!sameSet(left, right)) drift.push(name);
    if (drift.length > 0)
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_PLAN_MATERIALIZATION_DRIFT',
          `${id} differs from the approved plan in ${drift.join(', ')}.`
        )
      );
  }
  for (const id of observed.keys())
    if (!expected.has(id))
      findings.push(
        finding(
          '(scaffold graph)',
          'SDD_SCAFFOLD_PLAN_NODE_UNAPPROVED',
          `Ticket phase '${id}' was not in the approved plan.`
        )
      );
  return findings;
}
