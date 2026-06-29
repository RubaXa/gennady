// @file: index
// @consumers: commit-gen, create-providers, review-gen
// @tasks: N/A

import { parseArgs } from '../../../shared/common/parse-args.ts';
import { main } from './vcs-reply.cmd.ts';

const args = parseArgs(process.argv, {
  project: ['project'],
  iid: ['iid'],
  'dry-run': ['dry-run', 'dry'],
  'vcs-host': ['vcs-host', 'vcs-source'],
});

const run = await main({
  project: args.project as string,
  iid: args.iid as string,
  dryRun: !!args['dry-run'],
  host: (args['vcs-host'] as string) || undefined,
});

process.exit(run.code);
