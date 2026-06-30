// @file: Extract a named <!--SECTION:NAME--> block from an SDD markdown artifact — pure, shared by sdd-extract/sdd-check/sdd-task.
// @consumers: sdd-extract.cmd
// @tasks: N/A

/**
 * @purpose Canonical anchor-name grammar — uppercase, starts with a letter, then alnum + underscore.
 * @invariant Anchors are atomic identifiers — no quotes, spaces, or attributes inside the name.
 */
export const SECTION_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;

/**
 * @purpose Outcome of a section extraction, discriminated by `status`.
 * @invariant `ok` is the only status that carries `content`; every other status is a distinct, actionable failure.
 */
export type SectionResult =
  | { status: 'ok'; content: string }
  | { status: 'invalid_name' }
  | { status: 'not_found' }
  | { status: 'unbalanced'; startCount: number; endCount: number }
  | { status: 'duplicated'; count: number }
  | { status: 'empty' };

/**
 * @purpose Report whether a section name matches the canonical anchor grammar.
 * @param name Candidate section name.
 * @returns True when `name` matches SECTION_NAME_REGEX.
 */
export function isValidSectionName(name: string): boolean {
  return SECTION_NAME_REGEX.test(name);
}

/**
 * @purpose Extract the content between `<!--SECTION:NAME-->` and `<!--/SECTION:NAME-->`, excluding the marker lines.
 * @invariant Markers are matched by a whitespace-trimmed full-line compare, so leading indentation is tolerated.
 * @invariant A single balanced pair is required; zero, mismatched, or duplicate markers each map to a distinct status.
 * @param content Full markdown text of the artifact.
 * @param name Section name to extract; validated against the canonical grammar first.
 * @returns A SectionResult — `ok` with the inner content, or a failure status the caller renders into an actionable message.
 */
export function extractSection(content: string, name: string): SectionResult {
  if (!isValidSectionName(name)) return { status: 'invalid_name' };

  const startMarker = `<!--SECTION:${name}-->`;
  const endMarker = `<!--/SECTION:${name}-->`;

  const lines = content.split('\n');

  // #region START_MARKER_SCAN — invariant: count balanced open/close before extracting
  let startCount = 0;
  let endCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === startMarker) startCount++;
    else if (trimmed === endMarker) endCount++;
  }

  if (startCount === 0 && endCount === 0) return { status: 'not_found' };
  if (startCount !== endCount) return { status: 'unbalanced', startCount, endCount };
  if (startCount > 1) return { status: 'duplicated', count: startCount };
  // #endregion END_MARKER_SCAN

  // #region START_EXTRACT — invariant: collect lines strictly between the single marker pair
  const inner: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === startMarker) {
      inBlock = true;
      continue;
    }
    if (trimmed === endMarker) {
      inBlock = false;
      continue;
    }
    if (inBlock) inner.push(line);
  }
  // #endregion END_EXTRACT

  const body = inner.join('\n');
  if (body.trim() === '') return { status: 'empty' };
  return { status: 'ok', content: body };
}

/**
 * @purpose Locate the marker line indices of a section, for append-only edits before the close marker.
 * @invariant Returns null unless there is exactly one balanced, correctly-ordered marker pair.
 * @param content Full markdown text of the artifact.
 * @param name Section name; validated against the canonical grammar first.
 * @returns 0-based line indices of the open and close markers, or null when not a single clean pair.
 */
export function findSectionBounds(
  content: string,
  name: string
): { openLine: number; closeLine: number } | null {
  if (!isValidSectionName(name)) return null;

  const startMarker = `<!--SECTION:${name}-->`;
  const endMarker = `<!--/SECTION:${name}-->`;
  const lines = content.split('\n');

  let openLine = -1;
  let closeLine = -1;
  let opens = 0;
  let closes = 0;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === startMarker) {
      opens++;
      if (openLine === -1) openLine = i;
    } else if (trimmed === endMarker) {
      closes++;
      closeLine = i;
    }
  });

  if (opens !== 1 || closes !== 1 || closeLine < openLine) return null;
  return { openLine, closeLine };
}
