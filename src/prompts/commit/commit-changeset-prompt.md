### DIFF TO ANALYZE:
<diff langs="{languages}">
{input}
</diff>

### INSTRUCTIONS:
- The entire response must be a single <changeset> tag.
- Inside <changeset>, you must include one or more <change> tags.
- Each <change> tag must have a 'type' attribute (one of: feat, fix, refactor, chore, docs, style, test, perf).
- The content of each <change> tag must be a concise summary of a single logical change, written in English.
- The output language must be English.

### EXAMPLE:
<diff>
- const unguard = (result) => {
+ export const unguard = (result) => {
- import { SECRET_KEY } from './constants';
+ import { PUBLIC_KEY } from './constants';
</diff>
<output>
  <changeset>
    <change type="feat">export unguard function</change>
    <change type="fix">replace `SECRET_KEY` with `PUBLIC_KEY`</change>
  </changeset>
</output>

### TASK:
Analyze the <diff/> and generate a list of changes. Your ONLY <output> MUST be a single XML block starting with <changeset> and ending with </changeset>. Do NOT output any other text, comments, or explanations.