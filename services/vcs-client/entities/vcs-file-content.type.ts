// @file: File content from VCS repository.
// @consumers: VcsClientRepositoryFiles.getFileContent
// @tasks: TSK-27

/**
 * @purpose File content from repository: path, content (decoded), encoding.
 * @consumer VcsClientRepositoryFiles.getFileContent
 */
export type VcsFileContent = {
  /** @purpose Path to file in repository */
  path: string;
  /** @purpose File content (decoded by adapter: base64 → utf-8 for text, base64 for binary) */
  content: string;
  /** @purpose Content encoding: utf-8 (text) or base64 (binary) */
  encoding: 'utf-8' | 'base64';
};

/**
 * @purpose File content query parameters: repository, path, branch/commit.
 * @consumer VcsClientRepositoryFiles.getFileContent
 */
export type VcsFileContentQuery = {
  /** @purpose Repository identifier (group/project or owner/repo) */
  repository: string;
  /** @purpose Path to file in repository */
  path: string;
  /** @purpose Branch, tag, or commit SHA */
  ref: string;
};
