#!/usr/bin/env node

import { CommitGen } from '../../src/commit-gen/commit-gen.js';
import { parseArgs } from '../../src/utils/parse-args.js';
import { style } from '../../src/utils/style.js';
import { getSysLang } from '../../src/utils/language.js';

const params = parseArgs(process.argv, {
	mode: ['mode', 'm'],
	oneline: ['short', 'one', 'o'],
	model: ['model'],
	targetBranch: ['branch', 'b'],
	apiUrl: ['api', 'apiUrl'],
});

const commit = new CommitGen(params);

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