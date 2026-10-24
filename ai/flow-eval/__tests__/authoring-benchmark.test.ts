// @file: Artifact oracle controls for all ten real template-owned authoring cases.
// @spec: AI-SKILLS
// @consumers: authoring-benchmark; flow-eval integration

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { it } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  linkSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORING_CASE_IDS,
  CURRENT_AUTHORING_BENCHMARK_REVISION,
  buildAuthoringFixture,
  checkAuthoringBenchmark,
  getAuthoringCase,
  type AuthoringBenchmarkRevision,
  type AuthoringCaseId,
} from '../authoring-benchmark.ts';
import {
  REFERENCE_PORTAL,
  referenceIndex,
  referenceSpec,
} from '../authoring-benchmark-fixtures.ts';
import { checkSpecAuthoringDraft } from '../../../shared/sdd/check.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { TEMPLATES } from '../../../shared/sdd/templates.ts';

const CLI = fileURLToPath(new URL('../../../cli/gennady.ts', import.meta.url));
function put(root: string, file: string, value: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), value);
}
function positive(id: AuthoringCaseId): string {
  const item = getAuthoringCase(id);
  if (item.kind === 'portal') return REFERENCE_PORTAL;
  if (item.kind === 'module-index' || item.kind === 'scope-index' || item.kind === 'project-index')
    return referenceIndex(item.kind);
  return referenceSpec(
    item.kind as 'product' | 'library' | 'infrastructure' | 'interface' | 'module',
    item.target,
    item.kind === 'module' ? { parent: 'specs/token/token.spec.md' } : {}
  );
}
function fixture(id: AuthoringCaseId, authored = true) {
  const root = mkdtempSync(join(tmpdir(), 'sdd-authoring-benchmark-'));
  const item = getAuthoringCase(id);
  for (const [path, text] of Object.entries(buildAuthoringFixture(id))) put(root, path, text);
  if (authored) put(root, item.target, positive(id));
  return { root, item, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function expectRejected(
  id: AuthoringCaseId,
  mutate: (text: string) => string,
  check?: string,
  revision?: AuthoringBenchmarkRevision
): void {
  const env = fixture(id);
  try {
    assert.equal(
      checkAuthoringBenchmark(env.root, id, revision).pass,
      true,
      'positive before mutation'
    );
    put(env.root, env.item.target, mutate(positive(id)));
    const result = checkAuthoringBenchmark(env.root, id, revision);
    assert.equal(result.pass, false, JSON.stringify(result));
    if (check)
      assert.equal(result.checks.find((item) => item.id === check)?.pass, false, result.detail);
  } finally {
    env.cleanup();
  }
}

for (const id of AUTHORING_CASE_IDS) {
  it(`${id}: actual sdd-new skeleton is RED; complete artifact is GREEN without changing seed bytes`, () => {
    const env = fixture(id, false);
    try {
      assert.equal(
        env.item.files[env.item.target],
        undefined,
        'fixture never contains the selected answer'
      );
      assert.deepEqual(env.item.files, buildAuthoringFixture(id));
      assert.equal(checkAuthoringBenchmark(env.root, id).pass, false, 'missing artifact is RED');
      const output = execFileSync(
        process.execPath,
        ['--import', import.meta.resolve('tsx'), CLI, 'sdd-new', ...env.item.createArgs],
        {
          cwd: env.root,
          encoding: 'utf8',
          timeout: 20000,
          env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
        }
      );
      assert.match(output, new RegExp(env.item.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const scaffold = readFileSync(join(env.root, env.item.target), 'utf8');
      assert.match(scaffold, /^# /);
      const red = checkAuthoringBenchmark(env.root, id);
      assert.equal(red.pass, false, `untouched actual skeleton must not pass: ${red.detail}`);
      put(env.root, env.item.target, positive(id));
      const before = Object.fromEntries(
        [...Object.keys(env.item.files), env.item.target].map((path) => [
          path,
          readFileSync(join(env.root, path)),
        ])
      );
      const result = checkAuthoringBenchmark(env.root, id);
      assert.equal(result.pass, true, JSON.stringify(result, null, 2));
      assert.match(result.detail, /independent semantic review not claimed/);
      if (env.item.target.endsWith('.spec.md')) {
        const receipt = execFileSync(
          process.execPath,
          [
            '--import',
            import.meta.resolve('tsx'),
            CLI,
            'sdd-check',
            '--spec',
            env.item.target,
            '--authoring',
          ],
          {
            cwd: env.root,
            encoding: 'utf8',
            timeout: 20000,
            env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
          }
        );
        assert.match(receipt, /AUTHORING|authoring|Draft/i);
      }
      for (const [path, bytes] of Object.entries(before))
        assert.deepEqual(readFileSync(join(env.root, path)), bytes, `oracle is read-only: ${path}`);
    } finally {
      env.cleanup();
    }
  });
}

it('reference spec seeds also pass the actual draft checker and resolve all non-future local links', () => {
  for (const id of AUTHORING_CASE_IDS) {
    const item = getAuthoringCase(id);
    for (const [path, text] of Object.entries(item.files)) {
      if (!path.endsWith('.spec.md')) continue;
      assert.deepEqual(checkSpecAuthoringDraft(path, text), [], `${id}/${path}`);
    }
    for (const [path, text] of Object.entries(item.files)) {
      if (!path.endsWith('.md')) continue;
      for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
        const target = posix.normalize(posix.join(posix.dirname(path), match[1]!));
        assert.ok(
          target === item.target || Object.hasOwn(item.files, target),
          `${id}: ${path} has unresolved seed link ${match[1]}`
        );
      }
    }
  }
});

it('every brief resolves its installed CLI without relying on a global gennady executable', () => {
  for (const id of AUTHORING_CASE_IDS) {
    const item = getAuthoringCase(id);
    assert.ok(item.brief.includes(`npx --no-install gennady sdd-new ${item.createArgs.join(' ')}`));
    if (item.target.endsWith('.spec.md'))
      assert.ok(
        item.brief.includes(`npx --no-install gennady sdd-check --spec ${item.target} --authoring`)
      );
    assert.doesNotMatch(item.brief, /command: gennady |run actual gennady /);
  }
  const env = fixture('portal', false);
  try {
    const shim = join(env.root, 'node_modules/.bin/gennady');
    put(
      env.root,
      'node_modules/.bin/gennady',
      `#!/bin/sh\nexec "${process.execPath}" --import "${fileURLToPath(new URL(import.meta.resolve('tsx')))}" "${CLI}" "$@"\n`
    );
    chmodSync(shim, 0o755);
    const output = execFileSync(
      'npx',
      ['--no-install', 'gennady', 'sdd-new', ...env.item.createArgs],
      {
        cwd: env.root,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
          GENNADY_NO_UPDATE_CHECK: '1',
          npm_config_offline: 'true',
          npm_config_cache: join(env.root, '.npm-cache'),
        },
      }
    );
    assert.match(output, /specs\/README\.md/);
    assert.match(readFileSync(join(env.root, env.item.target), 'utf8'), /^# <project-name>/);
  } finally {
    env.cleanup();
  }
});

it('infra-base is a read-only authoring-tooling owner, not a second product-domain specification', () => {
  const path = 'specs/infra-base/infra-base.spec.md';
  for (const id of AUTHORING_CASE_IDS) {
    const item = getAuthoringCase(id);
    const infra = item.files[path]!;
    assert.deepEqual(checkSpecAuthoringDraft(path, infra), []);
    assert.doesNotMatch(infra, /normalizeToken|TypeError|Foo__BAR|foo-bar|src\/normalize-token/);
    assert.match(infra, /npx --no-install/);
    assert.match(infra, /IB-REQ-1 \[должен\]/);
    assert.match(infra, /IB-REQ-2 \[должен · нештатная\]/);
    assert.match(infra, /Node\.js 22/);
  }
  const env = fixture('portal');
  try {
    assert.equal(checkAuthoringBenchmark(env.root, 'portal').pass, true);
    const oldDomainSeed = env.item.files[path]!.replace(
      /<!--SECTION:VISION-->[\s\S]*?<!--\/SECTION:VISION-->/,
      '<!--SECTION:VISION-->\n## Vision\nOwn normalizeToken and its TypeError product-domain behavior.\n<!--/SECTION:VISION-->'
    );
    put(env.root, path, oldDomainSeed);
    const result = checkAuthoringBenchmark(env.root, 'portal');
    assert.equal(result.pass, false, result.detail);
    assert.equal(result.checks.find((check) => check.id === 'seeded-bytes')?.pass, false);
  } finally {
    env.cleanup();
  }
});

it('accepts semantically identical linked/backticked tracker IDs instead of demanding exact cell spelling', () => {
  const env = fixture('index-module');
  try {
    put(
      env.root,
      env.item.target,
      positive('index-module')
        .replace('| NOR-normalize |', '| [NOR-normalize](./normalize.task.NOR-normalize.md) |')
        .replace('| NOR-reject |', '| `NOR-reject` |')
    );
    const result = checkAuthoringBenchmark(env.root, env.item.id);
    assert.equal(result.pass, true, result.detail);
  } finally {
    env.cleanup();
  }
});

it('rejects wrong positive and negative facts even when the expected words remain elsewhere', () => {
  for (const id of AUTHORING_CASE_IDS.filter((id) =>
    getAuthoringCase(id).target.endsWith('.spec.md')
  )) {
    expectRejected(
      id,
      (text) => text.replace('| `"foo-bar"` |', '| `"Foo_BAR"` |') + '\nfoo-bar TypeError\n',
      'required-facts'
    );
    expectRejected(
      id,
      (text) => text.replace('| `TypeError` |', '| `""` |') + '\nTypeError\n',
      'required-facts'
    );
    expectRejected(
      id,
      (text) => text.replace('[должен · нештатная]', '[должен]'),
      'required-facts'
    );
    expectRejected(
      id,
      (text) => text.replace('| Input | Outcome |', '| Unrelated | Notes |'),
      'required-facts'
    );
    expectRejected(
      id,
      (text) => text.replace('| `""` | `TypeError` |', '| `""` | `TypeError` |\n| `""` | `""` |'),
      'required-facts'
    );
  }
});

it('accepts unique Input/Outcome header columns with labels, reordered columns and optional outer pipes', () => {
  for (const id of AUTHORING_CASE_IDS.filter((id) =>
    getAuthoringCase(id).target.endsWith('.spec.md')
  )) {
    for (const table of [
      '| Example | Input | Outcome |\n| --- | --- | --- |\n| Normal | `"  Foo__BAR  "` | `"foo-bar"` |\n| Empty | `""` | `TypeError` |',
      '| Outcome | Example | Input |\n| --- | --- | --- |\n| `"foo-bar"` | Normal | `"  Foo__BAR  "` |\n| `TypeError` | Empty | `""` |',
      'Outcome | Input\n--- | ---\n`"foo-bar"` | `"  Foo__BAR  "`\n`TypeError` | `""`',
    ]) {
      const env = fixture(id);
      try {
        const before = positive(id);
        const authored = before.replace(/\| Input \| Outcome \|\n(?:\|[^\n]*\n?){3}/, table + '\n');
        assert.notEqual(authored, before, 'control changes the source-owned example table');
        put(env.root, env.item.target, authored);
        const result = checkAuthoringBenchmark(env.root, id);
        assert.equal(result.pass, true, `${id}: ${result.detail}`);
        assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored, 'read-only');
      } finally {
        env.cleanup();
      }
    }
  }
});

it('rejects ambiguous example tables/headers, malformed rows and facts outside the owning section', () => {
  for (const id of AUTHORING_CASE_IDS.filter((id) =>
    getAuthoringCase(id).target.endsWith('.spec.md')
  )) {
    const table = positive(id).match(/\| Input \| Outcome \|\n(?:\|[^\n]*\n?){3}/)![0];
    for (const mutate of [
      (text: string) => text.replace(table, table + '\n' + table),
      (text: string) =>
        text.replace(
          table,
          '| Input | Outcome | Input |\n| --- | --- | --- |\n| `"  Foo__BAR  "` | `"foo-bar"` | extra |\n| `""` | `TypeError` | extra |\n'
        ),
      (text: string) =>
        text.replace(
          table,
          '| Input | Outcome | Outcome |\n| --- | --- | --- |\n| `"  Foo__BAR  "` | `"foo-bar"` | extra |\n| `""` | `TypeError` | extra |\n'
        ),
      (text: string) =>
        text.replace('| `""` | `TypeError` |', '| Input | Outcome |\n| `""` | `TypeError` |'),
      (text: string) => text.replace('| `""` | `TypeError` |', '| `""` |'),
      (text: string) => text.replace(table, '') + '\n' + table,
      (text: string) => text.replace('| `""` | `TypeError` |', '') + '\n| `""` | `TypeError` |\n',
      (text: string) => text.replace('|---|---|', '| notes | not a delimiter |'),
      (text: string) =>
        text.replace(
          table,
          '| Outcome | Label | Input |\n| --- | --- | --- |\n| `"foo-bar"` | Normal | `"  Foo__BAR  "` |\n| `""` | Empty | `""` |\n'
        ),
      (text: string) =>
        text.replace(
          table,
          '| Outcome | Label | Input |\n| --- | --- | --- |\n| `"foo-bar"` | Normal | `"  Foo__BAR  "` |\n| `TypeError` | Empty | `""` |\n| `TypeError` | Duplicate | `""` |\n'
        ),
    ])
      expectRejected(id, mutate, 'required-facts');
  }
});

it('accepts canonical module delegation to the complete source-owned parent requirement set', () => {
  for (const id of ['module-flat', 'module-nested'] as const) {
    const env = fixture(id);
    try {
      const authored = positive(id).replace(
        /(<!--SECTION:MODULE_REQUIREMENTS-->\n## Requirements\n)[\s\S]*?(\| Input \| Outcome \|)/,
        '$1\nNo module-specific requirements. Implements parent requirements: TOK-REQ-1, TOK-REQ-2.\n\n$2'
      );
      assert.notEqual(authored, positive(id));
      put(env.root, env.item.target, authored);
      assert.deepEqual(checkSpecAuthoringDraft(env.item.target, authored), []);
      const result = checkAuthoringBenchmark(env.root, id);
      assert.equal(result.pass, true, result.detail);
      assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored);
      for (const replacement of [
        'TOK-REQ-1',
        'TOK-REQ-1, UNKNOWN-REQ-2',
        'TOK-REQ-1, TOK-REQ-1, TOK-REQ-2',
        'TOK-REQ-1, TOK-REQ-2, TOK-REQ-3',
        'TOK-REQ-1, TOK-REQ-2.\nNo module-specific requirements. Implements parent requirements: TOK-REQ-1, TOK-REQ-2',
        'TOK-REQ-1, TOK-REQ-2.\nNo module-specific requirements. Implements parent requirements: made-up',
      ]) {
        put(
          env.root,
          env.item.target,
          authored.replace('TOK-REQ-1, TOK-REQ-2.', replacement + '.')
        );
        const rejected = checkAuthoringBenchmark(env.root, id);
        assert.equal(
          rejected.checks.find((check) => check.id === 'required-facts')?.pass,
          false,
          replacement
        );
      }
      put(
        env.root,
        env.item.target,
        positive(id).replace(
          '| Input | Outcome |',
          'No module-specific requirements. Implements parent requirements: TOK-REQ-1, TOK-REQ-2.\n\n| Input | Outcome |'
        )
      );
      const mixed = checkAuthoringBenchmark(env.root, id);
      assert.equal(
        mixed.checks.find((check) => check.id === 'required-facts')?.pass,
        false,
        mixed.detail
      );
    } finally {
      env.cleanup();
    }
  }
});

it('rejects duplicate anchors, missing required sections, duplicate IDs and conflicting kind', () => {
  expectRejected(
    'scope-library',
    (text) => text + '\n<!--SECTION:VISION-->Extra<!--/SECTION:VISION-->\n',
    'canonical-shape'
  );
  expectRejected(
    'scope-library',
    (text) => text.replace(/<!--SECTION:VISION-->[\s\S]*?<!--\/SECTION:VISION-->/, ''),
    'canonical-shape'
  );
  expectRejected(
    'scope-library',
    (text) => text.replace('TOK-REQ-2', 'TOK-REQ-1'),
    'canonical-shape'
  );
  expectRejected(
    'scope-library',
    (text) => text.replace('TOKEN\n<!--/SECTION:SPEC_ID-->', 'WRONG\n<!--/SECTION:SPEC_ID-->'),
    'canonical-shape'
  );
  expectRejected(
    'module-flat',
    (text) => text + '\n<!--SECTION:SCOPE_TYPE-->library<!--/SECTION:SCOPE_TYPE-->\n',
    'canonical-shape'
  );
  expectRejected(
    'scope-library',
    (text) => text.replace('## Vision & Primary Goal', '### Vision & Primary Goal'),
    'canonical-shape'
  );
  expectRejected('portal', (text) => text + '\n## Scopes\nNo rows here.\n', 'canonical-shape');
  expectRejected(
    'index-module',
    (text) => text + '\n## Tracker Index\nNo rows here.\n',
    'canonical-shape'
  );
  expectRejected(
    'index-scope',
    (text) => text.replace('```mermaid\ngraph TD\n  normalize\n```', 'no diagram'),
    'canonical-shape'
  );
  expectRejected(
    'scope-library',
    (text) => text.replace('**Depends on:** infra-base', '**Depends on:** None'),
    'canonical-shape'
  );
});

it('rejects forged approval in owner handoff, owner decisions and portal statuses', () => {
  expectRejected(
    'scope-library',
    (text) => text.replace('**Operator decision:** pending', '**Operator decision:** approved'),
    'pending-approval'
  );
  expectRejected(
    'module-flat',
    (text) => text.replace('No independent module decisions or approval.', '**Status:** approved'),
    'pending-approval'
  );
  expectRejected('portal', (text) => text.replace('🚧', '✅'), 'pending-approval');
  expectRejected(
    'index-module',
    (text) =>
      text.replace('No decisions or approvals recorded.', 'NOR-DL-1 approved [verdict: accepted]'),
    'pending-approval'
  );
});

it('accepts explicit unapproved handoffs in English and Russian, not only the word pending', () => {
  for (const handoff of [
    'Одобрения нет. Решение оператора ещё не получено.',
    'Спецификация не утверждена оператором.',
    'Ожидает решения оператора.',
    'Одобрение оператора отсутствует, тикеты не созданы, выполнение не начато.',
    'Спецификация ожидает operator approval; тикеты не созданы.',
    'Операторское одобрение отсутствует; реализация не запрошена.',
    'No operator approval has been given.',
    'Operator approval has not been granted.',
    'Awaiting operator approval.',
    '**Status:** pending-operator',
  ]) {
    const env = fixture('module-nested');
    try {
      const authored = positive('module-nested').replace(
        /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
        `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n${handoff}\n<!--/SECTION:HANDOFF-->`
      );
      put(env.root, env.item.target, authored);
      const result = checkAuthoringBenchmark(env.root, env.item.id);
      assert.equal(result.pass, true, `${handoff}: ${result.detail}`);
      assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored);
    } finally {
      env.cleanup();
    }
  }
});

it('rejects missing or contradictory approval even if a pending disclaimer is also present', () => {
  for (const handoff of [
    'Implementation may start.',
    'No status specified.',
    'pending-operator\nОператор одобрил спецификацию.',
    'pending\nСпецификация утверждена оператором.',
    'pending\nOperator approval has been granted.',
    'pending\nApproved by operator.',
    'pending\n- Operator approval has been granted.',
    'pending\n- Approved by operator.',
    'pending\n- Оператор одобрил спецификацию.',
    'pending\n1. Оператор одобрил спецификацию.',
    'pending\n- **Одобрение оператора:** получено.',
  ])
    expectRejected(
      'module-nested',
      (text) =>
        text.replace(
          /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
          `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n${handoff}\n<!--/SECTION:HANDOFF-->`
        ),
      'pending-approval'
    );
});

it('calibrated-v2: accepts recorded awaiting-approval wording without changing explicit calibrated', () => {
  const env = fixture('module-flat');
  try {
    const authored = positive('module-flat').replace(
      /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
      '<!--SECTION:HANDOFF-->\n## Handoff to Tasks\nРеализация не создана; спекa ожидает операторского approval.\n<!--/SECTION:HANDOFF-->'
    );
    put(env.root, env.item.target, authored);
    const historical = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated');
    assert.equal(historical.checks.find((row) => row.id === 'pending-approval')?.pass, false);
    const revised = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v2');
    assert.equal(revised.pass, true, revised.detail);
    assert.deepEqual(
      revised.checks.filter((row) => row.id !== 'pending-approval'),
      historical.checks.filter((row) => row.id !== 'pending-approval')
    );
    assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored);
  } finally {
    env.cleanup();
  }
});

it('calibrated-v2: rejects negated awaiting forms and contradictory granted claims', () => {
  for (const handoff of [
    'Спецификация не ожидает операторского approval.',
    'pending-operator\nСпецификация не ожидает операторского approval.',
    'Not awaiting operator approval.',
    'pending-operator\nNot awaiting operator approval.',
    'Спецификация ожидает операторского approval.\n- Operator approval has been granted.',
    'Спецификация ожидает операторского approval.\n- Оператор одобрил спецификацию.',
    'pending-operator\n- **Одобрение оператора:** получено.',
  ])
    expectRejected(
      'module-flat',
      (text) =>
        text.replace(
          /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
          `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n${handoff}\n<!--/SECTION:HANDOFF-->`
        ),
      'pending-approval',
      'calibrated-v2'
    );
});

it('calibrated-v2: actual raw15 artifact is separately calibrated, never rewritten or historically regraded', () => {
  const env = fixture('module-flat');
  try {
    const artifact = readFileSync(
      new URL(
        '../results/authoring-campaigns/spec-trajectory-oct23/raw/15/specs/token/normalize/normalize.spec.md',
        import.meta.url
      ),
      'utf8'
    );
    assert.equal(
      createHash('sha256').update(artifact).digest('hex'),
      'bce1d093fbeb5f04380305e98b7cd8094f6cefec55713e7a3c02cab500e2fe78'
    );
    put(env.root, env.item.target, artifact);
    const historical = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated');
    assert.equal(historical.pass, false);
    assert.equal(historical.checks.find((row) => row.id === 'pending-approval')?.pass, false);
    assert.equal(checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v2').pass, true);
    assert.equal(checkAuthoringBenchmark(env.root, env.item.id).pass, true);
    assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), artifact);
  } finally {
    env.cleanup();
  }
});

