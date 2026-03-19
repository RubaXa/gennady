/**
 * @purpose Параметры создания заметки в дискуссии MR: проект, IID MR, ID дискуссии, текст.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsAddNoteQuery = {
  project: string;
  iid: string | number;
  discussionId: string;
  body: string;
};

/**
 * @purpose Параметры запроса списка дискуссий MR: проект, IID MR, пагинация.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsDiscussionsListQuery = {
  project: string;
  iid: string | number;
  perPage?: number;
  page?: number;
};

/**
 * @purpose Доступ к Discussions для Merge Request в GitLab.
 * @consumer VcsClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export abstract class VcsClientMergeDiscussions {
  /**
   * @purpose Создать ответ (note) в существующей дискуссии Merge Request.
   * @param query Параметры запроса.
   * @returns Объект созданной заметки (JSON), как возвращает GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
   */
  abstract addNote(query: VcsAddNoteQuery): Promise<unknown>;

  /**
   * @purpose Получить страницу дискуссий MR.
   * @param query Параметры: { project, iid, perPage?, page? }.
   * @returns Список дискуссий текущей страницы.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
   */
  abstract getList(query: VcsDiscussionsListQuery): Promise<unknown[]>;

  /**
   * @purpose Собрать все страницы дискуссий MR.
   * @param query Параметры: { project, iid }.
   * @returns Полный список дискуссий MR.
   * @sideEffect Network: Многократные GET для постраничной загрузки.
   */
  abstract getAll(query: { project: string; iid: string | number }): Promise<unknown[]>;
}
