// @file: TriggerRegistry — glob-based trigger rules mapping changed files to review tracks, with starter rules for deps/secrets/specs/migrations
// @consumers: PlanTemplate, inbox-pipeline
// @tasks: TSK-161

import { logger } from '#logger';

/** @purpose A single trigger rule: a glob pattern maps matched files to a review track */
export type TriggerRule = {
  /** @purpose Unique rule identifier */
  ruleId: string;
  /** @purpose Glob pattern to match against changed file paths */
  glob: string;
  /** @purpose Track identifier this rule spawns */
  trackId: string;
  /** @purpose Human-readable track name */
  trackName: string;
  /** @purpose Review focus description */
  focus: string;
};

/** @purpose Result of trigger resolution — one triggered track with matched files */
export type TriggeredTrack = {
  /** @purpose Rule that triggered this track */
  ruleId: string;
  /** @purpose Target track identifier */
  trackId: string;
  /** @purpose Human-readable track name */
  trackName: string;
  /** @purpose Review focus description */
  focus: string;
  /** @purpose Files that matched the trigger glob */
  matchedFiles: string[];
};

// #region START_STARTER_RULES — built-in trigger rules providing deps/secret/spec/migration coverage
// purpose: declarative TS module — each rule is a data entry, not code branching.
// Adding a trigger = adding a record to this array.

const STARTER_RULES: TriggerRule[] = [
  {
    ruleId: 'trig-deps-vuln',
    glob: '**/{package.json,go.mod,go.sum,yarn.lock,pnpm-lock.yaml,package-lock.json,Cargo.toml,Cargo.lock,Gemfile,Gemfile.lock,composer.json,composer.lock,pom.xml,build.gradle,build.gradle.kts,mix.exs,mix.lock,pyproject.toml,requirements.txt,Pipfile,Pipfile.lock,Setup.hs,stack.yaml,cabal.project,Package.swift,Package.resolved,pubspec.yaml,pubspec.lock,deno.json,deno.jsonc}',
    trackId: 'deps-vuln',
    trackName: 'deps-vuln',
    focus: 'SUPPLY probe — веб-ресёрч уязвимостей зависимостей',
  },
  {
    ruleId: 'trig-secrets',
    glob: '**/.env*',
    trackId: 'secrets',
    trackName: 'secrets',
    focus: 'SEC+SECRET probes — проверка утечек секретов в .env и подобных файлах',
  },
  {
    ruleId: 'trig-secret-patterns',
    glob: '**/*.{ts,js,tsx,jsx,yml,yaml,toml,json,py,rb,go,rs,java,kt}',
    trackId: 'secrets',
    trackName: 'secrets',
    focus: 'SEC+SECRET probes — поиск (?i)(secret|token|password|api[_-]?key) в новых файлах',
  },
  {
    ruleId: 'trig-spec-compliance',
    glob: 'specs/**',
    trackId: 'spec-compliance',
    trackName: 'spec-compliance',
    focus: 'SPEC probe — согласие кода со спеками',
  },
  {
    ruleId: 'trig-migration-safety',
    glob: '**/{migrations,db,prisma,sql}*/**',
    trackId: 'migration-safety',
    trackName: 'migration-safety',
    focus: 'MIGRATION probe — безопасность миграций и изменения схемы БД',
  },
];

// #endregion END_STARTER_RULES

// #region START_GLOB_MATCHER — minimal glob-to-regex conversion for trigger matching
// purpose: avoid dependency for simple trigger patterns; only handles **, *, ? needed by starter rules

const SECRET_CONTENT_PATTERN = new RegExp('(secret|token|password|api[_-]?key)', 'i');

/**
 * @purpose Convert a glob pattern to a RegExp for file path matching.
 * @invariant Handles ** (any depth), * (name segment), ? (single char), {a,b} (alternation).
 * @param glob Glob pattern string.
 * @returns Compiled RegExp.
 */
function globToRegex(glob: string): RegExp {
  let pattern = '';
  let i = 0;
  while (i < glob.length) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      pattern += '.*';
      i += 2;
      if (glob[i] === '/') i++;
    } else if (glob[i] === '*') {
      pattern += '[^/]*';
      i++;
    } else if (glob[i] === '?') {
      pattern += '[^/]';
      i++;
    } else if (glob[i] === '{') {
      const end = glob.indexOf('}', i);
      const alternation = glob.slice(i + 1, end).replace(/,/g, '|');
      pattern += `(${alternation})`;
      i = end + 1;
    } else if ('.^$\\+*?()[]{}|'.includes(glob[i])) {
      pattern += '\\' + glob[i];
      i++;
    } else {
      pattern += glob[i];
      i++;
    }
  }
  return new RegExp(`^${pattern}$`);
}

// #endregion END_GLOB_MATCHER

/**
 * @purpose Registry of glob-based trigger rules — resolves changed files into triggered review tracks.
 * @invariant Pure function over the rules array — no mutable state; same rules + same files = same result.
 * @invariant Each trigger rule maps to a single track; multiple rules can target the same track (files merged).
 */
export class TriggerRegistry {
  /** @purpose Registered trigger rules */
  protected _rules: TriggerRule[];

  /**
   * @purpose Create a trigger registry with optional custom rules on top of starters.
   * @param [customRules] Additional trigger rules beyond the starter set.
   */
  constructor(customRules: TriggerRule[] = []) {
    this._rules = [...STARTER_RULES, ...customRules];
    logger.debug('[TriggerRegistry#constructor] [init → ready]', { ruleCount: this._rules.length });
  }

  /**
   * @purpose Resolve changed files into triggered tracks, aggregating by trackId.
   * @param changedFiles File paths from the changeset.
   * @returns Array of triggered tracks — one per distinct trackId with merged matched files.
   */
  resolve(changedFiles: string[]): TriggeredTrack[] {
    logger.debug('[TriggerRegistry#resolve] [idle → resolving]', {
      fileCount: changedFiles.length,
    });

    // #region START_TRACK_AGGREGATION — map trackId → aggregated triggered track
    const trackMap = new Map<string, TriggeredTrack>();

    for (const rule of this._rules) {
      const regex = globToRegex(rule.glob);
      const matchedFiles = changedFiles.filter((f) => regex.test(f));

      if (matchedFiles.length === 0) continue;

      // #region START_SECRET_FILTER — trg-secret-patterns requires content match in new files
      if (rule.ruleId === 'trig-secret-patterns') {
        const secretFiles = matchedFiles.filter((f) =>
          SECRET_CONTENT_PATTERN.test(f.split('/').pop() ?? f)
        );
        if (secretFiles.length === 0) continue;
        matchedFiles.length = 0;
        matchedFiles.push(...secretFiles);
      }
      // #endregion END_SECRET_FILTER

      const existing = trackMap.get(rule.trackId);
      if (existing) {
        const merged = new Set([...existing.matchedFiles, ...matchedFiles]);
        existing.matchedFiles = [...merged];
      } else {
        trackMap.set(rule.trackId, {
          ruleId: rule.ruleId,
          trackId: rule.trackId,
          trackName: rule.trackName,
          focus: rule.focus,
          matchedFiles,
        });
      }
    }
    // #endregion END_TRACK_AGGREGATION

    const result = [...trackMap.values()];
    logger.info('[TriggerRegistry#resolve] [resolving → done]', {
      triggeredTrackCount: result.length,
    });
    return result;
  }
}
