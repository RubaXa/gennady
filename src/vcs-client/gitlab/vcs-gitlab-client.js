import { VcsGitlabMergeRequests } from './vcs-merge-requests.js';
import { VcsGitlabMergeDiscussions } from './vcs-merge-discussions.js';

/**
 * @purpose Клиент GitLab для работы с REST API.
 * @consumer cli/review-verify
 * @invariant Error Policy: Любой ответ !2xx преобразуется в Error с подробностями статуса.
 * @invariant Retry Policy: Повторов нет; ответственность за ретраи на вызывающей стороне.
 */
export class VcsGitlabClient {
	/**
	 * @purpose Инициализировать клиента с базовым URL и токеном.
	 * @param options Параметры клиента: { baseUrl: 'https://gitlab.example.com/api/v2', token: '...' }.
	 * @returns Экземпляр с пространствами MergeRequests и MergeDiscussions.
	 */
	constructor(options) {
		const request = async (path, init = {}) => {
			const response = await fetch(`${options.baseUrl}${path}`, {
				...init,
				headers: {
					'PRIVATE-TOKEN': options.token,
					...(init.headers || {}),
				},
			});
			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new Error(`GitLab request failed: ${response.status} ${response.statusText} ${text}`);
			}
			return response.json();
		};

		this.MergeRequests = new VcsGitlabMergeRequests(request);
		this.MergeDiscussions = new VcsGitlabMergeDiscussions(request);
	}
}
