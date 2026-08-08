// @file: Synthesize — reads N model results (<track>.<model>.result.json), marks findings as consensus ✅ / dispute ⚡ / unique ○, writes to findings.jsonl
// @consumers: inbox-pipeline
// @tasks: TSK-161

import { readFileSync } from 'node:fs';
import { logger } from '#logger';
import type { FindingEntry, FindingMark, FindingsJournal } from './findings-journal.ts';

/** @purpose Raw finding from a single model result */
export type RawFinding = {
  /** @purpose File path relative to repo root */
  file: string;
  /** @purpose Line number — 0 when file-level */
  line: number;
  /** @purpose One-line summary */
  summary: string;
  /** @purpose Severity */
  severity: 'error' | 'warning' | 'info';
};

/** @purpose A single model's result for a track */
export type ModelResult = {
  /** @purpose Track identifier */
  track: string;
  /** @purpose Model name (e.g. deepseek, kimi) */
  model: string;
  /** @purpose Session run identifier */
  runId: string;
  /** @purpose Findings from this model */
  findings: RawFinding[];
};

/** @purpose Cluster key for dedup — normalized (file, line range, summary) */
type ClusterKey = string;

// #region START_NORMALIZE — produce comparable key from summary for clustering
// purpose: minor wording differences between models should not prevent clustering

/**
 * @purpose Normalize a summary string for comparison across models.
 * @param summary Raw summary text.
 * @returns Lowercase, trimmed, punctuation-stripped string.
 */
function normalizeSummary(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// #endregion END_NORMALIZE

// #region START_CLUSTER — compute a cluster key from (file, line bucket, normalized summary)
// purpose: identifies same finding across models for consensus/dispute marking

/**
 * @purpose Compute a cluster key for a finding — identifies same finding across models.
 * @invariant Clustering by (file, line±2, normalized summary) — same file + close line + similar text.
 * @param finding Raw finding to cluster.
 * @returns Cluster key string.
 */
function clusterKey(finding: RawFinding): ClusterKey {
  const normSummary = normalizeSummary(finding.summary);
  // line bucket: group by line/5 to capture nearby lines
  const lineBucket = Math.floor(finding.line / 5);
  return `${finding.file}:${lineBucket}:${normSummary.slice(0, 80)}`;
}

// #endregion END_CLUSTER

/**
 * @purpose Multi-model finding synthesizer — reads N model results, clusters findings, marks consensus/dispute/unique.
 * @invariant Uses read-tools and file pointers, not inline content — model results are expected as files on disk.
 * @invariant Consensus: ≥2 models found same issue. Dispute: models disagree on presence/severity. Unique: single model only.
 */
export class Synthesize {
  /** @purpose Findings journal for writing synthesized output */
  protected _journal: FindingsJournal;

  /**
   * @purpose Create a Synthesize instance bound to a findings journal.
   * @param journal FindingsJournal for writing results.
   */
  constructor(journal: FindingsJournal) {
    this._journal = journal;
    logger.debug('[Synthesize#constructor] [init → ready]');
  }

  /**
   * @purpose Load model results from file pointers — each path points to a JSON array of RawFinding.
   * @param resultPaths Map of model identifier → file path for result JSON.
   * @returns Array of ModelResult with parsed findings.
   */
  loadResults(
    resultPaths: Map<string, { track: string; path: string; runId: string }>
  ): ModelResult[] {
    logger.debug('[Synthesize#loadResults] [idle → loading]', { modelCount: resultPaths.size });

    const results: ModelResult[] = [];
    for (const [model, info] of resultPaths) {
      try {
        const raw = readFileSync(info.path, 'utf8');
        const findings = JSON.parse(raw) as RawFinding[];
        results.push({
          track: info.track,
          model,
          runId: info.runId,
          findings,
        });
      } catch (cause) {
        const error = new Error(`[Synthesize#loadResults] Failed to load ${info.path}`, { cause });
        logger.error('[Synthesize#loadResults] [loading → failed]', {
          error,
          model,
          path: info.path,
        });
        throw error;
      }
    }

    logger.info('[Synthesize#loadResults] [loading → done]', {
      totalModels: results.length,
      totalFindings: results.reduce((sum, r) => sum + r.findings.length, 0),
    });

    return results;
  }

  /**
   * @purpose Synthesize findings from multiple models: cluster, determine mark per finding, write to journal.
   * @param modelResults Array of ModelResult from N models.
   * @returns Synthesized findings array with marks assigned.
   * @sideEffect Appends synthesized findings to findings.jsonl.
   */
  async synthesize(modelResults: ModelResult[]): Promise<FindingEntry[]> {
    logger.debug('[Synthesize#synthesize] [idle → synthesizing]', {
      modelCount: modelResults.length,
    });

    // #region START_CLUSTERING — group findings by (file, line bucket, normalized summary)
    const clusters = new Map<ClusterKey, RawFinding[]>();
    const sourceMap = new Map<ClusterKey, Set<string>>();

    for (const result of modelResults) {
      for (const finding of result.findings) {
        const key = clusterKey(finding);
        const cluster = clusters.get(key) ?? [];
        cluster.push(finding);
        clusters.set(key, cluster);

        const sources = sourceMap.get(key) ?? new Set();
        sources.add(result.model);
        sourceMap.set(key, sources);
      }
    }
    // #endregion END_CLUSTERING

    // #region START_MARK_ASSIGNMENT — determine consensus/dispute/unique per cluster
    const synthesized: FindingEntry[] = [];

    for (const [key, findings] of clusters) {
      const sources = sourceMap.get(key)!;
      let mark: FindingMark;

      if (sources.size >= 2) {
        // #region START_CONSENSUS_DISPUTE — ≥2 models → consensus if agreement, dispute if conflict
        const severities = new Set(findings.map((f) => f.severity));
        mark = severities.size === 1 ? 'consensus' : 'dispute';
        // #endregion END_CONSENSUS_DISPUTE
      } else {
        mark = 'unique';
      }

      const primary = findings[0];
      const entry: Omit<FindingEntry, 'id'> = {
        file: primary.file,
        line: primary.line,
        summary: primary.summary,
        severity: primary.severity,
        source: [...sources].map((model) => ({
          model,
          runId: modelResults.find((r) => r.model === model)?.runId ?? 'unknown',
        })),
        mark,
      };

      const id = await this._journal.append(entry);
      synthesized.push({ ...entry, id });
    }
    // #endregion END_MARK_ASSIGNMENT

    const counts = {
      consensus: synthesized.filter((f) => f.mark === 'consensus').length,
      dispute: synthesized.filter((f) => f.mark === 'dispute').length,
      unique: synthesized.filter((f) => f.mark === 'unique').length,
    };

    logger.info('[Synthesize#synthesize] [synthesizing → done]', {
      totalFindings: synthesized.length,
      ...counts,
    });

    return synthesized;
  }

  /**
   * @purpose Build review.json from synthesized findings.
   * @param findings Synthesized finding entries with marks.
   * @returns Review JSON structure.
   */
  buildReviewJson(findings: FindingEntry[]): Record<string, unknown> {
    return {
      verdict: '',
      revision: 1,
      findings: findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        file: f.file,
        line: f.line,
        summary: f.summary,
        source: f.source,
        mark: f.mark,
        state: 'new',
      })),
    };
  }
}