it('calibrated-v3: accepts the recorded not-issued clause without regrading historical revisions', () => {
  for (const id of ['module-flat', 'module-nested'] as const) {
    const env = fixture(id);
    try {
      const authored = positive(id).replace(
        /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
        '<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n- **Open risks & validation needs:** Операторское одобрение не выдано; реализация не начата.\n<!--/SECTION:HANDOFF-->'
      );
      put(env.root, env.item.target, authored);
      const current = checkAuthoringBenchmark(env.root, id, 'calibrated-v3');
      assert.equal(current.pass, true, current.detail);
      assert.deepEqual(checkAuthoringBenchmark(env.root, id), current);
      for (const revision of ['frozen-oct22', 'calibrated', 'calibrated-v2'] as const) {
        const historical = checkAuthoringBenchmark(env.root, id, revision);
        assert.equal(historical.checks.find((row) => row.id === 'pending-approval')?.pass, false);
        // frozen-oct22 deliberately owns older seed bytes; compare other checks only for
        // calibrations that share the current fixture, not across different fixture revisions.
        if (revision !== 'frozen-oct22')
          assert.deepEqual(
            current.checks.filter((row) => row.id !== 'pending-approval'),
            historical.checks.filter((row) => row.id !== 'pending-approval'),
            revision
          );
      }
      assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored, 'read-only');
    } finally {
      env.cleanup();
    }
  }
});

