import { parseArgs } from '../../../src/utils/parse-args.js';
import { main } from './vcs-reply.cmd.js';

const args = parseArgs(process.argv, {
	project: ['project'],
	iid: ['iid'],
	'dry-run': ['dry-run', 'dry'],
});

const run = await main({
	project: args.project,
	iid: args.iid,
	dryRun: !!args['dry-run'],
});

process.exit(run.code);
