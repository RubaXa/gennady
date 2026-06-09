import React from 'react';
import { Group } from '../../../../../prompt-kit/elements/group.js';
import { AntiPattern } from '../../../../elements/anti-pattern.js';
import { Node } from '../../../../../prompt-kit/elements/group.js';

export default (
  <Group is="AntiPatterns">
    <AntiPattern id="AP_TEST">
      <Node is="Bad">Bad pattern.</Node>
    </AntiPattern>
  </Group>
);
