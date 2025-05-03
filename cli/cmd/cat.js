#!/usr/bin/env node
import path from 'path';
import { catGen } from '../../src/cat-gen/cat-gen.js';
import { style } from '../../src/utils/style.js';

//
// MAIN
//
const INPUT_PATH = process.argv[3] || process.argv[2];
const SCRIPT_NAME = path.basename(process.argv[1] || 'script.mjs');

if (!INPUT_PATH) {
	console.error(style.yellow(`Usage: node ${SCRIPT_NAME} <path/to/directory_or_file>`));
	process.exit(1);
}

console.log(style.green(`--- ${style.bold(INPUT_PATH)} ---`));
console.log('');

catGen(INPUT_PATH).forEach(({ relativePath, content }) => {
	console.log(`#### ${relativePath}`);
	console.log(content);
	console.log('');
});

console.log(style.green(`^`.repeat(40)));
console.log(style.italic.gray(`Hint: | sed 's/\\x1b\\[[0-9;]*m//g' | pbcopy`));