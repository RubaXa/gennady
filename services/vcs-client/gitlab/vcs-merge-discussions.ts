type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Параметры создания заметки в дискуссии MR: проект, IID MR, ID дискуссии, текст.
 * @consumer VcsGitlabMergeDiscussions
 */
export type AddNoteQuery = {
  project: string;
  iid: string | number;
  discussionId: string;
  body: string;
};

/**
 * @purpose Параметры запроса списка дискуссий MR: проект, IID MR, пагинация.
 * @consumer VcsGitlabMergeDiscussions
 */
export type DiscussionsListQuery = {
  project: string;
  iid: string | number;
  perPage?: number;
  page?: number;
};

/**
 * @purpose Доступ к Discussions для Merge Request в GitLab.
 * @consumer VcsGitlabClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export class VcsGitlabMergeDiscussions {
  protected _request: RequestFn;

  constructor(request: RequestFn) {
    this._request = request;
  }

  /**
   * @purpose Создать ответ (note) в существующей дискуссии Merge Request.
   * @param query Параметры запроса.
   * @returns Объект созданной заметки (JSON), как возвращает GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
   */
  async addNote(query: AddNoteQuery): Promise<unknown> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const discussionId = encodeURIComponent(query.discussionId);
    return this._request(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: query.body }),
      }
    );
  }

  /**
   * @purpose Получить страницу дискуссий MR.
   * @param query Параметры: { project, iid, perPage?, page? }.
   * @returns Список дискуссий текущей страницы.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
   */
  async getList(query: DiscussionsListQuery): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const projectId = encodeURIComponent(query.project);
    const result = await this._request(
      `/projects/${projectId}/merge_requests/${encodeURIComponent(String(query.iid))}/discussions?${params.toString()}`
    );
    return Array.isArray(result) ? result : [];
  }

  /**
   * @purpose Собрать все страницы дискуссий MR.
   * @param query Параметры: { project, iid }.
   * @returns Полный список дискуссий MR.
   * @sideEffect Network: Многократные GET для постраничной загрузки.
   */
  async getAll(query: { project: string; iid: string | number }): Promise<unknown[]> {
    const perPage = 100;
    let page = 1;
    const all: unknown[] = [];

    while (true) {
      const chunk = await this.getList({ ...query, perPage, page });
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < perPage) break;
      page += 1;
    }

    return all;
  }
}
