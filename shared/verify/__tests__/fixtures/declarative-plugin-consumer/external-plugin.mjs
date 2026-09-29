// @file: Sentinel module proving executable plugin declarations are never imported.
// @spec: CLI-VERIFY
// @consumers: shared/verify/__tests__/plugin-boundary.test.ts

import fs from 'node:fs';

fs.writeFileSync('external-plugin-imported', 'external executable plugin code ran\n');
