// @file: Artifact-relative chat anchors with quote-first re-resolution.
// @consumers: OperatorSession, MutationFlow, inbox-dashboard
// @tasks: TSK-163

/** @purpose Character interval in the raw artifact, never a DOM position. */
export type AnchorFragment = {
  /** @purpose Zero-based raw-file start offset. */
  start: number;
  /** @purpose Exclusive raw-file end offset. */
  end: number;
};

/** @purpose Stable attachment for text and non-text chat context. */
export type Anchor =
  | { widgetId: string; artifactPath: string; fragment: AnchorFragment; quote: string }
  | { widgetId: string; elementId: string };

/** @purpose Observable result of resolving an anchor against the current widget payload. */
export type AnchorResolution =
  | { state: 'resolved'; anchor: Anchor; fragment?: AnchorFragment }
  | { state: 'stale'; anchor: Anchor };

/**
 * @purpose Resolve chat anchors after artifact updates without silently losing their thread context.
 * @invariant Text anchors prefer quote lookup; offsets only provide a fallback hint when no quote is present.
 */
export class AnchorResolver {
  /**
   * @purpose Resolve a text anchor against current raw artifact content.
   * @param anchor Text or element anchor to resolve.
   * @param [content] Current raw artifact content when resolving a text anchor.
   * @param [elementIds] Current non-text widget elements when resolving an element anchor.
   * @returns Resolved location or a visible stale marker.
   */
  resolve(anchor: Anchor, content?: string, elementIds: readonly string[] = []): AnchorResolution {
    if ('elementId' in anchor) {
      return elementIds.includes(anchor.elementId)
        ? { state: 'resolved', anchor }
        : { state: 'stale', anchor };
    }

    if (content === undefined) return { state: 'stale', anchor };
    const quoteOffset = content.indexOf(anchor.quote);
    if (quoteOffset >= 0) {
      return {
        state: 'resolved',
        anchor,
        fragment: { start: quoteOffset, end: quoteOffset + anchor.quote.length },
      };
    }

    // #region START_PRESERVE_OFFSET_HINT — offsets remain useful only when a historic anchor had no quote
    if (anchor.quote.length === 0 && anchor.fragment.end <= content.length) {
      return { state: 'resolved', anchor, fragment: anchor.fragment };
    }
    // #endregion END_PRESERVE_OFFSET_HINT
    return { state: 'stale', anchor };
  }
}
