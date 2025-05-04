#!/usr/bin/env node

import path from 'path';
import { catGen } from '../../src/cat-gen/cat-gen.js';
import { style } from '../../src/utils/style.js';
import { parseArgs } from '../../src/utils/parse-args.js';

//
// 🐱 CAT-GEN
//
const args = parseArgs(process.argv);

if (args._.length === 0) {
	console.error(style.yellow('Usage: npx gennady cat <path1> <path2> ...'));
	process.exit(1);
}

catGen(args._).forEach(({ relativePath, content }) => {
	console.log(style.blue(`#### ${relativePath}`));
	console.log(content);
	console.log('');
});

console.log(style.green(`^`.repeat(40)));
console.log(style.italic.gray(`Hint: npx gennady cat ${process.argv.slice(3).join(' ')} --plain | pbcopy`));
console.log('');