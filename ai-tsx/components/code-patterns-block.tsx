// @file: CodePatternsBlock — transparent wrapper rendering children inside <CodePatterns> group.
// @consumers: directives, external consumers
// @tasks: TSK-75

import type { ReactNode } from 'react';
import { Group } from '../../prompt-kit/elements/group.js';

/** @purpose Transparent block that wraps Pattern children in a <CodePatterns> group section. */
export const CodePatternsBlock = (props: { children: ReactNode }) => (
  <Group is="CodePatterns">{props.children}</Group>
);
