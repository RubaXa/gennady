import { AiCore } from '../ai/ai-core.js';
import { getGitDiffInfo } from '../git/git-core.js';
import { prompts } from '../prompts/index.js';
import { style } from '../utils/style.js';

export class CommitGen {
	constructor(init) {
		this.init = {
			mode: 'auto',
			oneline: false,
			targetBranch: undefined,

			logger: console,

			basePromptTemplate: prompts.commit('base'),
			formatOnelinePromptTemplate: prompts.commit('format-oneline'),
			formatDetailedPromptTemplate: prompts.commit('format-detailed'),
			translatePromptTemplate: prompts.commit('translate'),

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

	async fetchPrompt(input) {
		const output = await this.ai.generate(input);
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
		this.logger.info(`- Languages: ${style.yellow(programmingLanguages)}`);
		this.logger.info(`- Tokens: ${style.bold.cyanBright(parsedCodeTokens)} ${style.gray(`(max per file: ${parsedCodeChunkMaxTokens})`)}`);

		const batches = this.ai.createPromptsBatchesByDiff(parsedCodeDiff);

		this.logger.info(`- Queue: ${style.bold.cyan(batches.length)}`);
		this.logger.info(`-`.repeat(40));

		const startGenTime = performance.now();
		const results = await Promise.all(batches.map(async (batch) => {
			console.info(`- Task:`, batch.tokens, batch.languages);

			const prompt = this.init.basePromptTemplate
				.replaceAll('{languages}', batch.languages.join('/'))
				.replaceAll('{input}', batch.diff);

			const msg = await this.fetchPrompt(prompt);

			return msg
		}));

		this.logger.info(`-`.repeat(30));
		this.logger.info(`- Generation time: ${style.blueBright(((performance.now() - startGenTime) / 1000).toFixed(2))}s`);

		const startFormatTime = performance.now();
		const formatted = await this.toFormat(
			mode === 'detailed' ? this.init.formatDetailedPromptTemplate : this.init.formatOnelinePromptTemplate,
			results.join('\n\n'),
		);

		this.logger.info(`- Formatting time: ${style.blueBright(((performance.now() - startFormatTime) / 1000).toFixed(2))}s`);

		return formatted.trim();
	}

	async toFormat(format, text) {
		const result = await this.fetchPrompt(format.replaceAll('{input}', text));
		return result.replace(/(^[\s\S]*<message>|<\/message>[\s\S]*$)/g, '').replace(`\n-`, `\n\n-`);
	}

	async translate(input, lang) {
		const result =  await this.fetchPrompt(this.init.translatePromptTemplate
			.replaceAll('{input}', input)
			.replaceAll('{lang}', lang));

		return result.replace(/(^[\s\S]*<message>|<\/message>[\s\S]*)/g, '');
	}
}
