#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CommitGen } from '../../src/commit-gen/commit-gen.js';
import { parseArgs } from '../../src/utils/parse-args.js';
import { style } from '../../src/utils/style.js';

//
// 🤖 COMMIT-GEN 💬
//

const CACHE_PATH = path.join(os.homedir(), '.gennady_commit_cache.json');
const PROJECT_KEY = process.cwd();
const COMMIT_CACHE = readCache();

const params = parseArgs(process.argv, {
	apply: ['apply'],
	mode: ['mode', 'm'],
	oneline: ['short', 'one', 'o'],
	model: ['model'],
	targetBranch: ['branch', 'b'],
	apiUrl: ['api', 'apiUrl'],
	task: ['task', 't'],
});

const commitGen = new CommitGen(params);

console.info(
	'🤖',
	style.whiteBright.bold('GENNADY'),
	`(${style.cyan(commitGen.model)} → ${style.yellow(commitGen.mode)})`,
	'🗯️',
);

console.info(style.gray('-'.repeat(40)));
console.info(`- url: ${style.blue(commitGen.apiUrl)}`);
console.info(style.gray('-'.repeat(40)));

const commitMessage = params.apply && COMMIT_CACHE[PROJECT_KEY] || await commitGen.generate();
if (!commitMessage) {
	process.exit(0);
}

if (params.apply) {
	// APPLY COMMIT
	execSync(
		`git commit -am "${commitMessage.replace(/(["`])/g, '\\$1')}"`,
		{stdio: 'inherit'},
	);
	saveCache({ [PROJECT_KEY]: undefined });
} else {
	// GENERATE COMMIT
	console.info('-'.repeat(40), '\n');
	console.info(style.whiteBright(commitMessage), '\n');
	console.info('^'.repeat(40), '\n');

	console.log(style.italic.gray(`Hint: npx gennady ${process.argv.slice(3).join(' ')} --apply`));
	console.log('');

	saveCache({ [PROJECT_KEY]: commitMessage });
}

function readCache() {
	try {
		return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
	} catch {
		return {};
	}
}

function saveCache(patch) {
	const next = { ...COMMIT_CACHE, ...patch };
	fs.writeFileSync(CACHE_PATH, JSON.stringify(next, null, 2));
}