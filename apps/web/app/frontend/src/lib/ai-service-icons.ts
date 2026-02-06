import aiServices from './ai-services.json';

type AIServicesMap = Record<string, { name: string; url: string }>;

const services = aiServices as AIServicesMap;

export function getAIServiceUrl(serviceKey: string): string {
  const service = services[serviceKey?.toLowerCase()];
  return service?.url || 'https://aicw.io';
}

export function getAIServiceFaviconUrl(serviceKey: string, size: number = 32): string {
  const url = getAIServiceUrl(serviceKey);
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=aicw.io&sz=${size}`;
  }
}

// Colors for each AI service (used as fallback)
export const AI_SERVICE_COLORS: Record<string, string> = {
  chatgpt: "#10A37F",
  claude: "#D77E5C",
  perplexity: "#1FB8CD",
  gemini: "#4285F4",
  grok: "#000000",
  google_ai: "#4285F4",
  google: "#4285F4",
  meta_ai: "#0668E1",
  deepseek: "#4D6BFE",
  duckduckgo: "#DE5833",
  brave: "#FB542B",
  bing: "#008373",
  mistral: "#F7D046",
  llama: "#0668E1",
  cohere: "#D18EE2",
  qwen: "#615CED",
};

export function getServiceColor(serviceKey: string): string {
  return AI_SERVICE_COLORS[serviceKey?.toLowerCase()] || SHARE_SERVICE_COLORS[serviceKey?.toLowerCase()] || "#6B7280";
}

// Colors for share services
export const SHARE_SERVICE_COLORS: Record<string, string> = {
  whatsapp: "#25D366",
  x: "#000000",
  gmail: "#EA4335",
  telegram: "#0088cc",
  facebook: "#1877F2",
  linkedin: "#0077B5",
  reddit: "#FF4500",
  email: "#6B7280",
  copy: "#8B5CF6",
};

export function getShareServiceColor(serviceKey: string): string {
  return SHARE_SERVICE_COLORS[serviceKey?.toLowerCase()] || "#6B7280";
}

// URLs for share services (used for favicon fetching)
const SHARE_SERVICE_URLS: Record<string, string> = {
  whatsapp: "https://web.whatsapp.com",
  x: "https://x.com",
  gmail: "https://mail.google.com",
  telegram: "https://web.telegram.org",
  facebook: "https://facebook.com",
  linkedin: "https://linkedin.com",
  reddit: "https://reddit.com",
  email: "https://mail.google.com",
  copy: "https://aicw.io",
};

export function getShareServiceFaviconUrl(serviceKey: string, size: number = 32): string {
  const url = SHARE_SERVICE_URLS[serviceKey?.toLowerCase()] || 'https://aicw.io';
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=aicw.io&sz=${size}`;
  }
}
