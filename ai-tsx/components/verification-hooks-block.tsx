// @file: VerificationHooksBlock — transparent wrapper rendering children inside <VerificationHooks> group.
// @consumers: directives, external consumers
// @tasks: TSK-75

import type { ReactNode } from 'react';
import { Group } from '../../prompt-kit/elements/group.js';

/** @purpose Transparent block that wraps Hook children in a <VerificationHooks> group section. */
export const VerificationHooksBlock = (props: { children: ReactNode }) => (
  <Group is="VerificationHooks">{props.children}</Group>
);
