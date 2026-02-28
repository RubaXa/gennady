#!/usr/bin/env node

import { style } from '../../../shared/common/style.ts';
import { AiLegacyModel } from '../../utils/ai-legacy/ai-legacy-model.ts';
import { prompts } from '../../utils/prompts/index.ts';
import { unguardOrThrow } from '../../../shared/common/unguard.ts';

const agent = AiLegacyModel.getDefault();

console.info('🤖', style.whiteBright.bold('GENNADY'), `(${style.cyan(agent.name)})`);
console.info(style.gray('-'.repeat(40)));
console.info(style.yellow(agent.url));
console.info(style.gray('-'.repeat(40)));

const result = await unguardOrThrow(
  agent.generate(`Как настроить риск в проекте?`, {
    system: prompts.agent('keywords'),
  })
);

console.log(result);
