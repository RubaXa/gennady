import React from 'react';
import { Hook } from '../../../hook.js';
import { Node } from '../../../../../prompt-kit/elements/group.js';

export default (
  <Hook id="HOOK_TYPECHECK">
    <Node is="Purpose">Check type errors.</Node>
    <Node is="Command">npx tsc --noEmit</Node>
    <Node is="Expected">Exit 0.</Node>
  </Hook>
);
