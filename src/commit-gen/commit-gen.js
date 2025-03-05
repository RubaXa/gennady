import { execSync as nodeExecSync } from 'node:child_process';
import { style } from '../utils/style.js';

export class CommitGen {
	constructor(init) {
		this.init = {
			mode: 'auto',
			reviewerModel: 'llama3:8b',
			targetBranch: undefined,
			onelinePromptTemplate: 'Oneline commit: {diff}',
			detailedPromptTemplate: 'Detailed commit: {diff}',
			composerPromptTemplate: 'Compose final commit message from parts: {messages}',

			maxInputTokens: init.maxInputTokens || 5000,
			ollamaUrl: init.ollamaUrl || 'http://127.0.0.1:11434/api/generate',
			logger: console,

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

	execSync(cmd) {
		try {
			return nodeExecSync(cmd, { encoding: 'utf-8'});
		} catch (e) {
			return '';
		}
	}

	getCommitCount() {
		const output = this.execSync('git rev-list --count HEAD 2>/dev/null');
		return parseInt(output, 10) || 0;
	}

	getDiff() {
		if (this.init.targetBranch) {
			return this.execSync(`git diff ${this.init.targetBranch}`);
		}

		return this.execSync('git diff --cached');
	}

	parseDiff(diffStr) {
		const lines = diffStr.split('\n');
		const files = [];
		let currentFile = null;
		
		lines.forEach((line) => {
			if (line.startsWith('diff --git')) {
				if (currentFile) files.push(currentFile);
				const parts = line.split(' ');
				const bFile = parts[3] ? parts[3].replace('b/', '') : parts[2].replace('a/', '');
				currentFile = { filename: bFile, diff: [line] };
			} else if (currentFile) {
				currentFile.diff.push(line);
			}
		});

		if (currentFile) files.push(currentFile);

		return files;
	}

	categorizeFiles(files) {
		const lockFiles = [];
		const dotFiles = [];
		const docFiles = [];
		const renamedFiles = [];
		const deletedFiles = [];
		const changedFiles = [];
		
		files.forEach((file) => {
			const isRenamed = file.diff.some(
				(line) => line.includes('rename from') || line.includes('rename to')
			);
			const isDeleted = file.diff.some((line) => line.includes('deleted file mode'));
			
			if (/\.md$/.test(file.filename)) {
				docFiles.push(file);
			} else if (/^\./.test(file.filename)) {
				dotFiles.push(file);
			} else if (/(\.lock|-lock\.json)$/.test(file.filename)) {
				lockFiles.push(file);
			} else if (isRenamed) {
				renamedFiles.push(file);
			} else if (isDeleted) {
				deletedFiles.push(file);
			} else {
				changedFiles.push(file);
			}
		});

		return { dotFiles, docFiles, lockFiles, renamedFiles, deletedFiles, changedFiles };
	}

	generateDiffText(files) {
		return files
			.map((file) => `File: ${file.filename}\n${file.diff.join('\n')}`)
			.join('\n\n');
	}

	tokenCount(text) {
		return text.split(/\s+/).length;
	}

	splitDiffByTokens(diffText, template, maxTokens) {
		const templateTokens = this.tokenCount(template.replace('{diff}', ''));
		const availableTokens = maxTokens - templateTokens;
		const words = diffText.split(/\s+/);
		const chunks = [];
		
		for (let i = 0; i < words.length; i += availableTokens) {
			chunks.push(words.slice(i, i + availableTokens).join(' '));
		}

		return chunks;
	}

	async generateFromOllama(prompt) {
		try {
			const req = await fetch(this.init.ollamaUrl, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					prompt,
					model: this.init.reviewerModel,
					stream: false,
				}),
			});
			const data = await req.json();
			return data.response || '';
		} catch (e) {
			this.logger.error(`Failed to generate ollama response:`, e);
			return '';
		}
	}

	async generateMessage(prompt) {
		const msg =  await this.generateFromOllama(prompt);
		return msg.replace(/(^[\s\S]*<message>|<\/message>[\s\S]*)/g, '').replace(/\n\s*- /, '\n\n- ')
	}

	async generate() {
		const commitCount = this.getCommitCount();
		const diffStr = this.getDiff();
		const parsedFiles = this.parseDiff(diffStr);
		const categories = this.categorizeFiles(parsedFiles);
		const mode =
			this.init.mode === 'auto'
				? this.init.targetBranch
					? 'detailed'
					: commitCount > 1 && categories.changedFiles.length < 5
					? 'oneline'
					: 'detailed'
				: this.init.mode;

		this.logger.info(`Generating commit message (mode: ${mode}, commits: ${commitCount}):`);

		Object.entries(categories).forEach(([key, value]) => {
			this.logger.info(`- ${style.bold(key)}:`, style.cyan(value.length + ''));
		});

		const diffText = this.generateDiffText(categories.changedFiles);

		// this.logger.info(`Diff:`, diffText);

		const promptTemplate = (mode === 'oneline'
			? this.init.onelinePromptTemplate
			: this.init.detailedPromptTemplate).trim();

		const fullPrompt = promptTemplate.replace('{diff}', diffText);
		const totalTokens = this.tokenCount(fullPrompt);
		let finalMessage = '';

		this.logger.info(`Total tokens: ${totalTokens}`);
		
		if (totalTokens < this.init.maxInputTokens) {
			finalMessage = await this.generateMessage(fullPrompt);
		} else {
			const diffChunks = this.splitDiffByTokens(
				diffText,
				promptTemplate,
				this.init.maxInputTokens,
			);
			const partialMessages = [];
			
			for (const chunk of diffChunks) {
				const partPrompt = promptTemplate.replace('{diff}', chunk);
				const msg = await this.generateMessage(partPrompt);

				partialMessages.push(msg);
			}
			
			const composerPrompt = this.init.composerPromptTemplate.replace(
				'{messages}',
				partialMessages.join('\n'),
			);
			
			finalMessage = await this.generateMessage(composerPrompt);
		}

		return finalMessage;
	}
}
