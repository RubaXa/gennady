// @file: Bounded text and versioned JSON renderers for orient file relations.
// @consumers: OrientCommand
// @tasks: N/A

import type {
  FileRelationsResult,
  FileTaskRelation,
} from '../../../../shared/sdd/file-relations.types.ts';

function relationLine(relation: FileTaskRelation): string {
  return `  ${relation.taskId}  ${relation.phaseId}  ${relation.evidence}`;
}

/**
 * @purpose Render bounded operator text; history expansion never changes the classified result.
 * @param result Shared resolver result.
 * @param history Whether to expand historical relations.
 * @param [limit] Maximum rows printed per relation class; defaults to 20 and is capped at 100.
 * @returns Stable text lines.
 */
export function renderFileRelations(
  result: FileRelationsResult,
  history: boolean,
  limit = 20
): string[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.min(limit, 100)) : 20;
  const spec = result.semanticOwner.spec;
  const lines = [
    `FILE: ${result.file}`,
    spec.status === 'resolved'
      ? `SPEC: ${spec.id} -> ${spec.path}`
      : spec.status === 'ambiguous'
        ? `SPEC: ${spec.id} -> AMBIGUOUS (${spec.candidates.join(', ')})`
        : `SPEC: ${spec.id ?? 'none'} -> UNRESOLVED`,
  ];
  for (const [label, relations] of [
    ['ACTIVE', result.active],
    ['PLANNED', result.planned],
    ['BLOCKED', result.blocked],
  ] as const) {
    lines.push('', label);
    const visible = relations.slice(0, boundedLimit);
    lines.push(...(visible.length > 0 ? visible.map(relationLine) : ['  none']));
    if (relations.length > boundedLimit)
      lines.push(`  ... ${relations.length - boundedLimit} more`);
  }
  lines.push('', 'HISTORY');
  if (history) {
    const visible = result.history.slice(0, boundedLimit);
    lines.push(...(visible.length > 0 ? visible.map(relationLine) : ['  none']));
    if (result.history.length > boundedLimit)
      lines.push(`  ... ${result.history.length - boundedLimit} more`);
  } else {
    const counts = new Map<string, number>();
    for (const relation of result.history) {
      counts.set(relation.evidence, (counts.get(relation.evidence) ?? 0) + 1);
    }
    const summary = [...counts.entries()]
      .map(([evidence, count]) => `${count} ${evidence}`)
      .join(', ');
    lines.push(`  ${result.history.length} relations${summary ? `: ${summary}` : ''}`);
    lines.push('  use --history to expand');
  }
  lines.push('', 'FINDINGS');
  lines.push(
    ...(result.findings.length > 0
      ? result.findings.map((f) => `  ${f.code}: ${f.message}`)
      : ['  none'])
  );
  lines.push(
    '',
    result.findings.some((finding) => finding.blocking)
      ? 'VERDICT: BLOCKED — ownership ambiguity'
      : 'VERDICT: OK'
  );
  return lines;
}

/**
 * @purpose Wrap the shared result in a stable versioned machine document.
 * @param result Shared resolver result.
 * @returns Versioned JSON-ready value.
 */
export function fileRelationsDocument(result: FileRelationsResult): {
  schema: 'gennady.orient.file-relations';
  version: 1;
  result: FileRelationsResult;
} {
  return { schema: 'gennady.orient.file-relations', version: 1, result };
}
