// @file: Structural ownership of missing readiness gates shared by state, task, and phase verification.
// @consumers: sdd-state.cmd, sdd-task.cmd, phase-context
// @tasks: N/A

import { isAbsolute, relative, resolve, sep } from 'node:path';
import { proveRepoFile, readProvenRepoFile } from '../common/repo-file-identity.ts';
import type { TicketCorpusRef } from './ticket-resolve.ts';
import type { GraphEdge, Scope } from './portal.ts';
import { extractSection } from './section.ts';
import { parseMetaInfo, parsePhaseDetail, parsePhasesOverview } from './ticket.ts';
import type { ReadinessResult } from './readiness.ts';
import { resolveScopeDecomposition } from './module-specs.ts';
import type { SpecSchemaReport } from './spec-schema.ts';
import { checkProjectFeasibility, type ProjectSpecRef } from './project-feasibility.ts';

/** @purpose One canonical readiness fact identifier. */
export type ReadinessGate = string;
/** @purpose Exact active ticket phase proved to own one missing readiness fact. */
export type GateQueueOwner = {
  /** @purpose Missing readiness fact owned by this phase. */
  gate: ReadinessGate;
  /** @purpose Active ticket's exact Task-ID. */
  ticketId: string;
  /** @purpose Active ticket's path used for structural parsing. */
  ticketFile: string;
  /** @purpose Exact phase declaring the gate and its artifacts. */
  phaseId: string;
};
/** @purpose Actionable structural defect or advisory around missing-gate ownership. */
export type GateQueueDiagnostic = {
  /** @purpose Stable diagnostic discriminator. */
  kind:
    | 'infra-spec-no-tickets'
    | 'scope-name-mismatch'
    | 'gate-contract-missing'
    | 'gate-owner-missing'
    | 'gate-owner-ambiguous';
  /** @purpose Teaching explanation ready for CLI output. */
  message: string;
};
/** @purpose Complete fail-closed missing-gate ownership snapshot. */
export type GateQueueResult = {
  /** @purpose Unique ticket IDs accepted only when the entire mapping is unambiguous. */
  ticketIds: string[];
  /** @purpose Exact missing-gate phase owners. */
  owners: GateQueueOwner[];
  /** @purpose Advisory and blocking structural findings. */
  diagnostics: GateQueueDiagnostic[];
};

type BootstrapGateContract = { gate: ReadinessGate; artifacts: string[] };

/** @purpose Structural permission to scaffold while runtime gates are still absent. */
export type AuthoringReadinessResult = {
  /** @purpose True when every approved task-owning scope is independently scaffoldable. */
  ready: boolean;
  /** @purpose Aggregate blockers for an explicit all-scope scaffold. */
  diagnostics: string[];
  /** @purpose Target-specific facts consumed by scaffold instead of the aggregate. */
  scopes: AuthoringScopeReadiness[];
};

/** @purpose One portal scope's independent scaffold permission. */
export type AuthoringScopeReadiness = {
  /** @purpose Exact portal scope name used as the stable lookup key. */
  name: string;
  /** @purpose Yes/no for task owners; interface explicitly has no task owner. */
  status: 'yes' | 'no' | 'not-applicable';
  /** @purpose Target-local blockers plus genuinely project-wide missing-gate blockers. */
  diagnostics: string[];
};

