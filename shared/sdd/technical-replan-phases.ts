// @file: Insert a pending phase and transfer existing scenario files without rewriting product obligations.
// @spec: SHARED
// @consumers: technical-replan

import { extractSection, findSectionBounds, collectHeadings } from './section.ts';
import {
  parseTestCoverage,
  findUnparsedCoverageRows,
  matchingTestPhaseIds,
} from './bdd-coverage.ts';
import {
  matchPhaseOverviewHeader,
  parsePhaseDetail,
  parsePhasesOverview,
  rowCells,
  type PhaseOverview,
} from './ticket.ts';

/** @purpose One new phase inherits the source kind, rules and exit obligations, not a weaker policy. */
export type TechnicalPhaseInsertion = {
  /** @purpose New stable phase ID; existing or completed IDs are never reused. */
  id: string;
  /** @purpose Evidence-backed technical sub-objective; the original objective remains unchanged. */
  objective: string;
  /** @purpose Exact implementation/test paths declared for the new phase. */
  targets: string[];
  /** @purpose Original source prerequisites, repeated explicitly for replay verification. */
  dependencies: string[];
};

/**
 * @purpose Validate the complete bounded insertion descriptor, without executing project commands.
 * @param raw Decoded insertion descriptor.
 * @returns Valid typed descriptor, or null without coercion/ignored fields.
 */
export function parseTechnicalPhaseInsertion(raw: unknown): TechnicalPhaseInsertion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'dependencies,id,objective,targets') return null;
  if (
    typeof v.id !== 'string' ||
    !/^P[0-9]+$/.test(v.id) ||
    typeof v.objective !== 'string' ||
    !v.objective.trim() ||
    v.objective.length > 1600 ||
    /[\x00-\x1f\x7f\u2028\u2029<>`]/u.test(v.objective) ||
    !Array.isArray(v.targets) ||
    !v.targets.length ||
    v.targets.length > 32 ||
    v.targets.some((p) => typeof p !== 'string' || /[\x00-\x1f\x7f\u2028\u2029<>`]/u.test(p)) ||
    new Set(v.targets).size !== v.targets.length ||
    !Array.isArray(v.dependencies) ||
    v.dependencies.length > 64 ||
    v.dependencies.some((p) => typeof p !== 'string' || !/^P[0-9]+$/.test(p)) ||
    new Set(v.dependencies).size !== v.dependencies.length
  )
    return null;
  return v as TechnicalPhaseInsertion;
}

/** @purpose Rewrite only the mechanical target field; no unrelated section may be regenerated. */
function targetsBody(body: string, targets: readonly string[]): string | null {
  const lines = body.split('\n');
  const fields = lines.flatMap((line, i) =>
    /^\s*-\s+\*\*Target Files:\*\*/.test(line) ? [i] : []
  );
  if (fields.length !== 1 || lines[fields[0] ?? -1]?.trim() !== '- **Target Files:**') return null;
  const start = (fields[0] ?? 0) + 1;
  let end = start;
  while (end < lines.length && !/^\s*-\s+\*\*/.test(lines[end] ?? '')) end++;
  lines.splice(start, end - start, ...targets.map((p) => `  - \`${p}\``));
  return lines.join('\n');
}

/** @purpose Uniquely replace one already validated section, keeping adjacent bytes unchanged. */
function replaceBody(content: string, name: string, body: string): string | null {
  const bounds = findSectionBounds(content, name);
  if (!bounds) return null;
  const lines = content.split('\n');
  lines.splice(bounds.openLine + 1, bounds.closeLine - bounds.openLine - 1, ...body.split('\n'));
  return lines.join('\n');
}

/**
 * @purpose Prepare the phase insertion/covered-test transfer before the common corpus/DAG checks.
 * @invariant BDD, coverage mappings, verification policy and all completed phases remain byte-identical;
 *   no existing phase kind/rules/exit is weakened or removed. Fresh dispatch remains mandatory.
 * @param input Candidate with the source phase's dependency/additive-target changes already applied.
 * @returns Candidate and complete expected phase nodes, or refusal before mutation.
 */
