// @file: CLI entry point — boots the inbox-review-plan command via dynamic import from gennady.ts.
// @spec: AGENT-INBOX
// @consumers: gennady.ts

import { run } from './inbox-review-plan.cmd.ts';

process.exit(await run());
