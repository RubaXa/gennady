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
};

export type ReleaseEvidenceResult = {
  id: string;
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  logFile: string;
  sha256: string;
};

export type ReleaseEvidenceManifest = {
  schema: 'gennady.rc-evidence-pack.v1';
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
  const migration = ([1, 2] as const).flatMap((round) =>
    [...scopes].sort(codePointCompare).map((scope) => ({
      id: `migration-${round}-${scope}`,
      command: 'node',
      args: ['--import', 'tsx', 'cli/gennady.ts', 'sdd-migrate', 'move', '.', '--scope', scope],
      migrationScope: scope,
      migrationRound: round,
    }))
  );
  return [...gates, ...migration];
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
    `# REL-18 — RC evidence pack\n\n` +
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
    `${table}\n`
  );
}
