// @file: Spacing engine — computes inter-element newline spacing based on role adjacency
// @consumers: XmlFormatter, MdFormatter
// @tasks: TSK-63

/** @purpose Role of a prompt tree element. */
export type Role = 'root' | 'section' | 'block' | 'inline' | 'list';

/**
 * @purpose Computes prefix and suffix spacing (newlines) between adjacent elements by role.
 * @invariant Inline elements always return empty spacing | Section→section: double newline; adjacent to block: double newline; after list: double newline; before list: single newline.
 */
export class SpacingEngine {
  /**
   * @purpose Compute spacing before an element based on previous sibling's role.
   * @param role Role of the current element
   * @param prevRole Role of the previous sibling, or null if first
   * @param depth Nesting depth
   * @returns Newline prefix string
   */
  before(role: Role, prevRole: Role | null, _depth: number): string {
    if (role === 'inline') return '';
    if (prevRole === null) return '';
    if (role === 'section' && prevRole === 'section') return '\n\n';
    if (role === 'block' || prevRole === 'block') return '\n\n';
    if (prevRole === 'list') return '\n\n';
    if (role === 'list') return '\n';
    return '\n';
  }

  /**
   * @purpose Compute spacing after an element based on next sibling's role.
   * @param role Role of the current element
   * @param nextRole Role of the next sibling, or null if last
   * @param depth Nesting depth
   * @returns Newline suffix string
   */
  after(role: Role, nextRole: Role | null, _depth: number): string {
    if (role === 'inline') return '';
    if (nextRole === null) return '';
    if (role === 'section' && nextRole === 'section') return '\n\n';
    if (role === 'block' || nextRole === 'block') return '\n\n';
    if (role === 'list') return '\n';
    if (nextRole === 'list') return '\n\n';
    return '\n';
  }
}
