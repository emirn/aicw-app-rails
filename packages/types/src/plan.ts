/**
 * Content plan types for SEO planning
 */

import { IBaseObject } from './base';

export interface IContentPlanItem extends IBaseObject {
  path: string;                  // proposed SEO path
  title: string;                 // proposed SEO title
  description: string;           // instruction/brief for the article
  target_keywords: string[];     // primary + secondary keywords
  target_words: number;          // suggested word count
  search_intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  funnel_stage: 'top' | 'middle' | 'bottom';
  priority: 1 | 2 | 3;           // 1 = high, 3 = low
  internal_links?: string[];     // paths to link to
  notes?: string;                // any extra guidance
  // clustering
  cluster_id?: string;
  cluster_name?: string;
  // recommended anchor texts for internal links
  link_recommendations?: { path: string; anchor_text: string }[];
}

export interface IContentPlan {
  website: {
    url: string;
    title: string;
    focus_keywords?: string;
    audience?: string;
    positioning?: string;
  };
  total_articles: number;
  items: IContentPlanItem[];
  summary?: string;
  clusters?: { id: string; name: string; description?: string; priority: 1 | 2 | 3 }[];
}

// Simplified plan item for CLI
export interface ContentPlanItem {
  id: string;
  path: string;
  title: string;
  description: string;
  target_keywords: string[];
  target_words: number;
  search_intent: string;
  funnel_stage: string;
  priority: number;
  date?: string;  // Optional publish date (YYYY-MM-DD format)
}

// Simplified plan for CLI
export interface ContentPlan {
  website: {
    url: string;
    title: string;
    focus_keywords?: string;
  };
  total_articles: number;
  items: ContentPlanItem[];
  summary?: string;
}
