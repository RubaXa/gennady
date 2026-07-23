// @file: mr-stats domain types — EntityRef, EntityDelta, LineDiff, MrStatsReport, etc.
// @consumers: mr-resolver, classifier, line-counter, entity-counter, duplicate-detector, reporter, mr-stats.cmd
// @tasks: TSK-139

/** @purpose Reference to a named entity in a file with optional line number. */
export type EntityRef = {
  /** @purpose Absolute or repository-relative file path */
  file: string;
  /** @purpose One-based line number where the entity is declared | @invariant Omitted when unknown */
  line?: number;
  /** @purpose Symbol name of the entity as declared in source */
  symbol: string;
};

/** @purpose Result of entity-level comparison between base and MR branch for a set of files. */
export type EntityDelta = {
  /** @purpose Entities present in MR but absent in base | @invariant Disjoint with modified and removed */
  introduced: EntityRef[];
  /** @purpose Entities present in both branches but with differing body/signature/members | @invariant Disjoint with introduced and removed */
  modified: EntityRef[];
  /** @purpose Entities present in base but absent in MR | @invariant Disjoint with introduced and modified */
  removed: EntityRef[];
};

/** @purpose Added/removed count for a single line type (code, comment, blank). */
export type LineDiff = {
  /** @purpose Lines added in MR branch */
  added: number;
  /** @purpose Lines removed in MR branch */
  removed: number;
};

/** @purpose Statistics for a simple category (9 of 10 categories — everything except realCode). */
export type MrStatsCategorySimple = {
  /** @purpose Number of changed files in this category */
  files: number;
  /** @purpose Total lines added across all files in this category */
  added: number;
  /** @purpose Total lines removed across all files in this category */
  removed: number;
};

/** @purpose Statistics for the realCode category — includes extended metrics. */
export type MrStatsCategoryRealCode = MrStatsCategorySimple & {
  /** @purpose Comment line diff (added / removed) */
  commentLines: LineDiff;
  /** @purpose Code line diff (added / removed) */
  codeLines: LineDiff;
  /** @purpose Blank line diff (added / removed) */
  blankLines: LineDiff;
  /** @purpose Entity counts — introduced, modified, removed (serialized from EntityDelta) */
  entities: {
    introduced: number;
    modified: number;
    removed: number;
  };
  /** @purpose Duplicate code detection results from jscpd */
  duplicates: {
    clonesFound: number;
    clonedLines: number;
    /** @purpose Percentage of cloned lines among total scanned | @invariant 0 ≤ percentage ≤ 100 */
    percentage: number;
  };
};

/** @purpose Metadata for a GitLab Merge Request. */
export type MrMetadata = {
  /** @purpose MR internal ID with bang prefix (e.g. "!1420") */
  iid: string;
  /** @purpose MR title as shown in GitLab */
  title: string;
  /** @purpose Repository path (group/project) */
  project: string;
  /** @purpose Source branch name */
  sourceBranch: string;
  /** @purpose Target branch name */
  targetBranch: string;
  /** @purpose ISO-8601 timestamp of MR merge */
  mergedAt: string;
  /** @purpose GitLab username of MR author */
  author: string;
};

/** @purpose Duplicate detection report from jscpd. */
export type DuplicateReport = {
  /** @purpose Number of clone groups found */
  clonesFound: number;
  /** @purpose Total number of cloned lines across all clone groups */
  clonedLines: number;
  /** @purpose Percentage of cloned lines among total scanned | @invariant 0 ≤ percentage ≤ 100 */
  percentage: number;
};

/** @purpose Final MR statistics report — canonical JSON output contract. */
export type MrStatsReport = {
  /** @purpose MR metadata fetched from GitLab API */
  mr: MrMetadata;
  /** @purpose Statistics broken down by 10 categories | @invariant All 10 keys present when not timed out */
  categories: Record<string, MrStatsCategorySimple | MrStatsCategoryRealCode>;
};

/** @purpose Outcome of the mr-stats command. ok=false when pre-flight checks fail; ok=true when report is complete. */
export type MrStatsOutcome =
  | { ok: true; report: MrStatsReport }
  | { ok: false; exitCode: number; message: string };

/** @purpose Single classifier category from classifier-rules.yaml. */
export type ClassifierCategory = {
  /** @purpose Category name — one of 10 canonical labels */
  name: string;
  /** @purpose Glob patterns that match files INTO this category */
  include: string[];
  /** @purpose Glob patterns that exclude files from this category (applied after include) */
  exclude?: string[];
};

/** @purpose Parsed classifier rules — ordered list of categories (first-match wins). */
export type ClassifierRules = {
  /** @purpose Categories in priority order */
  categories: ClassifierCategory[];
};

/** @purpose Canonical category names in processing order (for deterministic timeout behaviour). */
export const CANONICAL_CATEGORY_ORDER = [
  'configs',
  'infraScripts',
  'mockFixture',
  'mediaStatic',
  'uiSvelte',
  'testingStorybook',
  'realCode',
  'specsTasksDocs',
  'aiSkills',
  'draftTodo',
] as const;

/** @purpose Timeout for mr-stats processing in milliseconds | @invariant 30 seconds */
export const MR_STATS_TIMEOUT_MS = 30_000;
