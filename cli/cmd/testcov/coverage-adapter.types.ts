// @file: Platform-neutral coverage adapter contract for testcov orchestration.
// @consumers: coverage-adapter-registry.ts, coverage-artifact.ts, istanbul-coverage-adapter.ts, testcov.cmd.ts, sdd-verify

/** @purpose Exact argv-safe coverage producer selected by one platform adapter. */
export interface CoverageProducer {
  /** Stable human-readable runner identity. */
  name: string;
  /**
   * @purpose Build the exact producer process invocation.
   * @param testResultsFile Repo-local absolute adapter-owned results artifact.
   * @returns Exact executable plus argv; no shell reconstruction.
   */
  invocation(testResultsFile: string): { command: string; args: string[] };
}

/** @purpose Adapter-owned producer capability without platform branches in orchestration. */
type CoverageProducerCapability =
  | { kind: 'available'; producers: [CoverageProducer, ...CoverageProducer[]] }
  | {
      kind: 'unsupported';
      code: string;
      message: string;
      expect: string;
      fix: string;
    };

/** @purpose Adapter-neutral raw hit/total counters used by tree and threshold aggregation. */
export interface CoverageMetrics {
  /** @purpose Total statements. */
  sT: number;
  /** @purpose Hit statements. */
  sH: number;
  /** @purpose Total branch arms. */
  bT: number;
  /** @purpose Hit branch arms. */
  bH: number;
  /** @purpose Total functions. */
  fT: number;
  /** @purpose Hit functions. */
  fH: number;
}

/** @purpose Parsed report represented as raw entries plus adapter-extracted common metrics. */
export interface CoverageReport {
  /** Adapter-private entries retained for detailed source rendering. */
  entries: Record<string, unknown>;
  /** Adapter-extracted metrics indexed by the report's native path keys. */
  metrics: Record<string, CoverageMetrics>;
}

/** @purpose Adapter-normalized source line used by platform-neutral detail rendering. */
export interface CoverageLineDetail extends CoverageMetrics {
  /** One-based source line number. */
  num: number;
  /** Exact source line text. */
  text: string;
  /** Optional platform-owned branch/function annotation. */
  note?: string;
}

/** @purpose Adapter-normalized file detail with no native report-schema fields. */
export interface CoverageFileDetail extends CoverageMetrics {
  /** Exact source path. */
  path: string;
  /** Per-line normalized coverage. */
  lines: CoverageLineDetail[];
}

/** @purpose Explicit capability result for optional detail/result presentation. */
export type CoveragePresentationResult<T> =
  | { kind: 'supported'; value: T }
  | { kind: 'unsupported'; code: string; message: string };

/** @purpose Fail-closed mapping from a repository source to one native report entry. */
export type CoveragePathResolution =
  | { kind: 'found'; key: string }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; keys: string[] };

/**
 * @purpose Complete platform boundary behind testcov's shared threshold orchestration.
 * @invariant The orchestration never adds platform extensions, parses reports, or guesses paths.
 */
export interface CoverageAdapter {
  /** @purpose Stable registry identity. */
  id: string;
  /** @purpose Human-readable platform family. */
  platform: string;
  /** @purpose Human-readable report format. */
  reportFormat: string;
  /**
   * @purpose Probe a project without mutating it.
   * @param root Exact project root.
   * @returns Match status and concrete evidence.
   */
  detect(root: string): {
    /** @purpose Whether the adapter found platform or report evidence. */
    matched: boolean;
    /** Concrete local evidence shown when selection is ambiguous. */
    evidence: string[];
  };
  /**
   * @purpose Return exact producer-owned artifact paths.
   * @param root Exact project root.
   * @returns Coverage and test-result artifact identity.
   */
  artifacts(root: string): {
    /** Repo-relative coverage report whose current-run freshness is owned by the producer. */
    report: string;
    /** Repo-relative runner result file used only for test-count presentation. */
    testResults: string;
    /** Repo-relative generated trees permitted during this adapter's producer invocation. */
    writableDirectories: readonly string[];
  };
  /**
   * @purpose Detect the platform's supported local producer without orchestration branches.
   * @param root Exact project root.
   * @returns Available argv-safe producers or one teaching capability diagnostic.
   */
  producerCapability(root: string): CoverageProducerCapability;
  /**
   * @purpose Recognize one production source path.
   * @param path Source candidate.
   * @returns True only for a supported non-test source.
   */
  isProductionSource(path: string): boolean;
  /**
   * @purpose Recognize one test source path.
   * @param path Source candidate.
   * @returns True only for a supported test source.
   */
  isTestSource(path: string): boolean;
  /**
   * @purpose Exclude a platform-defined directory from source traversal.
   * @param name Directory basename.
   * @returns True when traversal must skip the directory.
   */
  shouldSkipDirectory(name: string): boolean;
  /**
   * @purpose Enumerate supported production files under an exact target.
   * @param target Existing exact file or directory.
   * @returns Adapter-supported production files without symlinks.
   */
  collectProductionFiles(target: string): string[];
  /**
   * @purpose Parse a native report and extract common metrics.
   * @param reportContent Identity-safe report bytes read by shared orchestration.
   * @returns Raw entries plus common metrics.
   */
  parseReport(reportContent: string): CoverageReport;
  /**
   * @purpose Convert one native report entry into adapter-neutral line detail.
   * @param sourcePath Exact source path.
   * @param sourceContent Exact source bytes.
   * @param reportEntry Native entry returned by parseReport.
   * @returns Normalized detail or one typed unsupported capability.
   */
  fileDetail(
    sourcePath: string,
    sourceContent: string,
    reportEntry: unknown
  ): CoveragePresentationResult<CoverageFileDetail>;
  /**
   * @purpose Convert adapter-owned runner results into source-path test counts.
   * @param resultsContent Exact identity-safe results bytes.
   * @returns Test counts or one typed unsupported capability.
   */
  parseTestResults(resultsContent: string): CoveragePresentationResult<Record<string, number>>;
  /**
   * @purpose Map a source to exactly one native report identity.
   * @param root Exact project root.
   * @param report Parsed adapter report.
   * @param sourcePath Exact source path.
   * @returns Found, missing, or ambiguous path identity.
   */
  resolveSource(root: string, report: CoverageReport, sourcePath: string): CoveragePathResolution;
  /**
   * @purpose Return selected sources newer than the adapter-owned report artifact.
   * @param reportMtimeMs Identity-safe mtime captured with the report bytes.
   * @param sourcePaths Exact selected production files.
   * @returns Stale source subset.
   */
  staleSources(reportMtimeMs: number, sourcePaths: string[]): string[];
}

/** @purpose Exhaustive fail-closed outcome of registry selection. */
export type CoverageAdapterSelection =
  | { kind: 'selected'; adapter: CoverageAdapter }
  | { kind: 'unsupported'; available: string[] }
  | { kind: 'ambiguous'; matches: Array<{ id: string; evidence: string[] }> };
