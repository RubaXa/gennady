// @file: StackPlugin implementation for Go repositories — wires detect, scope and plan.
// @consumers: stack-registry
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import type { StackDetection, StackPlugin } from '../../stack.types.ts';
import { detectGoProject, type GoProject } from './golang-detect.logic.ts';
import { resolveGoScope, type GoScope } from './golang-scope.logic.ts';
import { planGoGates, scopeHasGoGenerate, buildGoGenerateArgv } from './golang-plan.logic.ts';

/**
 * @purpose Build the `key: value` summary lines shown by `verify --plan` for a Go project.
 * @param project Detected project.
 * @returns Human-readable summary lines.
 */
function summarize(project: GoProject): string[] {
  const primary = project.modules[0];
  const lines = [
    `module:    ${primary?.path ?? '(unknown)'} (go ${primary?.goVersion || '?'})`,
    `workspace: ${project.workspace ?? '(none)'}`,
    `vendored:  ${project.vendored}`,
    `lint-cfg:  ${project.golangciConfig ?? '(none found — golangci-lint would use its defaults)'}`,
  ];

  if (project.modules.length > 1) {
    const nested = project.modules
      .slice(1)
      .map((module) => path.relative(project.root, module.dir) || '.');
    lines.splice(1, 0, `nested:    ${nested.join(', ')}`);
  }
  if (project.makeTargets.length > 0) {
    const shown = project.makeTargets.slice(0, 8);
    const more = project.makeTargets.length - shown.length;
    lines.push(`make:      ${shown.join(', ')}${more > 0 ? ` … (+${more} more)` : ''}`);
  }

  return lines;
}

/**
 * @purpose StackPlugin for Go repositories. Detection: `<root>/go.mod` exists (spec §3) —
 *   deeper scanning only feeds informational diagnostics, never the detection decision.
 * @implements {StackPlugin} in specs/stack/stack.spec.md
 * @invariant detect() runs no processes beyond the golangci-lint version probe.
 * @consumer stack-registry
 */
export const golangPlugin: StackPlugin = {
  id: 'golang',
  marker: 'go.mod',
  description:
    'go generate (sandboxed drift), go build, go vet, gofmt -l, golangci-lint, go test; changed-package scoping',

  detect(root: string): StackDetection | null {
    if (!fs.existsSync(path.join(root, 'go.mod'))) {
      return null;
    }

    const project = detectGoProject(root);
    return {
      stack: 'golang',
      root,
      summary: summarize(project),
      diagnostics: project.diagnostics,
      details: project,
    };
  },

  verify: {
    resolveScope(detection, request) {
      const scope = resolveGoScope(detection.details as GoProject, request);
      return { mode: scope.mode, note: scope.note, details: scope };
    },

    planGates(detection, scope, options) {
      return planGoGates(detection.details as GoProject, scope.details as GoScope, options);
    },
  },

  fix: {
    planFixers(detection, scope) {
      const project = detection.details as GoProject;
      const goScope = scope.details as GoScope;
      const argv = buildGoGenerateArgv(project, goScope);
      // The fixer counterpart of the sandboxed generate gate: same command, REAL tree.
      return [
        {
          id: 'generate',
          stack: 'golang',
          label: 'go generate (materialize into the working tree)',
          argv: argv ?? [],
          cwd: project.root,
          timeoutMs: 5 * 60_000,
          outputMeansFailure: false,
          skipped:
            argv === null
              ? 'go toolchain not found in PATH'
              : goScope.packages.length === 0
                ? `no packages in scope (${goScope.note})`
                : scopeHasGoGenerate(project, goScope)
                  ? null
                  : 'no //go:generate directives in scope',
        },
      ];
    },
  },
};
