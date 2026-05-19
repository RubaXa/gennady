// @file: CLI entry point — boots the alt-opinion command via dynamic import from gennady.ts.
// @consumers: gennady.ts
// @tasks: TSK-24

import { run } from './alt-opinion.cmd.ts';

run(process.argv);
