import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_MODEL = 'llama3:8b';
const DEFAULT_API_URL = 'http://127.0.0.1:11434/api/generate';

const GENNADY_RC_FILENAME = '.gennadyrc';

export class AiCore {
	api = undefined;
	apiList = [];

	constructor(init) {
		this.init = {
			timeout: 120,
			logger: console,
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
			url: this.init.url || DEFAULT_API_URL,
			key: this.init.key,
			model: this.init.model || DEFAULT_MODEL,
		});
	}

	get model() {
		return this.api?.model || this.apiList[0].model;
	}

	get apiUrl() {
		return this.api?.url || this.apiList[0].url;
	}

	async getApi() {
		if (!this.api) {
			// By default
			this.api = {url: DEFAULT_API_URL, model: DEFAULT_MODEL};

			for (const api of this.apiList) {
				try {
					const resp = await fetch(api.url, {method: 'HEAD', timeout: 1000});
					if (resp.status >= 200 && resp.status < 500) {
						this.api = api;
						return api;
					}
				} catch {}
			}
		}

		return this.api;
	}

	async generate(prompt, context) {
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
}
