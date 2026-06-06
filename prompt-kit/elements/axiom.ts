// @file: Axiom element — individually addressable axiom with id-based title and anchors
// @consumers: prompt-kit module
// @tasks: TSK-65

import { definePromptElement } from '../core/define-prompt-element.js';

/**
 * @purpose Section for a single axiom identified by a mandatory id. The id is embedded in the Markdown heading and XML attribute.
 */
export const Axiom = definePromptElement({ tagName: 'Axiom',
  role: 'section',
  markdown: {
    title: (props: Record<string, unknown>) => `AXIOM \`${props.id}\``,
    includeBoundaryComments: true,
  },
});
