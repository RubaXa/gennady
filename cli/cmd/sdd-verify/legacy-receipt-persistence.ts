// @file: Atomic persistence for the explicit legacy receipt overlay retained through UV-24.
// @spec: CLI-SDD-VERIFY
// @consumers: sdd-verify.facade, frozen parity tests

import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  formatPhaseReceipt,
  parsePhaseReceipts,
  type PhaseReceipt,
} from '../../../shared/sdd/phase-receipt.ts';
import {
  acceptTicketOwnedWrite,
  captureTicketContainment,
  ticketContainmentIssue,
  type TicketContainmentSnapshot,
} from './workspace-mutation.ts';

function receiptPattern(phase: string): RegExp {
  const fence = '`'.repeat(3);
  return new RegExp(
    `^<!--SDD_PHASE_RECEIPT:${phase}-->\\n${fence}json\\n[\\s\\S]*?\\n${fence}\\n<!--\\/SDD_PHASE_RECEIPT:${phase}-->\\n?`,
    'm'
  );
}

function atomicTicketWrite(
  path: string,
  content: string,
  containment: TicketContainmentSnapshot
): void {
  const before = ticketContainmentIssue(containment);
  if (before) throw new Error(before);
  const mode = statSync(path).mode;
  const directory = dirname(containment.canonical);
  let temp = '';
  let fd: number | undefined;
  for (let attempt = 0; attempt < 8; attempt++) {
    temp = resolve(
      directory,
      `.${basename(path)}.phase-receipt-${randomBytes(16).toString('hex')}.tmp`
    );
    try {
      fd = openSync(
        temp,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        mode & 0o777
      );
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST' || attempt === 7) throw cause;
    }
  }
  if (fd === undefined) throw new Error('cannot create an exclusive receipt temporary file');
  let tempDev: number;
  let tempIno: number;
  let tempMode: number;
  let renamed = false;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) throw new Error('receipt temporary path is not a regular file');
    fchmodSync(fd, mode & 0o7777);
    const owned = fstatSync(fd);
    tempDev = owned.dev;
    tempIno = owned.ino;
    tempMode = owned.mode;
    writeFileSync(fd, content, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    const currentTemp = lstatSync(temp);
    if (
      !currentTemp.isFile() ||
      currentTemp.isSymbolicLink() ||
      currentTemp.dev !== tempDev ||
      currentTemp.ino !== tempIno
    ) {
      throw new Error('receipt temporary file identity changed before rename');
    }
    const beforeRename = ticketContainmentIssue(containment);
    if (beforeRename) throw new Error(beforeRename);
    renameSync(temp, path);
    renamed = true;
    const afterRename = acceptTicketOwnedWrite(containment, content, tempMode, tempDev, tempIno);
    if (afterRename) throw new Error(afterRename);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (!renamed && temp) {
      try {
        const current = lstatSync(temp);
        if (
          current.isFile() &&
          !current.isSymbolicLink() &&
          current.dev === tempDev! &&
          current.ino === tempIno!
        ) {
          unlinkSync(temp);
        }
      } catch {
        // Cleanup is ownership-checked and best-effort; never unlink a substituted path.
      }
    }
  }
}

/**
 * @purpose Apply a receipt transition against an already captured ticket containment identity.
 * @param path Absolute regular ticket path to replace atomically.
 * @param phase Exact phase marker whose prior receipt is replaced or removed.
 * @param receipt Proven receipt to persist, or null to invalidate the prior proof.
 * @param containment Pre-captured ticket/device identity checked immediately before replacement.
 * @returns Null on success, otherwise one fail-closed persistence diagnostic.
 */
export function updateLegacyPhaseReceipt(
  path: string,
  phase: string,
  receipt: PhaseReceipt | null,
  containment: TicketContainmentSnapshot
): string | null {
  const containmentFailure = ticketContainmentIssue(containment);
  if (containmentFailure) return containmentFailure;
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch (cause) {
    return `ticket became unreadable: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  const parsed = parsePhaseReceipts(content);
  if (!parsed.ok) return parsed.issue;
  const withoutPrior = content.replace(receiptPattern(phase), '');
  if (receipt === null && withoutPrior === content) return null;
  const log = extractSection(withoutPrior, 'EXECUTION_LOG');
  if (log.status !== 'ok') return 'ticket has no writable EXECUTION_LOG section';
  const close = '<!--/SECTION:EXECUTION_LOG-->';
  const index = withoutPrior.indexOf(close);
  if (index < 0) return 'ticket has no EXECUTION_LOG close marker';
  const block = receipt === null ? '' : `${formatPhaseReceipt(receipt)}\n`;
  const next = withoutPrior.slice(0, index) + block + withoutPrior.slice(index);
  try {
    atomicTicketWrite(path, next, containment);
    return null;
  } catch (cause) {
    return `cannot atomically update ticket: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

/**
 * @purpose Apply one explicit legacy-overlay transition through the frozen safe ticket writer.
 * @param root Absolute repository root containing the ticket.
 * @param taskPath Repo-relative receipt-owning ticket path.
 * @param phase Exact phase marker to update.
 * @param receipt Proven compatibility receipt, or null to invalidate it.
 */
export function persistLegacyPhaseReceipt(
  root: string,
  taskPath: string,
  phase: string,
  receipt: PhaseReceipt | null
): void {
  const containment = captureTicketContainment(root, taskPath);
  const issue = updateLegacyPhaseReceipt(resolve(root, taskPath), phase, receipt, containment);
  if (issue !== null) throw new Error(issue);
}
