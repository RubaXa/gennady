import { readFileSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

/**
 * Gennady RC data
 * @SUPER_TOKEN GENNADY_RC_DATA
 * @typedef {Object} GennadyRcData
 * @property {AiModelInit[]} models - AI Models configs #AI_MODEL_INIT
 */

/**
 * Gennady RC (configuration)
 * @SUPER_TOKEN GENNADY_RC_CLASS
 */
export class GennadyRc {
	/**
	 * Default Gennady RC filename
	 * @anchor GENNADY_RC_DEFAULT_FILENAME
	 * @constant {string}
	 */
	static DEFAULT_FILENAME = '.gennadyrc';

	/**
	 * Get default rc configs
	 * @anchor GENNADY_RC_GET_DEFAULTS
	 * @returns {GennadyRc[]}
	 */
	static getDefaults() {
		return [process.cwd(), process.env.HOME].map((dir) => {
			return new GennadyRc(dir);
		});
	}

	/**
	 * Config filename
	 * @anchor GENNADY_RC_FILENAME
	 * @type {string}
	 */
	#filename = '';

	/**
	 * Config data
	 * @anchor GENNADY_RC_DATA
	 * @type {GennadyRcData} #GENNADY_RC_DATA
	 */
	#data = {
		models: [],
	};

	/**
	 * Config parse error
	 * @anchor GENNADY_RC_ERROR
	 * @type {Error|null}
	 */
	#error = null;

	/**
	 * Constructor
	 * @anchor GENNADY_RC_CONSTRUCTOR
	 * @param {string} [dir] - Optional rc-config directory (default process.cwd())
	 * @param {string} [filename] - Optional rc-config filename (default #GENNADY_RC_FILENAME)
	 */
	constructor(
		dir = process.cwd(),
		name = GennadyRc.DEFAULT_FILENAME,
	) {
		this.#filename = pathJoin(dir, name);

		try {
			if (existsSync(this.#filename)) {
				const data = JSON.parse(readFileSync(this.#filename).toString());
				
				if (Array.isArray(data)) {
					// Legacy format
					this.#data.models = data;
				} else if (data && Array.isArray(data.models)) {
					this.#data = {
						...this.#data,
						...data,
					};
				} else {
					this.#error = new Error(
						`[GENNADY_RC_ERROR_CONFIG] Invalid "${this.#filename}" config data`,
						{cause: data},
					);
				}
			}
		} catch (err) {
			this.#error = new Error(
				`[GENNADY_RC_ERROR_PARSE] Read "${this.#filename}" config failed`,
				{cause: err},
			);
		}
	}

	/**
	 * Check if config is valid
	 * @anchor GENNADY_RC_METHOD_IS_VALID
	 * @returns {boolean}
	 */
	isValid() {
		return !this.#error;
	}

	/**
	 * Get AI Models config
	 * @anchor GENNADY_RC_METHOD_GET_MODELS
	 * @returns {AiModelInit[]} array of #AI_MODEL_INIT
	 */
	getModels() {
		return this.#data.models;
	}

	/**
	 * Get config parse error
	 * @anchor GENNADY_RC_GET_ERROR
	 * @returns {Error|null}
	 */
	getError() {
		return this.#error;
	}
}