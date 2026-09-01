// @file: Fail-closed validation of CLI-owned phase receipts for completed v2 ticket phases.
// @consumers: sdd-check.cmd.ts
// @tasks: N/A

import { relative } from 'node:path';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhaseReceipts } from '../../../shared/sdd/phase-receipt.ts';
import { parsePhasesOverview } from '../../../shared/sdd/ticket.ts';
import type { Finding } from '../../../shared/sdd/check.ts';
import { phaseReceiptIssue } from '../sdd-verify/phase-receipt-validation.ts';

const SCHEMA_MARKER = '<!--PHASE_RECEIPTS:v1-->';

function finding(file: string, code: string, message: string): Finding {
  return { severity: 'error', code, file, message };
}

function receiptIssueFinding(file: string, phase: string, issue: string): Finding {
  if (/Target Files or Deleted Files changed/.test(issue))
    return finding(
      file,
      'SDD_PHASE_RECEIPT_STALE_TARGETS',
      `Phase ${phase} Target Files or deletion tombstones changed after verification; rerun the canonical phase command.`
    );
  if (/verification plan or environment changed/.test(issue))
    return finding(
      file,
      'SDD_PHASE_RECEIPT_STALE_PLAN',
      `Phase ${phase} verification plan changed after its receipt; rerun the canonical phase command.`
    );
  if (/^receipt /.test(issue))
    return finding(file, 'SDD_PHASE_RECEIPT_INCOMPLETE', `Phase ${phase}: ${issue}.`);
  return finding(file, 'SDD_PHASE_RECEIPT_INVALID', `Phase ${phase}: ${issue}.`);
}

/** @purpose Reject completed phases whose CLI-owned proof is absent, incomplete, or stale. | @param file Finding display path. | @param ticketPath Actual ticket path. | @param content Full ticket content. | @param root Project root. | @returns Receipt findings. */
export function checkPhaseReceipts(
  file: string,
  ticketPath: string,
  content: string,
  root: string
): Finding[] {
  const parsed = parsePhaseReceipts(content);
  if (!parsed.ok)
    return [
      finding(
        file,
        'SDD_PHASE_RECEIPT_INVALID',
        `${parsed.issue}. Rerun the canonical phase command.`
      ),
    ];
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok') return [];
  const phases = parsePhasesOverview(overview.content);
  const known = new Map(phases.map((phase) => [phase.id, phase]));
  const receipts = new Map(parsed.receipts.map((receipt) => [receipt.phase, receipt]));
  const schemaAware = content.includes(SCHEMA_MARKER);
  const findings: Finding[] = [];

  for (const phase of phases) {
    if (!phase.status.includes('[x]')) continue;
    if (!schemaAware && !receipts.has(phase.id)) continue;
    if (!receipts.has(phase.id)) {
      findings.push(
        finding(
          file,
          'SDD_PHASE_RECEIPT_MISSING',
          `Phase ${phase.id} is checked but has no CLI receipt. Rerun: npx gennady sdd-verify --task ${relative(root, ticketPath)} --phase ${phase.id}`
        )
      );
    }
  }

  for (const receipt of parsed.receipts) {
    if (!known.has(receipt.phase)) {
      findings.push(
        finding(file, 'SDD_PHASE_RECEIPT_INVALID', `Receipt names unknown phase ${receipt.phase}.`)
      );
      continue;
    }
    const issue = phaseReceiptIssue(root, receipt, receipt.phase, ticketPath);
    if (issue) findings.push(receiptIssueFinding(file, receipt.phase, issue));
  }
  return findings;
}
