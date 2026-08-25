// @file: StackPlugin implementation for npm repositories — gates from classified package.json scripts.
// @consumers: stack-registry, stack-config (gate id list)
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import type { StackDetection, StackDiagnostic, StackPlugin } from 'gennady/stack';
import {
  classifyNpmScripts,
  MUTATING_FLAG_RE,
  NPM_SCRIPT_CLASSES,
  type NpmScriptClass,
} from './classify-npm-scripts.ts';

/** Built-in node gate ids — the npm script classes, in run order. */
export const NODE_GATE_IDS: readonly NpmScriptClass[] = NPM_SCRIPT_CLASSES;

/** Default per-gate timeout for npm scripts (spec D-STACK-007). */
const NPM_GATE_TIMEOUT_MS = 10 * 60_000;

/**
 * @purpose Detection payload of the node plugin.
 * @consumer node-plugin (internal)
 */
type NodeProject = {
  /** @purpose Absolute repository root. */
  readonly root: string;
  /** @purpose Package name from package.json, when parseable. */
  readonly packageName: string;
  /** @purpose Selected npm script per verification class; empty when the manifest is broken. */
  readonly selected: Partial<Record<NpmScriptClass, string>>;
  /** @purpose Raw scripts map — bodies are screened for mutating flags at planning time. */
  readonly scripts: Readonly<Record<string, string>>;
};

/**
 * @purpose StackPlugin for npm repositories. Detection: `<root>/package.json` exists (spec §3) —
 *   a broken manifest does not un-detect the plugin; it surfaces as a planning diagnostic.
 * @implements {StackPlugin} in specs/stack/stack.spec.md
 * @invariant Gates are repo-level npm scripts; positional targets do not narrow them (D-STACK-006).
 * @consumer stack-registry
 */
export const nodePlugin: StackPlugin = {
  id: 'node',
  marker: 'package.json',
  description: 'gates from classified npm scripts (typecheck/gennady/lint/test/format)',

  gateIds: NODE_GATE_IDS,

  detect(root: string): StackDetection | null {
    const manifestPath = path.join(root, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    let packageName = '(unnamed)';
    let selected: Partial<Record<NpmScriptClass, string>> = {};
    let scripts: Record<string, string> = {};
    const diagnostics: StackDiagnostic[] = [];

    try {
      const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      packageName = pkg.name ?? '(unnamed)';
      scripts = pkg.scripts ?? {};
      selected = classifyNpmScripts(scripts);
      if (Object.keys(selected).length === 0) {
        diagnostics.push({
          code: 'NODE_NO_SCRIPTS',
          message: 'package.json has no scripts classifiable as verification gates.',
          fix: 'Add test/lint/typecheck scripts, or declare gates via stack.node.extraGates.',
        });
      }
    } catch {
      diagnostics.push({
        code: 'NODE_INVALID_MANIFEST',
        message: 'package.json exists but is not valid JSON — no npm gates can be planned.',
        fix: 'Fix the JSON; the node stack stays detected so the breakage is visible, not silent.',
      });
    }

    const project: NodeProject = { root, packageName, selected, scripts };
    const gateList = NODE_GATE_IDS.filter((cls) => selected[cls] !== undefined)
      .map((cls) => `${cls}→${selected[cls]}`)
      .join(', ');

    return {
      stack: 'node',
      root,
      summary: [
        `package:   ${packageName}`,
        `scripts:   ${gateList.length > 0 ? gateList : '(no verification scripts discovered)'}`,
      ],
      diagnostics,
      details: project,
    };
  },

  verify: {
    resolveScope(detection, request) {
      const project = detection.details as NodeProject;
      const selectedNames = Object.values(project.selected);
      // npm scripts are repo-level commands; explicit targets cannot narrow them (D-STACK-006).
      return {
        mode: request.mode,
        note: `npm scripts (${selectedNames.length > 0 ? selectedNames.join(', ') : 'none'}), repo-wide`,
        details: project,
      };
    },

    planGates(detection, _scope, _options) {
      const project = detection.details as NodeProject;

      return NODE_GATE_IDS.filter((cls) => project.selected[cls] !== undefined).map((cls) => {
        const name = project.selected[cls]!;
        // A gate must never rewrite the tree (D-STACK-005): mutating scripts become
        // visible skips; an overrideGates.argv (check-only form) supersedes the skip.
        const mutating = MUTATING_FLAG_RE.test(project.scripts[name] ?? '');
        return {
          id: cls,
          stack: 'node' as const,
          label: `npm run ${name}`,
          argv: mutating ? [] : ['npm', 'run', name],
          cwd: project.root,
          timeoutMs: NPM_GATE_TIMEOUT_MS,
          outputMeansFailure: false,
          skipped: mutating
            ? `npm script "${name}" mutates the tree (--fix/--autofix/--write) — provide a check-only argv via overrideGates, or move it to fixers`
            : null,
        };
      });
    },
  },
};
