// @file: Core types for prompt-kit — PromptElement, JSXNode, RenderContext, TFormatEngine contract
// @consumers: prompt-kit module
// @tasks: TSK-64

/** @purpose Runtime brand symbol marking an object as a prompt element factory. */
export const PROMPT_ELEMENT_SYMBOL = Symbol.for('prompt-element');

/**
 * @purpose Configuration for a prompt element: role, format-specific rendering options.
 * @invariant role determines which TFormatEngine method is dispatched by TreeWalker.
 */
export type PromptElementConfig<Props extends Record<string, unknown> = Record<string, unknown>> = {
  /** @purpose Role determining which TFormatEngine method is dispatched | @invariant One of root|section|list|block|inline */
  role: 'root' | 'section' | 'list' | 'block' | 'inline';
  tagName?: string;  /** @purpose Markdown-specific rendering options: title extractor, wrapper, ordered flag, lang, boundary comments */
  markdown?: {
    /** @purpose Extract title from props for section heading | @sideEffect none */
    title?: (ctx: { tagName: string; props: Props; depth: number }) => string;
    /** @purpose Render children with custom wrapper for inline elements */
    renderChildren?: (ctx: { children: string; props: Props }) => string;
    /** @purpose Symmetric wrapper for inline elements (e.g. '**' for bold) */
    wrapper?: string;
    /** @purpose Whether list is ordered | @invariant default false */
    ordered?: boolean;
    /** @purpose Language identifier for code block syntax highlighting */
    lang?: string;
    /** @purpose Emit START_/END_ boundary comments around section */
    includeBoundaryComments?: boolean;
  };
  /** @purpose HTML-specific rendering options: tag name override */
  html?: {
    /** @purpose Override the HTML tag name | @invariant Falls back to element.tagName when absent */
    tag?: string;
  };
};

/**
 * @purpose Branded factory object created by definePromptElement; carries config and identifies as prompt-element.
 * @invariant Detected by ElementResolver via PROMPT_ELEMENT_SYMBOL property.
 */
export type PromptElement = {
  /** @purpose Call signature — makes the type valid as a JSX element type. Returns React-compatible JSX.Element */
  (props?: Record<string, unknown>): any;
  /** @purpose Unique brand identifying this object as a prompt element factory */
  readonly [PROMPT_ELEMENT_SYMBOL]: true;
  /** @purpose Kebab-case tag name derived from the role */
  readonly tagName: string;
  /** @purpose Configuration carrying role and format-specific rendering options */
  readonly config: PromptElementConfig;
};

/**
 * @purpose Canonical JSX tree node after normalization — uniform {type, props, children} shape.
 * @invariant children is always defined as JSXNode[]; type may be PromptElement, string, function, or undefined.
 */
export type JSXNode = {
  /** @purpose Element factory (PromptElement), HTML tag name (string), transparent function, or undefined (skip) */
  type: unknown;
  /** @purpose Key-value attributes from JSX — filtered of null/undefined, used by formatters */
  props: Record<string, unknown>;
  /** @purpose Normalized child nodes array — always defined, may be empty */
  children: JSXNode[];
};

/**
 * @purpose Context propagated top-down during tree traversal.
 * @invariant depth increments for section children; inList set true for list children.
 */
export type RenderContext = {
  /** @purpose Current nesting depth | @invariant Starts at 0; increments for section children */
  depth: number;
  /** @purpose Whether the current node is inside a list | @invariant Set true when processing list children */
  inList: boolean;
  /** @purpose Target output format */
  format: 'xml' | 'md';
};

/**
 * @purpose Contract for format engines called by TreeWalker during role-based dispatch.
 * @invariant Each method receives context, pre-rendered children, the element factory, and node props.
 */
export interface TFormatEngine {
  /**
   * @purpose Render a section element with heading, optional anchors, and indented children.
   * @param ctx Current render context with depth and format
   * @param children Pre-rendered children string
   * @param element PromptElement factory carrying config
   * @param props Node-level props from the JSX invocation
   * @returns Rendered section output string
   */
  formatSection(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string;
  /**
   * @purpose Render a list element with ordered/unordered items and optional title.
   * @param ctx Current render context with inList flag
   * @param children Pre-rendered children string
   * @param element PromptElement factory carrying config
   * @param props Node-level props from the JSX invocation
   * @returns Rendered list output string
   */
  formatList(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string;
  /**
   * @purpose Render a block element (code block) with optional language and title.
   * @param ctx Current render context
   * @param children Pre-rendered children string
   * @param element PromptElement factory carrying config
   * @param props Node-level props from the JSX invocation
   * @returns Rendered block output string
   */
  formatBlock(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string;
  /**
   * @purpose Render an inline element with a symmetric text wrapper.
   * @param ctx Current render context
   * @param children Pre-rendered children string
   * @param element PromptElement factory carrying config
   * @param props Node-level props from the JSX invocation
   * @returns Rendered inline output string
   */
  formatInline(
    ctx: RenderContext,
    children: string,
    element: PromptElement,
    props: Record<string, unknown>
  ): string;
}

/**
 * @purpose Renderer function for an HTML tag — receives context, raw children, props, and a walk callback.
 * @invariant The walk callback must be called to recursively render children that are not plain text.
 */
export type HtmlTagRenderer = (
  ctx: RenderContext,
  rawChildren: JSXNode[],
  props: Record<string, unknown>,
  walkChildren: (children: JSXNode[], ctx: RenderContext) => string
) => string;
