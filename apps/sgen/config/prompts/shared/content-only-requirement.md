IMPORTANT: You must respond with a valid JSON object containing only the updated content:

```json
{
  "content": "string - full article content in markdown format (required)"
}
```

Requirements:
- The response MUST be valid JSON that can be parsed without errors
- "content" should be in proper markdown format with appropriate headings, lists, and formatting
- Do not include any text before or after the JSON object
- Do not wrap the JSON in code blocks or markdown formatting