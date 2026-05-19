// @file: Contract surface for merge request / pull request operations.
// @consumers: VcsClient
// @tasks: TSK-28

/**
 * @purpose Параметры запроса списка Merge Requests: проект, ветка, состояние, пагинация.
 * @consumer VcsClientMergeRequests
 */
export type VcsMergeRequestsQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Source branch name to filter MRs */
  sourceBranch?: string;
  /** @purpose MR state filter: opened, closed, merged, etc. */
  state?: string;
  /** @purpose Page size | @invariant Default: GitLab default when absent */
  perPage?: number;
  /** @purpose Page number starting from 1 */
  page?: number;
};

/**
 * @purpose Параметры запроса Merge Request по IID.
 * @consumer VcsClientMergeRequests
 */
export type VcsMergeRequestByIidQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
};

/**
 * @purpose Доступ к Merge Requests/Pull Requests.
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 * @consumer VcsClient
 */
export abstract class VcsClientMergeRequests {
  /**
   * @purpose Получить список MR по проекту и фильтрам.
   * @param query Объект запроса.
   * @returns Список Merge Request'ов по минимальным фильтрам.
   * @sideEffect Network: GET /projects/:project/merge_requests
   */
  abstract getList(query: VcsMergeRequestsQuery): Promise<unknown[]>;

  /**
   * @purpose Получить первый MR, удовлетворяющий тем же фильтрам, что и getList.
   * @param query Объект запроса.
   * @returns Первый найденный MR или null.
   * @sideEffect Network: Делегирует в getList() с ограничением per_page=1.
   */
  abstract getOne(query: VcsMergeRequestsQuery): Promise<unknown | null>;

  /**
   * @purpose Получить Merge Request по IID в рамках проекта.
   * @param query Параметры: { project, iid }.
   * @returns Объект Merge Request или null при 404.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid
   */
  abstract getByIid(query: VcsMergeRequestByIidQuery): Promise<unknown | null>;

  /**
   * @purpose Получить список изменённых файлов в MR/PR.
   * @param query Параметры: { repository, iid, page?, perPage? }.
   * @returns Список изменённых файлов с метаданными.
   * @sideEffect Network: GitLab GET /projects/:id/merge_requests/:iid/changes | GitHub GET /repos/:owner/:repo/pulls/:number/files
   */
  abstract getChanges(
    query: import('../entities/vcs-merge-request-changes.type.ts').VcsMergeRequestChangesQuery
  ): Promise<import('../entities/vcs-merge-request-changes.type.ts').VcsMergeRequestChanges[]>;
}
