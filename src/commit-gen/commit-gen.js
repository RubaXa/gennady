import { AiCore } from '../ai/ai-core.js';
import { getGitDiffInfo } from '../git/git-core.js';
import { prompts } from '../prompts/index.js';
import { logger } from '../utils/logger.js';
import { style } from '../utils/style.js';
import { xmlCommitMessageToJson } from '../utils/xml.js';

/**
 * @purpose Генерировать commit-сообщение из staged diff через LLM.
 * @consumer CLI (cmd/commit)
 * @invariant Использует AiCore и getGitDiffInfo; при пустом diff возвращает undefined.
 */
export class CommitGen {
	constructor(init) {
		this.init = {
			mode: 'auto',
			oneline: false,
			targetBranch: undefined,
			task: undefined,

			logger,

			promptCommitMessage: prompts.commit('message'),
			promptCommitChangeset: prompts.commit('changeset'),

			timeout: 120,

			...init,
		};

		this.ai = new AiCore({
			logger: this.logger,
			timeout: this.init.timeout,
		});
	}

	get logger() {
		return this.init.logger;
	}

	get mode() {
		return this.init.mode;
	}

	get model() {
		return this.ai.model
	}

	get apiUrl() {
		return this.ai.apiUrl;
	}

	get targetBranch() {
		return this.init.targetBranch;
	}

	get task() {
		return this.init.task;
	}

	/**
	 * @purpose Вызвать LLM для одного промпта (внутренний хелпер).
	 * @param input Текст промпта.
	 * @returns Ответ модели.
	 * @sideEffect Network: запрос к LLM.
	 */
	async fetchPrompt(input) {
		return this.ai.generate(`/no_think ${input} /no_think`);
	}

	/**
	 * @purpose Сгенерировать commit-сообщение по staged diff.
	 * @returns Строка сообщения (oneline или с телом) или undefined при пустом diff.
	 * @sideEffect Network: запросы к LLM; Logs: этапы и метрики.
	 */
	async generate() {
		const startedAt = performance.now();
		this.logger.info(`[CommitGen#generate] [idle -> loading] targetBranch=${this.init.targetBranch ?? 'HEAD'}`);

		const {
			commitCount,
			parsedCodeDiff,
			parsedCodeTokens,
			parsedCodeChunkMaxTokens,
			programmingLanguages,
		} = getGitDiffInfo(this.init.targetBranch);

		if (parsedCodeDiff.length === 0) {
			this.logger.warn(`[CommitGen#generate] [loading -> skipped] No staged changes`);
			this.logger.info(style.italic.gray(`Hint: git add .`));
			return;
		}

		const mode =
			this.init.oneline
			? 'oneline'
			: this.init.mode === 'auto'
			? this.init.targetBranch
			? 'detailed'
			: commitCount > 1 && parsedCodeDiff.length < 5
			? 'oneline'
			: 'detailed'
			: this.init.mode;

		this.logger.info(`[CommitGen#generate] [loading -> batching] mode=${style.bold.magentaBright(mode)} languages=${programmingLanguages.join(', ')} tokens=${parsedCodeTokens} (max per file: ${parsedCodeChunkMaxTokens})`);

		const batches = this.ai.createPromptsBatchesByDiff(parsedCodeDiff);
		this.logger.debug(`[CommitGen#generate] [batching -> ready] queue=${batches.length}`);

		const startGenTime = performance.now();
		const changesetList = await Promise.all(batches.map(async (batch) => {
			this.logger.debug(`[CommitGen#generate] [batching -> task] ${batch.tokens} tokens, ${batch.languages?.join('/')}`);

			const prompt = this.init.promptCommitChangeset
				.replaceAll('{languages}', batch.languages.join('/'))
				.replaceAll('{input}', batch.diff);

			return this.fetchPrompt(prompt);
		}));

		const changesetTime = performance.now() - startGenTime;
		this.logger.info(`[CommitGen#generate] [batching -> changeset] (${(changesetTime / 1000).toFixed(2)}s)`);

		const startMsgTime = performance.now();
		const changeset = `<changeset>\n  ${changesetList.flatMap((text) => {
				const changeset = text.match(/<changeset>([\s\S]*?)<\/changeset>/)?.[1];
				const changes = changeset?.match(/<change.*?>.*?<\/change>/g);
				return changes || [];
			}).join('\n  ')}\n</changeset>`;

		const result = await this.fetchPrompt(
			this.init.promptCommitMessage.replaceAll('{input}', changeset),
		);

		const msgTime = performance.now() - startMsgTime;
		this.logger.info(`[CommitGen#generate] [changeset -> message] (${(msgTime / 1000).toFixed(2)}s)`);

		const message = xmlCommitMessageToJson(result);

		let subject = message.subject;
		if (this.task) {
			const taskId = this.task.toString();
			const formattedTaskId = /^\d+$/.test(taskId) ? `#${taskId}` : taskId;
			subject = `${subject} (${formattedTaskId})`;
		}

		const totalTime = performance.now() - startedAt;
		this.logger.info(`[CommitGen#generate] [message -> completed] (${(totalTime / 1000).toFixed(2)}ms)`);

		if (mode === 'oneline') {
			return `${message.type}: ${subject} ${message.icon}`;
		}

		return `${message.type}: ${subject} ${message.icon}\n\n${message.description}`;
	}
}
