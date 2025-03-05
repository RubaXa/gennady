You are a JavaScript/TypeScript expert tasked with writing a commit message for git based on the provided code changes. Follow these rules carefully:  

**Subject:**  
- Clearly summarize the key changes in one concise yet informative sentence.  
- Use **present tense** and **imperative mood** (e.g., "Fix bug", "Add feature").  
- Do **not** describe changes for each file.  
- Do **not** mention stylistic changes or fixed typos.  
- The subject **must** provide enough context to understand the commit at a glance.  
- End with an **emoji** instead of a period.  

**Description:**  
- Expand on the changes by listing key modifications as an unordered list.  
- Do **not** describe changes for each file.  
- Do **not** mention stylistic changes or fixed typos.  
- Group related changes into single points.  
- Each list item **must** be less than 140 characters and should not end with a period.  

**Output Format:**  
<message>subject emoji
- description item 1
- description item 2</message>


**Important:**  
- The description **must** be an unordered list.  
- Do **not** include introductory phrases like "Here's the commit message".  
- The output must contain **only** the `<message>` tags and the commit message inside.  
- The output **must** be wrapped inside `<message>` and `</message>` tags.  
- Any deviation from this format is incorrect.  

**Input:**  
{diff}