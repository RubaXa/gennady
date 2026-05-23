// @file: Centralized access to prompt templates (agent, commit, review) from .md files.
// @consumers: commit-gen, create-providers, review-gen
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @purpose Centralized access to prompt templates (agent, commit, review) from .md files.
 * @invariant File names: agent/<name> → agent-{name}-prompt.md, commit → commit-{name}-prompt.md, review → review-{name}-prompt.md.
 * @sideEffect Filesystem: file read on each call.
 * @consumer CommitGen, ReviewGen, cmd/agent
 */
export const prompts = {
  /** @purpose Load agent prompt by name (e.g. 'keywords'). */
  agent: (name: string): string =>
    readFileSync(join(PROMPTS_DIR, 'agent', `agent-${name}-prompt.md`)).toString(),
  /** @purpose Load commit prompt by name ('message' | 'changeset'). */
  commit: (name: string): string =>
    readFileSync(join(PROMPTS_DIR, 'commit', `commit-${name}-prompt.md`)).toString(),
  /** @purpose Load review prompt by name (e.g. 'base'). */
  review: (name: string): string =>
    readFileSync(join(PROMPTS_DIR, 'review', `review-${name}-prompt.md`)).toString(),
};
