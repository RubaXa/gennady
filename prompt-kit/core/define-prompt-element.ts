// @file: definePromptElement factory — creates a branded prompt element from a config
// @consumers: prompt-kit elements, external consumers
// @tasks: TSK-64

import { PROMPT_ELEMENT_SYMBOL } from './types.js';
import type { PromptElement, PromptElementConfig } from './types.js';

/**
 * @purpose Creates a branded prompt element factory from configuration.
 * @param config Element role and format-specific rendering options
 * @returns Branded PromptElement object usable as JSX node type
 */
export function definePromptElement<
  Props extends Record<string, unknown> = Record<string, unknown>,
>(config: PromptElementConfig<Props>): PromptElement {
  // purpose: derive a stable kebab-case tag name from the role
  const tagName = (config as any).tagName || config.role;

  return {
    [PROMPT_ELEMENT_SYMBOL]: true as const,
    tagName,
    config,
  } as PromptElement;
}
