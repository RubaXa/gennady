#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CommitGen } from '../src/commit-gen/commit-gen.js';
import { parseArgs } from '../src/utils/parse-args.js';
import { style } from '../src/utils/style.js';
import { getSysLang } from '../src/utils/language.js';

const PROMPTS_DIR = join(
	typeof __dirname !== 'string' ? dirname(fileURLToPath(import.meta.url)) : __dirname,
	'../src/prompts',
);

const params = parseArgs(process.argv, {
	mode: ['mode', 'm'],
	oneline: ['short', 'one', 'o'],
	model: ['model'],
	targetBranch: ['branch', 'b'],
	apiUrl: ['api', 'apiUrl'],
});

const commit = new CommitGen({
	...params,
	basePromptTemplate: readFileSync(join(PROMPTS_DIR, 'base-prompt.md')).toString(),
	formatOnelinePromptTemplate: readFileSync(join(PROMPTS_DIR, 'format-oneline-prompt.md')).toString(),
	formatDetailedPromptTemplate: readFileSync(join(PROMPTS_DIR, 'format-detailed-prompt.md')).toString(),
	translatePromptTemplate: readFileSync(join(PROMPTS_DIR, 'translate-prompt.md')).toString(),
});

console.info(`🤖`, style.whiteBright.bold(`GENNADY`), `(${style.cyan(commit.model)} → ${style.yellow(commit.mode)})`, `🗯️`);
console.info(style.gray(`-`.repeat(30)));
console.info(`- url: ${style.blue(commit.apiUrl)}`);
console.info(style.gray(`-`.repeat(30)));

const msg = await commit.generate();
if (msg) {
	console.info(`-`.repeat(40), '\n');
	console.info(style.whiteBright(msg), '\n');
	console.info(`^`.repeat(40), '\n');

	const lang = getSysLang();
	if (lang !== 'en') {
		console.info(await commit.translate(msg, lang), '\n');
		console.info(`^`.repeat(40), '\n');
	}
}