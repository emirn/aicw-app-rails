OUTPUT MODE: PATCH-ONLY INSERTIONS

When instructed to UPDATE content (not replace), do NOT return the full article. Instead, return only the insertions as a sequence of blocks inside the JSON "content" string. Each block uses this exact format (no extra text, no code fences):

[line NN]
<content to insert at line NN>

Rules:
- Use 1-based line numbers relative to the CURRENT article content provided to you.
- Provide only lines that need to be inserted; do not repeat existing content.
- You may return multiple [line NN] blocks; put each immediately before its content.
- Do not wrap the output in code fences. Do not include any commentary.
- Keep blocks simple; the system will insert them in descending line-number order.