it('calibrated-v3: a not-issued disclaimer does not override explicit subsequent approval', () => {
  for (const grant of [
    'Оператор одобрил спецификацию.',
    'Спецификация утверждена оператором.',
    'Операторское одобрение выдано.',
    'Одобрение оператора уже получено.',
    '**Операторское одобрение:** выдано.',
    '**Одобрение оператора:** получено.',
    '**Статус:** одобрено.',
    'Operator approval has been granted.',
    'Approved by operator.',
    '**Operator decision:** approved',
    '[verdict: accepted]',
    '✅',
  ]) {
    for (const separator of ['; ', '.\n- ']) {
      expectRejected(
        'module-flat',
        (text) =>
          text.replace(
            /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
            `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\nОператорское одобрение не выдано${separator}${grant}\n<!--/SECTION:HANDOFF-->`
          ),
        'pending-approval',
        'calibrated-v3'
      );
    }
  }
});

it('calibrated-v3: replays the unchanged actual FORMAT1 baseline artifact with its field-prefix clause', () => {
  const env = fixture('module-flat');
  try {
    const path = new URL(
      '../results/authoring-campaigns/format-oct23/report-v1/permanent/2026-10-23-authoring-format-oct23-module-flat-baseline-r1/specs/token/normalize/normalize.spec.md',
      import.meta.url
    );
    const artifact = readFileSync(path, 'utf8');
    assert.equal(
      createHash('sha256').update(artifact).digest('hex'),
      '0f4ae617da0c0cd40f803594ac0f83e7642307562d5e97f49d37e122175d638a'
    );
    assert.match(
      artifact,
      /- \*\*Open risks & validation needs:\*\* Операторское одобрение не выдано; реализация не начата;/
    );
    put(env.root, env.item.target, artifact);
    const historical = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v2');
    assert.equal(historical.pass, false);
    assert.equal(historical.checks.find((row) => row.id === 'pending-approval')?.pass, false);
    const current = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v3');
    assert.equal(current.pass, true, current.detail);
    assert.deepEqual(
      current.checks.filter((row) => row.id !== 'pending-approval'),
      historical.checks.filter((row) => row.id !== 'pending-approval')
    );
    assert.equal(readFileSync(path, 'utf8'), artifact, 'raw model output is never rewritten');
    assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), artifact, 'read-only');
  } finally {
    env.cleanup();
  }
});

