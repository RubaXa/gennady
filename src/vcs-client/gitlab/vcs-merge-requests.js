/**
 * @purpose Доступ к Merge Requests в GitLab.
 * @consumer VcsGitlabClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export class VcsGitlabMergeRequests {
	/**
	 * @purpose Сохранить транспорт запроса с авторизацией.
	 * @param request Обёртка над fetch с установленным PRIVATE-TOKEN.
	 */
	constructor(request) {
		this._request = request;
	}

	/**
	 * @purpose Получить список MR по проекту и фильтрам.
	 * @param query Объект запроса: { project, sourceBranch?, state?, perPage?, page? }.
	 * @returns Список Merge Request'ов по минимальным фильтрам.
	 * @sideEffect Network: GET /projects/:project/merge_requests
	 */
	async getList(query) {
		const params = new URLSearchParams();
		const state = query?.state || 'opened';
		if (query?.sourceBranch) params.set('source_branch', query.sourceBranch);
		if (state) params.set('state', state);
		if (query?.perPage) params.set('per_page', String(query.perPage));
		if (query?.page) params.set('page', String(query.page));
		const projectId = encodeURIComponent(query.project);
		return this._request(`/projects/${projectId}/merge_requests?${params.toString()}`);
	}

	/**
	 * @purpose Получить первый MR, удовлетворяющий тем же фильтрам, что и getList.
	 * @param query Объект запроса: { project, sourceBranch?, state? }.
	 * @returns Первый найденный MR или null.
	 * @sideEffect Network: Делегирует в getList() с ограничением per_page=1.
	 */
	async getOne(query) {
		const list = await this.getList({ ...query, perPage: 1 });
		return Array.isArray(list) && list.length > 0 ? list[0] : null;
	}
}
