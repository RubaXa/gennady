// @file: Anchor comment builder — generates paired <!--START_X-->/<!--END_X--> comments with deduplication
// @consumers: MdFormatter
// @tasks: TSK-63

/**
 * @purpose Builds paired start/end anchor comments for Markdown boundary markers.
 * @invariant Anchor name = [tagName, ...sortedPropValues].join('_').toUpperCase() | Repeat calls with same parameters produce empty string (first-occurrence semantics) | Non-string prop values converted via String(value).
 */
export class AnchorBuilder {
  /** @purpose Tracks emitted anchor names for deduplication. */
  protected _emitted: Set<string> = new Set();

  /**
   * @purpose Generate a start anchor comment, deduplicating on first occurrence.
   * @param tagName Element tag name
   * @param props Element properties used in anchor name
   * @returns Anchor comment string or empty if already emitted
   */
  buildStart(tagName: string, props: Record<string, unknown>): string {
    const name = this._buildName(tagName, props);
    if (this._emitted.has(name)) return '';
    this._emitted.add(name);
    return `<!--START_${name}-->`;
  }

  /**
   * @purpose Generate an end anchor comment matching the start anchor.
   * @param tagName Element tag name
   * @param props Element properties used in anchor name
   * @returns End anchor comment string
   */
  buildEnd(tagName: string, props: Record<string, unknown>): string {
    const name = this._buildName(tagName, props);
    return `<!--END_${name}-->`;
  }

  /**
   * @purpose Build the canonical anchor name from tag and key-sorted prop values.
   * @param tagName Element tag name
   * @param props Element properties whose values contribute to the name
   * @returns Uppercase underscore-joined name
   */
  protected _buildName(tagName: string, props: Record<string, unknown>): string {
    const sortedPropValues = Object.keys(props)
      .sort()
      .map((k) => String(props[k]));
    return [tagName, ...sortedPropValues].join('_').toUpperCase();
  }
}
