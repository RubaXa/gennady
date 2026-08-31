// @file: Regression guard for cross-directive decision, review, routing, session, and scaffold flow coherence.
// @consumers: build-directives, sdd router/critic/scaffold/execute
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('flow coherence contracts', () => {
  const critic = read('ai', 'kit', 'templates', 'sdd-v2', 'critic.directive.hbs');
  const goalGate = read('ai', 'kit', 'axiom', 'critic', 'ax-goal-owner-gate.xml');
  const lifecycle = read('ai', 'kit', 'templates', 'sdd-v2', 'review-lifecycle.directive.hbs');
  const lifecycleAxiom = read('ai', 'kit', 'axiom', 'spec', 'ax-spec-lifecycle.xml');
  const reviewVcs = read('ai', 'kit', 'axiom', 'process', 'ax-review-vcs-commands.xml');
  const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
  const scopeAuthoring = read('ai', 'kit', 'templates', 'sdd-v2', 'scope.directive.hbs');
  const moduleAuthoring = read('ai', 'kit', 'templates', 'sdd-v2', 'module.directive.hbs');
  const interfaceAuthoring = read('ai', 'kit', 'templates', 'sdd-v2', 'interface.directive.hbs');
  const infraAuthoring = read('ai', 'kit', 'templates', 'sdd-v2', 'infra.directive.hbs');
  const sessionReuse = read('ai', 'kit', 'axiom', 'process', 'ax-worker-session-reuse.xml');
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const router = read('ai', 'kit', 'templates', 'sdd-v2', 'router.directive.hbs');
  const routerSkill = read('ai', 'skills', 'sdd', 'SKILL.md');
  const executeSkill = read('ai', 'skills', 'sdd-execute', 'SKILL.md');
  const skillsReadme = read('ai', 'skills', 'README.md');
  const skillSpec = read('specs', 'ai-skills', 'sdd-skills', 'sdd-skills.spec.md');
  const reconcile = read('ai', 'kit', 'templates', 'sdd-v2', 'reconcile.directive.hbs');
  const dispatchViaBatch = read('ai', 'kit', 'axiom', 'process', 'ax-dispatch-via-batch.xml');
  const phaseExecution = read('ai', 'kit', 'templates', 'sdd-v2', 'phase-execution-protocol.directive.hbs');
  const bashPolicy = read('ai', 'kit', 'axiom', 'process', 'ax-permitted-bash-commands.xml');

  it('auto-resolves only a cited prior operator decision and asks once before every new GOAL edit', () => {
    const checkpoint = step(critic, 'STEP_3B_ROUND_CHECKPOINT');

    assert.match(goalGate, /sole no-Ask resolution.+operator accepted previously.+durable source/s);
    assert.match(goalGate, /Every other `GOAL` is new.+batched Ask before any related edit/s);
    assert.match(checkpoint, /previously accepted by the operator/);
    assert.match(checkpoint, /Decision Log id or exact prior\s+operator-decision record/);
    assert.match(checkpoint, /Every other `GOAL` is new.+enters the batch before any related edit/s);
    assert.doesNotMatch(checkpoint, /low-risk default that preserves\s+product intent is recorded and applied without Ask/s);
  });

  it('reviews final bytes and merges exactly the staged, pushed, externally reviewed commit', () => {
    assert.doesNotMatch(lifecycle, /ax-permitted-bash-commands|AX_PERMITTED_BASH_COMMANDS/);
    assert.ok(
      lifecycle.indexOf('axiom/process/ax-review-vcs-commands') <
        lifecycle.indexOf('git hash-object -- <publication-path>'),
      'review-owned VCS contract must load before the first git command'
    );
    assert.match(
      reviewVcs,
      /never use shell substitution, variables, pipes, loops, `echo`,\s+redirection, or `--help`/
    );
    assert.match(reviewVcs, /A ref literal is valid only when it uses ASCII letters.+`@\{`/s);
    assert.match(reviewVcs, /\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*/);

    const semanticAt = lifecycle.indexOf('<Step id="STEP_1_FINALIZE_SEMANTICS">');
    const approvalAt = lifecycle.indexOf('<Step id="STEP_1B_OPERATOR_APPROVAL">');
    const criticAt = lifecycle.indexOf('<Step id="STEP_2_INTERNAL_CRITIC">');
    const finalizeAt = lifecycle.indexOf('<Step id="STEP_2B_FREEZE_FINAL_BYTES">');
    const publishAt = lifecycle.indexOf('<Step id="STEP_3_PUBLISH_FINAL_BYTES">');
    const awaitAt = lifecycle.indexOf('<Step id="STEP_4_AWAIT">');
    const mergeAt = lifecycle.indexOf('<Step id="STEP_6_MERGE_REVIEWED_COMMIT">');
    assert.ok(
      semanticAt > 0 &&
        approvalAt > semanticAt &&
        criticAt > approvalAt &&
        finalizeAt > criticAt &&
        publishAt > finalizeAt &&
        awaitAt > publishAt &&
        mergeAt > awaitAt
    );

    const semantic = step(lifecycle, 'STEP_1_FINALIZE_SEMANTICS');
    const approval = step(lifecycle, 'STEP_1B_OPERATOR_APPROVAL');
    const integrated = step(lifecycle, 'STEP_2_INTERNAL_CRITIC');
    const finalize = step(lifecycle, 'STEP_2B_FREEZE_FINAL_BYTES');
    assert.match(semantic, /compress the ENTIRE Decision Log.+merge duplicate/s);
    assert.match(semantic, /preserve the section and its round numbering exactly/s);
    assert.match(approval, /only the delta from the last operator-approved authoring\s+packet/s);
    assert.match(integrated, /never resets the global count/s);
    assert.match(
      finalize,
      /rerun exact.+reviewReadiness and reviewPublication ToolCalls.+same target-set, write-set.+publication-state/s
    );
    assert.match(finalize, /remove.+`CHANGE_MANIFEST`.+Remove\s+`## Critic Rounds` LAST/s);
    assert.match(
      finalize,
      /git hash-object -- <publication-path>.+<publication-path> → <final-blob-id>/s
    );
    assert.match(lifecycle, /Auxiliary publication paths never enter critic\s+target\/write ownership/i);
    assert.match(lifecycle, /is not the critic target\/write-set/);

    const publish = step(lifecycle, 'STEP_3_PUBLISH_FINAL_BYTES');
    const sequence = [
      'git add -- <publication-files>',
      'git diff --cached --name-only',
      'git diff --exit-code -- <publication-files>',
      'git ls-files --stage -- <publication-files>',
      'git commit',
      'git rev-parse HEAD',
      'git push',
      'headRefOid',
    ].map((token) => publish.indexOf(token));
    assert.ok(sequence.every((at) => at >= 0), 'publish must contain every exact-byte step');
    assert.deepStrictEqual(sequence, [...sequence].sort((left, right) => left - right));
    assert.match(publish, /stage-0 row per publication path.+staged blob id.+<final-blob-id>/s);
    assert.match(publish, /copy its literal output.+`<reviewed-commit>` \(no shell assignment\)/s);
    const branchChecks = [...publish.matchAll(/git branch --show-current/g)].map(
      (match) => match.index
    );
    const addAt = publish.indexOf('git add -- <publication-files>');
    const commitAt = publish.indexOf('git commit -m');
    assert.ok(branchChecks.length >= 3, 'derive and recheck the branch before stage and commit');
    assert.ok(
      branchChecks.some((at) => at > publish.indexOf('Immediately before staging') && at < addAt),
      'wrong current branch must halt before staging'
    );
    assert.ok(
      branchChecks.some((at) => at > addAt && at < commitAt),
      'current branch must be rechecked before commit'
    );
    assert.match(publish, /H_CURRENT_BRANCH_MISMATCH.+before\s+any VCS mutation/s);
    assert.match(publish, /git commit -m "sdd\(<review-slug>\): publish specification"/);
    assert.match(
      publish,
      /gh pr list --head <head-branch> --base <base-branch> --state open --json number,url --limit 2/
    );
    assert.match(publish, /Empty → run exact.+gh pr create.+rerun the same head-plus-base list query/s);
    assert.match(publish, /One existing row.+validate\/freeze.+<pr-number>.+<pr-url>.+gh pr edit <pr-number>/s);
    assert.match(publish, /headRefOid=<reviewed-commit>.+baseRefName=<base-branch>/s);
    assert.match(
      reviewVcs,
      /gh pr create --base <base-branch> --head <head-branch> --title "SDD <review-slug>: publish specification" --body-file <pr-body-path>/
    );
    assert.match(
      reviewVcs,
      /gh pr edit <pr-number> --base <base-branch> --title "SDD <review-slug>: publish specification" --body-file <pr-body-path>/
    );
    assert.match(
      reviewVcs,
      /gh pr view <pr-number> --json number,url,headRefOid,baseRefName,state --jq/
    );

    const hostilePrBody = [
      '## Review',
      '`inline code` and ```fence```',
      '$(touch must-not-run)',
      '"double quoted" and \'single quoted\'',
    ].join('\n');
    const prMutationCommands = [
      ...reviewVcs.matchAll(/`(gh pr (?:create|edit)[^`\n]+)`/g),
    ].map((match) => match[1]!);
    assert.equal(prMutationCommands.length, 2);
    for (const command of prMutationCommands) {
      assert.match(command, /--body-file <pr-body-path>/);
      assert.doesNotMatch(command, /(?:^|\s)--body(?:\s|=)/);
      for (const hostileLine of hostilePrBody.split('\n')) {
        assert.ok(!command.includes(hostileLine), 'hostile body bytes must stay out of shell commands');
      }
    }
    const vcsProtocol = [lifecycle, reviewVcs].join('\n');
    assert.doesNotMatch(vcsProtocol, /\$\(|reviewed_commit\s*=|base_branch\s*=/);
    assert.doesNotMatch(vcsProtocol, /`echo\s/);
    assert.doesNotMatch(vcsProtocol, /&(?:gt|lt|amp);/);
    assert.doesNotMatch(vcsProtocol, /<commit-title>|<pr-title>|<pr-body>/);
    assert.doesNotMatch(vcsProtocol, /gh pr (?:view|edit|merge) --/);

    const merge = step(lifecycle, 'STEP_6_MERGE_REVIEWED_COMMIT');
    assert.match(merge, /gh pr view <pr-number>.+copy both literal outputs.+stored PR identity/s);
    assert.match(merge, /local HEAD and `headRefOid` to equal stored `<reviewed-commit>`/s);
    assert.match(merge, /gh pr merge <pr-number> --merge --match-head-commit <reviewed-commit>/);
    assert.doesNotMatch(merge, /gh pr merge --|--squash|--rebase/);
    assert.match(merge, /state=MERGED.+mergedAt.+mergeCommitOid.+baseRefName/s);
    assert.match(merge, /git fetch origin <base-branch>.+git merge-base --is-ancestor <reviewed-commit> FETCH_HEAD.+exit code 0/s);
    assert.match(reviewVcs, /gh pr view <pr-number> --json state,mergedAt,mergeCommit,baseRefName --jq/);
    assert.match(merge, /Do not edit, stage, commit,\s+or push between approval and merge/s);
    assert.match(
      lifecycleAxiom,
      /Publish exactly the role-validated\s+clean publication-set bytes.+same commit.+no semantic rewrite afterward/s
    );
    assert.match(
      lifecycleAxiom,
      /Critic target\/write ownership stays specs-only.+VCS publication-set.+other dirty path halts/s
    );

    for (const authoring of [moduleAuthoring, interfaceAuthoring, infraAuthoring]) {
      assert.match(
        authoring,
        /finalize\/compress semantics →.+Approval.+integrated critic → publish the\s+exact final bytes → external approval → merge the same reviewed commit/s
      );
      assert.doesNotMatch(authoring, /external review → compress \+ merge/);
    }
  });

  it('keeps routing inventory solely in the loaded router LOGIC_SWITCH', () => {
    assert.match(routerSkill, /loaded router directive's exact `LOGIC_SWITCH`/);
    assert.match(routerSkill, /keeps no closed route inventory/);
    assert.match(routerSkill, /execute and\s+chained multi-scope outcomes/);
    assert.doesNotMatch(routerSkill, /root \/ recover-from-code \/ scope \/ infra \/ interface \/ module/);
    assert.doesNotMatch(routerSkill, /project portal \/ scope \/ infra \/ interface/);
    assert.match(router, /WHEN intent = execute/);
    assert.match(router, /WHEN intent = multi-scope/);
    assert.match(skillSpec, /SKILL не хранит закрытый список веток/);
  });

  it('consumes one initial snapshot and reuses only the migration branch post-state', () => {
    const state = step(router, 'STEP_0_STATE');
    const classify = step(router, 'STEP_1_CLASSIFY');
    const preflight = step(router, 'STEP_1B_PREFLIGHT');

    assert.equal(routerSkill.match(/npx gennady sdd-state/g)?.length, 1);
    assert.match(
      routerSkill,
      /<ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state<\/ToolCall>/
    );
    assert.match(routerSkill, /only initial state call.+exact `routerState` bytes/s);
    assert.match(state, /Consume exact result alias `routerState`/);
    assert.match(state, /router does\s+not own or repeat that initial `sdd-state` call/s);
    assert.doesNotMatch(router, /<ToolCall\b[^>]*>npx gennady sdd-state<\/ToolCall>/);
    assert.ok(
      router.indexOf('<Step id="STEP_1_CLASSIFY">') <
        router.indexOf('<Step id="STEP_1B_PREFLIGHT">')
    );
    assert.match(classify, /Set `activeRouterState = routerState`/);
    assert.doesNotMatch(preflight, /readinessState|readiness arm/);
    assert.match(preflight, /activeRouterState = migrationState/);
    assert.match(preflight, /Do not run a router refresh after that return/);
  });

  it('keeps execute loader thin for both one ticket and batch', () => {
    const embody = step(executeSkill, 'EMBODY');

    assert.match(executeSkill, /single SDD router with forced intent `execute`/);
    assert.match(embody, /pass the operator payload unchanged/i);
    assert.match(embody, /`next` \/ `pick` \/ `batch` \/ `all` \/ `queue`/);
    assert.match(embody, /canonical `STEP_0_RESOLVE` as the first task-lifecycle call/);
    assert.doesNotMatch(embody, /sdd-task <id>/);
    assert.match(executeSkill, /ai\/directives\/sdd-v2\/router\.directive\.xml/);
    assert.doesNotMatch(executeSkill, /ai\/directives\/sdd-v2\/execute\.directive\.xml/);
  });

  it('documents the real skill happy-path and exact verifier command', () => {
    assert.doesNotMatch(skillsReadme, /`sdd scan`/);
    assert.match(skillsReadme, /`npx gennady sdd-check --all \[project-root\]`/);
    assert.match(skillsReadme, /integrated review scope \+ всех module specs/);
    assert.match(skillsReadme, /scaffold feasibility critic \+ Gate 2/);
    assert.match(skillsReadme, /automatic `sdd-execute` в той же сессии/);
    assert.match(skillsReadme, /Отдельный `@sdd-critic` — on-demand проверка/);
    assert.match(
      skillsReadme,
      /одновременно не пересекаются Target Files и различаются next-worker session keys `\(spec, kind\)`/
    );
  });

  it('routes module decomposition only from the canonical review-state handoff or existing master', () => {
    const scopeFinalize = step(scopeAuthoring, 'STEP_9_FINAL_SPEC');
    const moduleIntake = step(moduleAuthoring, 'STEP_0_INTAKE');
    const moduleWrite = step(moduleAuthoring, 'STEP_6_FINAL_HIERARCHY');

    assert.match(scopeFinalize, /final Approval Check is accepted.+sdd-session workset --content-file \.claude\/tmp\/sdd-scope-workset\.txt/s);
    assert.match(router, /valid `CHANGE_MANIFEST` plus the exact `\[SESSION\]` working-set entry.+operator-approved review-state draft/s);
    assert.match(router, /no `CHANGE_MANIFEST`.+exact `\[SCOPES\]` row's `status` column is `done` \(master\)/s);
    assert.match(router, /neither exact state above holds\s+-> halt `H_SCOPE_DRAFT_NOT_OPERATOR_APPROVED`/s);
    assert.match(moduleIntake, /valid `CHANGE_MANIFEST`.+exact `\[SESSION\]` operator-approved review-state draft entry/s);
    assert.match(moduleIntake, /no `CHANGE_MANIFEST`.+exact master `\[SCOPES\]` row whose `status` column is `done`/s);
    assert.match(moduleIntake, /Any other draft\/clean state →\s+`H_SCOPE_DRAFT_NOT_OPERATOR_APPROVED`/s);
    assert.match(router, /scope-type = infrastructure\s+-> READ_AND_USE_DIRECTIVE\("ai\/directives\/sdd-v2\/infra\.directive\.xml"\)/s);
    assert.match(moduleAuthoring, /scope-type = infrastructure or interface — module-decomposition not applicable/);
    assert.match(moduleWrite, /integrated review target-set is the parent scope spec plus\s+ALL module specs in that scope after decomposition/s);
  });

  it('parallelizes only disjoint files with distinct worker session keys', () => {
    const dispatch = step(execute, 'STEP_2_DISPATCH');
    assert.match(execute, /Parallel dispatch requires BOTH disjoint Target-File sets.+different next-worker session keys `\(spec, kind\)`/s);
    assert.match(execute, /same session key even with disjoint files, serializes/);
    assert.match(dispatch, /same `\(spec, kind\)` key ⇒ serial reuse even when Target Files are\s+disjoint; parallel requires both disjoint Target Files AND distinct keys/s);
    assert.match(sessionReuse, /Target Files are disjoint AND their next\s+worker session keys `\(spec, kind\)` are different/);
    assert.match(sessionReuse, /dispatches sharing it serialize even when their Target Files are disjoint/);
  });

  it('defines worker isolation as a bounded role activation compatible with session reuse', () => {
    assert.match(execute, /isolated,\s*role-bounded context/s);
    assert.match(execute, /Isolation does not require a fresh session/);
    assert.match(execute, /same `\(spec, kind\)` worker session is reused/);
    assert.doesNotMatch(execute, /fresh isolated context/);
  });

  it('keeps ordinary execute per-group review as the sole reconcile audit tail', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    const verify = step(reconcile, 'STEP_6_VERIFY');

    assert.doesNotMatch([dispatchViaBatch, reconcile].join('\n'), /skip-audit/);
    assert.doesNotMatch(
      [dispatchViaBatch, verify].join('\n'),
      /reconciled set|multi-spec mode|aggregate audit|synthetic combined target/
    );
    assert.match(dispatchViaBatch, /ordinary `sdd-task --audit-group` lifecycle unchanged/);
    assert.match(dispatchViaBatch, /execute remains the sole owner.+audit and code-review/s);
    assert.match(apply, /execute owns phase work, tracker sync, audit, and code-review/);
    assert.match(verify, /ordinary execute's per-ticket sync and phase\s+gates/s);
    assert.match(verify, /Missing group evidence returns to ordinary execute for that group/);
    assert.doesNotMatch(verify, /READ_AND_USE_DIRECTIVE\("ai\/directives\/sdd-v2\/(?:audit|code-review)\.directive\.xml"\)/);
  });

  it('orders reconcile semantic authoring and review before scaffold or execute', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    const semantic =
      apply.match(/WHEN \*\*semantic-spec-update\*\*([\s\S]*?)- WHEN \*\*bounded-direct\*\*/)?.[1] ??
      '';
    const reviewAt = semantic.indexOf('review-lifecycle.directive.xml');
    const mergedAt = semantic.indexOf('publication=MERGED');

    assert.ok(reviewAt >= 0 && mergedAt > reviewAt);
    assert.ok(semantic.indexOf('scaffold.directive.xml') > mergedAt);
    assert.ok(semantic.indexOf('hand ordinary execute') > mergedAt);
    assert.match(semantic, /Only AFTER that proof may implementation move/);
  });

  it('permits only exact bootstrap dependency commands and forbids them for every other phase', () => {
    const executePhase = step(phaseExecution, 'STEP_4_EXECUTE');

    for (const command of ['engines', 'version', 'dist-tags']) {
      assert.match(bashPolicy, new RegExp(`npm view <pkg> ${command}`));
      assert.match(executePhase, new RegExp(`npm view <pkg> ${command}`));
    }
    for (const text of [bashPolicy, executePhase]) {
      assert.match(text, /phase (?:kind )?is `bootstrap`.+Objective names\s+adding that dependency.+Target Files contain `package\.json` plus the active npm lock file/s);
      assert.match(text, /npm install\s+--save-dev --save-exact <pkg>@<verified-stable-version>/s);
      assert.match(text, /npm add --save-dev --save-exact\s+<pkg>@<verified-stable-version>/s);
      assert.match(text, /npm install <pkg>@<verified-stable-version>/);
      assert.match(text, /npm add <pkg>@<verified-stable-version>/);
      assert.match(text, /Non-bootstrap phases|non-bootstrap phases.+forbidden/s);
    }
    assert.match(bashPolicy, /No other npm\/network command, option, tag, unversioned\s+package, or multi-package install is permitted/s);
    assert.match(executePhase, /no `--help` or other probe is needed/);
  });

  it('keeps STEP_3 automatic and resolves coverage alternatives in the single Gate 2 card', () => {
    const generation = step(scaffold, 'STEP_3_TASK_GENERATION');
    const ticketLoop = step(scaffold, 'STEP_3_TICKET_LOOP');
    const gate = step(scaffold, 'STEP_4_TEST_PLAN_REVIEW');

    assert.match(generation, /Pass only the ordered node identities plus shared facts/);
    assert.match(generation, /create no\s+ticket content, files, or indexes here/);
    assert.doesNotMatch(generation, /\bAsk(?:UserQuestion)?\b/);
    assert.match(generation, /exact alternatives for Gate 2, never prompt here/);
    assert.match(generation, /toolchain alternatives go to Gate 2.+never a separate prompt/s);
    assert.match(ticketLoop, /Materialize and validate exactly one prepared ticket at a time\. \(auto\)/);
    assert.match(ticketLoop, /Select only the next unprocessed STEP_2 node/);
    assert.match(ticketLoop, /result="authoringGate"/);
    assert.match(ticketLoop, /Green: only then may the next node's content be formed/);
    assert.doesNotMatch(ticketLoop, /\bAsk(?:UserQuestion)?\b/);
    assert.match(gate, /STEP_3 coverage-owner\/toolchain\/e2e alternative/);
    assert.match(gate, /SAME card;\s+its one approval resolves all/s);
  });

  it('materializes Gate 2 choices before the retained-state delta feasibility recheck and finalize', () => {
    const feasibility = step(scaffold, 'STEP_3B_FEASIBILITY_CRITIC');
    const gate = step(scaffold, 'STEP_4_TEST_PLAN_REVIEW');
    const finalizeAt = scaffold.indexOf('<Step id="STEP_5_FINALIZE">');
    const materializeAt = scaffold.indexOf('On approval, apply each newly selected coverage owner');
    const recheckAt = scaffold.indexOf("use STEP_3B's exact dispatch/fallback transition");

    assert.match(feasibility, /Persist and fold one explicit `FeasibilityState` through Gate 2/);
    assert.match(feasibility, /only that live same-session\s+path may send just `ChangedTickets`/s);
    assert.match(feasibility, /Increment `ResultCount`.+sensor-result.+evaluate `ResultCount >= ActiveCap`.+BEFORE GOAL, Ask, CLEAN/s);
    assert.ok(materializeAt > 0 && recheckAt > materializeAt && finalizeAt > recheckAt);
    assert.match(gate, /apply each newly selected coverage owner, verification toolchain, and e2e inclusion or\s+explicit waiver directly to the already-generated tickets whose bytes change/s);
    assert.match(gate, /Do not regenerate the DAG, rerun STEP_3 for all tickets/);
    assert.match(gate, /below-cap, no-change CLEAN over the latest bytes continues to STEP_5/);
    assert.match(gate, /ordinary\s+structural corrections autonomously.+same\s+cumulative budget/s);
    assert.match(gate, /one delta-only\s+Gate 2 decision card containing only `PendingGate2Delta`/s);
    assert.match(gate, /continuation of Gate 2, not another standing gate/);
  });
});
