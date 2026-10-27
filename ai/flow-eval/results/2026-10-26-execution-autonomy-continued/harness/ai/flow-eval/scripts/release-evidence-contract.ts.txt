// @file: Shared REL-18 evidence-pack contract used by both the collector and the independent
//   integrity checker: exact release commands, deterministic migration ordering and no-op verdict.
// @spec: AI-SKILLS
// @consumers: release-evidence-pack.ts; release-evidence-pack-check.ts

export type ReleaseEvidenceCommand = {
  id: string;
  command: string;
  args: readonly string[];
  migrationScope?: string;
  migrationRound?: 1 | 2;
  scenario?: ReleaseEvidenceScenario;
};

export type ReleaseEvidenceScenario = {
  area: 'node' | 'golang' | 'swift-local' | 'remote' | 'remote-live' | 'rules' | 'sdd-evidence';
  acceptance: readonly ('U-A2' | 'U-A6' | 'U-A7' | 'U-A9')[];
  fixturePaths: readonly string[];
  requiredOutput: readonly string[];
  externalIdentity?: {
    provider: 'github';
    project: string;
    sourceSha: string;
    definitionId: string;
    pipelineId: string;
    terminalState: 'REMOTE_SUCCESS';
    jobs: number;
    successfulJobs: number;
  };
};

export type ReleaseEvidenceFixture = {
  path: string;
  sha256: string;
};

export type ReleaseEvidenceResult = {
  id: string;
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  logFile: string;
  sha256: string;
  scenario?: {
    area: ReleaseEvidenceScenario['area'];
    acceptance: ReleaseEvidenceScenario['acceptance'];
    fixtures: ReleaseEvidenceFixture[];
    requiredOutput: ReleaseEvidenceScenario['requiredOutput'];
    externalIdentity?: ReleaseEvidenceScenario['externalIdentity'];
  };
};

export type ReleaseEvidenceManifest = {
  schema: 'gennady.rc-evidence-pack.v2';
  sourceCommit: string;
  generatedAt: string;
  cleanBefore: true;
  cleanAfter: true;
  environment: {
    platform: NodeJS.Platform;
    arch: string;
    node: string;
    nodeExecutable: string;
    npm: string;
    packageLockSha256: string;
  };
  commands: ReleaseEvidenceResult[];
  migration: {
    scopes: string[];
    rounds: 2;
    allNoOp: true;
  };
  limitations: {
    exactCloudIosE18: 'pending-UV-26';
    packagePublished: false;
  };
};

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function migrationScopeIdentityFinding(
  claimed: readonly string[],
  source: readonly string[]
): string | null {
  const normalizedClaim = [...claimed].sort(codePointCompare);
  const uniqueClaim = [...new Set(normalizedClaim)];
  if (
    uniqueClaim.length !== claimed.length ||
    claimed.some((scope, index) => scope !== normalizedClaim[index])
  ) {
    return 'migration scopes должны быть уникальны и отсортированы code-point order';
  }
  return claimed.length === source.length &&
    claimed.every((scope, index) => scope === source[index])
    ? null
    : `migration scopes не совпадают с source tree: claimed=[${claimed.join(', ')}], ` +
        `source=[${source.join(', ')}]`;
}