it('calibrated-v3: rejects incomplete, questioned or negated not-issued wording', () => {
  for (const handoff of [
    'Implementation may start.',
    'No status specified.',
    'Не выдано.',
    'Операторское одобрение выдано.',
    'Операторское одобрение не выдано ли?',
    'Неверно, что операторское одобрение не выдано.',
    'Операторское одобрение не выдано — работа разрешена.',
    'pending-operator\nNot awaiting operator approval.',
  ]) {
    expectRejected(
      'module-flat',
      (text) =>
        text.replace(
          /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
          `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n${handoff}\n<!--/SECTION:HANDOFF-->`
        ),
      'pending-approval',
      'calibrated-v3'
    );
  }
});

it('calibrated-v4: accepts bounded not-received families while explicit v3 remains unchanged', () => {
  assert.equal(CURRENT_AUTHORING_BENCHMARK_REVISION, 'calibrated-v5');
  // Exact HANDOFF line from FORMAT2 prose-r2, raw SHA-256:
  // de5dfad52f82682c510298576d0d4024c611467970cd050653f275a70a866cb4.
  // This is a fixture-level lexical regression, not a regrade or live replay of that attempt.
  const recorded =
    '- **Open risks & validation needs:** Реализация и тесты не созданы и не запускались; поведение для ASCII-границ и `TypeError` требует проверки задачами. Операторское одобрение не получено.';
  for (const id of ['module-flat', 'module-nested'] as const) {
    const env = fixture(id);
    try {
      for (const clause of [
        recorded,
        'Операторское одобрение не получено.',
        'Одобрение оператора ещё не получено; реализация не начата.',
        'Операторское одобрение пока не выдано.',
      ]) {
        const authored = positive(id).replace(
          /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
          `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n${clause}\n<!--/SECTION:HANDOFF-->`
        );
        put(env.root, env.item.target, authored);
        const historical = checkAuthoringBenchmark(env.root, id, 'calibrated-v3');
        const revised = checkAuthoringBenchmark(env.root, id, 'calibrated-v4');
        assert.equal(historical.checks.find((row) => row.id === 'pending-approval')?.pass, false);
        assert.equal(revised.pass, true, revised.detail);
        assert.deepEqual(checkAuthoringBenchmark(env.root, id), revised);
        assert.deepEqual(
          revised.checks.filter((row) => row.id !== 'pending-approval'),
          historical.checks.filter((row) => row.id !== 'pending-approval')
        );
        for (const revision of ['calibrated', 'calibrated-v2'] as const)
          assert.equal(
            checkAuthoringBenchmark(env.root, id, revision).checks.find(
              (row) => row.id === 'pending-approval'
            )?.pass,
            false
          );
        assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored, 'read-only');
      }
    } finally {
      env.cleanup();
    }
  }
});

