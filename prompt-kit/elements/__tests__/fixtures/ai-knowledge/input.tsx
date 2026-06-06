// @file: AiKnowledge JSX component — renders knowledge.xml structure via prompt-kit
// @consumers: ai-knowledge test
// @tasks: TSK-65

import type { JSXNode } from '../../core/types.js';

export type DirectiveItem = {
  file: string;
  purpose: string;
  triggers: string;
  skipWhen: string;
  preconditions: string;
};

export type DirectiveGroup = {
  group: string;
  items: DirectiveItem[];
};

export type RuleItem = {
  id: string;
  file: string;
  purpose: string;
  triggers: string;
  skipWhen: string;
  activationHint?: string;
  checkPhase?: string;
  requiresVerification?: string;
};

export type AiKnowledgeProps = {
  ver: string;
  directives: { group: string; items: DirectiveGroup[] }[];
  rules: {
    checkPhaseOrder?: string;
    categories: { category: string; rules: RuleItem[] }[];
  };
};

// Props type for Group element
type GroupEl = (props: { is: string; [key: string]: unknown; children?: JSXNode | JSXNode[] }) => JSXNode;
type NodeEl = (props: { is: string; children?: string | JSXNode | JSXNode[] }) => JSXNode;

export function AiKnowledge(
  Group: GroupEl,
  Node: NodeEl,
  Prompt: GroupEl,
  props: AiKnowledgeProps
): JSXNode {
  const children: JSXNode[] = [
    Group({ is: 'Directives' },
      ...props.directives.map(dg =>
        Group({ is: dg.group },
          ...dg.items.map(di =>
            Group({ is: di.group },
              ...di.items.map(item => [
                Node({ is: 'File' }, item.file),
                Node({ is: 'Purpose' }, item.purpose),
                Node({ is: 'Triggers' }, item.triggers),
                Node({ is: 'SkipWhen' }, item.skipWhen),
                Node({ is: 'Preconditions' }, item.preconditions),
              ]).flat()
            )
          )
        )
      )
    ),
    Group({ is: 'Rules' },
      props.rules.checkPhaseOrder
        ? Node({ is: 'CheckPhaseOrder' }, props.rules.checkPhaseOrder)
        : (null as unknown as JSXNode),
      ...props.rules.categories.map(cat =>
        Group({ is: cat.category },
          ...cat.rules.map(rule => [
            Group({ is: 'Rule', id: rule.id },
              Node({ is: 'File' }, rule.file),
              Node({ is: 'Purpose' }, rule.purpose),
              Node({ is: 'Triggers' }, rule.triggers),
              Node({ is: 'SkipWhen' }, rule.skipWhen),
              rule.activationHint ? Node({ is: 'ActivationHint' }, rule.activationHint) : (null as unknown as JSXNode),
              rule.checkPhase ? Node({ is: 'CheckPhase' }, rule.checkPhase) : (null as unknown as JSXNode),
              rule.requiresVerification ? Node({ is: 'RequiresVerification' }, rule.requiresVerification) : (null as unknown as JSXNode),
            ),
          ]).flat()
        )
      )
    ),
  ].filter(Boolean) as JSXNode[];

  return Prompt({ is: 'AiKnowledge', ver: props.ver }, ...children) as JSXNode;
}
