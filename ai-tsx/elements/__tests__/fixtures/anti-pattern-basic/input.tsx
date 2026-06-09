import React from 'react';
import { AntiPattern } from '../../../anti-pattern.js';
import { Good } from '../../../good.js';
import { Node } from '../../../../../prompt-kit/elements/group.js';

export default (
  <AntiPattern id="AP_EXAMPLE">
    <Node is="Bad">console.log(JSON.stringify(obj))</Node>
    <Node is="WhyBad">console.* forbidden.</Node>
    <Good language="typescript">logger.debug('ok')</Good>
  </AntiPattern>
);
