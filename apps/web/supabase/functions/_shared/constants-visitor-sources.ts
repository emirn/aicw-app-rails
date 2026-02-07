export interface VisitorSourceType {
  name: string,
  url?: string,
  category: 'ai' | 'search' | 'social' | 'video' | 'dataset' | 'other',
  referrers: string[];
  check_utm_source_for_referral?: boolean;
  require_text_fragment?: boolean;
}

export interface UtmParams {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  utm_id?: string | null;
  utm_source_platform?: string | null;
  utm_creative_format?: string | null;
  utm_marketing_tactic?: string | null;
}

export interface BotSourceType {
  desc: string,
  ref_bot_parent_name: string,
  parent_url: string,
  ref_bot_category: string,  // e.g., 'ai', 'search', 'other - headless browser'
  user_agents?: string[],
  ip_ranges_url?: string,
}

// Inline data (JSON files can't be read at runtime in Supabase edge functions — only static_files are available)
const visitorSources: Array<VisitorSourceType> = [
  { name: "OpenAI ChatGPT", url: "chatgpt.com", category: "ai", referrers: ["chat.openai.com", "chatgpt.com", "openai", "chat-gpt", "gpt", "chat.openai"], check_utm_source_for_referral: true },
  { name: "Anthropic Claude", url: "claude.ai", category: "ai", referrers: ["claude.ai", "anthropic", "claude-ai"], check_utm_source_for_referral: true },
  { name: "Perplexity.AI", url: "perplexity.ai", category: "ai", referrers: ["perplexity.ai", "perplexity-ai"], check_utm_source_for_referral: true },
  { name: "Google Gemini", url: "gemini.google.com", category: "ai", referrers: ["gemini.google.com", "gemini", "bard", "google-ai"], check_utm_source_for_referral: true },
  { name: "Google AI/Featured", url: "google.com", category: "ai", referrers: ["google.com"], require_text_fragment: true },
  { name: "Microsoft Copilot", url: "copilot.microsoft.com", category: "ai", referrers: ["copilot.microsoft.com", "copilot", "bing-ai", "bing-chat", "bing-copilot"], check_utm_source_for_referral: true },
  { name: "Alibaba Qwen", url: "chat.qwen.ai", category: "ai", referrers: ["chat.qwen.ai", "qwen", "tongyi", "qianwen", "alibaba-ai"], check_utm_source_for_referral: true },
  { name: "DeepSeek", url: "chat.deepseek.com", category: "ai", referrers: ["chat.deepseek.com", "deepseek", "deepseek-ai"], check_utm_source_for_referral: true },
  { name: "Meta AI", url: "meta.ai", category: "ai", referrers: ["meta.ai", "meta", "meta-ai", "llama"], check_utm_source_for_referral: true },
  { name: "You.com", url: "you.com", category: "ai", referrers: ["you.com", "you-com", "youchat"], check_utm_source_for_referral: true },
  { name: "Mistral Le Chat", url: "mistral.ai", category: "ai", referrers: ["mistral.ai", "mistral", "le-chat", "mistral-ai"], check_utm_source_for_referral: true },
  { name: "Grok", url: "grok.com", category: "ai", referrers: ["grok.com", "grok", "xai", "x-ai"], check_utm_source_for_referral: true },
  { name: "Phind", url: "phind.com", category: "ai", referrers: ["phind.com", "phind-ai"], check_utm_source_for_referral: true },
  { name: "HuggingChat", url: "huggingface.co", category: "ai", referrers: ["huggingface.co", "huggingchat", "hf"], check_utm_source_for_referral: true },
  { name: "Blackbox AI", url: "blackbox.ai", category: "ai", referrers: ["blackbox.ai", "blackbox-ai"], check_utm_source_for_referral: true },
  { name: "Andi", url: "andisearch.com", category: "ai", referrers: ["andisearch.com", "andi"], check_utm_source_for_referral: true },
  { name: "Felo", url: "felo.ai", category: "ai", referrers: ["felo.ai", "felo-ai"], check_utm_source_for_referral: true },
  { name: "Google", url: "google.com", category: "search", referrers: ["google.com"] },
  { name: "Bing", url: "bing.com", category: "search", referrers: ["bing.com"] },
  { name: "Brave", url: "brave.com", category: "search", referrers: ["brave.com"] },
  { name: "DuckDuckGo", url: "duckduckgo.com", category: "search", referrers: ["duckduckgo.com"] },
  { name: "Yahoo", url: "yahoo.com", category: "search", referrers: ["yahoo.com"] },
  { name: "Yandex", url: "yandex.ru", category: "search", referrers: ["yandex.ru", "yandex.com"] },
  { name: "Baidu", url: "baidu.com", category: "search", referrers: ["baidu.com"] },
  { name: "Ecosia", url: "ecosia.org", category: "search", referrers: ["ecosia.org"] },
  { name: "Startpage", url: "startpage.com", category: "search", referrers: ["startpage.com"] },
  { name: "Qwant", url: "qwant.com", category: "search", referrers: ["qwant.com"] },
  { name: "Naver", url: "naver.com", category: "search", referrers: ["naver.com"] },
  { name: "Seznam", url: "seznam.cz", category: "search", referrers: ["seznam.cz"] },
  { name: "Ask", url: "ask.com", category: "search", referrers: ["ask.com"] },
  { name: "AOL", url: "search.aol.com", category: "search", referrers: ["search.aol.com", "aol.com"] },
  { name: "Swisscows", url: "swisscows.com", category: "search", referrers: ["swisscows.com"] },
  { name: "Reddit", url: "reddit.com", category: "social", referrers: ["reddit.com"] },
  { name: "X", url: "x.com", category: "social", referrers: ["x.com"] },
  { name: "Facebook", url: "facebook.com", category: "social", referrers: ["facebook.com", "fb.com", "fb.me", "m.facebook.com", "messenger.com", "fbcdn.net", "facebook.net", "fb.gg", "fb.watch", "business.facebook.com", "developers.facebook.com", "l.facebook.com", "web.facebook.com"] },
  { name: "Instagram", url: "instagram.com", category: "social", referrers: ["instagram.com", "instagr.am", "ig.me", "cdninstagram.com", "business.instagram.com", "help.instagram.com"] },
  { name: "LinkedIn", url: "linkedin.com", category: "social", referrers: ["linkedin.com", "lnkd.in", "linkedin.cn", "linkedin-china.cn"] },
  { name: "Mastodon", url: "mastodon.social", category: "social", referrers: ["mastodon.social", "mastodon.online", "mastodon.world", "mstdn.social", "fosstodon.org", "mas.to", "joinmastodon.org", "mastodon.cloud", "toot.community", "mastodon.technology", "social.vivaldi.net", "masto.host", "hostux.social"] },
  { name: "Bluesky", url: "bsky.app", category: "social", referrers: ["bsky.app", "blueskyweb.xyz", "bsky.social", "at.bsky.app", "staging.bsky.app", "bsky.network"] },
  { name: "TikTok", url: "tiktok.com", category: "video", referrers: ["tiktok.com"] },
  { name: "YouTube", url: "youtube.com", category: "video", referrers: ["youtube.com"] },
];