it('calibrated-v4: not-received wording retains the existing granted/approved-claim protections', () => {
  for (const terminal of [
    'Операторское одобрение получено.',
    'Оператор одобрил спецификацию.',
    'Одобрение оператора уже получено.',
    'Operator approval has been granted.',
    'Approved by operator.',
    '**Operator decision:** approved',
    '✅',
  ]) {
    for (const separator of ['; ', '.\n- '])
      expectRejected(
        'module-flat',
        (text) =>
          text.replace(
            /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
            `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\nОператорское одобрение не получено${separator}${terminal}\n<!--/SECTION:HANDOFF-->`
          ),
        'pending-approval',
        'calibrated-v4'
      );
  }
});

it('calibrated-v4: a rejected domain status outside HANDOFF is not a new operator-decision claim', () => {
  const env = fixture('module-flat');
  try {
    const authored = positive(env.item.id).replace(
      '<!--/SECTION:IMPLEMENTATION_INSIGHTS-->',
      'Invalid-input diagnostic example (not an operator decision): `Status: rejected`.\n<!--/SECTION:IMPLEMENTATION_INSIGHTS-->'
    );
    assert.match(authored, /Status: rejected/);
    const handoff = extractSection(authored, 'HANDOFF');
    assert.equal(handoff.status, 'ok');
    if (handoff.status === 'ok') assert.doesNotMatch(handoff.content, /Status: rejected/);
    put(env.root, env.item.target, authored);
    const historical = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v3');
    const revised = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v4');
    assert.equal(historical.pass, true, historical.detail);
    assert.equal(revised.pass, true, revised.detail);
    assert.deepEqual(revised, historical);
    assert.equal(readFileSync(join(env.root, env.item.target), 'utf8'), authored, 'read-only');
  } finally {
    env.cleanup();
  }
});

