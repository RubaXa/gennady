import { AiModel } from './ai-model.js';
import { GennadyRc } from '../rc/rc-config.js';
import { unguardOrThrow } from '../utils/unguard.js';

/** @deprecated */
export class AiCore {
	/**
	 * List of AI Models
	 * @type {AiModel[]} array of #AI_MODEL_CLASS
	 */
	#models = [];

	/**
	 * Active AI Model
	 * @type {AiModel|null}
	 */
	#activeModel = null;

	constructor(init) {
		this.init = {
			logger: console,
			timeout: 120,
			maxInputTokens: init.maxInputTokens || 4000,
			...init,
		};

		GennadyRc.getDefaults().forEach((rc) => {
			if (rc.isValid()) {
				this.#models.push(...rc.getModels().map(model => new AiModel(model)));
			}
		});

		if (!this.#models.length) {
			this.#models.push(AiModel.getDefault());
		}
	}

	get model() {
		return this.#models[0]?.name;
	}

	get apiUrl() {
		return this.#models[0]?.url
	}

	get maxInputTokens() {
		return this.init.maxInputTokens;
	}

	get logger() {
		return this.init.logger;
	}

	createPromptsBatchesByDiff(parseDiff) {
		const maxChunkTokens = parseDiff.at(-1)?.tokens || 0

		if (maxChunkTokens > this.maxInputTokens) {
			this.logger.error(`TODO: Diff is too large`);
			process.exit(1);
		}

		const batches = parseDiff.reduce((acc, file) => {
			if (!acc[0] || acc[0].tokens + file.tokens > this.maxInputTokens) {
				acc.unshift({tokens: 0, diff: '', languages: []});
			}

			const fileDiff = file.diff.hunks.flatMap(h => h.changes).join('\n');
			if (fileDiff.trim()) {
				acc[0].tokens += file.tokens;
				acc[0].diff += `### File **${file.filename}**:\n${fileDiff}\n\n`;
				
				if (!acc[0].languages.includes(file.programmingLanguage)) {
					acc[0].languages.push(file.programmingLanguage);
				}
			}

			return acc;
		}, []);

		return batches;
	}

	async generate(prompt, context) {
		try {
			const model = await unguardOrThrow(this.#choiceModel());
			const result = await unguardOrThrow(model.generate(prompt, context));
			return result;
		} catch (error) {
			this.logger.error(`[AI_CORE_ERROR_GENERATE] Failed to generate LLM response:`, error);
			return '';
		}
	}

	/**
	 * Choose active model
	 * @anchor AI_CORE_CHOICE_MODEL
	 * @returns {Promise<[AiModel, null] | [null, Error]>}
	 */
	async #choiceModel() {
		if (this.#activeModel) {
			return [this.#activeModel, null];
		}

		for (const model of this.#models) {
			const [ok, error] = await model.ping();
			if (ok) {
				this.#activeModel = model;
				return [model, null];
			} else {
				this.logger.warn(`[AI_CORE_ERROR_PING_MODEL_FAIL] [${model.name}] Ping failed:`, error);
			}
		}

		return [null, new Error(`[AI_CORE_ERROR_PING_FAIL] No available models`)];
	}
}
