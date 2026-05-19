// @file: File content from VCS repository.
// @consumers: VcsClientRepositoryFiles.getFileContent
// @tasks: TSK-27

/**
 * @purpose Содержимое файла из репозитория: путь, контент (декодированный), кодировка.
 * @consumer VcsClientRepositoryFiles.getFileContent
 */
export type VcsFileContent = {
  /** @purpose Путь к файлу в репозитории */
  path: string;
  /** @purpose Содержимое файла (декодировано адаптером: base64 → utf-8 для текстовых, base64 для бинарных) */
  content: string;
  /** @purpose Кодировка контента: utf-8 (текст) или base64 (бинарные) */
  encoding: 'utf-8' | 'base64';
};

/**
 * @purpose Параметры запроса содержимого файла: репозиторий, путь, ветка/коммит.
 * @consumer VcsClientRepositoryFiles.getFileContent
 */
export type VcsFileContentQuery = {
  /** @purpose Идентификатор репозитория (group/project или owner/repo) */
  repository: string;
  /** @purpose Путь к файлу в репозитории */
  path: string;
  /** @purpose Ветка, тег или SHA коммита */
  ref: string;
};
