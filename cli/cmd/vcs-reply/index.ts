import { parseArgs } from '../../../shared/common/parse-args.ts';
import { main } from './vcs-reply.cmd.ts';

const args = parseArgs(process.argv, {
  project: ['project'],
  iid: ['iid'],
  'dry-run': ['dry-run', 'dry'],
});

const run = await main({
  project: args.project as string,
  iid: args.iid as string,
  dryRun: !!args['dry-run'],
});

process.exit(run.code);
