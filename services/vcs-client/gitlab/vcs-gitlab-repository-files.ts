// @file: GitLab-specific implementation of repository file operations.
// @consumers: VcsGitlabClient
// @tasks: TSK-29

import { VcsClientRepositoryFiles } from '../abstract/vcs-client-repository-files.ts';
import type { VcsFileContent, VcsFileContentQuery } from '../entities/vcs-file-content.type.ts';

/**
 * @purpose Access repository files via GitLab API (/raw endpoint).
 * @invariant Error Policy: Network/status errors propagated to caller. 404 → null.
 * @invariant Encoding Contract: Text files → encoding: 'utf-8'; binary → encoding: 'base64'.
 * @consumer VcsGitlabClient
 */
export class VcsGitlabRepositoryFiles extends VcsClientRepositoryFiles {
  /** @purpose GitLab instance base URL */
  protected _baseUrl: string;
  /** @purpose GitLab access token */
  protected _token: string;

  /**
   * @purpose Wire the adapter with GitLab connection params for raw file fetches.
   * @param baseUrl GitLab instance base URL (e.g. https://gitlab.com/api/v4).
   * @param token GitLab personal access token.
   */
  constructor(baseUrl: string, token: string) {
    super();
    this._baseUrl = baseUrl;
    this._token = token;
  }

  /**
   * @param query Target repository, file path, and ref.
   * @returns File content or null if file not found.
   * @sideEffect Network: GET /projects/:id/repository/files/:path/raw?ref=
   * @see {VcsClientRepositoryFiles#getFileContent} in services/vcs-client/abstract/vcs-client-repository-files.ts
   */
  async getFileContent(query: VcsFileContentQuery): Promise<VcsFileContent | null> {
    const repoId = encodeURIComponent(query.repository);
    const filePath = encodeURIComponent(query.path);
    const ref = encodeURIComponent(query.ref);

    let resp: Response;
    try {
      resp = await fetch(
        `${this._baseUrl}/projects/${repoId}/repository/files/${filePath}/raw?ref=${ref}`,
        { headers: { 'PRIVATE-TOKEN': this._token } }
      );
    } catch (cause) {
      throw new Error(`GitLab request failed: network error for file ${query.path}`, { cause });
    }

    if (resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`GitLab request failed: ${resp.status} ${resp.statusText} ${text}`);
    }

    const contentType = resp.headers.get('content-type') ?? '';
    const text = await resp.text();

    const isText =
      contentType.startsWith('text/') ||
      contentType.includes('json') ||
      contentType.includes('xml') ||
      contentType.includes('javascript') ||
      !contentType;

    return {
      path: query.path,
      content: text,
      encoding: isText ? 'utf-8' : 'base64',
    };
  }
}
