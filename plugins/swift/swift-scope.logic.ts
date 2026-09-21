// @file: Exact file scope resolution for Swift verification gates.
// @spec: CLI-VERIFY
// @consumers: swift-plugin, swift-plan.logic

import fs from 'node:fs';
import path from 'node:path';
import { execFileTrimSafe } from 'gennady/stack';
import type { ScopeRequest, StackScope } from 'gennady/stack';
import { isSwiftBuildDefinitionPath, type SwiftProject } from './swift-detect.logic.ts';

/** Plugin-owned Swift scope payload. */
export type SwiftScope = StackScope & {
  readonly details: { readonly files: readonly string[]; readonly repoWide: boolean };
};

function swiftFiles(root: string, targets: readonly string[]): string[] {
  return [
    ...new Set(
      targets
        .filter((file) => file.endsWith('.swift'))
        .map((file) => path.resolve(root, file))
        .filter((file) => fs.existsSync(file))
    ),
  ].sort();
}

function gitOrEmpty(args: readonly string[], root: string): string {
  return execFileTrimSafe('git', args, root);
}

function detectBaseRef(root: string): string {
  const remoteHead = gitOrEmpty(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], root);
  if (remoteHead.startsWith('refs/remotes/')) return remoteHead.slice('refs/remotes/'.length);
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (gitOrEmpty(['rev-parse', '--verify', '--quiet', ref], root).length > 0) return ref;
  }
  return 'HEAD';
}

function collectChangedPaths(root: string): { readonly paths: string[]; readonly baseRef: string } {
  const baseRef = detectBaseRef(root);
  const mergeBase = gitOrEmpty(['merge-base', baseRef, 'HEAD'], root);
  const diffBase = mergeBase || baseRef;
  const output = [
    gitOrEmpty(['diff', '--name-only', '--relative', '--diff-filter=ACMR', diffBase], root),
    gitOrEmpty(['diff', '--name-only', '--relative', '--diff-filter=ACMR', '--cached'], root),
    gitOrEmpty(['ls-files', '--others', '--exclude-standard'], root),
  ].join('\n');
  return {
    baseRef,
    paths: [
      ...new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      ),
    ].sort(),
  };
}

/**
 * @purpose Resolve explicit/changed/all scope while keeping build/test repository-wide.
 * @param project Detected Swift project.
 * @param request Requested scope.
 * @returns Stable Swift source subset for formatter/linter gates.
 */
export function resolveSwiftScope(project: SwiftProject, request: ScopeRequest): SwiftScope {
  const changed = request.mode === 'changed' ? collectChangedPaths(project.root) : null;
  const targets = changed?.paths ?? request.targets;
  const repoWide =
    request.mode === 'all' || targets.some((target) => isSwiftBuildDefinitionPath(target));
  const files = swiftFiles(project.root, targets);
  return {
    mode: request.mode,
    note: repoWide
      ? `${request.mode} repository scope${changed ? ` vs ${changed.baseRef}` : ''}`
      : files.length > 0
        ? `${files.length} Swift file(s)`
        : '0 Swift file(s)',
    details: { files, repoWide },
  };
}
