// @file: GitHub-specific implementation of repository content operations.
// @consumers: VcsGithubClient
// @tasks: TSK-30

import { VcsClientRepositoryFiles } from '../abstract/vcs-client-repository-files.ts';
import type { VcsFileContent, VcsFileContentQuery } from '../entities/vcs-file-content.type.ts';

/**
 * @purpose Access to repository file contents via GitHub Contents API.
 * @invariant Error Policy: Network/status errors are thrown outward. 404 → null.
 * @invariant Encoding Contract: GitHub returns base64 → adapter decodes to utf-8.
 * @consumer VcsGithubClient
 */
export class VcsGithubRepositoryFiles extends VcsClientRepositoryFiles {
  /** @purpose GitHub API base URL */
  protected _baseUrl: string;
  /** @purpose GitHub access token */
  protected _token: string;

  /**
   * @purpose Wire the adapter with GitHub connection params for raw content fetches.
   * @param baseUrl GitHub API base URL (e.g. https://api.github.com).
   * @param token GitHub personal access token.
   */
  constructor(baseUrl: string, token: string) {
    super();
    this._baseUrl = baseUrl;
    this._token = token;
  }

  /**
   * @param query Target repository, file path, and ref.
   * @returns File content or null if file not found.
   * @sideEffect Network: GET /repos/:owner/:repo/contents/:path?ref=
   * @see {VcsClientRepositoryFiles#getFileContent} in services/vcs-client/abstract/vcs-client-repository-files.ts
   */
  async getFileContent(query: VcsFileContentQuery): Promise<VcsFileContent | null> {
    const repo = encodeURIComponent(query.repository);
    const filePath = encodeURIComponent(query.path);
    const ref = encodeURIComponent(query.ref);

    let resp: Response;
    try {
      resp = await fetch(`${this._baseUrl}/repos/${repo}/contents/${filePath}?ref=${ref}`, {
        headers: {
          Authorization: 'Bearer ' + this._token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (cause) {
      throw new Error(`GitHub request failed: network error for file ${query.path}`, { cause });
    }

    if (resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`GitHub request failed: ${resp.status} ${resp.statusText} ${text}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const encoding = (data.encoding as string) ?? 'none';
    const content = (data.content as string) ?? '';

    if (encoding === 'base64') {
      const decoded = Buffer.from(content, 'base64').toString('utf-8');
      const isText = !decoded.includes('\x00');
      return {
        path: query.path,
        content: isText ? decoded : content,
        encoding: isText ? 'utf-8' : 'base64',
      };
    }

    const type = data.type as string | undefined;
    if (type === 'submodule' || type === 'symlink') {
      return {
        path: query.path,
        content: (data.submodule_git_url as string) ?? (data.target as string) ?? '',
        encoding: 'utf-8',
      };
    }

    return {
      path: query.path,
      content,
      encoding: 'utf-8',
    };
  }
}
