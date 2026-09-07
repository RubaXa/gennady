// @file: Identity-safe lifecycle for adapter-owned coverage artifacts.
// @consumers: testcov.cmd.ts, sdd-verify/index.ts, coverage-adapter-registry.test.ts

import { existsSync, lstatSync } from 'node:fs';
import {
  proveRepoFile,
  readProvenRepoFile,
  removeProvenRepoFile,
  revalidateRepoFile,
} from '../../../shared/common/repo-file-identity.ts';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';
import type { CoverageAdapter } from './coverage-adapter.types.ts';

type ArtifactOperation = { ok: true } | { ok: false; detail: string };
type ArtifactRead = { ok: true; content: string; mtimeMs: number } | { ok: false; detail: string };

/** @purpose Proven repository-local artifact names plus identity-safe lifecycle operations. */
interface CoverageArtifactBoundary {
  /** Adapter-owned repo-relative report path. */
  reportRelative: string;
  /** Adapter-owned absolute report path, proven below root without symlink components. */
  reportAbsolute: string;
  /** Adapter-owned repo-relative optional test-results path. */
  testResultsRelative: string;
  /** Adapter-owned absolute optional test-results path. */
  testResultsAbsolute: string;
  /** Repo-relative generated trees allowed while the producer runs. */
  writableDirectories: readonly string[];
  /**
   * @purpose Remove old report/results without following or racing symlinks, then revalidate writable trees.
   * @returns Success only when both old artifacts are safely absent and producer paths remain safe.
   */
  clearProducerArtifacts(): ArtifactOperation;
  /**
   * @purpose Read exactly the current regular report through an identity-checked descriptor.
   * @returns Proven bytes or one fail-closed path/identity diagnostic.
   */
  readReport(): ArtifactRead;
  /**
   * @purpose Read optional test results through the same identity boundary.
   * @returns Proven bytes or one fail-closed path/identity diagnostic.
   */
  readTestResults(): ArtifactRead;
}

/**
 * @purpose Build one fail-closed artifact boundary from the selected adapter registry entry.
 * @param root Exact repository root.
 * @param adapter Selected platform adapter.
 * @returns Proven artifact lifecycle or one unsafe adapter/path reason.
 */
export function createCoverageArtifactBoundary(
  root: string,
  adapter: CoverageAdapter
): { ok: true; boundary: CoverageArtifactBoundary } | { ok: false; detail: string } {
  const artifacts = adapter.artifacts(root);
  const report = inspectRepoPath(root, artifacts.report, 'potential');
  if (!report.ok) return { ok: false, detail: `coverage report path: ${report.detail}` };
  const testResults = inspectRepoPath(root, artifacts.testResults, 'potential');
  if (!testResults.ok) return { ok: false, detail: `test-results path: ${testResults.detail}` };
  for (const directory of artifacts.writableDirectories) {
    const inspected = inspectRepoPath(root, directory, 'potential');
    if (!inspected.ok) {
      return { ok: false, detail: `writable artifact directory ${directory}: ${inspected.detail}` };
    }
  }

  const readArtifact = (relativePath: string, label: string): ArtifactRead => {
    const identity = proveRepoFile(root, relativePath);
    if (!identity.ok) return { ok: false, detail: `${label}: ${identity.detail}` };
    const read = readProvenRepoFile(identity.identity);
    if (!read.ok) return { ok: false, detail: `${label}: ${read.detail}` };
    const current = revalidateRepoFile(identity.identity);
    if (!current.ok) return { ok: false, detail: `${label}: ${current.detail}` };
    const stat = lstatSync(identity.identity.absolute);
    if (stat.dev !== identity.identity.dev || stat.ino !== identity.identity.ino) {
      return { ok: false, detail: `${label}: file identity changed after it was read` };
    }
    return { ok: true, content: read.content, mtimeMs: stat.mtimeMs };
  };
  const clearArtifact = (relativePath: string, label: string): ArtifactOperation => {
    const current = inspectRepoPath(root, relativePath, 'potential');
    if (!current.ok) return { ok: false, detail: `${label}: ${current.detail}` };
    if (!existsSync(current.absolute)) return { ok: true };
    const identity = proveRepoFile(root, relativePath);
    if (!identity.ok) return { ok: false, detail: `${label}: ${identity.detail}` };
    const removed = removeProvenRepoFile(identity.identity);
    if (!removed.ok) return { ok: false, detail: `${label}: ${removed.detail}` };
    const absent = inspectRepoPath(root, relativePath, 'missing');
    return absent.ok ? { ok: true } : { ok: false, detail: `${label}: ${absent.detail}` };
  };

  return {
    ok: true,
    boundary: {
      reportRelative: report.relative,
      reportAbsolute: report.absolute,
      testResultsRelative: testResults.relative,
      testResultsAbsolute: testResults.absolute,
      writableDirectories: [...artifacts.writableDirectories],
      clearProducerArtifacts() {
        const reportClear = clearArtifact(report.relative, 'coverage report');
        if (!reportClear.ok) return reportClear;
        const resultsClear = clearArtifact(testResults.relative, 'test-results artifact');
        if (!resultsClear.ok) return resultsClear;
        for (const directory of artifacts.writableDirectories) {
          const current = inspectRepoPath(root, directory, 'potential');
          if (!current.ok) {
            return {
              ok: false,
              detail: `writable artifact directory ${directory}: ${current.detail}`,
            };
          }
        }
        return { ok: true };
      },
      readReport: () => readArtifact(report.relative, 'coverage report'),
      readTestResults: () => readArtifact(testResults.relative, 'test-results artifact'),
    },
  };
}
