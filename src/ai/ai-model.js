import { unguardOrThrow } from "../utils/unguard.js";
import { removeThink } from "../utils/think.js";

/**
 * AI Model (LLM) init params
 * @typedef {Object} AiModelInit
 * @property {string} model  - Model identifier/name
 * @property {string} url - API endpoint URL
 * @property {string} [key] - Optional API authentication key
 */

/**
 * AI Model (LLM)
 * @class AiModel
 */
export class AiModel {
	/**
	 * Default AI Model
	 * @name AiModel.getDefault
	 * @returns {AiModel}
	 */
	static getDefault() {
		return new AiModel({
			model: 'llama3.1:8b',
			url: 'http://127.0.0.1:11434/api/generate',
		});
	}

	/**
	 * AiModel Constructor
	 * @name AiModel#constructor
	 * @param {AiModelInit} init - Configuration object
	 */
	constructor(init) {
		this.#init = {
			...this.#init,
			...init,
		};
	}

	/**
	 * Configuration object
	 * @name AiModel#init
	 * @type {AiModelInit}
	 */
	#init = {};

	/**
	 * Ping promise resolve
	 * @name AiModel#pingPromise
	 * @type {Promise<[boolean, null] | [null, Error]>}
	 */
	#pingPromise;

	/**
	 * Model identifier/name
	 * @name AiModel#name
	 * @returns {string}
	 */
	get name() {
		return this.#init.model;
	}

	/**
	 * API endpoint URL
	 * @name AiModel#url
	 * @returns {string}
	 */
	get url() {
		return this.#init.url;
	}

	/**
	 * API authentication key
	 * @name AiModel#key
	 * @returns {string}
	 */
	get key() {
		return this.#init.key;
	}

	/**
	 * @contract AiModel#ping
	 *
	 * @purpose Проверить работоспособность и доступность AI модели через однократный,
	 * кешируемый успешный тестовый запрос `Say one token "OK"`.
	 *
	 * @description Метод гарантирует, что проверка сетевой доступности и базовой логики
	 * модели будет выполнена только при первом вызове. Все последующие вызовы
	 * для того же экземпляра мгновенно возвращают закешированный результат,
	 * избегая лишних сетевых запросов.
	 *
	 * @input
	 *   PARAMS: `timeout` (number, optional, default: 10000ms) - Максимальное время
	 *           ожидания ответа при первоначальной проверке.
	 *
	 * @output
	 *   DATA: Promise, разрешаемый в кортеж (tuple) `[result, error]`.
	 *         - `[true, null]`: Успех. Модель доступна и прошла валидацию.
	 *         - `[false, null]`: Ответ получен, но валидация не пройдена.
	 *         - `[null, Error]`: Неудача. Произошла сетевая ошибка или таймаут.
	 *   EFFECTS:
	 *     - Внутреннее состояние: Метод является идемпотентным по результату,
	 *       но не по операции. Он изменяет внутреннее состояние объекта при первом
	 *       вызове для сохранения результата успешной проверки.
	 *     - Логирование: В случае неудачи (ошибки), информация о ней
	 *       записывается в `console.error`.
	 *
	 * @conditions
	 *   PRE: Экземпляр `AiModel` корректно инстанциирован.
	 *   POST: После первого успешного вызова, результат последующих вызовов `ping`
	 *         для этого экземпляра будет идентичен первому и возвращаться мгновенно.
	 *   INVARIANTS: Метод никогда не выбрасывает (throws) исключение.
	 *
	 * @keywords health-check, ping, probe, status, availability, cache, idempotent
	 */
	async ping(timeout = 10e3) {
		this.#pingPromise ||= (async () => {
			try {
				const startTime = performance.now()
				const answer = await unguardOrThrow(this.generate(
					'/no_think Answer only one token "OK" /no_think',
					{timeout},
				));
				const checked = `${answer}`.toUpperCase().trim() === 'OK';

				console.debug(`[AiModel#ping] [${this.name}] validation`, {
					answer,
					checked,
					time: performance.now() - startTime,
				});

				return [checked, null];
			} catch (cause) {
				const error = new Error(`[AiModel#ping] [${this.name}] Ping failed`, {cause});
				console.error(error);
				this.#pingPromise = null;
				return [null, error];
			}
		})();

		return this.#pingPromise;
	}

	/**
	 * Generate LLM response
	 * @name AiModel#generate
	 * @param {string} prompt - Prompt text
	 * @param {Object} [init] - Optional configuration object
	 * @property {string} [init.system] - Optional system prompt
	 * @property {string} [init.temperature] - Optional temperature generation
	 * @property {string} [init.timeout] - Optional request timeout
	 * @property {object} [init.replacements] - Optional replacements object
	 * @returns {Promise<[string, null] | [null, Error]>} Generated LLM response
	 */
	async generate(prompt, init = {}) {
		try {
			const substitute = (text) => {
				if (!init.replacements) {
					return text;
				}

				return text.replace(/__([A-Z_]+)__/g, (orig, key) => {
					const value = init.replacements[key] ??
						init.replacements[key.toLowerCase()] ??
						init.replacements[key.toUpperCase()] ??
						null;

					return value == null ? orig : value;
				});
			};

			// Prepare fetch params
			const params = this.url.includes('completions')
				? {
					temperature: init.temperature ?? 0.2,
					messages: [].concat(
						!init.system ? [] : {
							role: 'system',
							content: substitute(init.system),
						},
						{
							role: 'user',
							content: substitute(prompt),
						},
					),
				}
				: {
					system: substitute(init.system),
					prompt: substitute(prompt),
					temperature: init.temperature,
				}
			;

			// Call LLM API with params
			const data = await unguardOrThrow(this.#fetchAsJson(params, init.timeout));

			// Generate API Response
			if (data && 'response' in data) {
				return [removeThink(data.response) || '', null];
			}

			// Completions API Response
			if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
				return [removeThink(data.choices[0].message.content), null];
			}

			throw new TypeError(
				`[AI_MODEL_ERROR_GENERATE_DATA] [${this.name}] Response structure unexpected`,
				{cause: data},
			);
		} catch (cause) {
			return [null, new Error(
				`[AI_MODEL_ERROR_GENERATE] [${this.name}] ${cause}`,
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
					...this.#init.extra,
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
			return [null, new Error(`[AI_MODEL_ERROR_FETCH] [${this.name}] Fetch failed "${cause}"`, {cause})];
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
