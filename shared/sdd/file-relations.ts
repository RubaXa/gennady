// @file: Deterministic read-only SDD v2 file-relations resolver over caller-supplied evidence.
// @consumers: FO-3 orient adapter, FO-4 sdd-check integration, FO-5 workflow consumers
// @tasks: N/A

import { inspectRepoPath } from '../common/repo-path.ts';
import { hasActiveBlocker } from './execution-log.ts';
import { extractSection } from './section.ts';
import { parseMetaInfo, parsePhaseDetail, parsePhasesOverview } from './ticket.ts';
import type {
  FileRelationEvidence,
  FileRelationEvidenceInput,
  FileRelationFinding,
  FileRelationFindingCode,
  FileRelationPhaseInput,
  FileRelationPhaseState,
  FileRelationsInput,
  FileRelationsResult,
  FileRelationTicketContentInput,
  FileRelationTicketInput,
  FileRelationTicketParseResult,
  FileRelationTicketStatus,
  FileTaskRelation,
} from './file-relations.types.ts';

const FINDING_ORDER: readonly FileRelationFindingCode[] = [
  'SDD_FILE_SPEC_OWNER_UNRESOLVED',
  'SDD_FILE_SPEC_OWNER_AMBIGUOUS',
  'SDD_FILE_ACTIVE_WRITERS_COLLISION',
  'SDD_FILE_ACTIVE_SPEC_MISMATCH',
  'SDD_FILE_TARGET_PATH_INVALID',
  'SDD_FILE_PROVENANCE_UNKNOWN',
  'SDD_FILE_V2_TASKS_FORBIDDEN',
  'SDD_FILE_ACTIVE_PLANNED_OVERLAP',
];

const EVIDENCE_STRENGTH: Readonly<Record<FileRelationEvidence, number>> = {
  unknown: 0,
  declared: 1,
  active: 2,
  'declared-only-closed': 3,
  'verified-target': 4,
  'git-attributed': 5,
  deleted: 6,
};

function ticketStatus(raw: string | null): FileRelationTicketStatus {
  const status = raw?.trim().toUpperCase() ?? '';
  if (status.endsWith('TODO')) return 'todo';
  if (status.endsWith('IN_PROGRESS')) return 'in-progress';
  if (status.endsWith('BLOCKED')) return 'blocked';
  if (status.endsWith('DONE')) return 'done';
  return 'unknown';
}

function phaseState(raw: string): FileRelationPhaseState {
  const status = raw.trim().toUpperCase();
  if (status.startsWith('[~]') || status.endsWith('IN_PROGRESS')) return 'in-progress';
  if (status.startsWith('[!]') || status.endsWith('BLOCKED')) return 'blocked';
  if (status.startsWith('[X]') || status.endsWith('DONE')) return 'done';
  if (status.startsWith('[ ]') || status.endsWith('TODO')) return 'todo';
  return 'unknown';
}

