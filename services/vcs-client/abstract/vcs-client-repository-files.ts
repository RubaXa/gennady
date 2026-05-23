// @file: Contract surface for repository file operations — reading files from VCS repository.
// @consumers: VcsClient
// @tasks: TSK-28

import type { VcsFileContent, VcsFileContentQuery } from '../entities/vcs-file-content.type.ts';

/**
 * @purpose Access to VCS repository file contents.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @invariant Encoding Contract: Adapter decodes content (base64 → utf-8 for text).
 * @consumer VcsClient
 */
export abstract class VcsClientRepositoryFiles {
  /**
   * @purpose Get file content from repository.
   * @param query Parameters: { repository, path, ref }.
   * @returns File content or null if file not found (404).
   * @sideEffect Network: GitLab GET /projects/:id/repository/files/:path/raw?ref= | GitHub GET /repos/:owner/:repo/contents/:path?ref=
   */
  abstract getFileContent(query: VcsFileContentQuery): Promise<VcsFileContent | null>;
}
