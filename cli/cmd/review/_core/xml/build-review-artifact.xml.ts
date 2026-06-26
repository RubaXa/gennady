// @file: Build XmlNode tree of the review artifact from MR and discussions.
// @consumers: run-review-command.logic
// @tasks: N/A, TSK-78

import { serializeXmlNode } from '../../../../../shared/common/xml.ts';
import type { XmlNode } from '../../../../../shared/common/xml.ts';
import type {
  ReviewContextMr,
  ReviewContextMrDiscussion,
  ReviewContextMrNote,
} from '../types/review-context-mr.type.ts';

function getReviewActorRole(
  note: ReviewContextMrNote,
  reviewAuthorUsername?: string
): 'Author' | 'Reviewer' | 'AI_Agent' | 'Skip' {
  const username = note.author?.username ?? '';

  if (note.system) return 'Skip';
  if (note.body?.includes('🤖')) return 'AI_Agent';
  if (/group_|bot\d*/.test(username)) return 'Skip';

  if (username === reviewAuthorUsername) {
    return 'Author';
  }

  return 'Reviewer';
}

function parseProjectPathFromWebUrl(webUrl?: string): string {
  if (!webUrl) return '';
  try {
    const url = new URL(webUrl);
    // e.g. /vk-workspace/superapp/-/merge_requests/169
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('-');
    if (idx > 0) {
      return `${parts[0]}/${parts[1]}`;
    }
    // Fallback: try to take first two segments
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts[0] ?? '';
  } catch {
    return '';
  }
}

function parseHostFromWebUrl(webUrl?: string): string {
  if (!webUrl) return '';
  try {
    const url = new URL(webUrl);
    return url.host ?? '';
  } catch {
    return '';
  }
}

function computeCursor(discussions: ReviewContextMrDiscussion[]): string | undefined {
  let max: string | undefined;
  for (const d of discussions) {
    for (const note of d.notes ?? []) {
      if (note.updated_at && (!max || note.updated_at > max)) max = note.updated_at;
    }
  }
  return max;
}

function isThreadUpdatedAfter(discussion: ReviewContextMrDiscussion, since: string): boolean {
  return (discussion.notes ?? []).some((note) => !!note.updated_at && note.updated_at > since);
}

/**
 * @purpose Build XmlNode tree of the review artifact from MR and discussions.
 * @param mergeRequest MR object (iid, author, web_url, source_branch, title, etc.).
 * @param discussions Array of discussions with notes (body, author, position).
 * @param [showAll] Flag to show all threads, including resolved ones.
 * @param [since] ISO cursor — skip threads not updated after this timestamp.
 * @returns Root XmlNode (tag: MR_Audit_Context).
 * @consumer buildReviewArtifactXml
 */
export function createReviewArtifactXmlNode(
  mergeRequest: ReviewContextMr,
  discussions: ReviewContextMrDiscussion[],
  showAll: boolean = false,
  since?: string
): XmlNode {
  const reviewAuthorUsername = mergeRequest.author?.username;
  const projectPath = parseProjectPathFromWebUrl(mergeRequest.web_url);
  const host = parseHostFromWebUrl(mergeRequest.web_url);
  const cursor = computeCursor(discussions);

  const threads = discussions
    .map((discussion) => {
      const firstNote = discussion.notes?.[0];
      if (!firstNote) {
        return null;
      }

      if (!showAll && (discussion.resolved || firstNote.resolved)) {
        return null;
      }

      if (since && !isThreadUpdatedAfter(discussion, since)) {
        return null;
      }

      const position = firstNote.position ?? {};
      const filePath = position.new_path ?? position.old_path ?? 'unknown';
      const lineNumber = String(position.new_line ?? position.old_line ?? 0);

      const messages = (discussion.notes ?? [])
        .map((note) => {
          const role = getReviewActorRole(note, reviewAuthorUsername);
          if (role === 'Skip') return null;
          const tag = role;
          return {
            tag,
            attrs: {
              uid: note.author?.username ?? '',
              noteId: String(note.id ?? ''),
            },
            children: { cdata: note.body ?? '' },
          } as XmlNode;
        })
        .filter(Boolean) as XmlNode[];

      if (messages.length === 0) {
        return null;
      }

      return {
        tag: 'Thread',
        attrs: {
          fullId: discussion.id,
          shortId: discussion.id.slice(0, 4),
          file: filePath,
          line: lineNumber,
          resolved: discussion.resolved ? 'true' : 'false',
        },
        children: messages,
      } as XmlNode;
    })
    .filter(Boolean) as XmlNode[];

  const meta: XmlNode = {
    tag: 'Meta',
    children: [
      { tag: 'Task_Objective', children: { cdata: mergeRequest.title ?? '' } },
      { tag: 'Author', children: reviewAuthorUsername ?? '' },
      { tag: 'Branch', children: mergeRequest.source_branch ?? '' },
      { tag: 'URL', children: mergeRequest.web_url ?? '' },
    ],
  };

  return {
    tag: 'MR_Audit_Context',
    attrs: {
      iid: mergeRequest.iid + '',
      host,
      target_repo: projectPath,
      ...(cursor
        ? {
            cursor,
            'tip-cursor':
              'Rerun with --since <cursor> to receive only threads updated after this fetch',
          }
        : {}),
    },
    children: [
      meta,
      {
        tag: 'Review_Threads',
        children: threads,
      },
    ],
  };
}

/**
 * @purpose Build review XML artifact (MR + discussions).
 * @param mergeRequest MR object.
 * @param discussions Array of discussions.
 * @param [showAll] Flag to show all threads, including resolved ones.
 * @param [since] ISO cursor — skip threads not updated after this timestamp.
 * @returns XML string (MR_Audit_Context).
 * @consumer run-review-command.logic
 */
export function buildReviewArtifactXml(
  mergeRequest: ReviewContextMr,
  discussions: ReviewContextMrDiscussion[],
  showAll: boolean = false,
  since?: string
): string {
  const rootNode = createReviewArtifactXmlNode(mergeRequest, discussions, showAll, since);
  return serializeXmlNode(rootNode);
}
