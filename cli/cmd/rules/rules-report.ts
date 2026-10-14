// @file: Stable deterministic text and JSON projection for the rules CLI.
// @spec: CLI-RULES-CLI
// @consumers: rules.cmd

import type { RulesInvocation, RulesReport } from './rules.types.ts';

type RulesFormat = RulesInvocation['format'];
type RulesListReport = Extract<RulesReport, { readonly schema: 'gennady.rules-list.v1' }>;
type RulesShowReport = Extract<RulesReport, { readonly schema: 'gennady.rules-show.v1' }>;
type RulesResolveReport = Extract<RulesReport, { readonly schema: 'gennady.rules-resolve.v1' }>;

function json(report: RulesReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function clauses(value: readonly Readonly<Record<string, readonly string[]>>[]): string {
  return value.length === 0
    ? 'none'
    : value
        .map((clause) =>
          Object.entries(clause)
            .map(([key, values]) => `${key}=${values.join(',')}`)
            .join(' & ')
        )
        .join(' | ');
}

function textList(report: RulesListReport): string {
  return [
    `rules inventory (${report.rules.length})`,
    ...report.rules.map(
      (rule) =>
        `${rule.id} [${rule.type}] source=${rule.source} when=${clauses(rule.when)} unless=${clauses(rule.unless)} depends=${rule.dependsOn.join(',') || 'none'} availability=${rule.availability} provenance=${rule.provenance}`
    ),
  ].join('\n');
}

function textShow(report: RulesShowReport): string {
  const rule = report.rule;
  return [
    `${rule.id} [${rule.type}]`,
    `source: ${rule.source}`,
    `schema/version: ${rule.ruleSchema}/${rule.version}`,
    `when: ${clauses(rule.when)}`,
    `unless: ${clauses(rule.unless)}`,
    `depends: ${rule.dependsOn.join(',') || 'none'}`,
    `availability: ${rule.availability}`,
    `provenance: ${rule.provenance}`,
    `body-digest: ${rule.bodyDigest}`,
    'body:',
    rule.body,
  ].join('\n');
}

function textResolve(report: RulesResolveReport): string {
  const lines = [
    `rules resolve phase=${report.phase} scope=${report.scope.source}`,
    `digest: ${report.digest}`,
    `files: ${report.scope.files.join(',') || 'none'}`,
    `tombstones: ${report.scope.tombstones.join(',') || 'none'}`,
    `providers: ${report.facts.providers.join(',') || 'none'}`,
    'required:',
    ...report.selected.required.map(
      (rule) => `  ${rule.id} via=${rule.via} source=${rule.source} reason=${rule.reason}`
    ),
    'suggested:',
    ...report.selected.suggested.map(
      (rule) => `  ${rule.id} via=${rule.via} source=${rule.source} reason=${rule.reason}`
    ),
    'skipped:',
    ...report.skipped.map((rule) => `  ${rule.id} source=${rule.source} reason=${rule.reason}`),
    `dependency-closure: ${report.dependencyClosure.join(',') || 'none'}`,
  ];
  return lines.join('\n');
}

/**
 * @purpose Render one already-safe repo-relative rules projection without semantic recomputation.
 * @param report Versioned inventory, detail, or resolution projection.
 * @param format Explicit stable JSON or default deterministic text format.
 * @returns Complete newline-terminated stdout payload.
 */
export function renderRulesReport(report: RulesReport, format: RulesFormat): string {
  if (format === 'json') return json(report);
  if (report.schema === 'gennady.rules-list.v1') return `${textList(report)}\n`;
  if (report.schema === 'gennady.rules-show.v1') return `${textShow(report)}\n`;
  return `${textResolve(report)}\n`;
}
