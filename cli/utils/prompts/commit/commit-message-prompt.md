### CHANGESET TO ANALYZE:

<changeset>
  {input}
</changeset>

### INSTRUCTIONS:

- The entire response must be a single <message> tag.
- The <message> tag must have two attributes: 'type' and 'icon'.
- To determine the 'type' attribute, analyze all <change> tags and select the most significant type based on this exact priority hierarchy: feat > fix > perf > refactor > style > docs > test > chore.
- The 'icon' attribute must be a single, relevant emoji that semantically represents the overall changeset.
- Inside <message>, you must include a <subject/> and a <description/> tag.

- <subject/> requirements:
  - It must be a concise summary in English, in the imperative mood, that synthesizes the meaning of ALL changes.
  - It must be written entirely in lower case.
  - It must NOT start with the word corresponding to the 'type' (e.g., not "fix...", "feat...").

- <description/> requirements:
  - It must be a high-level summary of the changes, not a direct list of every change.
  - Analyze and group related changes under thematic bullet points.
  - The goal is to provide a meaningful overview of the impact, especially for large changesets.

### EXAMPLE:

<changeset>
  <change type="feat">export unguard function</change>
  <change type="fix">replace SECRET_KEY with PUBLIC_KEY</change>
  <change type="fix">add validation for user input</change>
  <change type="docs">update README with new setup instructions</change>
</changeset>
<output>
  <message type="feat" icon="🛡️">
    <subject>harden security and improve module structure</subject>
    <description>
      - Replaced a `SECRET_KEY` with a `PUBLIC_KEY` one and added essential input validation.
      - Improved module encapsulation by exporting a utility function.
      - Updated the README file to reflect recent changes.
    </description>
  </message>
</output>

### TASK:

Analyze the <changeset/> and generate a summarized, high-level git commit message. Your ONLY <output> MUST be a single XML block starting with <message> and ending with </message>. Do NOT output any other text, comments, or explanations.
