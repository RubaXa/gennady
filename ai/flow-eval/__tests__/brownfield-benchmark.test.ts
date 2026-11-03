// @file: Causal fixture controls for the finite brownfield campaign; no model or project-wide gates.
// @spec: AI-SKILLS
// @consumers: BF3 installed-package qualification

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import {
  EXTRA,
  SOURCE,
  TASK,
  TEST,
  e2source,
  files,
  registry,
  minimalCommentLanguageDiff,
} from '../brownfield-benchmark.ts';

/** @purpose Run only protected fixture tests with a host-supplied source value; no model or installed CLI. */
function oracleWithValue(value: number): number | null {
  const root = mkdtempSync(join(tmpdir(), 'brownfield-oracle-'));
  try {
    for (const [path, content] of Object.entries(files('E4'))) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    writeFileSync(join(root, SOURCE('E4')), `// @spec: BF\nmodule.exports = ${value};\n`);
    writeFileSync(join(root, EXTRA), '// @spec: BF\nmodule.exports = 9;\n');
    const result = spawnSync(process.execPath, ['--test', TEST], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: dirname(process.execPath), NO_COLOR: '1' },
    });
    assert.ifError(result.error);
    return result.status;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('fixed functional oracle accepts the reference and rejects the wrong provider', () => {
  assert.equal(oracleWithValue(7), 0);
  assert.notEqual(oracleWithValue(8), 0);
});

test('literal route and future phase are exact declarations, not a flattened path or completed input', () => {
  const fixture = files('E4');
  assert.ok(SOURCE('E4').includes('[...slug]'));
  assert.ok(Object.hasOwn(fixture, SOURCE('E4')));
  assert.equal(Object.hasOwn(fixture, EXTRA), false, 'future output must be produced in P2');
  assert.match(fixture[TASK]!, /Target Files:\*\* `pages\/\[\.\.\.slug\]\.cts`/);
  assert.match(fixture[TASK]!, /<!--SECTION:PHASE_P2-->/);
  assert.doesNotMatch(fixture[TASK]!, /SDD_VERIFY_EVIDENCE|SDD_AUDIT_RECEIPT|SDD_REVIEW_RECEIPT/);
});

test('policy fixture preserves an existing unowned project background and asks before policy mutation', () => {
  const fixture = files('E2', ['src/existing.js', 'pages/[section].tsx']);
  assert.equal(fixture['bf-work/value.ts'], e2source);
  assert.match(
    fixture['inputs/brief.md']!,
    /do not edit config before a separate host operator reply/i
  );
  assert.equal(fixture['gennady.yaml']!.includes('commentLanguage'), false);
  assert.equal(
    Object.hasOwn(fixture, 'src/existing.js'),
    false,
    'background is exported, not replaced'
  );
  assert.equal(Object.hasOwn(fixture, 'pages/[section].tsx'), false);
});

test('proposal fixture supplies no accepted decision or reference answer and distinguishes API capability', () => {
  const fixture = files('E3');
  assert.equal(
    Object.keys(fixture).some((path) => path.startsWith('golden/')),
    false
  );
  assert.equal(
    Object.keys(fixture).some((path) => path.includes('proposal.json')),
    false
  );
  assert.doesNotMatch(fixture[registry.module]!, /\[verdict:/);
  assert.match(fixture['inputs/brief.md']!, /operator has NOT accepted/i);
  assert.match(fixture['inputs/brief.md']!, /If unsupported, do NOT probe or bypass/i);
  assert.match(fixture['inputs/brief.md']!, /leave the payload for operator review/i);
});

test('language policy oracle accepts equivalent insertion order and quotes without changing prior bytes', () => {
  const initial = '# Keep project comments.\nlint:\n  scope: owned\n';
  assert.equal(minimalCommentLanguageDiff(initial, initial + '  commentLanguage: ru\n'), true);
  assert.equal(
    minimalCommentLanguageDiff(
      initial,
      '# Keep project comments.\nlint:\n  commentLanguage: "ru"\n  scope: owned\n'
    ),
    true
  );
  assert.equal(
    minimalCommentLanguageDiff(
      initial,
      "# Keep project comments.\nlint:\n  commentLanguage: 'ru'\n  scope: owned\n"
    ),
    true
  );
  for (const actual of [
    initial,
    initial + '  commentLanguage: en\n',
    initial + '  commentLanguage: ru\n  commentLanguage: ru\n',
    initial + '  commentLanguage: ru\n  another: true\n',
    initial.replace('owned', 'all') + '  commentLanguage: ru\n',
    initial.replace('# Keep project comments.\n', '') + '  commentLanguage: ru\n',
  ])
    assert.equal(minimalCommentLanguageDiff(initial, actual), false, actual);
  // A declined or absent operator response cannot be inferred from a semantically valid diff.
  const actual = initial + '  commentLanguage: ru\n';
  for (const hostConsent of [false, true])
    assert.equal(hostConsent && minimalCommentLanguageDiff(initial, actual), hostConsent);
});
