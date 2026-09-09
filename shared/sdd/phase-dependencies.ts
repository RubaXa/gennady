// @file: Structural dependency preflight shared by phase planning and phase verification.
// @consumers: sdd-task, sdd-verify
// @tasks: N/A

import { extractSection } from './section.ts';
import { parsePhaseReceipts, type PhaseReceipt } from './phase-receipt.ts';
import { parsePhasesOverview } from './ticket.ts';

/** @purpose Validate one parsed dependency receipt against its current project context. */
type DependencyReceiptValidator = (receipt: PhaseReceipt, phaseId: string) => string | null;

/** @purpose Fail before dispatch or mutation unless the complete dependency closure is complete and currently attested. | @param content Ticket markdown. | @param phaseId Phase about to start. | @param validateReceipt Current-receipt validator owned by phase verification. | @returns Teaching issue, or null when dependencies are ready. */
export function checkPhaseDependencies(
  content: string,
  phaseId: string,
  validateReceipt: DependencyReceiptValidator
): string | null {
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok') return 'ticket has no readable PHASES_OVERVIEW';
  const phases = parsePhasesOverview(overview.content);
  const phase = phases.find((candidate) => candidate.id === phaseId);
  if (!phase) return `phase ${phaseId} is absent from ticket`;
  const known = new Map(phases.map((candidate) => [candidate.id, candidate]));
  const parsed = parsePhaseReceipts(content);
  if (!parsed.ok) return parsed.issue;
  const receipts = new Map(parsed.receipts.map((receipt) => [receipt.phase, receipt]));
  const schemaAware = content.includes('<!--PHASE_RECEIPTS:v1-->');
  const visited = new Set<string>();
  const visiting: string[] = [];
  const visit = (dependencyId: string): string | null => {
    const cycleAt = visiting.indexOf(dependencyId);
    if (cycleAt >= 0) {
      return `phase ${phaseId} dependency graph contains a cycle: ${[...visiting.slice(cycleAt), dependencyId].join(' -> ')}`;
    }
    if (visited.has(dependencyId)) return null;
    const dependency = known.get(dependencyId);
    if (!dependency) {
      const chain = [...visiting, dependencyId].join(' -> ');
      return `phase ${phaseId} dependency chain ${chain} references an absent phase`;
    }
    if (!dependency.status.includes('[x]'))
      return `phase ${phaseId} dependency ${dependencyId} is not checked complete`;
    visiting.push(dependencyId);
    for (const ancestorId of dependency.deps) {
      const issue = visit(ancestorId);
      if (issue) return issue;
    }
    visiting.pop();
    const receipt = receipts.get(dependencyId);
    if (!receipt && schemaAware)
      return `phase ${phaseId} dependency ${dependencyId} has no CLI-owned receipt`;
    if (receipt) {
      const issue = validateReceipt(receipt, dependencyId);
      if (issue) return `phase ${phaseId} dependency ${dependencyId} is not current: ${issue}`;
    }
    visited.add(dependencyId);
    return null;
  };
  for (const dependencyId of phase.deps) {
    const issue = visit(dependencyId);
    if (issue) return issue;
  }
  return null;
}
