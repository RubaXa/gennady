// @file: Contract surface for repository file operations — reading files from VCS repository.
// @consumers: VcsClient
// @tasks: TSK-28

import type { VcsFileContent, VcsFileContentQuery } from '../entities/vcs-file-content.type.ts';

/**
 * @purpose Доступ к содержимому файлов репозитория VCS.
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 * @invariant Encoding Contract: Адаптер декодирует контент (base64 → utf-8 для текстовых).
 * @consumer VcsClient
 */
export abstract class VcsClientRepositoryFiles {
  /**
   * @purpose Получить содержимое файла из репозитория.
   * @param query Параметры: { repository, path, ref }.
   * @returns Содержимое файла или null, если файл не найден (404).
   * @sideEffect Network: GitLab GET /projects/:id/repository/files/:path/raw?ref= | GitHub GET /repos/:owner/:repo/contents/:path?ref=
   */
  abstract getFileContent(query: VcsFileContentQuery): Promise<VcsFileContent | null>;
}