export function releaseEvidenceCommandPlan(scopes: readonly string[]): ReleaseEvidenceCommand[] {
  const gates: ReleaseEvidenceCommand[] = [
    { id: 'type-check', command: 'npm', args: ['run', 'type-check'] },
    { id: 'format-check', command: 'npm', args: ['run', 'format'] },
    { id: 'lint', command: 'npm', args: ['run', 'lint'] },
    { id: 'audit-sdd-templates', command: 'npm', args: ['run', 'audit:sdd-templates'] },
    { id: 'build', command: 'npm', args: ['run', 'build'] },
    { id: 'test', command: 'npm', args: ['test'] },
  ];
  const scenarios: ReleaseEvidenceCommand[] = [
    {
      id: 'uv25-node',
      command: 'node',
      args: ['--import', 'tsx', '--test', 'plugins/node/__tests__/node-target.test.ts'],
      scenario: {
        area: 'node',
        acceptance: ['U-A2', 'U-A9'],
        fixturePaths: [
          'plugins/node/__tests__/node-target.test.ts',
          'plugins/node/__tests__/fixtures/zero-yaml/package.json',
          'plugins/node/__tests__/fixtures/zero-yaml/src/a.ts',
          'plugins/node/__tests__/fixtures/zero-yaml/src/b.ts',
        ],
        requiredOutput: [
          'uses one zero-YAML DAG for code, unit and coverage slices',
          'blocks only integration/full when test:integration is absent',
          'materializes strict Vitest JSON stats only from proven package facts',
        ],
      },
    },
    {
      id: 'uv25-golang',
      command: 'node',
      args: ['--import', 'tsx', '--test', 'plugins/golang/__tests__/golang-target.test.ts'],
      scenario: {
        area: 'golang',
        acceptance: ['U-A2'],
        fixturePaths: [
          'plugins/golang/__tests__/golang-target.test.ts',
          'plugins/golang/__tests__/fixtures/zero-yaml/go.mod',
          'plugins/golang/__tests__/fixtures/zero-yaml/main.go',
        ],
        requiredOutput: [
          'uses one zero-YAML DAG for READY code and unit slices with direct argv',
          'leaves project-owned integration and coverage commandless and blocks only selected slices',
          'accepts explicit read-only integration and coverage argv without inventing tags or thresholds',
        ],
      },
    },
    {
      id: 'uv25-swift-local',
      command: 'node',
      args: ['--import', 'tsx', '--test', 'plugins/swift/__tests__/swift-target.test.ts'],
      scenario: {
        area: 'swift-local',
        acceptance: ['U-A2'],
        fixturePaths: [
          'plugins/swift/__tests__/swift-target.test.ts',
          'plugins/swift/__tests__/fixtures/zero-yaml/Package.swift',
          'plugins/swift/__tests__/fixtures/zero-yaml/Sources/ZeroYaml/main.swift',
        ],
        requiredOutput: [
          'uses root SwiftPM zero-YAML defaults in one dependency-closed DAG',
          'keeps Xcode build/test commandless and selected readiness BLOCKED without identity',
          'accepts explicit read-only integration/coverage commands with target provenance',
        ],
      },
    },
    {
      id: 'uv25-remote',
      command: 'node',
      args: [
        '--import',
        'tsx',
        '--test',
        'shared/verify/execution/__tests__/remote-watcher.test.ts',
        'services/vcs-client/__tests__/pipeline-observation.test.ts',
      ],
      scenario: {
        area: 'remote',
        acceptance: ['U-A6'],
        fixturePaths: [
          'shared/verify/execution/__tests__/remote-watcher.test.ts',
          'services/vcs-client/__tests__/pipeline-observation.test.ts',
        ],
        requiredOutput: [
          'proves pushed SHA, pins one exact pipeline id, and never returns to latest lookup',
          'fails closed when exact SHA discovery contains distinct workflow definitions',
          'GitLab queries only the exact SHA then observes the pinned numeric id',
          'GitHub queries head_sha and pins one workflow run id',
        ],
      },
    },
    {
      id: 'uv25-remote-live',
      command: 'node',
      args: ['--import', 'tsx', 'ai/flow-eval/scripts/release-remote-live-smoke.ts'],
      scenario: {
        area: 'remote-live',
        acceptance: ['U-A6'],
        fixturePaths: [
          'ai/flow-eval/scripts/release-remote-live-smoke.ts',
          'services/vcs-client/github/vcs-github-client.ts',
          'services/vcs-client/github/vcs-github-pipeline.ts',
          'shared/verify/execution/remote-watcher.ts',
        ],
        requiredOutput: [
          'UV25_REMOTE_LIVE provider=github project=sindresorhus/p-map readOnly=true',
          'UV25_REMOTE_LIVE exactSha=2c0934b8312b637f933b752c6054845c2d2d5533',
          'UV25_REMOTE_LIVE definitionId=4634269 pipelineId=36383812626 state=REMOTE_SUCCESS jobs=5 successfulJobs=5',
          'UV25_REMOTE_LIVE mutations=0 secretOutput=0 logBodies=0',
        ],
        externalIdentity: {
          provider: 'github',
          project: 'sindresorhus/p-map',
          sourceSha: '2c0934b8312b637f933b752c6054845c2d2d5533',
          definitionId: '4634269',
          pipelineId: '36383812626',
          terminalState: 'REMOTE_SUCCESS',
          jobs: 5,
          successfulJobs: 5,
        },
      },
    },
    {
      id: 'uv25-rules',
      command: 'node',
      args: [
        '--import',
        'tsx',
        '--test',
        'cli/__tests__/tool-behavior/rules.test.ts',
        'shared/rules/__tests__/rule-resolver.test.ts',
        'shared/rules/__tests__/rule-snapshot.test.ts',
        'shared/rules/__tests__/rule-migration-equivalence.test.ts',
      ],
      scenario: {
        area: 'rules',
        acceptance: ['U-A7'],
        fixturePaths: [
          'cli/__tests__/tool-behavior/rules.test.ts',
          'shared/rules/__tests__/rule-resolver.test.ts',
          'shared/rules/__tests__/rule-snapshot.test.ts',
          'shared/rules/__tests__/rule-migration-equivalence.test.ts',
          'shared/rules/__tests__/fixtures/rule-migration-equivalence.json',
          'ai/directives/coding/typescript-rules.xml',
        ],
        requiredOutput: [
          'lists the complete deterministic inventory and rejects stale stack/phase filters',
          'resolves exact/glob files with the same real snapshot digest as SDD dispatch and Verify',
          'evaluates When clauses as OR, attributes as same-artifact AND, and comma values as OR',
          'preserves every old entry body, predicate intent, dependency and source exactly once',
        ],
      },
    },
    {
      id: 'uv25-sdd-evidence',
      command: 'node',
      args: [
        '--import',
        'tsx',
        '--test',
        'shared/sdd/verify/__tests__/sdd-attempt-journal.test.ts',
        'cli/cmd/sdd-verify/__tests__/sdd-verify.facade.test.ts',
      ],
      scenario: {
        area: 'sdd-evidence',
        acceptance: ['U-A9'],
        fixturePaths: [
          'shared/sdd/verify/__tests__/sdd-attempt-journal.test.ts',
          'cli/cmd/sdd-verify/__tests__/sdd-verify.facade.test.ts',
        ],
        requiredOutput: [
          'retains failed attempts after retry and blocks a live concurrent owner',
          'recovers only an ownerless RUNNING attempt as INTERRUPTED before appending the next run',
          'persists remote-required BLOCKED, rejects local PASS, and accepts exact-SHA provider proof',
        ],
      },
    },
  ];
  const migration = ([1, 2] as const).flatMap((round) =>
    [...scopes].sort(codePointCompare).map((scope) => ({
      id: `migration-${round}-${scope}`,
      command: 'node',
      args: ['--import', 'tsx', 'cli/gennady.ts', 'sdd-migrate', 'move', '.', '--scope', scope],
      migrationScope: scope,
      migrationRound: round,
    }))
  );
  return [...gates, ...scenarios, ...migration];
}

