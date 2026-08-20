import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../shared/common/logger.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/**
 * @purpose Очистить временные publish-артефакты после публикации.
 * @consumer postpublish
 * @sideEffect Filesystem: удаление dist и tarball-архивов; Console: структурированные логи.
 */
function cleanupPublishArtifacts(): void {
  logger.info(`[cleanupPublishArtifacts] [idle → cleaning] Cleanup publish artifacts`);

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
