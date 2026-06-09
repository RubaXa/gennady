// @file: DirectiveContextBlock — transparent wrapper rendering children inside <DirectiveContext> group.
// @consumers: directives, external consumers
// @tasks: TSK-75

import type { ReactNode } from 'react';
import { Group } from '../../prompt-kit/elements/group.js';

/** @purpose Transparent block that wraps directive context children (Mission, etc.) in a <DirectiveContext> group section. */
export const DirectiveContextBlock = (props: { children: ReactNode }) => (
  <Group is="DirectiveContext">{props.children}</Group>
);
