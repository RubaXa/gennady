// @file: Public request and stable projection types for the read-only rules command.
// @spec: CLI-RULES-CLI
// @consumers: rules.cmd, rules-report

import type { PhaseFacts } from '../../../shared/rules/phase-facts.type.ts';

/** @purpose One strictly parsed inventory, detail, or explicit-scope resolution request. */
export type RulesInvocation =
  | { readonly command: 'list'; readonly format: 'text' | 'json' }
  | {
      readonly command: 'show';
      readonly ruleId: string;
      readonly format: 'text' | 'json';
    }
  | {
      readonly command: 'resolve';
      readonly phase: string;
      readonly format: 'text' | 'json';
      readonly scope:
        | { readonly source: 'files'; readonly inputs: readonly string[] }
        | { readonly source: 'changed-from'; readonly ref: string }
        | { readonly source: 'task'; readonly ticket: string };
    };

/** @purpose Stable versioned JSON/text source model emitted by every rules subcommand. */
export type RulesReport =
  | {
      readonly schema: 'gennady.rules-list.v1';
      readonly rules: readonly {
        readonly id: string;
        readonly source: string;
        readonly ruleSchema: string;
        readonly type: string;
        readonly version: string;
        readonly when: readonly Readonly<Record<string, readonly string[]>>[];
        readonly unless: readonly Readonly<Record<string, readonly string[]>>[];
        readonly dependsOn: readonly string[];
        readonly availability: 'available';
        readonly provenance: 'builtin-manifest';
        readonly bodyDigest: string;
      }[];
    }
  | {
      readonly schema: 'gennady.rules-show.v1';
      readonly rule: Extract<
        RulesReport,
        { readonly schema: 'gennady.rules-list.v1' }
      >['rules'][number] & { readonly body: string };
    }
  | {
      readonly schema: 'gennady.rules-resolve.v1';
      readonly phase: string;
      readonly scope: {
        readonly source: 'files' | 'changed-from' | 'task';
        readonly files: readonly string[];
        readonly tombstones: readonly string[];
        readonly changedFrom?: string;
        readonly ticket?: string;
        readonly sddPhase?: string;
      };
      readonly facts: PhaseFacts;
      readonly selected: {
        readonly required: readonly {
          readonly id: string;
          readonly type: 'required' | 'suggested';
          readonly source: string;
          readonly bodyDigest: string;
          readonly dependencies: readonly string[];
          readonly via: 'predicate' | 'dependency' | 'override';
          readonly reason: string;
          readonly provenance: string;
          readonly matchedArtifacts: readonly string[];
        }[];
        readonly suggested: readonly {
          readonly id: string;
          readonly type: 'required' | 'suggested';
          readonly source: string;
          readonly bodyDigest: string;
          readonly dependencies: readonly string[];
          readonly via: 'predicate' | 'dependency' | 'override';
          readonly reason: string;
          readonly provenance: string;
          readonly matchedArtifacts: readonly string[];
        }[];
      };
      readonly skipped: readonly {
        readonly id: string;
        readonly source: string;
        readonly bodyDigest: string;
        readonly dependencies: readonly string[];
        readonly reason: string;
        readonly provenance: string;
      }[];
      readonly dependencyClosure: readonly string[];
      readonly digest: string;
    };

/** @purpose Process-ready stdout/stderr and stable command exit classification. */
export type RulesCommandOutcome = {
  /** @purpose Zero for a complete report, one for resolution failure, four for invalid invocation. */
  readonly exitCode: 0 | 1 | 4;
  /** @purpose Complete deterministic projection on success, otherwise empty. */
  readonly stdout: string;
  /** @purpose Actionable bounded diagnostic on failure, otherwise empty. */
  readonly stderr: string;
};
