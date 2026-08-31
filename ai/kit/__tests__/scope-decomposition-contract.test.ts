// @file: Regression guard for scope decomposition timing, scaffold gating, and exact CLI handoffs.
// @consumers: build-directives, sdd-new, sdd-scaffold

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');
const PUBLIC_SDD_MODULE = /(?:^|[\s`'"])\/sdd-module(?=$|[\s`'"])/m;

describe('scope decomposition and scaffold contract', () => {
  const scope = read('ai', 'kit', 'templates', 'sdd-v2', 'scope.directive.hbs');
  const module = read('ai', 'kit', 'templates', 'sdd-v2', 'module.directive.hbs');
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const router = read('ai', 'kit', 'templates', 'sdd-v2', 'router.directive.hbs');
  const infrastructure = read('ai', 'kit', 'templates', 'sdd-v2', 'infra.directive.hbs');
  const interfaceFlow = read('ai', 'kit', 'templates', 'sdd-v2', 'interface.directive.hbs');
  const cliTypes = read('cli', 'cmd', 'sdd-new', 'sdd-new.types.ts');
  const cliHelp = read('cli', 'cmd', 'sdd-new', 'help.ts');
  const cliSpec = read('specs', 'cli', 'sdd-new', 'sdd-new.spec.md');
  const taskIdAxiom = read('ai', 'kit', 'axiom', 'process', 'ax-task-id-uniqueness.xml');

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

  it('declares the exhaustive task-owner model and rejects ambiguous evidence', () => {
    assert.match(scaffold, /scope type must be\s+present and unambiguous/);
    assert.match(scaffold, /non-empty Module Map whose explicit links\s+resolve one-to-one/);
    assert.match(scaffold, /`infrastructure-flat`.+`scope-bootstrap`.+`module`/s);
    assert.match(scaffold, /Product\/library ordinary\s+work without a module is invalid/);
    assert.match(scope, /standalone `infrastructure` scope is the sole no-module exception/);
    assert.match(interfaceFlow, /no\s+direct flat-scope scaffold route/);
  });

  it('persists one exact bounded scaffold workset only through a compatible session', () => {
    const intake = scaffold.slice(
      scaffold.indexOf('<Step id="STEP_0_INTAKE">'),
      scaffold.indexOf('<Step id="STEP_0B_PREFLIGHT">')
    );
    assert.match(intake, /<repo-relative-spec-path> — <role> — open/);
    assert.match(intake, /<role>` is exactly one of `scaffold target`\s+or `dependency context`/);
    assert.doesNotMatch(intake, /scaffold target\|dependency context|scaffold target module/);
    assert.match(intake, /already present and compatible/);
    assert.match(intake, /absent\/incompatible.+return to the router's session barrier/s);
    assert.equal(
      intake.match(
        /<ToolCall\b[^>]*>npx gennady sdd-session workset --content-file \.claude\/tmp\/sdd-scaffold-workset\.txt<\/ToolCall>/g
      )?.length,
      1
    );
    assert.doesNotMatch(intake, /--help|sdd-session open/);
  });

  it('keeps every scaffold session mutation exact and reuses the live feasibility worker', () => {
    const invocations = scaffold.match(/npx gennady sdd-session [^<\n]+/g) ?? [];
    const toolCalls = scaffold.match(
      /<ToolCall\b[^>]*>npx gennady sdd-session [^<\n]+<\/ToolCall>/g
    ) ?? [];
    assert.equal(invocations.length, toolCalls.length);
    assert.match(scaffold, /Re-dispatch into the SAME worker session whenever it is alive/);
    assert.match(scaffold, /allow exactly ONE fresh\s+fallback critic/);
  });

  it('rejects the draft.53 app-shell outside-modules hole before Gate 1', () => {
    const draft53Case = [
      'Module Map: ui, storage',
      'Runtime composition: App.tsx, main.tsx, index.html, vite entrypoint — outside modules',
    ].join('\n');
    assert.match(draft53Case, /outside modules/);
    assert.match(
      scaffold,
      /every runtime requirement\/deliverable to exactly one declared module.+App.+main.+index.+Vite.+“Outside modules”.+H_SCOPE_NOT_DECOMPOSED/s
    );
    assert.match(
      scaffold,
      /scope-bootstrap` is legal only for an exact Bootstrap Requirements row.+cannot carry app-shell/s
    );
    const gate1 = scaffold.slice(
      scaffold.indexOf('<Step id="STEP_2_DAG">'),
      scaffold.indexOf('<Step id="STEP_3_TASK_GENERATION">')
    );
    assert.match(gate1, /composition-root\/app-shell.+halts.+before presenting Gate 1/s);
    assert.match(gate1, /Do not assign it to UI by convention/);
  });

  it('routes stale structural schema before cascade/DAG and never lets scaffold repair specs', () => {
    const preflight = scaffold.slice(
      scaffold.indexOf('<Step id="STEP_0B_PREFLIGHT">'),
      scaffold.indexOf('<Step id="STEP_1_CASCADE">')
    );
    assert.match(
      preflight,
      /`stale-migratable`.+existing `intent: scaffold` unchanged.+no relabel and no new state field.+reconcile\.directive/s
    );
    assert.match(preflight, /nested same-chain preflight subflow.+re-enter STEP_0B with the same intake/s);
    assert.doesNotMatch(preflight, /resume-intent/);
    assert.match(preflight, /Do not enter STEP_1\/STEP_2, edit a spec, read implementation, generate a\s+ticket, or add an Ask here/);
    assert.match(preflight, /`invalid` → `H_SPEC_SCHEMA_INVALID`/);
    assert.match(router, /\[SPEC_SCHEMA\].+binding router evidence.+pass it unchanged.+scaffold STEP_0B/s);
  });

  it('spells exact CLI commands and names the real router route', () => {
    assert.match('Run `/sdd-module` now.', PUBLIC_SDD_MODULE);
    assert.match(
      scaffold,
      /npx gennady sdd-new task --owner module --scope <scope> --module <module> --id <ACR>-<slug>/
    );
    assert.match(
      scaffold,
      /npx gennady sdd-new task --owner scope-bootstrap --scope <scope> --id <ACR>-<slug>/
    );
    assert.match(
      scaffold,
      /npx gennady sdd-new task --owner infrastructure-flat --scope <scope> --id <ACR>-<slug>/
    );
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
      /`missingOptions` \/ `resolveTaskOutputOwnership`.+`--id` и `--owner` всегда обязательны.+SCOPE_TYPE-bearing owner/s
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
      taskIdAxiom,
    ]) {
      assert.doesNotMatch(source, PUBLIC_SDD_MODULE);
    }
  });

  it('never publishes an executable sdd-new task example without an explicit owner', () => {
    for (const source of [scaffold, cliTypes, cliHelp, cliSpec, taskIdAxiom]) {
      const calls = source.match(/npx gennady sdd-new task[^\n`]*/g) ?? [];
      for (const call of calls) assert.match(call, /--owner(?: |=)/, call);
    }
  });
});
