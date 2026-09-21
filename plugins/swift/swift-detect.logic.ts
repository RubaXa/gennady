// @file: Deterministic Swift/Xcode/Tuist project and tool detection for the Swift stack plugin.
// @spec: CLI-VERIFY
// @consumers: swift-plugin, swift-plan.logic, Swift readiness and receipt fingerprinting

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { execFileTrimSafe } from 'gennady/stack';
import type { StackDiagnostic } from 'gennady/stack';

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.build',
  'build',
  'DerivedData',
  'node_modules',
  'vendor',
]);

const BUILD_DEFINITION_NAMES = new Set([
  '.mise.toml',
  'Config.swift',
  'Dependencies.swift',
  'Package.resolved',
  'Package.swift',
  'Project.swift',
  'Workspace.swift',
  'project.yml',
  'project.yaml',
]);

/** External tool used by the Swift plugin. */
export type SwiftToolId = 'swift' | 'swiftformat' | 'swiftlint' | 'xcodebuild';

/** One resolved Swift tool without executing repository code. */
export type SwiftTool = {
  readonly id: SwiftToolId;
  readonly bin: string | null;
};

/** Deterministic facts shared by Swift planning, readiness, and receipts. */
export type SwiftProject = {
  readonly root: string;
  readonly kind: 'package' | 'xcode';
  readonly markers: readonly string[];
  readonly manifests: readonly string[];
  readonly tools: Readonly<Record<SwiftToolId, SwiftTool>>;
  readonly diagnostics: readonly StackDiagnostic[];
};

/** One unusable required toolchain command, separated from an absent binary. */
export type SwiftToolchainIssue = {
  /** Tool whose version command could not establish an executable environment. */
  readonly tool: 'swift' | 'xcodebuild';
  /** Missing means PATH resolution failed; broken means the resolved command did not produce a version. */
  readonly kind: 'missing' | 'broken';
  /** Stable operator-facing reason without treating the repository as defective. */
  readonly detail: string;
};

/** Result shared by readiness and the receipt environment fingerprint. */
type SwiftToolchainProbe =
  | { readonly ok: true; readonly swiftVersion: string; readonly xcodebuildVersion: string }
  | { readonly ok: false; readonly issues: readonly SwiftToolchainIssue[] };

function relativePath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

/**
 * @purpose Recognize a repo-relative Swift/Xcode/Tuist build-definition path.
 * @param relative Repo-relative path using either platform separator.
 * @returns True when changing this file invalidates repository-wide Swift scope and receipts.
 */
export function isSwiftBuildDefinitionPath(relative: string): boolean {
  const normalized = relative.split(path.sep).join('/');
  const basename = path.basename(normalized);
  return (
    BUILD_DEFINITION_NAMES.has(basename) ||
    normalized.endsWith('.xcodeproj/project.pbxproj') ||
    normalized.endsWith('.xcworkspace/contents.xcworkspacedata') ||
    normalized.endsWith('.xctestplan') ||
    (normalized.startsWith('Tuist/') && basename.endsWith('.swift'))
  );
}

/**
 * @purpose Discover every repo-relative Swift/Xcode/Tuist build-definition manifest and lock.
 * @invariant Output is sorted and stable; generated dependency/build trees are never traversed.
 * @param root Repository root.
 * @returns Complete deterministic manifest set used by D-SWIFT-ENV.
 */
export function discoverSwiftBuildDefinitions(root: string): string[] {
  const files: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const directory = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) queue.push(absolute);
        continue;
      }
      if (entry.isFile() && isSwiftBuildDefinitionPath(relativePath(root, absolute))) {
        files.push(relativePath(root, absolute));
      }
    }
  }
  return files.sort();
}

function resolveTool(root: string, id: SwiftToolId): SwiftTool {
  const bin = execFileTrimSafe('which', [id], root).split(/\r?\n/, 1)[0]?.trim() || null;
  return { id, bin };
}

/**
 * @purpose Detect a Swift package or Xcode/Tuist repository and its local tool availability.
 * @param root Repository root.
 * @returns Swift project facts, or null without a canonical Swift/Xcode/Tuist marker.
 */
export function detectSwiftProject(root: string): SwiftProject | null {
  const manifests = discoverSwiftBuildDefinitions(root);
  const markers = manifests.filter(
    (file) =>
      file === 'Package.swift' ||
      file === 'Project.swift' ||
      file === 'Workspace.swift' ||
      file.endsWith('.xcodeproj/project.pbxproj') ||
      file.endsWith('.xcworkspace/contents.xcworkspacedata')
  );
  if (markers.length === 0) return null;

  const packageAtRoot = markers.includes('Package.swift');
  const xcodeMarker = markers.some(
    (file) =>
      file.endsWith('Project.swift') ||
      file.endsWith('Workspace.swift') ||
      file.includes('.xcodeproj/') ||
      file.includes('.xcworkspace/')
  );
  const kind = packageAtRoot && !xcodeMarker ? 'package' : 'xcode';
  const tools = {
    swift: resolveTool(root, 'swift'),
    swiftformat: resolveTool(root, 'swiftformat'),
    swiftlint: resolveTool(root, 'swiftlint'),
    xcodebuild: resolveTool(root, 'xcodebuild'),
  } as const;
  const diagnostics: StackDiagnostic[] = [];
  if (kind === 'package' && tools.swift.bin === null) {
    diagnostics.push({
      code: 'SWIFT_TOOLCHAIN_MISSING',
      message: 'Package.swift was detected but swift is not available in PATH',
      fix: 'Install the pinned Swift toolchain and make `swift --version` succeed',
      blocking: true,
    });
  }
  return { root, kind, markers, manifests, tools, diagnostics };
}

function probeVersion(
  tool: SwiftTool,
  flag: '--version' | '-version'
): { ok: true; value: string } | { ok: false; issue: SwiftToolchainIssue } {
  if (tool.bin === null) {
    return {
      ok: false,
      issue: {
        tool: tool.id as 'swift' | 'xcodebuild',
        kind: 'missing',
        detail: 'not found in PATH',
      },
    };
  }
  try {
    const value = execFileSync(tool.bin, [flag], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
    if (value.length === 0) throw new Error('version command produced no output');
    return { ok: true, value };
  } catch (cause) {
    return {
      ok: false,
      issue: {
        tool: tool.id as 'swift' | 'xcodebuild',
        kind: 'broken',
        detail: `${tool.id} ${flag} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    };
  }
}

/**
 * @purpose Establish that both required Swift receipt tools execute and identify their versions.
 * @param project Detected Swift project carrying the exact resolved tool paths.
 * @returns Both version strings, or every missing/broken tool issue from one bounded probe.
 */
export function probeSwiftToolchain(project: SwiftProject): SwiftToolchainProbe {
  const swift = probeVersion(project.tools.swift, '--version');
  const xcodebuild = probeVersion(project.tools.xcodebuild, '-version');
  const issues = [swift, xcodebuild].flatMap((result) => (result.ok ? [] : [result.issue]));
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        swiftVersion: swift.ok ? swift.value : '',
        xcodebuildVersion: xcodebuild.ok ? xcodebuild.value : '',
      };
}
