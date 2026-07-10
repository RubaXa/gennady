// @file: ReviewerRole — role graph v1: scaffold → gate → enrich → gate → fan-out sessions → gate → synthesize → ask → effect(post) → done.
// @consumers: RoleEngine, role-engine.test.ts, reviewer.role.test.ts
// @tasks: TSK-113

import type { RoleDefinition, RoleGraph, NodeContext, GateResult } from './role-node.ts';

/**
 * @purpose Reviewer graph for D57/D70 pipeline: scaffold, gate, enrich,
 * gate, sessions, gate, synthesize, ask, post, done
 */
const reviewerGraph: RoleGraph = {
  nodes: [
    {
      kind: 'session',
      id: 'node_scaffold',
      prompt(ctx: NodeContext) {
        return {
          system: 'You are a code reviewer. Analyze the MR and produce a scaffold of findings.',
          text: `Review MR: ${ctx.mr.webUrl}. Title: ${ctx.mr.title}. Description: ${ctx.mr.description}`,
        };
      },
      dir(ctx: NodeContext) {
        return `/tmp/gennady/scaffold/${ctx.mr.project.replace(/\//g, '-')}-${ctx.mr.iid}`;
      },
      resultSchema: {
        title: 'node_scaffold',
        type: 'object',
        properties: {
          findings: { type: 'array' },
          summary: { type: 'string' },
        },
      },
      policy: {
        promptTimeout: 30000,
        continueMax: 3,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_scaffolded',
      verify(ctx: NodeContext): GateResult {
        const scaffold = ctx.artifacts['node_scaffold'] as Record<string, unknown> | undefined;
        if (!scaffold) {
          return { pass: false, reason: 'No scaffold output found in artifacts' };
        }
        const findings = scaffold.findings as unknown[];
        if (!Array.isArray(findings) || findings.length === 0) {
          return { pass: false, reason: 'Scaffold findings array is empty or missing' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'session',
      id: 'node_enrich',
      prompt(ctx: NodeContext) {
        const scaffold = (ctx.artifacts['node_scaffold'] as Record<string, unknown>) ?? {};
        return {
          system: 'You are a code reviewer. Enrich the scaffold findings with deeper analysis.',
          text: `Enrich these findings: ${JSON.stringify(scaffold)}`,
        };
      },
      dir(ctx: NodeContext) {
        return `/tmp/gennady/enrich/${ctx.mr.project.replace(/\//g, '-')}-${ctx.mr.iid}`;
      },
      resultSchema: {
        title: 'node_enrich',
        type: 'object',
        properties: {
          enrichedFindings: { type: 'array' },
          coverage: { type: 'string' },
        },
      },
      policy: {
        promptTimeout: 60000,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_enriched',
      verify(ctx: NodeContext): GateResult {
        const enriched = ctx.artifacts['node_enrich'] as Record<string, unknown> | undefined;
        if (!enriched) {
          return { pass: false, reason: 'No enriched output found in artifacts' };
        }
        const findings = enriched.enrichedFindings as unknown[];
        if (!Array.isArray(findings) || findings.length === 0) {
          return { pass: false, reason: 'Enriched findings array is empty or missing' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'session',
      id: 'node_sessions',
      prompt(ctx: NodeContext) {
        const enriched = (ctx.artifacts['node_enrich'] as Record<string, unknown>) ?? {};
        return {
          system: 'You are a code reviewer. Track and analyze individual discussion sessions.',
          text: `Track sessions for: ${JSON.stringify(enriched)}`,
        };
      },
      dir(ctx: NodeContext) {
        return `/tmp/gennady/sessions/${ctx.mr.project.replace(/\//g, '-')}-${ctx.mr.iid}`;
      },
      resultSchema: {
        title: 'node_sessions',
        type: 'object',
        properties: {
          sessions: { type: 'array' },
          trackedCount: { type: 'number' },
        },
      },
      policy: {
        promptTimeout: 45000,
        continueMax: 3,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_sessions',
      verify(ctx: NodeContext): GateResult {
        const sessions = ctx.artifacts['node_sessions'] as Record<string, unknown> | undefined;
        if (!sessions) {
          return { pass: false, reason: 'No sessions output found in artifacts' };
        }
        const trackedCount = sessions.trackedCount as number | undefined;
        if (typeof trackedCount !== 'number' || trackedCount < 0) {
          return { pass: false, reason: 'Tracked count is invalid' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'session',
      id: 'node_synthesize',
      prompt(ctx: NodeContext) {
        const scaffold = (ctx.artifacts['node_scaffold'] as Record<string, unknown>) ?? {};
        const enriched = (ctx.artifacts['node_enrich'] as Record<string, unknown>) ?? {};
        const sessions = (ctx.artifacts['node_sessions'] as Record<string, unknown>) ?? {};
        return {
          system: 'You are a code reviewer. Synthesize all findings into a final review report.',
          text: `Synthesize: scaffold=${JSON.stringify(scaffold)}, enriched=${JSON.stringify(enriched)}, sessions=${JSON.stringify(sessions)}`,
        };
      },
      dir(ctx: NodeContext) {
        return `/tmp/gennady/synthesize/${ctx.mr.project.replace(/\//g, '-')}-${ctx.mr.iid}`;
      },
      resultSchema: {
        title: 'node_synthesize',
        type: 'object',
        properties: {
          reviewReport: { type: 'object' },
          recommendations: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 60000,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'ask',
      id: 'node_ask',
      question(ctx: NodeContext) {
        const synthesize = (ctx.artifacts['node_synthesize'] as Record<string, unknown>) ?? {};
        const report = (synthesize.reviewReport as Record<string, unknown>) ?? {};
        return {
          title: 'Review Complete — Post Findings?',
          body: `Review is ready for MR ${ctx.mr.webUrl}. ${JSON.stringify(report)}`,
          choices: ['post', 'edit', 'skip'],
        };
      },
    },
    {
      kind: 'effect',
      id: 'node_post',
      async run(ctx: NodeContext) {
        // In production, this would call vcs.postComment() or vcs.approve()
        // For now, this is a sentinel effect to be implemented by VCS adapter
        void ctx;
      },
    },
  ],
  edges: [
    { from: 'node_scaffold', to: 'gate_scaffolded', on: 'ok' },
    { from: 'gate_scaffolded', to: 'node_enrich', on: 'pass' },
    { from: 'gate_scaffolded', to: 'node_scaffold', on: 'fail' },
    { from: 'node_enrich', to: 'gate_enriched', on: 'ok' },
    { from: 'gate_enriched', to: 'node_sessions', on: 'pass' },
    { from: 'gate_enriched', to: 'node_enrich', on: 'fail' },
    { from: 'node_sessions', to: 'gate_sessions', on: 'ok' },
    { from: 'gate_sessions', to: 'node_synthesize', on: 'pass' },
    { from: 'gate_sessions', to: 'node_sessions', on: 'fail' },
    { from: 'node_synthesize', to: 'node_ask', on: 'ok' },
    { from: 'node_ask', to: 'node_post', on: 'ok' },
    { from: 'node_post', to: 'done', on: 'ok' },
  ],
};

/**
 * @purpose Reviewer role definition — loaded by RoleEngine.
 * @consumer RoleEngine.loadAll()
 */
export const ReviewerRole: RoleDefinition = {
  name: 'reviewer',
  description: 'Code reviewer: scaffold → validate → enrich → sessions → synthesize → ask → post',
  graph: reviewerGraph,
};
