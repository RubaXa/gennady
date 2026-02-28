type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Параметры запроса списка Merge Requests: проект, ветка, состояние, пагинация.
 * @consumer VcsGitlabMergeRequests
 */
export type MergeRequestsQuery = {
  project: string;
  sourceBranch?: string;
  state?: string;
  perPage?: number;
  page?: number;
};

/**
 * @purpose Доступ к Merge Requests в GitLab.
 * @consumer VcsGitlabClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export class VcsGitlabMergeRequests {
  protected _request: RequestFn;

  constructor(request: RequestFn) {
    this._request = request;
  }

  /**
   * @purpose Получить список MR по проекту и фильтрам.
   * @param query Объект запроса: { project, sourceBranch?, state?, perPage?, page? }.
   * @returns Список Merge Request'ов по минимальным фильтрам.
   * @sideEffect Network: GET /projects/:project/merge_requests
   */
  async getList(query: MergeRequestsQuery): Promise<unknown[]> {
    const params = new URLSearchParams();
    const state = query?.state ?? 'opened';
    if (query?.sourceBranch) params.set('source_branch', query.sourceBranch);
    if (state) params.set('state', state);
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const projectId = encodeURIComponent(query.project);
    const result = await this._request(
      `/projects/${projectId}/merge_requests?${params.toString()}`
    );
    return Array.isArray(result) ? result : [];
  }

  /**
   * @purpose Получить первый MR, удовлетворяющий тем же фильтрам, что и getList.
   * @param query Объект запроса: { project, sourceBranch?, state? }.
   * @returns Первый найденный MR или null.
   * @sideEffect Network: Делегирует в getList() с ограничением per_page=1.
   */
  async getOne(query: MergeRequestsQuery): Promise<unknown | null> {
    const list = await this.getList({ ...query, perPage: 1 });
    return list.length > 0 ? list[0] : null;
  }
}
