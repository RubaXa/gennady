import { describe, test } from 'node:test';
import assert from 'node:assert';
import { AiModel } from './ai-model.js';
import { prompts } from '../prompts/index.js';

const llama3 = new AiModel({
	"url": "https://api.copilot.vk.team/chat/completions",
	"model": "llama3"
});

const deepseekLite = new AiModel({
	"url": "https://api.copilot.vk.team/chat/completions",
	"model": "deepseek-v2-lite"
});

describe('AiAgent', () => {
	test('keywords', async () => {
		const result = await deepseekLite.generate(
			`Как настроить риск в проекте?`,
			{system: prompts.agent('keywords')},
		);

		assert.equal(result, 'x');
	})
})
