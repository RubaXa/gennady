import { AiCore } from '../ai/ai-core.js';
import { getGitDiffInfo } from '../git/git-core.js';
import { prompts } from '../prompts/index.js';
import { style } from '../utils/style.js';
import { xmlCommitMessageToJson } from '../utils/xml.js';

export class CommitGen {
	constructor(init) {
		this.init = {
			mode: 'auto',
			oneline: false,
			targetBranch: undefined,
			task: undefined,

			logger: console,

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

	async fetchPrompt(input) {
		const output = await this.ai.generate(`/no_think ${input} /no_think`);
		return output;
	}

	async generate() {
		const {
			commitCount,
			parsedCodeDiff,
			parsedCodeTokens,
			parsedCodeChunkMaxTokens,
			programmingLanguages,
		} = getGitDiffInfo(this.init.targetBranch);
		
		if (parsedCodeDiff.length === 0) {
			this.logger.warn(`No changes detected, skipping commit message generation.`);
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

		this.logger.info(`- Mode: ${style.bold.magentaBright(mode)}`);
		this.logger.info(`- Languages: ${style.yellow(programmingLanguages.join(', '))}`);
		this.logger.info(`- Tokens: ${style.bold.cyanBright(parsedCodeTokens)} ${style.gray(`(max per file: ${parsedCodeChunkMaxTokens})`)}`);

		const batches = this.ai.createPromptsBatchesByDiff(parsedCodeDiff);

		this.logger.info(`- Queue: ${style.bold.cyan(batches.length)}`);
		this.logger.info(`-`.repeat(40));

		const startGenTime = performance.now();
		const changesetList = await Promise.all(batches.map(async (batch) => {
			console.info(`- Task:`, batch.tokens, batch.languages);

			const prompt = this.init.promptCommitChangeset
				.replaceAll('{languages}', batch.languages.join('/'))
				.replaceAll('{input}', batch.diff);

			const msg = await this.fetchPrompt(prompt);

			return msg
		}));

		this.logger.info(`-`.repeat(30));
		this.logger.info(`- Changeset: ${style.blueBright(((performance.now() - startGenTime) / 1000).toFixed(2))}s`);

		const startMsgTime = performance.now();
		const changeset = `<changeset>\n  ${changesetList.flatMap((text) => {
				const changeset = text.match(/<changeset>([\s\S]*?)<\/changeset>/)?.[1];
				const changes = changeset?.match(/<change.*?>.*?<\/change>/g);
				return changes || [];
			}).join('\n  ')}\n</changeset>`;

		const result = await this.fetchPrompt(
			this.init.promptCommitMessage.replaceAll('{input}', changeset),
		);

		this.logger.info(`- Commit message: ${style.blueBright(((performance.now() - startMsgTime) / 1000).toFixed(2))}s`);

		const message = xmlCommitMessageToJson(result);

		// AI: TASK_FORMATTING_START
		let subject = message.subject;
		if (this.task) {
			const taskId = this.task.toString();
			const formattedTaskId = /^\d+$/.test(taskId) ? `#${taskId}` : taskId;
			subject = `${subject} (${formattedTaskId})`;
		}
		// AI: TASK_FORMATTING_END

		if (mode === 'oneline') {
			return `${message.type}: ${subject} ${message.icon}`;
		}

		return `${message.type}: ${subject} ${message.icon}\n\n${message.description}`;
	}
}
