// @file: Минимальный MR-контекст для генерации review-артефакта.
// @consumers: build-review-artifact.xml, load-review-context-mr.logic, review-artifact.type
// @tasks: N/A

/**
 * @purpose Минимальный MR-контекст для генерации review-артефакта.
 * @consumer load-review-context-mr.logic
 */
export type ReviewContextMr = {
  iid: number;
  project_id?: number;
  source_branch?: string;
  title?: string;
  web_url?: string;
  author?: { username?: string };
};

/**
 * @purpose Тип заметки GitLab discussion, используемый в XML-артефакте.
 * @consumer build-review-artifact.xml
 */
export type ReviewContextMrNote = {
  id?: number;
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
  resolvable?: boolean;
  resolved?: boolean;
  resolved_by?: { username?: string } | null;
};

/**
 * @purpose Тип discussion GitLab, используемый в XML-артефакте.
 * @consumer build-review-artifact.xml
 */
export type ReviewContextMrDiscussion = {
  id: string;
  notes?: ReviewContextMrNote[];
  resolvable?: boolean;
  resolved?: boolean;
  resolved_by?: { username?: string } | null;
};
