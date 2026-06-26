// @file: Render a grouped inbox view into a terminal string.
// @consumers: inbox.cmd
// @tasks: N/A

import { style } from '../../../../../shared/common/style.ts';
import type { VcsActionableRole } from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';
import type { InboxItem, InboxView } from './build-inbox-view.logic.ts';
import type { WorkPacket } from './classify-mr-stage.logic.ts';

const GROUP_LABEL: Record<VcsActionableRole, string> = {
  reviewer: 'Ждут моё ревью',
  author: 'Мои MR',
  mentioned: 'Меня упомянули',
};

function deltaMark(item: InboxItem): string {
  if (item.delta === 'new') return style.green('NEW ');
  if (item.delta === 'updated') return style.yellow('↑ ');
  return '';
}

function stageTag(item: InboxItem): string {
  if (item.stage === 'reply_needed') return style.redBright('[ответить] ');
  if (item.stage === 'review_needed') return style.yellow('[ревью] ');
  if (item.stage === 'awaiting_reply') return style.gray('[жду] ');
  return '';
}

function eventMarks(item: InboxItem): string {
  const marks: string[] = [];
  if (item.directlyAddressed) marks.push(style.cyan('→'));
  if (item.shownEvents.includes('ci_failed')) marks.push(style.red('✗ ci'));
  if (item.shownEvents.includes('unmergeable')) marks.push(style.yellow('⚠ unmergeable'));
  if (item.draft) marks.push(style.gray('(draft)'));
  return marks.length > 0 ? ' ' + marks.join(' ') : '';
}

function hiddenSummary(hidden: InboxView['hidden']): string {
  const parts: string[] = [];
  if (hidden.waiting > 0) parts.push(`${hidden.waiting} жду ответа`);
  if (hidden.approved > 0) parts.push(`${hidden.approved} approved`);
  if (hidden.stale > 0) parts.push(`${hidden.stale} stale`);
  if (hidden.drafts > 0) parts.push(`${hidden.drafts} drafts`);
  if (hidden.noise > 0) parts.push(`${hidden.noise} noise`);
  if (hidden.closed > 0) parts.push(`${hidden.closed} merged/closed`);
  return parts.length > 0 ? `  ${style.gray(`(скрыто: ${parts.join(', ')})`)}` : '';
}

/** @purpose One-line snippet of an MR description for a card (first line, clipped). */
function descSnippet(description: string, max = 100): string {
  const firstLine =
    description
      .split('\n')
      .find((l) => l.trim().length > 0)
      ?.trim() ?? '';
  if (firstLine === '') return '';
  return firstLine.length > max ? `${firstLine.slice(0, max - 1)}…` : firstLine;
}

function deltaSummary(delta: InboxView['delta']): string {
  const parts: string[] = [];
  if (delta.new > 0) parts.push(style.green(`${delta.new} new`));
  if (delta.updated > 0) parts.push(style.yellow(`${delta.updated} updated`));
  return parts.length > 0 ? `  [${parts.join(', ')}]` : '';
}

/**
 * @purpose Render the grouped inbox view as a terminal-ready string.
 * @param view Grouped, filtered inbox.
 * @returns Multi-line string ready to print.
 * @consumer inbox.cmd
 */
export function renderInboxView(view: InboxView): string {
  const lines: string[] = [];
  lines.push(
    style.bold(`Inbox — ${view.total} actionable`) +
      deltaSummary(view.delta) +
      hiddenSummary(view.hidden)
  );

  for (const group of view.groups) {
    lines.push('');
    lines.push(style.bold(`▸ ${GROUP_LABEL[group.role]} — ${group.items.length}`));
    for (const item of group.items) {
      const ref = item.project ? `${item.project}!${item.iid}` : `!${item.iid}`;
      const age = item.ageLabel ? style.gray(item.ageLabel) : '';
      lines.push(
        `    ${deltaMark(item)}${stageTag(item)}${style.cyan(ref)}${eventMarks(item)}  ${item.title}  ${age}`
      );
      const meta: string[] = [];
      if (item.author) meta.push(`автор @${item.author}`);
      if (item.reviewers.length > 0)
        meta.push(`ревью: ${item.reviewers.map((r) => '@' + r).join(' ')}`);
      if (meta.length > 0) lines.push(`      ${style.gray(meta.join(' · '))}`);
      const snippet = descSnippet(item.description);
      if (snippet) lines.push(`      ${style.gray(snippet)}`);
      lines.push(`      ${style.gray(item.webUrl)}`);
    }
  }

  return lines.join('\n');
}

/** @purpose Extra MR context for the work-packet header (optional, from the inbox row). */
export type WorkPacketMeta = {
  /** @purpose Author of the merge request. */
  author?: string;
  /** @purpose List of reviewer names assigned to the MR. */
  reviewers?: string[];
  /** @purpose MR description text. */
  description?: string;
  /** @purpose List of users who approved the MR. */
  approvedBy?: string[];
};

/**
 * @purpose Render a single-MR work packet (stage + what I must answer) for the
 *   in-session agent to act on.
 * @param ref MR reference, e.g. group/project!123.
 * @param title MR title.
 * @param packet Assembled work packet.
 * @param [meta] Author / reviewers / description / approvers for the header.
 * @returns Multi-line string ready to print.
 * @consumer inbox.cmd
 */
export function renderWorkPacket(
  ref: string,
  title: string,
  packet: WorkPacket,
  meta: WorkPacketMeta = {}
): string {
  const lines: string[] = [];
  lines.push(style.bold(`Work packet — ${ref}`) + `  ${style.gray(title)}`);
  lines.push(`stage: ${style.cyan(packet.stage)} · role: ${packet.role ?? '—'}`);

  const head: string[] = [];
  if (meta.author) head.push(`автор @${meta.author}`);
  if (meta.reviewers && meta.reviewers.length > 0) {
    head.push(`ревью: ${meta.reviewers.map((r) => '@' + r).join(' ')}`);
  }
  if (meta.approvedBy && meta.approvedBy.length > 0) {
    head.push(`approved: ${meta.approvedBy.map((r) => '@' + r).join(' ')}`);
  }
  if (head.length > 0) lines.push(style.gray(head.join(' · ')));
  const snippet = descSnippet(meta.description ?? '', 200);
  if (snippet) lines.push(style.gray(snippet));

  if (packet.needsReview) {
    lines.push(style.yellow('→ Первый ревью: посмотри диф и оставь замечания.'));
  }
  if (packet.openNotes.length > 0) {
    lines.push('');
    lines.push(style.bold(`Открытые вопросы (${packet.openNotes.length}):`));
    for (const n of packet.openNotes) {
      lines.push(`  ${style.cyan('@' + n.author)} ${style.gray(n.at)}`);
      for (const row of n.body.split('\n')) lines.push(`    ${row}`);
    }
  } else if (!packet.needsReview) {
    lines.push(style.gray('Нет открытых вопросов ко мне.'));
  }

  return lines.join('\n');
}
