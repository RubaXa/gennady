#!/usr/bin/env node
// @file: CLI command cat — collects files (local and remote via --url) into XML/MD output.
// @consumers: gennady.ts
// @tasks: TSK-31

import { catGen } from '../../utils/cat-gen/cat-gen.ts';
import { resolveCatUrl } from './cat-url.fn.ts';
import { style } from '../../../shared/common/style.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';

const args = parseArgs(process.argv, {
  plain: ['plain'],
  exclude: ['exclude', 'e'],
  extensions: ['ext'],
  output: ['o'],
  url: ['url'],
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

const url = args.url as string | undefined;

// parseArgs does internal .slice(2); args._ includes command name + script path when invoked via tsx
// Filter: keep only args that look like actual file paths (not scripts, not command name)
const paths = (args._ as string[]).filter((a) => {
  if (a === 'cat') return false;
  if (a.endsWith('.ts') || a.endsWith('.js') || a.endsWith('.mjs')) return false;
  if (a.startsWith('/') || a.startsWith('./') || a.startsWith('../')) return false;
  return true;
});

if (paths.length === 0 && !url) {
  console.error(style.yellow('Usage: npx gennady cat <path/to/glob> [--url=<MR/PR URL>]'));
  process.exit(1);
}

if (url && paths.length > 0) {
  console.error(style.red('Error: --url and positional arguments are mutually exclusive.'));
  process.exit(1);
}

if (url) {
  const extRaw = args.extensions as string | string[] | undefined;
  const extensions = extRaw
    ? Array.isArray(extRaw)
      ? extRaw
      : extRaw.split(',').map((s: string) => s.trim())
    : undefined;

  const result = await resolveCatUrl(url, {
    exclude: args.exclude as string | string[] | undefined,
    extensions,
  });

  if (!result.ok) {
    console.error(style.red(result.error));
    process.exit(1);
  }

  if (args.output === 'md') {
    renderMarkdown(result.files);
  } else {
    renderXml(result.files);
  }
} else {
  const files = catGen(paths as string[], args as { exclude?: string | string[]; output?: string });

  if (args.output === 'md') {
    renderMarkdown(files);
  } else {
    renderXml(files);
  }
}

if (!args.plain) {
  console.log(style.green('^'.repeat(40)));
  const cmd = url
    ? `npx gennady cat --url="${url}" --plain | pbcopy`
    : `npx gennady cat ${process.argv.slice(3).join(' ')} --plain | pbcopy`;
  console.log(style.italic.gray(`Hint: ${cmd}`));
}

console.log('');
