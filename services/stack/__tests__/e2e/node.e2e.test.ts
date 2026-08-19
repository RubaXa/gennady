// @file: node stack e2e suite — fixture declarations under fixtures/node/.
// @consumers: CI
// @tasks: TSK-95

import path from 'node:path';
import { declareStackSuite } from './suite.ts';

declareStackSuite('node', path.join(import.meta.dirname, 'fixtures', 'node'));
