// @file: Собрать дерево XmlNode артефакта ревью из MR и дискуссий.
// @consumers: run-review-command.logic
// @tasks: N/A

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

/**
 * @purpose Собрать дерево XmlNode артефакта ревью из MR и дискуссий.
 * @consumer buildReviewArtifactXml
 * @param mergeRequest Объект MR (iid, author, web_url, source_branch, title и т.д.).
 * @param discussions Массив дискуссий с notes (body, author, position).
 * @param showAll Флаг показа всех тредов, включая resolved.
 * @returns Корневой XmlNode (tag: MR_Audit_Context).
 */
export function createReviewArtifactXmlNode(
  mergeRequest: ReviewContextMr,
  discussions: ReviewContextMrDiscussion[],
  showAll: boolean = false
): XmlNode {
  const reviewAuthorUsername = mergeRequest.author?.username;
  const projectPath = parseProjectPathFromWebUrl(mergeRequest.web_url);
  const host = parseHostFromWebUrl(mergeRequest.web_url);

  const threads = discussions
    .map((discussion) => {
      const firstNote = discussion.notes?.[0];
      if (!firstNote) {
        return null;
      }

      if (!showAll && (discussion.resolved || firstNote.resolved)) {
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
 * @purpose Построить XML артефакт ревью (MR + дискуссии).
 * @consumer run-review-command.logic
 * @param mergeRequest Объект MR.
 * @param discussions Массив дискуссий.
 * @param showAll Флаг показа всех тредов, включая resolved.
 * @returns Строка XML (MR_Audit_Context).
 */
export function buildReviewArtifactXml(
  mergeRequest: ReviewContextMr,
  discussions: ReviewContextMrDiscussion[],
  showAll: boolean = false
): string {
  const rootNode = createReviewArtifactXmlNode(mergeRequest, discussions, showAll);
  return serializeXmlNode(rootNode);
}
