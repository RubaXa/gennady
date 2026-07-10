// @file: Parse GitLab system notes into MrActivityEvent[] — provider-agnostic
//   activity events. GitLab: parse body text of system notes. GitHub (future):
//   map timeline events. The shared type lives in services/vcs-client/entities/.
// @consumers: inbox.cmd
// @tasks: N/A

import type {
  MrActivityEvent,
  MrActivityEventType,
} from '../../../../../services/vcs-client/entities/mr-activity-event.type.ts';
import type { RawNote } from './classify-mr-stage.logic.ts';

export type { MrActivityEvent, MrActivityEventType };

// ── GitLab system note body parsers ───────────────────────────────────────

const ADDED_COMMITS_RE = /^added (\d+) commit/;
const MERGED_BRANCH_RE = /merged branch '([^']+)' into/;
const CHANGED_TARGET_RE = /^changed target branch from (.+) to (.+)/;
const CHANGED_TITLE_RE = /^changed title from/;

function parseCommitsPushed(body: string): MrActivityEvent | null {
  const m = body.match(ADDED_COMMITS_RE);
  if (!m) return null;
  const count = Number(m[1]);
  const merged = body.match(MERGED_BRANCH_RE);
  const type = merged ? 'target_branch_merged' : 'commits_pushed';
  const summary = merged
    ? `влита ветка ${merged[1]} (${count} коммитов)`
    : `добавлено ${count} коммитов`;
  return { type, at: '', summary, detail: body };
}

const SYSTEM_MATCHERS: Array<(body: string) => MrActivityEvent | null> = [
  parseCommitsPushed,
  (body) => {
    if (!body.includes('changed the description')) return null;
    return { type: 'description_changed', at: '', summary: 'изменено описание', detail: body };
  },
  (body) => {
    const m = body.match(CHANGED_TITLE_RE);
    if (!m) return null;
    return { type: 'title_changed', at: '', summary: 'изменён заголовок', detail: body };
  },
  (body) => {
    if (!body.includes('marked this merge request as')) return null;
    const ready = body.includes('ready');
    return {
      type: ready ? 'draft_removed' : 'draft_marked',
      at: '',
      summary: ready ? 'снят draft' : 'помечен как draft',
      detail: body,
    };
  },
  (body) => {
    if (body.includes('unapproved this merge request'))
      return { type: 'unapproved', at: '', summary: 'аппрув отозван', detail: body };
    if (body.includes('approved this merge request'))
      return { type: 'approved', at: '', summary: 'аппрув', detail: body };
    return null;
  },
  (body) => {
    const m = body.match(CHANGED_TARGET_RE);
    if (!m) return null;
    return {
      type: 'target_branch_changed',
      at: '',
      summary: `целевая ветка: ${m[1]} → ${m[2]}`,
      detail: body,
    };
  },
  (body) => {
    if (!body.includes('requested review from')) return null;
    return { type: 'review_requested', at: '', summary: 'запрошен ревью', detail: body };
  },
  (body) => {
    if (!body.includes('removed review request for')) return null;
    return { type: 'review_request_removed', at: '', summary: 'снят запрос ревью', detail: body };
  },
  (body) => {
    if (!body.includes('resolved all threads')) return null;
    return { type: 'threads_resolved', at: '', summary: 'все треды разрешены', detail: body };
  },
  (body) => {
    if (!body.includes('reopened')) return null;
    return { type: 'reopened', at: '', summary: 'переоткрыт', detail: body };
  },
];

function parseSystemNote(note: RawNote): MrActivityEvent | null {
  if (!note.system || !note.body) return null;
  for (const matcher of SYSTEM_MATCHERS) {
    const event = matcher(note.body);
    if (event) {
      event.at = note.created_at ?? event.at;
      return event;
    }
  }
  return null;
}

/**
 * @purpose Detect MR activity events since last classification: walk system notes and head-SHA diff. Provider-agnostic output.
 * @param notes All discussion notes (including system notes), flattened.
 * @param lastClassifiedAt ISO timestamp of the last registry update — only
 *   events after this are returned.
 * @param [headCommitDiff] Compare current head SHA against last known SHA — if
 *   they differ and no system note covers the push, emit `commits_detected`.
 * @returns Array of activity events, most recent first.
 * @consumer inbox.cmd
 */
export function parseMrActivity(
  notes: RawNote[],
  lastClassifiedAt: string,
  headCommitDiff?: { current: string; previous?: string }
): MrActivityEvent[] {
  const ts = (n: RawNote) => Date.parse(n.created_at ?? '') || 0;
  const threshold = Date.parse(lastClassifiedAt) || 0;

  const events: MrActivityEvent[] = [];

  for (const note of notes) {
    if (ts(note) <= threshold) continue;
    const event = parseSystemNote(note);
    if (event) events.push(event);
  }

  // Non-system discussion notes after last classification → discussion activity.
  const hasNewRealNotes = notes.some((n) => !n.system && n.author?.username && ts(n) > threshold);
  if (hasNewRealNotes) {
    events.push({ type: 'discussion_added', at: '', summary: 'новые комментарии' });
  }

  // Head SHA changed but no system note announced it → silent push.
  if (headCommitDiff && headCommitDiff.current !== headCommitDiff.previous) {
    const alreadyAnnounced = events.some(
      (e) => e.type === 'commits_pushed' || e.type === 'target_branch_merged'
    );
    if (!alreadyAnnounced) {
      events.push({ type: 'commits_detected', at: '', summary: 'новые коммиты' });
    }
  }

  events.sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''));
  return events;
}
