import { unguardOrThrow } from "../utils/unguard.js";
import { AiModel } from "./ai-model.js";

/** AI Agent */
export class AiAgent {
	/**
	 * AI Agent Brain
	 * @anchor AiAgent_brain
	 * @type {AiModel}
	 */
	#brain;

	/**
	 * @anchor AiAgent_constructor
	 * @param {AiModel} brain - AI Agent Brain
	 */
	constructor(brain) {
		if (!(brain instanceof AiModel)) {
			throw new Error('[AiAgent_constructor_Invalid_Brain] `brain` must be instanceof AiModel');
		}

		this.#brain = brain;
	}

	/**
	 * Get JSON response
	 * @anchor AiAgent_getJson
	 * @param {string} prompt - not empty string
	 * @returns {Promise<[object, null] | [null, Error]>}
	 */
	async getJson(prompt) {
		try {
			if (typeof prompt !== 'string' || prompt.trim() === '') {
				throw new Error('[AiAgent_getJson_Invalid_Prompt] `prompt` must not be empty string');
			}

			// Generate Response
			const result = await unguardOrThrow(this.#brain.generate(prompt));

			// Clean result
			const maybeJson = result.trim().replace(/```([a-z]+\n)?/g, '').trim();

			// Try parse result as JSON
			return [JSON.parse(maybeJson), null];
		} catch (cause) {
			return [null, new Error('[AiAgent_getJson_Error] Failed to get JSON', {cause})];
		}
	}
}
