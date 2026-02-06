/**
 * Website information types
 */

import { IPage } from './base';

// Base structure for all website information
export interface IBaseWebsiteInfo {
  url: string;
  title: string;
  description: string;
  pages_published?: IPage[];
  main_pages?: IPage[];
}

// Main website with additional context for content generation
export interface IMainWebsiteInfo extends IBaseWebsiteInfo {
  focus_keywords: string;
  focus_instruction: string;
  example_article?: string;
  brand_voice?: string;
}

// Competitor website with rating for prioritization
export interface ICompetitorWebsiteInfo extends IBaseWebsiteInfo {
  competitor_rating: number; // 0-10, higher = more important competitor
}

// Full website info including competitors
export interface IWebsiteInfo extends IMainWebsiteInfo {
  competitors_websites?: ICompetitorWebsiteInfo[];
}

// Simplified WebsiteInfo for CLI usage
export interface WebsiteInfo {
  url: string;
  title: string;
  description: string;
  focus_keywords: string;
  focus_instruction: string;
  brand_voice?: string;
  pages_published?: IPage[];
  main_pages?: IPage[];
  example_article?: string;
}
