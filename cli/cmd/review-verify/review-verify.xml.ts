import { serializeXmlNode } from '../../../shared/common/xml.ts';
import type { XmlNode } from '../../../shared/common/xml.ts';

type Note = {
  body?: string;
  author?: { username?: string };
  system?: boolean;
  position?: {
    new_path?: string;
    old_path?: string;
    new_line?: number;
    old_line?: number;
    head_sha?: string;
  };
};

type Discussion = {
  id: string;
  notes?: Note[];
};

type MergeRequest = {
  iid: number | string;
  project_id?: number;
  source_branch?: string;
  title?: string;
  web_url?: string;
  author?: { username?: string };
};

function getActorType(note: Note, mrAuthorUsername?: string): string {
  const username = note.author?.username ?? '';

  if (note.body?.includes('🤖')) {
    return 'AI_Model';
  }

  if (username === mrAuthorUsername) {
    return 'Human_Author';
  }

  if (/group_|bot\d*/.test(username)) {
    return 'Bot';
  }

  return 'Human_Reviewer';
}

/**
 * @purpose Собрать дерево XmlNode артефакта ревью из MR и дискуссий (для сериализации или тестов).
 * @consumer buildReviewVerifyXml
 * @param mergeRequest Объект MR (iid, author, web_url, source_branch, title и т.д.).
 * @param discussions Массив дискуссий с notes (body, author, position).
 * @returns Корневой XmlNode (tag: Review_Audit_Artifact).
 */
function createReviewAuditArtifact(mergeRequest: MergeRequest, discussions: Discussion[]): XmlNode {
  const mrAuthorUsername = mergeRequest.author?.username;

  const mrContext: XmlNode = {
    tag: 'Merge_Request_Context',
    children: [
      {
        tag: 'MR_Identity',
        children: [
          { tag: 'ID', children: String(mergeRequest.iid) },
          {
            tag: 'Project_Namespace',
            children: String(mergeRequest.project_id ?? ''),
          },
          { tag: 'Host_Origin', children: 'gitlab.corp.mail.ru' },
          { tag: 'Web_Link', children: mergeRequest.web_url ?? '' },
        ],
      },
      {
        tag: 'Git_State',
        children: [
          { tag: 'Source_Branch', children: mergeRequest.source_branch ?? '' },
          { tag: 'Author_Identity', children: mrAuthorUsername ?? '' },
          { tag: 'Title_Semantics', children: mergeRequest.title ?? '' },
        ],
      },
    ],
  };

  const vectors = discussions
    .map((disc) => {
      const firstNote = disc.notes?.[0];
      if (!firstNote) return null;

      const dialogueTrace = (disc.notes ?? [])
        .map((note, noteIndex) => {
          if (note.system) return null;

          return {
            tag: 'Dialogue_Turn',
            attrs: {
              sequence: String(noteIndex + 1),
              type: noteIndex === 0 ? 'initiation' : 'response',
            },
            children: [
              {
                tag: 'Actor_Meta',
                children: [
                  {
                    tag: 'Actor_ID',
                    children: note.author?.username ?? '',
                  },
                  {
                    tag: 'Actor_Type',
                    children: getActorType(note, mrAuthorUsername),
                  },
                ],
              },
              {
                tag: 'Content_Payload',
                children: note.body ?? '',
              },
            ],
          } as XmlNode;
        })
        .filter(Boolean) as XmlNode[];

      if (dialogueTrace.length === 0) return null;

      const position = firstNote.position ?? {};
      const codeLocus: XmlNode = {
        tag: 'Code_Locus',
        children: [
          {
            tag: 'File_Path',
            children: position.new_path ?? position.old_path ?? 'unknown',
          },
          {
            tag: 'Line_Number',
            children: String(position.new_line ?? position.old_line ?? 0),
          },
          {
            tag: 'Commit_Hash',
            children: position.head_sha ?? 'unknown',
          },
        ],
      };

      return {
        tag: 'Discussion_Vector',
        attrs: {
          shortId: disc.id.slice(0, 4),
          fullId: disc.id,
        },
        children: [
          codeLocus,
          {
            tag: 'Dialogue_Trace',
            children: dialogueTrace,
          },
        ],
      } as XmlNode;
    })
    .filter(Boolean) as XmlNode[];

  const registry: XmlNode = {
    tag: 'Discussion_Vectors_Registry',
    children: vectors,
  };

  return {
    tag: 'Review_Audit_Artifact',
    attrs: { type: 'verification_source' },
    children: [mrContext, registry],
  };
}

/**
 * @purpose Построить XML артефакт ревью (MR + дискуссии) для верификации и подставить в шаблон агента.
 * @consumer cmd/review-verify
 * @param mergeRequest Объект MR (iid, project_id, source_branch, title, web_url, author).
 * @param discussions Массив дискуссий с notes (body, author, position).
 * @returns Строка XML (Review_Audit_Artifact с Merge_Request_Context и Discussion_Vectors_Registry).
 */
export function buildReviewVerifyXml(
  mergeRequest: MergeRequest,
  discussions: Discussion[]
): string {
  const rootNode = createReviewAuditArtifact(mergeRequest, discussions);
  return serializeXmlNode(rootNode);
}

export { createReviewAuditArtifact };