it('calibrated-v4: rejects missing, questioned and negated not-received clauses', () => {
  for (const clause of [
    'Implementation may start.',
    'Не получено.',
    'Операторское одобрение получено.',
    'Операторское одобрение не получено ли?',
    'Неверно, что операторское одобрение не получено.',
    'Одобрение оператора не получено — работа разрешена.',
    'pending-operator\nNot awaiting operator approval.',
  ])
    expectRejected(
      'module-flat',
      (text) =>
        text.replace(
          /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
          `<!--SECTION:HANDOFF-->\n## Handoff to Tasks\n${clause}\n<!--/SECTION:HANDOFF-->`
        ),
      'pending-approval',
      'calibrated-v4'
    );
});

it('calibrated-v4: a valid pending clause never excuses malformed relative links', () => {
  const env = fixture('module-flat');
  try {
    put(
      env.root,
      env.item.target,
      positive(env.item.id).replace(
        /<!--SECTION:HANDOFF-->[\s\S]*?<!--\/SECTION:HANDOFF-->/,
        '<!--SECTION:HANDOFF-->\n## Handoff to Tasks\nОператорское одобрение не получено.\n[missing](../../../missing.md)\n<!--/SECTION:HANDOFF-->'
      )
    );
    const result = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v4');
    assert.equal(result.checks.find((row) => row.id === 'pending-approval')?.pass, true);
    assert.equal(result.checks.find((row) => row.id === 'relative-links')?.pass, false);
    assert.equal(result.pass, false);
  } finally {
    env.cleanup();
  }
});

