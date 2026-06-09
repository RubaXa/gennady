// @file: DefinitionsBlock — transparent wrapper rendering children inside <Definitions> group.
// @consumers: directives, external consumers
// @tasks: TSK-75

import type { ReactNode } from 'react';
import { Group } from '../../prompt-kit/elements/group.js';

/** @purpose Transparent block that wraps Definition children in a <Definitions> group section. */
export const DefinitionsBlock = (props: { children: ReactNode }) => (
  <Group is="Definitions">{props.children}</Group>
);
