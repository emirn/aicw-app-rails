# AI User Agent Detection Enhancement

## Overview
Enhanced the `detectAITraffic` function to detect AI service traffic through **user agent string signatures** in addition to referrer and UTM parameter matching. User agent detection is the most reliable method as it's harder to spoof than referrers.

## Changes Made

### 1. Updated `AI_SOURCE_DETECTION_METADATA`
**File:** `ai-source-detection.ts`

Added `userAgents` arrays to each AI source with their known bot/crawler signatures:

#### Tier 1 AI Assistants
- **ChatGPT**: `chatgpt-user`, `gptbot`
- **Perplexity**: `perplexitybot`, `perplexity-user`
- **Claude**: `claudebot`, `claude-web`
- **Gemini**: `google-extended`, `googleother`
- **Google AIO**: `google-extended`, `googleother-extended`
- **Microsoft Copilot**: `bingbot`, `bingpreview`, `msnbot`
- **DeepSeek**: `deepseek`, `deepseekbot`
- **Meta AI**: `meta-externalagent`, `facebookbot`, `meta-ai`

#### Tier 2 AI Assistants
- **You.com**: `youbot`, `you.com`
- **Mistral Le Chat**: `mistralbot`, `mistral-ai`
- **Grok**: `grokbot`, `xai-bot`
- **Phind**: `phindbot`, `phind`
- **HuggingChat**: `huggingface`, `hf-chat`
- **Alibaba Qwen**: `qwenbot`, `tongyi`, `alibababot`
- **Blackbox AI**: `blackboxbot`, `blackbox-ai`
- **Andi Search**: `andibot`, `andisearch`
- **Felo AI**: `felobot`, `felo-ai`

### 2. Enhanced `detectAITraffic` Function
**File:** `ai-source-detection.ts`

#### Function Signature Updated
```typescript
export function detectAITraffic(
  user_agent: string | null,
  referrer: string | null,
  utmParams: any
): AIDetectionResult
```

#### Detection Logic & Scoring

The function now uses a **weighted scoring system** with user agent as the highest priority:

| Detection Method | Points | Reliability |
|-----------------|--------|-------------|
| User Agent Match | **80** | ⭐⭐⭐ Highest |
| Referrer Match | 60 | ⭐⭐ High |
| UTM Source Match | 25 | ⭐ Medium |
| UTM Medium AI | 10 | Low |

**Detection Threshold:**
- User agent matches: 80 points (immediate detection, stops search)
- Other combinations: 60 points minimum

**Early Exit Optimization:**
When a user agent match is found (80+ points), the function immediately returns the result without checking other sources, improving performance.

### 3. Updated View Function Integration
**File:** `view/index.ts`

- Removed duplicate local function definitions
- Imported `detectAITraffic` from shared module
- Updated function call to include `user_agent` parameter:

```typescript
const detection = detectAITraffic(user_agent, referrer, utmParams);
```

## Research Sources

User agent signatures were researched from official documentation and industry sources:

### Official Documentation
- **OpenAI GPTBot**: [openai.com/gptbot](https://openai.com/gptbot)
- **Perplexity Bots**: [docs.perplexity.ai/guides/bots](https://docs.perplexity.ai/guides/bots)
- **Anthropic ClaudeBot**: [anthropic.com/claude-bot](https://anthropic.com/claude-bot)

### Known User Agent Patterns

**ChatGPT/OpenAI:**
- `ChatGPT-User/1.0` - Used by ChatGPT plugins for user-initiated actions
- `GPTBot/1.0` - Web crawler for training data collection
- Full UA: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot`

**Perplexity AI:**
- `PerplexityBot/1.0` - For search result indexing (respects robots.txt)
- `Perplexity-User/1.0` - For user-initiated fetches (may ignore robots.txt)
- Full UA: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)`

**Claude/Anthropic:**
- `ClaudeBot/1.0` - Anthropic's web crawler
- Full UA: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +https://anthropic.com/claude-bot`

## Detection Examples

### Example 1: ChatGPT User Action
```
User-Agent: Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0
```
**Result:** Detected as `chatgpt` with score 80 (user_agent_match)

### Example 2: Perplexity Search
```
Referrer: https://www.perplexity.ai/search
User-Agent: Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0)
```
**Result:** Detected as `perplexity` with score 140 (user_agent_match + referrer_match)

### Example 3: Google AIO (requires UTM)
```
Referrer: https://www.google.com
UTM Source: google-aio
User-Agent: Googlebot-Extended/1.0
```
**Result:** Detected as `google_aio` with score 105 (user_agent_match + referrer_match + utm_source_match)

## Security Considerations

### Known Evasion Tactics
- **Perplexity AI** has been accused of using generic browser user agents to bypass restrictions
- Some services may rotate or modify user agents over time
- IP address verification can provide additional validation

### Recommendations
1. **Monitor Detection Accuracy**: Track the `method` field to see which detection methods are working
2. **Regular Updates**: Review and update user agent signatures quarterly
3. **IP Range Verification**: Consider cross-referencing with known IP ranges (e.g., Perplexity publishes their IPs at `perplexity.com/perplexitybot.json`)
4. **Behavioral Analysis**: Monitor for suspicious patterns (high frequency, unusual paths)

## Future Enhancements

1. **Store Detection Results**: Add `ref_source` and `detection_method` fields to `TinybirdEvent` interface
2. **IP Range Verification**: Cross-check against published IP ranges for higher confidence
3. **User Agent Version Tracking**: Track specific bot versions for more granular analytics
4. **Detection Analytics**: Create dashboard showing detection method effectiveness
5. **Signature Auto-Update**: Implement periodic fetching of official bot lists

## Maintenance

### Updating User Agent Signatures
To add or update user agent signatures:

1. Edit `AI_SOURCE_DETECTION_METADATA` in `ai-source-detection.ts`
2. Add new patterns to the `userAgents` array (lowercase)
3. Test with sample user agent strings
4. Update this documentation

### Testing Detection
```typescript
// Test user agent detection
const result = detectAITraffic(
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0',
  'https://perplexity.ai/search',
  { utm_source: 'perplexity' }
);
// Expected: { source: 'perplexity', method: 'user_agent_match,referrer_match,utm_source_match' }
```

## Related Files
- `/aicw-app/supabase/functions/_shared/ai-source-detection.ts` - Main detection logic
- `/aicw-app/supabase/functions/_shared/ai-source-enum.ts` - AI source enums and metadata
- `/aicw-app/supabase/functions/view/index.ts` - View function integration

---

**Last Updated:** 2025-11-16
**Author:** AI Enhancement
**Version:** 1.0



