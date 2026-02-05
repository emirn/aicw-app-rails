-- ============================================================================
-- DEPRECATED: Computed ref_source Column
-- ============================================================================
-- ⚠️ DEPRECATED: This file is no longer used and kept only for reference.
--
-- ref_source is now stored as a column in page_views_events datasource and
-- populated at ingestion time by the unified AI traffic detection system.
--
-- Detection is performed in supabase/functions/view/index.ts using:
--   - detectAITraffic() from _shared/ai-traffic-detection.ts
--
-- For detection logic, see:
--   - supabase/functions/_shared/ai-detection-patterns.ts
--   - supabase/functions/_shared/ai-source-detection.ts
--   - supabase/functions/_shared/crawler-detection.ts
--
-- Migration: All pipes have been updated to use the stored ref_source column
-- instead of computing it at query time.
-- ============================================================================
--
-- OLD USAGE (no longer needed):
--   SELECT *, <this_function> as ref_source FROM page_views_events
--
-- NEW USAGE:
--   SELECT ref_source FROM page_views_events  -- Already stored!
--
-- ============================================================================

multiIf(
  -- ========================================================================
  -- Tier 1: Major AI Assistants
  -- ========================================================================

  -- ChatGPT
  position(lower(referrer_domain), 'chat.openai.com') > 0 OR
  position(lower(referrer_domain), 'chatgpt.com') > 0 OR
  position(lower(utm_source), 'chatgpt') > 0 OR
  position(lower(utm_source), 'openai') > 0 OR
  position(lower(utm_source), 'chat-gpt') > 0,
  'chatgpt',

  -- Perplexity
  position(lower(referrer_domain), 'perplexity.ai') > 0 OR
  position(lower(utm_source), 'perplexity') > 0 OR
  position(lower(utm_source), 'perplexity-ai') > 0,
  'perplexity',

  -- Claude
  position(lower(referrer_domain), 'claude.ai') > 0 OR
  position(lower(utm_source), 'claude') > 0 OR
  position(lower(utm_source), 'claude-ai') > 0 OR
  position(lower(utm_source), 'anthropic') > 0,
  'claude',

  -- Gemini
  position(lower(referrer_domain), 'gemini.google.com') > 0 OR
  position(lower(referrer_domain), 'bard.google.com') > 0 OR
  position(lower(utm_source), 'gemini') > 0 OR
  position(lower(utm_source), 'bard') > 0 OR
  position(lower(utm_source), 'google-ai') > 0,
  'gemini',

  -- Google AI Overview (requires UTM to distinguish from regular Google)
  (position(lower(referrer_domain), 'google.com') > 0) AND
  (position(lower(utm_source), 'google-ai') > 0 OR
   position(lower(utm_source), 'google-aio') > 0 OR
   position(lower(utm_source), 'ai-overview') > 0 OR
   position(lower(utm_source), 'aio') > 0),
  'google_aio',

  -- Microsoft Copilot
  position(lower(referrer_domain), 'copilot.microsoft.com') > 0 OR
  position(lower(referrer_domain), 'bing.com/chat') > 0 OR
  position(lower(utm_source), 'bing-copilot') > 0 OR
  position(lower(utm_source), 'copilot') > 0 OR
  position(lower(utm_source), 'bing-ai') > 0 OR
  position(lower(utm_source), 'bing-chat') > 0,
  'microsoft_copilot',

  -- DeepSeek
  position(lower(referrer_domain), 'chat.deepseek.com') > 0 OR
  position(lower(referrer_domain), 'deepseek.com') > 0 OR
  position(lower(referrer_domain), 'ai.com') > 0 OR
  position(lower(utm_source), 'deepseek') > 0 OR
  position(lower(utm_source), 'deepseek-ai') > 0,
  'deepseek',

  -- Meta AI
  position(lower(referrer_domain), 'meta.ai') > 0 OR
  position(lower(referrer_domain), 'chat.meta.ai') > 0 OR
  position(lower(utm_source), 'meta') > 0 OR
  position(lower(utm_source), 'meta-ai') > 0 OR
  position(lower(utm_source), 'llama') > 0,
  'meta_ai',

  -- ========================================================================
  -- Tier 2: Secondary AI Assistants
  -- ========================================================================

  -- You.com
  position(lower(referrer_domain), 'you.com') > 0 OR
  position(lower(utm_source), 'you') > 0 OR
  position(lower(utm_source), 'you-com') > 0 OR
  position(lower(utm_source), 'youchat') > 0,
  'you_com',

  -- Mistral Le Chat
  position(lower(referrer_domain), 'chat.mistral.ai') > 0 OR
  position(lower(referrer_domain), 'mistral.ai') > 0 OR
  position(lower(utm_source), 'mistral') > 0 OR
  position(lower(utm_source), 'le-chat') > 0 OR
  position(lower(utm_source), 'mistral-ai') > 0,
  'mistral_le_chat',

  -- Grok
  position(lower(referrer_domain), 'grok.com') > 0 OR
  position(lower(referrer_domain), 'grok.x.ai') > 0 OR
  position(lower(referrer_domain), 'x.ai') > 0 OR
  position(lower(utm_source), 'grok') > 0 OR
  position(lower(utm_source), 'xai') > 0 OR
  position(lower(utm_source), 'x-ai') > 0,
  'grok',

  -- Phind
  position(lower(referrer_domain), 'phind.com') > 0 OR
  position(lower(utm_source), 'phind') > 0 OR
  position(lower(utm_source), 'phind-ai') > 0,
  'phind',

  -- HuggingChat
  position(lower(referrer_domain), 'huggingface.co/chat') > 0 OR
  position(lower(utm_source), 'huggingface') > 0 OR
  position(lower(utm_source), 'huggingchat') > 0 OR
  position(lower(utm_source), 'hf') > 0,
  'huggingchat',

  -- Alibaba Qwen
  position(lower(referrer_domain), 'tongyi.aliyun.com') > 0 OR
  position(lower(referrer_domain), 'qianwen.aliyun.com') > 0 OR
  position(lower(referrer_domain), 'chat.qwen.ai') > 0 OR
  position(lower(utm_source), 'qwen') > 0 OR
  position(lower(utm_source), 'tongyi') > 0 OR
  position(lower(utm_source), 'qianwen') > 0 OR
  position(lower(utm_source), 'alibaba-ai') > 0,
  'alibaba_qwen',

  -- Blackbox AI
  position(lower(referrer_domain), 'blackbox.ai') > 0 OR
  position(lower(referrer_domain), 'useblackbox.io') > 0 OR
  position(lower(utm_source), 'blackbox') > 0 OR
  position(lower(utm_source), 'blackbox-ai') > 0,
  'blackbox_ai',

  -- Andi Search
  position(lower(referrer_domain), 'andisearch.com') > 0 OR
  position(lower(referrer_domain), 'andi.co') > 0 OR
  position(lower(utm_source), 'andi') > 0 OR
  position(lower(utm_source), 'andisearch') > 0,
  'andi_search',

  -- Felo AI
  position(lower(referrer_domain), 'felo.ai') > 0 OR
  position(lower(utm_source), 'felo') > 0 OR
  position(lower(utm_source), 'felo-ai') > 0,
  'felo_ai',

  -- Default: Non-AI traffic
  ''
) AS ref_source
