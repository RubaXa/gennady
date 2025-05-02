import { AiCore } from "../ai/ai-core.js";
import { prompts } from "../prompts/index.js";
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const LANG_SPECS_DIR = join(
	typeof __dirname !== 'string' ? dirname(fileURLToPath(import.meta.url)) : __dirname,
	'specs',
);

export class ReviewGen {
	_langSpecs = {};

	constructor(init) {
		this.init = {
			basePromptTemplate: prompts.review('base'),
			timeout: 120,

			...init,
		};

		this.ai = new AiCore({
			logger: this.logger,
			timeout: this.init.timeout,
			url: 'https://api.copilot.vk.team/chat/completions',
			model: 'deepseek-v2-lite',
		});
	}

	async generate(diff) {
		const lang = diff.includes('.ts') ? 'TypeScript' : 'JavaScript';
		const input = this.init.basePromptTemplate
			.replaceAll('{LANG}', lang)
			.replaceAll('\n{EXTRA_RULES}\n', this._getExtraRulesPrompt(lang, diff))
			.replaceAll('{GIT_DIFF}', diff);
		const output = this.ai.generate(input);
		// console.debug(`<input>${input}</input>`);
		// console.info(`<output>${output}</output>`);
		return output;
	}

	_getExtraRulesPrompt(lang, diff) {
		const spec = this._loadLangSpec(lang);

		const globals = Object.keys(spec.Global.properties);
		const rGlobals = new RegExp(`\\b(${globals.join('|')})\\b`, 'g');
		const exists = {};
		let prompt = '';
		let matches = null

		while (matches = rGlobals.exec(diff)) {
			const name = matches[0];
			const {exceptions, type} = spec.Global.properties[name];

			if (!exists[name]) {
				exists[name] = true;
				
				if (exceptions?.length) {
					prompt += `## ${name} handling:\n`
					exceptions.forEach(({type, description}) => {
						prompt += `- ${type}: ${description}\n`;
					});
				}
			}

			Object.entries(spec[type]?.methods || {}).forEach(([method, {exceptions, hint}]) => {
				if (exceptions.length && diff.includes(method)) {
					const key = `${name}.${method}`;
					if (!exists[key] && exceptions.length && hint) {
						exists[key] = true;
						
						prompt += `## **${key}** handling:\n`;
						prompt += hint.join('\n');
						
						// exceptions.forEach(({type, description}) => {
						// 	prompt += `- ${type}: ${description}\n`;
						// });
					}
					
				}
			});
		}

		return prompt ? `\n${prompt}\n` : '';
	}

	_loadLangSpec(lang) {
		const specName = lang === 'JavaScript' || lang === 'TypeScript' ? 'js' : lang;
		const specPath = join(LANG_SPECS_DIR, specName);

		this._langSpecs[specName] = {};
		
		for (const entry of readdirSync(specPath)) {
			if (!entry.endsWith('.json')) {
				continue;
			}

			const rawJson = readFileSync(join(specPath, entry)).toString();
			const json = JSON.parse(rawJson);

			Object.assign(this._langSpecs[specName], json);
		}

		return this._langSpecs[specName];
	}
}



