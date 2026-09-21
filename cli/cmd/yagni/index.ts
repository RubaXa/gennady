// @file: Executable entry point for gennady yagni — keeps process effects out of the importable command module.
// @spec: CLI-YAGNI
// @consumers: gennady.ts

import { run } from './yagni.cmd.ts';

const result = await run(process.argv);
console.log(result.text);
process.exit(result.exitCode);
