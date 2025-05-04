#!/usr/bin/env node

import path from 'path';
import { catGen } from '../../src/cat-gen/cat-gen.js';
import { style } from '../../src/utils/style.js';

//
// 🐱 CAT-GEN
//
const INPUT_PATHS = process.argv.slice(2);

if (INPUT_PATHS.length === 0) {
	console.error(style.yellow('Usage: npx gennady cat <path1> <path2> ...'));
	process.exit(1);
}

catGen(INPUT_PATHS).forEach(({ relativePath, content }) => {
	console.log(`#### ${relativePath}`);
	console.log(content);
	console.log('');
});

console.log(style.green(`^`.repeat(40)));
console.log(style.italic.gray(`Hint: | sed 's/\\x1b\\[[0-9;]*m//g' | pbcopy`));