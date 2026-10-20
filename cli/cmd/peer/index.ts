// @file: CLI entry point — boots the peer command via dynamic import from gennady.ts.
// @spec: PEER
// @consumers: gennady.ts

import { run } from './peer.cmd.ts';

await run(process.argv.slice(3));