const botSources: Array<BotSourceType> = [
  { desc: "OpenAI SearchBot", ref_bot_parent_name: "OpenAI", parent_url: "openai.com", ref_bot_category: "ai", user_agents: ["oai-searchbot"], ip_ranges_url: "https://openai.com/searchbot.json" },
  { desc: "OpenAI ChatGPT-User", ref_bot_parent_name: "OpenAI", parent_url: "openai.com", ref_bot_category: "ai", user_agents: ["chatgpt-user"], ip_ranges_url: "https://openai.com/chatgpt-user.json" },
  { desc: "OpenAI GPTBot", ref_bot_parent_name: "OpenAI", parent_url: "openai.com", ref_bot_category: "ai", user_agents: ["gptbot"], ip_ranges_url: "https://openai.com/gptbot.json" },
  { desc: "PerplexityBot", ref_bot_parent_name: "Perplexity", parent_url: "perplexity.ai", ref_bot_category: "ai", user_agents: ["perplexitybot"], ip_ranges_url: "https://perplexity.ai/perplexitybot.json" },
  { desc: "Perplexity-User", ref_bot_parent_name: "Perplexity", parent_url: "perplexity.ai", ref_bot_category: "ai", user_agents: ["perplexity-user"], ip_ranges_url: "https://perplexity.ai/perplexity-user.json" },
  { desc: "ClaudeBot", ref_bot_parent_name: "Anthropic Claude", parent_url: "claude.ai", ref_bot_category: "ai", user_agents: ["claudebot", "claude-web"] },
  { desc: "Claude-SearchBot", ref_bot_parent_name: "Anthropic Claude", parent_url: "claude.ai", ref_bot_category: "ai", user_agents: ["claude-searchbot"] },
  { desc: "Claude-User", ref_bot_parent_name: "Anthropic Claude", parent_url: "claude.ai", ref_bot_category: "ai", user_agents: ["claude-user"] },
  { desc: "Anthropic AI Bulk Trainer", ref_bot_parent_name: "Anthropic Claude", parent_url: "claude.ai", ref_bot_category: "ai", user_agents: ["anthropic-ai"] },
  { desc: "Google Extended", ref_bot_parent_name: "Google AI", parent_url: "google.com", ref_bot_category: "ai", user_agents: ["google-extended"] },
  { desc: "Google Other", ref_bot_parent_name: "Google AI", parent_url: "google.com", ref_bot_category: "ai", user_agents: ["googleother"] },
  { desc: "Google NotebookLM", ref_bot_parent_name: "Google AI", parent_url: "google.com", ref_bot_category: "ai", user_agents: ["google-notebooklm"] },
  { desc: "Google Gemini Deep Research", ref_bot_parent_name: "Google AI", parent_url: "google.com", ref_bot_category: "ai", user_agents: ["gemini-deep-research"] },
  { desc: "Mistral User", ref_bot_parent_name: "Mistral", parent_url: "mistral.ai", ref_bot_category: "ai", user_agents: ["mistral-user", "mistralai-user"] },
  { desc: "Meta External Fetcher", ref_bot_parent_name: "Meta AI", parent_url: "meta.ai", ref_bot_category: "ai", user_agents: ["meta-externalfetcher"] },
  { desc: "Meta External Agent", ref_bot_parent_name: "Meta AI", parent_url: "meta.ai", ref_bot_category: "ai", user_agents: ["meta-externalagent"] },
  { desc: "FacebookBot", ref_bot_parent_name: "Meta", parent_url: "facebook.com", ref_bot_category: "other", user_agents: ["facebookbot"] },
  { desc: "Facebook External Hit", ref_bot_parent_name: "Meta", parent_url: "facebook.com", ref_bot_category: "other", user_agents: ["facebookexternalhit"] },
  { desc: "DeepSeek Bot", ref_bot_parent_name: "DeepSeek", parent_url: "deepseek.com", ref_bot_category: "ai", user_agents: ["deepseekbot", "deepseek-crawler"] },
  { desc: "DeepSeek User", ref_bot_parent_name: "DeepSeek", parent_url: "deepseek.com", ref_bot_category: "ai", user_agents: ["deepseek-user"] },
  { desc: "You.com Bot", ref_bot_parent_name: "You.com", parent_url: "you.com", ref_bot_category: "ai", user_agents: ["youbot"] },
  { desc: "You.com User", ref_bot_parent_name: "You.com", parent_url: "you.com", ref_bot_category: "ai", user_agents: ["you-user"] },
  { desc: "CommonCrawl Dataset", ref_bot_parent_name: "CommonCrawl", parent_url: "commoncrawl.org", ref_bot_category: "dataset", user_agents: ["ccbot"], ip_ranges_url: "https://commoncrawl.org/ccbot.json" },
  { desc: "Cohere Crawler", ref_bot_parent_name: "Cohere", parent_url: "cohere.com", ref_bot_category: "ai", user_agents: ["cohere-crawler", "cohere-training-data-crawler"] },
  { desc: "Googlebot", ref_bot_parent_name: "Google", parent_url: "google.com", ref_bot_category: "search", user_agents: ["googlebot"] },
  { desc: "Baiduspider", ref_bot_parent_name: "Baidu", parent_url: "baidu.com", ref_bot_category: "search", user_agents: ["baiduspider"] },
  { desc: "HaosouSpider", ref_bot_parent_name: "Qihoo 360", parent_url: "360.cn", ref_bot_category: "search", user_agents: ["haosouspider", "360spider"] },
  { desc: "PetalBot", ref_bot_parent_name: "Huawei", parent_url: "huawei.com", ref_bot_category: "search", user_agents: ["petalbot"] },
  { desc: "PanguBot", ref_bot_parent_name: "Huawei", parent_url: "huawei.com", ref_bot_category: "ai", user_agents: ["pangubot"] },
  { desc: "YandexBot", ref_bot_parent_name: "Yandex", parent_url: "yandex.com", ref_bot_category: "search", user_agents: ["yandexbot"] },
  { desc: "DuckDuckBot", ref_bot_parent_name: "DuckDuckGo", parent_url: "duckduckgo.com", ref_bot_category: "search", user_agents: ["duckduckbot"] },
  { desc: "Applebot", ref_bot_parent_name: "Apple", parent_url: "apple.com", ref_bot_category: "search", user_agents: ["applebot"] },
  { desc: "AhrefsBot", ref_bot_parent_name: "Ahrefs", parent_url: "ahrefs.com", ref_bot_category: "dataset", user_agents: ["ahrefsbot"] },
  { desc: "BingBot", ref_bot_parent_name: "Microsoft Bing", parent_url: "bing.com", ref_bot_category: "search", user_agents: ["bingbot"] },
  { desc: "Bing Preview", ref_bot_parent_name: "Microsoft Bing", parent_url: "bing.com", ref_bot_category: "search", user_agents: ["bingpreview"] },
  { desc: "MSNBot", ref_bot_parent_name: "Microsoft", parent_url: "microsoft.com", ref_bot_category: "search", user_agents: ["msnbot"] },
  { desc: "Bytespider", ref_bot_parent_name: "ByteDance", parent_url: "bytedance.com", ref_bot_category: "ai", user_agents: ["bytespider"] },
  { desc: "Grok Bot", ref_bot_parent_name: "X.ai", parent_url: "x.ai", ref_bot_category: "ai", user_agents: ["grokbot", "xai-bot"] },
  { desc: "Grok User", ref_bot_parent_name: "X.ai", parent_url: "x.ai", ref_bot_category: "ai", user_agents: ["grok-user"] },
  { desc: "Phind Bot", ref_bot_parent_name: "Phind", parent_url: "phind.com", ref_bot_category: "ai", user_agents: ["phindbot"] },
  { desc: "Phind User", ref_bot_parent_name: "Phind", parent_url: "phind.com", ref_bot_category: "ai", user_agents: ["phind-user"] },
  { desc: "HuggingFace Bot", ref_bot_parent_name: "HuggingFace", parent_url: "huggingface.co", ref_bot_category: "ai", user_agents: ["huggingface"] },
  { desc: "Headless Browser", ref_bot_parent_name: "", parent_url: "", ref_bot_category: "other: headless browser", user_agents: ["headless", "headlesschrome", "phantomjs", "selenium", "webdriver", "puppeteer", "playwright", "axios", "crawler", "spider", "scraper"] },
  { desc: "Console Client", ref_bot_parent_name: "", parent_url: "", ref_bot_category: "other: console client", user_agents: ["curl", "wget", "console", "terminal", "command", "commandline", "command prompt"] },
  { desc: "Code Execution Client", ref_bot_parent_name: "", parent_url: "", ref_bot_category: "other: code execution client", user_agents: ["python-requests", "python-urllib", "python-http", "python", "httpie", "java/", "okhttp", "httpclient", "ruby", "libwww", "lwp-", "php/", "curl", "wget", "go-http-client", "golang-http-client", "node-fetch", "node.js", "axios", "got/", "postman", "powershell", "requests", "rest-client", "fetch"] },
];

export const VISITOR_SOURCES: Array<VisitorSourceType> = visitorSources;

// Normalize bot user agent patterns to lowercase and log warnings for any uppercase patterns
export const BOT_SOURCES: Array<BotSourceType> = botSources.map(source => ({
  ...source,
  user_agents: source.user_agents?.map(ua => {
    if (ua !== ua.toLowerCase()) {
      console.warn(`[CONFIG] Bot user agent should be lowercase: "${ua}" in ${source.desc}`);
      return ua.toLowerCase();
    }
    return ua;
  })
}));
