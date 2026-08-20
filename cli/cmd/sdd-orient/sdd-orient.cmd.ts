// @file: SddOrientCommand — CLI entry for gennady sdd-orient: cheap depth-1 design-graph neighbourhood for one spec (module or scope), by path or by scope name.
// @consumers: gennady.ts

import { parseArgs } from '../../../shared/common/parse-args.ts';
import { resolveOrientTarget, type OrientResolution } from './core/resolve-target.ts';
import { buildNeighbourhood } from './core/build-neighbourhood.ts';
import { renderNeighbourhood } from './render/render-neighbourhood.ts';
import type { SddOrientOutcome } from './sdd-orient.types.ts';

/**
 * @purpose Render the tool-teaches message for a failed target resolution.
 * @param resolution The failed OrientResolution (never the `ok: true` variant).
 * @param arg The raw argument that failed to resolve.
 * @returns A one-paragraph message: what failed, and a concrete next command.
 */
function resolutionError(resolution: Exclude<OrientResolution, { ok: true }>, arg: string): string {
  if (resolution.reason === 'no-portal') {
    return (
      `[sdd-orient] error: cannot read "${arg}" as a spec file, and specs/README.md (the portal) ` +
      'is missing, so a scope name cannot be resolved either. Pass a real .spec.md path, or ' +
      'create the portal first (`npx gennady sdd-new portal`).'
    );
  }
  if (resolution.reason === 'unreadable-scope-spec') {
    return (
      `[sdd-orient] error: scope "${resolution.name}" is listed in specs/README.md's Scopes table, ` +
      `but its spec at "${resolution.specPath}" cannot be read — check that path in the portal.`
    );
  }
  const names = resolution.scopes.map((s) => s.name);
  const known = names.length > 0 ? names.join(', ') : '(таблица Scopes пуста)';
  return (
    `[sdd-orient] error: cannot read "${arg}" as a spec file, and it does not match a --scope name ` +
    `in specs/README.md's Scopes table. Known scopes: ${known}. Pass a real .spec.md path, or one ` +
    `of the scope names above with --scope.`
  );
}

/**
 * @purpose Execute gennady sdd-orient — resolve the target, build its depth-1 neighbourhood, render it.
 * @param rawArgs Raw command-line arguments (process.argv shape).
 * @param [root] Absolute project root — defaults to process.cwd().
 * @returns The rendered outcome (never throws).
 */
export async function run(
  rawArgs: string[],
  root: string = process.cwd()
): Promise<SddOrientOutcome> {
  const args = parseArgs(rawArgs, { scope: { aliases: ['scope'], takesValue: true } });
  const positional = (args._ as string[]).filter(
    (a) => typeof a === 'string' && a !== 'sdd-orient'
  );
  const scopeFlag = typeof args.scope === 'string' ? args.scope : undefined;

  const bothGiven = positional.length === 1 && scopeFlag !== undefined;
  const neitherGiven = positional.length === 0 && scopeFlag === undefined;
  if (positional.length > 1 || bothGiven || neitherGiven) {
    return {
      ok: false,
      exitCode: 4,
      message:
        '[sdd-orient] error: pass exactly one of <spec-path> (positional) or --scope <name>.\n' +
        'Usage: gennady sdd-orient <spec-path>\n' +
        '       gennady sdd-orient --scope <name>',
    };
  }

  const arg = scopeFlag ?? (positional[0] as string);
  const resolution = resolveOrientTarget(arg, root);
  if (!resolution.ok) return { ok: false, exitCode: 4, message: resolutionError(resolution, arg) };

  const neighbourhood = buildNeighbourhood(root, resolution.path, resolution.content);
  return { ok: true, text: renderNeighbourhood(neighbourhood) };
}

// Self-executing for CLI: gennady sdd-orient <spec-path> | --scope <name>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
