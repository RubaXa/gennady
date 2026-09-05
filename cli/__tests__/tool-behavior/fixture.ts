// @file: General-purpose repo fixture for tool-behavior tests — a temp git repo whose package.json
//   scripts, gennady install, sdd-v2 directive stubs, and extra files (portal/tickets/coverage) are
//   all caller-supplied, so each test builds only the state its scenario actually needs.
// @consumers: tool-behavior/*.test.ts
// @tasks: N/A

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * @purpose `git` (and any other) subprocess env, scrubbed of the vars git exports into hooks —
 *   inheriting them redirects a fixture's own `git init`/`git commit` into the real repo's `.git`
 *   (see scripts/git-hooks/pre-commit's own comment on this exact failure mode).
 * @returns `process.env` minus every `GIT_*` key.
 */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

/** @purpose A no-op npm script body that exits with a fixed code — the fixture's default "check passes/fails" stand-in. */
export function noop(exitCode = 0): string {
  return `node -e "process.exit(${exitCode})"`;
}

/** @purpose An npm script body that first writes a one-byte marker file (proof it ran), then exits with `exitCode`. */
export function markerScript(markerName: string, exitCode = 0): string {
  return `node -e "require('fs').writeFileSync('${markerName}','x');process.exit(${exitCode})"`;
}

/** @purpose A `test:coverage` stand-in that actually writes a fresh `coverage/` artifact — satisfies sdd-verify's semantic freshness check — then exits with `exitCode`. */
export function coverageScript(exitCode = 0): string {
  return `node -e "require('fs').mkdirSync('coverage',{recursive:true});require('fs').writeFileSync('coverage/coverage-final.json','{}');process.exit(${exitCode})"`;
}

/** @purpose Declarative state for one fixture repo — every field optional, only what the scenario needs. */
export type RepoFixtureState = {
  /** @purpose package.json `scripts` map; omit for no scripts at all. */
  scripts?: Record<string, string>;
  /** @purpose package.json `name`; kept off `gennady` on purpose so gennady gates resolve via a local `npx gennady` stub, not self-hosting. */
  packageJsonName?: string;
  /** @purpose Skip writing package.json entirely — simulates "no package.json at project root". */
  noPackageJson?: boolean;
  /** @purpose Stub `node_modules/.bin/gennady` as a real, always-exit-0 executable — satisfies both readiness's install check and any `via: 'gennady'` gate the ladder runs. */
  gennadyInstalled?: boolean;
  /** @purpose Stub the sdd-v2 key directive files sdd-state's install gate checks for (content is irrelevant, only existence is). */
  directives?: boolean;
  /** @purpose Extra files to write verbatim, keyed by path relative to the fixture root (portal, tickets, coverage-final.json, source files, …). */
  files?: Record<string, string>;
  /** @purpose Whether to `git init` + commit everything — default true; set false when a scenario has no git-scoped tool in play. */
  git?: boolean;
};

/** @purpose The sdd-v2 key directive files sdd-state's install gate requires to exist (stubbed content). */
const KEY_DIRECTIVE_FILES = [
  'router.directive.xml',
  'execute.directive.xml',
  'phase-execution-protocol.directive.xml',
  'preflight-protocol.directive.xml',
  'formats/requirement-entry-format.xml',
];

/**
 * @purpose Build a fresh temp-dir repo fixture matching `state` — package.json, gennady stub,
 *   directive stubs, extra files, and (by default) a committed git history.
 * @invariant Every call gets its own fresh temp directory; nothing is shared across scenarios.
 * @param state Declarative fixture shape (see `RepoFixtureState`).
 * @returns The fixture's absolute root — the cwd every CLI invocation runs from.
 */
export function buildRepoFixture(state: RepoFixtureState = {}): { root: string } {
  const root = mkdtempSync(join(tmpdir(), 'gennady-tool-behavior-'));

  if (!state.noPackageJson) {
    const pkg = {
      name: state.packageJsonName ?? 'tool-behavior-fixture',
      private: true,
      type: 'module',
      scripts: state.scripts ?? {},
    };
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');
  }

  if (state.gennadyInstalled) {
    const binDir = join(root, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, 'gennady');
    // Real, executable, always-succeeds stub — `npx gennady <sub>` resolves this local bin without
    // ever reaching the network, so a `via: 'gennady'` ladder gate (e.g. yagni) passes deterministically.
    writeFileSync(binPath, '#!/usr/bin/env node\nprocess.exit(0);\n', 'utf-8');
    chmodSync(binPath, 0o755);
  }

  if (state.directives) {
    for (const f of KEY_DIRECTIVE_FILES) {
      const target = join(root, 'ai', 'directives', 'sdd-v2', f);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, '<Stub/>\n', 'utf-8');
    }
  }

  for (const [relPath, content] of Object.entries(state.files ?? {})) {
    const target = join(root, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }

  if (state.git !== false) {
    const env = cleanGitEnv();
    execFileSync('git', ['init', '-q'], { cwd: root, env });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, env });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: root, env });
    execFileSync('git', ['add', '-A'], { cwd: root, env });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root, env });
  }

  return { root };
}
