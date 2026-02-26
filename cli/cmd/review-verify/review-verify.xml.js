import { serializeXmlNode } from '../../../src/utils/xml.js';

/**
 * @purpose Определяет роль участника (Actor) в дискуссии на основе контента и авторства MR.
 * @param {Object} note Объект комментария из GitLab API.
 * @param {string} mrAuthorUsername Логин автора Merge Request для сравнения.
 * @returns {string} Тип актора (AI_Model, Human_Author, Human_Reviewer, Bot) для классификации в аудите.
 */
function getActorType(note, mrAuthorUsername) {
  const { body, author } = note;
  const username = author?.username || '';
  
  if (body && body.includes('🤖')) {
    return 'AI_Model';
  }
  
  if (username === mrAuthorUsername) {
    return 'Human_Author';
  }
  
  // Regex: "group_|_bot\d*"
  // Checks if username matches group_ OR _bot followed by digits
  if (/group_|bot\d*/.test(username)) {
    return 'Bot';
  }
  
  return 'Human_Reviewer';
}

/**
 * @purpose Трансформирует данные MR и дискуссий в структуру артефакта аудита.
 * @consumer review-verify-module
 * @param {Object} mergeRequest Сырой объект Merge Request из GitLab API.
 * @param {Array<Object>} discussions Список тредов дискуссий из GitLab API.
 * @returns {XmlNode} Корневой узел сформированного XML-дерева для последующей сериализации.
 */
function createReviewAuditArtifact(mergeRequest, discussions) {
  const mrAuthorUsername = mergeRequest.author?.username;

  // 1. Merge_Request_Context
  const mrContext = {
    tag: 'Merge_Request_Context',
    children: [
      {
        tag: 'MR_Identity',
        children: [
          { tag: 'ID', children: String(mergeRequest.iid) },
          { tag: 'Project_Namespace', children: String(mergeRequest.project_id) }, // Assuming project_id or need to fetch namespace
          { tag: 'Host_Origin', children: 'gitlab.corp.mail.ru' }, // Hardcoded or from config? Using default from example
          { tag: 'Web_Link', children: mergeRequest.web_url }
        ]
      },
      {
        tag: 'Git_State',
        children: [
          { tag: 'Source_Branch', children: mergeRequest.source_branch },
          { tag: 'Author_Identity', children: mrAuthorUsername },
          { tag: 'Title_Semantics', children: mergeRequest.title }
        ]
      }
    ]
  };

  // 2. Discussion_Vectors_Registry
  const vectors = discussions.map((disc, index) => {
    // Find the first note to get location info (usually in the first note of a thread)
    const firstNote = disc.notes && disc.notes[0];
    if (!firstNote) return null;

    // Filter out system notes if needed, or process them. 
    // The example shows "initiation" and "response".
    
    const dialogueTrace = (disc.notes || []).map((note, noteIndex) => {
        // Skip system notes if they don't have body or author?
        if (note.system) return null; 

        return {
            tag: 'Dialogue_Turn',
            attrs: {
                sequence: String(noteIndex + 1),
                type: noteIndex === 0 ? 'initiation' : 'response'
            },
            children: [
                {
                    tag: 'Actor_Meta',
                    children: [
                        { tag: 'Actor_ID', children: note.author?.username },
                        { tag: 'Actor_Type', children: getActorType(note, mrAuthorUsername) }
                    ]
                },
                {
                    tag: 'Content_Payload',
                    children: note.body // This will be escaped by serializeXmlNode
                }
            ]
        };
    }).filter(Boolean);

    // If no dialogue trace (e.g. all system notes), skip this vector?
    if (dialogueTrace.length === 0) return null;

    // Code Locus logic
    // Usually position is in note.position (if it's a diff discussion)
    const position = firstNote.position || {};
    const codeLocus = {
        tag: 'Code_Locus',
        children: [
            { tag: 'File_Path', children: position.new_path || position.old_path || 'unknown' },
            { tag: 'Line_Number', children: String(position.new_line || position.old_line || 0) },
            { tag: 'Commit_Hash', children: position.head_sha || 'unknown' } // or base_sha / start_sha
        ]
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
                children: dialogueTrace
            }
        ]
    };
  }).filter(Boolean);

  const registry = {
    tag: 'Discussion_Vectors_Registry',
    children: vectors
  };

  return {
    tag: 'Review_Audit_Artifact',
    attrs: { type: 'verification_source' },
    children: [mrContext, registry]
  };
}

/**
 * @purpose Генерирует полный XML-отчет по ревью кода для сохранения артефакта аудита.
 * @consumer review-verify-module, cli-command
 * @param {Object} mergeRequest Данные MR.
 * @param {Array<Object>} discussions Данные дискуссий.
 * @returns {string} Полный XML-документ.
 */
export function buildReviewVerifyXml(mergeRequest, discussions) {
  const rootNode = createReviewAuditArtifact(mergeRequest, discussions);
  return serializeXmlNode(rootNode);
}

// Export functions for testing
export {
  createReviewAuditArtifact
};
