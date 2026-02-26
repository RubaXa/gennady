/**
 * @purpose Доступ к Discussions для Merge Request в GitLab.
 * @consumer VcsGitlabClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export class VcsGitlabMergeDiscussions {
	/**
	 * @purpose Сохранить транспорт запроса с авторизацией.
	 * @param request Обёртка над fetch с установленным PRIVATE-TOKEN.
	 */
	constructor(request) {
		this._request = request;
	}

	/**
	 * @purpose Создать ответ (note) в существующей дискуссии Merge Request.
	 * @param query Параметры запроса:
	 *  - project: string — идентификатор проекта в формате "group/repo" или id.
	 *  - iid: string|number — IID Merge Request.
	 *  - discussionId: string — идентификатор дискуссии (thread).
	 *  - body: string — текст заметки для публикации.
	 * @returns Объект созданной заметки (JSON), как возвращает GitLab API.
	 * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
	 * @invariant Error Policy: Любой ответ !2xx генерирует Error из слоя request().
	 */
	async addNote(query) {
		const projectId = encodeURIComponent(query.project);
		const iid = encodeURIComponent(query.iid);
		const discussionId = encodeURIComponent(query.discussionId);
		return this._request(
			`/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}/notes`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: query.body }),
			},
		);
	}

	/**
	 * @purpose Получить страницу дискуссий MR.
	 * @param query Параметры: { project, iid, perPage?, page? }.
	 * @returns Список дискуссий текущей страницы.
	 * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
	 */
	async getList(query) {
		const params = new URLSearchParams();
		if (query?.perPage) params.set('per_page', String(query.perPage));
		if (query?.page) params.set('page', String(query.page));
		const projectId = encodeURIComponent(query.project);
		return this._request(`/projects/${projectId}/merge_requests/${encodeURIComponent(query.iid)}/discussions?${params.toString()}`);
	}

	/**
	 * @purpose Собрать все страницы дискуссий MR.
	 * @param query Параметры: { project, iid }.
	 * @returns Полный список дискуссий MR.
	 * @sideEffect Network: Многократные GET для постраничной загрузки.
	 */
	async getAll(query) {
		const perPage = 100;
		let page = 1;
		const all = [];

		// eslint-disable-next-line no-constant-condition
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
