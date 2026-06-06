// @file: Axiom element — named axiom section with required id
// @consumers: prompt-kit consumers
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/** Props for the Axiom section element. */
export type AxiomProps = {
  /** Unique identifier used in MD heading (e.g. `AXIOM \`AX_SURGICAL\``) and anchor name. */
  id: string;
};

/** Named principle or rule. Renders id in MD heading and anchors. Includes boundary comments. */
export const Axiom = definePromptElement<AxiomProps>({
  tagName: 'Axiom',
  role: 'section',
  markdown: {
    title: ({ tagName, props }) => `${tagName} \`${props.id}\``,
    includeBoundaryComments: true,
  },
});
