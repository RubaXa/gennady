// @file: Выполнить pipeline resolve-conflicts и вернуть финальный prompt.
// @consumers: resolve-conflicts.cmd
// @tasks: N/A

import { style } from '../../../../../shared/common/style.ts';
import { buildResolveConflictsContextGit } from './resolve-conflicts-context-git-build.logic.ts';
import { buildResolveConflictsArtifactXml } from '../xml/resolve-conflicts-artifact-build.xml.ts';
import { renderResolveConflictsXml } from '../xml/resolve-conflicts-render.xml.ts';
import type { ResolveConflictsCommandArgs } from '../types/resolve-conflicts-command-args.type.ts';
import type { ResolveConflictsCommandResult } from '../types/resolve-conflicts-command-result.type.ts';

/**
 * @purpose Выполнить pipeline resolve-conflicts и вернуть финальный prompt.
 * @consumer resolve-conflicts.cmd
 * @param args Нормализованные аргументы запуска.
 * @returns Код выполнения и готовый output.
 */
export async function runResolveConflictsCommand(
  args: ResolveConflictsCommandArgs
): Promise<ResolveConflictsCommandResult> {
  try {
    const resolveConflictsContextGit = buildResolveConflictsContextGit(args);
    const resolveConflictsArtifactXml = buildResolveConflictsArtifactXml(
      resolveConflictsContextGit
    );
    const output = await renderResolveConflictsXml(resolveConflictsArtifactXml);

    return {
      ok: true,
      code: 0,
      output,
      artifact: {
        resolveConflictsContextGit,
        resolveConflictsArtifactXml,
      },
    };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    console.error(style.redBright.bold('✖ Ошибка:'), message);
    return {
      ok: false,
      code: 1,
    };
  }
}
