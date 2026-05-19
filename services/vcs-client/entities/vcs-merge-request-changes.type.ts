// @file: Merge Request / Pull Request changed files — list with metadata.
// @consumers: VcsClientMergeRequests.getChanges
// @tasks: TSK-27

/**
 * @purpose Один изменённый файл в MR/PR: путь, статус, ветка, метрики изменений.
 * @consumer VcsClientMergeRequests.getChanges
 */
export type VcsMergeRequestChanges = {
  /** @purpose Путь к файлу (new_path для GitLab, filename для GitHub) */
  path: string;
  /** @purpose Статус изменения: added, modified, deleted, renamed */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** @purpose Предыдущий путь (только для renamed) */
  previousPath?: string;
  /** @purpose Ветка (source_branch GitLab / head.ref GitHub) — для getFileContent */
  ref: string;
  /** @purpose Количество добавленных строк */
  additions?: number;
  /** @purpose Количество удалённых строк */
  deletions?: number;
};

/**
 * @purpose Параметры запроса изменений MR/PR: репозиторий, номер, пагинация.
 * @consumer VcsClientMergeRequests.getChanges
 */
export type VcsMergeRequestChangesQuery = {
  /** @purpose Идентификатор репозитория (group/project или owner/repo) */
  repository: string;
  /** @purpose Номер MR (IID) или PR (number) */
  iid: string | number;
  /** @purpose Номер страницы (начиная с 1) */
  page?: number;
  /** @purpose Размер страницы */
  perPage?: number;
};
