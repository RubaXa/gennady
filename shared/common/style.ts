// @file: Provide style chain for terminal text coloring, backed by `picocolors`.
// @consumers: cli commands (commit, cat, review, vcs-*, inbox, …)
// @tasks: N/A

import pc from 'picocolors';

/**
 * @purpose Fluent text styler — a color/modifier chain that applies on call, e.g.
 *   `style.red.bold('err')`, `style.cyan('ok')`.
 * @invariant Color support, `NO_COLOR`/`FORCE_COLOR` and TTY detection are delegated entirely to
 *   `picocolors` (this module adds no color logic of its own).
 */
type Styler = ((text: string) => string) & { [key: string]: Styler };

/**
 * @purpose Build a styler whose applied chain is the accumulated modifiers, ordered outer → inner.
 * @param modifiers Color/modifier functions collected so far.
 * @returns Callable styler that also exposes every further picocolors modifier fluently.
 */
function makeStyler(modifiers: Array<(text: string) => string>): Styler {
  const apply = (text: string): string => modifiers.reduce((acc, mod) => mod(acc), text);
  return new Proxy(apply as Styler, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (!Object.prototype.hasOwnProperty.call(pc, prop)) return undefined;
      const mod = (pc as unknown as Record<string, unknown>)[prop];
      if (typeof mod === 'function') {
        return makeStyler([...modifiers, mod as (text: string) => string]);
      }
      return undefined;
    },
  });
}

/**
 * @purpose Provide style chain for terminal text coloring.
 * @invariant Empty chain is the identity — `style('x')` returns `x` unchanged.
 * @consumer CLI commands and generators.
 */
export const style = makeStyler([]);
