import { existsSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../shared/common/logger.ts';
import { pluginPublishAssets } from '../services/plugins/plugin-assets.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/**
 * @purpose Очистить временные publish-артефакты после публикации.
 * @consumer postpublish
 * @sideEffect Filesystem: удаление dist и tarball-архивов; Console: структурированные логи.
 */
function cleanupPublishArtifacts(): void {
  logger.info(`[cleanupPublishArtifacts] [idle → cleaning] Cleanup publish artifacts`);

  // Staged plugin assets are removed by their exact derived paths, never by a glob over ai/:
  // that tree is tracked, and a wildcard here would delete files the repository owns.
  const staged = pluginPublishAssets(projectRoot);
  for (const { target } of staged) {
    rmSync(path.join(projectRoot, target), { force: true });
  }
  for (const dir of [...new Set(staged.map(({ target }) => path.dirname(target)))].sort(
    (a, b) => b.length - a.length
  )) {
    try {
      rmdirSync(path.join(projectRoot, dir));
    } catch {
      // Directory still holds files the repository owns — leaving it is correct.
    }
  }
  logger.info(`[cleanupPublishArtifacts] [cleaning → cleaning] Removed staged plugin assets`, {
    assets: staged.length,
  });

  const distPath = path.join(projectRoot, 'dist');
  if (existsSync(distPath)) {
    rmSync(distPath, { recursive: true, force: true });
    logger.info(`[cleanupPublishArtifacts] [cleaning → cleaning] Removed dist/`);
  }

  const tarballs = readdirSync(projectRoot).filter((entry) => entry.endsWith('.tgz'));
  for (const tarballName of tarballs) {
    rmSync(path.join(projectRoot, tarballName), { force: true });
    logger.info(`[cleanupPublishArtifacts] [cleaning → cleaning] Removed tarball`, {
      tarballName,
    });
  }

  logger.info(`[cleanupPublishArtifacts] [cleaning → completed] Publish cleanup completed`, {
    tarballsRemoved: tarballs.length,
  });
}

try {
  cleanupPublishArtifacts();
} catch (cause) {
  logger.error(`[cleanupPublishArtifacts] [cleaning → failed] Failed to cleanup publish assets`, {
    cause,
  });
  process.exit(1);
}
