// @file: Structural ownership of missing readiness gates shared by state, task, and phase verification.
// @consumers: sdd-state.cmd, sdd-task.cmd, phase-context
// @tasks: N/A

import { isAbsolute, relative, resolve, sep } from 'node:path';
import { proveRepoFile, readProvenRepoFile } from '../common/repo-file-identity.ts';
import type { TicketCorpusRef } from './ticket-resolve.ts';
import type { Scope } from './portal.ts';
import { extractSection } from './section.ts';
import { parseMetaInfo, parsePhaseDetail, parsePhasesOverview } from './ticket.ts';
import type { ReadinessResult } from './readiness.ts';

/** @purpose Closed platform-neutral readiness facts that bootstrap ownership may claim. */
export const READINESS_GATES = [
  'package.json',
  'type-check',
  'test',
  'test:coverage',
  'format',
  'format:fix',
  'lint',
  'lint:fix',
  'fix',
  'check',
  'gennady',
] as const;
/** @purpose One canonical readiness fact identifier. */
export type ReadinessGate = (typeof READINESS_GATES)[number];
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

function normalizeScopeName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '');
}
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.replace(/`/g, '').trim())
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
  if (artifactIndex < 0)
    return { contracts: [], reason: 'BOOTSTRAP_REQUIREMENTS needs a Gate Artifacts column' };
  const contracts: BootstrapGateContract[] = [];
  for (const line of rows) {
    if (line === headerLine || /^\|?\s*:?-{2,}/.test(line.trim())) continue;
    const cells = tableCells(line);
    const artifacts = splitList(cells[artifactIndex] ?? '');
    for (const raw of splitList(cells[gateIndex] ?? '')) {
      if (!(READINESS_GATES as readonly string[]).includes(raw))
        return { contracts: [], reason: `unknown readiness gate '${raw}'` };
      if (artifacts.length === 0)
        return { contracts: [], reason: `readiness gate '${raw}' has no Gate Artifacts` };
      contracts.push({ gate: raw as ReadinessGate, artifacts });
    }
  }
  return { contracts };
}

/** @purpose Read a portal-declared scope spec only as one identity-proven regular file below canonical specs/. */
function readScopeSpec(
  root: string,
  specPath: string
): { ok: true; content: string } | { ok: false; detail: string } {
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
    ? { ok: true, content: read.content }
    : {
        ok: false,
        detail: `portal specPath \`${specPath}\` cannot be read safely: ${read.detail}`,
      };
}

/**
 * @purpose Reduce readiness detail to exact gate identifiers requiring bootstrap ownership.
 * @param readiness Deterministic readiness snapshot.
 * @returns Missing or stubbed gates in canonical order.
 */
function missingReadinessGates(readiness: ReadinessResult): ReadinessGate[] {
  const missing = new Set<ReadinessGate>();
  if (!readiness.packageJsonPresent) missing.add('package.json');
  for (const item of readiness.required) if (!item.present) missing.add(item.name as ReadinessGate);
  for (const item of readiness.stubbed) missing.add(item as ReadinessGate);
  for (const detail of readiness.missing) {
    if (detail === 'package.json') missing.add('package.json');
    else if (detail.startsWith('lint→') || detail.startsWith('lint(')) missing.add('lint');
    else if (detail.startsWith('format(')) missing.add('format');
    else if (detail.startsWith('format:fix(')) missing.add('format:fix');
    else if (detail.startsWith('lint:fix(')) missing.add('lint:fix');
    else if (detail.startsWith('fix(')) missing.add('fix');
    else if (detail.startsWith('check(')) missing.add('check');
    else if (detail.startsWith('gennady')) missing.add('gennady');
    else if ((READINESS_GATES as readonly string[]).includes(detail))
      missing.add(detail as ReadinessGate);
  }
  return READINESS_GATES.filter((gate) => missing.has(gate));
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
