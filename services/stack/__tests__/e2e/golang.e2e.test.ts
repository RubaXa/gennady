// @file: golang stack e2e suite — fixture declarations under fixtures/golang/.
// @consumers: CI
// @tasks: TSK-95

import path from 'node:path';
import { declareStackSuite } from './suite.ts';

declareStackSuite('golang', path.join(import.meta.dirname, 'fixtures'));
