#!/usr/bin/env node

import { style } from '../../../src/utils/style.js';
import { AiModel } from '../../../src/ai/ai-model.js';
import { prompts } from '../../../src/prompts/index.js';

//
// 🤖 AGENT
//
const agent = AiModel.getDefault();

console.info(
	'🤖',
	style.whiteBright.bold('GENNADY'),
	`(${style.cyan(agent.name)})`,
);
console.info(style.gray(`-`.repeat(40)));
console.info(style.yellow(agent.url));
console.info(style.gray(`-`.repeat(40)));

const result = await agent.generate(
	`Как настроить риск в проекте?`,
	{
		system: prompts.agent('keywords'),
	},
);

console.log(result);