function normalizeScopeName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '');
}
function splitList(value: string): string[] {
  const normalized = value.replace(/`/g, '').trim();
  if (!normalized || normalized === '—' || /^none$/i.test(normalized)) return [];
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function bootstrapGateContracts(content: string): {
  contracts: BootstrapGateContract[];
  reason?: string;
} {
  const section = extractSection(content, 'BOOTSTRAP_REQUIREMENTS');
  if (section.status !== 'ok')
    return {
      contracts: [],
      reason: `BOOTSTRAP_REQUIREMENTS is ${section.status.replace('_', ' ')}`,
    };
  const rows = section.content.split('\n').filter((line) => line.trimStart().startsWith('|'));
  const headerLine = rows.find((line) =>
    tableCells(line).some((cell) => /^readiness gates?$/i.test(cell))
  );
  if (!headerLine)
    return {
      contracts: [],
      reason: 'BOOTSTRAP_REQUIREMENTS needs Readiness Gates and Gate Artifacts columns',
    };
  const header = tableCells(headerLine);
  const gateIndex = header.findIndex((cell) => /^readiness gates?$/i.test(cell));
  const artifactIndex = header.findIndex((cell) => /^gate artifacts?$/i.test(cell));
  const requirementIndex = header.findIndex((cell) => /^requirement$/i.test(cell));
  const kindIndex = header.findIndex((cell) => /^kind$/i.test(cell));
  const ownerIndex = header.findIndex((cell) => /^owner$/i.test(cell));
  const resolutionIndex = header.findIndex((cell) => /^resolution$/i.test(cell));
  if (artifactIndex < 0)
    return { contracts: [], reason: 'BOOTSTRAP_REQUIREMENTS needs a Gate Artifacts column' };
  const contracts: BootstrapGateContract[] = [];
  for (const line of rows) {
    if (line === headerLine || /^\|?\s*:?-{2,}/.test(line.trim())) continue;
    const cells = tableCells(line);
    const rowName = cells[requirementIndex] || '<unnamed>';
    // The skeleton-sanctioned "no bootstrap" declaration (templates.ts: "No external bootstrap
    // required.") is a valid empty gate list, not an incomplete row — project-feasibility.ts skips
    // it identically. Without this parity gate-queue rejects the exact row the skeleton prints, so a
    // pure-function scope (e.g. a Fibonacci `nth`) with em-dash cells never becomes authoring-ready.
    if (/^no external bootstrap required\.?$/i.test(rowName.replace(/`/g, '').trim())) continue;
    for (const [label, index] of [
      ['Requirement', requirementIndex],
      ['Kind', kindIndex],
      ['Owner', ownerIndex],
      ['Resolution', resolutionIndex],
    ] as const) {
      const value = cells[index]?.replace(/`/g, '').trim();
      if (!value || value === '—')
        return { contracts: [], reason: `Bootstrap row '${rowName}' has no ${label}` };
    }
    const artifacts = splitList(cells[artifactIndex] ?? '');
    const owner = cells[ownerIndex]?.replace(/`/g, '').trim();
    for (const raw of splitList(cells[gateIndex] ?? '')) {
      if (owner !== 'this-scope-task')
        return {
          contracts: [],
          reason: `readiness gate '${raw}' must use Owner 'this-scope-task', got '${owner || 'empty'}'`,
        };
      if (artifacts.length === 0)
        return { contracts: [], reason: `readiness gate '${raw}' has no Gate Artifacts` };
      const unsafeArtifact = artifacts.find(
        (artifact) =>
          isAbsolute(artifact) ||
          /^[A-Za-z]:[\\/]/.test(artifact) ||
          artifact.split(/[\\/]/).includes('..') ||
          /[*?{}[\]]/.test(artifact)
      );
      if (unsafeArtifact)
        return {
          contracts: [],
          reason: `readiness gate '${raw}' has non-literal repo-relative Gate Artifact '${unsafeArtifact}'`,
        };
      contracts.push({ gate: raw as ReadinessGate, artifacts });
    }
  }
  return { contracts };
}

