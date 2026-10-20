// @file: CLI entry point — boots the peer command via dynamic import from gennady.ts.
// @consumers: gennady.ts
// @tasks: N/A

import { run } from './peer.cmd.ts';

await run(process.argv.slice(3));