it('calibrated-v5: accepts actual balanced SECTION references while historical v4 remains reproducible', () => {
  for (const id of ['module-flat', 'module-nested'] as const) {
    const env = fixture(id);
    try {
      const parent = posix.relative(posix.dirname(env.item.target), 'specs/token/token.spec.md');
      put(
        env.root,
        env.item.target,
        positive(id).replace(
          '<!--/SECTION:HANDOFF-->',
          `[Parent requirements](${parent}#REQUIREMENTS_AND_CONSTRAINTS)\n[Own vision](#MODULE_VISION)\n<!--/SECTION:HANDOFF-->`
        )
      );
      const old = checkAuthoringBenchmark(env.root, id, 'calibrated-v4');
      const revised = checkAuthoringBenchmark(env.root, id, 'calibrated-v5');
      assert.equal(old.checks.find((c) => c.id === 'relative-links')?.pass, false);
      assert.equal(revised.pass, true, revised.detail);
      assert.deepEqual(
        revised.checks.filter((c) => c.id !== 'relative-links'),
        old.checks.filter((c) => c.id !== 'relative-links')
      );
    } finally {
      env.cleanup();
    }
  }
});

it('calibrated-v5: missing or duplicate SECTION targets do not pass by fragment spelling', () => {
  for (const duplicate of [false, true]) {
    const env = fixture('module-flat');
    try {
      const fragment = duplicate ? 'MODULE_VISION' : 'MISSING_SECTION';
      const extra = duplicate
        ? '\n<!--SECTION:MODULE_VISION-->\nDuplicate\n<!--/SECTION:MODULE_VISION-->\n'
        : '';
      put(
        env.root,
        env.item.target,
        positive(env.item.id).replace(
          '<!--/SECTION:HANDOFF-->',
          `[Bad](#${fragment})\n<!--/SECTION:HANDOFF-->`
        ) + extra
      );
      const revised = checkAuthoringBenchmark(env.root, env.item.id, 'calibrated-v5');
      assert.equal(revised.pass, false);
      assert.equal(revised.checks.find((c) => c.id === 'relative-links')?.pass, false);
    } finally {
      env.cleanup();
    }
  }
});

it('the current reference positive domain excludes the invalid inputs owned by the negative requirement', () => {
  const scope = getAuthoringCase('module-flat').files['specs/token/token.spec.md']!;
  const requirements = extractSection(scope, 'REQUIREMENTS_AND_CONSTRAINTS');
  assert.equal(requirements.status, 'ok');
  if (requirements.status !== 'ok') return;
  const positiveDomain = requirements.content.split('TOK-REQ-2')[0]!;
  assert.match(
    positiveDomain,
    /ASCII-строка.*содержит хотя бы один символ, отличный от пробела, underscore и hyphen/
  );
  assert.match(requirements.content, /состоит из разделителей/);
});

