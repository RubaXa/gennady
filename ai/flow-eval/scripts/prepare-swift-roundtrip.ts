// @file: CLI wrapper for deterministic E-18 Swift config prep in an isolated cloud-ios copy.
// @consumers: roundtrip-eval.sh
// @tasks: E-18

import { resolve } from 'node:path';
import { prepareSwiftRoundtripFixture } from '../swift-fixture-prep.ts';

const root = process.argv[2];
if (!root) {
  process.stderr.write('usage: prepare-swift-roundtrip.ts <isolated-cloud-ios-root>\n');
  process.exitCode = 2;
} else {
  try {
    const result = prepareSwiftRoundtripFixture(resolve(root));
    process.stdout.write(
      `swift fixture config: ${result.changed ? 'prepared' : 'already deterministic'} (${result.path})\n`
    );
  } catch (cause) {
    process.stderr.write(
      `swift fixture config preparation failed: ${cause instanceof Error ? cause.message : String(cause)}\n`
    );
    process.exitCode = 1;
  }
}
