import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CommitGen } from '../src/commit-gen/commit-gen.js';
import { parseArgs } from '../src/utils/parse-args.js';
import { style } from '../src/utils/style.js';

const PROMPTS_DIR = join(
	typeof __dirname !== 'string' ? dirname(fileURLToPath(import.meta.url)) : __dirname,
	'../src/prompts',
);

const params = parseArgs(process.argv, {
	mode: ['mode', 'm'],
	reviewerModel: ['model'],
	targetBranch: ['branch', 'b'],
});

const commit = new CommitGen({
	...params,
	onelinePromptTemplate: readFileSync(join(PROMPTS_DIR, 'oneline-prompt.md')).toString(),
	detailedPromptTemplate: readFileSync(join(PROMPTS_DIR, 'detailed-prompt.md')).toString(),
	composerPromptTemplate: readFileSync(join(PROMPTS_DIR, 'composer-prompt.md')).toString(),
});

console.info(`🤖`, style.whiteBright.bold(`GENNADY`), `(${style.cyan(commit.reviewerModel)} → ${style.yellow(commit.mode)})`, `🗯️`);
console.info(style.gray(`-`.repeat(30)));

const msg = await commit.generate();

console.info(`-`.repeat(40), '\n');
console.info(style.whiteBright(msg), '\n');
console.info(`^`.repeat(40), '\n');