#!/usr/bin/env node

import { catGen } from '../../../src/cat-gen/cat-gen.js';
import { style } from '../../../src/utils/style.js';
import { parseArgs } from '../../../src/utils/parse-args.js';

//
// 🐱 CAT-GEN
//

// AI: RENDERER_MARKDOWN_START
/**
 * Renders the collected files in a Markdown-like format to the console.
 * @param {Array<Object>} files - The array of file objects from catGen.
 */
const renderMarkdown = (files) => {
	console.log(style.blue(`## CODEBASE:`));

	files.forEach(({ relativePath, contents }) => {
		console.log(style.blue(`### SOURCE: ${relativePath}`));
		console.log(style.gray('```' + (relativePath.split('.').pop() || '')));
		console.log(contents);
		console.log(style.gray('```'));
		console.log('');
	});
};
// AI: RENDERER_MARKDOWN_END

// AI: RENDERER_XML_START
/**
 * Renders the collected files in a styled XML format to the console.
 * @param {Array<Object>} files - The array of file objects from catGen.
 */
const renderXml = (files) => {
	console.log(style.blue('<Codebase>'));

	files.forEach(({ relativePath, contents }) => {
		const attrs = [
			`${style.yellow('type')}=${style.green(`"file"`)}`,
			`${style.yellow('path')}=${style.green(`"${relativePath}"`)}`
		].join(' ');

		console.log(`  ${style.blue('<Source')} ${attrs}${style.blue('>')}`);
		// Print content without extra indentation to preserve its original formatting.
		console.log(contents);
		console.log(`  ${style.blue('</Source>')}`);
	});

	console.log(style.blue('</Codebase>'));
	console.log('');
};
// AI: RENDERER_XML_END


// AI: MAIN_EXECUTION_START
const args = parseArgs(process.argv, {
	plain: ['plain'],
	exclude: ['exclude', 'e'],
	extensions: ['ext'],
	output: ['o'], // 'md' or 'xml'
});

if (args._.length === 0) {
	console.error(style.yellow('Usage: npx gennady cat <path/to/glob>'));
	process.exit(1);
}

// Single call to catGen to get all file data.
const files = catGen(args._, args);

// Conditional rendering based on the output flag.
if (args.output === 'md') {
	renderMarkdown(files, args);
} else {
	renderXml(files);
}

if (!args.plain) {
	console.log(style.green(`^`.repeat(40)));
	console.log(style.italic.gray(`Hint: npx gennady cat ${process.argv.slice(3).join(' ')} --plain | pbcopy`));
}

console.log('');
// AI: MAIN_EXECUTION_END
