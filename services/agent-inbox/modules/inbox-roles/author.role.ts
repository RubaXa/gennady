// @file: AuthorRole — role graph v1: fetch → gate → summary → ask → effect(react/reply) → done.
// @consumers: RoleEngine, role-engine.test.ts, author.role.test.ts
// @tasks: TSK-113

import type { RoleDefinition, RoleGraph, NodeContext, GateResult } from './role-node.ts';

/**
 * @purpose Author role graph: fetch discussions → classify → summarize with tasks
 * → operator confirmation → react/reply. Topology: fetch→classify→summary→ask→react→done
 */
const authorGraph: RoleGraph = {
  nodes: [
    {
      kind: 'session',
      id: 'node_fetch',
      prompt(ctx: NodeContext) {
        return {
          system:
            'You are an MR author assistant. Fetch and analyze discussions on this merge request.',
          text: `Fetch discussions for MR: ${ctx.mr.webUrl}. Title: ${ctx.mr.title}. Author: ${ctx.mr.author}.`,
        };
      },
      dir(ctx: NodeContext) {
        return `/tmp/gennady/author-fetch/${ctx.mr.project.replace(/\//g, '-')}-${ctx.mr.iid}`;
      },
      resultSchema: {
        title: 'node_fetch',
        type: 'object',
        properties: {
          discussions: { type: 'array' },
          totalCount: { type: 'number' },
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
      id: 'gate_classify',
      verify(ctx: NodeContext): GateResult {
        const fetched = ctx.artifacts['node_fetch'] as Record<string, unknown> | undefined;
        if (!fetched) {
          return { pass: false, reason: 'No fetch output found in artifacts' };
        }
        const totalCount = fetched.totalCount as number | undefined;
        if (typeof totalCount !== 'number' || totalCount < 0) {
          return { pass: false, reason: 'Discussion count is invalid' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'session',
      id: 'node_summary',
      prompt(ctx: NodeContext) {
        const fetched = (ctx.artifacts['node_fetch'] as Record<string, unknown>) ?? {};
        return {
          system:
            'You are an MR author assistant. Summarize reviewer comments and generate action tasks.',
          text: `Summarize discussions: ${JSON.stringify(fetched)}`,
        };
      },
      dir(ctx: NodeContext) {
        return `/tmp/gennady/author-summary/${ctx.mr.project.replace(/\//g, '-')}-${ctx.mr.iid}`;
      },
      resultSchema: {
        title: 'node_summary',
        type: 'object',
        properties: {
          summary: { type: 'string' },
          tasks: { type: 'array' },
          drafts: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 45000,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'ask',
      id: 'node_ask',
      question(ctx: NodeContext) {
        const summary = (ctx.artifacts['node_summary'] as Record<string, unknown>) ?? {};
        const summaryText = (summary.summary as string) ?? 'No summary generated';
        return {
          title: 'Post Reaction?',
          body: `Summary for MR ${ctx.mr.webUrl}: ${summaryText}`,
          choices: ['react', 'reply', 'skip'],
        };
      },
    },
    {
      kind: 'effect',
      id: 'node_react',
      async run(ctx: NodeContext) {
        // In production, this would call vcs.react() or vcs.reply()
        // For now, this is a sentinel effect to be implemented by VCS adapter
        void ctx;
      },
    },
  ],
  edges: [
    { from: 'node_fetch', to: 'gate_classify', on: 'ok' },
    { from: 'gate_classify', to: 'node_summary', on: 'pass' },
    { from: 'gate_classify', to: 'node_fetch', on: 'fail' },
    { from: 'node_summary', to: 'node_ask', on: 'ok' },
    { from: 'node_ask', to: 'node_react', on: 'ok' },
    { from: 'node_react', to: 'done', on: 'ok' },
  ],
};

/**
 * @purpose Author role definition — loaded by RoleEngine.
 * @consumer RoleEngine.loadAll()
 */
export const AuthorRole: RoleDefinition = {
  name: 'author',
  description:
    'MR author: fetch discussions → classify → summary + tasks + drafts → ask → react/reply',
  graph: authorGraph,
};
