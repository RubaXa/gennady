#!/usr/bin/env node

import path from 'path';
import { catGen } from '../../src/cat-gen/cat-gen.js';
import { style } from '../../src/utils/style.js';

//
// 🐱 CAT-GEN
//
const INPUT_PATHS = process.argv.slice(3);

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
console.log(style.italic.gray(`Hint: To copy all output to clipboard, run:`));
console.log(style.italic.gray(`npx gennady cat ${process.argv.slice(3).join(' ')} | pbcopy`));
console.log('');