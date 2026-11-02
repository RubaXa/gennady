// @file: The `lint` section of the per-repo config — schema, strict validation and defaults.
// @spec: CLI-LINT
// @consumers: LintCommand

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  isPlainObject,
  loadConfigSection,
  unknownKeyError,
  type ConfigError,
} from '../../../services/config/config-loader.ts';

/** @purpose Allowed values of `lint.commentLanguage`; `en` is the default. */
export const COMMENT_LANGUAGES = ['en', 'ru', 'any'] as const;

/** @purpose Natural language policy for file headers and JSDoc checked by `LanguageCheck`. */
export type CommentLanguage = (typeof COMMENT_LANGUAGES)[number];

/** @purpose Allowed values of `lint.scope`; `all` is the default. */
export const LINT_SCOPES = ['all', 'owned'] as const;

/** @purpose Which selected files lint checks: every file, or only files owned by an SDD spec. */
export type LintScope = (typeof LINT_SCOPES)[number];

/** Known keys of the `lint` section. */
const LINT_SECTION_KEYS = ['commentLanguage', 'scope'] as const;

/**
 * @purpose Validated `lint` section with the config file that won each error.
 * @consumer LintCommand
 */
export type LintConfigLoad = {
  /** @purpose Effective comment language; `en` when no source sets it. */
  readonly commentLanguage: CommentLanguage;
  /** @purpose Effective file scope; `all` when no source sets it. */
  readonly scope: LintScope;
  /** @purpose Parse and schema errors; non-empty means lint must stop with exit 4. */
  readonly errors: readonly (ConfigError & { readonly source: string })[];
  /** @purpose Effective winner per lint key; default is explicit when no source sets it. */
  readonly provenance: ReadonlyMap<string, string>;
  /** @purpose Absolute directory whose project configuration was read. */
  readonly root: string;
  /** @purpose Basenames of the files that contributed, highest priority first. */
  readonly sources: readonly string[];
};

/**
 * @purpose Load and strictly validate the `lint` section of `gennady.yaml` / `.gennadyrc`.
 * @invariant Absent section or key keeps the defaults `en` / `all`; unknown keys and values are errors.
 * @param root Absolute project root.
 * @param [homeDirectory] Explicit home directory for deterministic hosts and tests.
 * @returns Effective settings plus every config error.
 * @sideEffect IO: reads up to three config files.
 */
export function loadLintConfig(root: string, homeDirectory?: string): LintConfigLoad {
  const loaded = loadConfigSection(
    root,
    'lint',
    homeDirectory === undefined ? {} : { homeDirectory }
  );
  const errors: ConfigError[] = [...loaded.errors];
  let commentLanguage: CommentLanguage = 'en';
  let scope: LintScope = 'all';
  const section = loaded.section;
  if (section !== null && isPlainObject(section)) {
    for (const key of Object.keys(section)) {
      if (!(LINT_SECTION_KEYS as readonly string[]).includes(key)) {
        errors.push(unknownKeyError(`lint.${key}`, LINT_SECTION_KEYS));
      }
    }
    const value = section['commentLanguage'];
    if (value !== undefined) {
      if (typeof value === 'string' && (COMMENT_LANGUAGES as readonly string[]).includes(value)) {
        commentLanguage = value as CommentLanguage;
      } else {
        errors.push({
          path: 'lint.commentLanguage',
          message: `must be one of: ${COMMENT_LANGUAGES.join(', ')} — received ${JSON.stringify(value)}`,
        });
      }
    }
    const scopeValue = section['scope'];
    if (scopeValue !== undefined) {
      if (
        typeof scopeValue === 'string' &&
        (LINT_SCOPES as readonly string[]).includes(scopeValue)
      ) {
        scope = scopeValue as LintScope;
      } else {
        errors.push({
          path: 'lint.scope',
          message: `must be one of: ${LINT_SCOPES.join(', ')} — received ${JSON.stringify(scopeValue)}`,
        });
      }
    }
  }
  return {
    commentLanguage,
    scope,
    errors: errors.map((error) => ({
      ...error,
      source:
        error.source ??
        (/(?:^|\/)\.gennadyrc$|^gennady\.yaml$/.test(error.path)
          ? error.path
          : (loaded.provenance.get(error.path.replace(/^lint\./, '')) ??
            loaded.sources[0] ??
            'gennady.yaml')),
    })),
    sources: loaded.sources,
    provenance: loaded.provenance,
    root: resolve(root),
  };
}

/**
 * @purpose Locate the actual Git project for config reads while leaving target paths cwd-relative.
 * @param cwd Invocation directory.
 * @returns Git root, or the explicit directory outside Git.
 */
export function lintConfigRoot(cwd: string): string {
  try {
    return execFileSync('git', ['--no-optional-locks', 'rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

/**
 * @purpose Describe a minimal edit to the effective policy source without changing it.
 * @param config Actual invocation policy.
 * @param key Supported lint policy key.
 * @param value Proposed explicit setting.
 * @param rationale Applicability and boundaries of this proposal.
 * @returns Consent-bound diagnostic and exact repeat instruction.
 */
function policyGuidance(
  config: LintConfigLoad,
  key: 'commentLanguage' | 'scope',
  value: 'ru' | 'owned',
  rationale: string
): string {
  const source = config.provenance.get(key) ?? 'default';
  const target = source === '.gennadyrc' ? '.gennadyrc' : 'gennady.yaml';
  const patch =
    target === '.gennadyrc'
      ? JSON.stringify({ lint: { [key]: value } }, null, 2)
      : `lint:\n  ${key}: ${value}`;
  return `Effective lint.${key}=${config[key]} (source=${source}). ${rationale} Obtain operator consent before merging only this key into ${resolve(config.root, target)}:\n${patch}\nPreserve unrelated settings and existing comments. Then rerun the same lint command and verify the effective source; this proposal does not authorize or apply a change.`;
}

/**
 * @purpose Teach a consent-bound comment-language change that affects the effective setting.
 * @param config Loaded policy and per-key provenance.
 * @returns Actionable proposal, never an applied change.
 */
export function lintLanguageGuidance(config: LintConfigLoad): string {
  return policyGuidance(
    config,
    'commentLanguage',
    'ru',
    'If Russian comments are the project convention, use this explicit policy.'
  );
}

/**
 * @purpose Explain progressive lint adoption without claiming a headerless file is unowned.
 * @param config Actual invocation policy and provenance.
 * @returns Conditional consent-bound proposal; declared files remain checked after approval.
 */
export function lintScopeGuidance(config: LintConfigLoad): string {
  return policyGuidance(
    config,
    'scope',
    'owned',
    'If the project should lint only SDD-owned sources, owned keeps File Mapping, ticket targets and existing headers; it skips only unclaimed neighbors. Declared files still require their headers and contracts.'
  );
}