function uniqueSorted(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @purpose Adapt one in-memory ticket through the canonical section/ticket parsers; no corpus scan,
 *   spec-registry guess, receipt validation or Git command occurs here.
 * @param input Ticket bytes plus caller-owned flow, spec-ref resolution and validated evidence.
 * @returns Structured ticket input or the first missing canonical boundary.
 */
export function fileRelationTicketFromContent(
  input: FileRelationTicketContentInput
): FileRelationTicketParseResult {
  const metaSection = extractSection(input.content, 'META');
  if (metaSection.status !== 'ok') return { ok: false, reason: 'meta-missing' };
  const overviewSection = extractSection(input.content, 'PHASES_OVERVIEW');
  if (overviewSection.status !== 'ok') return { ok: false, reason: 'overview-missing' };
  const meta = parseMetaInfo(metaSection.content);
  if (!meta.taskId || !meta.status) return { ok: false, reason: 'identity-missing' };

  const metaSpecIds = uniqueSorted(
    meta.specRefs.map((reference) =>
      input.resolveSpecReference(reference.anchor || reference.name, input.file)
    )
  );
  const phases: FileRelationPhaseInput[] = [];
  for (const overview of parsePhasesOverview(overviewSection.content)) {
    const phaseSection = extractSection(input.content, `PHASE_${overview.id}`);
    if (phaseSection.status !== 'ok') {
      return { ok: false, reason: 'phase-missing', phaseId: overview.id };
    }
    const detail = parsePhaseDetail(phaseSection.content);
    const specIds =
      detail.specRefs.length === 0
        ? metaSpecIds
        : uniqueSorted(
            detail.specRefs.map((reference) => input.resolveSpecReference(reference, input.file))
          );
    phases.push({
      id: overview.id,
      state: phaseState(overview.status),
      targetFiles: detail.targetFiles,
      deletedFiles: detail.deletedFiles,
      specIds,
      evidence: input.evidence?.[overview.id] ?? [],
    });
  }

  return {
    ok: true,
    ticket: {
      file: input.file,
      taskId: meta.taskId,
      dependencies: meta.dependencies,
      flow: input.flow,
      status: ticketStatus(meta.status),
      blockerActive: hasActiveBlocker(input.content),
      phases,
    },
  };
}

function finding(
  code: FileRelationFindingCode,
  message: string,
  data: Omit<FileRelationFinding, 'code' | 'message'> = { blocking: false }
): FileRelationFinding {
  return { code, message, ...data };
}

function relationKind(
  ticket: FileRelationTicketInput,
  phase: FileRelationPhaseInput
): FileTaskRelation['kind'] | null {
  if (ticket.status === 'done' || phase.state === 'done') return 'history';
  if (ticket.status === 'blocked' || ticket.blockerActive || phase.state === 'blocked') {
    return 'blocked';
  }
  if (phase.state === 'in-progress') return 'active';
  if (phase.state === 'todo' && (ticket.status === 'todo' || ticket.status === 'in-progress')) {
    return 'planned';
  }
  return null;
}

function strongestEvidence(
  base: FileRelationEvidence,
  candidates: readonly FileRelationEvidenceInput[]
): FileRelationEvidence {
  if (candidates.length === 0) return base;
  const concrete = candidates.filter((candidate) => candidate.kind !== 'unknown');
  if (concrete.length === 0) return 'unknown';
  let strongest = base;
  for (const candidate of concrete) {
    if (EVIDENCE_STRENGTH[candidate.kind] > EVIDENCE_STRENGTH[strongest]) {
      strongest = candidate.kind;
    }
  }
  return strongest;
}

function dependsOn(
  from: string,
  target: string,
  tickets: ReadonlyMap<string, FileRelationTicketInput>,
  seen: Set<string> = new Set()
): boolean {
  if (seen.has(from)) return false;
  seen.add(from);
  const ticket = tickets.get(from);
  if (!ticket) return false;
  return ticket.dependencies.some(
    (dependency) => dependency === target || dependsOn(dependency, target, tickets, seen)
  );
}

function hasUnserializedWriters(
  relations: readonly FileTaskRelation[],
  tickets: ReadonlyMap<string, FileRelationTicketInput>
): boolean {
  const writers = [...new Set(relations.map((relation) => relation.taskId))].sort(compareText);
  for (let left = 0; left < writers.length; left += 1) {
    for (let right = left + 1; right < writers.length; right += 1) {
      const first = writers[left];
      const second = writers[right];
      if (!first || !second) continue;
      const firstDependsOnSecond = dependsOn(first, second, tickets);
      const secondDependsOnFirst = dependsOn(second, first, tickets);
      if (firstDependsOnSecond === secondDependsOnFirst) return true;
    }
  }
  return false;
}

function baseEvidence(kind: FileTaskRelation['kind']): FileRelationEvidence {
  if (kind === 'active') return 'active';
  if (kind === 'history') return 'declared-only-closed';
  return 'declared';
}

function relationSort(left: FileTaskRelation, right: FileTaskRelation): number {
  return (
    compareText(left.taskId, right.taskId) ||
    compareText(left.phaseId, right.phaseId) ||
    compareText(left.target, right.target) ||
    compareText(left.targetKind, right.targetKind)
  );
}

function findingSort(left: FileRelationFinding, right: FileRelationFinding): number {
  return (
    FINDING_ORDER.indexOf(left.code) - FINDING_ORDER.indexOf(right.code) ||
    compareText(left.taskId ?? '', right.taskId ?? '') ||
    compareText(left.phaseId ?? '', right.phaseId ?? '') ||
    compareText(left.path ?? '', right.path ?? '') ||
    compareText(left.message, right.message)
  );
}

function exactPath(
  input: FileRelationsInput,
  raw: string
): { ok: true; path: string } | { ok: false; detail: string } {
  const inspected = inspectRepoPath(input.repoRoot, raw, 'potential');
  return inspected.ok ? { ok: true, path: inspected.relative } : inspected;
}

/**
 * @purpose Deterministically resolve one file's semantic owner and task relations from structured,
 *   caller-validated evidence without writing files, scanning a corpus, or caching state.
 * @invariant Exact normalized paths only; every relation has one evidence class; V1 scopes receive
 *   no new V2-only findings.
 * @param input Explicit root/file/flow, caller-resolved canonical spec, tickets and evidence.
 * @returns Stable typed relations and only finding codes fixed by the FO-1 ADR.
 */
export function resolveFileRelations(input: FileRelationsInput): FileRelationsResult {
  const query = exactPath(input, input.file);
  const file = query.ok ? query.path : input.file;
  const strictV2 = input.flow === 'v2';
  const findings: FileRelationFinding[] = [];
  const planned: FileTaskRelation[] = [];
  const active: FileTaskRelation[] = [];
  const blocked: FileTaskRelation[] = [];
  const history: FileTaskRelation[] = [];
  const ticketsById = new Map(input.tickets.map((ticket) => [ticket.taskId, ticket]));

  if (!query.ok && strictV2) {
    findings.push(
      finding('SDD_FILE_TARGET_PATH_INVALID', `Некорректный путь файла: ${query.detail}.`, {
        blocking: true,
        path: input.file,
      })
    );
  }
  if (strictV2 && input.spec.status === 'unresolved') {
    findings.push(
      finding('SDD_FILE_SPEC_OWNER_UNRESOLVED', 'Канонический владелец @spec не разрешён.', {
        blocking: true,
      })
    );
  }
  if (strictV2 && input.spec.status === 'ambiguous') {
    findings.push(
      finding('SDD_FILE_SPEC_OWNER_AMBIGUOUS', 'Канонический владелец @spec неоднозначен.', {
        blocking: true,
      })
    );
  }
  if (strictV2 && input.hasLegacyTasks) {
    findings.push(
      finding(
        'SDD_FILE_V2_TASKS_FORBIDDEN',
        'Мигрированный или новый V2-заголовок содержит legacy @tasks.',
        {
          blocking: true,
        }
      )
    );
  }

  if (query.ok) {
    for (const ticket of input.tickets) {
      for (const phase of ticket.phases) {
        const kind = relationKind(ticket, phase);
        if (!kind) continue;
        const claims = [
          ...phase.targetFiles.map((path) => ({ path, targetKind: 'target' as const })),
          ...phase.deletedFiles.map((path) => ({ path, targetKind: 'deleted' as const })),
        ];
        for (const claim of claims) {
          const target = exactPath(input, claim.path);
          if (!target.ok) {
            if (strictV2 && ticket.flow === 'v2') {
              findings.push(
                finding(
                  'SDD_FILE_TARGET_PATH_INVALID',
                  `Некорректный целевой путь: ${target.detail}.`,
                  {
                    blocking: true,
                    taskId: ticket.taskId,
                    phaseId: phase.id,
                    path: claim.path,
                  }
                )
              );
            }
            continue;
          }
          if (target.path !== query.path) continue;

          const evidence: FileRelationEvidenceInput[] = [];
          for (const candidate of phase.evidence ?? []) {
            const candidatePath = exactPath(input, candidate.path);
            if (candidatePath.ok && candidatePath.path === query.path) evidence.push(candidate);
          }
          const classified = strongestEvidence(baseEvidence(kind), evidence);
          const relation: FileTaskRelation = {
            kind,
            taskId: ticket.taskId,
            ticketFile: ticket.file,
            phaseId: phase.id,
            target: target.path,
            targetKind: claim.targetKind,
            evidence: classified,
          };
          (({ planned, active, blocked, history })[kind] as FileTaskRelation[]).push(relation);

          if (strictV2 && ticket.flow === 'v2' && classified === 'unknown') {
            findings.push(
              finding(
                'SDD_FILE_PROVENANCE_UNKNOWN',
                'Происхождение целевого файла не поддерживается или неоднозначно и остаётся unknown.',
                {
                  blocking: false,
                  taskId: ticket.taskId,
                  phaseId: phase.id,
                  path: target.path,
                }
              )
            );
          }
          if (
            strictV2 &&
            ticket.flow === 'v2' &&
            kind === 'active' &&
            input.spec.status === 'resolved' &&
            !phase.specIds.includes(input.spec.id)
          ) {
            findings.push(
              finding(
                'SDD_FILE_ACTIVE_SPEC_MISMATCH',
                `Активная фаза тикета не ссылается на каноническую спецификацию ${input.spec.id}.`,
                {
                  blocking: true,
                  taskId: ticket.taskId,
                  phaseId: phase.id,
                  path: target.path,
                }
              )
            );
          }
        }
      }
    }
  }

  const v2Active = active.filter((relation) => ticketsById.get(relation.taskId)?.flow === 'v2');
  const v2Planned = planned.filter((relation) => ticketsById.get(relation.taskId)?.flow === 'v2');
  if (strictV2 && hasUnserializedWriters(v2Active, ticketsById)) {
    findings.push(
      finding(
        'SDD_FILE_ACTIVE_WRITERS_COLLISION',
        'Несериализованные активные тикеты заявляют один точный файл.',
        {
          blocking: true,
          path: file,
        }
      )
    );
  }
  if (
    strictV2 &&
    v2Active.some((activeRelation) =>
      v2Planned.some((plannedRelation) => plannedRelation.taskId !== activeRelation.taskId)
    )
  ) {
    findings.push(
      finding(
        'SDD_FILE_ACTIVE_PLANNED_OVERLAP',
        'Активные и запланированные работы разных тикетов заявляют один точный файл.',
        { blocking: false, path: file }
      )
    );
  }

  planned.sort(relationSort);
  active.sort(relationSort);
  blocked.sort(relationSort);
  history.sort(relationSort);
  findings.sort(findingSort);
  return {
    file,
    flow: input.flow,
    semanticOwner: {
      kind: 'semantic-owner',
      spec: input.spec,
      evidence: input.spec.status === 'resolved' ? 'declared' : 'unknown',
    },
    planned,
    active,
    blocked,
    history,
    findings,
  };
}
