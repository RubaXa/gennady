// @file: Regression guard for one SDD session across authoring, review, scaffold, execute, and reconcile.
// @consumers: build-directives, router, all stateful public SDD entries and authoring owners
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');
const template = (name: string): string =>
  read('ai', 'kit', 'templates', 'sdd-v2', `${name}.directive.hbs`);
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('SDD session lifetime contract', () => {
  const session = read('ai', 'kit', 'contract', 'process', 'session-file-format.xml');
  const nextMenu = read('ai', 'kit', 'contract', 'process', 'next-step-menu-format.xml');
  const router = template('router');
  const root = template('root');
  const scope = template('scope');
  const module = template('module');
  const lifecycle = template('review-lifecycle');
  const scaffold = template('scaffold');
  const execute = template('execute');
  const reconcile = template('reconcile');
  const infra = template('infra');
  const interfaceOwner = template('interface');
  const discover = template('discover-from-code');
  const recover = template('recover-from-code');
  const critic = template('critic');
  const relevant = {
    router,
    root,
    scope,
    module,
    lifecycle,
    scaffold,
    execute,
    reconcile,
    infra,
    interface: interfaceOwner,
    discover,
    recover,
    critic,
  };

  it('defines one shared typed result and installs it in every top-level owner', () => {
    assert.match(session, /TerminalDecision = continue \| pause \| complete/);
    assert.match(session, /root → scope → module → integrated\s+review → scaffold → execute/);
    assert.match(session, /internal handoff never closes it/);
    assert.match(session, /Approval Check, external-review wait, critic\/scaffold cap, blocker, failed check/);

    for (const [name, source] of Object.entries(relevant)) {
      assert.match(
        source,
        /\{\{> "contract\/process\/session-file-format"\}\}/,
        `${name} must consume the shared session lifetime contract`
      );
    }
  });

  it('preserves the intended root-to-execute chain and every intermediate pause', () => {
    assert.match(step(root, 'STEP_4_PORTAL_WRITE'), /TerminalDecision: continue/);
    assert.match(step(scope, 'STEP_9_FINAL_SPEC'), /module-boundary handoff.+`continue`/s);
    assert.match(step(module, 'STEP_6_FINAL_HIERARCHY'), /hand off to scaffold.+TerminalDecision: continue/s);
    assert.match(step(lifecycle, 'STEP_4_AWAIT'), /TerminalDecision: pause.+preserve the SDD session/s);
    assert.match(step(lifecycle, 'STEP_6_MERGE_REVIEWED_COMMIT'), /TerminalDecision: continue.+downstream handoff/s);
    assert.match(step(scaffold, 'STEP_5_FINALIZE'), /execute in the SAME session.+TerminalDecision: continue/s);

    const capAndBlockerSources = [scaffold, execute, lifecycle].join('\n');
    assert.match(capAndBlockerSources, /active cap.+TerminalDecision: pause/s);
    assert.match(execute, /H_PAUSED_AWAITING_OPERATOR.+TerminalDecision: pause/);
    assert.match(execute, /H_CODE_REVIEW_BLOCKER.+`pause`.+preserve the SDD session/);
    assert.match(lifecycle, /H_AWAITING_EXTERNAL_REVIEW.+TerminalDecision: pause/);
  });

  it('routes every stateful public entry through one router snapshot and a forced intent', () => {
    const publicEntries = {
      scaffold: read('ai', 'skills', 'sdd-scaffold', 'SKILL.md'),
      execute: read('ai', 'skills', 'sdd-execute', 'SKILL.md'),
      reconcile: read('ai', 'skills', 'sdd-reconcile', 'SKILL.md'),
      critic: read('ai', 'skills', 'sdd-critic', 'SKILL.md'),
    };

    for (const [intent, skill] of Object.entries(publicEntries)) {
      assert.equal(skill.match(/npx gennady sdd-state/g)?.length, 1, `${intent}: one snapshot`);
      assert.match(skill, /result alias `routerState`/);
      assert.match(skill, /ai\/directives\/sdd-v2\/router\.directive\.xml/);
      assert.match(skill, new RegExp(`forced intent[^\\n]*${intent}`));
      assert.match(skill, /exact `routerState` bytes|exact result alias `routerState`/);
      assert.doesNotMatch(
        skill,
        new RegExp(`ai/directives/sdd-v2/${intent}\\.directive\\.xml`),
        `${intent}: loader must not bypass router`
      );
      assert.match(skill, /do not open, relabel,\s+ignore, or close a session/);
    }

    assert.match(router, /public direct entry supplies one literal forced intent/);
    for (const intent of Object.keys(publicEntries)) {
      assert.match(
        router,
        new RegExp(
          `WHEN forced intent = ${intent}[\\s\\S]*?READ_AND_USE_DIRECTIVE\\("ai/directives/sdd-v2/${intent}\\.directive\\.xml"\\)`
        )
      );
    }
    assert.match(router, /forced `scaffold` \/ `reconcile` \/ `critic` do not consume\s+SCALE/s);
  });

  it('opens the session barrier before preflight and journals only returned branch results', () => {
    const state = step(router, 'STEP_0_STATE');
    const classify = step(router, 'STEP_1_CLASSIFY');
    const preflight = step(router, 'STEP_1B_PREFLIGHT');
    assert.doesNotMatch(state, /<ToolCall\b[^>]*>npx gennady sdd-session log/);
    assert.doesNotMatch(state, /readiness-preflight-gate|pendingPreflightJournal/);
    assert.match(classify, /compatible existing session selected/);
    assert.match(classify, /required sessionOpen succeeded/);
    assert.match(preflight, /legal here only because STEP_1 already proved or opened the owning session/);
    assert.doesNotMatch(preflight, /readinessState|readiness arm/);
    assert.match(preflight, /activeRouterState = migrationState/);
    assert.match(preflight, /Do not run a router refresh after that return/);
    assert.equal(
      preflight.match(/<ToolCall\b[^>]*>npx gennady sdd-session log/g)?.length,
      1,
      'one branch-result call-site owns the post-session journal write'
    );
    assert.doesNotMatch(router, /pendingPreflightJournal|preflight-refresh/);
  });

  it('keeps infra/interface terminal decisions typed and continues internal handoffs in-session', () => {
    for (const [name, owner, id] of [
      ['infra', infra, 'STEP_7_FINAL_SPEC'],
      ['interface', interfaceOwner, 'STEP_6_FINAL_SPEC'],
    ] as const) {
      const terminal = step(owner, id);
      assert.match(terminal, /Approval\s+Check returns `TerminalDecision: pause`/);
      assert.match(terminal, /TerminalDecision: continue.+already-loaded\s+router/s);
      assert.match(terminal, /unfinished chained work: none/);
      assert.match(terminal, /Complete \/ finish/);
      assert.match(terminal, /TerminalDecision: complete/);
      assert.equal(
        terminal.match(/<ToolCall\b[^>]*>npx gennady sdd-session close<\/ToolCall>/g)?.length,
        1,
        name
      );
    }
    assert.match(step(interfaceOwner, 'STEP_6_FINAL_SPEC'), /Never tell the\s+operator to invoke `\/sdd` manually/s);
  });

  it('returns discovery/recovery to their existing caller and never closes', () => {
    assert.match(
      step(discover, 'STEP_4_VERIFY'),
      /TerminalDecision: continue.+already-loaded root greenfield\/recovery owner/s
    );
    assert.match(
      step(recover, 'STEP_4_VERIFY'),
      /TerminalDecision: continue.+already-loaded router/s
    );
    assert.doesNotMatch(discover, /<ToolCall\b[^>]*>npx gennady sdd-session close/);
    assert.doesNotMatch(recover, /<ToolCall\b[^>]*>npx gennady sdd-session close/);
  });

  it('keeps direct critic in the same typed lifecycle', () => {
    assert.match(step(critic, 'STEP_3B_ROUND_CHECKPOINT'), /TerminalDecision: pause.+preserve/s);
    assert.match(step(critic, 'STEP_3B2_CAP_DECISION'), /TerminalDecision: pause.+preserve/s);
    const terminal = step(critic, 'STEP_5_FINALIZE');
    assert.match(terminal, /review-lifecycle dispatched.+TerminalDecision: continue/s);
    assert.match(terminal, /forced direct `critic` entry/);
    assert.match(terminal, /unfinished chained work: none/);
    assert.match(terminal, /TerminalDecision: complete/);
    assert.equal(
      terminal.match(/<ToolCall\b[^>]*>npx gennady sdd-session close<\/ToolCall>/g)?.length,
      1
    );
  });

  it('recovery consumes the exact router snapshot without a duplicate state probe', () => {
    const intake = step(recover, 'STEP_0_INTAKE');
    const survey = step(recover, 'STEP_1_SURVEY');
    assert.match(intake, /exact router snapshot saved before this directive was loaded/);
    assert.match(intake, /No mutation occurs between the router's single GATHER call/);
    assert.match(survey, /Scope Graph \+ Scopes table already saved in the router snapshot/);
    assert.doesNotMatch(recover, /<ToolCall\b[^>]*>npx gennady sdd-state/);
  });

  it('persists readiness research under the exact infra owner without adding an Ask', () => {
    const readiness = template('readiness');
    const plan = step(readiness, 'STEP_1_PLAN');
    assert.match(readiness, /axiom\/truth\/ax-research-persisted/);
    assert.match(plan, /exact\s+owning infrastructure scope from the caller's saved `sdd-state`/s);
    assert.match(plan, /No owning infra scope means no toolchain research or choice/);
    assert.match(
      plan,
      /npx gennady sdd-new research --scope <owning-infra-scope> --slug <tool-category-slug>/
    );
    assert.match(plan, /source URL \+ access date in EVIDENCE/);
    assert.match(plan, /FINAL_DISPOSITION linking the exact owning Tool Stack \/\s*Decision record/s);
    assert.match(plan, /no extra Ask/);
    assert.match(plan, /If no external\s+research is used, make no research call\/artifact/s);
  });

  it('closes only from an explicit terminal complete decision with no chained work', () => {
    assert.match(session, /explicit operator choice named\s+`complete` or `finish`/s);
    assert.match(session, /unfinished chained work: none/);
    assert.match(nextMenu, /Complete \/ finish.+npx gennady sdd-session close/s);

    for (const [name, id] of [
      ['root', 'STEP_4_PORTAL_WRITE'],
      ['scope', 'STEP_9_FINAL_SPEC'],
      ['infra', 'STEP_7_FINAL_SPEC'],
      ['interface', 'STEP_6_FINAL_SPEC'],
      ['critic', 'STEP_5_FINALIZE'],
      ['execute', 'STEP_8_SUMMARY'],
      ['reconcile', 'STEP_6_VERIFY'],
    ] as const) {
      const terminal = step(relevant[name], id);
      assert.match(terminal, /unfinished chained work: none/);
      assert.match(terminal, /Complete \/ finish/);
      assert.match(terminal, /TerminalDecision: complete/);
      assert.equal(
        terminal.match(/<ToolCall\b[^>]*>npx gennady sdd-session close<\/ToolCall>/g)?.length,
        1,
        `${name} must close exactly once at its terminal invocation step`
      );
      assert.match(terminal, /decision source|source is|decision source is/i);
    }

    for (const intermediate of [module, lifecycle, scaffold]) {
      assert.doesNotMatch(intermediate, /npx gennady sdd-session close/);
    }
  });

  it('cannot silently inherit an unrelated live session and mutates only after the operator choice', () => {
    const classify = step(router, 'STEP_1_CLASSIFY');
    assert.match(classify, /literal `\[SESSION\]` card already shown/);
    assert.match(classify, /unrelated, or relation cannot be proved.+do not mutate or silently\s+inherit/s);
    assert.match(classify, /ONE `AskUserQuestion` decision/);
    assert.match(classify, /`continue existing`.+`close-and-start-new/s);
    assert.match(classify, /While awaiting the answer return\s+`TerminalDecision: pause`/s);

    const askAt = classify.indexOf('ONE `AskUserQuestion` decision');
    const choiceAt = classify.indexOf('On `close-and-start-new`');
    const closeAt = classify.indexOf('npx gennady sdd-session close');
    const openAt = classify.indexOf(
      'npx gennady sdd-session open --intent <confirmed-intent> --scale <confirmed-scale>'
    );
    assert.ok(askAt >= 0 && choiceAt > askAt && closeAt > choiceAt && openAt > closeAt);
    assert.match(classify, /continue existing.+call neither close nor open/s);
    assert.match(classify, /owners? that does not consume SCALE uses exact scale-less sessionOpen/s);
    assert.match(classify, /npx gennady sdd-session open --intent <confirmed-intent><\/ToolCall>/);
    assert.match(classify, /storage-idempotent `already open` result as intent compatibility/);
    assert.match(classify, /Never call `--help`/);
  });

  it('documents storage idempotence without claiming semantic compatibility', () => {
    const help = read('cli', 'cmd', 'sdd-session', 'help.ts');
    assert.match(help, /storage-idempotent/);
    assert.match(help, /callers must compare its intent before reuse/);
    assert.doesNotMatch(help, /open is idempotent — an existing session file/);
  });

  it('asks SCALE only for authoring routes that consume it', () => {
    assert.match(
      session,
      /`project-setup`, `new-scope`, `evolve-scope`,\s+`module-decomposition`, and `multi-scope`.+root\/scope\/module\/infra\/interface/s
    );
    assert.match(
      session,
      /`execute`, `recover-from-code`, `scaffold`, `reconcile`, and `critic` consume no SCALE/s
    );
    const classify = step(router, 'STEP_1_CLASSIFY');
    assert.match(classify, /SCALE is consumed only by the authoring routes/);
    assert.match(classify, /forced `scaffold` \/ `reconcile` \/ `critic` do not consume\s+SCALE/s);
    assert.match(classify, /sdd-session open --intent <confirmed-intent><\/ToolCall>/);
    assert.doesNotMatch(classify, /For every other\s+intent.+forced `scaffold`/s);
  });
});
