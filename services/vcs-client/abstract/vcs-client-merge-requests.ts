/**
 * @purpose Параметры запроса списка Merge Requests: проект, ветка, состояние, пагинация.
 * @consumer VcsClientMergeRequests
 */
export type VcsMergeRequestsQuery = {
  project: string;
  sourceBranch?: string;
  state?: string;
  perPage?: number;
  page?: number;
};

/**
 * @purpose Параметры запроса Merge Request по IID.
 * @consumer VcsClientMergeRequests
 */
export type VcsMergeRequestByIidQuery = {
  project: string;
  iid: string | number;
};

/**
 * @purpose Доступ к Merge Requests/Pull Requests.
 * @consumer VcsClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export abstract class VcsClientMergeRequests {
  /**
   * @purpose Получить список MR по проекту и фильтрам.
   * @param query Объект запроса.
   * @returns Список Merge Request'ов по минимальным фильтрам.
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
   */
  abstract getByIid(query: VcsMergeRequestByIidQuery): Promise<unknown | null>;
}
