// @file: Consumer command proving data-only steps execute only through the common Verify executor.
// @spec: CLI-VERIFY
// @consumers: shared/verify/__tests__/plugin-boundary.test.ts

import fs from 'node:fs';

if (!fs.existsSync('custom-output.txt')) {
  fs.writeFileSync('custom-output.txt', 'executed by the common Verify executor\n');
}
