// @file: inbox-eval command entry point — imports run() and self-executes.
// @spec: AGENT-INBOX
// @consumers: gennady.ts

import { run } from './inbox-eval.cmd.ts';

process.exit(await run());
