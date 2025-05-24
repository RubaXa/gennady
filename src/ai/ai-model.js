import { unguardOrThrow } from "../utils/unguard.js";

/**
 * AI Model (LLM) init params
 * @SUPER_TOKEN AI_MODEL_INIT
 * @typedef {Object} AiModelInit
 * @property {string} model  - Model identifier/name
 * @property {string} url - API endpoint URL
 * @property {string} [key] - Optional API authentication key
 */

/**
 * AI Model (LLM)
 * @SUPER_TOKEN AI_MODEL_CLASS
 */
export class AiModel {
	/**
	 * Default AI Model
	 * @anchor AI_MODEL_DEFAULT
	 * @returns {AiModel} #AI_MODEL_CLASS
	 */
	static getDefault() {
		return new AiModel({
			model: 'llama3:8b',
			url: 'http://127.0.0.1:11434/api/generate',
		});
	}

	/**
	 * Constructor
	 * @anchor AI_MODEL_CONSTRUCTOR
	 * @param {AiModelInit} init - Configuration object (#AI_MODEL_INIT)
	 */
	constructor(init) {
		this.#init = {
			...this.#init,
			...init,
		};
	}

	/**
	 * Configuration object
	 * @type {AiModelInit} #AI_MODEL_INIT
	 */
	#init = {};

	/**
	 * Model identifier/name
	 * @anchor AI_MODEL_MODEL_NAME
	 * @returns {string}
	 */
	get name() {
		return this.#init.model;
	}

	/**
	 * API endpoint URL
	 * @anchor AI_MODEL_URL
	 * @returns {string}
	 */
	get url() {
		return this.#init.url;
	}

	/**
	 * API authentication key
	 * @anchor AI_MODEL_KEY
	 * @returns {string}
	 */
	get key() {
		return this.#init.key;
	}

	/**
	 * Ping AI Model
	 * @anchor AI_MODEL_PING
	 * @param {number} [timeout] - Optional ping request timeout
	 * @returns {Promise<[boolean, null] | [null, Error]>} True if ping successful
	 */
	async ping(timeout = 5e3) {
		try {
			const answer = await unguardOrThrow(this.generate('Say one token "OK"', {timeout}));
			return [`${answer}`.toUpperCase() === 'OK', null];
		} catch (cause) {
			return [null, new Error(`[AI_MODEL_ERROR_PING] [${this.name}] Ping failed`, {cause})];
		}
	}

	/**
	 * Generate LLM response
	 * @anchor AI_MODEL_GENERATE
	 * @param {string} prompt - Prompt text
	 * @param {Object} [init] - Optional configuration object
	 * @property {string} [init.context] - Optional context text
	 * @property {string} [init.temperature] - Optional temperature generation
	 * @property {string} [init.timeout] - Optional request timeout
	 * @returns {Promise<[string, null] | [null, Error]>} Generated LLM response
	 */
	async generate(prompt, init = {}) {
		try {
			// Prepare fetch params
			const params = this.url.includes('completions')
				? {
					temperature: init.temperature ?? 0.2,
					messages: [].concat(
						init.context ? { role: 'system', content: init.context } : [],
						{ role: 'user', content: prompt },
					),
				}
				: {
					context: init.context,
					prompt,
				}
			;

			// Call LLM API with params
			const data = await unguardOrThrow(this.#fetchAsJson(params, init.timeout));

			// Generate API Response
			if (data && 'response' in data) {
				return [data.response || '', null];
			}

			// Completions API Response
			if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
				return [data.choices[0].message.content || '', null];
			}

			throw new TypeError(
				`[AI_MODEL_ERROR_GENERATE_DATA] [${this.name}] Response structure unexpected`,
				{cause: data},
			);
		} catch (cause) {
			return [null, new Error(
				`[AI_MODEL_ERROR_GENERATE] [${this.name}] Generate failed`,
				{cause},
			)];
		}
	}

	/**
	 * Fetch data from LLM API
	 * @anchor AI_MODEL_FETCH_AS_JSON
	 * @param {Object} params - Request parameters
	 * @param {number} [timeout] - Optional request timeout
	 * @returns {Promise<[unknown, null] | [null, Error]>} API response
	 */
	async #fetchAsJson(params, timeout = 120e3) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(new Error('AI_MODEL_ERROR_FETCH_TIMEOUT')), timeout);

		try {
			const req = await fetch(this.url, {
				signal: controller.signal,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': this.key ? `Bearer ${this.key}` : undefined,
				},
				body: JSON.stringify({
					...params,
					model: this.name,
					stream: false,
				}),
			});

			if (!req.ok) {
				let errorBody = '';
				try {
					errorBody = await req.text();
				} catch (_) { /* ignore */ }
				
				return [null, new Error(
					`[AI_MODEL_ERROR_FETCH_NOT_OK] [${this.name}] Fetch failed with status "${req.status}"`,
					{cause: errorBody},
				)];
			}

			return [await req.json(), null];
		} catch (cause) {
			return [null, new Error(`[AI_MODEL_ERROR_FETCH] [${this.name}] Fetch failed`, {cause})];
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