it('current approval calibration accepts the three actual Russian handoffs without regrading frozen outcomes', () => {
  for (const [prefix, id] of [
    ['module-nested-baseline-r1', 'module-nested'],
    ['module-nested-concise-acronym-r1', 'module-nested'],
    ['module-nested-concise-acronym-r2', 'module-nested'],
  ] as const) {
    const env = fixture(id);
    try {
      const path = new URL(
        `../results/2026-10-23-authoring-template-placement-oct22-${prefix}/${env.item.target}`,
        import.meta.url
      );
      const bytes = readFileSync(path, 'utf8');
      put(env.root, env.item.target, bytes);
      const current = checkAuthoringBenchmark(env.root, id);
      assert.equal(current.checks.find((row) => row.id === 'pending-approval')?.pass, true);
      const historical = checkAuthoringBenchmark(env.root, id, 'frozen-oct22');
      assert.equal(historical.checks.find((row) => row.id === 'pending-approval')?.pass, false);
      assert.equal(readFileSync(path, 'utf8'), bytes, 'saved model output never rewritten');
    } finally {
      env.cleanup();
    }
  }
});

it('rejects tracker status/dependency/slug/DAG and project rollup distortions', () => {
  expectRejected('index-module', (text) => text.replace('[ ] TODO', '[x] DONE'), 'required-facts');
  expectRejected(
    'index-module',
    (text) => text.replace('| NOR-normalize | [ ] TODO', '| — | [ ] TODO'),
    'required-facts'
  );
  expectRejected(
    'index-module',
    (text) => text.replace('- reject', '- invented'),
    'required-facts'
  );
  expectRejected(
    'index-module',
    (text) => text.replace('NOR-reject --> NOR-normalize', 'NOR-normalize --> NOR-reject'),
    'required-facts'
  );
  expectRejected(
    'index-scope',
    (text) => text.replace('| normalize | NOR-normalize', '| other | NOR-normalize'),
    'required-facts'
  );
  expectRejected(
    'index-project',
    (text) => text.replace('| 2 | 0/2 |', '| 2 | 2/2 |'),
    'required-facts'
  );
  expectRejected(
    'index-project',
    (text) => text.replace('token --> infra-base', 'infra-base --> token'),
    'required-facts'
  );
  expectRejected(
    'portal',
    (text) => text.replace('token --> infra-base', 'infra-base --> token'),
    'required-facts'
  );
  expectRejected(
    'index-scope',
    (text) => text.replace('./token.spec.md', '../infra-base/infra-base.spec.md'),
    'required-facts'
  );
  expectRejected(
    'index-scope',
    (text) => text.replace('| token (target) | — |', '| token (target) | invented-rules |'),
    'required-facts'
  );
  expectRejected(
    'index-module',
    (text) => text.replace('../../3-tasks.md', '../../README.md'),
    'required-facts'
  );
  expectRejected(
    'index-project',
    (text) => text.replace('[Specs Portal](./README.md)', '[Specs Portal](./token/token.spec.md)'),
    'required-facts'
  );
});

it('rejects remaining guidance, broken/escaping links and altered canonical project vocabulary', () => {
  expectRejected(
    'scope-library',
    (text) => text + '\n<!-- fill after authoring -->\n',
    'no-skeleton'
  );
  expectRejected('portal', (text) => text + '\n<project-name>\n', 'no-skeleton');
  expectRejected(
    'module-nested',
    (text) => text.replace('../../token.spec.md', '../token.spec.md'),
    'relative-links'
  );
  expectRejected(
    'index-module',
    (text) => text.replace('../../3-tasks.md', '../../../../outside.md'),
    'relative-links'
  );
  expectRejected(
    'index-project',
    (text) => text.replace('every phase', 'some phases'),
    'no-skeleton'
  );
});

it('rejects seeded-file mutation, unexpected sidecars, symlink/hardlink targets and oversized input', () => {
  for (const mutation of ['seed', 'extra', 'symlink', 'hardlink', 'oversize'] as const) {
    const env = fixture('scope-library');
    try {
      assert.equal(checkAuthoringBenchmark(env.root, env.item.id).pass, true);
      if (mutation === 'seed') put(env.root, 'docs/token-contract.md', 'rewritten expected facts');
      if (mutation === 'extra') put(env.root, 'golden/expected.json', '{}');
      if (mutation === 'oversize') put(env.root, env.item.target, 'x'.repeat(256 * 1024 + 1));
      if (mutation === 'symlink' || mutation === 'hardlink') {
        const path = join(env.root, env.item.target);
        rmSync(path);
        const other = join(env.root, 'docs/token-contract.md');
        if (mutation === 'symlink') symlinkSync(other, path);
        else linkSync(other, path);
      }
      assert.equal(checkAuthoringBenchmark(env.root, env.item.id).pass, false, mutation);
    } finally {
      env.cleanup();
    }
  }
});

it('does not permit caller mutation of required facts/seed truth to alter the independent oracle', () => {
  const item = getAuthoringCase('scope-library');
  item.requiredFacts.length = 0;
  item.files['docs/token-contract.md'] = 'changed';
  const fresh = getAuthoringCase('scope-library');
  assert.equal(fresh.requiredFacts.length, 2);
  assert.notEqual(fresh.files['docs/token-contract.md'], 'changed');
  assert.throws(() => getAuthoringCase('../outside' as AuthoringCaseId), /Unknown authoring case/);
  assert.equal(extractSection(positive('module-flat'), 'SPEC_ID').status, 'ok');
  assert.ok(TEMPLATES.module.sections.length > 8);
});
