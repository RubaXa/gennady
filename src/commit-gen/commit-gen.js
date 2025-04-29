import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getGitCommitCount, getGitDiff } from '../git/git-cmd.js';
import { parseGitDiff } from '../git/git-diff.js';
import { style } from '../utils/style.js';

const DEFAULT_MODEL = 'llama3:8b';
const DEFAULT_API_URL = 'http://127.0.0.1:11434/api/generate';

const GENNADY_RC_FILENAME = '.gennadyrc';

export class CommitGen {
	api;
	apiList = [];

	constructor(init) {
		this.init = {
			mode: 'auto',
			oneline: false,
			targetBranch: undefined,

			logger: console,
			maxInputTokens: init.maxInputTokens || 4000,

			basePromptTemplate: undefined,
			formatOnelinePromptTemplate: undefined,
			formatDetailedPromptTemplate: undefined,
			translatePromptTemplate: undefined,

			timeout: 120,

			...init,
		};

		// Try parse rc files
		[
			join(process.cwd(), GENNADY_RC_FILENAME),
			join(process.env.HOME, GENNADY_RC_FILENAME),
		].find((file) => {
			try {
				if (existsSync(file)) {
					const items = JSON.parse(readFileSync(file).toString());
					if (Array.isArray(items)) {
						this.apiList.push(...items);
					} else {
						this.logger.warn(`Invalid "${file}" config:`, items);
					}
				}
			} catch (err) {
				this.logger.error(`Parse "${file}" error:`, err);
			}
		});
		
		// Default API
		this.apiList[this.init.apiUrl ? 'unshift' : 'push']({
			url: this.init.apiUrl || DEFAULT_API_URL,
			key: this.init.apiKey,
			model: this.init.model || DEFAULT_MODEL,
		});
	}

	get logger() {
		return this.init.logger;
	}

	get mode() {
		return this.init.mode;
	}

	get model() {
		return this.api?.model || this.apiList[0].model;
	}

	get apiUrl() {
		return this.api?.url || this.apiList[0].url;
	}

	get targetBranch() {
		return this.init.targetBranch;
	}

	generateDiffText(files) {
		return files
			.map((file) => `File: ${file.filename}\n${file.diff.join('\n')}`)
			.join('\n\n');
	}

	async getApi() {
		if (!this.api) {
			for (const api of this.apiList) {
				try {
					const resp = await fetch(api.url, {method: 'HEAD', timeout: 1000});
					if (resp.status >= 200) {
						this.api = api;
						return api;
					}
				} catch {}
			}
		}

		return this.api;
	}

	async fetchPrompt(prompt, context) {
		try {
			const api = await this.getApi();
			if (api.url.includes('completions')) {
				return await this.callCompletionsApi(api, prompt, context);
			}

			return await this.callGenerateApi(api, prompt, context);
		} catch (e) {
			this.logger.error(`Failed to generate LLM response:`, e);
			return '';
		}
	}
	
	async callGenerateApi(api, prompt, context) {
		const req = await fetch(api.url, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				model: api.model,
				stream: false,
				prompt,
				context,
			}),
		});
		const data = await req.json();
		return data.response || '';
	}

	async callCompletionsApi(api, prompt, context) {
		const messages = [];
		
		if (context) {
			messages.push({ role: 'system', content: context });
		}

		messages.push({ role: 'user', content: prompt });

		const req = await fetch(api.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${api.key}`,
			},
			body: JSON.stringify({
				model: api.model,
				messages: messages,
				temperature: 0.1,
				stream: false,
				timeout: this.init.timeout,
			}),
		});

		if (!req.ok) {
			let errorBody = '';
			try {
				errorBody = await req.text();
			} catch (e) { /* ignore */ }

			throw new Error(`LLM completions request failed with status ${req.status}: ${errorBody}`);
		}

		const data = await req.json();
		
		if (data.choices && data.choices.length > 0 && data.choices[0].message) {
			return data.choices[0].message.content || '';
		} else {
			this.logger.warn(style.yellow('LLM completions response structure unexpected:'), data);
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
				acc.unshift({tokens: 0, diff: '', languages: []});
			}

			acc[0].tokens += file.tokens;
			acc[0].diff += `File: ${file.filename}\n${file.diff.hunks.flatMap(h => h.changes).join('\n')}\n\n`;
			
			if (!acc[0].languages.includes(file.programmingLanguage)) {
				acc[0].languages.push(file.programmingLanguage);
			}

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
