// @file: Minimal MR context for review artifact generation.
// @consumers: build-review-artifact.xml, load-review-context-mr.logic, review-artifact.type
// @tasks: N/A

/**
 * @purpose Minimal MR context for review artifact generation.
 * @consumer load-review-context-mr.logic
 */
export type ReviewContextMr = {
  /** @purpose GitLab MR internal ID. */
  iid: number;
  /** @purpose GitLab project ID. */
  project_id?: number;
  /** @purpose Source branch of the MR. */
  source_branch?: string;
  /** @purpose MR title. */
  title?: string;
  /** @purpose Web URL of the MR. */
  web_url?: string;
  /** @purpose Author info of the MR. */
  author?: { username?: string };
};

/**
 * @purpose GitLab discussion note type used in the XML artifact.
 * @consumer build-review-artifact.xml
 */
export type ReviewContextMrNote = {
  /** @purpose Note ID. */
  id?: number;
  /** @purpose Note body text. */
  body?: string;
  /** @purpose Note author info. */
  author?: { username?: string };
  /** @purpose Whether this is a system-generated note. */
  system?: boolean;
  /** @purpose Diff position the note applies to. */
  position?: {
    new_path?: string;
    old_path?: string;
    new_line?: number;
    old_line?: number;
    head_sha?: string;
  };
  /** @purpose Whether the note is resolvable. */
  resolvable?: boolean;
  /** @purpose Whether the note is resolved. */
  resolved?: boolean;
  /** @purpose Who resolved the note. */
  resolved_by?: { username?: string } | null;
};

/**
 * @purpose GitLab discussion type used in the XML artifact.
 * @consumer build-review-artifact.xml
 */
export type ReviewContextMrDiscussion = {
  /** @purpose Discussion ID. */
  id: string;
  /** @purpose Notes in this discussion thread. */
  notes?: ReviewContextMrNote[];
  /** @purpose Whether the discussion is resolvable. */
  resolvable?: boolean;
  /** @purpose Whether the discussion is resolved. */
  resolved?: boolean;
  /** @purpose Who resolved the discussion. */
  resolved_by?: { username?: string } | null;
};