export function prepareTechnicalPhaseInsertion(input: {
  content: string;
  sourceId: string;
  originalPhases: readonly PhaseOverview[];
  originalSourceBody: string;
  insertion: TechnicalPhaseInsertion;
  moveTests: readonly string[];
  replay: boolean;
}): { ok: true; content: string; phases: PhaseOverview[] } | { ok: false; detail: string } {
  const fail = (detail: string) => ({ ok: false as const, detail });
  const { insertion, sourceId } = input;
  const source = input.originalPhases.find((p) => p.id === sourceId);
  if (!source || insertion.id === sourceId)
    return fail('inserted phase needs a new ID distinct from its incomplete source');
  const existing = input.originalPhases.filter((p) => p.id === insertion.id);
  if ((!input.replay && existing.length) || (input.replay && existing.length !== 1))
    return fail('inserted phase ID is already claimed or missing on replay');
  if (
    !input.replay &&
    extractSection(input.content, `PHASE_${insertion.id}`).status !== 'not_found'
  )
    return fail('inserted phase section ID is already present or malformed');
  const original = parsePhaseDetail(input.originalSourceBody);
  if (original.deletedFiles.length || original.readinessGates.length)
    return fail(
      'inserting a deletion/readiness provider phase requires an explicit supported transition; declarations are not cloned'
    );
  if (!input.replay && insertion.dependencies.join(',') !== source.deps.join(','))
    return fail('inserted phase must preserve every original source prerequisite');
  if (!source.deps.includes(insertion.id) && input.replay)
    return fail('replayed source no longer depends on the inserted provider');
  const section = extractSection(input.content, `PHASE_${sourceId}`);
  const overview = extractSection(input.content, 'PHASES_OVERVIEW');
  if (section.status !== 'ok' || overview.status !== 'ok')
    return fail('phase insertion needs unique readable source/overview');
  const current = parsePhaseDetail(section.content);
  if (input.moveTests.length) {
    const coverage = extractSection(input.content, 'TEST_COVERAGE');
    if (coverage.status !== 'ok' || findUnparsedCoverageRows(coverage.content).length)
      return fail('test transfer needs complete readable existing scenario mappings');
    const allPaths = [
      ...new Set(
        input.originalPhases
          .flatMap((p) => {
            const body = extractSection(input.content, `PHASE_${p.id}`);
            return body.status === 'ok' ? parsePhaseDetail(body.content).targetFiles : [];
          })
          .concat(insertion.targets)
      ),
    ];
    const covered = new Set<string>();
    for (const row of parseTestCoverage(coverage.content).filter((r) => !r.deferred)) {
      const matches = matchingTestPhaseIds(
        row.testFile,
        allPaths.map((path) => ({ phaseId: path, targets: [path] }))
      );
      if (matches.length > 1)
        return fail(`test transfer has ambiguous scenario ownership: ${row.testFile}`);
      if (matches[0]) covered.add(matches[0]);
    }
    if (input.moveTests.some((p) => !covered.has(p) || !insertion.targets.includes(p)))
      return fail(
        'test transfer cannot drop a scenario, invent a mapping or transfer an unmapped file'
      );
    if (!input.replay && input.moveTests.some((p) => !original.targetFiles.includes(p)))
      return fail('test transfer source does not own the exact file');
    if (input.replay && input.moveTests.some((p) => current.targetFiles.includes(p)))
      return fail('test transfer postcondition is absent from source');
    const retained = current.targetFiles.filter((p) => !input.moveTests.includes(p));
    if (!retained.some((p) => covered.has(p)))
      return fail(
        'test transfer may not leave the original test phase without a declared scenario file'
      );
  }
  if (input.replay) {
    const inserted = extractSection(input.content, `PHASE_${insertion.id}`);
    if (inserted.status !== 'ok') return fail('inserted phase section is missing on replay');
    const detail = parsePhaseDetail(inserted.content);
    const node = existing[0];
    if (
      !node ||
      node.kind !== source.kind ||
      node.deps.join(',') !== insertion.dependencies.join(',') ||
      detail.objective !== insertion.objective ||
      detail.targetFiles.join(',') !== insertion.targets.join(',') ||
      detail.rules.join(',') !== original.rules.join(',') ||
      detail.exit !== original.exit
    )
      return fail(
        'inserted phase no longer satisfies the recorded kind/rule/target/exit postconditions'
      );
    const log = extractSection(input.content, 'EXECUTION_LOG');
    if (log.status !== 'ok') return fail('replayed phase insertion needs a readable current Round');
    const visible = log.content.replace(/<!--[\s\S]*?-->/g, (text) => text.replace(/[^\n]/g, ' '));
    const headings = collectHeadings(visible);
    const round = headings.filter((h) => h.level === 3 && /^Round\s+\d+\b/.test(h.text)).at(-1);
    const blocks = headings.filter((h) => round && h.start > round.start && h.level === 4);
    const providers = blocks.filter((h) => new RegExp(`^${insertion.id}(?:\\s|$)`).test(h.text));
    const consumers = blocks.filter((h) => new RegExp(`^${sourceId}(?:\\s|$)`).test(h.text));
    if (
      providers.length !== 1 ||
      consumers.length !== 1 ||
      (providers[0]?.start ?? Infinity) >= (consumers[0]?.start ?? -1)
    )
      return fail(
        'replayed phase insertion needs one live provider block before its source in the current Round'
      );
    return { ok: true, content: input.content, phases: [...input.originalPhases] };
  }
  const node: PhaseOverview = {
    id: insertion.id,
    kind: source.kind,
    deps: insertion.dependencies,
    status: '[ ]',
  };
  let columns: ReturnType<typeof matchPhaseOverviewHeader> = null;
  let insertedRows = 0;
  const overviewBody = overview.content
    .split('\n')
    .flatMap((line) => {
      if (!line.trimStart().startsWith('|')) return [line];
      const cells = rowCells(line);
      const header = matchPhaseOverviewHeader(cells);
      if (header) {
        columns = header;
        return [line];
      }
      if (!columns || cells[columns.id] !== sourceId || columns.kind < 0 || columns.deps < 0)
        return [line];
      cells[columns.id] = node.id;
      cells[columns.kind] = node.kind;
      cells[columns.deps] = node.deps.join(', ') || '—';
      cells[columns.status] = node.status;
      insertedRows++;
      return [`| ${cells.join(' | ')} |`, line];
    })
    .join('\n');
  if (insertedRows !== 1) return fail('phase insertion needs one explicit source row');
  let insertedBody = targetsBody(input.originalSourceBody, insertion.targets);
  if (insertedBody === null) return fail('phase insertion needs canonical Target Files');
  const objectiveLines = insertedBody
    .split('\n')
    .filter((line) => /^\s*-\s+\*\*Objective:\*\*/.test(line));
  if (objectiveLines.length !== 1) return fail('phase insertion needs one source objective');
  insertedBody = insertedBody.replace(
    /^\s*-\s+\*\*Objective:\*\*[^\n]*$/m,
    `- **Objective:** ${insertion.objective}`
  );
  insertedBody = insertedBody.replace(new RegExp(`^### ${sourceId}\\b[^\\n]*\\n?`, 'm'), '');
  insertedBody = `### ${insertion.id} — ${source.kind}\n${insertedBody}`;
  let next = replaceBody(input.content, 'PHASES_OVERVIEW', overviewBody);
  if (next === null) return fail('phase insertion overview is ambiguous');
  if (input.moveTests.length) {
    const body = targetsBody(
      section.content,
      current.targetFiles.filter((p) => !input.moveTests.includes(p))
    );
    if (body === null) return fail('test transfer needs canonical source Target Files');
    const changed = replaceBody(next, `PHASE_${sourceId}`, body);
    if (changed === null) return fail('test transfer source is ambiguous');
    next = changed;
  }
  const sourceBounds = findSectionBounds(next, `PHASE_${sourceId}`);
  if (!sourceBounds) return fail('insertion source section is ambiguous');
  const lines = next.split('\n');
  lines.splice(
    sourceBounds.openLine,
    0,
    `<!--SECTION:PHASE_${insertion.id}-->`,
    ...insertedBody.split('\n'),
    `<!--/SECTION:PHASE_${insertion.id}-->`
  );
  next = lines.join('\n');
  const log = extractSection(next, 'EXECUTION_LOG');
  if (log.status !== 'ok') return fail('phase insertion needs an open Execution Log');
  const visibleLog = log.content.replace(/<!--[\s\S]*?-->/g, (text) => text.replace(/[^\n]/g, ' '));
  const headings = collectHeadings(visibleLog);
  if (headings.some((h) => h.level === 4 && new RegExp(`^${insertion.id}(?:\\s|$)`).test(h.text)))
    return fail('inserted phase ID already exists in execution history');
  const round = headings.filter((h) => h.level === 3 && /^Round\s+\d+\b/.test(h.text)).at(-1);
  const sourceHeads = headings.filter(
    (h) =>
      round &&
      h.start > round.start &&
      h.level === 4 &&
      new RegExp(`^${sourceId}(?:\\s|$)`).test(h.text)
  );
  if (sourceHeads.length !== 1)
    return fail('phase insertion needs one source block in the current Round');
  const at = sourceHeads[0]?.start ?? 0;
  const body = `${log.content.slice(0, at)}#### ${insertion.id}\n- [ ] \`<ts>\` DONE\n**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]\n\n${log.content.slice(at)}`;
  const withLog = replaceBody(next, 'EXECUTION_LOG', body);
  if (withLog === null) return fail('phase insertion log is ambiguous');
  return { ok: true, content: withLog, phases: parsePhasesOverview(overviewBody) };
}
