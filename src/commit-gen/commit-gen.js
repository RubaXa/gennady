import { getGitCommitCount, getGitDiff } from '../git/git-cmd.js';
import { parseGitDiff } from '../git/git-diff.js';
import { style } from '../utils/style.js';

export class CommitGen {
	constructor(init) {
		this.init = {
			mode: 'auto',
			oneline: false,
			reviewerModel: 'llama3:8b',
			targetBranch: undefined,

			maxInputTokens: init.maxInputTokens || 4000,
			ollamaUrl: init.ollamaUrl || 'http://127.0.0.1:11434/api/generate',
			logger: console,

			basePromptTemplate: undefined,
			formatOnelinePromptTemplate: undefined,
			formatDetailedPromptTemplate: undefined,
			translatePromptTemplate: undefined,

			...init,
		};
	}

	get logger() {
		return this.init.logger;
	}

	get mode() {
		return this.init.mode;
	}

	get reviewerModel() {
		return this.init.reviewerModel;
	}

	get targetBranch() {
		return this.init.targetBranch;
	}

	generateDiffText(files) {
		return files
			.map((file) => `File: ${file.filename}\n${file.diff.join('\n')}`)
			.join('\n\n');
	}

	async fetchPrompt(prompt, context) {
		try {
			const req = await fetch(this.init.ollamaUrl, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					model: this.init.reviewerModel,
					stream: false,
					prompt,
					context,
				}),
			});
			const data = await req.json();
			return data.response || '';
		} catch (e) {
			this.logger.error(`Failed to generate ollama response:`, e);
			return '';
		}
	}
	async generateCommitMessage(prompt) {
		const text = await this.fetchPrompt(prompt);
		return text;
	}

	async generate() {
		const {maxInputTokens} = this.init
		const commitCount = getGitCommitCount();
		const diffStr = getGitDiff(this.init.targetBranch);
		const parsedDiff = parseGitDiff(diffStr).sort((a, b) => a.tokens - b.tokens);
		const codeChanged = parsedDiff.filter(f => !f.isDeleted && !f.isRenamed && f.programmingLanguage);
		
		if (codeChanged.length === 0) {
			this.logger.warn(`No changes detected, skipping commit message generation.`);
			return;
		}

		const tokens = codeChanged.reduce((sum, file) => sum + file.tokens, 0);
		const maxTokens = codeChanged[codeChanged.length - 1].tokens;
		const languages = [...new Set(codeChanged.map(f => f.programmingLanguage).filter(Boolean))].join(', ');
		const mode =
			this.init.oneline
			? 'oneline'
			: this.init.mode === 'auto'
			? this.init.targetBranch
			? 'detailed'
			: commitCount > 1 && codeChanged.length < 5
			? 'oneline'
			: 'detailed'
			: this.init.mode;

		this.logger.info(`- Mode: ${style.bold.magentaBright(mode)}`);
		this.logger.info(`- Languages: ${style.yellow(languages)}`);
		this.logger.info(`- Tokens: ${style.bold.cyanBright(tokens)} ${style.gray(`(max per file: ${maxTokens})`)}`);

		if (maxTokens > maxInputTokens) {
			this.logger.error(`TODO: Diff is too large, skipping commit message generation.`);
			process.exit(1);
		}

		const batches = codeChanged.reduce((acc, file) => {
			if (!acc[0] || acc[0].tokens + file.tokens > maxInputTokens) {
				if (acc[0]) {
					acc[0].languages = [...new Set(acc[0].languages)];
				}

				acc.unshift({tokens: 0, diff: '', languages: []});
			}

			acc[0].tokens += file.tokens;
			acc[0].diff += `File: ${file.filename}\n${file.diff.hunks.flatMap(h => h.changes).join('\n')}\n\n`;
			acc[0].languages.push(file.programmingLanguage);

			return acc;
		}, []);

		this.logger.info(`- Queue: ${style.bold.cyan(batches.length)}`);
		this.logger.info(`-`.repeat(40));

		const startGenTime = performance.now();
		const results = await Promise.all(batches.map(async (batch) => {
			console.info(`- Task:`, batch.tokens, batch.languages);

			const prompt = this.init.basePromptTemplate
				.replaceAll('{languages}', batch.languages.join('/'))
				.replaceAll('{input}', batch.diff);

			const msg = await this.generateCommitMessage(prompt);

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
