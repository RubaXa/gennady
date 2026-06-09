// @file: AntiPatternsBlock — transparent wrapper rendering children inside <AntiPatterns> group.
// @consumers: directives, external consumers
// @tasks: TSK-75

import type { ReactNode } from 'react';
import { Group } from '../../prompt-kit/elements/group.js';

/** @purpose Transparent block that wraps AntiPattern children in an <AntiPatterns> group section. */
export const AntiPatternsBlock = (props: { children: ReactNode }) => (
  <Group is="AntiPatterns">{props.children}</Group>
);
