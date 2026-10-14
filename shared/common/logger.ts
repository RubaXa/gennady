// @file: Backward-compatible logger entry for shared domain code.
// @spec: SHARED
// @consumers: cat-gen, cat-url.fn, commit-gen, exec, git-core

/**
 * @purpose Backward-compatible logger entry for shared domain code.
 * @invariant Exports the stable `logger` contract expected by imports like `@shared/common/logger.ts`.
 */
export { logger } from '../../services/logger/logger.ts';
export type { SimpleLogger } from '../../services/logger/logger.ts';
