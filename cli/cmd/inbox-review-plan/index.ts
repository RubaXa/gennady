// @file: CLI entry point — boots the inbox-review-plan command via dynamic import from gennady.ts.
// @consumers: gennady.ts
// @tasks: TSK-102

import { run } from './inbox-review-plan.cmd.ts';

process.exit(await run());
