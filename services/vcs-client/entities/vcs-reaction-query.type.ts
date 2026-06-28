// @file: Parameters for adding/removing an emoji reaction on a merge request note.
// @consumers: VcsClientReactions
// @tasks: TSK-98

/**
 * @purpose Parameters for an emoji reaction: project, MR/PR iid, note id, emoji name.
 * @consumer VcsClientReactions
 */
export type VcsReactionQuery = {
  /** @purpose Project full path (group/repo or owner/repo) */
  project: string;
  /** @purpose MR/PR internal ID */
  iid: string | number;
  /** @purpose Note/comment ID to react to */
  noteId: string;
  /** @purpose Emoji name in provider-specific format (e.g. thumbsup for GitLab, +1 for GitHub) */
  emoji: string;
};
