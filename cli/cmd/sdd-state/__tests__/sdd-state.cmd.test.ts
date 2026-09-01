// @file: Integration tests for SddStateCommand#run — flow version, exact readiness, scopes+description, session, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

type SddStateModule = typeof import('../sdd-state.cmd.ts');

let mod: SddStateModule;
let origExit: typeof process.exit;
let origArgv: string[];
let ready: string;
let noPortal: string;
let v1Repo: string;
let bare: string;
let withGraph: string;

const PORTAL = [
  '# proj',
  '## Scopes',
  '| Scope | Type | Spec | Description |',
  '|---|---|---|---|',
  '| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | TS toolchain |',
  '| [`web`](./web/web.spec.md) | product | 🚧 | React SPA |',
].join('\n');

const READY_PKG = JSON.stringify({
  scripts: {
    typecheck: 'tsc --noEmit',
    test: 'node --test',
    'test:coverage': 'c8 node --test',
    lint: 'npm run lint:contracts',
    'lint:contracts': 'gennady lint .',
    format: 'prettier --check .',
    check: 'npm run typecheck && npm test && npm run lint && npm run format',
    fix: 'npm run format:fix && npm run lint:fix && npm run check',
    'format:fix': 'prettier --write',
    'lint:fix': 'eslint --fix',
  },
});

const SESSION = [
  '# SDD session — 2026-06-21',
  'intent: evolve-scope',
  'working set:',
  '  - specs/web/web.spec.md — add auth — open',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-state', ...rest];
}

const KEY_DIRECTIVE_FILES = [
  'router.directive.xml',
  'execute.directive.xml',
  'phase-execution-protocol.directive.xml',
  'preflight-protocol.directive.xml',
  'formats/requirement-entry-format.xml',
];

/** @purpose Test fixture helper: install the key sdd-v2 directive files under `<root>/ai/directives/sdd-v2/` (or a caller-chosen `at`), satisfying the sdd-state install-preflight gate. */
function installDirectives(root: string, at = join(root, 'ai', 'directives', 'sdd-v2')): void {
  mkdirSync(at, { recursive: true });
  for (const f of KEY_DIRECTIVE_FILES) {
    const target = join(at, f);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '<directive/>\n', 'utf-8');
  }
}

