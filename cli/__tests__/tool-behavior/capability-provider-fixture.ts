// @file: Canonical upstream capability providers for phase-scoped black-box CLI fixtures.
// @consumers: tool-behavior tests that exercise gates after prerequisite resolution.
// @tasks: N/A

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** @purpose One real provider boundary a downstream CLI fixture depends on. */
export type CapabilityProviderFixture = {
  taskId: string;
  adapterId: string;
  capabilities: readonly string[];
  artifacts: Readonly<Record<string, string>>;
};

/** @purpose Default compiler provider required by the canonical TypeScript verification ladder. */
export const TYPESCRIPT_COMPILER_PROVIDER_FIXTURE: CapabilityProviderFixture = {
  taskId: 'FIXTURE-typescript-compiler',
  adapterId: 'typescript',
  capabilities: ['typescript.compiler'],
  artifacts: { 'tsconfig.json': '{}\n' },
};

function withDependencies(content: string, taskIds: readonly string[]): string {
  const dependencyLine = /^- \*\*Dependencies:\*\*\s*(.*)$/m;
  const existing = content
    .match(dependencyLine)?.[1]
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !['None', '—'].includes(item));
  const dependencies = [...new Set([...(existing ?? []), ...taskIds])];
  if (dependencyLine.test(content)) {
    return content.replace(dependencyLine, `- **Dependencies:** ${dependencies.join(', ')}`);
  }
  if (!/^- \*\*Status:\*\*/m.test(content)) {
    throw new Error('capability provider fixture requires a structured Meta Status field');
  }
  return content.replace(
    /^(- \*\*Status:\*\*.*)$/m,
    `$1\n- **Dependencies:** ${dependencies.join(', ')}`
  );
}

/**
 * @purpose Materialize exact DONE providers and order one consumer ticket after them.
 * @param root Fixture repository root.
 * @param consumerTicket Repo-relative structured task path.
 * @param providers Injectable platform providers; defaults to the TypeScript compiler boundary.
 */
export function installCapabilityProviderFixtures(
  root: string,
  consumerTicket: string,
  providers: readonly CapabilityProviderFixture[] = [TYPESCRIPT_COMPILER_PROVIDER_FIXTURE]
): void {
  const consumerPath = join(root, consumerTicket);
  writeFileSync(
    consumerPath,
    withDependencies(
      readFileSync(consumerPath, 'utf-8'),
      providers.map((provider) => provider.taskId)
    ),
    'utf-8'
  );

  const ticketPrefix = basename(consumerTicket).split('.task.')[0] ?? 'capability';
  for (const provider of providers) {
    for (const [artifact, content] of Object.entries(provider.artifacts)) {
      const artifactPath = join(root, artifact);
      mkdirSync(dirname(artifactPath), { recursive: true });
      if (!existsSync(artifactPath)) writeFileSync(artifactPath, content, 'utf-8');
    }
    const providerPath = join(dirname(consumerPath), `${ticketPrefix}.task.${provider.taskId}.md`);
    writeFileSync(
      providerPath,
      [
        '<!--SECTION:META-->',
        `- **Task-ID:** ${provider.taskId}`,
        '- **Status:** [x] DONE',
        '- **Dependencies:** None',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|---|---|---|---|',
        '| P1 | config | — | [x] |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        `- **Capability Adapter:** ${provider.adapterId}`,
        `- **Provides Capabilities:** ${provider.capabilities.join(', ')}`,
        '- **Target Files:**',
        ...Object.keys(provider.artifacts).map((artifact) => `  - ${artifact}`),
        '- **Deleted Files:**',
        '  - none',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:VERIFICATION-->',
        '<!--PHASE_RECEIPTS:v1-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| — | — | extra |',
        '<!--/SECTION:VERIFICATION-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '## Execution Log',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
      'utf-8'
    );
  }
}
