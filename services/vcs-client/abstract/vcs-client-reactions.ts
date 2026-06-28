// @file: Contract surface for emoji reactions on merge request notes.
// @consumers: VcsClient
// @tasks: TSK-98

import type { VcsReactionQuery } from '../entities/vcs-reaction-query.type.ts';

/**
 * @purpose Access to emoji reactions for Merge Request notes.
 * @consumer VcsClient
 */
export abstract class VcsClientReactions {
  /**
   * @purpose Add an emoji reaction to a note/comment.
   * @param query Parameters: { project, iid, noteId, emoji }.
   * @sideEffect Network: POST to provider API.
   */
  abstract add(query: VcsReactionQuery): Promise<void>;

  /**
   * @purpose Remove own emoji reaction from a note/comment.
   * @param query Parameters: { project, iid, noteId, emoji }.
   * @sideEffect Network: DELETE from provider API.
   */
  abstract remove(query: VcsReactionQuery): Promise<void>;
}