/** @purpose Reproduce draft.54's approved scopes plus one unresolved module CHANGE_MANIFEST. */
function writeDraft54ModuleReviewFixture(
  root: string,
  intent: 'module-decomposition' | 'scaffold'
): void {
  installDirectives(root);
  mkdirSync(join(root, 'specs', 'infra-base'), { recursive: true });
  mkdirSync(join(root, 'specs', 'todos-app', 'ui'), { recursive: true });
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules', '.bin', 'gennady'), '#!/bin/sh\n', 'utf-8');
  writeFileSync(join(root, 'package.json'), READY_PKG, 'utf-8');
  writeFileSync(
    join(root, 'specs', 'README.md'),
    [
      '# TodoMVC',
      '## Scopes',
      '| Scope | Type | Status | Description |',
      '|---|---|---|---|',
      '| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | toolchain |',
      '| [`todos-app`](./todos-app/todos-app.spec.md) | product | ✅ | application |',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(root, 'specs', 'infra-base', 'infra-base.spec.md'),
    [
      '<!--SECTION:SCOPE_TYPE-->',
      'infrastructure',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
      '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
      '|---|---|---|---|---|---|',
      '| toolchain | tool | this-scope-task | install | type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix | package.json |',
      '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(root, 'specs', 'todos-app', 'todos-app.spec.md'),
    [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '[ui](./ui/ui.spec.md)',
      '<!--/SECTION:MODULE_MAP-->',
      '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
      '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
      '|---|---|---|---|---|---|',
      '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(root, 'specs', 'todos-app', 'ui', 'ui.spec.md'),
    [
      '<!--SECTION:CHANGE_MANIFEST-->',
      '## ⟢ Change Manifest — review-state',
      'ТИП ИЗМЕНЕНИЯ: refine · composition root owner',
      '<!--/SECTION:CHANGE_MANIFEST-->',
      '<!--SECTION:MODULE_VISION-->',
      '## Module Vision',
      'UI owns App/main/index/Vite composition.',
      '<!--/SECTION:MODULE_VISION-->',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(root, 'specs', '.sdd-session.md'),
    [
      '# SDD session — 2026-08-31',
      `intent: ${intent}`,
      ...(intent === 'module-decomposition' ? ['scale: module'] : []),
      'working set:',
      '  - specs/todos-app/todos-app.spec.md — scaffold target — open',
      '  - specs/todos-app/ui/ui.spec.md — scaffold target — open',
      'glossary:',
      'journal:',
      'open: module review-state is unresolved',
    ].join('\n'),
    'utf-8'
  );
}

describe('SddStateCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-state'];

    ready = mkdtempSync(join(tmpdir(), 'sdd-state-ready-'));
    mkdirSync(join(ready, 'specs'), { recursive: true });
    writeFileSync(join(ready, 'specs', 'README.md'), PORTAL, 'utf-8');
    writeFileSync(join(ready, 'specs', '.sdd-session.md'), SESSION, 'utf-8');
    writeFileSync(join(ready, 'package.json'), READY_PKG, 'utf-8');
    mkdirSync(join(ready, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(ready, 'node_modules', '.bin', 'gennady'), '#!/bin/sh\n', 'utf-8');
    mkdirSync(join(ready, 'src'), { recursive: true });
    writeFileSync(join(ready, 'src', 'app.ts'), 'export const app = 1;\n', 'utf-8');
    writeFileSync(join(ready, 'tsconfig.json'), '{}\n', 'utf-8');
    installDirectives(ready);

    noPortal = mkdtempSync(join(tmpdir(), 'sdd-state-none-'));
    writeFileSync(
      join(noPortal, 'package.json'),
      JSON.stringify({ scripts: { test: 'node --test' } }),
      'utf-8'
    );
    installDirectives(noPortal);

    bare = mkdtempSync(join(tmpdir(), 'sdd-state-bare-'));
    installDirectives(bare);

    v1Repo = mkdtempSync(join(tmpdir(), 'sdd-state-v1-'));
    mkdirSync(join(v1Repo, 'tasks'), { recursive: true });
    writeFileSync(join(v1Repo, 'package.json'), READY_PKG, 'utf-8');
    installDirectives(v1Repo);

    withGraph = mkdtempSync(join(tmpdir(), 'sdd-state-graph-'));
    mkdirSync(join(withGraph, 'specs'), { recursive: true });
    writeFileSync(
      join(withGraph, 'specs', 'README.md'),
      [PORTAL, '', '```mermaid', 'graph TD', '  web --> infra-base', '```'].join('\n'),
      'utf-8'
    );
    installDirectives(withGraph);

    mod = await import('../sdd-state.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(ready, { recursive: true, force: true });
    rmSync(noPortal, { recursive: true, force: true });
    rmSync(v1Repo, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
    rmSync(withGraph, { recursive: true, force: true });
  });

  it('reports v2 flow, ready, scopes with description, and the session', async () => {
    const o = await mod.run(argv(ready));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /FLOW_VERSION=v2/);
      assert.match(o.text, /READINESS=ready/);
      assert.match(o.text, /package\.json\t✔/);
      assert.match(o.text, /type-check\t✔/);
      assert.match(o.text, /test:coverage\t✔/);
      assert.match(o.text, /lint→gennady\t✔/);
      assert.match(o.text, /gennady-installed\t✔/);
      // repo-root-relative spec path, not relative to specs/ (the portal link `./infra-base/infra-base.spec.md`
      // is only valid relative to specs/README.md itself — the printed path must open as-is from repo root).
      assert.match(
        o.text,
        /infra-base\tinfrastructure\tdone\tTS toolchain\tspecs\/infra-base\/infra-base\.spec\.md/
      );
      assert.match(o.text, /web\tproduct\twip\tReact SPA\tspecs\/web\/web\.spec\.md/);
      assert.match(o.text, /intent: evolve-scope/);
      assert.match(o.text, /readiness=ready/);
      assert.doesNotMatch(o.text, /\[GRAPH\]/);
    }
  });

  it('separates scaffold authoring readiness from runtime execution readiness', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-state-authoring-ready-'));
    const specPath = join(root, 'specs', 'infra-core', 'infra-core.spec.md');
    const completeRow =
      '| Node/npm runtime and tooling | tool | this-scope-task | create bootstrap toolchain | package.json, type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix, gennady | package.json, package-lock.json, .nvmrc, .npmrc |';
    const writeSpec = (row: string): void => {
      mkdirSync(dirname(specPath), { recursive: true });
      writeFileSync(
        specPath,
        [
          '<!--SECTION:SCOPE_TYPE-->',
          'infrastructure',
          '<!--/SECTION:SCOPE_TYPE-->',
          '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
          '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
          '|---|---|---|---|---|---|',
          row,
          '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        ].join('\n'),
        'utf-8'
      );
    };
    try {
      installDirectives(root);
      mkdirSync(join(root, 'specs'), { recursive: true });
      writeFileSync(
        join(root, 'specs', 'README.md'),
        [
          '# demo',
          '## Scopes',
          '| Scope | Type | Status | Description |',
          '|---|---|---|---|',
          '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | tooling |',
        ].join('\n'),
        'utf-8'
      );
      writeSpec(completeRow);

      const scaffoldable = await mod.run(argv(root));
      assert.strictEqual(scaffoldable.ok, true);
      if (scaffoldable.ok) {
        assert.match(scaffoldable.text, /AUTHORING_READY=yes/);
        assert.match(scaffoldable.text, /AUTHORING_SCOPE=infra-core\tREADY=yes/);
        assert.match(scaffoldable.text, /EXECUTION_READY=no/);
        assert.match(scaffoldable.text, /NEXT=scaffold may create the declared bootstrap tickets/);
        assert.match(
          scaffoldable.text,
          /👉 Следующий шаг: разбить спеки на задачи — \/sdd-scaffold/
        );
        assert.doesNotMatch(scaffoldable.text, /настроить инфраструктуру .*перед scaffold/);
      }

      mkdirSync(join(root, 'specs', 'broken'), { recursive: true });
      writeFileSync(
        join(root, 'specs', 'broken', 'broken.spec.md'),
        [
          '<!--SECTION:SCOPE_TYPE-->',
          'product',
          '<!--/SECTION:SCOPE_TYPE-->',
          '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
          '| Requirement | Kind | Owner | Resolution |',
          '|---|---|---|---|',
          '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        ].join('\n'),
        'utf-8'
      );
      writeFileSync(
        join(root, 'specs', 'README.md'),
        [
          '# demo',
          '## Scopes',
          '| Scope | Type | Status | Description |',
          '|---|---|---|---|',
          '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | tooling |',
          '| [`broken`](./broken/broken.spec.md) | product | ✅ | stale unrelated scope |',
        ].join('\n'),
        'utf-8'
      );
      const mixed = await mod.run(argv(root));
      assert.strictEqual(mixed.ok, true);
      if (mixed.ok) {
        assert.match(mixed.text, /AUTHORING_READY=no/);
        assert.match(mixed.text, /AUTHORING_SCOPE=infra-core\tREADY=yes/);
        assert.match(mixed.text, /AUTHORING_SCOPE=broken\tREADY=no/);
        assert.match(mixed.text, /AUTHORING_SCOPE_NEXT=broken\trepair only scope 'broken'/);
      }
      rmSync(join(root, 'specs', 'broken'), { recursive: true, force: true });
      writeFileSync(
        join(root, 'specs', 'README.md'),
        [
          '# demo',
          '## Scopes',
          '| Scope | Type | Status | Description |',
          '|---|---|---|---|',
          '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | tooling |',
        ].join('\n'),
        'utf-8'
      );

      writeSpec(completeRow.replace('create bootstrap toolchain', '—'));
      const ambiguous = await mod.run(argv(root));
      assert.strictEqual(ambiguous.ok, true);
      if (ambiguous.ok) {
        assert.match(ambiguous.text, /AUTHORING_READY=no/);
        assert.match(
          ambiguous.text,
          /Bootstrap row 'Node\/npm runtime and tooling' has no Resolution/
        );
      }

      writeSpec(completeRow);
      writeFileSync(join(root, 'package.json'), READY_PKG, 'utf-8');
      mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(join(root, 'node_modules', '.bin', 'gennady'), '#!/bin/sh\n', 'utf-8');
      const fullyReady = await mod.run(argv(root));
      assert.strictEqual(fullyReady.ok, true);
      if (fullyReady.ok) {
        assert.match(fullyReady.text, /AUTHORING_READY=yes/);
        assert.match(fullyReady.text, /EXECUTION_READY=yes/);
        assert.match(fullyReady.text, /NEXT=scaffold and product execute may proceed/);
      }

      const stubbedPackage = JSON.parse(READY_PKG) as { scripts: Record<string, string> };
      stubbedPackage.scripts.test = 'echo TODO';
      writeFileSync(join(root, 'package.json'), JSON.stringify(stubbedPackage), 'utf-8');
      const vacuous = await mod.run(argv(root));
      assert.strictEqual(vacuous.ok, true);
      if (vacuous.ok) {
        assert.match(vacuous.text, /READINESS=provisional/);
        assert.match(vacuous.text, /AUTHORING_READY=yes/);
        assert.match(vacuous.text, /EXECUTION_READY=no/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('draft.54: active module decomposition in review-state takes precedence over scaffold next', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-state-draft54-review-'));
    try {
      writeDraft54ModuleReviewFixture(root, 'module-decomposition');

      const outcome = await mod.run(argv(root));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.doesNotMatch(outcome.text, /NEXT=scaffold|\/sdd-scaffold/);
        assert.match(
          outcome.text,
          /NEXT=resume active module-decomposition review for specs\/todos-app\/ui\/ui\.spec\.md; do not scaffold until CHANGE_MANIFEST is resolved/
        );
        assert.match(
          outcome.text,
          /👉 Следующий шаг: завершить active module-decomposition review/
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('draft.54: scaffold-owned nested module correction preserves scaffold intent and suppresses generic scaffold', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-state-draft54-nested-'));
    try {
      writeDraft54ModuleReviewFixture(root, 'scaffold');

      const outcome = await mod.run(argv(root));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.doesNotMatch(outcome.text, /NEXT=scaffold(?:\s|$)|\/sdd-scaffold/);
        assert.match(
          outcome.text,
          /NEXT=resume scaffold-owned nested module correction for specs\/todos-app\/ui\/ui\.spec\.md; keep intent=scaffold and exact target-set, then return to scaffold STEP_0_INTAKE after accepted\/CLEAN/
        );
        assert.match(
          outcome.text,
          /👉 Следующий шаг: завершить scaffold-owned nested module correction/
        );
        assert.match(
          readFileSync(join(root, 'specs', '.sdd-session.md'), 'utf-8'),
          /^intent: scaffold$/m
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats every non-current V2 shape as invalid and never routes through migration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-state-schema-'));
    try {
      installDirectives(root);
      mkdirSync(join(root, 'specs', 'legacy'), { recursive: true });
      writeFileSync(
        join(root, 'specs', 'legacy', 'legacy.spec.md'),
        [
          '<!--SECTION:SCOPE_TYPE-->',
          'product',
          '<!--/SECTION:SCOPE_TYPE-->',
          '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
          '| Requirement | Kind | Owner | Resolution |',
          '|---|---|---|---|',
          '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        ].join('\n'),
        'utf-8'
      );
      const outcome = await mod.run(argv(root));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) {
        assert.match(outcome.text, /\[SPEC_SCHEMA\]\nVERSION=sdd-v2\nSTATUS=invalid/);
        assert.match(
          outcome.text,
          /invalid\tspecs\/legacy\/legacy\.spec\.md\t.+Readiness Gates, Gate Artifacts/
        );
        assert.match(
          outcome.text,
          /NEXT=repair each listed spec through its owning authoring flow/
        );
        assert.match(outcome.text, /spec-schema=invalid/);
        assert.doesNotMatch(outcome.text, /reconcile\.directive|stale-migratable/);
        assert.equal(
          outcome.text.match(/^NEXT=/gm)?.length,
          1,
          'invalid schema has one exact route'
        );
      }

      writeFileSync(
        join(root, 'specs', 'legacy', 'legacy.spec.md'),
        [
          '<!--SECTION:SCOPE_TYPE-->',
          'product',
          '<!--/SECTION:SCOPE_TYPE-->',
          '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
          '| Requirement | Owner | Mystery |',
          '|---|---|---|',
          '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        ].join('\n'),
        'utf-8'
      );
      const invalid = await mod.run(argv(root));
      assert.strictEqual(invalid.ok, true);
      if (invalid.ok) {
        assert.match(invalid.text, /STATUS=invalid/);
        assert.match(invalid.text, /invalid\tspecs\/legacy\/legacy\.spec\.md\t.+ambiguous/);
        assert.match(
          invalid.text,
          /NEXT=repair each listed spec through its owning authoring flow/
        );
        assert.equal(
          invalid.text.match(/^NEXT=/gm)?.length,
          1,
          'invalid schema has one exact route'
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('renders [GRAPH] between [SCOPES] and [SESSION] when the portal has a scope graph', async () => {
    const o = await mod.run(argv(withGraph));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /\[GRAPH\]\nуровень 0 \(фундамент\): infra-base\nуровень 1: web/);
      const scopesIdx = o.text.indexOf('[SCOPES]');
      const graphIdx = o.text.indexOf('[GRAPH]');
      const sessionIdx = o.text.indexOf('[SESSION]');
      assert.ok(scopesIdx < graphIdx && graphIdx < sessionIdx);
    }
  });

  it('reports not-ready with the missing list when required scripts are absent', async () => {
    const o = await mod.run(argv(noPortal));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /READINESS=not-ready/);
      assert.match(o.text, /missing:[^)]*type-check/);
      assert.match(o.text, /missing:[^)]*format/);
      assert.match(o.text, /missing:[^)]*gennady/);
      assert.match(o.text, /package\.json\t✔/);
      assert.match(o.text, /gennady-installed\t✘/);
      assert.match(o.text, /PORTAL=absent/);
      assert.match(o.text, /session=absent/);
    }
  });

  it('includes [PROBE] by default; --probe stays accepted as a no-op', async () => {
    const def = await mod.run(argv(ready));
    assert.strictEqual(def.ok, true);
    if (def.ok) {
      assert.match(def.text, /\[PROBE\]/);
      assert.match(def.text, /CODE=present/);
      assert.match(def.text, /INFRA=present/);
      assert.match(def.text, /code=present/);
    }

    const pr = await mod.run(argv(ready, '--probe'));
    assert.strictEqual(pr.ok, true);
    if (pr.ok) assert.strictEqual(pr.text, (def as { ok: true; text: string }).text);
  });

  it('reports package.json absent when the root has none', async () => {
    const o = await mod.run(argv(bare));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /package\.json\t✘/);
      assert.match(o.text, /missing:[^)]*package\.json/);
    }
  });

  it('detects the v1 layout (tasks/) → FLOW_VERSION=v1', async () => {
    const o = await mod.run(argv(v1Repo));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /FLOW_VERSION=v1/);
  });

  it('exit 2 on a non-directory root, exit 4 on extra args', async () => {
    const badr = await mod.run(argv(join(noPortal, 'package.json')));
    assert.strictEqual(badr.ok === false && badr.exitCode, 2);
    const bad4 = await mod.run(argv(ready, noPortal));
    assert.strictEqual(bad4.ok === false && bad4.exitCode, 4);
  });

  it('rejects unknown flags and values on the boolean --probe flag with canonical usage', async () => {
    for (const args of [['--typo'], ['--probe=deep'], [ready, 'sdd-state']]) {
      const outcome = await mod.run(argv(...args));
      assert.strictEqual(outcome.ok === false && outcome.exitCode, 4);
      if (outcome.ok) continue;
      assert.match(outcome.message, /usage: gennady sdd-state \[project-root\] \[--probe\]/);
    }
  });
});

describe('SddStateCommand — readiness ladder card', () => {
  let mod2: SddStateModule;
  let empty: string;
  let portalOnly: string;
  let scopesNoInfra: string;
  let allClosed: string;

  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-state'];

    empty = mkdtempSync(join(tmpdir(), 'sdd-state-ladder-empty-'));
    installDirectives(empty);

    portalOnly = mkdtempSync(join(tmpdir(), 'sdd-state-ladder-portal-'));
    mkdirSync(join(portalOnly, 'specs'), { recursive: true });
    writeFileSync(join(portalOnly, 'specs', 'README.md'), '# Acme\n\n## Scopes\n', 'utf-8');
    installDirectives(portalOnly);

    scopesNoInfra = mkdtempSync(join(tmpdir(), 'sdd-state-ladder-scopes-'));
    mkdirSync(join(scopesNoInfra, 'specs', 'backend', 'api'), { recursive: true });
    writeFileSync(
      join(scopesNoInfra, 'specs', 'README.md'),
      [
        '# Acme',
        '## Scopes',
        '| Scope | Type | Status | Description |',
        '|---|---|---|---|',
        '| [`backend`](./backend/backend.spec.md) | product | ✅ | REST API |',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(scopesNoInfra, 'specs', 'backend', 'api', 'api.spec.md'),
      '<!--SECTION:MODULE_VISION-->\nvision\n<!--/SECTION:MODULE_VISION-->\n',
      'utf-8'
    );
    installDirectives(scopesNoInfra);

    allClosed = mkdtempSync(join(tmpdir(), 'sdd-state-ladder-closed-'));
    mkdirSync(join(allClosed, 'specs', 'backend', 'api'), { recursive: true });
    mkdirSync(join(allClosed, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(
      join(allClosed, 'specs', 'README.md'),
      [
        '# Acme',
        '## Scopes',
        '| Scope | Type | Status | Description |',
        '|---|---|---|---|',
        '| [`backend`](./backend/backend.spec.md) | product | ✅ | REST API |',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(allClosed, 'specs', 'backend', 'api', 'api.spec.md'),
      '<!--SECTION:MODULE_VISION-->\nvision\n<!--/SECTION:MODULE_VISION-->\n',
      'utf-8'
    );
    writeFileSync(
      join(allClosed, 'specs', '3-tasks.md'),
      [
        '## Scope Tracker',
        '| Scope | Type | Index | Tasks | Done |',
        '|---|---|---|---|---|',
        '| backend | product | [3-tasks](./backend/backend.3-tasks.md) | 4 | 4/4 |',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(join(allClosed, 'package.json'), READY_PKG, 'utf-8');
    writeFileSync(join(allClosed, 'node_modules', '.bin', 'gennady'), '#!/bin/sh\n', 'utf-8');
    installDirectives(allClosed);

    mod2 = await import('../sdd-state.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(empty, { recursive: true, force: true });
    rmSync(portalOnly, { recursive: true, force: true });
    rmSync(scopesNoInfra, { recursive: true, force: true });
    rmSync(allClosed, { recursive: true, force: true });
  });

  it('empty repo: card names it «пустой репозиторий», every rung ⬜, next step is /sdd', async () => {
    const o = await mod2.run(argv(empty));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /🏗 SDD v[^ ]+ · «пустой репозиторий»/);
      assert.match(o.text, /⬜ 1\. Портал/);
      assert.match(o.text, /⬜ 2\. Скоупы/);
      assert.match(o.text, /⬜ 3\. Модули/);
      assert.match(o.text, /⬜ 4\. Инфраструктура/);
      assert.match(o.text, /⬜ 5\. Задачи/);
      assert.match(o.text, /👉 Следующий шаг: создать проект — \/sdd/);
    }
  });

  it('portal only, no scopes: rung 1 closed, name from the portal H1, next step is a scope spec', async () => {
    const o = await mod2.run(argv(portalOnly));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /🏗 SDD v[^ ]+ · Acme/);
      assert.match(o.text, /✅ 1\. Портал/);
      assert.match(o.text, /⬜ 2\. Скоупы\s+нет ни одной/);
      assert.match(o.text, /👉 Следующий шаг: написать и approve скоуп-спеку — \/sdd/);
    }
  });

  it('portal + approved scope + module spec but incomplete authoring contract: routes back to spec readiness', async () => {
    const o = await mod2.run(argv(scopesNoInfra));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /✅ 2\. Скоупы\s+approved: 1 из 1/);
      assert.match(o.text, /✅ 3\. Модули\s+модульных спек: 1/);
      assert.match(o.text, /⬜ 4\. Инфраструктура\s+не настроена/);
      assert.match(
        o.text,
        /👉 Следующий шаг: исправить готовность спецификаций к scaffold — \/sdd/
      );
    }
  });

  it('everything closed: all five rungs ✅, tasks totals from the project rollup', async () => {
    const o = await mod2.run(argv(allClosed));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /✅ 1\. Портал/);
      assert.match(o.text, /✅ 2\. Скоупы/);
      assert.match(o.text, /✅ 3\. Модули/);
      assert.match(o.text, /✅ 4\. Инфраструктура/);
      assert.match(o.text, /✅ 5\. Задачи\s+тикетов: 4 · done: 4/);
      assert.match(o.text, /👉 Следующий шаг: всё закрыто — следующий цикл \/sdd-execute/);
    }
  });
});

describe('SddStateCommand — install-preflight gate (AX no install/sync knowledge outside sdd-state)', () => {
  let mod3: SddStateModule;
  let neither: string;
  let nodeModulesOnly: string;
  let rootIncomplete: string;

  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-state'];

    // Neither location has any directives at all — package not installed.
    neither = mkdtempSync(join(tmpdir(), 'sdd-state-gate-neither-'));

    // node_modules/gennady/ai/directives/sdd-v2/ is complete; project root has never been synced.
    nodeModulesOnly = mkdtempSync(join(tmpdir(), 'sdd-state-gate-nm-'));
    installDirectives(
      nodeModulesOnly,
      join(nodeModulesOnly, 'node_modules', 'gennady', 'ai', 'directives', 'sdd-v2')
    );

    // Root has the directory but a key file is missing (corrupted/partial); node_modules/gennady
    // is present as a package but its own sdd-v2 copy is missing too.
    rootIncomplete = mkdtempSync(join(tmpdir(), 'sdd-state-gate-root-incomplete-'));
    mkdirSync(join(rootIncomplete, 'ai', 'directives', 'sdd-v2'), { recursive: true });
    writeFileSync(
      join(rootIncomplete, 'ai', 'directives', 'sdd-v2', 'router.directive.xml'),
      '<directive/>\n',
      'utf-8'
    );
    mkdirSync(join(rootIncomplete, 'node_modules', 'gennady'), { recursive: true });

    mod3 = await import('../sdd-state.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(neither, { recursive: true, force: true });
    rmSync(nodeModulesOnly, { recursive: true, force: true });
    rmSync(rootIncomplete, { recursive: true, force: true });
  });

  it('neither location has directives → exit ≠ 0, never prints a snapshot, names npm-install-then-sync', async () => {
    const o = await mod3.run(argv(neither));
    assert.strictEqual(o.ok, false);
    if (o.ok) return;
    assert.notStrictEqual(o.exitCode, 0);
    assert.match(o.message, /ERR_CLI_SDD_STATE_DIRECTIVES_MISSING/);
    assert.match(o.message, /ai\/directives\/sdd-v2\/ \(project root\): absent/);
    assert.match(o.message, /node_modules\/gennady\/ai\/directives\/sdd-v2\/: absent/);
    assert.match(o.message, /next: npm i -D gennady && npx gennady sync-skills/);
    assert.doesNotMatch(o.message, /\[READINESS\]/);
  });

  it('directives present only under node_modules/gennady/ → blocks until project copy is synced', async () => {
    const o = await mod3.run(argv(nodeModulesOnly));
    assert.strictEqual(o.ok, false);
    if (o.ok) return;
    assert.match(o.message, /sync/);
  });

  it('root copy incomplete + node_modules copy absent → exit ≠ 0, names the missing file, next is `sync`', async () => {
    const o = await mod3.run(argv(rootIncomplete));
    assert.strictEqual(o.ok, false);
    if (o.ok) return;
    assert.notStrictEqual(o.exitCode, 0);
    assert.match(o.message, /ai\/directives\/sdd-v2\/ \(project root\): missing:/);
    // node_modules/gennady/ exists as a package but its own sdd-v2 copy is absent — "installed, not synced".
    assert.match(o.message, /node_modules\/gennady\/ai\/directives\/sdd-v2\/: absent/);
    assert.match(o.message, /next: npx gennady sync/);
    assert.doesNotMatch(o.message, /npm i -D gennady/);
  });
});
