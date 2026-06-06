// @file: prompt-kit core barrel — public surface: definePromptElement, renderPrompt, and internal exports
// @consumers: prompt-kit module
// @tasks: TSK-62, TSK-64

export { definePromptElement } from './define-prompt-element.js';
export { renderPrompt } from './render-prompt.js';
export { JSXTreeNormalizer } from './jsx-normalizer.js';
export { TreeWalker } from './tree-walker.js';
export { ElementResolver } from './element-resolver.js';
export { HTMLTagRegistry, htmlTagRegistry } from './html-tag-registry.js';
export { PROMPT_ELEMENT_SYMBOL } from './types.js';
export type {
  PromptElement,
  PromptElementConfig,
  JSXNode,
  RenderContext,
  TFormatEngine,
  HtmlTagRenderer,
} from './types.js';
