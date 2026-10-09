// @file: Real declaration normalizer preserves non-module literals and is idempotent.
// @spec: INFRA-BASE
// @consumers: build:types regression suite

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';
import { cleanTestChildEnv } from '../../cli/__tests__/tool-behavior/run-cli.ts';

const ROOT = resolve(import.meta.dirname, '../..');

it('normalizes from/export/import-type/require and current aliases only, then stays byte-idempotent', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'gennady-dts-imports-'));
  try {
    const directory = join(fixture, 'dist/nested');
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'consumer.d.ts');
    const original = [
      "import type { A } from './a.ts';",
      "export type { B } from './b.ts';",
      "type C = import('./c.ts').C;",
      "import legacy = require('./legacy.ts');",
      "type Log = import('#logger').SimpleLogger;",
      "export type { D } from '#utils/example.ts';",
      "type Literal = './literal.ts' | '#logger';",
      "// import('./comment.ts') and from '#utils/comment.ts' are prose.",
      String.raw`import type { E } from '\u0079aml';`,
      String.raw`import type { F } from './back\\slash.ts';`,
      '',
    ].join('\n');
    writeFileSync(file, original);
    const run = (): void => {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
          join(ROOT, 'scripts/normalize-dts-imports.ts'),
        ],
        {
          cwd: fixture,
          encoding: 'utf8',
          timeout: 10_000,
          env: { ...cleanTestChildEnv(process.env), NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' },
        }
      );
      assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    };
    run();
    const expected = original
      .replace("'./a.ts'", '"./a.js"')
      .replace("'./b.ts'", '"./b.js"')
      .replace("'./c.ts'", '"./c.js"')
      .replace("'./legacy.ts'", '"./legacy.js"')
      .replace("import('#logger')", 'import("./../services/logger/logger.js")')
      .replace("from '#utils/example.ts'", 'from "./../utils/example.js"')
      .replace(String.raw`'./back\\slash.ts'`, JSON.stringify('./back\\slash.js'));
    assert.equal(readFileSync(file, 'utf8'), expected);
    run();
    assert.equal(readFileSync(file, 'utf8'), expected);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