export function validateReleaseEvidenceResult(
  command: ReleaseEvidenceCommand,
  exitCode: number | null,
  output: string
): string | null {
  if (exitCode !== 0) {
    return `${command.id}: команда завершилась с exit=${exitCode ?? 'null'}`;
  }
  if (command.migrationScope) {
    const expected = `no-op scope ${command.migrationScope} — уже мигрирован в v2`;
    if (!output.includes(expected)) {
      return `${command.id}: dry-run не подтвердил exact no-op (${expected})`;
    }
  }
  for (const marker of command.scenario?.requiredOutput ?? []) {
    if (!output.includes(marker)) return `${command.id}: raw evidence не содержит ${marker}`;
  }
  return null;
}

export function renderReleaseEvidenceReadme(manifest: ReleaseEvidenceManifest): string {
  const header = ['ID', 'Команда', 'Exit', 'Raw log', 'SHA-256'];
  const cells = manifest.commands.map((entry) => [
    `\`${entry.id}\``,
    `\`${entry.command}\``,
    String(entry.exitCode),
    `\`${entry.logFile}\``,
    `\`${entry.sha256}\``,
  ]);
  const widths = header.map((label, column) =>
    Math.max(label.length, ...cells.map((row) => row[column].length))
  );
  const row = (values: readonly string[], numeric = false): string =>
    `| ${values
      .map((value, column) =>
        numeric && column === 2 ? value.padStart(widths[column]) : value.padEnd(widths[column])
      )
      .join(' | ')} |`;
  const separator = widths.map((width, column) =>
    column === 2 ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width)
  );
  const table = [row(header), row(separator), ...cells.map((values) => row(values, true))].join(
    '\n'
  );

  return (
    `# REL-18 + UV-25 — RC evidence pack\n\n` +
    `Все команды выполнены на одном чистом immutable commit ` +
    `\`${manifest.sourceCommit}\`. Логи собирались во временном каталоге вне репозитория; ` +
    `versioned pack материализован только после успешных команд и повторной проверки чистоты дерева.\n\n` +
    `- Node: \`${manifest.environment.node}\`; npm: \`${manifest.environment.npm}\`; ` +
    `platform: \`${manifest.environment.platform}/${manifest.environment.arch}\`.\n` +
    `- Node executable: \`${manifest.environment.nodeExecutable}\`.\n` +
    `- Migration dry-run: ${manifest.migration.scopes.length} scope × 2 rounds; ` +
    `каждый результат — exact \`no-op — уже мигрирован в v2\`.\n` +
    `- \`format\` здесь означает check-only script \`prettier --check\`; ` +
    `никакой write-format в evidence run нет.\n` +
    `- Локальные прежние \`dist/\`, \`coverage/\` и receipts не используются как evidence: ` +
    `\`build\` и \`test\` выполняются заново в этой матрице.\n` +
    `- Exact E-18 Swift round-trip не входит в этот pack и остаётся отдельной release validation ` +
    `на хосте с реальным Xcode/Tuist Cloud.\n\n` +
    `- UV-25 scenarios: Node/Go/Swift-local presets, exact-SHA remote watcher/provider contracts, ` +
    `Rules list/show/resolve + snapshot digest и SDD attempt evidence. Fixture bytes закреплены ` +
    `SHA-256 из source commit; package publication не выполняется.\n\n` +
    `- U-A6 real smoke: read-only GitHub observation of historical immutable ` +
    `\`sindresorhus/p-map@2c0934b8312b637f933b752c6054845c2d2d5533\`, workflow ` +
    `\`4634269\`, run \`36383812626\`; rerun requires \`GITHUB_TOKEN\` or ` +
    `\`GITHUB_PERSONAL_TOKEN\` with read-only Actions access. It never dispatches, pushes, retries ` +
    `or cancels a workflow, and persists no token or job-log body.\n\n` +
    `${table}\n`
  );
}
