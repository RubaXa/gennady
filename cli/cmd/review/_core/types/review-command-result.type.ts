import type { ReviewArtifact } from './review-artifact.type.ts';

/**
 * @purpose Результат выполнения review-команды.
 * @consumer review-verify.cmd, review-issues.cmd
 */
export type ReviewCommandResult = {
  ok: boolean;
  code: number;
  output?: string;
  artifact?: ReviewArtifact;
};
