// @file: Regression guard for scope decomposition timing, scaffold gating, and exact CLI handoffs.
// @consumers: build-directives, sdd-new, sdd-scaffold

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');

describe('scope decomposition and scaffold contract', () => {
  const scope = read('ai', 'kit', 'templates', 'sdd-v2', 'scope.directive.hbs');
  const module = read('ai', 'kit', 'templates', 'sdd-v2', 'module.directive.hbs');
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const infrastructure = read('ai', 'kit', 'templates', 'sdd-v2', 'infra.directive.hbs');
  const interfaceFlow = read('ai', 'kit', 'templates', 'sdd-v2', 'interface.directive.hbs');
  const cliTypes = read('cli', 'cmd', 'sdd-new', 'sdd-new.types.ts');
  const cliHelp = read('cli', 'cmd', 'sdd-new', 'help.ts');
  const cliSpec = read('specs', 'cli', 'sdd-new', 'sdd-new.spec.md');

  it('defers new or undecomposed product/library review until module flow creates the bundle', () => {
    assert.match(
      scope,
      /New \/ rewritten `product` or `library`, or `refine` \/ `pivot` with incomplete decomposition:.+do NOT\s+run critic.+re-enter the `\/sdd` router with intent `module-decomposition`/s
    );
    assert.match(scope, /reviews one integrated target-set only after boundaries exist/);
    assert.match(scope, /non-empty Module Map must resolve one-to-one/);
  });

  it('routes contract impact through module flow before integrated review', () => {
    assert.match(
      scope,
      /changes a module boundary or contract: first use the `module` flow.+Then review one integrated target-set = changed\s+scope \+ ALL module specs/s
    );
    assert.match(module, /parent scope spec plus\s+ALL module specs/);
    assert.match(module, /exact non-empty member manifest/);
  });

  it('keeps modules read-only context for a scope-only change', () => {
    assert.match(scope, /scope-only and leaves all module boundaries\/contracts unchanged/);
    assert.match(scope, /existing modules as read-only critic members/);
    assert.match(scope, /Do NOT add `CHANGE_MANIFEST`, line marks, or\s+review-state to them/);
    assert.match(module, /unchanged module specs are read-only members/);
    assert.match(scope, /no task\/DAG impact → finish as a spec-only change/);
    assert.match(scope, /task\/DAG impact → load scaffold and extend the existing DAG/);
    assert.match(scope, /Never silently stop between review\s+and this disposition/);
  });

  it('makes infrastructure the sole flat-scope exception and rejects ambiguous evidence', () => {
    assert.match(scaffold, /scope type must be\s+present and unambiguous/);
    assert.match(scaffold, /non-empty Module Map whose explicit links\s+resolve one-to-one/);
    assert.match(scaffold, /`infrastructure` is\s+the sole valid flat scope/);
    assert.match(scope, /standalone `infrastructure` scope is the sole no-module exception/);
    assert.match(interfaceFlow, /no\s+direct flat-scope scaffold route/);
  });

  it('spells exact CLI commands and names the real router route', () => {
    assert.match(
      scaffold,
      /npx gennady sdd-new task --scope <scope> --module <module> --id <ACR>-<slug>/
    );
    assert.match(scaffold, /npx gennady sdd-new task --scope <scope> --id <ACR>-<slug>/);
    assert.match(scope, /npx gennady sdd-check --all specs\/<scope>/);
    assert.match(module, /npx gennady sdd-new module --scope <scope> --module <module>/);
    assert.match(infrastructure, /npx gennady sdd-new infrastructure --scope <scope>/);
    assert.match(
      interfaceFlow,
      /returns `TerminalDecision: continue` to the already-loaded\s+router.+SAME session/s
    );
    assert.match(cliHelp, /A task may instead infer it from one canonical/);
    assert.match(cliHelp, /--out owner; other kinds may omit it with explicit --out/);
    assert.match(cliHelp, /infers task --scope and/);
    assert.match(cliSpec, /scope inference структурный и fail-closed/);
    assert.match(
      cliSpec,
      /`missingOptions` \/ `resolveTaskOutputOwnership`.+`--id` всегда обязателен.+SCOPE_TYPE-bearing owner/s
    );
    for (const source of [
      scope,
      module,
      scaffold,
      infrastructure,
      interfaceFlow,
      cliTypes,
      cliHelp,
      cliSpec,
    ]) {
      assert.doesNotMatch(source, /\/sdd-module/);
    }
  });
});
