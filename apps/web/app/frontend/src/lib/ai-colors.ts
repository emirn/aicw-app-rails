/**
 * Get the Tailwind color class for an AI source
 * Maps source names to design system colors
 */
export function getAISourceColor(refSource: string): string {
  const colorMap: Record<string, string> = {
    "OpenAI ChatGPT": "hsl(var(--ai-chatgpt))",
    "Perplexity.AI": "hsl(var(--ai-perplexity))",
    "Anthropic Claude": "hsl(var(--ai-claude))",
    "Google Gemini": "hsl(var(--ai-gemini))",
    "Google AI Overview": "hsl(var(--ai-google))",
    "Microsoft Copilot": "hsl(var(--ai-bing))",
    "DeepSeek": "hsl(var(--ai-deepseek))",
    "Meta AI": "hsl(var(--ai-meta))",
    "You.com": "hsl(var(--ai-perplexity))",
    "Mistral Le Chat": "hsl(var(--ai-claude))",
    "Grok": "hsl(var(--ai-other))",
    "Phind": "hsl(var(--ai-gemini))",
    "HuggingChat": "hsl(var(--ai-chatgpt))",
    "Alibaba Qwen": "hsl(var(--ai-google))",
    "Blackbox AI": "hsl(var(--ai-other))",
    "Andi": "hsl(var(--ai-perplexity))",
    "Felo": "hsl(var(--ai-meta))",
    "Google": "hsl(var(--ai-google))",
    "Bing": "hsl(var(--ai-bing))",
    "DuckDuckGo": "hsl(var(--ai-other))",
    "Yahoo": "hsl(var(--ai-other))",
    "Reddit": "hsl(var(--ai-other))",
    "X": "hsl(var(--ai-other))",
    "Facebook": "hsl(var(--ai-other))",
    "Instagram": "hsl(var(--ai-other))",
    "TikTok": "hsl(var(--ai-other))",
    "YouTube": "hsl(var(--ai-other))",
    "other": "hsl(var(--ai-other))",
  };

  return colorMap[refSource] || "hsl(var(--ai-other))";
}

/**
 * Get a lighter version of the AI source color for backgrounds
 */
export function getAISourceBgColor(refSource: string): string {
  const colorMap: Record<string, string> = {
    "OpenAI ChatGPT": "hsl(142 71% 45% / 0.1)",
    "Perplexity.AI": "hsl(217 91% 60% / 0.1)",
    "Anthropic Claude": "hsl(25 95% 53% / 0.1)",
    "Google Gemini": "hsl(217 71% 53% / 0.1)",
    "Google AI Overview": "hsl(45 93% 47% / 0.1)",
    "Microsoft Copilot": "hsl(187 71% 50% / 0.1)",
    "DeepSeek": "hsl(271 81% 56% / 0.1)",
    "Meta AI": "hsl(221 83% 53% / 0.1)",
    "You.com": "hsl(217 91% 60% / 0.1)",
    "Mistral Le Chat": "hsl(25 95% 53% / 0.1)",
    "Grok": "hsl(220 9% 46% / 0.1)",
    "Phind": "hsl(217 71% 53% / 0.1)",
    "HuggingChat": "hsl(142 71% 45% / 0.1)",
    "Alibaba Qwen": "hsl(45 93% 47% / 0.1)",
    "Blackbox AI": "hsl(220 9% 46% / 0.1)",
    "Andi": "hsl(217 91% 60% / 0.1)",
    "Felo": "hsl(221 83% 53% / 0.1)",
    "other": "hsl(220 9% 46% / 0.1)",
  };

  return colorMap[refSource] || "hsl(220 9% 46% / 0.1)";
}
