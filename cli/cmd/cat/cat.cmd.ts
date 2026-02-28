#!/usr/bin/env node

import { catGen } from '../../utils/cat-gen/cat-gen.ts';
import { style } from '../../../shared/common/style.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';

const args = parseArgs(process.argv, {
  plain: ['plain'],
  exclude: ['exclude', 'e'],
  extensions: ['ext'],
  output: ['o'],
});

const renderMarkdown = (files: { relativePath: string; contents: string }[]): void => {
  console.log(style.blue('## CODEBASE:'));

  files.forEach(({ relativePath, contents }) => {
    console.log(style.blue(`### SOURCE: ${relativePath}`));
    console.log(style.gray('```' + (relativePath.split('.').pop() ?? '')));
    console.log(contents);
    console.log(style.gray('```'));
    console.log('');
  });
};

const renderXml = (files: { relativePath: string; contents: string }[]): void => {
  console.log(style.blue('<Codebase>'));

  files.forEach(({ relativePath, contents }) => {
    const attrs = [
      `${style.yellow('type')}=${style.green('"file"')}`,
      `${style.yellow('path')}=${style.green(`"${relativePath}"`)}`,
    ].join(' ');

    console.log(`  ${style.blue('<Source')} ${attrs}${style.blue('>')}`);
    console.log(contents);
    console.log(`  ${style.blue('</Source>')}`);
  });

  console.log(style.blue('</Codebase>'));
  console.log('');
};

if (args._.length === 0) {
  console.error(style.yellow('Usage: npx gennady cat <path/to/glob>'));
  process.exit(1);
}

const files = catGen(args._ as string[], args as { exclude?: string | string[]; output?: string });

if (args.output === 'md') {
  renderMarkdown(files);
} else {
  renderXml(files);
}

if (!args.plain) {
  console.log(style.green('^'.repeat(40)));
  console.log(
    style.italic.gray(`Hint: npx gennady cat ${process.argv.slice(3).join(' ')} --plain | pbcopy`)
  );
}

console.log('');
