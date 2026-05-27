#!/usr/bin/env node
// @file: CLI command: review
// @consumers: N/A
// @tasks: N/A

import { getGitDiffInfo } from '../../../shared/backend/git/git-core.ts';
import { ReviewGen } from '../../utils/review-gen/review-gen.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { style } from '../../../shared/common/style.ts';

const params = parseArgs(process.argv, {
  branch: ['branch', 'b'],
});

const review = new ReviewGen();

console.info(
  '🤖',
  style.whiteBright.bold('GENNADY'),
  `(${style.cyan(review.ai.model ?? '')})`,
  '📝'
);

console.info(style.gray('-'.repeat(40)));

const { parsedCodeDiff, parsedCodeTokens, programmingLanguages, parsedCodeChunkMaxTokens } =
  getGitDiffInfo(params.branch as string | undefined);

console.info(
  `- Tokens: ${style.bold.cyanBright(String(parsedCodeTokens))} ${style.gray(`(max per file: ${parsedCodeChunkMaxTokens})`)}`
);
console.info(`- Languages: ${style.yellow(programmingLanguages.join(', '))}`);

if (parsedCodeDiff.length === 0) {
  console.info('No changes detected, skipping review.');
  console.info(style.italic.gray('Hint: git add'));
  process.exit(0);
}

const batches = review.ai.createPromptsBatchesByDiff(parsedCodeDiff);

console.info(`- Queue: ${style.bold.cyan(String(batches.length))}`);
console.info(style.gray('-'.repeat(40)));

const startGenTime = performance.now();
const results = await Promise.all(
  batches.map(async (batch) => {
    console.info('- Task:', batch.tokens, batch.languages);
    return review.generate(batch.diff, batch.languages);
  })
);

console.info(style.gray('-'.repeat(40)));
console.info(
  `- Generation time: ${style.blueBright(((performance.now() - startGenTime) / 1000).toFixed(2))}s`
);
console.info(style.gray('-'.repeat(40)));

console.info(results.join('\n\n'));
