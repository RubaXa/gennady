import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../shared/common/logger.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

type PublishArtifactCopyPair = {
  source: string;
  target: string;
};

const copyPairs: PublishArtifactCopyPair[] = [
  {
    source: path.join(projectRoot, 'cli/utils/prompts/agent'),
    target: path.join(projectRoot, 'dist/chunks/agent'),
  },
  {
    source: path.join(projectRoot, 'cli/utils/prompts/commit'),
    target: path.join(projectRoot, 'dist/chunks/commit'),
  },
  {
    source: path.join(projectRoot, 'cli/utils/prompts/review'),
    target: path.join(projectRoot, 'dist/chunks/review'),
  },
  {
    source: path.join(projectRoot, 'cli/utils/review-gen/specs'),
    target: path.join(projectRoot, 'dist/chunks/specs'),
  },
  {
    source: path.join(projectRoot, 'ai/agents/agent-review-verifier.xml'),
    target: path.join(projectRoot, 'dist/ai/agents/agent-review-verifier.xml'),
  },
  {
    source: path.join(projectRoot, 'ai/agents/agent-resolve-conflicts.xml'),
    target: path.join(projectRoot, 'dist/ai/agents/agent-resolve-conflicts.xml'),
  },
];

/**
 * @purpose Подготовить runtime-артефакты в dist перед публикацией npm-пакета.
 * @consumer build:publish
 * @sideEffect Filesystem: копирование prompts/specs/xml в dist; Console: структурированные логи.
 */
function preparePublishArtifacts(): void {
  logger.info(`[preparePublishArtifacts] [idle → copying] Copy publish runtime assets`, {
    pairs: copyPairs.length,
  });

  for (const { source, target } of copyPairs) {
    if (!existsSync(source)) {
      throw new Error(`Missing publish artifact source: ${source}`);
    }

    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }

  logger.info(`[preparePublishArtifacts] [copying → completed] Publish assets prepared`, {
    pairs: copyPairs.length,
  });
}

try {
  preparePublishArtifacts();
} catch (cause) {
  logger.error(`[preparePublishArtifacts] [copying → failed] Failed to prepare publish assets`, {
    cause,
  });
  process.exit(1);
}