/** @purpose Read a portal-declared scope spec only as one identity-proven regular file below canonical specs/. */
function readScopeSpec(
  root: string,
  specPath: string
): { ok: true; content: string; path: string } | { ok: false; detail: string } {
  if (isAbsolute(specPath) || /^[A-Za-z]:[\\/]/.test(specPath)) {
    return {
      ok: false,
      detail: `unsafe portal specPath \`${specPath}\`: absolute paths are forbidden`,
    };
  }
  const portalRelative = specPath.replace(/^\.\//, '');
  const identity = proveRepoFile(root, `specs/${portalRelative}`);
  if (!identity.ok)
    return { ok: false, detail: `unsafe portal specPath \`${specPath}\`: ${identity.detail}` };
  if (!identity.identity.relative.startsWith('specs/')) {
    return { ok: false, detail: `portal specPath \`${specPath}\` is outside canonical specs/` };
  }
  const read = readProvenRepoFile(identity.identity);
  return read.ok
    ? { ok: true, content: read.content, path: identity.identity.absolute }
    : {
        ok: false,
        detail: `portal specPath \`${specPath}\` cannot be read safely: ${read.detail}`,
      };
}

/**
 * @purpose Decide whether scaffold has enough current structural evidence to create bootstrap nodes.
 * @invariant Runtime gate existence is irrelevant here; every missing alias must instead have one
 * complete infrastructure Bootstrap Requirements row. Interface scopes never own tickets.
 * @param scopes Portal scopes from the same snapshot.
 * @param readiness Runtime readiness from the same snapshot.
 * @param schema Whole-project structural schema diagnosis.
 * @param [root] Project root used for specs and decomposition.
 * @param [graphEdges] Portal dependency edges used for project-wide capability reachability.
 * @returns Independent authoring permission plus exact blockers.
 */
export function checkAuthoringReadiness(
  scopes: Scope[],
  readiness: ReadinessResult,
  schema: SpecSchemaReport,
  root = process.cwd(),
  graphEdges: readonly GraphEdge[] = []
): AuthoringReadinessResult {
  const infraContracts: BootstrapGateContract[] = [];
  const observedScopes = new Map<string, ReturnType<typeof readScopeSpec>>();
  for (const scope of scopes.filter((item) => item.status === 'done' && item.specPath)) {
    const observed = readScopeSpec(root, scope.specPath as string);
    observedScopes.set(scope.name, observed);
    if (!observed.ok || scope.type !== 'infrastructure') continue;
    const contracts = bootstrapGateContracts(observed.content);
    if (!contracts.reason) infraContracts.push(...contracts.contracts);
  }

  const sharedGateDiagnostics: string[] = [];
  for (const gate of missingReadinessGates(readiness)) {
    const owners = infraContracts.filter((contract) => contract.gate === gate);
    if (owners.length !== 1)
      sharedGateDiagnostics.push(
        owners.length === 0
          ? `missing runtime gate '${gate}' has no complete infrastructure Bootstrap Requirements owner row`
          : `missing runtime gate '${gate}' has ${owners.length} infrastructure Bootstrap Requirements owner rows`
      );
  }
  if (schema.status === 'current') {
    const projectRefs: ProjectSpecRef[] = [];
    for (const scope of scopes.filter(
      (item) => item.status === 'done' && item.type !== 'interface' && item.specPath
    )) {
      const observed = observedScopes.get(scope.name);
      if (!observed?.ok) continue;
      projectRefs.push({
        file: relative(root, observed.path).split(sep).join('/'),
        scope: scope.name,
        dependencies: graphEdges.filter((edge) => edge.from === scope.name).map((edge) => edge.to),
        content: observed.content,
      });
    }
    sharedGateDiagnostics.push(
      ...checkProjectFeasibility(projectRefs).map(
        (item) => `${item.code}: ${item.file}: ${item.message}`
      )
    );
  }

  const scopeFacts: AuthoringScopeReadiness[] = [];
  for (const scope of scopes) {
    if (scope.status !== 'done') {
      scopeFacts.push({
        name: scope.name,
        status: 'no',
        diagnostics: [`scope '${scope.name}' is not approved in the portal`],
      });
      continue;
    }
    if (scope.type === 'interface') {
      scopeFacts.push({
        name: scope.name,
        status: 'not-applicable',
        diagnostics: [`scope '${scope.name}' is interface and cannot own scaffold tickets`],
      });
      continue;
    }
    const diagnostics: string[] = [];
    if (!scope.specPath) {
      scopeFacts.push({
        name: scope.name,
        status: 'no',
        diagnostics: [`scope '${scope.name}' has no spec path`],
      });
      continue;
    }
    const observed = observedScopes.get(scope.name) ?? readScopeSpec(root, scope.specPath);
    if (!observed.ok) {
      scopeFacts.push({
        name: scope.name,
        status: 'no',
        diagnostics: [`scope '${scope.name}': ${observed.detail}`, ...sharedGateDiagnostics],
      });
      continue;
    }
    const decomposition = resolveScopeDecomposition(observed.path);
    const validDecomposition =
      decomposition.status === 'complete' || decomposition.status === 'flat';
    if (!validDecomposition)
      diagnostics.push(
        `scope '${scope.name}': ${decomposition.reason ?? 'scope decomposition is incomplete'}`
      );

    const targetPaths = new Set([
      relative(root, observed.path).split(sep).join('/'),
      ...decomposition.moduleSpecs.map((path) => relative(root, path).split(sep).join('/')),
    ]);
    for (const finding of schema.findings.filter(
      (item) => targetPaths.has(item.path) && item.status !== 'current'
    ))
      diagnostics.push(
        `scope '${scope.name}': ${finding.path} schema is ${finding.status} (${finding.reason})`
      );

    const contracts = bootstrapGateContracts(observed.content);
    if (contracts.reason) diagnostics.push(`scope '${scope.name}': ${contracts.reason}`);
    diagnostics.push(...sharedGateDiagnostics);
    scopeFacts.push({
      name: scope.name,
      status: diagnostics.length === 0 ? 'yes' : 'no',
      diagnostics: [...new Set(diagnostics)],
    });
  }

  const approvedTaskOwnerNames = new Set(
    scopes
      .filter((scope) => scope.status === 'done' && scope.type !== 'interface')
      .map((scope) => scope.name)
  );
  const taskOwningFacts = scopeFacts.filter((fact) => approvedTaskOwnerNames.has(fact.name));
  const diagnostics = taskOwningFacts.flatMap((fact) => fact.diagnostics);
  return {
    ready: taskOwningFacts.length > 0 && taskOwningFacts.every((fact) => fact.status === 'yes'),
    diagnostics: [...new Set(diagnostics)],
    scopes: scopeFacts,
  };
}

/**
 * @purpose Reduce readiness detail to exact gate identifiers requiring bootstrap ownership.
 * @param readiness Deterministic readiness snapshot.
 * @returns Missing or stubbed gates in canonical order.
 */
function missingReadinessGates(readiness: ReadinessResult): ReadinessGate[] {
  return readiness.missingGates;
}

function isActive(status: string | null): boolean {
  return /\b(?:TODO|IN_PROGRESS)\b/i.test(status ?? '');
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

/**
 * @purpose Resolve every missing readiness gate to exactly one structurally owning active infra phase.
 * @param refs Every discovered ticket reference.
 * @param scopes Portal scopes from the same project snapshot.
 * @param readiness Readiness facts from the same project snapshot.
 * @param [root] Project root used to resolve specs, tickets, and artifacts.
 * @returns Complete queue only when every missing gate has one owner; otherwise an empty queue plus diagnostics.
 */
export function queuedInfraGateTicketIds(
  refs: TicketCorpusRef[],
  scopes: Scope[],
  readiness: ReadinessResult,
  root = process.cwd()
): GateQueueResult {
  if (readiness.executionReady) return { ticketIds: [], owners: [], diagnostics: [] };
  const diagnostics: GateQueueDiagnostic[] = [];
  const owners: GateQueueOwner[] = [];
  const infraScopes = scopes.filter((scope) => scope.type === 'infrastructure');
  const exactNames = new Set(infraScopes.map((scope) => scope.name));
  const normalized = new Map(
    infraScopes.map((scope) => [normalizeScopeName(scope.name), scope.name])
  );
  for (const scope of infraScopes) {
    const related = refs.filter(
      (ref) => ref.scope && normalizeScopeName(ref.scope) === normalizeScopeName(scope.name)
    );
    if (scope.status === 'done' && related.length === 0)
      diagnostics.push({
        kind: 'infra-spec-no-tickets',
        message: `infra-спека \`${scope.name}\` одобрена, тикетов пока нет — нарежь scaffold'ом`,
      });
  }
  for (const ref of refs) {
    if (!ref.taskId || !ref.scope || !isActive(ref.status) || exactNames.has(ref.scope)) continue;
    const match = normalized.get(normalizeScopeName(ref.scope));
    if (match)
      diagnostics.push({
        kind: 'scope-name-mismatch',
        message: `область тикета '${ref.scope}' не совпала с порталом '${match}' (похожие имена)`,
      });
  }
  for (const gate of missingReadinessGates(readiness)) {
    const candidates: GateQueueOwner[] = [];
    let declared = false;
    for (const scope of infraScopes) {
      if (!scope.specPath) continue;
      const scopeSpec = readScopeSpec(root, scope.specPath);
      const parsed = scopeSpec.ok
        ? bootstrapGateContracts(scopeSpec.content)
        : { contracts: [], reason: scopeSpec.detail };
      if (parsed.reason) {
        diagnostics.push({
          kind: 'gate-contract-missing',
          message: `${scope.name}: ${parsed.reason}`,
        });
        continue;
      }
      const contracts = parsed.contracts.filter((contract) => contract.gate === gate);
      if (contracts.length === 0) continue;
      declared = true;
      for (const ref of refs.filter(
        (item) => item.scope === scope.name && item.taskId && isActive(item.status)
      )) {
        const ticket = ref.content;
        const meta = extractSection(ticket, 'META');
        if (meta.status !== 'ok' || parseMetaInfo(meta.content).scope !== scope.name) continue;
        const overview = extractSection(ticket, 'PHASES_OVERVIEW');
        if (overview.status !== 'ok') continue;
        for (const phase of parsePhasesOverview(overview.content)) {
          const body = extractSection(ticket, `PHASE_${phase.id}`);
          if (body.status !== 'ok') continue;
          const detail = parsePhaseDetail(body.content);
          if (!detail.readinessGates.includes(gate)) continue;
          const targets = detail.targetFiles.map((path) => resolve(root, path));
          const artifacts = contracts
            .flatMap((contract) => contract.artifacts)
            .map((path) => resolve(root, path));
          if (artifacts.every((artifact) => inside(root, artifact) && targets.includes(artifact)))
            candidates.push({
              gate,
              ticketId: ref.taskId as string,
              ticketFile: ref.file,
              phaseId: phase.id,
            });
        }
      }
    }
    if (candidates.length === 1) owners.push(candidates[0] as GateQueueOwner);
    else
      diagnostics.push({
        kind: candidates.length === 0 ? 'gate-owner-missing' : 'gate-owner-ambiguous',
        message:
          candidates.length === 0
            ? `missing gate '${gate}' has no exact active ticket phase owner${declared ? ' whose claim and Target Files match Bootstrap Requirements' : ' in Bootstrap Requirements'}`
            : `missing gate '${gate}' has multiple phase owners: ${candidates.map((owner) => `${owner.ticketId}/${owner.phaseId}`).join(', ')}`,
      });
  }
  const uniqueDiagnostics = [
    ...new Map(diagnostics.map((item) => [`${item.kind}:${item.message}`, item])).values(),
  ];
  const mappingInvalid = uniqueDiagnostics.some((item) =>
    ['gate-contract-missing', 'gate-owner-missing', 'gate-owner-ambiguous'].includes(item.kind)
  );
  const acceptedOwners = mappingInvalid ? [] : owners;
  return {
    owners: acceptedOwners,
    ticketIds: [...new Set(acceptedOwners.map((owner) => owner.ticketId))],
    diagnostics: uniqueDiagnostics,
  };
}

/**
 * @purpose Test exact phase membership in an already validated missing-gate queue.
 * @param queue Structural queue snapshot.
 * @param ticketId Candidate ticket ID.
 * @param phaseId Candidate phase ID.
 * @returns Whether that exact phase owns at least one accepted missing gate.
 */
export function phaseOwnsMissingReadinessGate(
  queue: GateQueueResult,
  ticketId: string,
  phaseId: string
): boolean {
  return queue.owners.some((owner) => owner.ticketId === ticketId && owner.phaseId === phaseId);
}
